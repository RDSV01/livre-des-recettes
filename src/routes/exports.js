/**
 * API des exports : les deux registres en CSV / Excel / PDF.
 *
 * Aucune donnée ne quitte la machine : ces routes produisent des fichiers
 * téléchargés par le navigateur de l'utilisateur, rien de plus.
 */

import express from 'express';
import { registreRecettes, registreAchats } from '../exports/registre.js';
import { genererCsv } from '../exports/csv.js';
import { genererXlsx } from '../exports/xlsx.js';
import { genererPdf } from '../exports/pdf.js';

/**
 * Lit et valide la période demandée (`annee` obligatoire, `mois` facultatif).
 * Répond 400 et retourne `null` si la période est invalide.
 */
function lirePeriode(req, res) {
  const annee = Number.parseInt(req.query.annee, 10);
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) {
    res.status(400).json({ erreur: 'Paramètre « annee » manquant ou invalide.' });
    return null;
  }
  let mois;
  if (req.query.mois !== undefined && req.query.mois !== '') {
    mois = Number.parseInt(req.query.mois, 10);
    if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
      res.status(400).json({ erreur: 'Paramètre « mois » invalide (1 à 12).' });
      return null;
    }
  }
  return { annee, mois };
}

export function routesExports(stockage) {
  const routeur = express.Router();

  /**
   * Monte les trois formats d'un registre sous un même préfixe d'URL.
   * `construire(periode, parametres)` retourne le registre à exporter.
   */
  function monterFormats(prefixe, construire) {
    const preparer = (req, res) => {
      const periode = lirePeriode(req, res);
      if (!periode) return null;
      const parametres = stockage.obtenirParametres();
      return { parametres, registre: construire(periode, parametres) };
    };

    routeur.get(`${prefixe}/csv`, (req, res) => {
      const prepare = preparer(req, res);
      if (!prepare) return;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${prepare.registre.nomFichier}.csv"`);
      res.send(genererCsv(prepare.registre, prepare.parametres));
    });

    routeur.get(`${prefixe}/xlsx`, async (req, res, next) => {
      try {
        const prepare = preparer(req, res);
        if (!prepare) return;
        const classeur = await genererXlsx(prepare.registre, prepare.parametres);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${prepare.registre.nomFichier}.xlsx"`);
        await classeur.xlsx.write(res);
        res.end();
      } catch (erreur) {
        next(erreur);
      }
    });

    routeur.get(`${prefixe}/pdf`, (req, res) => {
      const prepare = preparer(req, res);
      if (!prepare) return;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${prepare.registre.nomFichier}.pdf"`);
      genererPdf(prepare.registre, prepare.parametres, res);
    });
  }

  // Livre des recettes, ventilé ventes / prestations en activité mixte.
  monterFormats('', (periode, parametres) => registreRecettes(stockage.listerRecettes(), periode, {
    ventiler: parametres.typeActivite === 'mixte'
  }));

  monterFormats('/achats', (periode) => registreAchats(stockage.listerAchats(), periode));

  return routeur;
}
