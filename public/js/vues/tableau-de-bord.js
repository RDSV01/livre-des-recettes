/**
 * Vue « Tableau de bord » : chiffres clés de l'année choisie, graphique du
 * chiffre d'affaires mensuel, suivi des seuils (plafond micro et franchise
 * de TVA) et dernières recettes.
 *
 * Un sélecteur permet de revoir une année passée ; il ne propose que les
 * années réellement présentes dans le livre.
 */

import { api } from '../api.js';
import { etat, definirParametres, registreAchatsUtile } from '../etat.js';
import { echapperHtml, toast, animerCompteurs, infobulle } from '../ui.js';
import { icone } from '../icones.js';
import { formaterMontant } from '/partage/montants.js';
import { libelleCategorieCourt } from '/partage/constantes.js';
import { formaterDate, nomMois, dernierePeriodeEchue } from '/partage/dates.js';
import {
  bilanSeuils, seuilsValentPour, libelleActivite, periodeSeuils
} from '/partage/seuils.js';

/** Abréviations françaises des mois, pour l'axe du graphique. */
const MOIS_ABREGES = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

/** « 4 prestations », « 1 vente » : le nombre suivi du mot accordé. */
const accord = (nombre, mot) => `${nombre} ${mot}${nombre > 1 ? 's' : ''}`;

/** Dimensions communes aux deux graphiques mensuels. */
const GRAPHE = { largeur: 720, hauteur: 210, margeGauche: 56, margeHaut: 10, margeBas: 26 };

/** Plafond « rond » de l'axe : multiple lisible juste au-dessus du maximum. */
function plafondAxe(maxBrut) {
  if (maxBrut <= 0) return 1;
  const etage = 10 ** Math.floor(Math.log10(maxBrut));
  return Math.ceil(maxBrut / (etage / 2)) * (etage / 2);
}

/** Grille horizontale (base, moitié, plafond) et ses libellés d'axe. */
function grilleAxe(plafond, devise) {
  const { largeur, margeGauche, margeHaut, hauteur, margeBas } = GRAPHE;
  const zoneHauteur = hauteur - margeHaut - margeBas;
  const ligneBase = margeHaut + zoneHauteur;
  const compact = new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: devise, maximumFractionDigits: 0
  });
  return [0, 0.5, 1].map((part) => {
    const y = (ligneBase - part * zoneHauteur).toFixed(1);
    return `
      <line class="grille" x1="${margeGauche}" y1="${y}" x2="${largeur - 4}" y2="${y}"/>
      <text x="${margeGauche - 8}" y="${Number(y) + 4}" text-anchor="end">${echapperHtml(compact.format(part * plafond))}</text>`;
  }).join('');
}

/**
 * Graphique à barres du CA mensuel, une seule série en teinte accent. SVG
 * généré à la main : barres fines aux coins supérieurs arrondis ancrées sur la
 * ligne de base, grille de repères, info-bulle par colonne.
 */
function graphiqueCaMensuel(points, devise) {
  const { largeur, hauteur, margeGauche, margeHaut, margeBas } = GRAPHE;
  const zoneHauteur = hauteur - margeHaut - margeBas;
  const zoneLargeur = largeur - margeGauche - 8;

  const plafond = plafondAxe(Math.max(...points.map((p) => p.total)));

  const pasX = zoneLargeur / points.length;
  const largeurBarre = Math.min(38, Math.max(8, pasX - 10));
  const ligneBase = margeHaut + zoneHauteur;

  const grille = grilleAxe(plafond, devise);

  const colonnes = points.map((p, i) => {
    const x = margeGauche + i * pasX + (pasX - largeurBarre) / 2;
    const h = (p.total / plafond) * zoneHauteur;
    const y = ligneBase - h;
    const r = Math.min(4, largeurBarre / 2, h);
    const barre = h <= 0 ? '' : `
      <path class="barre barre-graphique" d="M ${x.toFixed(1)} ${ligneBase}
        L ${x.toFixed(1)} ${(y + r).toFixed(1)}
        Q ${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)}
        L ${(x + largeurBarre - r).toFixed(1)} ${y.toFixed(1)}
        Q ${(x + largeurBarre).toFixed(1)} ${y.toFixed(1)} ${(x + largeurBarre).toFixed(1)} ${(y + r).toFixed(1)}
        L ${(x + largeurBarre).toFixed(1)} ${ligneBase} Z"/>`;
    // L'année est portée par le titre de la carte : l'axe n'affiche que les mois.
    const etiquette = MOIS_ABREGES[p.mois - 1];
    // La zone de survol couvre toute la colonne : cible plus large que la barre.
    // Le montant exact est porté par `data-info` et affiché par l'info-bulle
    // maison, instantanée (l'info-bulle native a un délai imposé par le système).
    return `
      <g class="colonne" data-info="${echapperHtml(`${nomMois(p.mois)} ${p.annee} : ${formaterMontant(p.total, devise)}`)}">
        <rect x="${(margeGauche + i * pasX).toFixed(1)}" y="${margeHaut}" width="${pasX.toFixed(1)}" height="${zoneHauteur + margeBas}" fill="transparent"/>
        ${barre}
        <text x="${(x + largeurBarre / 2).toFixed(1)}" y="${hauteur - 8}" text-anchor="middle">${echapperHtml(etiquette)}</text>
      </g>`;
  }).join('');

  return `
    <svg class="graphique-ca" viewBox="0 0 ${largeur} ${hauteur}" role="img"
      aria-label="Chiffre d’affaires mensuel">
      ${grille}
      ${colonnes}
    </svg>`;
}

/**
 * Graphique du chiffre d'affaires mensuel ventilé en une seule barre par mois :
 * ventes (bleu) et prestations (vert) empilées, plus le non catégorisé (gris)
 * s'il y en a. Remplace, en activité mixte, les trois graphiques distincts par
 * un seul où la répartition d'un mois se lit d'un coup d'œil.
 *
 * `total` de chaque série vient du serveur ; le non catégorisé se déduit du
 * total global, arrondi au centime pour ne pas traîner l'imprécision des
 * flottants (un « reste » de -0,004 € ne doit pas dessiner de segment).
 */
function graphiqueCaEmpile(pointsGlobal, ventesPts, prestationsPts, devise) {
  const { largeur, hauteur, margeGauche, margeHaut, margeBas } = GRAPHE;
  const zoneHauteur = hauteur - margeHaut - margeBas;
  const zoneLargeur = largeur - margeGauche - 8;
  const ligneBase = margeHaut + zoneHauteur;

  const plafond = plafondAxe(Math.max(...pointsGlobal.map((p) => p.total)));
  const grille = grilleAxe(plafond, devise);

  const pasX = zoneLargeur / pointsGlobal.length;
  const largeurBarre = Math.min(38, Math.max(8, pasX - 10));
  const GAP = 1.5; // léger espace entre deux segments empilés

  const nonCat = (i) => Math.max(0,
    Math.round((pointsGlobal[i].total - ventesPts[i].total - prestationsPts[i].total) * 100) / 100);
  const auMoinsUnNonCat = pointsGlobal.some((_, i) => nonCat(i) > 0);

  const series = (i) => [
    { libelle: 'Ventes', classe: 'seg-vente', valeur: ventesPts[i].total },
    { libelle: 'Prestations', classe: 'seg-prestation', valeur: prestationsPts[i].total },
    { libelle: 'Non catégorisé', classe: 'seg-neutre', valeur: nonCat(i) }
  ];

  const colonnes = pointsGlobal.map((p, i) => {
    const x = margeGauche + i * pasX + (pasX - largeurBarre) / 2;
    let sommet = ligneBase;
    const segments = series(i)
      .filter((s) => s.valeur > 0)
      .map((s) => {
        const h = (s.valeur / plafond) * zoneHauteur;
        const y = sommet - h;
        sommet = y - GAP;
        const r = Math.min(2, largeurBarre / 2, h / 2);
        return `<rect class="segment ${s.classe}" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
          width="${largeurBarre.toFixed(1)}" height="${h.toFixed(1)}" rx="${r.toFixed(1)}"/>`;
      }).join('');

    const detail = series(i).filter((s) => s.valeur > 0)
      .map((s) => `${s.libelle} : ${formaterMontant(s.valeur, devise)}`).join('\n');
    const info = `${nomMois(p.mois)} ${p.annee}\n${detail || 'Aucun encaissement'}` +
      (detail ? `\nTotal : ${formaterMontant(p.total, devise)}` : '');

    return `
      <g class="colonne" data-info="${echapperHtml(info)}">
        <rect x="${(margeGauche + i * pasX).toFixed(1)}" y="${margeHaut}" width="${pasX.toFixed(1)}" height="${zoneHauteur + margeBas}" fill="transparent"/>
        ${segments}
        <text x="${(x + largeurBarre / 2).toFixed(1)}" y="${hauteur - 8}" text-anchor="middle">${echapperHtml(MOIS_ABREGES[p.mois - 1])}</text>
      </g>`;
  }).join('');

  const legende = [
    { libelle: 'Ventes', classe: 'seg-vente' },
    { libelle: 'Prestations', classe: 'seg-prestation' },
    ...(auMoinsUnNonCat ? [{ libelle: 'Non catégorisé', classe: 'seg-neutre' }] : [])
  ].map((s) => `<span class="entree-legende"><span class="pastille-legende ${s.classe}"></span>${s.libelle}</span>`).join('');

  return `
    <svg class="graphique-ca" viewBox="0 0 ${largeur} ${hauteur}" role="img"
      aria-label="Chiffre d’affaires mensuel ventilé par activité">
      ${grille}
      ${colonnes}
    </svg>
    <div class="legende-graphique">${legende}</div>`;
}

/**
 * Info-bulle instantanée du graphique : elle suit le pointeur et affiche le
 * chiffre d'affaires exact du mois survolé, sans le délai de l'info-bulle
 * native du navigateur.
 */
function installerInfobulle(conteneur) {
  const graphiques = conteneur.querySelectorAll('.graphique-ca');
  if (graphiques.length === 0) return;

  const bulle = document.createElement('div');
  bulle.className = 'infobulle-graphique';
  bulle.hidden = true;
  conteneur.appendChild(bulle);

  // Une seule info-bulle partagée par les graphiques de la page.
  for (const svg of graphiques) suivrePointeur(svg, bulle);
}

/** Fait suivre l'info-bulle au pointeur sur un graphique donné. */
function suivrePointeur(svg, bulle) {
  svg.addEventListener('pointermove', (evenement) => {
    const colonne = evenement.target.closest('.colonne');
    if (!colonne) {
      bulle.hidden = true;
      return;
    }
    bulle.textContent = colonne.dataset.info;
    bulle.hidden = false;
    const x = Math.min(evenement.clientX + 14, window.innerWidth - bulle.offsetWidth - 8);
    bulle.style.left = `${x}px`;
    bulle.style.top = `${evenement.clientY - 34}px`;
  });
  svg.addEventListener('pointerleave', () => { bulle.hidden = true; });
}

/**
 * Une jauge de progression vers un seuil, avec son message d'état.
 *
 * `teinte` colore la barre à l'état normal selon le langage d'activité (une
 * part prestations en vert). L'alerte prime toujours : proche ou dépassé, la
 * jauge passe orange puis rouge quelle que soit la teinte.
 */
function jauge({ titre, ca, progression, devise, messageAttention, messageDepasse, teinte = '' }) {
  const pourcentage = progression.pourcentage;
  const etatJauge = pourcentage >= 100 ? 'depasse' : pourcentage >= 80 ? 'attention' : teinte;

  let detail;
  if (etatJauge === 'depasse') {
    detail = messageDepasse;
  } else if (etatJauge === 'attention') {
    detail = messageAttention.replace('{p}', pourcentage);
  } else {
    detail = `Il reste ${formaterMontant(progression.restant, devise)} (${pourcentage} % atteints).`;
  }

  // Les seuils de TVA ont deux étages : un seuil de base, et un seuil majoré au
  // -delà duquel la franchise tombe immédiatement. Quand il existe, la jauge se
  // gradue jusqu'au majoré et un repère marque le seuil de base : la zone entre
  // les deux, la tolérance, devient visible au lieu d'être seulement décrite.
  const majore = progression.seuilMajore;
  const reference = majore ?? progression.seuil;
  const largeur = Math.min(100, (ca / reference) * 100);
  const repere = majore ? `
    <i class="repere-seuil" style="left: ${(progression.seuil / majore) * 100}%"
      title="Seuil de base : ${echapperHtml(formaterMontant(progression.seuil, devise))} · seuil majoré : ${echapperHtml(formaterMontant(majore, devise))}"></i>` : '';

  return `
    <div class="ligne-jauge">
      <div class="entete-jauge">
        <span>${echapperHtml(titre)}</span>
        <span class="valeur-jauge"><strong>${echapperHtml(formaterMontant(ca, devise))}</strong> / ${echapperHtml(formaterMontant(progression.seuil, devise))}${
          majore ? `<small class="seuil-majore"> (majoré ${echapperHtml(formaterMontant(majore, devise))})</small>` : ''}</span>
      </div>
      <div class="jauge ${etatJauge}"><span style="width: ${largeur}%"></span>${repere}</div>
      <div class="detail-jauge ${etatJauge}">
        ${etatJauge ? icone('cercle-alerte', { taille: 15 }) : ''}
        <span>${echapperHtml(detail)}</span>
      </div>
    </div>`;
}

/** Carte de suivi des seuils, selon le type d'activité choisi. */
function carteSeuils(stats, devise) {
  const bilan = bilanSeuils(
    stats.caAnnee, etat.parametres.typeActivite, stats.caAnneePrestations, stats.annee
  );
  if (!bilan) {
    // Deux raisons de ne rien pouvoir mesurer, qui n'appellent pas la même
    // réponse : l'activité n'est pas renseignée, ou aucun barème ne couvre
    // l'année consultée (voir `partage/bareme-seuils.js`).
    const sansBareme = etat.parametres.typeActivite !== '' && !seuilsValentPour(stats.annee);
    return `
      <h2>Plafond micro-entrepreneur et franchise de TVA</h2>
      <div class="etat-vide">
        <div class="grande-icone">${icone(sansBareme ? 'cercle-alerte' : 'tendance', { taille: 32 })}</div>
        ${sansBareme ? `
          Aucun barème de seuils n’est enregistré pour ${stats.annee}, année antérieure au plus
          ancien connu. Ses montants étaient différents de ceux d’aujourd’hui : les appliquer
          donnerait un résultat faux.`
        : `
          Indiquez votre type d’activité pour suivre votre plafond micro-entrepreneur
          et votre éligibilité à la franchise de TVA.<br>
          <a class="btn btn-secondaire" href="#/parametres">${icone('parametres', { taille: 16 })}<span>Choisir mon activité</span></a>`}
      </div>`;
  }

  const estMixte = bilan.typeActivite === 'mixte';

  // Le suivi porte toujours sur le chiffre d'affaires encaissé de l'année. En
  // activité mixte, deux conditions se cumulent dans chaque régime : le total
  // et, à l'intérieur, la seule part « prestations », plus étroitement plafonnée.
  const titreTotal = estMixte ? 'CA total (ventes + prestations)' : 'Chiffre d’affaires';
  const titrePart = 'Part prestations de services';
  const deuxConditions = 'Les deux conditions doivent être respectées simultanément.';

  /** Un régime et ses jauges, sous un intitulé qui dit à quoi il sert. */
  const groupe = (titre, explication, jauges) => `
    <section class="groupe-seuils">
      <h3>${titre}</h3>
      <p class="explication-groupe">${explication}</p>
      ${jauges}
    </section>`;

  /**
   * Message de dépassement d'un seuil de TVA. Franchir le seuil de base et
   * franchir le seuil majoré n'ont pas du tout les mêmes conséquences : dans
   * le premier cas la franchise court jusqu'à la fin de l'année, dans le
   * second elle tombe immédiatement. Les confondre induirait en erreur.
   */
  const finFranchise = (ca, seuilMajore) => (ca > seuilMajore
    ? `Vous avez dépassé le seuil majoré de ${formaterMontant(seuilMajore, devise)} : ` +
      'la franchise a cessé dès la date du dépassement, la TVA est due à compter de cette date.'
    : 'Vous avez dépassé le seuil de base de franchise TVA. La franchise reste applicable ' +
      'jusqu’au 31 décembre de l’année en cours. Si votre chiffre d’affaires dépasse le seuil ' +
      `majoré de ${formaterMontant(seuilMajore, devise)}, la franchise cesse dès la date du dépassement.`);

  return `
    <h2>Plafond micro-entrepreneur et franchise de TVA (${stats.annee})${infobulle(
      'Les seuils micro-entreprise et les seuils de TVA sont indépendants : une entreprise ' +
      'peut rester en micro-entreprise tout en devenant redevable de la TVA. Suivi purement ' +
      `informatif, basé sur le barème ${periodeSeuils(stats.annee)} ; en cas de doute, ` +
      'vérifiez les valeurs en vigueur sur economie.gouv.fr.',
      'le suivi des seuils'
    )}</h2>
    <p class="resume-filtre">${echapperHtml(libelleActivite(etat.parametres))}</p>

    ${groupe(
      'Rester en micro-entreprise',
      estMixte
        ? deuxConditions
        : 'Au-delà, le régime micro prend fin après deux années consécutives de dépassement.',
      jauge({
        titre: titreTotal,
        ca: stats.caAnnee,
        progression: bilan.plafondMicro,
        devise,
        messageAttention: '{p} % du plafond annuel atteint.',
        messageDepasse: 'Plafond dépassé. Le régime micro ne prend fin qu’après deux années consécutives de dépassement.'
      }) + (bilan.prestations ? jauge({
        titre: titrePart,
        ca: bilan.prestations.chiffreAffaires,
        progression: bilan.prestations.plafondMicro,
        devise,
        messageAttention: '{p} % du plafond propre aux prestations atteint.',
        messageDepasse: 'Plafond des prestations dépassé. Même règle : la sortie du régime micro n’intervient qu’après deux années consécutives.',
        teinte: 'prestation'
      }) : '')
    )}

    ${groupe(
      'Franchise en base de TVA',
      estMixte
        ? deuxConditions
        : 'Tant que ce seuil tient, vous ne facturez pas la TVA à vos clients.',
      jauge({
        titre: titreTotal,
        ca: stats.caAnnee,
        progression: bilan.franchiseTva,
        devise,
        messageAttention: 'Vous approchez du seuil de franchise de TVA ({p} %).',
        messageDepasse: finFranchise(stats.caAnnee, bilan.franchiseTva.seuilMajore)
      }) + (bilan.prestations ? jauge({
        titre: titrePart,
        ca: bilan.prestations.chiffreAffaires,
        progression: bilan.prestations.franchiseTva,
        devise,
        messageAttention: 'La part prestations approche de son propre seuil de TVA ({p} %).',
        messageDepasse: finFranchise(
          bilan.prestations.chiffreAffaires, bilan.prestations.franchiseTva.seuilMajore
        ),
        teinte: 'prestation'
      }) : '')
    )}
    ${estMixte && stats.nombreNonCategorisees > 0 ? `
      <p class="note-legale">
        ${icone('cercle-alerte', { taille: 16 })}
        <span>${stats.nombreNonCategorisees} recette${stats.nombreNonCategorisees > 1 ? 's' : ''} de ${stats.annee}
        sans catégorie : modifiez-les (vente ou prestation) pour un suivi fiable de la part prestations.</span>
      </p>` : ''}
    `;
}

/**
 * Rappel de déclaration URSSAF : affiché quand une période est
 * entièrement écoulée et n'a pas été marquée « déclarée » via le bouton
 * « C'est fait » (mémorisé dans les paramètres).
 */
function bandeauRappelUrssaf() {
  const p = etat.parametres;
  const periode = dernierePeriodeEchue(p.periodiciteUrssaf);
  if (!periode || periode.id === p.dernierePeriodeDeclaree) return '';
  return `
    <div class="bandeau-rappel">
      ${icone('urssaf', { taille: 18 })}
      <span>Déclaration URSSAF de ${echapperHtml(periode.libelle)} : pensez à la faire si ce n’est pas déjà fait.</span>
      <a class="btn btn-tertiaire" href="#/urssaf">Voir le montant</a>
      <button type="button" class="btn btn-tertiaire" id="declaration-faite" data-periode="${periode.id}">
        ${icone('cercle-valide', { taille: 16 })}<span>C’est fait</span>
      </button>
    </div>`;
}

export async function vueTableauDeBord(conteneur) {
  const { annees } = await api.listerAnnees();
  const anneesDisponibles = annees.length > 0 ? annees : [new Date().getFullYear()];
  let anneeChoisie = anneesDisponibles[0]; // la plus récente avec des données

  async function rendre() {
    // Pas de squelette ici : la page précédente reste affichée le temps du
    // calcul (quelques millisecondes en local), ce qui évite tout clignotement
    // au changement d'année. Le squelette global couvre les chargements lents.
    const stats = await api.tableauDeBord({ annee: anneeChoisie });
    const { devise, formatDate, suiviSeuils } = etat.parametres;
    // La catégorie n'est renseignée, et n'a de sens, qu'en activité mixte.
    const estMixte = etat.parametres.typeActivite === 'mixte';

    // `cible` (nombre) et `format` alimentent les compteurs animés ; la valeur
    // affichée en découle.
    const formaterValeur = (cible, format) => format === 'entier' ? String(cible) : formaterMontant(cible, devise);
    const cartes = [
      { etiquette: `CA de ${nomMois(stats.mois)} ${stats.annee}`, cible: stats.caMois, format: 'montant', icone: 'billet', principale: true },
      { etiquette: `CA de l’année ${stats.annee}`, cible: stats.caAnnee, format: 'montant', icone: 'calendrier', principale: true },
      { etiquette: 'Moyenne par encaissement', cible: stats.moyenneEncaissement, format: 'montant', icone: 'tendance' },
      // Total des achats : seulement quand le registre des achats est tenu.
      ...(registreAchatsUtile() ? [
        { etiquette: `Achats en ${stats.annee}`, cible: stats.achatsAnnee, format: 'montant', icone: 'achats' }
      ] : []),
      // Activité mixte : le détail par catégorie, sur le mois puis sur l'année.
      // L'étiquette porte le nombre d'encaissements concernés.
      ...(estMixte ? [
        { etiquette: `${accord(stats.nombreMoisPrestations, 'prestation')} en ${nomMois(stats.mois)}`, cible: stats.caMoisPrestations, format: 'montant', icone: 'billet' },
        { etiquette: `${accord(stats.nombreMoisVentes, 'vente')} en ${nomMois(stats.mois)}`, cible: stats.caMoisVentes, format: 'montant', icone: 'billet' },
        { etiquette: `${accord(stats.nombreAnneePrestations, 'prestation')} en ${stats.annee}`, cible: stats.caAnneePrestations, format: 'montant', icone: 'calendrier' },
        { etiquette: `${accord(stats.nombreAnneeVentes, 'vente')} en ${stats.annee}`, cible: stats.caAnneeVentes, format: 'montant', icone: 'calendrier' }
      ] : [])
    ];

    // En activité mixte, un seul graphique empilé montre la répartition
    // vente / prestation de chaque mois ; ailleurs, un graphique simple du CA.
    const aDesRecettes = stats.caParMois.some((p) => p.total > 0);
    const corpsGraphique = !aDesRecettes
      ? `<div class="etat-vide">
           <div class="grande-icone">${icone('tendance', { taille: 32 })}</div>
           Le graphique apparaîtra dès vos premiers encaissements.
         </div>`
      : estMixte
        ? graphiqueCaEmpile(stats.caParMois, stats.caParMoisVentes, stats.caParMoisPrestations, devise)
        : graphiqueCaMensuel(stats.caParMois, devise);

    const graphiquePrincipal = `
      <div class="carte">
        <h2>Chiffre d’affaires mensuel (${stats.annee})</h2>
        ${corpsGraphique}
      </div>`;

    // La carte des seuils est toujours plus haute que le graphique seul (ses
    // jauges portent des messages détaillés, et l'activité mixte y ajoute deux
    // régimes) : à côté, le graphique laisserait un grand vide en dessous. On
    // regroupe donc le graphique et les dernières recettes dans la colonne de
    // gauche, la carte des seuils occupant toute la droite : les deux colonnes
    // s'équilibrent, quel que soit le type d'activité. On ne le fait que quand
    // cette carte est bien affichée (activité renseignée et barème connu) ;
    // sinon elle est courte et la disposition pleine largeur reste préférable.
    const empilerAGauche = suiviSeuils
      && etat.parametres.typeActivite !== ''
      && seuilsValentPour(stats.annee);

    const blocDernieresRecettes = `
      <section class="carte">
        <h2>Dernières recettes${stats.annee === new Date().getFullYear() ? '' : ` de ${stats.annee}`}</h2>
        ${stats.dernieresRecettes.length === 0 ? `
          <div class="etat-vide">
            <div class="grande-icone">${icone('recettes', { taille: 40 })}</div>
            Votre livre des recettes est vide pour l’instant.<br>
            <a class="btn btn-primaire" href="#/recettes?nouvelle=1">${icone('plus', { taille: 16 })}<span>Ajouter ma première recette</span></a>
          </div>` : `
          <div class="conteneur-tableau">
            <table>
              <thead>
                <tr>
                  <th>Encaissé le</th><th>Client</th><th>Libellé</th>
                  ${estMixte ? '<th>Catégorie</th>' : ''}
                  <th class="montant">Montant</th>
                </tr>
              </thead>
              <tbody>
                ${stats.dernieresRecettes.map((r) => `
                  <tr>
                    <td>${echapperHtml(formaterDate(r.dateEncaissement, formatDate))}</td>
                    <td>${echapperHtml(r.client)}</td>
                    <td>${r.libelle ? echapperHtml(r.libelle) : '<span class="attenue">-</span>'}</td>
                    ${estMixte ? `<td>${r.categorie
                      ? `<span class="badge categorie-${r.categorie}">${echapperHtml(libelleCategorieCourt(r.categorie))}</span>`
                      : '<span class="attenue">-</span>'}</td>` : ''}
                    <td class="montant">${echapperHtml(formaterMontant(r.montant, devise))}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <p class="resume-filtre" style="margin-top:12px;margin-bottom:0">
            <a href="#/recettes">Voir toutes les recettes</a>
          </p>`}
      </section>`;

    conteneur.innerHTML = `
      <header class="entete-vue">
        <div>
          <h1>Tableau de bord</h1>
          <p>Votre activité en un coup d’œil.</p>
        </div>
        <div class="actions-vue">
          ${anneesDisponibles.length > 1 ? `
            <select id="annee-tableau" aria-label="Année affichée" class="selecteur-annee">
              ${anneesDisponibles.map((a) => `<option value="${a}" ${a === anneeChoisie ? 'selected' : ''}>${a}</option>`).join('')}
            </select>` : ''}
          <a class="btn btn-tertiaire" href="#/exports">${icone('exports', { taille: 16 })}<span>Exporter le livre des recettes</span></a>
          ${registreAchatsUtile() ? `
            <a class="btn btn-secondaire" href="#/achats?nouveau=1">${icone('plus', { taille: 16 })}<span>Nouvel achat</span></a>` : ''}
          <a class="btn btn-primaire" href="#/recettes?nouvelle=1">${icone('plus', { taille: 16 })}<span>Nouvelle recette</span></a>
        </div>
      </header>

      ${bandeauRappelUrssaf()}

      <section class="grille-stats">
        ${cartes.map((carte) => {
          // Une tuile secondaire à zéro (« 0 vente en juillet ») n'apporte rien :
          // atténuée, elle laisse ressortir les chiffres qui comptent. Les deux
          // tuiles principales gardent leur poids, un CA nul y étant une info.
          const vide = carte.cible === 0 && !carte.principale;
          return `
          <div class="carte-stat ${carte.principale ? 'principale' : ''} ${vide ? 'vide' : ''}">
            <div class="pastille">${icone(carte.icone, { taille: 22 })}</div>
            <div>
              <div class="etiquette">${echapperHtml(carte.etiquette)}</div>
              <div class="valeur" data-compteur="${carte.cible}" data-format="${carte.format}">${echapperHtml(formaterValeur(carte.cible, carte.format))}</div>
            </div>
          </div>`;
        }).join('')}
      </section>

      ${suiviSeuils ? `
      <section class="grille-deux">
        <div${empilerAGauche ? ' class="pile-gauche"' : ''}>
          ${graphiquePrincipal}
          ${empilerAGauche ? blocDernieresRecettes : ''}
        </div>
        <div class="carte">
          ${carteSeuils(stats, devise)}
        </div>
      </section>` : `
      <section>${graphiquePrincipal}</section>`}

      ${empilerAGauche ? '' : blocDernieresRecettes}`;

    installerInfobulle(conteneur);
    animerCompteurs(conteneur, devise);
    conteneur.querySelector('#annee-tableau')?.addEventListener('change', (evenement) => {
      anneeChoisie = Number(evenement.target.value);
      rendre();
    });

    // « C'est fait » : mémorise la période déclarée, le rappel disparaît.
    conteneur.querySelector('#declaration-faite')?.addEventListener('click', async (evenement) => {
      try {
        const reponse = await api.enregistrerParametres({
          ...etat.parametres,
          dernierePeriodeDeclaree: evenement.currentTarget.dataset.periode
        });
        definirParametres(reponse.parametres);
        toast('Déclaration marquée comme faite.');
        rendre();
      } catch (erreur) {
        toast(erreur.message, 'erreur');
      }
    });
  }

  await rendre();
}
