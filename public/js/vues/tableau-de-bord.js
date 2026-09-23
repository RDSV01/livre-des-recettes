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
import { formaterMontant, formaterMontantEntier } from '/partage/montants.js';
import { libelleCategorieCourt } from '/partage/constantes.js';
import {
  formaterDate, nomMois, dernierePeriodeEchue, periodeDepuisId, periodeDeclaree,
  echeanceDeclaration, dateEnFrancaisLong, aujourdHuiIso
} from '/partage/dates.js';
import {
  bilanSeuils, seuilsValentPour, libelleActivite, periodeSeuils
} from '/partage/seuils.js';

/** Abréviations françaises des mois, pour l'axe du graphique. */
const MOIS_ABREGES = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

/** « de mars », mais « d'août » : l'élision devant une voyelle. */
const deMois = (mois) => (/^[aeiouâéèêîôû]/i.test(mois) ? `d’${mois}` : `de ${mois}`);

/** Dimensions du graphique mensuel. */
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

/** Chemin d'une barre aux seuls coins supérieurs arrondis, posée sur sa base. */
function barreArrondieEnHaut(x, y, largeur, hauteur, rayon) {
  const f = (n) => n.toFixed(1);
  return `M ${f(x)} ${f(y + hauteur)} L ${f(x)} ${f(y + rayon)}
    Q ${f(x)} ${f(y)} ${f(x + rayon)} ${f(y)} L ${f(x + largeur - rayon)} ${f(y)}
    Q ${f(x + largeur)} ${f(y)} ${f(x + largeur)} ${f(y + rayon)} L ${f(x + largeur)} ${f(y + hauteur)} Z`;
}

/**
 * Graphique à barres du chiffre d'affaires mensuel, SVG généré à la main : une
 * barre par mois ancrée sur la ligne de base, grille de repères, info-bulle
 * par colonne.
 *
 * Avec plusieurs séries (activité mixte), elles s'empilent dans la barre du
 * mois, chacune dans sa couleur du langage commun (ventes en bleu,
 * prestations en vert, non catégorisé en gris), et une légende les nomme : la
 * composition d'un mois se lit d'un coup d'œil. Seul le haut de la pile
 * s'arrondit.
 *
 * @param {{ mois: number, annee: number, total: number }[]} points total de chaque mois.
 * @param {{ libelle: string, classe: string, valeurs: number[], facultative?: boolean }[]} series
 *   empilées du bas vers le haut ; une série facultative restée à zéro
 *   n'entre pas dans la légende.
 */
function graphiqueCa(points, series, devise) {
  const { largeur, hauteur, margeGauche, margeHaut, margeBas } = GRAPHE;
  const zoneHauteur = hauteur - margeHaut - margeBas;
  const ligneBase = margeHaut + zoneHauteur;
  const plafond = plafondAxe(Math.max(...points.map((p) => p.total)));
  const pasX = (largeur - margeGauche - 8) / points.length;
  const largeurBarre = Math.min(38, Math.max(8, pasX - 10));
  const ESPACE = 1.5; // entre deux segments empilés
  const empile = series.length > 1;

  const colonnes = points.map((p, i) => {
    const x = margeGauche + i * pasX + (pasX - largeurBarre) / 2;
    const presentes = series.filter((s) => s.valeurs[i] > 0);
    let sommet = ligneBase;
    const segments = presentes.map((s, rang) => {
      const h = (s.valeurs[i] / plafond) * zoneHauteur;
      const y = sommet - h;
      sommet = y - ESPACE;
      const classe = empile ? `segment ${s.classe}` : s.classe;
      return rang < presentes.length - 1
        ? `<rect class="${classe}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${largeurBarre.toFixed(1)}" height="${h.toFixed(1)}"/>`
        : `<path class="${classe}" d="${barreArrondieEnHaut(x, y, largeurBarre, h, Math.min(4, largeurBarre / 2, h))}"/>`;
    }).join('');

    // Le montant exact est porté par `data-info` et affiché par l'info-bulle
    // maison, instantanée (l'info-bulle native a un délai imposé par le système).
    const titre = `${nomMois(p.mois)} ${p.annee}`;
    const detail = presentes.map((s) => `${s.libelle} : ${formaterMontant(s.valeurs[i], devise)}`);
    let info = `${titre} : ${formaterMontant(p.total, devise)}`;
    if (empile) {
      info = detail.length === 0
        ? `${titre}\nAucun encaissement`
        : `${titre}\n${detail.join('\n')}\nTotal : ${formaterMontant(p.total, devise)}`;
    }

    // La zone de survol couvre toute la colonne : cible plus large que la
    // barre. L'année est portée par le titre de la carte : l'axe n'affiche que
    // les mois.
    return `
      <g class="colonne" data-info="${echapperHtml(info)}">
        <rect x="${(margeGauche + i * pasX).toFixed(1)}" y="${margeHaut}" width="${pasX.toFixed(1)}" height="${zoneHauteur + margeBas}" fill="transparent"/>
        ${segments ? `<g class="barre-graphique">${segments}</g>` : ''}
        <text x="${(x + largeurBarre / 2).toFixed(1)}" y="${hauteur - 8}" text-anchor="middle">${echapperHtml(MOIS_ABREGES[p.mois - 1])}</text>
      </g>`;
  }).join('');

  const legende = !empile ? '' : `
    <div class="legende-graphique">${series
      .filter((s) => !s.facultative || s.valeurs.some((v) => v > 0))
      .map((s) => `<span class="entree-legende"><span class="pastille-legende ${s.classe}"></span>${s.libelle}</span>`)
      .join('')}</div>`;

  return `
    <svg class="graphique-ca" viewBox="0 0 ${largeur} ${hauteur}" role="img"
      aria-label="Chiffre d’affaires mensuel${empile ? ' ventilé par activité' : ''}">
      ${grilleAxe(plafond, devise)}
      ${colonnes}
    </svg>${legende}`;
}

/**
 * Séries du graphique d'une activité mixte : ventes, prestations, et le non
 * catégorisé s'il y en a. Ce dernier se déduit du total, arrondi au centime
 * pour ne pas traîner l'imprécision des flottants (un « reste » de -0,004 €
 * ne doit pas dessiner de segment).
 */
function seriesVentilees(stats) {
  const valeurs = (points) => points.map((p) => p.total);
  const ventes = valeurs(stats.caParMoisVentes);
  const prestations = valeurs(stats.caParMoisPrestations);
  return [
    { libelle: 'Ventes', classe: 'seg-vente', valeurs: ventes },
    { libelle: 'Prestations', classe: 'seg-prestation', valeurs: prestations },
    {
      libelle: 'Non catégorisé',
      classe: 'seg-neutre',
      facultative: true,
      valeurs: stats.caParMois.map((p, i) =>
        Math.max(0, Math.round((p.total - ventes[i] - prestations[i]) * 100) / 100))
    }
  ];
}

/**
 * Équivalent textuel d'un graphique : le même tableau de chiffres, replié dans
 * un `details`.
 *
 * Les montants mensuels ne vivaient que dans un `data-info` lu au survol : au
 * clavier comme au lecteur d'écran, le graphique ne disait rien du tout. Le
 * repli le garde discret pour qui lit déjà les barres.
 *
 * @param {{ mois: number, annee: number, total: number }[]} points
 * @param {{ ventes?: object[], prestations?: object[] }} [ventilation]
 */
function tableauEquivalent(points, devise, ventilation = {}) {
  const { ventes, prestations } = ventilation;
  const detaille = Boolean(ventes && prestations);
  const lignes = points.map((p, i) => `
    <tr>
      <td>${echapperHtml(nomMois(p.mois))}</td>
      ${detaille ? `
        <td class="montant">${echapperHtml(formaterMontant(ventes[i].total, devise))}</td>
        <td class="montant">${echapperHtml(formaterMontant(prestations[i].total, devise))}</td>` : ''}
      <td class="montant">${echapperHtml(formaterMontant(p.total, devise))}</td>
    </tr>`).join('');

  return `
    <details class="details-graphique">
      ${/* Le triangle natif d'un `summary` est un glyphe du système, étranger au
            jeu d'icônes : on le masque et on pose le chevron de la maison. */ ''}
      <summary>${icone('chevron-bas', { taille: 14 })}<span>Voir les chiffres mois par mois</span></summary>
      <div class="conteneur-tableau">
        <table>
          <thead>
            <tr>
              <th>Mois</th>
              ${detaille ? '<th class="montant">Ventes</th><th class="montant">Prestations</th>' : ''}
              <th class="montant">Total</th>
            </tr>
          </thead>
          <tbody>${lignes}</tbody>
        </table>
      </div>
    </details>`;
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
  // Le repère double une information déjà écrite dans l'en-tête de la jauge
  // (« X / seuil (majoré Y) ») : il est décoratif pour un lecteur d'écran.
  const repere = majore ? `
    <i class="repere-seuil" aria-hidden="true" style="left: ${(progression.seuil / majore) * 100}%"
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
 * Période dont il faut rappeler la déclaration : la dernière entièrement
 * écoulée, tant qu'elle n'a pas été marquée « déclarée » (bouton « C'est
 * fait » ici, ou « Marquer comme déclarée » sur l'écran URSSAF). Retourne
 * `null` quand il n'y a rien à rappeler.
 */
function periodeARappeler() {
  const p = etat.parametres;
  const echue = dernierePeriodeEchue(p.periodiciteUrssaf);
  if (!echue || periodeDeclaree(echue.id, p.dernierePeriodeDeclaree)) return null;
  return { ...echue, ...periodeDepuisId(echue.id) };
}

/**
 * Rappel de déclaration URSSAF, avec le montant à déclarer et la date limite :
 * tout ce qu'il faut pour la faire sans ouvrir une autre page. Passé la date
 * limite, le rappel le dit.
 */
function bandeauRappelUrssaf(periode, bilan, devise) {
  if (!periode) return '';
  const echeance = echeanceDeclaration(periode.annee, periode.type, periode.valeur);
  const enRetard = aujourdHuiIso() > echeance;
  // « du 2e trimestre », « de juillet », « d'août ».
  const intitule = periode.type === 'trimestre' ? `du ${periode.libelle}` : deMois(periode.libelle);
  const montant = bilan
    ? `<strong>${echapperHtml(formaterMontantEntier(bilan.aDeclarer, devise))}</strong> à déclarer, `
    : '';
  const quand = enRetard
    ? `échéance du ${echapperHtml(dateEnFrancaisLong(echeance))} dépassée.`
    : `au plus tard le ${echapperHtml(dateEnFrancaisLong(echeance))}.`;
  return `
    <div class="bandeau-rappel${enRetard ? ' en-retard' : ''}">
      ${icone(enRetard ? 'cercle-alerte' : 'urssaf', { taille: 18 })}
      <span>Déclaration URSSAF ${echapperHtml(intitule)} : ${montant}${quand}</span>
      <a class="btn btn-tertiaire" href="#/urssaf">Voir le détail</a>
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
    // Le montant du rappel URSSAF arrive dans le même temps ; s'il manque, le
    // rappel s'affiche sans lui plutôt que de bloquer la page.
    const rappel = periodeARappeler();
    const [stats, bilanRappel] = await Promise.all([
      api.tableauDeBord({ annee: anneeChoisie }),
      rappel
        ? api.bilanUrssaf({ annee: rappel.annee, type: rappel.type, valeur: rappel.valeur }).catch(() => null)
        : null
    ]);
    const { devise, formatDate, suiviSeuils } = etat.parametres;
    // La catégorie n'est renseignée, et n'a de sens, qu'en activité mixte.
    const estMixte = etat.parametres.typeActivite === 'mixte';

    // `cible` (nombre) et `format` alimentent les compteurs animés ; la valeur
    // affichée en découle.
    const formaterValeur = (cible, format) => format === 'entier' ? String(cible) : formaterMontant(cible, devise);

    /**
     * Répartition ventes / prestations d'un chiffre d'affaires, en activité
     * mixte, portée sous la tuile qu'elle décompose. Quatre tuiles de plus la
     * répétaient auparavant : « 3 prestations en septembre » redisait le CA du
     * mois dès qu'il n'y avait eu aucune vente. Le non catégorisé n'apparaît
     * que s'il existe.
     */
    const repartition = (total, ventes, prestations) => {
      if (!estMixte) return null;
      const nonCategorise = Math.max(0, Math.round((total - ventes - prestations) * 100) / 100);
      return [
        { libelle: 'Ventes', classe: 'seg-vente', montant: ventes },
        { libelle: 'Prestations', classe: 'seg-prestation', montant: prestations },
        ...(nonCategorise > 0 ? [{ libelle: 'Non catégorisé', classe: 'seg-neutre', montant: nonCategorise }] : [])
      ];
    };

    // Tous les chiffres clés dans une même grille de tuiles. Les deux premières
    // portent la pastille d'accent : le CA du mois et celui de l'année restent
    // les repères de la page, sans que les autres changent de nature.
    const cartes = [
      {
        etiquette: `CA ${deMois(nomMois(stats.mois))} ${stats.annee}`, cible: stats.caMois, format: 'montant', icone: 'billet', principale: true,
        detail: repartition(stats.caMois, stats.caMoisVentes, stats.caMoisPrestations)
      },
      {
        etiquette: `CA de l’année ${stats.annee}`, cible: stats.caAnnee, format: 'montant', icone: 'calendrier', principale: true,
        detail: repartition(stats.caAnnee, stats.caAnneeVentes, stats.caAnneePrestations)
      },
      { etiquette: 'Moyenne par encaissement', cible: stats.moyenneEncaissement, format: 'montant', icone: 'tendance' },
      // Total des achats : seulement quand le registre des achats est tenu.
      ...(registreAchatsUtile() ? [
        { etiquette: `Achats en ${stats.annee}`, cible: stats.achatsAnnee, format: 'montant', icone: 'achats' }
      ] : [])
    ];

    /** Une tuile de chiffre clé. */
    const tuile = (carte) => {
      // Une tuile secondaire à zéro n'apporte rien : en retrait, elle laisse
      // ressortir les chiffres qui comptent. Les deux tuiles principales
      // gardent leur poids, un CA nul y étant une info.
      const vide = carte.cible === 0 && !carte.principale;
      return `
        <div class="carte-stat ${carte.principale ? 'principale' : ''} ${vide ? 'vide' : ''}">
          <div class="pastille">${icone(carte.icone, { taille: 22 })}</div>
          <div>
            <div class="etiquette">${echapperHtml(carte.etiquette)}</div>
            <div class="valeur" data-compteur="${carte.cible}" data-format="${carte.format}">${echapperHtml(formaterValeur(carte.cible, carte.format))}</div>
            ${carte.detail ? `
              <ul class="detail-stat">
                ${carte.detail.map((d) => `
                  <li>
                    <span class="pastille-legende ${d.classe}" aria-hidden="true"></span>
                    <span>${d.libelle}</span>
                    <span class="montant-detail">${echapperHtml(formaterMontant(d.montant, devise))}</span>
                  </li>`).join('')}
              </ul>` : ''}
          </div>
        </div>`;
    };

    // En activité mixte, un seul graphique empilé montre la répartition
    // vente / prestation de chaque mois ; ailleurs, un graphique simple du CA.
    const aDesRecettes = stats.caParMois.some((p) => p.total > 0);
    const corpsGraphique = !aDesRecettes
      ? `<div class="etat-vide">
           <div class="grande-icone">${icone('tendance', { taille: 32 })}</div>
           Le graphique apparaîtra dès vos premiers encaissements.
         </div>`
      : graphiqueCa(stats.caParMois, estMixte
        ? seriesVentilees(stats)
        : [{ libelle: 'Chiffre d’affaires', classe: 'barre', valeurs: stats.caParMois.map((p) => p.total) }],
      devise) + tableauEquivalent(stats.caParMois, devise, estMixte
        ? { ventes: stats.caParMoisVentes, prestations: stats.caParMoisPrestations }
        : {});

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
          <p class="resume-filtre lien-sous-tableau">
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
          ${/* Le sélecteur porte son propre intitulé (« Année 2026 ») plutôt qu'une
                étiquette posée à côté : il se lit seul, et il prend place dans la
                barre comme un contrôle de plus, à la hauteur des boutons. */ ''}
          ${anneesDisponibles.length > 1 ? `
            <select id="annee-tableau" class="selecteur-annee" aria-label="Année affichée">
              ${anneesDisponibles.map((a) => `<option value="${a}" ${a === anneeChoisie ? 'selected' : ''}>Année ${a}</option>`).join('')}
            </select>` : ''}
          <a class="btn btn-tertiaire" href="#/exports">${icone('exports', { taille: 16 })}<span>Exporter le livre des recettes</span></a>
          ${registreAchatsUtile() ? `
            <a class="btn btn-secondaire" href="#/achats?nouveau=1">${icone('plus', { taille: 16 })}<span>Nouvel achat</span></a>` : ''}
          <a class="btn btn-primaire" href="#/recettes?nouvelle=1">${icone('plus', { taille: 16 })}<span>Nouvelle recette</span></a>
        </div>
      </header>

      ${bandeauRappelUrssaf(rappel, bilanRappel, devise)}

      <section class="grille-stats">
        ${cartes.map(tuile).join('')}
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
