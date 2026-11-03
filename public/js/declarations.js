/**
 * Pastille d'état d'une période de déclaration URSSAF. Le calcul de l'état
 * lui-même est partagé avec le serveur (`/partage/declarations.js`).
 */

import { icone } from './icones.js';

/** Apparence de chaque état : libellé, classe de la pastille, icône. */
const ETATS = {
  declaree: ['Déclarée', 'etat-ok', 'coche'],
  'en-retard': ['En retard', 'etat-retard', 'triangle-alerte'],
  'a-declarer': ['À déclarer', 'etat-attention', 'echeance'],
  'en-cours': ['En cours', 'etat-attente', 'cercle-point'],
  'a-venir': ['À venir', 'etat-avenir', 'horloge'],
  ecoulee: ['Écoulée', 'etat-avenir', 'calendrier']
};

/** Pastille d'état d'une période. */
export function pastilleEtat(etatPeriode) {
  const [texte, classe, nomIcone] = ETATS[etatPeriode];
  return `<span class="etat ${classe}">${icone(nomIcone, { taille: 13 })}${texte}</span>`;
}

/**
 * Une période sans chiffre d'affaires, dite en mots plutôt qu'en une rangée
 * de « 0 € » (à déclarer, prélevé, reste). La déclaration reste due :
 * l'URSSAF attend un chiffre d'affaires nul, déclaré dans les délais.
 *
 * @param {string|null} etatPeriode état de la période ; `null` pour une année entière.
 * @returns {{ titre: string, texte: string }}
 */
export function sansChiffreAffaires(etatPeriode) {
  const aDeclarer = ['Aucun chiffre d’affaires sur cette période',
    'La déclaration reste obligatoire : indiquez 0 sur le site de l’URSSAF. Rien ne sera prélevé.'];
  const enAttente = ['Aucun encaissement pour l’instant',
    'Le montant à déclarer apparaîtra avec la première recette de la période.'];
  const [titre, texte] = {
    'a-declarer': aDeclarer,
    'en-retard': aDeclarer,
    'en-cours': enAttente,
    'a-venir': enAttente,
    declaree: ['Déclarée sans chiffre d’affaires', 'Rien n’a été prélevé sur cette période.'],
    ecoulee: ['Aucun encaissement sur cette période', '']
  }[etatPeriode] ?? ['Aucun encaissement sur l’année', ''];
  return { titre, texte };
}

/** Le bloc d'une période sans chiffre d'affaires, à la place des montants. */
export function blocSansChiffreAffaires(etatPeriode) {
  const { titre, texte } = sansChiffreAffaires(etatPeriode);
  return `<div class="sans-chiffre-affaires">${icone('info', { taille: 18 })}
      <div><strong>${titre}</strong>${texte ? `<p>${texte}</p>` : ''}</div>
    </div>`;
}
