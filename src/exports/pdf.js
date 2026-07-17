/**
 * Export PDF du registre, généré avec PDFKit.
 *
 * Mise en page : A4 paysage, en-tête d'identité sur la première page,
 * tableau avec en-tête répété à chaque saut de page, totaux mensuels et
 * annuel en gras sur fond grisé, numérotation des pages.
 *
 * Les polices standard du PDF (Helvetica) utilisent l'encodage WinAnsi :
 * les espaces insécables produits par `Intl.NumberFormat` (U+202F, U+00A0)
 * doivent être remplacés par des espaces simples avant écriture.
 */

import PDFDocument from 'pdfkit';
import { libelleCategorieCourt } from './registre.js';
import { formaterDate } from '../partage/dates.js';
import { formaterMontant } from '../partage/montants.js';
import { libelleMode } from '../partage/constantes.js';

const MARGE = 40;
const TAILLE_TEXTE = 9;
const REMPLISSAGE_CELLULE = 5;
const COULEUR_TEXTE = '#1c2333';
const COULEUR_SECONDAIRE = '#6b7280';
const COULEUR_FOND_ENTETE = '#e9edf5';
const COULEUR_FOND_TOTAL = '#f3f5fa';
const COULEUR_BORDURE = '#d7dbe4';

/**
 * Colonnes du tableau (l'ordre suit le registre légal), pour un total de
 * 760 pt. La colonne Catégorie n'apparaît que pour un registre ventilé
 * (activité mixte).
 */
function colonnesRegistre(ventiler) {
  return ventiler
    ? [
      { titre: 'Date', largeur: 70 },
      { titre: 'Client', largeur: 125 },
      { titre: 'Montant', largeur: 80, align: 'right' },
      { titre: 'Mode de règlement', largeur: 95 },
      { titre: 'N° de facture', largeur: 90 },
      { titre: 'Catégorie', largeur: 75 },
      { titre: 'Libellé', largeur: 225 }
    ]
    : [
      { titre: 'Date', largeur: 70 },
      { titre: 'Client', largeur: 145 },
      { titre: 'Montant', largeur: 85, align: 'right' },
      { titre: 'Mode de règlement', largeur: 105 },
      { titre: 'N° de facture', largeur: 100 },
      { titre: 'Libellé', largeur: 255 }
    ];
}

/** Remplace les caractères hors encodage WinAnsi par des équivalents sûrs. */
function texteSur(texte) {
  return String(texte ?? '').replace(/[  ]/g, ' ');
}

/**
 * Écrit le registre en PDF dans le flux donné (réponse HTTP ou fichier).
 * Le flux est clôturé par PDFKit à la fin de la génération.
 */
export function genererPdf(registre, parametres, flux) {
  const COLONNES = colonnesRegistre(registre.ventiler);
  const LARGEUR_TABLEAU = COLONNES.reduce((acc, c) => acc + c.largeur, 0);

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: MARGE,
    bufferPages: true,
    info: { Title: `Livre des recettes - ${registre.titre}`, Author: parametres.nomEntreprise || 'Livre des recettes' }
  });
  doc.pipe(flux);

  const basDePage = () => doc.page.height - MARGE - 15;

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
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COULEUR_TEXTE)
      .text(`Livre des recettes - ${registre.titre}`);
    const sousTitre = `Édité le ${formaterDate(new Date().toISOString().slice(0, 10), parametres.formatDate)}` +
      `  ·  ${registre.nombre} encaissement${registre.nombre > 1 ? 's' : ''}` +
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
      doc.text(colonne.titre, x + REMPLISSAGE_CELLULE, y + 6, {
        width: colonne.largeur - REMPLISSAGE_CELLULE * 2,
        align: colonne.align ?? 'left'
      });
      x += colonne.largeur;
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

  /** Dessine une ligne de recette ; `cellules` suit l'ordre de COLONNES. */
  function ligneTableau(cellules) {
    doc.font('Helvetica').fontSize(TAILLE_TEXTE);
    const hauteur = Math.max(16, ...cellules.map((texte, i) =>
      doc.heightOfString(texte || ' ', { width: COLONNES[i].largeur - REMPLISSAGE_CELLULE * 2 })
    )) + REMPLISSAGE_CELLULE * 2;

    assurerPlace(hauteur);
    // Un saut de page redessine l'en-tête en gras : on rétablit la police.
    doc.font('Helvetica').fontSize(TAILLE_TEXTE);
    const y = doc.y;
    doc.fillColor(COULEUR_TEXTE);
    let x = MARGE;
    cellules.forEach((texte, i) => {
      doc.text(texte, x + REMPLISSAGE_CELLULE, y + REMPLISSAGE_CELLULE, {
        width: COLONNES[i].largeur - REMPLISSAGE_CELLULE * 2,
        align: COLONNES[i].align ?? 'left'
      });
      x += COLONNES[i].largeur;
    });
    cloreLigne(y, hauteur);
  }

  /**
   * Dessine une ligne de total (gras sur fond grisé) ou de ventilation
   * « dont … » (italique, en retrait) : le libellé s'étale sur les colonnes
   * Date et Client, le montant s'aligne avec la colonne Montant.
   */
  function ligneTotal(libelle, montant, { ventilation = false } = {}) {
    doc.font(ventilation ? 'Helvetica-Oblique' : 'Helvetica-Bold').fontSize(TAILLE_TEXTE);
    const retrait = ventilation ? 14 : 0;
    const largeurLibelle = COLONNES[0].largeur + COLONNES[1].largeur - REMPLISSAGE_CELLULE * 2 - retrait;
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
      MARGE + COLONNES[0].largeur + COLONNES[1].largeur + REMPLISSAGE_CELLULE,
      y + REMPLISSAGE_CELLULE,
      { width: COLONNES[2].largeur - REMPLISSAGE_CELLULE * 2, align: 'right' }
    );
    cloreLigne(y, hauteur);
  }

  // ---- Rendu ---------------------------------------------------------------
  enTeteDocument();

  if (registre.lignes.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(COULEUR_SECONDAIRE)
      .text('Aucune recette sur la période.', MARGE, doc.y);
  } else {
    enTeteTableau();
    for (const ligne of registre.lignes) {
      if (ligne.type === 'recette') {
        const r = ligne.recette;
        ligneTableau([
          formaterDate(r.dateEncaissement, parametres.formatDate),
          texteSur(r.client),
          texteSur(formaterMontant(r.montant, parametres.devise)),
          texteSur(libelleMode(r.modeReglement, parametres.modesPersonnalises)),
          texteSur(r.numeroFacture),
          ...(registre.ventiler ? [libelleCategorieCourt(r.categorie)] : []),
          texteSur(r.libelle)
        ]);
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
