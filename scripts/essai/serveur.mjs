/**
 * Banc d'essai, côté serveur : `npm run essai` seulement (voir ../essai.mjs).
 *
 * Il met à portée de clic les situations qu'un livre réel met des mois à
 * produire : une autre date du jour, un livre vierge, de démonstration, très
 * chargé ou extrême, une clé de copie branchée ou retirée, des sauvegardes en
 * panne, un livre abîmé ou disparu, une mise à jour disponible, un serveur
 * qui ne répond plus. Le panneau qui s'en sert est dans `client/`.
 *
 * Rien de tout cela n'existe dans l'application livrée : `creerApp` ne
 * branche ce banc que si `essai.mjs` le lui passe.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { construireJeuDemo, piecesDemo } from '../../src/demo.js';
import { PAGE_VERSIONS } from '../../src/maj.js';
import { livreCharge, livreExtreme } from './livres.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '../..');

/**
 * L'horloge du navigateur, décalée comme celle du serveur : chargée avant
 * les modules de l'application, elle remplace `Date` le temps de l'essai.
 */
const scriptHorloge = (decalage) => `/* Banc d'essai : date simulée (décalage de ${decalage} ms). */
(() => {
  const decalage = ${decalage};
  if (!decalage) return;
  const DateReelle = Date;
  class DateSimulee extends DateReelle {
    constructor(...valeurs) { super(...(valeurs.length ? valeurs : [DateReelle.now() + decalage])); }
    static now() { return DateReelle.now() + decalage; }
  }
  window.Date = DateSimulee;
})();
`;

/**
 * @param {object} options
 * @param {{ decalage: () => number, fixer: (iso: string|null) => void }} options.horloge
 * @param {{ branchee: () => boolean, brancher: (oui: boolean) => void }} options.cle
 * @returns {(app: import('express').Express, contexte: object) => void}
 */
export function bancEssai({ horloge, cle }) {
  let majSimulee = false;
  let panneJusqua = 0;

  return (app, { stockage, pieces }) => {
    const sansCache = (res) => res.setHeader('Cache-Control', 'no-cache');

    // La page charge l'horloge simulée avant l'application.
    app.get(['/', '/index.html'], (req, res) => {
      const page = fs.readFileSync(path.join(RACINE, 'public/index.html'), 'utf8')
        .replace('<script type="module"', '<script src="/essai/horloge.js"></script>\n  <script type="module"');
      sansCache(res);
      res.type('html').send(page);
    });
    app.get('/essai/horloge.js', (req, res) => {
      sansCache(res);
      res.type('js').send(scriptHorloge(horloge.decalage()));
    });
    app.use('/essai', express.static(path.join(ICI, 'client'), { setHeaders: sansCache }));

    // Serveur injoignable : toute l'API répond en erreur, sauf le banc lui-même.
    app.use('/api', (req, res, suite) => {
      if (Date.now() >= panneJusqua || req.path.startsWith('/essai')) return suite();
      res.status(503).json({ erreur: 'Banc d’essai : le serveur ne répond pas (panne simulée).' });
    });

    // Une nouvelle version, sans contacter GitHub ; l'installer ne fait rien.
    app.get('/api/maj', (req, res, suite) => {
      if (!majSimulee) return suite();
      res.json({ actif: true, disponible: true, version: '9.9.0', versionActuelle: '2.4.0', page: PAGE_VERSIONS, remplacable: true, erreur: null });
    });
    app.post('/api/maj/appliquer', (req, res, suite) => {
      if (!majSimulee) return suite();
      res.status(502).json({ erreur: 'Banc d’essai : aucune version n’est installée. Le bouton a bien lancé l’installation.' });
    });

    const routeur = express.Router();
    const etat = () => ({
      decalage: horloge.decalage(),
      cleBranchee: cle.branchee(),
      majSimulee,
      sauvegardesEnPanne: fs.existsSync(stockage.dossierSauvegardes) && fs.statSync(stockage.dossierSauvegardes).isFile()
    });
    routeur.get('/', (req, res) => res.json(etat()));

    /** POST /api/essai/date { date: 'AAAA-MM-JJ' } ; `null` revient à la vraie date. */
    routeur.post('/date', (req, res) => {
      const iso = req.body?.date ?? null;
      if (iso !== null && !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return res.status(400).json({ erreur: 'Date attendue au format AAAA-MM-JJ.' });
      horloge.fixer(iso);
      res.json(etat());
    });

    /** POST /api/essai/livre { jeu: 'vierge' | 'demo' | 'charge' | 'extreme' } : remplace tout le livre. */
    routeur.post('/livre', async (req, res, suite) => {
      try {
        const jeu = req.body?.jeu;
        const prenom = stockage.obtenirParametres().prenom;
        stockage.repartirDeZero();
        if (jeu === 'vierge') return res.json(etat());
        let contenu;
        if (jeu === 'demo') {
          contenu = construireJeuDemo(new Date());
          await piecesDemo(contenu, (octets, nom) => pieces.enregistrer(octets, nom));
        } else if (jeu === 'charge') contenu = livreCharge(new Date());
        else if (jeu === 'extreme') contenu = livreExtreme(new Date());
        else return res.status(400).json({ erreur: `Jeu inconnu : ${jeu}` });
        contenu.parametres = { ...contenu.parametres, prenom: prenom || 'Camille', accueil: 'termine' };
        stockage.chargerDemo(contenu);
        res.json(etat());
      } catch (erreur) {
        suite(erreur);
      }
    });

    /** POST /api/essai/cle { branchee } : la clé d'essai, branchée ou retirée. */
    routeur.post('/cle', (req, res) => {
      cle.brancher(Boolean(req.body?.branchee));
      res.json(etat());
    });

    /**
     * POST /api/essai/sauvegardes { enPanne } : le dossier des sauvegardes
     * devient un fichier, plus rien ne peut s'y écrire ; puis il redevient
     * un dossier (les sauvegardes d'avant la panne sont perdues : c'est un essai).
     */
    routeur.post('/sauvegardes', (req, res) => {
      const dossier = stockage.dossierSauvegardes;
      fs.rmSync(dossier, { recursive: true, force: true });
      if (req.body?.enPanne) fs.writeFileSync(dossier, 'Banc d’essai : sauvegardes en panne.');
      else fs.mkdirSync(dossier, { recursive: true });
      res.json(etat());
    });

    /** POST /api/essai/fichier { etat: 'abime' | 'absent' } : le livre abîmé, ou disparu. */
    routeur.post('/fichier', (req, res) => {
      // Une sauvegarde au moins, à restaurer ensuite depuis l'écran de récupération.
      stockage.creerSauvegarde('avant-essai');
      if (req.body?.etat === 'abime') fs.writeFileSync(stockage.cheminFichier, '{ "recettes": [ abîmé par le banc d’essai');
      else fs.rmSync(stockage.cheminFichier, { force: true });
      stockage.relire();
      res.json(etat());
    });

    /** POST /api/essai/maj { disponible } : une nouvelle version annoncée, ou non. */
    routeur.post('/maj', (req, res) => {
      majSimulee = Boolean(req.body?.disponible);
      res.json(etat());
    });

    /** POST /api/essai/panne { secondes } : le serveur ne répond plus pendant ce temps. */
    routeur.post('/panne', (req, res) => {
      panneJusqua = Date.now() + Math.min(120, Number(req.body?.secondes) || 20) * 1000;
      res.json(etat());
    });

    app.use('/api/essai', routeur);
  };
}
