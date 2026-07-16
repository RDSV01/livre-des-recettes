/**
 * Historique Annuler / Rétablir des actions sur les recettes.
 *
 * Chaque action enregistrée fournit deux fonctions inverses (`annuler`,
 * `retablir`) qui rejouent l'opération via l'API. L'historique vit uniquement
 * en mémoire (perdu au rechargement, c'est voulu) et se limite aux
 * `LIMITE` dernières actions.
 */

const LIMITE = 50;

const pileAnnulation = [];
const pileRetablissement = [];

/**
 * Enregistre une action qui vient d'être effectuée.
 * @param {{ annuler: () => Promise<void>, retablir: () => Promise<void> }} action
 */
export function enregistrerAction(action) {
  pileAnnulation.push(action);
  if (pileAnnulation.length > LIMITE) pileAnnulation.shift();
  // Toute nouvelle action invalide la branche « rétablir ».
  pileRetablissement.length = 0;
}

/** Annule la dernière action. Retourne `false` s'il n'y a rien à annuler. */
export async function annuler() {
  const action = pileAnnulation.pop();
  if (!action) return false;
  await action.annuler();
  pileRetablissement.push(action);
  return true;
}

/** Rétablit la dernière action annulée. Retourne `false` s'il n'y a rien à rétablir. */
export async function retablir() {
  const action = pileRetablissement.pop();
  if (!action) return false;
  await action.retablir();
  pileAnnulation.push(action);
  return true;
}
