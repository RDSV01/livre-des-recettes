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
import { genererRapportPdf } from '../exports/rapport-pdf.js';
import { rapportAnnuel } from '../rapport-annuel.js';
import { controlerRecettes, controlerAchats } from '../controle-export.js';

/**
 * Lit et valide l'année demandée. Répond 400 et retourne `null` si elle
 * manque ou sort des bornes plausibles.
 */
function lireAnnee(req, res) {
  const annee = Number.parseInt(req.query.annee, 10);
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) {
    res.status(400).json({ erreur: 'Paramètre « annee » manquant ou invalide.' });
    return null;
  }
  return annee;
}

/**
 * Lit et valide la période demandée (`annee` obligatoire, `mois` facultatif).
 * Répond 400 et retourne `null` si la période est invalide.
 */
function lirePeriode(req, res) {
  const annee = lireAnnee(req, res);
  if (annee === null) return null;
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
   * Monte les trois formats d'un registre sous un même préfixe d'URL, plus le
   * contrôle qui précède le téléchargement.
   *
   * @param {string} prefixe préfixe d'URL du registre.
   * @param {Function} construire `(periode, parametres)` donne le registre à exporter.
   * @param {Function} controler `(periode, parametres)` donne le rapport de contrôle.
   */
  function monterFormats(prefixe, construire, controler) {
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

    // Contrôle préalable : l'interface le joue point par point avant de lancer
    // le téléchargement. Il ne modifie rien et n'interdit aucun export.
    routeur.get(`${prefixe}/controle`, (req, res) => {
      const periode = lirePeriode(req, res);
      if (!periode) return;
      res.json(controler(periode, stockage.obtenirParametres()));
    });
  }

  // Livre des recettes, ventilé ventes / prestations en activité mixte.
  monterFormats(
    '',
    (periode, parametres) => registreRecettes(stockage.listerRecettes(), periode, {
      ventiler: parametres.typeActivite === 'mixte'
    }),
    (periode, parametres) => controlerRecettes(stockage.listerRecettes(), periode, parametres)
  );

  monterFormats(
    '/achats',
    (periode) => registreAchats(stockage.listerAchats(), periode),
    (periode, parametres) => controlerAchats(stockage.listerAchats(), periode, parametres)
  );

  /**
   * Rapport annuel de gestion : contrairement aux registres ci-dessus, il ne
   * répond à aucune obligation légale et n'existe donc qu'en PDF, le format
   * qui se lit et s'archive tel quel.
   */
  routeur.get('/rapport-annuel', (req, res) => {
    const annee = lireAnnee(req, res);
    if (annee === null) return;
    const parametres = stockage.obtenirParametres();
    const rapport = rapportAnnuel({
      recettes: stockage.listerRecettes(),
      achats: stockage.listerAchats(),
      parametres
    }, annee);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rapport-annuel-${annee}.pdf"`);
    genererRapportPdf(rapport, parametres, res);
  });

  return routeur;
}
