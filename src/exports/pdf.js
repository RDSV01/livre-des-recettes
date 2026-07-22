/**
 * Export PDF d'un registre (recettes ou achats), généré avec PDFKit.
 *
 * Mise en page : A4 paysage, en-tête d'identité sur la première page,
 * tableau avec en-tête répété à chaque saut de page, totaux mensuels et
 * annuel en gras sur fond grisé, numérotation des pages.
 *
 * Les polices standard du PDF (Helvetica) utilisent l'encodage WinAnsi : les
 * espaces insécables produits par `Intl.NumberFormat` (U+202F, U+00A0) doivent
 * être remplacés avant écriture, d'où le passage systématique par `texteSur`
 * (voir `pdf-commun.js`, partagé avec le rapport annuel).
 */

import PDFDocument from 'pdfkit';
import { formaterDate } from '../partage/dates.js';
import { formaterMontant } from '../partage/montants.js';
import { texteSur, MARGE, COULEURS } from './pdf-commun.js';

const TAILLE_TEXTE = 9;
const REMPLISSAGE_CELLULE = 5;
const COULEUR_TEXTE = COULEURS.texte;
const COULEUR_SECONDAIRE = COULEURS.secondaire;
const COULEUR_FOND_ENTETE = COULEURS.fondEntete;
const COULEUR_FOND_TOTAL = COULEURS.fondTotal;
const COULEUR_BORDURE = COULEURS.bordure;

/**
 * Écrit le registre en PDF dans le flux donné (réponse HTTP ou fichier).
 * Le flux est clôturé par PDFKit à la fin de la génération.
 */
export function genererPdf(registre, parametres, flux) {
  const COLONNES = registre.colonnes;
  const LARGEUR_TABLEAU = COLONNES.reduce((acc, c) => acc + c.largeurPdf, 0);
  const INDEX_MONTANT = COLONNES.findIndex((c) => c.montant);
  // Le libellé d'un total s'étale sur les colonnes qui précèdent le montant.
  const DEBUT_MONTANT = COLONNES.slice(0, INDEX_MONTANT).reduce((acc, c) => acc + c.largeurPdf, 0);

  const titreComplet = `${registre.titreDocument} - ${registre.titrePeriode}`;
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: MARGE,
    bufferPages: true,
    info: { Title: titreComplet, Author: parametres.nomEntreprise || 'Livre des recettes' }
  });
  doc.pipe(flux);

  const basDePage = () => doc.page.height - MARGE - 15;
  const largeurCellule = (colonne) => colonne.largeurPdf - REMPLISSAGE_CELLULE * 2;
  const alignement = (colonne) => (colonne.montant ? 'right' : 'left');

  function enTeteDocument() {
    if (parametres.nomEntreprise) {
      doc.font('Helvetica-Bold').fontSize(15).fillColor(COULEUR_TEXTE)
        .text(texteSur(parametres.nomEntreprise), MARGE, MARGE);
    }
    const identite = [
      parametres.siren && `SIREN ${parametres.siren}`,
      parametres.siret && `SIRET ${parametres.siret}`,
      parametres.adresse,
      parametres.activite
    ].filter(Boolean).join('  ·  ');
    if (identite) {
      doc.font('Helvetica').fontSize(9).fillColor(COULEUR_SECONDAIRE)
        .text(texteSur(identite), { width: LARGEUR_TABLEAU });
    }
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COULEUR_TEXTE).text(titreComplet);
    const sousTitre = `Édité le ${formaterDate(new Date().toISOString().slice(0, 10), parametres.formatDate)}` +
      `  ·  ${registre.resume}` +
      `  ·  total ${texteSur(formaterMontant(registre.total, parametres.devise))}`;
    doc.font('Helvetica').fontSize(9).fillColor(COULEUR_SECONDAIRE).text(texteSur(sousTitre));
    doc.moveDown(0.8);
  }

  function enTeteTableau() {
    const y = doc.y;
    doc.rect(MARGE, y, LARGEUR_TABLEAU, 22).fill(COULEUR_FOND_ENTETE);
    doc.font('Helvetica-Bold').fontSize(TAILLE_TEXTE).fillColor(COULEUR_TEXTE);
    let x = MARGE;
    for (const colonne of COLONNES) {
      doc.text(colonne.titrePdf ?? colonne.titre, x + REMPLISSAGE_CELLULE, y + 6, {
        width: largeurCellule(colonne),
        align: alignement(colonne)
      });
      x += colonne.largeurPdf;
    }
    doc.y = y + 22;
  }

  /** Passe à la page suivante si la hauteur demandée ne tient plus. */
  function assurerPlace(hauteur) {
    if (doc.y + hauteur > basDePage()) {
      doc.addPage();
      doc.y = MARGE;
      enTeteTableau();
    }
  }

  /** Trace la bordure basse d'une ligne et positionne le curseur dessous. */
  function cloreLigne(y, hauteur) {
    doc.moveTo(MARGE, y + hauteur).lineTo(MARGE + LARGEUR_TABLEAU, y + hauteur)
      .lineWidth(0.5).strokeColor(COULEUR_BORDURE).stroke();
    doc.y = y + hauteur;
  }

  /** Dessine une ligne du registre ; `cellules` suit l'ordre de COLONNES. */
  function ligneTableau(cellules) {
    doc.font('Helvetica').fontSize(TAILLE_TEXTE);
    const hauteur = Math.max(16, ...cellules.map((texte, i) =>
      doc.heightOfString(texte || ' ', { width: largeurCellule(COLONNES[i]) })
    )) + REMPLISSAGE_CELLULE * 2;

    assurerPlace(hauteur);
    // Un saut de page redessine l'en-tête en gras : on rétablit la police.
    doc.font('Helvetica').fontSize(TAILLE_TEXTE);
    const y = doc.y;
    doc.fillColor(COULEUR_TEXTE);
    let x = MARGE;
    cellules.forEach((texte, i) => {
      doc.text(texte, x + REMPLISSAGE_CELLULE, y + REMPLISSAGE_CELLULE, {
        width: largeurCellule(COLONNES[i]),
        align: alignement(COLONNES[i])
      });
      x += COLONNES[i].largeurPdf;
    });
    cloreLigne(y, hauteur);
  }

  /**
   * Dessine une ligne de total (gras sur fond grisé) ou de ventilation
   * « dont … » (italique, en retrait) : le libellé s'étale sur les colonnes
   * qui précèdent le montant, lequel s'aligne avec sa colonne.
   */
  function ligneTotal(libelle, montant, { ventilation = false } = {}) {
    doc.font(ventilation ? 'Helvetica-Oblique' : 'Helvetica-Bold').fontSize(TAILLE_TEXTE);
    const retrait = ventilation ? 14 : 0;
    const largeurLibelle = DEBUT_MONTANT - REMPLISSAGE_CELLULE * 2 - retrait;
    const hauteur = Math.max(16, doc.heightOfString(libelle, { width: largeurLibelle })) +
      REMPLISSAGE_CELLULE * 2;

    assurerPlace(hauteur);
    const y = doc.y;
    if (!ventilation) {
      doc.rect(MARGE, y, LARGEUR_TABLEAU, hauteur).fill(COULEUR_FOND_TOTAL);
    }
    doc.fillColor(COULEUR_TEXTE);
    doc.text(libelle, MARGE + REMPLISSAGE_CELLULE + retrait, y + REMPLISSAGE_CELLULE, { width: largeurLibelle });
    doc.text(
      texteSur(formaterMontant(montant, parametres.devise)),
      MARGE + DEBUT_MONTANT + REMPLISSAGE_CELLULE,
      y + REMPLISSAGE_CELLULE,
      { width: largeurCellule(COLONNES[INDEX_MONTANT]), align: 'right' }
    );
    cloreLigne(y, hauteur);
  }

  // ---- Rendu ---------------------------------------------------------------
  enTeteDocument();

  if (registre.lignes.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(COULEUR_SECONDAIRE)
      .text(registre.messageVide, MARGE, doc.y);
  } else {
    enTeteTableau();
    for (const ligne of registre.lignes) {
      if (ligne.type === 'element') {
        ligneTableau(COLONNES.map((colonne) => (
          colonne.montant
            ? texteSur(formaterMontant(ligne.element.montant, parametres.devise))
            : texteSur(colonne.valeur(ligne.element, parametres))
        )));
      } else {
        ligneTotal(ligne.libelle, ligne.montant, { ventilation: ligne.type === 'ventilation' });
      }
    }
  }

  // ---- Numérotation des pages ----------------------------------------------
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    // Écrire sous la marge basse déclencherait l'ajout d'une page :
    // on neutralise la marge le temps d'écrire le pied de page.
    const margeBasse = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(COULEUR_SECONDAIRE)
      .text(`Page ${i + 1} / ${pages.count}`, MARGE, doc.page.height - MARGE + 8, {
        width: LARGEUR_TABLEAU,
        align: 'right',
        lineBreak: false
      });
    doc.page.margins.bottom = margeBasse;
  }

  doc.end();
}
