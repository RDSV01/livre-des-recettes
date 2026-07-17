/**
 * API des exports : registre en CSV / Excel / PDF.
 *
 * Aucune donnée ne quitte la machine : ces routes produisent des fichiers
 * téléchargés par le navigateur de l'utilisateur, rien de plus.
 */

import express from 'express';
import { construireRegistre, nomFichierExport } from '../exports/registre.js';
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

  /** Registre de la période, ventilé ventes / prestations en activité mixte. */
  const registrePour = (periode) => {
    const parametres = stockage.obtenirParametres();
    return {
      parametres,
      registre: construireRegistre(stockage.listerRecettes(), periode, {
        ventiler: parametres.typeActivite === 'mixte'
      })
    };
  };

  routeur.get('/csv', (req, res) => {
    const periode = lirePeriode(req, res);
    if (!periode) return;
    const { registre, parametres } = registrePour(periode);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nomFichierExport(periode)}.csv"`);
    res.send(genererCsv(registre, parametres));
  });

  routeur.get('/xlsx', async (req, res, next) => {
    try {
      const periode = lirePeriode(req, res);
      if (!periode) return;
      const { registre, parametres } = registrePour(periode);
      const classeur = await genererXlsx(registre, parametres);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nomFichierExport(periode)}.xlsx"`);
      await classeur.xlsx.write(res);
      res.end();
    } catch (erreur) {
      next(erreur);
    }
  });

  routeur.get('/pdf', (req, res) => {
    const periode = lirePeriode(req, res);
    if (!periode) return;
    const { registre, parametres } = registrePour(periode);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomFichierExport(periode)}.pdf"`);
    genererPdf(registre, parametres, res);
  });

  return routeur;
}
