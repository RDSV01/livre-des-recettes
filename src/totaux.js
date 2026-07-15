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

/** Statistiques du tableau de bord, calculées pour la date courante. */
export function statistiquesTableauDeBord(recettes, maintenant = new Date()) {
  const annee = maintenant.getFullYear();
  const mois = maintenant.getMonth() + 1;

  const recettesAnnee = filtrerParPeriode(recettes, { annee });
  const recettesMois = filtrerParPeriode(recettesAnnee, { mois });

  const caAnneeCentimes = recettesAnnee.reduce((acc, r) => acc + enCentimes(r.montant), 0);
  const nombreAnnee = recettesAnnee.length;

  return {
    annee,
    mois,
    caMois: totalRecettes(recettesMois),
    caAnnee: enEuros(caAnneeCentimes),
    nombreEncaissements: nombreAnnee,
    moyenneEncaissement: nombreAnnee === 0 ? 0 : enEuros(Math.round(caAnneeCentimes / nombreAnnee)),
    dernieresRecettes: [...recettes].sort(comparerParDateDesc).slice(0, 5)
  };
}

/**
 * Bilan d'une période au choix, pour aider à remplir la déclaration URSSAF :
 * chiffre d'affaires encaissé et nombre d'encaissements.
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
  return {
    annee,
    type,
    valeur: type === 'annee' ? null : valeur,
    libellePeriode,
    chiffreAffaires: totalRecettes(selection),
    nombreEncaissements: selection.length
  };
}
