/**
 * Export Excel (.xlsx) d'un registre (recettes ou achats), généré avec ExcelJS.
 *
 * La feuille reprend les colonnes légales, ajoute un bloc d'identité de
 * l'entreprise en tête, met les totaux mensuels et annuel en évidence
 * (ventilation ventes / prestations en italique pour une activité mixte)
 * et fige la ligne d'en-tête pour faciliter la lecture.
 */

import ExcelJS from 'exceljs';
import { formaterDate } from '../partage/dates.js';
import { symboleDevise } from '../partage/montants.js';

const COULEUR_ENTETE = 'FFE9EDF5';
const COULEUR_TOTAL = 'FFF3F5FA';

/** Génère le classeur ; l'appelant l'écrit où il veut (`classeur.xlsx.write(...)`). */
export async function genererXlsx(registre, parametres) {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = 'Livre des recettes';
  classeur.created = new Date();

  const { colonnes } = registre;
  const indexMontant = colonnes.findIndex((c) => c.montant);
  const feuille = classeur.addWorksheet(registre.titreDocument);
  feuille.columns = colonnes.map((c) => ({ width: c.largeurXlsx }));

  // ---- Bloc d'identité -----------------------------------------------------
  if (parametres.nomEntreprise) {
    const ligne = feuille.addRow([parametres.nomEntreprise]);
    ligne.font = { bold: true, size: 14 };
  }
  const identite = [
    parametres.siren && `SIREN ${parametres.siren}`,
    parametres.siret && `SIRET ${parametres.siret}`,
    parametres.adresse
  ].filter(Boolean).join(' · ');
  if (identite) {
    feuille.addRow([identite]).font = { color: { argb: 'FF6B7280' }, size: 10 };
  }
  const titre = feuille.addRow([`${registre.titreDocument} - ${registre.titrePeriode}`]);
  titre.font = { bold: true, size: 12 };
  feuille.addRow([
    `Édité le ${formaterDate(new Date().toISOString().slice(0, 10), parametres.formatDate)}` +
    ` · ${registre.resume}`
  ]).font = { color: { argb: 'FF6B7280' }, size: 10 };
  feuille.addRow([]);

  // ---- En-tête du tableau --------------------------------------------------
  const enTete = feuille.addRow(colonnes.map((c) => c.titre));
  enTete.eachCell((cellule) => {
    cellule.font = { bold: true, size: 10 };
    cellule.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ENTETE } };
    cellule.border = { bottom: { style: 'thin', color: { argb: 'FFB9C0CE' } } };
  });
  feuille.views = [{ state: 'frozen', ySplit: enTete.number }];

  // ---- Lignes du registre --------------------------------------------------
  const formatMontant = `#,##0.00 "${symboleDevise(parametres.devise)}"`;

  /** Cellules d'une ligne de total ou de ventilation : libellé, puis montant. */
  const cellulesResume = (ligne) => colonnes.map((colonne, i) => {
    if (i === 0) return ligne.libelle;
    return i === indexMontant ? ligne.montant : '';
  });

  for (const ligne of registre.lignes) {
    if (ligne.type === 'element') {
      const rangee = feuille.addRow(colonnes.map((colonne) => (
        colonne.montant ? ligne.element.montant : colonne.valeur(ligne.element, parametres)
      )));
      rangee.getCell(indexMontant + 1).numFmt = formatMontant;
    } else if (ligne.type === 'total') {
      const rangee = feuille.addRow(cellulesResume(ligne));
      rangee.font = { bold: true };
      rangee.getCell(indexMontant + 1).numFmt = formatMontant;
      rangee.eachCell({ includeEmpty: true }, (cellule, colonne) => {
        if (colonne <= colonnes.length) {
          cellule.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_TOTAL } };
        }
      });
    } else {
      // Ventilation « dont … » : en italique.
      const rangee = feuille.addRow(cellulesResume(ligne));
      rangee.font = { italic: true, size: 10 };
      rangee.getCell(indexMontant + 1).numFmt = formatMontant;
    }
  }

  if (registre.lignes.length === 0) {
    feuille.addRow([registre.messageVide]).font = { italic: true };
  }

  return classeur;
}
