/**
 * Assemblage de l'application Express.
 *
 * `creerApp` reçoit le dossier de données en paramètre : les tests peuvent
 * ainsi démarrer l'application sur un dossier temporaire, sans toucher aux
 * vraies données.
 *
 * L'application sert aussi `src/partage/` sous l'URL `/partage/` : ces
 * modules (constantes, dates, montants, seuils…) sont écrits une seule fois
 * et utilisés à la fois par le serveur et par le navigateur.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { creerStockage } from './stockage.js';
import { routesRecettes } from './routes/recettes.js';
import { routesClients } from './routes/clients.js';
import { routesParametres } from './routes/parametres.js';
import { routesExports } from './routes/exports.js';
import { routesUrssaf } from './routes/urssaf.js';
import { routesSauvegardes } from './routes/sauvegardes.js';
import { statistiquesTableauDeBord } from './totaux.js';
import { aujourdHuiIso } from './partage/dates.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..');

export const VERSION = JSON.parse(
  fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')
).version;

export function creerApp({ dossierDonnees } = {}) {
  const dossier = dossierDonnees ?? path.join(RACINE, 'data');
  const stockage = creerStockage(dossier);

  const app = express();
  app.disable('x-powered-by');
  // Limite généreuse : un import CSV de plusieurs milliers de lignes passe en JSON.
  app.use(express.json({ limit: '20mb' }));

  // ---- API -----------------------------------------------------------------
  app.use('/api/recettes', routesRecettes(stockage));
  app.use('/api/clients', routesClients(stockage));
  app.use('/api/parametres', routesParametres(stockage));
  app.use('/api/exports', routesExports(stockage));
  app.use('/api/urssaf', routesUrssaf(stockage));
  app.use('/api/sauvegardes', routesSauvegardes(stockage));

  // GET /api/tableau-de-bord?annee=2025 (année courante par défaut)
  app.get('/api/tableau-de-bord', (req, res) => {
    const annee = Number.parseInt(req.query.annee, 10);
    res.json(statistiquesTableauDeBord(stockage.listerRecettes(), {
      annee: Number.isInteger(annee) && annee >= 2000 && annee <= 2100 ? annee : null
    }));
  });

  app.get('/api/systeme', (req, res) => {
    res.json({
      version: VERSION,
      fichierDonnees: stockage.cheminFichier,
      corruption: stockage.corruption()
    });
  });

  // Sauvegarde complète téléchargeable (le fichier de données, tel quel).
  app.get('/api/sauvegarde', (req, res) => {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sauvegarde-livre-des-recettes-${aujourdHuiIso()}.json"`
    );
    res.json(stockage.exporterDonnees());
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ erreur: 'Route inconnue.' });
  });

  // ---- Fichiers statiques ----------------------------------------------------
  app.use('/partage', express.static(path.join(ICI, 'partage')));
  app.use(express.static(path.join(RACINE, 'public')));

  // ---- Gestion d'erreurs -----------------------------------------------------
  // eslint-disable-next-line no-unused-vars -- Express identifie ce middleware à ses 4 paramètres.
  app.use((erreur, req, res, next) => {
    if (erreur.type === 'entity.parse.failed') {
      return res.status(400).json({ erreur: 'Corps de requête JSON invalide.' });
    }
    if (erreur.code === 'CORROMPU') {
      return res.status(503).json({ erreur: erreur.message });
    }
    console.error(erreur);
    res.status(500).json({ erreur: 'Erreur interne du serveur.' });
  });

  return app;
}
