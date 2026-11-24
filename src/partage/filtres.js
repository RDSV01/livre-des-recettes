/**
 * Filtrage et recherche dans les registres, côté navigateur.
 *
 * Les vues « Recettes » et « Achats » chargent leur liste complète une seule
 * fois puis filtrent en mémoire : aucune requête au serveur à chaque frappe.
 * Le volume d'un registre (quelques milliers de lignes) le permet largement.
 *
 * Module partagé serveur / navigateur : aucune dépendance.
 */

import { normaliserTexte } from './texte.js';
import { analyserMontant, enCentimes } from './montants.js';
import { anneeDe, moisDe } from './dates.js';

/**
 * La recherche libre, préparée une fois pour toute la liste : on cherche
 * dans les champs texte indiqués (sans tenir compte de la casse ni des
 * accents) ; si la saisie ressemble à un montant, aussi l'égalité exacte.
 */
function rechercheLibre(recherche, clesTexte) {
  const aiguille = normaliserTexte(recherche);
  const montant = analyserMontant(recherche);
  const centimes = montant === null ? null : enCentimes(montant);
  return (element) => clesTexte.map((cle) => normaliserTexte(element[cle])).join(' | ').includes(aiguille)
    || (centimes !== null && centimes === enCentimes(element.montant));
}

/**
 * Cœur commun aux deux registres : période, mode de règlement, pièce jointe
 * (« avec » ou « sans » PDF) et recherche libre. `cleDate` et `clesTexte`
 * décrivent la forme des lignes filtrées.
 */
function filtrerElements(elements, { annee, mois, mode, piece, q } = {}, { cleDate, clesTexte }) {
  const anneeN = Number(annee) || null;
  const moisN = Number(mois) || null;
  const recherche = String(q ?? '').trim();
  const correspondRecherche = recherche ? rechercheLibre(recherche, clesTexte) : null;

  return elements.filter((element) => {
    const date = element[cleDate];
    if (anneeN && anneeDe(date) !== anneeN) return false;
    if (moisN && moisDe(date) !== moisN) return false;
    if (mode && element.modeReglement !== mode) return false;
    if (piece && (piece === 'avec') !== Boolean(element.pieceJointe)) return false;
    if (correspondRecherche && !correspondRecherche(element)) return false;
    return true;
  });
}

/**
 * Filtre une liste de recettes. Chaque critère est facultatif :
 *  - `annee`, `mois` : nombres ou chaînes issues d'un `<select>` ;
 *  - `mode` : code d'un mode de règlement ;
 *  - `piece` : « avec » ou « sans » PDF joint ;
 *  - `categorie` : « ventes », « prestations », ou « aucune » pour les
 *    recettes non catégorisées ;
 *  - `q` : recherche libre (client, libellé, numéro de facture, montant).
 */
export function filtrerRecettes(recettes, criteres = {}) {
  const filtrees = filtrerElements(recettes, criteres, {
    cleDate: 'dateEncaissement',
    clesTexte: ['client', 'libelle', 'numeroFacture']
  });
  const { categorie } = criteres;
  if (!categorie) return filtrees;
  return filtrees.filter((r) => (categorie === 'aucune' ? !r.categorie : r.categorie === categorie));
}

/**
 * Filtre une liste d'achats : mêmes critères de période, de mode de paiement
 * et de recherche libre (fournisseur, référence de la pièce, montant).
 */
export function filtrerAchats(achats, criteres = {}) {
  return filtrerElements(achats, criteres, {
    cleDate: 'dateReglement',
    clesTexte: ['fournisseur', 'referenceFacture']
  });
}
