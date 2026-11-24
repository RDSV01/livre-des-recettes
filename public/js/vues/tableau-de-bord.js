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
  brancherChoixAnnee, mouvementReduit, enFondu, replierPuisRetirer, ecouterPourLaPage, monogramme,
  lirePreference, ecrirePreference, MARQUE_ETAPE
} from '../ui.js';
import { reussite, halo, bandeauRetour, brancherSegmentes, copierDansPressePapiers } from '../retours.js';
import { icone } from '../icones.js';
import { graphiqueMensuel, tableauMensuel, brancherGraphique, hauteursBarres } from '../graphique.js';
import { pastilleEtat, blocSansChiffreAffaires } from '../declarations.js';
import { ouvrirReleveMois } from '../releve-mois.js';
import { ouvrirRetrospective, retrospectiveDeSaison, cleRetrospectiveMasquee } from '../retrospective.js';
import { libelleMode } from '/partage/constantes.js';
import { formaterMontant, formaterMontantEntier, sommeMontants } from '/partage/montants.js';
import { nomMois, dateEnFrancaisLong, aujourdHuiIso, MOIS_ABREGES, jourDeLAnnee, jourEtMois, anneeDe } from '/partage/dates.js';
import { bilanSeuils, seuilsValentPour, periodeSeuils, caseUrssaf, natureDesPrestations } from '/partage/seuils.js';
import { periodeATraiter, libellePeriode, joursEntre } from '/partage/declarations.js';
import { salutation } from '/partage/salutations.js';
import { majusculeInitiale } from '/partage/texte.js';

/** Le grand dessin (montants qui défilent, barres qui montent) n'a lieu qu'une fois par session. */
let dejaVu = false;

/**
 * La création la plus récente déjà montrée : une recette saisie depuis se
 * signale un instant. Une plus ancienne qui remonte (après une suppression),
 * ou une recette rétablie après « Annuler », ne brille pas.
 */
let creationVue = null;

/** Avant six semaines d'activité, une estimation de fin d'année dirait n'importe quoi. */
const JOURS_AVANT_ESTIMATION = 45;

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
 * Une jauge de progression vers un seuil, ce qu'il reste sous sa droite, et un
 * message dessous seulement quand il y a quelque chose à signaler. Même à 1 %,
 * le remplissage se voit : une pastille de la hauteur de la jauge.
 *
 * Les seuils de TVA ont deux étages : un seuil de base, et un seuil majoré
 * au-delà duquel la franchise tombe immédiatement. Quand il existe, la jauge
 * se gradue jusqu'au majoré : un trait plein marque le seuil de base, un
 * trait en tirets le majoré, au bout.
 *
 * `estimation` : le chiffre d'affaires au 31 décembre si l'année continue au
 * même rythme. La jauge le prolonge dans une teinte plus claire de son encre ;
 * le montant se lit dans la phrase en tête de carte.
 */
function regle({ titre, ca, progression, devise, messageAttention, messageDepasse, teinte = '', estimation = null }) {
  const pourcentage = progression.pourcentage;
  const niveau = pourcentage >= 100 ? 'depasse' : pourcentage >= 80 ? 'attention' : teinte;
  const alerte = niveau === 'attention' || niveau === 'depasse';
  const majore = progression.seuilMajore;
  const reference = majore ?? progression.seuil;
  const part = (valeur) => Math.min(100, (valeur / reference) * 100);
  // Au calme, le seuil majoré se lit sur son trait en tirets (au survol) : la
  // note ne parle que d'une approche ou d'un dépassement.
  const note = niveau === 'depasse' ? messageDepasse
    : niveau === 'attention' ? messageAttention.replace('{p}', pourcentage) : '';
  const projete = estimation !== null && estimation > ca && part(ca) < 100;
  return `<div class="regle${niveau ? ` ${niveau}` : ''}">
      <div class="regle-tete"><span>${echapperHtml(titre)}</span>
        <span class="valeurs"><strong>${echapperHtml(formaterMontantEntier(ca, devise))}</strong> / ${echapperHtml(formaterMontantEntier(progression.seuil, devise))}</span></div>
      <div class="piste" role="meter" aria-valuemin="0" aria-valuemax="${progression.seuil}" aria-valuenow="${Math.round(ca)}"
        aria-label="${echapperHtml(titre)} : ${pourcentage} % du seuil">
        ${projete ? `<span class="projection" style="left:${part(ca)}%;width:${part(estimation) - part(ca)}%"></span>` : ''}
        <span class="rempli" style="width:${ca > 0 ? `max(10px, ${part(ca)}%)` : '0'}"></span>
        ${majore ? `<span class="repere" style="left:calc(${(progression.seuil / majore) * 100}% - 1px)"
          title="Seuil de base : ${echapperHtml(formaterMontant(progression.seuil, devise))}"></span>
          <span class="repere majore" title="Seuil majoré : ${echapperHtml(formaterMontant(majore, devise))}"></span>` : ''}
      </div>
      <p class="regle-pied"><span class="part-seuil">${pourcentage} % du seuil</span>${niveau === 'depasse' ? '' : `<span class="reste">Il reste ${echapperHtml(formaterMontantEntier(progression.restant, devise))}</span>`}</p>
      ${note ? `<p class="regle-note ${alerte ? niveau : ''}">${alerte ? icone('triangle-alerte', { taille: 14 }) : ''}<span>${echapperHtml(note)}${majore && niveau === 'attention' ? ` Seuil majoré : ${echapperHtml(formaterMontantEntier(majore, devise))}.` : ''}</span></p>` : ''}
    </div>`;
}

/**
 * Le chiffre d'affaires au 31 décembre au rythme de l'année, arrondi à la
 * dizaine. Seulement pour l'année en cours, passé ses premières semaines.
 */
function estimateur(annee) {
  const jour = jourDeLAnnee(aujourdHuiIso());
  const longueur = jourDeLAnnee(`${annee}-12-31`);
  if (annee !== new Date().getFullYear() || jour < JOURS_AVANT_ESTIMATION) return null;
  return {
    estimer: (ca) => Math.round(((ca / jour) * longueur) / 10) * 10,
    /** Le mois où, à ce rythme, `seuil` serait atteint. */
    moisAtteint: (ca, seuil) => {
      if (ca <= 0) return null;
      const jourAtteint = Math.ceil((seuil / ca) * jour);
      if (jourAtteint > longueur) return null;
      return new Date(annee, 0, jourAtteint).getMonth() + 1;
    }
  };
}

/**
 * Une phrase en tête de carte : le chiffre d'affaires attendu au 31 décembre à
 * ce rythme, et ce qu'il annonce (tout tient, ou tel seuil serait atteint vers
 * tel mois). Quand un seuil est déjà franchi, l'estimation seule : les notes
 * sous les jauges disent le reste.
 *
 * @param {string} fin « Estimation au 31 décembre : 15 720 €. », déjà échappé
 */
function phraseSeuils(suivis, outil, fin) {
  if (!outil) return '';
  if (suivis.some((s) => s.ca >= s.seuil)) {
    return `<p class="phrase-seuils neutre">${icone('calendrier', { taille: 16 })}<span>${fin}</span></p>`;
  }
  const atteints = suivis
    .map((s) => ({ ...s, mois: outil.moisAtteint(s.ca, s.seuil) }))
    .filter((s) => s.mois !== null)
    .sort((a, b) => a.mois - b.mois);
  if (atteints.length === 0) {
    return `<p class="phrase-seuils">${icone('cercle-valide', { taille: 16 })}<span>${fin} Tous les seuils tiennent.</span></p>`;
  }
  const premier = atteints[0];
  const quand = premier.mois === new Date().getMonth() + 1 ? 'dès ce mois-ci' : `en ${nomMois(premier.mois)}`;
  return `<p class="phrase-seuils attention">${icone('triangle-alerte', { taille: 16 })}<span>${fin} À ce rythme, ${premier.nom} serait atteint ${quand}.</span></p>`;
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

  // L'estimation de fin d'année, et la phrase qui la résume.
  const outil = estimateur(stats.annee);
  const estimer = (ca) => (outil ? outil.estimer(ca) : null);
  const caPrestations = bilan.prestations?.chiffreAffaires ?? 0;
  const montant = (m) => echapperHtml(formaterMontantEntier(m, devise));
  const fin = outil ? `Estimation au 31 décembre : ${montant(estimer(stats.caAnnee))}${
    bilan.prestations ? `, dont ${montant(estimer(caPrestations))} de prestations` : ''}.` : '';
  const suivis = [
    { nom: 'le plafond micro-entrepreneur', ca: stats.caAnnee, seuil: bilan.plafondMicro.seuil },
    { nom: 'le seuil de franchise de TVA', ca: stats.caAnnee, seuil: bilan.franchiseTva.seuil },
    ...(bilan.prestations ? [
      { nom: 'le plafond des prestations', ca: caPrestations, seuil: bilan.prestations.plafondMicro.seuil },
      { nom: 'le seuil de TVA des prestations', ca: caPrestations, seuil: bilan.prestations.franchiseTva.seuil }
    ] : [])
  ];

  return `
    <div class="carte-tete"><h2 id="titre-plafonds">Plafonds et franchise de TVA${infobulle(
      'Les seuils micro-entreprise et les seuils de TVA sont indépendants : une entreprise peut rester en ' +
      'micro-entreprise tout en devenant redevable de la TVA. Suivi purement informatif, basé sur le barème ' +
      `${periodeSeuils(stats.annee)} ; en cas de doute, vérifiez les valeurs en vigueur sur economie.gouv.fr.` +
      (estMixte ? ' Activité mixte : pour chaque régime, le CA total et la part prestations doivent tous deux rester sous leur seuil.' : '') +
      (outil ? ' Sur les jauges, la partie plus claire prolonge le chiffre d’affaires au même rythme jusqu’au 31 décembre.' : ''),
      'le suivi des seuils'
    )}</h2><span class="note">${stats.annee}</span></div>
    ${phraseSeuils(suivis, outil, fin)}
    <div class="regime">
      <h3>Rester en micro-entreprise${infobulle(
        'Au-delà du plafond, le régime micro ne prend fin qu’après deux années consécutives de dépassement.',
        'le plafond micro-entrepreneur'
      )}</h3>
      ${regle({
        titre: titreTotal, ca: stats.caAnnee, progression: bilan.plafondMicro, devise, estimation: estimer(stats.caAnnee),
        messageAttention: '{p} % du plafond annuel atteint.',
        messageDepasse: 'Plafond dépassé. Le régime micro ne prend fin qu’après deux années consécutives de dépassement.'
      })}
      ${bilan.prestations ? regle({
        titre: titrePart, ca: caPrestations, progression: bilan.prestations.plafondMicro, devise, estimation: estimer(caPrestations),
        messageAttention: '{p} % du plafond propre aux prestations atteint.',
        messageDepasse: 'Plafond des prestations dépassé : la sortie du régime n’intervient qu’après deux années consécutives.',
        teinte: 'prestation'
      }) : ''}
    </div>
    <div class="regime">
      <h3>Franchise en base de TVA${infobulle(
        `${estMixte ? 'Tant que ces seuils tiennent' : 'Tant que ce seuil tient'}, vous ne facturez pas la TVA. ` +
        'Sur la jauge, le trait plein marque le seuil de base, les tirets le seuil majoré, au-delà duquel la franchise tombe sans attendre la fin de l’année.',
        'la franchise de TVA'
      )}</h3>
      ${regle({
        titre: titreTotal, ca: stats.caAnnee, progression: bilan.franchiseTva, devise, estimation: estimer(stats.caAnnee),
        messageAttention: 'Vous approchez du seuil de franchise de TVA ({p} %).',
        messageDepasse: finFranchise(stats.caAnnee, bilan.franchiseTva.seuilMajore)
      })}
      ${bilan.prestations ? regle({
        titre: titrePart, ca: caPrestations, progression: bilan.prestations.franchiseTva, devise, estimation: estimer(caPrestations),
        messageAttention: 'La part prestations approche de son propre seuil de TVA ({p} %).',
        messageDepasse: finFranchise(caPrestations, bilan.prestations.franchiseTva.seuilMajore),
        teinte: 'prestation'
      }) : ''}
      ${estMixte && stats.nombreNonCategorisees > 0 ? `
        <p class="regle-note attention">${icone('cercle-alerte', { taille: 14 })}<span>${accorder(stats.nombreNonCategorisees, 'recette')} de ${stats.annee}
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
  // En activité mixte, l'URSSAF demande deux montants, dans deux cases : ce
  // sont eux qui se copient, pas le total.
  const estMixte = etat.parametres.typeActivite === 'mixte';
  /** Une ligne montant ; `copier` ajoute le bouton qui copie le nombre nu. */
  const ligne = (libelle, valeur, { classe = '', copier = null, quoi = 'le montant', titre = '' } = {}) => `<div class="ligne-montant${classe ? ` ${classe}` : ''}"${titre ? ` title="${echapperHtml(titre)}"` : ''}>
        <span>${libelle}</span><span class="valeur">${echapperHtml(valeur)}</span>
        ${copier === null ? '<span></span>' : `<button type="button" class="btn-icone" data-copier="${copier}" title="Copier"
          aria-label="Copier ${quoi}, sans symbole de devise">${icone('copier', { taille: 15 })}</button>`}
      </div>`;
  const cases = estMixte && bilan ? `
        ${ligne('dont ventes', formaterMontantEntier(bilan.ventes.aDeclarer, devise), {
          classe: 'case-mixte', copier: bilan.ventes.aDeclarer, quoi: 'le montant des ventes', titre: caseUrssaf('ventes') ?? ''
        })}
        ${ligne('dont prestations', formaterMontantEntier(bilan.prestations.aDeclarer, devise), {
          classe: 'case-mixte', copier: bilan.prestations.aDeclarer, quoi: 'le montant des prestations',
          titre: caseUrssaf(natureDesPrestations(etat.parametres.naturePrestations)) ?? ''
        })}` : '';
  return `
    <div class="carte-tete"><h2 id="titre-declaration">Déclaration URSSAF</h2>${pastilleEtat(periode.etat)}</div>
    <div class="declaration-corps">
      <p class="declaration-periode">${libellePeriode(periode)}</p>
      ${quand}
      ${bilan?.chiffreAffaires === 0 ? blocSansChiffreAffaires(periode.etat)
        : bilan ? `<div class="lignes-montants">
        ${ligne(declarable ? 'Chiffre d’affaires à déclarer' : 'Encaissé à ce jour', formaterMontantEntier(bilan.aDeclarer, devise), { classe: 'principal', copier: estMixte ? null : bilan.aDeclarer })}
        ${cases}
        ${c ? `${ligne('Sera prélevé par l’URSSAF', formaterMontantEntier(c.totalPreleve, devise))}
        ${ligne('Il vous restera', formaterMontantEntier(c.reste, devise), { classe: 'reste' })}` : ''}
      </div>
      ${estMixte && bilan.nonCategorise.nombreEncaissements > 0 ? `<p class="note-carte alerte">${icone('cercle-alerte', { taille: 14 })}<span>${accorder(bilan.nonCategorise.nombreEncaissements, 'recette')}
        sans catégorie, dans aucune des deux cases : <a href="#/recettes">classez-les</a> avant de déclarer.</span></p>` : ''}
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

// ---- Bien démarrer --------------------------------------------------------------------------------

/** « fini » ou « masque » : la carte ne revient plus. */
const CLE_DEMARRER = 'ldr-bien-demarrer';
/** Les étapes déjà vues cochées : une étape cochée depuis le passage précédent trace sa coche. */
const CLE_DEMARRER_FAITES = 'ldr-bien-demarrer-faites';
/** Au-delà, le livre est lancé : la carte n'a plus rien à apprendre. */
const RECETTES_AVANT_DEMARRE = 10;

/**
 * Les premières semaines, ce qui rend le livre complet et sûr. Chaque étape
 * se coche d'elle-même une fois faite. Rien pour le jeu de démonstration.
 */
async function chargerDemarrage() {
  const memoire = lirePreference(CLE_DEMARRER);
  if (etat.parametres.jeuDemo || memoire === 'fini' || memoire === 'masque') return null;
  const systeme = await api.systeme().catch(() => null);
  if (!systeme) return null;
  etat.systeme = { ...etat.systeme, ...systeme };
  const recettes = systeme.compteurs?.recettes ?? 0;
  if (recettes >= RECETTES_AVANT_DEMARRE) return null;
  const { nomEntreprise, periodiciteUrssaf } = etat.parametres;
  return [
    { cle: 'entreprise', titre: 'Votre entreprise', texte: 'Nom, SIRET et adresse, repris sur vos exports.', fait: Boolean(nomEntreprise), action: 'Compléter', lien: '#/parametres?section=identite' },
    { cle: 'rythme', titre: 'Votre rythme URSSAF', texte: 'Mensuel ou trimestriel, pour les rappels.', fait: Boolean(periodiciteUrssaf), action: 'Choisir', lien: '#/parametres?section=regime' },
    { cle: 'recette', titre: 'Une première recette', texte: 'Le premier encaissement du livre.', fait: recettes > 0, action: 'Saisir', lien: '#/recettes?nouvelle=1' },
    { cle: 'facture', titre: 'Une facture jointe', texte: 'Glissez son PDF sur une recette.', fait: (systeme.pieces?.nombre ?? 0) > 0, action: 'Ouvrir le registre', lien: '#/recettes' },
    { cle: 'copie', titre: 'Une copie sur clé USB', texte: 'À l’abri d’une panne de l’ordinateur.', fait: Boolean(systeme.copieExterne?.active), action: 'Choisir la clé', lien: '#/parametres?section=securite' }
  ];
}

function carteBienDemarrer(etapes) {
  if (!etapes) return '';
  const faites = etapes.filter((e) => e.fait);
  // Une fois tout en place, la carte le dit une fois, puis ne revient plus.
  if (faites.length === etapes.length) {
    ecrirePreference(CLE_DEMARRER, 'fini');
    return `<section class="carte bien-demarrer termine" aria-label="Bien démarrer">
        <span class="sceau-demarrer faite">${MARQUE_ETAPE}</span>
        <p><strong>Votre livre est prêt.</strong> Les cinq étapes sont faites ; cette carte ne reviendra plus.</p>
      </section>`;
  }
  const dejaVues = new Set(String(lirePreference(CLE_DEMARRER_FAITES) ?? '').split(',').filter(Boolean));
  ecrirePreference(CLE_DEMARRER_FAITES, faites.map((e) => e.cle).join(','));
  return `<section class="carte bien-demarrer" aria-labelledby="titre-demarrer">
      <div class="demarrer-tete">
        <h2 id="titre-demarrer">Bien démarrer</h2>
        <span class="demarrer-compte">${faites.length} sur ${etapes.length}</span>
        <button type="button" class="btn-icone" data-masquer-demarrer title="Masquer" aria-label="Masquer « Bien démarrer »">${icone('croix', { taille: 16 })}</button>
      </div>
      <ol class="demarrer-liste">${etapes.map((e) => `<li class="${e.fait ? `faite${dejaVues.has(e.cle) ? '' : ' vient'}` : ''}">
          ${MARQUE_ETAPE}
          <div class="demarrer-texte"><strong>${e.titre}</strong><span>${e.texte}</span>
            ${e.fait ? '<span class="hors-ecran">Fait.</span>' : `<a class="lien-demarrer" href="${e.lien}">${e.action}${icone('fleche-droite', { taille: 14 })}</a>`}</div>
        </li>`).join('')}</ol>
    </section>`;
}

/** « Masquer » : la carte s'efface et ne revient plus. */
function brancherBienDemarrer(page) {
  page.querySelector('[data-masquer-demarrer]')?.addEventListener('click', async (evenement) => {
    ecrirePreference(CLE_DEMARRER, 'masque');
    await replierPuisRetirer(evenement.currentTarget.closest('.bien-demarrer'));
  });
}

/**
 * La rétrospective, mise en avant du 15 décembre au 31 janvier : le reste de
 * l'année, elle attend dans les exports (carte du rapport annuel).
 */
function carteBilan(annee) {
  return `<section class="carte-retro-saison" aria-labelledby="titre-bilan">
      <div class="saison-texte">
        <h2 id="titre-bilan">Votre année ${annee} en rétrospective</h2>
        <p>Le total, le meilleur mois, vos clients et vos habitudes, racontés en scènes animées.</p>
      </div>
      <button type="button" class="btn saison-lancer" data-bilan>${icone('lecture', { taille: 15 })}Lancer la rétrospective</button>
      <button type="button" class="btn-icone saison-masquer" data-masquer-bilan="${annee}" title="Masquer" aria-label="Masquer la rétrospective ${annee}">${icone('croix', { taille: 16 })}</button>
    </section>`;
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
    const [stats, declaration, demarrage] = await Promise.all([
      api.tableauDeBord({ annee: anneeChoisie }), chargerDeclaration(), chargerDemarrage()
    ]);
    const { devise, suiviSeuils } = etat.parametres;
    const anneeSaison = retrospectiveDeSaison(anneesDisponibles);
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
    const nonCategoriseMois = Math.max(0, Math.round((stats.caMois - stats.caMoisVentes - stats.caMoisPrestations) * 100) / 100);
    const partsMois = estMixte && stats.caMois > 0 ? [
      ['prestations', stats.caMoisPrestations, 'Prestations'],
      ['ventes', stats.caMoisVentes, 'Ventes'],
      ...(nonCategoriseMois > 0 ? [['neutre', nonCategoriseMois, 'Non catégorisé']] : [])
    ] : [];
    const legendeMois = legende(partsMois);
    // La moyenne, catégorie par catégorie (celle qui n'a aucun encaissement n'apparaît pas).
    const moyenne = (ca, nombre) => Math.round((ca * 100) / nombre) / 100;
    const partsMoyenne = estMixte && stats.nombreAnnee > 0 ? [
      ...(stats.nombreAnneePrestations > 0 ? [['prestations', moyenne(stats.caAnneePrestations, stats.nombreAnneePrestations), 'Prestations']] : []),
      ...(stats.nombreAnneeVentes > 0 ? [['ventes', moyenne(stats.caAnneeVentes, stats.nombreAnneeVentes), 'Ventes']] : [])
    ] : [];
    const legendeMoyenne = legende(partsMoyenne);
    // Les achats n'ont pas de catégorie : ceux du mois, puis ceux des mois
    // d'avant (« Janv. à sept. », abrégé pour tenir sur une ligne dans la carte
    // étroite), et ceux datés plus tard dans l'année s'il y en a. Un seul mois
    // se nomme en entier.
    const abrege = (m) => (MOIS_ABREGES[m - 1] === nomMois(m) ? nomMois(m) : `${MOIS_ABREGES[m - 1]}.`);
    const plage = (du, au) => majusculeInitiale(du === au ? nomMois(du) : `${abrege(du)} à ${abrege(au)}`);
    const moisAvant = plage(1, stats.mois - 1);
    const moisApres = plage(stats.mois + 1, 12);
    const achatsApres = Math.round((stats.achatsAnnee - stats.achatsMois - stats.achatsAvantMois) * 100) / 100;
    const partsAchats = stats.achatsAnnee > 0 ? [
      ['achat', stats.achatsMois, majusculeInitiale(nomMois(stats.mois))],
      ...(stats.mois > 1 ? [['achat-avant', stats.achatsAvantMois, moisAvant]] : []),
      ...(achatsApres > 0 ? [['achat-avant', achatsApres, moisApres]] : [])
    ] : [];
    const legendeAchats = legende(partsAchats);

    /**
     * Une barre de répartition, segments séparés d'un filet de papier ; elle
     * se lit aussi en texte (son `aria-label`, en parts du total, ou `texte`
     * quand les segments ne sont pas des parts).
     */
    const barreParts = (lesParts, total, texte = null) => (lesParts.length && total > 0
      ? `<div class="repartition" role="img" aria-label="${texte ?? lesParts.map(([, m, l]) => `${l} ${Math.round((m / total) * 100)} %`).join(', ')}">
          ${lesParts.filter(([, m]) => m > 0).map(([cle, montant]) => `<span class="${cle}" style="width:${(montant / total) * 100}%"></span>`).join('')}
        </div>` : '');

    // Chaque carte suit le même plan : un intitulé court précédé de son icône,
    // le montant, une barre de répartition quand le montant se partage, une
    // légende serrée, puis une ligne de contexte.
    const indicateur = ({ cle, icone: nomIcone, teinte = '', titre, valeur, detail, barre = '', repartition = '' }) => `
      <article class="carte indicateur${stats.caAnnee === 0 && valeur === 0 ? ' vide' : ''}">
        <div class="indicateur-tete">${icone(nomIcone, { taille: 16, classe: `encre-tete${teinte ? ` encre-${teinte}` : ''}` })}<span>${titre}</span></div>
        <p class="indicateur-valeur" data-compteur="${valeur}" data-cle="${cle}">${montantDetaille(valeur, devise)}</p>
        ${barre}
        ${repartition ? `<div class="legende${barre ? ' sous-barre' : ''}">${repartition}</div>` : ''}
        <p class="indicateur-detail">${detail}</p>
      </article>`;

    // Le cadre mesure la place disponible : trop étroite, la carte de l'année
    // prend toute une ligne et les autres se partagent la suivante.
    const indicateurs = `<div class="cadre-indicateurs">
      <section class="indicateurs${avecAchats ? '' : ' trois'}" aria-label="Indicateurs clés">
        <article class="carte indicateur principal">
          <div class="indicateur-tete"><span>Chiffre d’affaires encaissé</span><span class="annee-indicateur">${stats.annee}</span></div>
          <p class="indicateur-valeur" data-compteur="${stats.caAnnee}" data-cle="annee">${montantDetaille(stats.caAnnee, devise)}</p>
          ${barreParts(parts, stats.caAnnee)}
          <div class="legende">
            ${legendeParts}
            <span class="compteurs"><strong>${stats.nombreAnnee}</strong> encaissement${stats.nombreAnnee > 1 ? 's' : ''}, <strong>${stats.nombreClientsAnnee}</strong> client${stats.nombreClientsAnnee > 1 ? 's' : ''}</span>
          </div>
        </article>
        ${indicateur({
          cle: 'mois', icone: 'calendrier',
          titre: `CA ${deMois(nomMois(stats.mois))}${estCourante ? '' : ` ${stats.annee}`}`,
          valeur: stats.caMois,
          barre: barreParts(partsMois, stats.caMois),
          repartition: legendeMois,
          detail: `${accorder(stats.nombreMois, 'encaissement')} ${estCourante ? 'ce mois-ci' : `en ${nomMois(stats.mois)}`}`
        })}
        ${indicateur({
          cle: 'moyenne', icone: 'recettes', teinte: 'analyse',
          titre: 'Panier moyen',
          valeur: stats.moyenneEncaissement,
          // Des moyennes, qui ne s'additionnent pas : la barre compare les
          // deux paniers, chaque segment à la mesure du sien.
          barre: barreParts(partsMoyenne, sommeMontants(partsMoyenne.map(([, m]) => m)),
            `Panier moyen : ${partsMoyenne.map(([, m, l]) => `${l.toLowerCase()} ${echapperHtml(formaterMontant(m, devise))}`).join(', ')}`),
          repartition: legendeMoyenne,
          detail: stats.nombreAnnee > 0 ? `Sur ${accorder(stats.nombreAnnee, 'encaissement')}` : 'Aucun encaissement cette année'
        })}
        ${avecAchats ? indicateur({
          cle: 'achats', icone: 'achats', teinte: 'achat',
          titre: `Achats en ${stats.annee}`,
          valeur: stats.achatsAnnee,
          barre: barreParts(partsAchats, stats.achatsAnnee),
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
    // Son rythme se voit : les trois mois écoulés cochés, celui-ci en pointillés.
    const aRenouveler = estCourante && etat.parametres.proposerRenouvellements !== false ? (stats.aRenouveler ?? []).slice(0, 3) : [];
    const moisAvantCourant = (k) => ((stats.mois - 1 - k + 12) % 12) + 1;
    const rythme = `<span class="rythme" aria-hidden="true">${[3, 2, 1].map((k) =>
      `<span class="rythme-mois fait">${icone('coche', { taille: 11 })}${MOIS_ABREGES[moisAvantCourant(k) - 1]}</span>`).join('')}<span class="rythme-mois attendu">${MOIS_ABREGES[stats.mois - 1]}</span></span>`;
    const bandeRenouveler = aRenouveler.length === 0 ? '' : `
      <div class="a-renouveler" role="group" aria-label="Recettes qui reviennent chaque mois">
        ${aRenouveler.map(({ cle, derniere: r }) => `<div class="ligne-renouveler">
          ${monogramme(r.client, { petit: true })}
          <span class="texte-renouveler"><strong>${echapperHtml(r.libelle)}</strong>
            <span>${echapperHtml(r.client)}, ${echapperHtml(formaterMontant(r.montant, devise))}</span>
            <span class="hors-ecran">Encaissée les trois derniers mois, pas encore en ${nomMois(stats.mois)}.</span>
            ${rythme}</span>
          <button type="button" class="lien-ecarter" data-ecarter="${echapperHtml(cle)}">Ne plus proposer</button>
          <a class="btn btn-petit" href="#/recettes?modele=${encodeURIComponent(r.id)}">${icone('plus', { taille: 15 })}Ajouter pour ${nomMois(stats.mois)}</a>
        </div>`).join('')}
      </div>`;

    // ---- Dernières recettes : un relevé, rangé par jour, autant de lignes que
    // la carte en contient. Une recette tout juste saisie se signale un instant.
    const avecSeuils = Boolean(suiviSeuils);
    const listees = stats.dernieresRecettes.slice(0, avecSeuils ? 12 : 8);
    const neuves = new Set(creationVue === null || !estCourante ? [] : listees.filter((r) => r.creeLe > creationVue).map((r) => r.id));
    for (const r of listees) if (creationVue === null || r.creeLe > creationVue) creationVue = r.creeLe;
    const releve = releveDernieres(listees, { devise, estMixte, annee: stats.annee, neuves });
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
          <div class="${avecSeuils ? 'lignes-ajustees' : 'lignes-libres'}">${releve}</div>
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
            ${avecAchats ? `<a class="btn" href="#/achats?nouveau=1" data-touche="a" aria-keyshortcuts="A">${icone('plus', { taille: 16 })}Nouvel achat<kbd aria-hidden="true">A</kbd></a>` : ''}
            <a class="btn btn-principal" href="#/recettes?nouvelle=1" data-touche="n" aria-keyshortcuts="N">${icone('plus', { taille: 16 })}Nouvelle recette<kbd aria-hidden="true">N</kbd></a>
          </div>
        </header>
        ${carteBienDemarrer(demarrage)}
        ${anneeSaison === null ? '' : carteBilan(anneeSaison)}
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
        // Un mois choisi ouvre son relevé sur place, dans un panneau.
        surClic: (numero) => {
          ouvrirReleveMois({ annee: stats.annee, mois: numero, dernierMois: moisCourant ?? 12, precedente })
            .catch((erreur) => toast(erreur.message, 'erreur'));
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
    brancherBienDemarrer(page);
    page.querySelector('[data-bilan]')?.addEventListener('click', () => {
      ouvrirRetrospective(anneeSaison).catch((erreur) => toast(erreur.message, 'erreur'));
    });
    page.querySelector('[data-masquer-bilan]')?.addEventListener('click', (evenement) => {
      ecrirePreference(cleRetrospectiveMasquee(anneeSaison), '1');
      replierPuisRetirer(evenement.currentTarget.closest('.carte-retro-saison'));
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
    // Un bouton par montant à reporter (deux en activité mixte).
    zone.querySelectorAll('[data-copier]').forEach((bouton) => bouton.addEventListener('click', (evenement) => {
      copierDansPressePapiers(evenement.currentTarget.dataset.copier, evenement.currentTarget);
    }));
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
  // Recettes ou achats saisis en série dans un panneau ouvert sur place : la page suit.
  ecouterPourLaPage('ligne-ajoutee', () => {
    if (pageCourante?.isConnected) rendre({ depuis: affichage() }).catch((erreur) => toast(erreur.message, 'erreur'));
  });
}

/** « Aujourd’hui », « Hier », sinon « Lundi 16 novembre » (l'année seulement si ce n'est pas celle affichée). */
function enTeteJour(iso, annee) {
  const ecart = joursEntre(iso, aujourdHuiIso());
  if (ecart === 0) return 'Aujourd’hui';
  if (ecart === 1) return 'Hier';
  const jour = majusculeInitiale(new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long' }));
  return `${jour} ${jourEtMois(iso)}${anneeDe(iso) === annee ? '' : ` ${anneeDe(iso)}`}`;
}

/**
 * Les dernières recettes, lues comme un relevé : rangées sous leur jour, le
 * client et le libellé à gauche, le montant et le moyen de paiement à droite.
 * Chaque ligne ouvre sa recette dans le registre.
 */
function releveDernieres(recettes, { devise, estMixte, annee, neuves }) {
  const { modesPersonnalises = [] } = etat.parametres;
  let jour = '';
  const lignes = recettes.map((r) => {
    const tete = r.dateEncaissement !== jour ? `<p class="releve-jour">${enTeteJour((jour = r.dateEncaissement), annee)}</p>` : '';
    const categorie = estMixte ? `<i class="carre-categorie ${r.categorie || 'neutre'}" aria-hidden="true"></i>` : '';
    return `${tete}<a class="releve-ligne${neuves.has(r.id) ? ' neuve' : ''}" href="#/recettes?voir=${encodeURIComponent(r.id)}">
        ${monogramme(r.client, { petit: true })}
        <span class="releve-qui"><strong>${echapperHtml(r.client)}</strong><span>${r.libelle ? echapperHtml(r.libelle) : 'Sans libellé'}</span></span>
        <span class="releve-combien"><strong>${echapperHtml(formaterMontant(r.montant, devise))}</strong><span>${categorie}${echapperHtml(libelleMode(r.modeReglement, modesPersonnalises))}</span></span>
      </a>`;
  }).join('');
  return `<div class="releve">${lignes}</div>`;
}

/**
 * Dernières recettes : autant de lignes que la carte en contient (sa hauteur
 * est celle des plafonds, à côté), jamais une ligne coupée, jamais un jour
 * sans ligne dessous.
 */
function ajusterLignes(cadre) {
  const ajuster = () => {
    if (!cadre.isConnected) { observateur.disconnect(); return; }
    const elements = [...cadre.querySelector('.releve').children];
    elements.forEach((e) => { e.hidden = false; });
    const dispo = cadre.clientHeight;
    let dernier = -1;
    elements.forEach((e, i) => { if (dernier === i - 1 && e.offsetTop + e.offsetHeight <= dispo) dernier = i; });
    // Toujours au moins une recette, sous son jour.
    dernier = Math.max(dernier, Math.min(1, elements.length - 1));
    while (dernier > 0 && elements[dernier].classList.contains('releve-jour')) dernier -= 1;
    elements.forEach((e, i) => { e.hidden = i > dernier; });
  };
  const observateur = new ResizeObserver(ajuster);
  observateur.observe(cadre);
}
