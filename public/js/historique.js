/**
 * Historique Annuler / Rétablir des actions sur les registres.
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
 * @returns {object} l'action enregistrée, à passer à `annulerAction`.
 */
export function enregistrerAction(action) {
  pileAnnulation.push(action);
  if (pileAnnulation.length > LIMITE) pileAnnulation.shift();
  // Toute nouvelle action invalide la branche « rétablir ».
  pileRetablissement.length = 0;
  return action;
}

/**
 * Annule une action précise, depuis le « Annuler » posé là où elle a eu lieu
 * (une ligne, la barre de sélection).
 *
 * La dernière action s'annule comme au clavier, et peut donc se rétablir.
 * Une action plus ancienne s'annule seule : chaque retour sur place porte sur
 * ses propres lignes, qu'aucune action suivante n'a touchées (une ligne
 * retouchée perd son ancien retour). Elle quitte alors l'historique.
 *
 * @returns {Promise<boolean>} faux si l'action n'est plus dans l'historique
 *   (déjà annulée au clavier, ou trop ancienne).
 */
export async function annulerAction(action) {
  const rang = pileAnnulation.lastIndexOf(action);
  if (rang === -1) return false;
  if (rang === pileAnnulation.length - 1) return annuler();
  await action.annuler();
  pileAnnulation.splice(rang, 1);
  return true;
}

/**
 * Vrai si l'action peut encore s'annuler. Après un Ctrl+Z, un « Annuler » posé
 * sur place pour une action qui ne l'est plus doit disparaître.
 */
export const estAnnulable = (action) => pileAnnulation.includes(action);

/**
 * Rejoue l'action du sommet de `depuis` et la passe sur `vers`. Retirée avant
 * d'être rejouée (deux Ctrl+Z rapides visent deux actions distinctes), elle
 * reprend sa place si le serveur refuse : elle reste à refaire, pas perdue.
 */
async function rejouer(depuis, vers, sens) {
  const action = depuis.pop();
  if (!action) return false;
  try {
    await action[sens]();
  } catch (erreur) {
    depuis.push(action);
    throw erreur;
  }
  vers.push(action);
  return true;
}

/** Annule la dernière action. Retourne `false` s'il n'y a rien à annuler. */
export const annuler = () => rejouer(pileAnnulation, pileRetablissement, 'annuler');

/** Rétablit la dernière action annulée. Retourne `false` s'il n'y a rien à rétablir. */
export const retablir = () => rejouer(pileRetablissement, pileAnnulation, 'retablir');
