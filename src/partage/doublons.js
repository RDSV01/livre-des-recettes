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
 * Ce qui doit coïncider à coup sûr entre deux doublons. La référence, elle,
 * ne les départage que si les deux en portent une : elle reste donc hors de
 * la clé, et se vérifie ensuite.
 */
function cleOperation(ligne, { cleDate, cleTiers }) {
  return `${ligne[cleDate]}|${enCentimes(ligne.montant)}|${normaliserTexte(ligne[cleTiers])}`;
}

/**
 * Compte les lignes d'un registre qui font double emploi avec une précédente.
 *
 * Comparer chaque ligne à toutes celles d'avant coûterait le carré de leur
 * nombre : sur un registre de plusieurs milliers d'écritures, la vérification
 * avant export se faisait attendre plusieurs secondes. Les lignes sont donc
 * d'abord rangées par date, montant et tiers ; seules celles d'un même paquet,
 * rarement plus de deux ou trois, sont ensuite comparées pour de bon.
 */
function compter(lignes, config) {
  const paquets = new Map();
  let total = 0;
  for (const ligne of lignes) {
    const cle = cleOperation(ligne, config);
    const paquet = paquets.get(cle);
    if (!paquet) {
      paquets.set(cle, [ligne]);
      continue;
    }
    if (paquet.some((autre) => memeOperation(ligne, autre, config))) total += 1;
    paquet.push(ligne);
  }
  return total;
}

/** Nombre de recettes faisant double emploi au sein d'une même liste. */
export const compterDoublonsRecettes = (recettes) => compter(recettes, RECETTES);

/** Nombre d'achats faisant double emploi au sein d'une même liste. */
export const compterDoublonsAchats = (achats) => compter(achats, ACHATS);

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
