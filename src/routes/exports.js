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
import { lireAnnee, lirePeriode } from './requetes.js';

/** En-têtes d'un fichier à télécharger, sous le nom donné. */
function telechargement(res, type, nomFichier) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
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
      telechargement(res, 'text/csv; charset=utf-8', `${prepare.registre.nomFichier}.csv`);
      res.send(genererCsv(prepare.registre, prepare.parametres));
    });

    routeur.get(`${prefixe}/xlsx`, async (req, res, next) => {
      try {
        const prepare = preparer(req, res);
        if (!prepare) return;
        const classeur = await genererXlsx(prepare.registre, prepare.parametres);
        telechargement(res, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${prepare.registre.nomFichier}.xlsx`);
        await classeur.xlsx.write(res);
        res.end();
      } catch (erreur) {
        next(erreur);
      }
    });

    routeur.get(`${prefixe}/pdf`, (req, res) => {
      const prepare = preparer(req, res);
      if (!prepare) return;
      telechargement(res, 'application/pdf', `${prepare.registre.nomFichier}.pdf`);
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
    telechargement(res, 'application/pdf', `rapport-annuel-${annee}.pdf`);
    genererRapportPdf(rapport, parametres, res);
  });

  return routeur;
}
