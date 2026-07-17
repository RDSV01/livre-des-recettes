/**
 * Filtrage et recherche dans les recettes, côté navigateur.
 *
 * La vue « Recettes » charge la liste complète une seule fois puis filtre en
 * mémoire : aucune requête au serveur à chaque frappe. Le volume d'un livre
 * des recettes (quelques milliers de lignes) le permet largement.
 *
 * Module partagé serveur / navigateur : aucune dépendance.
 */

import { normaliserTexte } from './texte.js';
import { analyserMontant, enCentimes } from './montants.js';
import { anneeDe, moisDe } from './dates.js';

/**
 * Une recette correspond-elle à la recherche libre ?
 * On cherche dans le client, le libellé et le numéro de facture (sans tenir
 * compte de la casse ni des accents) ; si la saisie ressemble à un montant,
 * on cherche aussi l'égalité exacte du montant.
 */
function correspondRecherche(recette, recherche) {
  const aiguille = normaliserTexte(recherche);
  const botteDeFoin = [recette.client, recette.libelle, recette.numeroFacture]
    .map(normaliserTexte)
    .join(' | ');
  if (botteDeFoin.includes(aiguille)) return true;

  const montant = analyserMontant(recherche);
  return montant !== null && enCentimes(montant) === enCentimes(recette.montant);
}

/**
 * Filtre une liste de recettes. Chaque critère est facultatif :
 *  - `annee`, `mois` : nombres ou chaînes issues d'un `<select>` ;
 *  - `mode` : code d'un mode de règlement ;
 *  - `categorie` : « ventes », « prestations », ou « aucune » pour les
 *    recettes non catégorisées ;
 *  - `q` : recherche libre.
 */
export function filtrerRecettes(recettes, { annee, mois, mode, categorie, q } = {}) {
  const anneeN = Number(annee) || null;
  const moisN = Number(mois) || null;
  const recherche = String(q ?? '').trim();

  return recettes.filter((r) => {
    if (anneeN && anneeDe(r.dateEncaissement) !== anneeN) return false;
    if (moisN && moisDe(r.dateEncaissement) !== moisN) return false;
    if (mode && r.modeReglement !== mode) return false;
    if (categorie === 'aucune') {
      if (r.categorie) return false;
    } else if (categorie && r.categorie !== categorie) {
      return false;
    }
    if (recherche && !correspondRecherche(r, recherche)) return false;
    return true;
  });
}

/**
 * Libellés déjà utilisés, pour l'auto-complétion à la saisie : sans doublon
 * (insensible à la casse), du plus fréquent au moins fréquent puis par ordre
 * alphabétique.
 */
export function libellesFrequents(recettes) {
  const frequences = new Map();
  for (const recette of recettes) {
    const libelle = String(recette.libelle ?? '').trim();
    if (!libelle) continue;
    const cle = normaliserTexte(libelle);
    const entree = frequences.get(cle) ?? { libelle, total: 0 };
    entree.total += 1;
    frequences.set(cle, entree);
  }
  return [...frequences.values()]
    .sort((a, b) => b.total - a.total || a.libelle.localeCompare(b.libelle, 'fr'))
    .map((e) => e.libelle);
}
