/**
 * ACRE (aide à la création ou à la reprise d'entreprise) : taux de
 * cotisations sociales réduit en début d'activité.
 *
 * Trois règles, toutes du code de la sécurité sociale (articles L131-6-4,
 * D131-6-3) et vérifiées sur les règles du simulateur de l'URSSAF :
 *  - la période court du début d'activité à la fin du 3e trimestre civil qui
 *    suit (début le 3 septembre 2026 : jusqu'au 30 juin 2027) ;
 *  - le taux réduit est une part du taux normal, qui dépend de la date de
 *    création (`FRACTIONS_ACRE`), arrondie au dixième de point supérieur ;
 *  - il ne descend pas sous le plancher du palier, s'il en a un (CIPAV).
 *
 * Seules les cotisations sociales sont réduites : la formation
 * professionnelle et le versement libératoire restent dus en entier.
 *
 * Module pur, partagé : le serveur l'applique à l'estimation, les paramètres
 * s'en servent pour annoncer la fin de la période.
 */

import { FRACTIONS_ACRE } from './bareme-seuils.js';
import { estDateIso } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');

/** Dernier jour du 3e trimestre civil qui suit celui du début d'activité. */
export function finAcre(debutActivite) {
  const annee = Number(debutActivite.slice(0, 4));
  const trimestre = Math.floor((Number(debutActivite.slice(5, 7)) - 1) / 3); // 0 à 3
  const cible = trimestre + 3;
  const anneeFin = annee + Math.floor(cible / 4);
  const moisFin = (cible % 4) * 3 + 3;
  const jourFin = new Date(anneeFin, moisFin, 0).getDate();
  return `${anneeFin}-${pad(moisFin)}-${pad(jourFin)}`;
}

/**
 * Part du taux normal payée, en pourcentage, selon la date de création ou de
 * reprise ; `null` avant la plus ancienne règle connue.
 */
export function fractionAcre(debutActivite) {
  return FRACTIONS_ACRE.find((f) => debutActivite >= f.creeDepuis)?.fraction ?? null;
}

/**
 * Période d'ACRE déclarée dans les paramètres : `{ debut, fin, fraction }`,
 * ou `null` si l'option n'est pas cochée, si la date manque, ou si elle
 * précède les règles connues.
 */
export function periodeAcre({ acre = false, debutActivite = '' } = {}) {
  if (!acre || !estDateIso(debutActivite)) return null;
  const fraction = fractionAcre(debutActivite);
  if (fraction === null) return null;
  return { debut: debutActivite, fin: finAcre(debutActivite), fraction };
}

/** Un encaissement de cette date tombe-t-il dans la période d'ACRE ? */
export function sousAcre(date, periode) {
  return periode !== null && date >= periode.debut && date <= periode.fin;
}

/**
 * Taux réduit, en pourcentage : la part du taux normal, arrondie au dixième
 * de point supérieur, sans descendre sous le plancher. Le calcul passe par
 * des entiers (centièmes de point) pour qu'un résultat pile sur un dixième ne
 * soit pas poussé au suivant par l'imprécision des nombres à virgule.
 *
 * @param {number} tauxNormal taux de cotisations sociales, en pourcentage.
 * @param {number} fraction part payée, en pourcentage (50, 75).
 * @param {number} [plancher] taux minimal, en pourcentage.
 */
export function tauxAcre(tauxNormal, fraction, plancher = 0) {
  const dixiemes = Math.ceil((Math.round(tauxNormal * 100) * fraction) / 1000);
  return Math.max(dixiemes / 10, plancher);
}
