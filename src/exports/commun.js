/**
 * Briques communes aux documents exportés : palette, identité de
 * l'entreprise, et pour les PDF, création du document, assainissement du
 * texte et numérotation des pages.
 *
 * Trois générateurs les partagent : les registres légaux en PDF (`pdf.js`) et
 * en Excel (`xlsx.js`), et le rapport annuel de gestion (`rapport-pdf.js`).
 * Les couleurs vivent ici pour que les documents se ressemblent, y compris
 * après retouche.
 */

import PDFDocument from 'pdfkit';

export const MARGE = 40;

/** Palette : reprend les tons de l'interface, en version imprimable. */
export const COULEURS = {
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
 * Identité de l'entreprise telle qu'elle figure sous son nom en tête des
 * documents : SIREN, SIRET, adresse et activité, pour celles renseignées.
 */
export function identiteEntreprise(parametres) {
  return [
    parametres.siren && `SIREN ${parametres.siren}`,
    parametres.siret && `SIRET ${parametres.siret}`,
    parametres.adresse,
    parametres.activite
  ].filter(Boolean);
}

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
const ESPACES_HORS_WINANSI = /[    ]/g;

/** Remplace les caractères hors encodage WinAnsi par des équivalents sûrs. */
export function texteSur(texte) {
  return String(texte ?? '').replace(ESPACES_HORS_WINANSI, ' ');
}

/**
 * Document PDF A4 branché sur son flux de sortie. Les pages restent en
 * mémoire (`bufferPages`) pour être numérotées une fois leur nombre connu.
 */
export function creerDocumentPdf(flux, { titre, parametres, paysage = false }) {
  const doc = new PDFDocument({
    size: 'A4',
    ...(paysage ? { layout: 'landscape' } : {}),
    margin: MARGE,
    bufferPages: true,
    info: { Title: titre, Author: parametres.nomEntreprise || 'Livre des recettes' }
  });
  doc.pipe(flux);
  return doc;
}

/**
 * Pied de chaque page : « Page 3 / 7 » à droite, et une mention facultative
 * à gauche. À appeler une fois tout le contenu écrit.
 */
export function numeroterPages(doc, { largeur, mention = '' }) {
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    // Écrire sous la marge basse déclencherait l'ajout d'une page : on la
    // neutralise le temps d'écrire le pied.
    const margeBasse = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGE + 8;
    doc.font('Helvetica').fontSize(8).fillColor(COULEURS.secondaire);
    if (mention) doc.text(texteSur(mention), MARGE, y, { width: largeur, align: 'left', lineBreak: false });
    doc.text(`Page ${i + 1} / ${pages.count}`, MARGE, y, { width: largeur, align: 'right', lineBreak: false });
    doc.page.margins.bottom = margeBasse;
  }
}
