/**
 * Vue « Tableau de bord » : les indicateurs menés par le chiffre d'affaires
 * de l'année, le graphique mensuel et la déclaration URSSAF à faire, puis les
 * dernières recettes et le suivi des seuils (plafond micro et franchise de
 * TVA).
 *
 * Un sélecteur permet de revoir une année passée ; il ne propose que les
 * années réellement présentes dans le livre. La carte de déclaration, elle,
 * parle toujours d'aujourd'hui.
 */

import { api } from '../api.js';
import { etat, modifierParametres, registreAchatsUtile } from '../etat.js';
import {
  echapperHtml, toast, animerCompteurs, valeursCompteurs, montantDetaille, infobulle, accorder, choixAnnee,
  brancherChoixAnnee, mouvementReduit, enFondu, replierPuisRetirer, ecouterPourLaPage
} from '../ui.js';
import { reussite, halo, bandeauRetour, brancherSegmentes, copierDansPressePapiers } from '../retours.js';
import { icone } from '../icones.js';
import { graphiqueMensuel, tableauMensuel, brancherGraphique, hauteursBarres } from '../graphique.js';
import { pastilleEtat } from '../declarations.js';
import { pastilleCategorie } from './recettes.js';
import { etatFiltres } from '../preferences-vues.js';
import { formaterMontant, formaterMontantEntier, sommeMontants } from '/partage/montants.js';
import { formaterDate, nomMois, dateEnFrancaisLong, aujourdHuiIso, MOIS_ABREGES } from '/partage/dates.js';
import { bilanSeuils, seuilsValentPour, periodeSeuils } from '/partage/seuils.js';
import { periodeATraiter, libellePeriode, joursEntre } from '/partage/declarations.js';
import { salutation } from '/partage/salutations.js';
import { majusculeInitiale } from '/partage/texte.js';

/** Le grand dessin (montants qui défilent, barres qui montent) n'a lieu qu'une fois par session. */
let dejaVu = false;

/** « de mars », mais « d'août » : l'élision devant une voyelle. */
const deMois = (mois) => (/^[aeiouâéèêîôû]/i.test(mois) ? `d’${mois}` : `de ${mois}`);

/** « le 2e trimestre » ou « juillet », pour une phrase. */
const periodeDansPhrase = (p) => (p.type === 'trimestre'
  ? `le ${libellePeriode(p).replace(/ \d{4}$/, '')}`
  : nomMois(p.valeur));

/**
 * La salutation du jour. Une déclaration URSSAF à faire, ou en retard, prend
 * la place de sa phrase : elle ne dit jamais que tout va bien quand quelque
 * chose attend.
 */
function salutationDuJour(periode) {
  const prenom = etat.parametres.prenom;
  if (periode?.etat !== 'en-retard' && periode?.etat !== 'a-declarer') return salutation({ prenom });
  const quoi = `Votre déclaration URSSAF pour ${periodeDansPhrase(periode)}`;
  const echeance = dateEnFrancaisLong(periode.echeance).replace(/ \d{4}$/, '');
  const rappel = periode.etat === 'en-retard'
    ? `${quoi} reste à faire\u00a0: l’échéance du ${echeance} est passée.`
    : `${quoi} est à faire avant le ${echeance}.`;
  return salutation({ prenom, rappel });
}

// ---- Seuils ------------------------------------------------------------------------------

/**
 * Une jauge de progression vers un seuil, ce qu'il reste à sa droite, et un
 * message dessous seulement quand il y a quelque chose à signaler. Même à 1 %,
 * le remplissage se voit : une pastille de la hauteur de la jauge.
 *
 * Les seuils de TVA ont deux étages : un seuil de base, et un seuil majoré
 * au-delà duquel la franchise tombe immédiatement. Quand il existe, la jauge
 * se gradue jusqu'au majoré et un repère marque le seuil de base.
 */
function regle({ titre, ca, progression, devise, messageAttention, messageDepasse, teinte = '' }) {
  const pourcentage = progression.pourcentage;
  const niveau = pourcentage >= 100 ? 'depasse' : pourcentage >= 80 ? 'attention' : teinte;
  const alerte = niveau === 'attention' || niveau === 'depasse';
  const majore = progression.seuilMajore;
  const reference = majore ?? progression.seuil;
  const note = niveau === 'depasse' ? messageDepasse
    : niveau === 'attention' ? messageAttention.replace('{p}', pourcentage)
      : majore ? `Seuil majoré : ${formaterMontantEntier(majore, devise)}.` : '';
  return `<div class="regle">
      <div class="regle-tete"><span>${echapperHtml(titre)}</span>
        <span class="valeurs"><strong>${echapperHtml(formaterMontantEntier(ca, devise))}</strong> / ${echapperHtml(formaterMontantEntier(progression.seuil, devise))}</span></div>
      <div class="regle-jauge">
        <div class="piste ${niveau}" role="meter" aria-valuemin="0" aria-valuemax="${progression.seuil}" aria-valuenow="${Math.round(ca)}"
          aria-label="${echapperHtml(titre)} : ${pourcentage} % du seuil">
          <span class="rempli" style="width:${ca > 0 ? `max(10px, ${Math.min(100, (ca / reference) * 100)}%)` : '0'}"></span>
          ${majore ? `<span class="repere" style="left:calc(${(progression.seuil / majore) * 100}% - 1px)"
            title="Seuil de base : ${echapperHtml(formaterMontant(progression.seuil, devise))} · seuil majoré : ${echapperHtml(formaterMontant(majore, devise))}"></span>` : ''}
        </div>
        ${niveau === 'depasse' ? '' : `<span class="reste" title="${pourcentage} % du seuil atteints">Il reste ${echapperHtml(formaterMontantEntier(progression.restant, devise))}</span>`}
      </div>
      ${note ? `<p class="regle-note ${alerte ? niveau : ''}">${alerte ? icone('triangle-alerte', { taille: 14 }) : ''}<span>${echapperHtml(note)}${majore && niveau === 'attention' ? ` Seuil majoré : ${echapperHtml(formaterMontantEntier(majore, devise))}.` : ''}</span></p>` : ''}
    </div>`;
}

/** Carte de suivi des seuils, selon le type d'activité choisi. */
function carteSeuils(stats, devise) {
  const bilan = bilanSeuils(stats.caAnnee, etat.parametres.typeActivite, stats.caAnneePrestations, stats.annee);
  const tete = (titre) => `<div class="carte-tete"><h2 id="titre-plafonds">${titre}</h2><span class="note">${stats.annee}</span></div>`;
  if (!bilan) {
    // Deux raisons de ne rien pouvoir mesurer, qui n'appellent pas la même
    // réponse : l'activité n'est pas renseignée, ou aucun barème ne couvre
    // l'année consultée (voir `partage/bareme-seuils.js`).
    const sansBareme = etat.parametres.typeActivite !== '' && !seuilsValentPour(stats.annee);
    return `${tete('Plafonds et franchise de TVA')}
      <div class="carte-corps vide-carte">
        ${sansBareme
          ? `<p>Aucun barème de seuils n’est enregistré pour ${stats.annee}, année antérieure au plus ancien connu.
            Ses montants étaient différents de ceux d’aujourd’hui : les appliquer donnerait un résultat faux.</p>`
          : `<p>Indiquez votre type d’activité pour suivre votre plafond micro-entrepreneur et votre éligibilité à la franchise de TVA.</p>
            <a class="btn" href="#/parametres">${icone('parametres', { taille: 16 })}Choisir mon activité</a>`}
      </div>`;
  }

  const estMixte = bilan.typeActivite === 'mixte';
  const titreTotal = estMixte ? 'CA total (ventes et prestations)' : 'Chiffre d’affaires';
  const titrePart = 'Part prestations de services';

  /**
   * Franchir le seuil de base et franchir le seuil majoré n'ont pas les mêmes
   * conséquences : dans le premier cas la franchise court jusqu'à la fin de
   * l'année, dans le second elle tombe immédiatement, au jour ou au mois près
   * selon la règle de l'année consultée.
   */
  const depuis = bilan.finFranchiseMajore === 'mois' ? 'dès le 1er jour du mois du dépassement' : 'dès la date du dépassement';
  const finFranchise = (ca, seuilMajore) => (ca > seuilMajore
    ? `Seuil majoré de ${formaterMontantEntier(seuilMajore, devise)} dépassé : la franchise a cessé ${depuis}, la TVA est due depuis.`
    : 'Seuil de base dépassé : la franchise reste applicable jusqu’au 31 décembre. ' +
      `Au-delà du seuil majoré de ${formaterMontantEntier(seuilMajore, devise)}, elle cesserait ${depuis}.`);

  return `
    <div class="carte-tete"><h2 id="titre-plafonds">Plafonds et franchise de TVA${infobulle(
      'Les seuils micro-entreprise et les seuils de TVA sont indépendants : une entreprise peut rester en ' +
      'micro-entreprise tout en devenant redevable de la TVA. Suivi purement informatif, basé sur le barème ' +
      `${periodeSeuils(stats.annee)} ; en cas de doute, vérifiez les valeurs en vigueur sur economie.gouv.fr.`,
      'le suivi des seuils'
    )}</h2><span class="note">${stats.annee}</span></div>
    ${estMixte ? `<p class="explication-plafonds">Activité mixte : pour chaque régime, le CA total et la part prestations
      doivent tous deux rester sous leur seuil.</p>` : ''}
    <div class="regime">
      <h3>Rester en micro-entreprise</h3>
      <p class="explication">Au-delà, le régime prend fin après deux années consécutives de dépassement.</p>
      ${regle({
        titre: titreTotal, ca: stats.caAnnee, progression: bilan.plafondMicro, devise,
        messageAttention: '{p} % du plafond annuel atteint.',
        messageDepasse: 'Plafond dépassé. Le régime micro ne prend fin qu’après deux années consécutives de dépassement.'
      })}
      ${bilan.prestations ? regle({
        titre: titrePart, ca: bilan.prestations.chiffreAffaires, progression: bilan.prestations.plafondMicro, devise,
        messageAttention: '{p} % du plafond propre aux prestations atteint.',
        messageDepasse: 'Plafond des prestations dépassé : la sortie du régime n’intervient qu’après deux années consécutives.',
        teinte: 'prestation'
      }) : ''}
    </div>
    <div class="regime">
      <h3>Franchise en base de TVA</h3>
      <p class="explication">${estMixte ? 'Tant que ces seuils tiennent' : 'Tant que ce seuil tient'}, vous ne facturez pas la TVA.</p>
      ${regle({
        titre: titreTotal, ca: stats.caAnnee, progression: bilan.franchiseTva, devise,
        messageAttention: 'Vous approchez du seuil de franchise de TVA ({p} %).',
        messageDepasse: finFranchise(stats.caAnnee, bilan.franchiseTva.seuilMajore)
      })}
      ${bilan.prestations ? regle({
        titre: titrePart, ca: bilan.prestations.chiffreAffaires, progression: bilan.prestations.franchiseTva, devise,
        messageAttention: 'La part prestations approche de son propre seuil de TVA ({p} %).',
        messageDepasse: finFranchise(bilan.prestations.chiffreAffaires, bilan.prestations.franchiseTva.seuilMajore),
        teinte: 'prestation'
      }) : ''}
      ${estMixte && stats.nombreNonCategorisees > 0 ? `
        <p class="regle-note attention">${icone('cercle-alerte', { taille: 14 })}<span>${accorder(stats.nombreNonCategorisees, 'recette', 'recettes')} de ${stats.annee}
        sans catégorie : classez-les (vente ou prestation) pour un suivi fiable de la part prestations.</span></p>` : ''}
    </div>`;
}

// ---- Déclaration URSSAF ----------------------------------------------------------------------

/** Contenu de la carte de déclaration : la période à traiter, ce qu'elle rapporte et ce qu'il en reste. */
function carteDeclaration(periode, bilan, devise) {
  if (!periode) {
    return `<div class="carte-tete"><h2 id="titre-declaration">Déclaration URSSAF</h2></div>
      <div class="declaration-corps vide-carte">
        <p>Indiquez votre rythme de déclaration, mensuel ou trimestriel : la période à déclarer, son montant et son échéance s’afficheront ici.</p>
        <a class="btn" href="#/parametres?section=regime">${icone('parametres', { taille: 16 })}Choisir mon rythme</a>
      </div>`;
  }
  const declarable = periode.etat === 'en-retard' || periode.etat === 'a-declarer';
  const echeance = dateEnFrancaisLong(periode.echeance);
  const quand = {
    'en-retard': `<p class="echeance retard">${icone('triangle-alerte', { taille: 15 })}<span>Échéance du ${echeance} dépassée de ${accorder(joursEntre(periode.echeance, aujourdHuiIso()), 'jour')}</span></p>`,
    'a-declarer': `<p class="echeance">${icone('echeance', { taille: 15 })}<span>À déclarer avant le ${echeance}</span></p>`
  }[periode.etat] ?? `<p class="echeance">${icone('echeance', { taille: 15 })}<span>Période en cours</span></p>`;
  const c = bilan?.cotisations;
  /** Une ligne montant ; `copier` ajoute le bouton qui copie le nombre nu. */
  const ligne = (libelle, valeur, { classe = '', copier = null } = {}) => `<div class="ligne-montant${classe ? ` ${classe}` : ''}">
        <span>${libelle}</span><span class="valeur">${echapperHtml(valeur)}</span>
        ${copier === null ? '<span></span>' : `<button type="button" class="btn-icone" data-copier="${copier}" title="Copier"
          aria-label="Copier le montant, sans symbole de devise">${icone('copier', { taille: 15 })}</button>`}
      </div>`;
  return `
    <div class="carte-tete"><h2 id="titre-declaration">Déclaration URSSAF</h2>${pastilleEtat(periode.etat)}</div>
    <div class="declaration-corps">
      <p class="declaration-periode">${libellePeriode(periode)}</p>
      ${quand}
      ${bilan ? `<div class="lignes-montants">
        ${ligne(declarable ? 'Chiffre d’affaires à déclarer' : 'Encaissé à ce jour', formaterMontantEntier(bilan.aDeclarer, devise), { classe: 'principal', copier: bilan.aDeclarer })}
        ${c ? `${ligne('Sera prélevé par l’URSSAF', formaterMontantEntier(c.totalPreleve, devise))}
        ${ligne('Il vous restera', formaterMontantEntier(c.reste, devise), { classe: 'reste' })}` : ''}
      </div>
      ${c ? '<p class="note-estimation">Prélèvement et reste estimés : le montant exact sera celui de l’URSSAF.</p>'
        : `<p class="note-carte"><a href="#/parametres?section=regime">Indiquez votre type d’activité</a> pour estimer ce que l’URSSAF prélèvera et ce qu’il vous restera.</p>`}`
      : '<p class="note-carte">Montant indisponible pour l’instant.</p>'}
    </div>
    <div class="carte-pied">
      <a class="btn" href="#/urssaf?periode=${periode.id}">Voir le détail</a>
      ${declarable ? `<button type="button" class="btn btn-principal" id="declarer" data-periode="${periode.id}"
        aria-label="Marquer ${periodeDansPhrase(periode)} comme déclaré">${icone('coche', { taille: 16 })}<span>C’est fait, j’ai déclaré</span></button>` : ''}
    </div>`;
}

// ---- Vue ---------------------------------------------------------------------------------------

export async function vueTableauDeBord(conteneur) {
  const { annees } = await api.listerAnnees();
  const anneeCourante = new Date().getFullYear();
  const anneesDisponibles = annees.length > 0 ? annees : [anneeCourante];
  let anneeChoisie = anneesDisponibles[0]; // la plus récente avec des données
  // Flèche de l'année cliquée (ou « liste ») : elle garde le focus quand la page se redessine.
  let flecheAnnee = null;
  /** La page dessinée : les montants affichés y sont relevés avant un nouveau dessin. */
  let pageCourante = null;

  /** Ce qu'affiche la page : les montants et les barres repartiront de là. */
  const affichage = () => (mouvementReduit() || !pageCourante ? null : {
    compteurs: valeursCompteurs(pageCourante.querySelector('.indicateurs')),
    barres: hauteursBarres(pageCourante)
  });

  /** Charge la période à traiter et son bilan ; sans bilan, la carte s'affiche quand même. */
  async function chargerDeclaration() {
    const periode = periodeATraiter(etat.parametres);
    const bilan = periode
      ? await api.bilanUrssaf({ annee: periode.annee, type: periode.type, valeur: periode.valeur }).catch(() => null)
      : null;
    return { periode, bilan };
  }

  /**
   * @param {{ depuis?: { compteurs: object, barres: object } }} [options]
   *   `depuis` : ce qu'affichait l'année précédente ; montants et barres
   *   passent de ces valeurs aux nouvelles au lieu de réapparaître.
   */
  async function rendre({ depuis = null } = {}) {
    // Pas de squelette ici : la page précédente reste affichée le temps du
    // calcul (quelques millisecondes en local), sans clignotement.
    const [stats, declaration] = await Promise.all([api.tableauDeBord({ annee: anneeChoisie }), chargerDeclaration()]);
    const { devise, formatDate, suiviSeuils } = etat.parametres;
    const estMixte = etat.parametres.typeActivite === 'mixte';
    const avecAchats = registreAchatsUtile();
    const anime = !dejaVu && !mouvementReduit();
    const estCourante = stats.annee === anneeCourante;
    const moisCourant = estCourante ? stats.mois : null;

    // ---- Indicateurs
    const nonCategorise = Math.max(0, Math.round((stats.caAnnee - stats.caAnneeVentes - stats.caAnneePrestations) * 100) / 100);
    const parts = estMixte && stats.caAnnee > 0 ? [
      ['prestations', stats.caAnneePrestations, 'Prestations'],
      ['ventes', stats.caAnneeVentes, 'Ventes'],
      ...(nonCategorise > 0 ? [['neutre', nonCategorise, 'Non catégorisé']] : [])
    ] : [];
    const legende = (lesParts) => lesParts.map(([cle, montant, libelle]) =>
      `<span class="cle cle-${cle}"><i></i>${libelle} <strong>${echapperHtml(formaterMontant(montant, devise))}</strong></span>`).join('');
    const legendeParts = legende(parts);
    // Le mois affiché, réparti de la même façon : mêmes pastilles, mêmes couleurs.
    // Même vide, il garde ses deux lignes : son montant reste aligné sur celui
    // des cartes voisines.
    const nonCategoriseMois = Math.max(0, Math.round((stats.caMois - stats.caMoisVentes - stats.caMoisPrestations) * 100) / 100);
    const legendeMois = estMixte && stats.caAnnee > 0 ? legende([
      ['prestations', stats.caMoisPrestations, 'Prestations'],
      ['ventes', stats.caMoisVentes, 'Ventes'],
      ...(nonCategoriseMois > 0 ? [['neutre', nonCategoriseMois, 'Non catégorisé']] : [])
    ]) : '';
    // La moyenne, catégorie par catégorie (celle qui n'a aucun encaissement n'apparaît pas).
    const moyenne = (ca, nombre) => Math.round((ca * 100) / nombre) / 100;
    const legendeMoyenne = estMixte && stats.nombreAnnee > 0 ? legende([
      ...(stats.nombreAnneePrestations > 0 ? [['prestations', moyenne(stats.caAnneePrestations, stats.nombreAnneePrestations), 'Prestations']] : []),
      ...(stats.nombreAnneeVentes > 0 ? [['ventes', moyenne(stats.caAnneeVentes, stats.nombreAnneeVentes), 'Ventes']] : [])
    ]) : '';
    // Les achats n'ont pas de catégorie : ceux du mois, puis ceux des mois
    // d'avant (« Janv. à sept. », abrégé pour tenir sur une ligne dans la carte
    // étroite), et ceux datés plus tard dans l'année s'il y en a. Un seul mois
    // se nomme en entier.
    const abrege = (m) => (MOIS_ABREGES[m - 1] === nomMois(m) ? nomMois(m) : `${MOIS_ABREGES[m - 1]}.`);
    const plage = (du, au) => majusculeInitiale(du === au ? nomMois(du) : `${abrege(du)} à ${abrege(au)}`);
    const moisAvant = plage(1, stats.mois - 1);
    const moisApres = plage(stats.mois + 1, 12);
    const achatsApres = Math.round((stats.achatsAnnee - stats.achatsMois - stats.achatsAvantMois) * 100) / 100;
    const legendeAchats = stats.achatsAnnee > 0 ? legende([
      ['achat', stats.achatsMois, majusculeInitiale(nomMois(stats.mois))],
      ...(stats.mois > 1 ? [['achat-avant', stats.achatsAvantMois, moisAvant]] : []),
      ...(achatsApres > 0 ? [['achat-avant', achatsApres, moisApres]] : [])
    ]) : '';

    const indicateur = ({ cle, icone: nomIcone, teinte = '', titre, valeur, detail, repartition = '' }) => `
      <article class="carte indicateur${stats.caAnnee === 0 && valeur === 0 ? ' vide' : ''}">
        <div class="indicateur-tete"><span class="tuile ${teinte}">${icone(nomIcone, { taille: 17 })}</span>${titre}</div>
        <p class="indicateur-valeur" data-compteur="${valeur}" data-cle="${cle}">${montantDetaille(valeur, devise)}</p>
        ${repartition ? `<div class="legende">${repartition}</div>` : ''}
        <p class="indicateur-detail">${detail}</p>
      </article>`;

    // Le cadre mesure la place disponible : trop étroite, la carte de l'année
    // prend toute une ligne et les autres se partagent la suivante.
    const indicateurs = `<div class="cadre-indicateurs">
      <section class="indicateurs${avecAchats ? '' : ' trois'}" aria-label="Indicateurs clés">
        <article class="carte indicateur principal">
          <div class="indicateur-tete"><span class="tuile recette">${icone('portefeuille', { taille: 17 })}</span>Chiffre d’affaires encaissé en ${stats.annee}</div>
          <p class="indicateur-valeur" data-compteur="${stats.caAnnee}" data-cle="annee">${montantDetaille(stats.caAnnee, devise)}</p>
          ${parts.length ? `<div class="repartition" role="img" aria-label="${parts.map(([, m, l]) => `${l} ${Math.round((m / stats.caAnnee) * 100)} %`).join(', ')}">
            ${parts.map(([cle, montant]) => `<span class="${cle}" style="width:${(montant / stats.caAnnee) * 100}%"></span>`).join('')}
          </div>` : ''}
          <div class="legende">
            ${legendeParts}
            <span class="compteurs"><strong>${stats.nombreAnnee}</strong> encaissement${stats.nombreAnnee > 1 ? 's' : ''}, <strong>${stats.nombreClientsAnnee}</strong> client${stats.nombreClientsAnnee > 1 ? 's' : ''}</span>
          </div>
        </article>
        ${indicateur({
          cle: 'mois', icone: 'calendrier',
          titre: `CA ${deMois(nomMois(stats.mois))}${estCourante ? '' : ` ${stats.annee}`}`,
          valeur: stats.caMois,
          repartition: legendeMois,
          detail: `${accorder(stats.nombreMois, 'encaissement')} ${estCourante ? 'ce mois-ci' : `en ${nomMois(stats.mois)}`}`
        })}
        ${indicateur({
          cle: 'moyenne', icone: 'recettes', teinte: 'analyse',
          titre: 'Panier moyen',
          valeur: stats.moyenneEncaissement,
          repartition: legendeMoyenne,
          detail: stats.nombreAnnee > 0 ? `Sur ${accorder(stats.nombreAnnee, 'encaissement')}` : 'Aucun encaissement cette année'
        })}
        ${avecAchats ? indicateur({
          cle: 'achats', icone: 'achats', teinte: 'achat',
          titre: `Achats en ${stats.annee}`,
          valeur: stats.achatsAnnee,
          repartition: legendeAchats,
          detail: `${accorder(stats.nombreAchatsAnnee, 'achat')} au registre`
        }) : ''}
      </section></div>`;

    // ---- Graphique : empilé en activité mixte, simple ailleurs
    const series = estMixte ? ['prestations', 'ventes', ...(nonCategorise > 0 ? ['nonCategorise'] : [])] : ['total'];
    const mois = stats.caParMois.map((p, i) => {
      const ventes = stats.caParMoisVentes[i].total;
      const prestations = stats.caParMoisPrestations[i].total;
      return {
        mois: p.mois,
        total: p.total,
        nombre: stats.nombreParMois[i],
        valeurs: {
          total: p.total,
          ventes,
          prestations,
          // Arrondi au centime : un reste de -0,004 € ne doit pas dessiner de segment.
          nonCategorise: Math.max(0, Math.round((p.total - ventes - prestations) * 100) / 100)
        }
      };
    });
    const aDesRecettes = stats.caAnnee > 0;
    // L'année d'avant, si le livre la connaît : une barre étroite par mois.
    const avant = (stats.caParMoisAnneePrecedente ?? []).map((p) => p.total);
    // Sauf si l'utilisateur a choisi de ne pas comparer (Paramètres, Options).
    const precedente = etat.parametres.comparerAnneePrecedente !== false && avant.some((v) => v > 0) ? avant : null;
    const totalPrecedente = precedente ? sommeMontants(precedente) : 0;
    const clePrecedente = precedente
      ? `<span class="cle cle-precedente"><i></i>${stats.annee - 1} <strong>${echapperHtml(formaterMontantEntier(totalPrecedente, devise))}</strong></span>`
      : '';
    const carteGraphique = `
      <section class="carte carte-graphique" aria-labelledby="titre-mois">
        <div class="carte-tete">
          <h2 id="titre-mois">Chiffre d’affaires mensuel${estCourante ? '' : ` ${stats.annee}`}</h2>
          ${aDesRecettes ? `<div class="segmente compact" role="group" aria-label="Affichage">
            <button type="button" data-vue="graphique" aria-pressed="true">Graphique</button>
            <button type="button" data-vue="tableau" aria-pressed="false">Tableau</button>
          </div>` : ''}
        </div>
        ${aDesRecettes ? `
          ${graphiqueMensuel()}
          <div class="vue-tableau" hidden><div class="defile" tabindex="0" aria-label="Chiffres mois par mois">${tableauMensuel(mois, series, { moisCourant, devise, annee: stats.annee, precedente })}</div></div>
          <div class="legende pied-graphique">${estMixte
            ? series.map((s) => {
              const cle = { prestations: 'prestations', ventes: 'ventes', nonCategorise: 'neutre' }[s];
              const total = { prestations: stats.caAnneePrestations, ventes: stats.caAnneeVentes, nonCategorise }[s];
              const libelle = { prestations: 'Prestations', ventes: 'Ventes', nonCategorise: 'Non catégorisé' }[s];
              return `<span class="cle cle-${cle}"><i></i>${libelle} <strong>${echapperHtml(formaterMontantEntier(total, devise))}</strong></span>`;
            }).join('')
            : `<span class="cle cle-total"><i></i>Encaissé en ${stats.annee} <strong>${echapperHtml(formaterMontantEntier(stats.caAnnee, devise))}</strong></span>`}${clePrecedente}</div>`
          : `<div class="vide-graphique">${icone('recettes', { taille: 28 })}<p>Le graphique apparaîtra dès vos premiers encaissements de ${stats.annee}.</p></div>`}
      </section>`;

    // ---- Recettes qui reviennent chaque mois et attendent celle du mois : une
    // bande en tête des dernières recettes, pour l'ajouter d'un clic (pré-remplie).
    const aRenouveler = estCourante && etat.parametres.proposerRenouvellements !== false ? (stats.aRenouveler ?? []).slice(0, 3) : [];
    const bandeRenouveler = aRenouveler.length === 0 ? '' : `
      <div class="a-renouveler" role="group" aria-label="Recettes qui reviennent chaque mois">
        ${aRenouveler.map(({ cle, derniere: r }) => `<div class="ligne-renouveler">
          <span class="tuile recette">${icone('historique', { taille: 15 })}</span>
          <span class="texte-renouveler"><strong>${echapperHtml(r.libelle)}</strong>, ${echapperHtml(r.client)}, ${echapperHtml(formaterMontant(r.montant, devise))}
            <small>Encaissée les trois derniers mois, pas encore en ${nomMois(stats.mois)}.</small></span>
          <button type="button" class="lien-ecarter" data-ecarter="${echapperHtml(cle)}">Ne plus proposer</button>
          <a class="btn btn-petit" href="#/recettes?modele=${encodeURIComponent(r.id)}">${icone('plus', { taille: 15 })}Ajouter</a>
        </div>`).join('')}
      </div>`;

    // ---- Dernières recettes : autant de lignes que la carte en contient
    const avecSeuils = Boolean(suiviSeuils);
    const carteDernieres = `
      <section class="carte carte-dernieres${avecSeuils ? '' : ' pleine'}" aria-labelledby="titre-dernieres">
        <div class="carte-tete">
          <h2 id="titre-dernieres">Dernières recettes${estCourante ? '' : ` de ${stats.annee}`}</h2>
          <a class="btn btn-petit btn-fantome" href="#/recettes?nouvelle=1">${icone('plus', { taille: 15 })}Ajouter</a>
        </div>
        ${bandeRenouveler}
        ${stats.dernieresRecettes.length === 0 ? `
          <div class="vide-carte">
            <p>Votre livre des recettes est vide pour l’instant.</p>
            <a class="btn btn-principal" href="#/recettes?nouvelle=1">${icone('plus', { taille: 16 })}Ajouter ma première recette</a>
          </div>` : `
          <div class="${avecSeuils ? 'lignes-ajustees' : 'lignes-libres'}"><table class="tableau">
            <thead><tr><th>Encaissé le</th><th>Client</th><th>Libellé</th>${estMixte ? '<th>Catégorie</th>' : ''}<th class="montant">Montant</th></tr></thead>
            <tbody>${stats.dernieresRecettes.slice(0, avecSeuils ? 12 : 8).map((r) => `<tr class="ligne-cliquable">
              <td class="date">${echapperHtml(formaterDate(r.dateEncaissement, formatDate))}</td>
              <td class="client"><a class="lien-ligne" href="#/recettes?voir=${encodeURIComponent(r.id)}">${echapperHtml(r.client)}</a></td>
              <td class="libelle"${r.libelle ? ` title="${echapperHtml(r.libelle)}"` : ''}>${r.libelle ? echapperHtml(r.libelle) : '<span class="attenue">Sans libellé</span>'}</td>
              ${estMixte ? `<td>${pastilleCategorie(r.categorie)}</td>` : ''}
              <td class="montant">${echapperHtml(formaterMontant(r.montant, devise))}</td></tr>`).join('')}</tbody>
          </table></div>
          <a class="lien-suite" href="#/recettes">Voir toutes les recettes${icone('fleche-droite', { taille: 15 })}</a>`}
      </section>`;

    // « Bonjour Camille », « Bonsoir » : selon l'heure, avec le prénom s'il est connu.
    const bonjour = salutationDuJour(declaration.periode);
    conteneur.innerHTML = `
      <div class="page${anime ? ' dessin' : ''}">
        <header class="entete-page">
          <div>
            <p class="surtitre">${bonjour.jour}</p>
            <h1>${echapperHtml(bonjour.titre)}</h1>
            <p class="sous-titre">${bonjour.phrase}</p>
          </div>
          <div class="actions">
            ${anneesDisponibles.length > 1 ? choixAnnee({ id: 'annee-tableau', etiquette: 'Année affichée' }) : ''}
            ${avecAchats ? `<a class="btn" href="#/achats?nouveau=1">${icone('plus', { taille: 16 })}Nouvel achat</a>` : ''}
            <a class="btn btn-principal" href="#/recettes?nouvelle=1">${icone('plus', { taille: 16 })}Nouvelle recette</a>
          </div>
        </header>
        ${indicateurs}
        <div class="grille-tableau">
          ${carteGraphique}
          <section class="carte declaration" id="declaration" aria-labelledby="titre-declaration">${carteDeclaration(declaration.periode, declaration.bilan, devise)}</section>
          ${carteDernieres}
          ${avecSeuils ? `<section class="carte carte-plafonds" aria-labelledby="titre-plafonds">${carteSeuils(stats, devise)}</section>` : ''}
        </div>
      </div>`;

    const page = conteneur.querySelector('.page');
    pageCourante = page;
    if (aDesRecettes) {
      brancherGraphique(page.querySelector('.carte-graphique'), mois, {
        series, annee: stats.annee, moisCourant, devise, anime, depuis: depuis?.barres ?? null, precedente,
        // Un mois choisi ouvre ses recettes, filtres remis à zéro.
        surClic: (numero) => {
          const { filtres } = etatFiltres('recettes');
          Object.keys(filtres).forEach((cle) => { filtres[cle] = ''; });
          Object.assign(filtres, { annee: String(stats.annee), mois: String(numero) });
          window.location.hash = '#/recettes';
        }
      });
      brancherSegmentes(page);
      // Graphique ou tableau des chiffres, dans la même place : la carte ne change pas de taille.
      const carte = page.querySelector('.carte-graphique');
      carte.querySelector('.segmente').addEventListener('click', (evenement) => {
        const bouton = evenement.target.closest('[data-vue]');
        if (!bouton) return;
        const tableau = bouton.dataset.vue === 'tableau';
        carte.querySelectorAll('[data-vue]').forEach((b) => b.setAttribute('aria-pressed', String(b === bouton)));
        // Une animation se rejoue quand son élément réapparaît : le graphique
        // revient tel quel, sans refaire monter ses barres.
        if (!tableau) carte.querySelectorAll('.graphique .anime, .graphique .morph').forEach((e) => e.classList.remove('anime', 'morph'));
        carte.querySelector('.graphique').hidden = tableau;
        carte.querySelector('.vue-tableau').hidden = !tableau;
      });
    }
    const cadreLignes = page.querySelector('.lignes-ajustees');
    if (cadreLignes) ajusterLignes(cadreLignes);
    brancherDeclaration(page, devise);
    brancherRenouveler(page);
    // Une dernière recette ouvre le registre sur elle, mise en avant. Le lien
    // est sur le client (clavier) ; un clic ailleurs sur la ligne le suit,
    // sauf pendant une sélection de texte.
    page.querySelector('.carte-dernieres tbody')?.addEventListener('click', (evenement) => {
      const ligne = evenement.target.closest('.ligne-cliquable');
      if (!ligne || evenement.target.closest('a') || !window.getSelection()?.isCollapsed) return;
      ligne.querySelector('.lien-ligne')?.click();
    });
    const choix = page.querySelector('#annee-tableau');
    if (choix) {
      brancherChoixAnnee(choix, {
        annees: anneesDisponibles,
        choisie: anneeChoisie,
        surChoix: (annee, pas) => {
          anneeChoisie = annee;
          flecheAnnee = pas ?? 'liste';
          // D'une année à l'autre, les montants défilent et les barres
          // changent de taille, depuis ce qui était affiché.
          rendre({ depuis: affichage() }).catch((erreur) => toast(erreur.message, 'erreur'));
        }
      });
      if (flecheAnnee) {
        choix.querySelector(flecheAnnee === 'liste' ? '.annee-choisie' : `[data-pas="${flecheAnnee}"]`).focus({ preventScroll: true });
      }
      flecheAnnee = null;
    }
    if (anime) animerCompteurs(page.querySelector('.indicateurs'), devise);
    else if (depuis) animerCompteurs(page.querySelector('.indicateurs'), devise, depuis.compteurs);
    dejaVu = true;
  }

  /**
   * « C'est fait » : la période est mémorisée comme déclarée, le bouton passe
   * au vert, une onde verte l'entoure, puis la carte passe en fondu à la
   * période suivante, avec une ligne pour revenir en arrière.
   */
  function brancherDeclaration(page, devise) {
    const zone = page.querySelector('#declaration');
    zone.querySelector('[data-copier]')?.addEventListener('click', (evenement) => {
      copierDansPressePapiers(evenement.currentTarget.dataset.copier, evenement.currentTarget);
    });
    zone.querySelector('#declarer')?.addEventListener('click', async (evenement) => {
      const bouton = evenement.currentTarget;
      const avant = etat.parametres.dernierePeriodeDeclaree;
      const periode = periodeATraiter(etat.parametres);
      bouton.disabled = true;
      try {
        await enregistrerDerniereDeclaree(bouton.dataset.periode);
      } catch (erreur) {
        bouton.disabled = false;
        toast(erreur.message, 'erreur');
        return;
      }
      reussite(bouton, 'Déclarée', { duree: 5000 });
      halo(bouton);
      const attente = mouvementReduit() ? 300 : 1100;
      setTimeout(() => {
        if (!zone.isConnected) return;
        enFondu(async () => {
          await redessinerDeclaration(page, devise);
          bandeauRetour(zone.querySelector('.declaration-corps'), `${libellePeriode(periode)} déclaré`, async () => {
            try {
              await enregistrerDerniereDeclaree(avant);
              await enFondu(() => redessinerDeclaration(page, devise));
            } catch (erreur) {
              toast(erreur.message, 'erreur');
            }
          });
        }).catch((erreur) => toast(erreur.message, 'erreur'));
      }, attente);
    });
  }

  /**
   * « Ne plus proposer » une recette qui revient : elle quitte la bande, et
   * une ligne permet de revenir sur ce choix quelques secondes.
   */
  function brancherRenouveler(page) {
    const bande = page.querySelector('.a-renouveler');
    bande?.addEventListener('click', async (evenement) => {
      const bouton = evenement.target.closest('[data-ecarter]');
      if (!bouton) return;
      const avant = etat.parametres.recurrencesEcartees ?? [];
      bouton.disabled = true;
      try {
        await enregistrerEcartees([...avant, bouton.dataset.ecarter]);
      } catch (erreur) {
        bouton.disabled = false;
        toast(erreur.message, 'erreur');
        return;
      }
      // La ligne se replie, le retour prend sa place ; la bande vide s'efface ensuite.
      await replierPuisRetirer(bouton.closest('.ligne-renouveler'));
      bandeauRetour(bande, 'Ne sera plus proposée', async () => {
        try {
          await enregistrerEcartees(avant);
          await rendre();
        } catch (erreur) {
          toast(erreur.message, 'erreur');
        }
      });
    });
  }

  function enregistrerEcartees(cles) {
    return modifierParametres({ recurrencesEcartees: cles });
  }

  function enregistrerDerniereDeclaree(id) {
    return modifierParametres({ dernierePeriodeDeclaree: id });
  }

  async function redessinerDeclaration(page, devise) {
    const zone = page.querySelector('#declaration');
    if (!zone) return;
    const { periode, bilan } = await chargerDeclaration();
    zone.innerHTML = carteDeclaration(periode, bilan, devise);
    // La phrase du jour suit : plus de rappel une fois la déclaration faite.
    page.querySelector('.entete-page .sous-titre').textContent = salutationDuJour(periode).phrase;
    brancherDeclaration(page, devise);
  }

  await rendre();

  // Ctrl+Z / Ctrl+Y : le tableau de bord se met à jour sur place, montants et
  // barres passant de leur valeur affichée à la nouvelle. Une page quittée se
  // désabonne au premier événement qui suit.
  const surHistorique = (evenement) => {
    if (!pageCourante?.isConnected) { window.removeEventListener('historique-applique', surHistorique); return; }
    evenement.preventDefault();
    rendre({ depuis: affichage() }).catch((erreur) => toast(erreur.message, 'erreur'));
  };
  // Une seule page à la fois : l'écouteur de la précédente laisse sa place.
  ecouterPourLaPage('historique-applique', surHistorique);
}

/**
 * Dernières recettes : autant de lignes que la carte en contient (sa hauteur
 * est celle des plafonds, à côté), réparties pour la remplir exactement,
 * jamais une ligne coupée.
 */
function ajusterLignes(cadre) {
  const ajuster = () => {
    if (!cadre.isConnected) { observateur.disconnect(); return; }
    const table = cadre.querySelector('table');
    const lignes = [...table.tBodies[0].rows];
    const dispo = cadre.clientHeight - table.tHead.offsetHeight;
    // Hauteurs réelles : un libellé long passe sur deux lignes.
    lignes.forEach((tr) => { tr.hidden = false; tr.style.height = ''; });
    const hauteurs = lignes.map((tr) => tr.offsetHeight);
    let cumul = 0;
    let nombre = 0;
    while (nombre < lignes.length && cumul + hauteurs[nombre] <= dispo) cumul += hauteurs[nombre++];
    nombre = Math.max(nombre, Math.min(1, lignes.length));
    lignes.forEach((tr, i) => { tr.hidden = i >= nombre; });
    // Les lignes ne s'étirent que pour combler la place d'une ligne retirée.
    if (nombre < lignes.length) {
      const surplus = Math.floor(Math.max(0, dispo - cumul) / nombre);
      lignes.slice(0, nombre).forEach((tr, i) => { tr.style.height = `${hauteurs[i] + surplus}px`; });
    }
  };
  const observateur = new ResizeObserver(ajuster);
  observateur.observe(cadre);
}
