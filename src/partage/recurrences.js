/**
 * Recettes qui reviennent chaque mois (un abonnement, une maintenance) : même
 * client, même libellé, même montant, encaissées les trois mois qui précèdent.
 * Le tableau de bord propose d'ajouter celle du mois en cours, une fois venu
 * le jour où elle arrive d'habitude ; rien n'est ajouté sans l'accord de
 * l'utilisateur, qui peut aussi demander qu'on ne la propose plus.
 *
 * Module partagé serveur / navigateur, sans dépendance.
 */

import { normaliserTexte } from './texte.js';
import { enCentimes } from './montants.js';
import { anneeDe, moisDe, joursDuMois } from './dates.js';

/** Trois mois de suite : assez pour y voir une habitude, pas un hasard. */
const MOIS_DE_SUITE = 3;

/**
 * Identité d'une série : client, libellé et montant, sans casse ni accents.
 * C'est elle que retient « Ne plus proposer ».
 */
export const cleRecurrence = (r) =>
  [normaliserTexte(r.client), normaliserTexte(r.libelle), enCentimes(r.montant)].join('|');

/** Rang d'un mois, pour compter d'un mois à l'autre par-dessus les années. */
const rangMois = (iso) => anneeDe(iso) * 12 + moisDe(iso) - 1;

/**
 * Les recettes à renouveler ce mois-ci, la plus ancienne habitude d'abord.
 *
 * @param {object[]} recettes le livre entier.
 * @param {object} options
 * @param {string} options.aujourdhui date ISO du jour.
 * @param {string[]} [options.ecartees] clés des séries à ne plus proposer.
 * @returns {{ cle: string, derniere: object }[]} `derniere` : la plus récente
 *   de la série, modèle de la nouvelle.
 */
export function recettesARenouveler(recettes, { aujourdhui, ecartees = [] }) {
  const courant = rangMois(aujourdhui);
  const jour = Number(aujourdhui.slice(8, 10));
  const dernierJour = joursDuMois(anneeDe(aujourdhui), moisDe(aujourdhui));
  const ignorees = new Set(ecartees);

  // Déjà saisie ce mois-ci, même à un autre montant (un tarif qui change, une
  // remise) : la série n'a plus rien à proposer.
  const clientEtLibelle = (r) => `${normaliserTexte(r.client)}|${normaliserTexte(r.libelle)}`;
  const ceMois = new Set(recettes.filter((r) => rangMois(r.dateEncaissement) === courant).map(clientEtLibelle));

  const series = new Map();
  for (const r of recettes) {
    // Sans libellé, rien ne dit ce qui revient.
    if (!String(r.libelle ?? '').trim()) continue;
    const cle = cleRecurrence(r);
    if (!series.has(cle)) series.set(cle, []);
    series.get(cle).push(r);
  }

  const aRenouveler = [];
  for (const [cle, lignes] of series) {
    // Écartée, ou déjà encaissée ce mois-ci : rien à proposer.
    if (ignorees.has(cle) || ceMois.has(clientEtLibelle(lignes[0]))) continue;
    // Seuls les mois passés font l'habitude : une recette déjà saisie pour un
    // mois à venir n'avance pas la proposition.
    const passees = lignes.filter((r) => rangMois(r.dateEncaissement) < courant);
    const mois = new Set(passees.map((r) => rangMois(r.dateEncaissement)));
    if (!Array.from({ length: MOIS_DE_SUITE }, (_, k) => courant - 1 - k).every((m) => mois.has(m))) continue;
    // Pas avant le jour où elle arrive d'habitude (le plus tôt des trois
    // derniers mois), ramené au dernier jour d'un mois plus court.
    const recentes = passees.filter((r) => rangMois(r.dateEncaissement) >= courant - MOIS_DE_SUITE);
    const jourHabituel = Math.min(...recentes.map((r) => Number(r.dateEncaissement.slice(8, 10))));
    if (jour < Math.min(jourHabituel, dernierJour)) continue;
    const derniere = passees.reduce((a, b) => (b.dateEncaissement > a.dateEncaissement ? b : a));
    aRenouveler.push({ cle, derniere });
  }
  return aRenouveler.sort((a, b) => a.derniere.dateEncaissement.localeCompare(b.derniere.dateEncaissement));
}
