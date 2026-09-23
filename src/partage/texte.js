/**
 * Utilitaires texte partagés serveur / navigateur.
 */

/** « juillet 2026 » devient « Juillet 2026 ». */
export function majusculeInitiale(texte) {
  const t = String(texte ?? '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

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
