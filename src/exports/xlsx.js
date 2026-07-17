/**
 * Export Excel (.xlsx) du registre, généré avec ExcelJS.
 *
 * La feuille reprend les colonnes légales, ajoute un bloc d'identité de
 * l'entreprise en tête, met les totaux mensuels et annuel en évidence
 * (ventilation ventes / prestations en italique pour une activité mixte)
 * et fige la ligne d'en-tête pour faciliter la lecture.
 */

import ExcelJS from 'exceljs';
import { entetesRegistre, libelleCategorieCourt } from './registre.js';
import { formaterDate } from '../partage/dates.js';
import { libelleMode } from '../partage/constantes.js';
import { symboleDevise } from '../partage/montants.js';

const COULEUR_ENTETE = 'FFE9EDF5';
const COULEUR_TOTAL = 'FFF3F5FA';

/** Génère le classeur ; l'appelant l'écrit où il veut (`classeur.xlsx.write(...)`). */
export async function genererXlsx(registre, parametres) {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = 'Livre des recettes';
  classeur.created = new Date();

  const entetes = entetesRegistre(registre.ventiler);
  const feuille = classeur.addWorksheet('Livre des recettes');
  const largeurs = [24, 30, 14, 20, 20, ...(registre.ventiler ? [14] : []), 45];
  feuille.columns = largeurs.map((largeur) => ({ width: largeur }));

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
  const titre = feuille.addRow([`Livre des recettes - ${registre.titre}`]);
  titre.font = { bold: true, size: 12 };
  feuille.addRow([
    `Édité le ${formaterDate(new Date().toISOString().slice(0, 10), parametres.formatDate)}` +
    ` · ${registre.nombre} encaissement${registre.nombre > 1 ? 's' : ''}`
  ]).font = { color: { argb: 'FF6B7280' }, size: 10 };
  feuille.addRow([]);

  // ---- En-tête du tableau --------------------------------------------------
  const enTete = feuille.addRow(entetes);
  enTete.eachCell((cellule) => {
    cellule.font = { bold: true, size: 10 };
    cellule.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ENTETE } };
    cellule.border = { bottom: { style: 'thin', color: { argb: 'FFB9C0CE' } } };
  });
  feuille.views = [{ state: 'frozen', ySplit: enTete.number }];

  // ---- Lignes du registre --------------------------------------------------
  const formatMontant = `#,##0.00 "${symboleDevise(parametres.devise)}"`;
  const completer = (valeurs) => valeurs.concat(Array(entetes.length - valeurs.length).fill(''));

  for (const ligne of registre.lignes) {
    if (ligne.type === 'recette') {
      const r = ligne.recette;
      const rangee = feuille.addRow([
        formaterDate(r.dateEncaissement, parametres.formatDate),
        r.client,
        r.montant,
        libelleMode(r.modeReglement, parametres.modesPersonnalises),
        r.numeroFacture,
        ...(registre.ventiler ? [libelleCategorieCourt(r.categorie)] : []),
        r.libelle
      ]);
      rangee.getCell(3).numFmt = formatMontant;
    } else if (ligne.type === 'total') {
      const rangee = feuille.addRow(completer([ligne.libelle, '', ligne.montant]));
      rangee.font = { bold: true };
      rangee.getCell(3).numFmt = formatMontant;
      rangee.eachCell({ includeEmpty: true }, (cellule, colonne) => {
        if (colonne <= entetes.length) {
          cellule.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_TOTAL } };
        }
      });
    } else {
      // Ventilation « dont … » : discrète, en italique.
      const rangee = feuille.addRow(completer([ligne.libelle, '', ligne.montant]));
      rangee.font = { italic: true, size: 10 };
      rangee.getCell(3).numFmt = formatMontant;
    }
  }

  if (registre.lignes.length === 0) {
    feuille.addRow(['Aucune recette sur la période.']).font = { italic: true };
  }

  return classeur;
}
