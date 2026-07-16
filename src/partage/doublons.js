/**
 * Détection de doublons et de recettes similaires.
 *
 * Module partagé serveur / navigateur : le serveur s'en sert pour l'import
 * (rejet des doublons), le navigateur pour avertir au moment de la saisie.
 */

import { normaliserTexte } from './texte.js';
import { enCentimes } from './montants.js';

/**
 * Deux recettes sont considérées comme un même encaissement si elles ont la
 * même date, le même montant et le même client (comparaison insensible à la
 * casse et aux accents). Si les deux portent un numéro de facture, il doit
 * aussi coïncider : deux factures distinctes de même montant le même jour ne
 * sont pas des doublons.
 */
function memeEncaissement(a, b) {
  const factureA = normaliserTexte(a.numeroFacture);
  const factureB = normaliserTexte(b.numeroFacture);
  return a.dateEncaissement === b.dateEncaissement &&
    enCentimes(a.montant) === enCentimes(b.montant) &&
    normaliserTexte(a.client) === normaliserTexte(b.client) &&
    (!factureA || !factureB || factureA === factureB);
}

/** Vrai si `recette` est un doublon d'une des recettes `existantes`. */
export function estDoublon(recette, existantes) {
  return existantes.some((autre) => memeEncaissement(recette, autre));
}

/**
 * Cherche une recette « très similaire » parmi `existantes` : soit un doublon
 * au sens strict, soit une recette portant le même numéro de facture.
 * Retourne la recette trouvée, ou `null`.
 */
export function chercherSimilaire(recette, existantes) {
  const facture = normaliserTexte(recette.numeroFacture);
  return existantes.find((autre) =>
    memeEncaissement(recette, autre) ||
    (facture !== '' && normaliserTexte(autre.numeroFacture) === facture)
  ) ?? null;
}
