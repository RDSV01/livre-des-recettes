/**
 * Utilitaires texte partagés serveur / navigateur.
 */

/**
 * Normalise un texte pour la recherche et les comparaisons :
 * minuscules, accents supprimés, espaces réduits.
 * `"  Boulangerie Dupré "` devient `"boulangerie dupre"`.
 */
export function normaliserTexte(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
