/**
 * Briques communes aux documents PDF : palette et assainissement du texte.
 *
 * Deux générateurs les partagent : les registres légaux (`pdf.js`) et le
 * rapport annuel de gestion (`rapport-pdf.js`). Les couleurs vivent ici pour
 * que les deux documents se ressemblent, y compris après retouche.
 */

const MARGE = 40;

/** Palette : reprend les tons de l'interface, en version imprimable. */
const COULEURS = {
  texte: '#1c2333',
  secondaire: '#6b7280',
  accent: '#2563eb',
  fondEntete: '#e9edf5',
  fondTotal: '#f3f5fa',
  bordure: '#d7dbe4',
  // Langage de couleur des activités, identique à l'interface : bleu pour la
  // vente, vert pour la prestation, gris pour le non catégorisé.
  vente: '#2563eb',
  prestation: '#16a34a',
  neutre: '#6b7280'
};

/**
 * Espaces produits par `Intl.NumberFormat` (« 1 500,00 € ») que l'encodage
 * WinAnsi des polices standard ne connaît pas : insécable étroite, insécable,
 * fine, tabulaire.
 *
 * Ils sont écrits en séquences d'échappement et non en caractères, qui sont
 * invisibles à la relecture : remplacés un jour par de simples espaces, un
 * montant s'imprimerait « 1/500,00 € » (PDFKit ne garde alors que l'octet de
 * poids faible de U+202F, qui est celui de « / »).
 */
const ESPACES_HORS_WINANSI = /[\u202F\u00A0\u2009\u2007]/g;

/** Remplace les caractères hors encodage WinAnsi par des équivalents sûrs. */
export function texteSur(texte) {
  return String(texte ?? '').replace(ESPACES_HORS_WINANSI, ' ');
}

export { MARGE, COULEURS };
