/**
 * Où en sont les déclarations URSSAF : l'état de chaque période (déclarée,
 * en cours, à venir, à déclarer, en retard, écoulée) et la période à traiter.
 * Sert au menu (pastille « En retard »), au tableau de bord (carte de
 * déclaration) et à l'écran URSSAF (onglets).
 *
 * Les déclarations se suivent : marquer le 2e trimestre déclaré, c'est avoir
 * déclaré le 1er (voir `periodeDeclaree`). Tant que rien n'a été marqué dans
 * la périodicité choisie, seule la dernière période écoulée est réclamée :
 * l'application ne sait rien des déclarations faites avant qu'on l'utilise.
 *
 * Module partagé serveur / navigateur : aucune dépendance hors `partage/`.
 */

import {
  idPeriode, periodeDepuisId, finPeriode, echeanceDeclaration, periodeDeclaree,
  dernierePeriodeEchue, aujourdHuiIso, trimestreDe, nomMois
} from './dates.js';
import { majusculeInitiale } from './texte.js';

/** « 2e trimestre 2026 », « Juillet 2026 ». */
export function libellePeriode({ annee, type, valeur }) {
  if (type === 'trimestre') return `${valeur}${valeur === 1 ? 'er' : 'e'} trimestre ${annee}`;
  if (type === 'mois') return `${majusculeInitiale(nomMois(valeur))} ${annee}`;
  return `Année ${annee}`;
}

/** Période qui précède (le 1er trimestre 2026 donne le 4e trimestre 2025). */
export function periodePrecedente({ annee, type, valeur }) {
  if (valeur > 1) return { annee, type, valeur: valeur - 1 };
  return { annee: annee - 1, type, valeur: type === 'mois' ? 12 : 4 };
}

/** Période qui suit. */
export function periodeSuivante({ annee, type, valeur }) {
  const max = type === 'mois' ? 12 : 4;
  return valeur < max ? { annee, type, valeur: valeur + 1 } : { annee: annee + 1, type, valeur: 1 };
}

/** Premier jour d'une période (date ISO). */
const debutPeriode = ({ annee, type, valeur }) =>
  `${annee}-${String(type === 'mois' ? valeur : valeur * 3 - 2).padStart(2, '0')}-01`;

/** Date locale à midi : aucun fuseau ne la fait changer de jour. */
const dateLocale = (iso) =>
  new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), 12);

/**
 * État d'une période de déclaration, au regard des paramètres :
 * « declaree », « en-cours », « a-venir », « a-declarer », « en-retard » ou
 * « ecoulee ».
 *
 * Une période d'une autre nature que la périodicité choisie (des mois quand
 * on déclare par trimestre), ou sans périodicité choisie, n'est ni due ni
 * déclarée : une fois passée, elle est simplement « écoulée ».
 *
 * @param {{ annee: number, type: 'mois'|'trimestre', valeur: number }} periode
 * @param {{ periodiciteUrssaf: string, dernierePeriodeDeclaree: string }} parametres
 * @param {string} [aujourdHui] date ISO du jour.
 */
export function etatPeriode(periode, { periodiciteUrssaf, dernierePeriodeDeclaree }, aujourdHui = aujourdHuiIso()) {
  const { annee, type, valeur } = periode;
  const id = idPeriode(annee, type, valeur);
  if (aujourdHui < debutPeriode(periode)) return 'a-venir';
  if (aujourdHui <= finPeriode(annee, type, valeur)) return 'en-cours';
  if (periodiciteUrssaf !== type) return 'ecoulee';
  if (periodeDeclaree(id, dernierePeriodeDeclaree)) return 'declaree';

  // Rien de marqué dans cette périodicité : seule la dernière écoulée est réclamée.
  const derniere = periodeDepuisId(dernierePeriodeDeclaree);
  if ((!derniere || derniere.type !== type) &&
    id !== dernierePeriodeEchue(periodiciteUrssaf, dateLocale(aujourdHui))?.id) {
    return 'ecoulee';
  }
  return aujourdHui > echeanceDeclaration(annee, type, valeur) ? 'en-retard' : 'a-declarer';
}

const decrire = (periode, etat) => ({
  ...periode,
  id: idPeriode(periode.annee, periode.type, periode.valeur),
  etat,
  echeance: echeanceDeclaration(periode.annee, periode.type, periode.valeur)
});

/**
 * La période dont la déclaration est à faire (la plus ancienne due), ou la
 * période en cours si tout est à jour. `null` sans périodicité choisie.
 *
 * @returns {{ annee: number, type: string, valeur: number, id: string, etat: string, echeance: string }|null}
 */
export function periodeATraiter(parametres, aujourdHui = aujourdHuiIso()) {
  const type = parametres.periodiciteUrssaf;
  if (type !== 'mois' && type !== 'trimestre') return null;
  const mois = Number(aujourdHui.slice(5, 7));
  const courante = { annee: Number(aujourdHui.slice(0, 4)), type, valeur: type === 'mois' ? mois : trimestreDe(mois) };

  const derniere = periodeDepuisId(parametres.dernierePeriodeDeclaree);
  let candidate = derniere?.type === type
    ? periodeSuivante(derniere)
    : periodeDepuisId(dernierePeriodeEchue(type, dateLocale(aujourdHui)).id);
  // Borné : une dernière déclaration très ancienne ne fait pas tourner sans fin.
  for (let garde = 0; garde < 60 && debutPeriode(candidate) < debutPeriode(courante); garde += 1) {
    const etat = etatPeriode(candidate, parametres, aujourdHui);
    if (etat === 'a-declarer' || etat === 'en-retard') return decrire(candidate, etat);
    candidate = periodeSuivante(candidate);
  }
  return decrire(courante, 'en-cours');
}

/** Texte de la pastille du menu : une déclaration échue et non faite, où qu'on soit. */
export function alerteUrssaf(parametres, aujourdHui = aujourdHuiIso()) {
  const periode = periodeATraiter(parametres, aujourdHui);
  if (periode?.etat === 'en-retard') return 'En retard';
  if (periode?.etat === 'a-declarer') return 'À faire';
  return '';
}

/** Nombre de jours entre deux dates ISO (b - a). */
export const joursEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
