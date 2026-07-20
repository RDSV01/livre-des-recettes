/**
 * Détection de doublons et de recettes similaires.
 *
 * Module partagé serveur / navigateur : le serveur s'en sert pour l'import
 * (rejet des doublons), le navigateur pour avertir au moment de la saisie.
 */

import { normaliserTexte } from './texte.js';
import { enCentimes } from './montants.js';

/**
 * Description d'un registre pour la comparaison : quelle date fait foi, quel
 * tiers (client d'une recette, fournisseur d'un achat) et quelle référence
 * (numéro de facture, référence de la pièce).
 */
const RECETTES = { cleDate: 'dateEncaissement', cleTiers: 'client', cleReference: 'numeroFacture' };
const ACHATS = { cleDate: 'dateReglement', cleTiers: 'fournisseur', cleReference: 'referenceFacture' };

/**
 * Deux lignes d'un même registre désignent la même opération si elles ont la
 * même date, le même montant et le même tiers (comparaison insensible à la
 * casse et aux accents). Si les deux portent une référence, elle doit aussi
 * coïncider : deux pièces distinctes de même montant le même jour ne sont pas
 * des doublons.
 */
function memeOperation(a, b, { cleDate, cleTiers, cleReference }) {
  const refA = normaliserTexte(a[cleReference]);
  const refB = normaliserTexte(b[cleReference]);
  return a[cleDate] === b[cleDate] &&
    enCentimes(a.montant) === enCentimes(b.montant) &&
    normaliserTexte(a[cleTiers]) === normaliserTexte(b[cleTiers]) &&
    (!refA || !refB || refA === refB);
}

/** Vrai si `recette` est un doublon d'une des recettes `existantes`. */
export function estDoublon(recette, existantes) {
  return existantes.some((autre) => memeOperation(recette, autre, RECETTES));
}

/** Vrai si `achat` est un doublon d'un des achats `existants`. */
export function estDoublonAchat(achat, existants) {
  return existants.some((autre) => memeOperation(achat, autre, ACHATS));
}

/**
 * Cherche une recette « très similaire » parmi `existantes` : soit un doublon
 * au sens strict, soit une recette portant le même numéro de facture.
 * Retourne la recette trouvée, ou `null`.
 */
export function chercherSimilaire(recette, existantes) {
  const facture = normaliserTexte(recette.numeroFacture);
  return existantes.find((autre) =>
    memeOperation(recette, autre, RECETTES) ||
    (facture !== '' && normaliserTexte(autre.numeroFacture) === facture)
  ) ?? null;
}
