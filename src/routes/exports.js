/**
 * API des exports : les deux registres en CSV / Excel / PDF, seuls ou dans
 * une archive ZIP avec les PDF joints aux lignes de la période.
 *
 * Aucune donnée ne quitte la machine : ces routes produisent des fichiers
 * téléchargés par le navigateur de l'utilisateur, rien de plus.
 */

import fs from 'node:fs';
import express from 'express';
import { registreRecettes, registreAchats } from '../exports/registre.js';
import { genererCsv } from '../exports/csv.js';
import { genererXlsx } from '../exports/xlsx.js';
import { genererPdf, genererPdfEnMemoire } from '../exports/pdf.js';
import { genererRapportPdf } from '../exports/rapport-pdf.js';
import { rapportAnnuel } from '../rapport-annuel.js';
import { controlerRecettes, controlerAchats } from '../controle-export.js';
import { lireAnnee, lirePeriode } from './requetes.js';
import { creerZip, nomsUniques } from '../exports/zip.js';
import { filtrerParPeriode } from '../totaux.js';

/** Le registre dans le format demandé, en mémoire. */
async function registreEnMemoire(format, registre, parametres) {
  if (format === 'csv') return Buffer.from(genererCsv(registre, parametres), 'utf8');
  if (format === 'xlsx') return Buffer.from(await (await genererXlsx(registre, parametres)).xlsx.writeBuffer());
  return genererPdfEnMemoire(registre, parametres);
}

/** En-têtes d'un fichier à télécharger, sous le nom donné. */
function telechargement(res, type, nomFichier) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
}

export function routesExports(stockage, pieces) {
  const routeur = express.Router();

  /**
   * Monte les trois formats d'un registre sous un même préfixe d'URL, plus le
   * contrôle qui précède le téléchargement.
   *
   * @param {string} prefixe préfixe d'URL du registre.
   * @param {Function} construire `(periode, parametres)` donne le registre à exporter.
   * @param {Function} controler `(periode, parametres)` donne le rapport de contrôle.
   * @param {object} source lignes du registre et de quoi nommer leurs PDF :
   *   `{ lister, cleDate, dossier, nommer }`.
   */
  function monterFormats(prefixe, construire, controler, source) {
    const preparer = (req, res) => {
      const periode = lirePeriode(req, res);
      if (!periode) return null;
      const parametres = stockage.obtenirParametres();
      return { parametres, periode, registre: construire(periode, parametres) };
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

    /**
     * Le registre (au format demandé) et les PDF joints aux lignes de la
     * période, réunis dans une archive : ce qu'on remet d'un bloc à un
     * comptable ou lors d'un contrôle. Un PDF introuvable est signalé dans
     * un fichier texte plutôt que de faire échouer l'archive.
     */
    routeur.get(`${prefixe}/zip`, async (req, res, next) => {
      try {
        const prepare = preparer(req, res);
        if (!prepare) return;
        const format = ['pdf', 'xlsx', 'csv'].includes(req.query.format) ? req.query.format : 'pdf';
        const lignes = filtrerParPeriode(source.lister(), prepare.periode, source.cleDate)
          .filter((l) => l.pieceJointe)
          .sort((a, b) => String(a[source.cleDate]).localeCompare(String(b[source.cleDate])));
        const trouvees = [];
        const perdues = [];
        for (const ligne of lignes) {
          const chemin = pieces.chemin(ligne.pieceJointe.id);
          if (chemin) trouvees.push({ ligne, chemin }); else perdues.push(ligne);
        }
        const noms = nomsUniques(trouvees.map(({ ligne }) => `${source.nommer(ligne).replaceAll('/', '-')}.pdf`));
        const fichiers = [
          { nom: `${prepare.registre.nomFichier}.${format}`, contenu: await registreEnMemoire(format, prepare.registre, prepare.parametres) },
          ...trouvees.map(({ chemin }, i) => ({ nom: `${source.dossier}/${noms[i]}`, contenu: fs.readFileSync(chemin) }))
        ];
        if (perdues.length > 0) {
          fichiers.push({
            nom: 'pieces-introuvables.txt',
            contenu: `Ces lignes citent un PDF dont le fichier est introuvable :\r\n${perdues.map((l) => `- ${source.nommer(l)}`).join('\r\n')}\r\n`
          });
        }
        telechargement(res, 'application/zip', `${prepare.registre.nomFichier}-avec-pdf.zip`);
        res.send(creerZip(fichiers));
      } catch (erreur) {
        next(erreur);
      }
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
    (periode, parametres) => controlerRecettes(stockage.listerRecettes(), periode, parametres),
    {
      lister: () => stockage.listerRecettes(),
      cleDate: 'dateEncaissement',
      dossier: 'factures',
      nommer: (r) => [r.dateEncaissement, r.client, r.numeroFacture].filter(Boolean).join(' ')
    }
  );

  monterFormats(
    '/achats',
    (periode) => registreAchats(stockage.listerAchats(), periode),
    (periode, parametres) => controlerAchats(stockage.listerAchats(), periode, parametres),
    {
      lister: () => stockage.listerAchats(),
      cleDate: 'dateReglement',
      dossier: 'justificatifs',
      nommer: (a) => [a.dateReglement, a.fournisseur, a.referenceFacture].filter(Boolean).join(' ')
    }
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
