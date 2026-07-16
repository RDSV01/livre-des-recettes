/**
 * Calculs sur les recettes : filtres par période, totaux, statistiques du
 * tableau de bord et bilan par période pour la déclaration URSSAF.
 *
 * Tous les cumuls passent par les centimes (voir `partage/montants.js`).
 */

import { enCentimes, enEuros } from './partage/montants.js';
import { anneeDe, moisDe, nomMois, trimestreDe } from './partage/dates.js';

/** Total d'une liste de recettes, en euros. */
export function totalRecettes(recettes) {
  return enEuros(recettes.reduce((acc, r) => acc + enCentimes(r.montant), 0));
}

/**
 * Filtre par période. Chaque critère est facultatif :
 * `{ annee: 2026, mois: 7 }`, `{ annee: 2026, trimestre: 3 }`, `{ annee: 2026 }`…
 */
export function filtrerParPeriode(recettes, { annee, mois, trimestre } = {}) {
  return recettes.filter((r) => {
    if (annee && anneeDe(r.dateEncaissement) !== annee) return false;
    if (mois && moisDe(r.dateEncaissement) !== mois) return false;
    if (trimestre && trimestreDe(moisDe(r.dateEncaissement)) !== trimestre) return false;
    return true;
  });
}

/**
 * Ordre d'affichage du tableau : date d'encaissement décroissante,
 * puis création décroissante (les dates ISO se comparent lexicographiquement).
 */
export function comparerParDateDesc(a, b) {
  return b.dateEncaissement.localeCompare(a.dateEncaissement) ||
    String(b.creeLe).localeCompare(String(a.creeLe));
}

/** Ordre chronologique du registre exporté (croissant). */
export function comparerParDateAsc(a, b) {
  return -comparerParDateDesc(a, b);
}

/**
 * Chiffre d'affaires mois par mois sur les `nombreMois` derniers mois
 * (mois courant inclus), du plus ancien au plus récent.
 * Les mois sans recette apparaissent à zéro : le graphique reste continu.
 */
export function caMensuel(recettes, { nombreMois = 12, maintenant = new Date() } = {}) {
  const periodes = [];
  let annee = maintenant.getFullYear();
  let mois = maintenant.getMonth() + 1;
  for (let i = 0; i < nombreMois; i += 1) {
    periodes.unshift({ annee, mois });
    mois -= 1;
    if (mois === 0) { mois = 12; annee -= 1; }
  }

  const totaux = new Map(periodes.map((p) => [`${p.annee}-${p.mois}`, 0]));
  for (const recette of recettes) {
    const cle = `${anneeDe(recette.dateEncaissement)}-${moisDe(recette.dateEncaissement)}`;
    if (totaux.has(cle)) {
      totaux.set(cle, totaux.get(cle) + enCentimes(recette.montant));
    }
  }
  return periodes.map((p) => ({ ...p, total: enEuros(totaux.get(`${p.annee}-${p.mois}`)) }));
}

/**
 * Statistiques du tableau de bord pour une année donnée (l'année courante par
 * défaut). Le graphique couvre toujours l'année choisie, de janvier à
 * décembre. Le mois mis en avant est le mois en cours pour l'année courante,
 * décembre pour une année passée.
 */
export function statistiquesTableauDeBord(recettes, { maintenant = new Date(), annee = null } = {}) {
  const anneeCourante = maintenant.getFullYear();
  const anneeChoisie = annee ?? anneeCourante;
  const estCourante = anneeChoisie === anneeCourante;
  const mois = estCourante ? maintenant.getMonth() + 1 : 12;

  const recettesAnnee = filtrerParPeriode(recettes, { annee: anneeChoisie });
  const recettesMois = filtrerParPeriode(recettesAnnee, { mois });

  const caAnneeCentimes = recettesAnnee.reduce((acc, r) => acc + enCentimes(r.montant), 0);
  const caPrestationsCentimes = recettesAnnee
    .filter((r) => r.categorie === 'prestations')
    .reduce((acc, r) => acc + enCentimes(r.montant), 0);
  const nombreAnnee = recettesAnnee.length;

  return {
    annee: anneeChoisie,
    mois,
    caMois: totalRecettes(recettesMois),
    caAnnee: enEuros(caAnneeCentimes),
    caAnneePrestations: enEuros(caPrestationsCentimes),
    nombreEncaissements: nombreAnnee,
    nombreNonCategorisees: recettesAnnee.filter((r) => !r.categorie).length,
    moyenneEncaissement: nombreAnnee === 0 ? 0 : enEuros(Math.round(caAnneeCentimes / nombreAnnee)),
    caParMois: caMensuel(recettes, { maintenant: new Date(anneeChoisie, 11, 15) }),
    dernieresRecettes: recettesAnnee.sort(comparerParDateDesc).slice(0, 5)
  };
}

/**
 * Bilan d'une période au choix, pour aider à remplir la déclaration URSSAF :
 * chiffre d'affaires encaissé et nombre d'encaissements, avec la ventilation
 * par catégorie (la déclaration d'une activité mixte distingue les ventes
 * des prestations de services).
 *
 * @param {object} periode `{ annee, type: 'mois'|'trimestre'|'annee', valeur }`
 *   où `valeur` est le numéro de mois (1-12) ou de trimestre (1-4).
 */
export function bilanPeriode(recettes, { annee, type, valeur }) {
  let selection;
  let libellePeriode;
  switch (type) {
    case 'mois':
      selection = filtrerParPeriode(recettes, { annee, mois: valeur });
      libellePeriode = `${nomMois(valeur)} ${annee}`;
      break;
    case 'trimestre':
      selection = filtrerParPeriode(recettes, { annee, trimestre: valeur });
      libellePeriode = `${valeur}${valeur === 1 ? 'er' : 'e'} trimestre ${annee}`;
      break;
    case 'annee':
      selection = filtrerParPeriode(recettes, { annee });
      libellePeriode = `année ${annee}`;
      break;
    default:
      throw new Error(`Type de période inconnu : ${type}`);
  }

  const partie = (filtre) => {
    const groupe = selection.filter(filtre);
    return { chiffreAffaires: totalRecettes(groupe), nombreEncaissements: groupe.length };
  };

  return {
    annee,
    type,
    valeur: type === 'annee' ? null : valeur,
    libellePeriode,
    chiffreAffaires: totalRecettes(selection),
    nombreEncaissements: selection.length,
    ventes: partie((r) => r.categorie === 'ventes'),
    prestations: partie((r) => r.categorie === 'prestations'),
    nonCategorise: partie((r) => !r.categorie)
  };
}
