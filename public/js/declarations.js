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
