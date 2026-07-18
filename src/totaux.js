/**
 * Calculs sur les recettes : filtres par période, totaux, statistiques du
 * tableau de bord et bilan par période pour la déclaration URSSAF.
 *
 * Tous les cumuls passent par les centimes (voir `partage/montants.js`).
 */

import { enCentimes, enEuros } from './partage/montants.js';
import { anneeDe, moisDe, nomMois, trimestreDe } from './partage/dates.js';

/** Total d'une liste de lignes (recettes ou achats), en euros. */
export function totalMontants(lignes) {
  return enEuros(lignes.reduce((acc, l) => acc + enCentimes(l.montant), 0));
}

/**
 * Filtre par période. Chaque critère est facultatif :
 * `{ annee: 2026, mois: 7 }`, `{ annee: 2026, trimestre: 3 }`, `{ annee: 2026 }`…
 * `cleDate` désigne la date qui fait foi : encaissement pour une recette,
 * règlement pour un achat.
 */
export function filtrerParPeriode(lignes, { annee, mois, trimestre } = {}, cleDate = 'dateEncaissement') {
  return lignes.filter((l) => {
    const date = l[cleDate];
    if (annee && anneeDe(date) !== annee) return false;
    if (mois && moisDe(date) !== mois) return false;
    if (trimestre && trimestreDe(moisDe(date)) !== trimestre) return false;
    return true;
  });
}

/**
 * Ordre d'affichage d'un tableau : date décroissante, puis création
 * décroissante (les dates ISO se comparent lexicographiquement).
 * S'utilise ainsi : `recettes.sort(parDateDesc('dateEncaissement'))`.
 */
export function parDateDesc(cleDate) {
  return (a, b) => String(b[cleDate]).localeCompare(String(a[cleDate])) ||
    String(b.creeLe).localeCompare(String(a.creeLe));
}

/** Ordre chronologique du registre exporté (croissant). */
export function parDateAsc(cleDate) {
  const desc = parDateDesc(cleDate);
  return (a, b) => -desc(a, b);
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
  const nombreAnnee = recettesAnnee.length;

  // Ventilation ventes / prestations : elle n'a de sens qu'en activité mixte,
  // où l'interface l'affiche, mais son calcul ne coûte rien.
  const deCategorie = (liste, categorie) => liste.filter((r) => r.categorie === categorie);
  const decembre = new Date(anneeChoisie, 11, 15);
  const parMois = (liste) => caMensuel(liste, { maintenant: decembre });

  return {
    annee: anneeChoisie,
    mois,
    caMois: totalMontants(recettesMois),
    caMoisVentes: totalMontants(deCategorie(recettesMois, 'ventes')),
    caMoisPrestations: totalMontants(deCategorie(recettesMois, 'prestations')),
    nombreMoisVentes: deCategorie(recettesMois, 'ventes').length,
    nombreMoisPrestations: deCategorie(recettesMois, 'prestations').length,
    caAnnee: enEuros(caAnneeCentimes),
    caAnneeVentes: totalMontants(deCategorie(recettesAnnee, 'ventes')),
    caAnneePrestations: totalMontants(deCategorie(recettesAnnee, 'prestations')),
    nombreAnneeVentes: deCategorie(recettesAnnee, 'ventes').length,
    nombreAnneePrestations: deCategorie(recettesAnnee, 'prestations').length,
    nombreEncaissements: nombreAnnee,
    nombreNonCategorisees: recettesAnnee.filter((r) => !r.categorie).length,
    moyenneEncaissement: nombreAnnee === 0 ? 0 : enEuros(Math.round(caAnneeCentimes / nombreAnnee)),
    caParMois: parMois(recettes),
    caParMoisVentes: parMois(deCategorie(recettes, 'ventes')),
    caParMoisPrestations: parMois(deCategorie(recettes, 'prestations')),
    dernieresRecettes: recettesAnnee.sort(parDateDesc('dateEncaissement')).slice(0, 5)
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
    return { chiffreAffaires: totalMontants(groupe), nombreEncaissements: groupe.length };
  };

  return {
    annee,
    type,
    valeur: type === 'annee' ? null : valeur,
    libellePeriode,
    chiffreAffaires: totalMontants(selection),
    nombreEncaissements: selection.length,
    ventes: partie((r) => r.categorie === 'ventes'),
    prestations: partie((r) => r.categorie === 'prestations'),
    nonCategorise: partie((r) => !r.categorie)
  };
}
