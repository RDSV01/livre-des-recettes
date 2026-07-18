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
 * Une ligne correspond-elle à la recherche libre ?
 * On cherche dans les champs texte indiqués (sans tenir compte de la casse ni
 * des accents) ; si la saisie ressemble à un montant, on cherche aussi
 * l'égalité exacte du montant.
 */
function correspondRecherche(element, recherche, clesTexte) {
  const aiguille = normaliserTexte(recherche);
  const botteDeFoin = clesTexte
    .map((cle) => normaliserTexte(element[cle]))
    .join(' | ');
  if (botteDeFoin.includes(aiguille)) return true;

  const montant = analyserMontant(recherche);
  return montant !== null && enCentimes(montant) === enCentimes(element.montant);
}

/**
 * Cœur commun aux deux registres : période, mode de règlement et recherche
 * libre. `cleDate` et `clesTexte` décrivent la forme des lignes filtrées.
 */
function filtrerElements(elements, { annee, mois, mode, q } = {}, { cleDate, clesTexte }) {
  const anneeN = Number(annee) || null;
  const moisN = Number(mois) || null;
  const recherche = String(q ?? '').trim();

  return elements.filter((element) => {
    const date = element[cleDate];
    if (anneeN && anneeDe(date) !== anneeN) return false;
    if (moisN && moisDe(date) !== moisN) return false;
    if (mode && element.modeReglement !== mode) return false;
    if (recherche && !correspondRecherche(element, recherche, clesTexte)) return false;
    return true;
  });
}

/**
 * Filtre une liste de recettes. Chaque critère est facultatif :
 *  - `annee`, `mois` : nombres ou chaînes issues d'un `<select>` ;
 *  - `mode` : code d'un mode de règlement ;
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

/**
 * Valeurs déjà saisies pour un champ (libellé d'une recette, fournisseur d'un
 * achat), pour l'auto-complétion : sans doublon (insensible à la casse), du
 * plus fréquent au moins fréquent puis par ordre alphabétique.
 */
export function valeursFrequentes(elements, champ) {
  const frequences = new Map();
  for (const element of elements) {
    const valeur = String(element[champ] ?? '').trim();
    if (!valeur) continue;
    const cle = normaliserTexte(valeur);
    const entree = frequences.get(cle) ?? { valeur, total: 0 };
    entree.total += 1;
    frequences.set(cle, entree);
  }
  return [...frequences.values()]
    .sort((a, b) => b.total - a.total || a.valeur.localeCompare(b.valeur, 'fr'))
    .map((e) => e.valeur);
}
