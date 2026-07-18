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
import { routesAchats } from './routes/achats.js';
import { routesMaj } from './routes/maj.js';
import { routesClients } from './routes/clients.js';
import { routesParametres } from './routes/parametres.js';
import { routesExports } from './routes/exports.js';
import { routesUrssaf } from './routes/urssaf.js';
import { routesSauvegardes } from './routes/sauvegardes.js';
import { statistiquesTableauDeBord } from './totaux.js';
import { aujourdHuiIso } from './partage/dates.js';
import { dossierDonneesParDefaut } from './emplacements.js';

/**
 * Racine du projet. Dans l'exécutable autonome, les fichiers du dépôt
 * n'existent plus (`import.meta.url` y est vide) : la racine devient le
 * dossier de l'exécutable, ce qui place le dossier de données juste à côté
 * de lui.
 */
const RACINE = import.meta.url
  ? path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  : path.dirname(process.execPath);
const ICI = path.join(RACINE, 'src');

/**
 * Version affichée dans l'interface. Lue dans `package.json` ; dans
 * l'exécutable autonome, ce fichier n'existe pas et la version est celle
 * injectée à la construction.
 */
export const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')).version;
  } catch {
    return process.env.LDR_VERSION ?? '';
  }
})();

/**
 * Dossier de données par défaut : « Documents/Livre des recettes », aussi
 * bien depuis les sources que depuis l'exécutable. Celui-ci ne laisse donc
 * rien derrière lui, où qu'on le pose.
 */
export const DOSSIER_DONNEES_DEFAUT = dossierDonneesParDefaut();

/**
 * Rejette toute requête qui modifie quelque chose et qui ne vient pas de
 * l'application elle-même.
 *
 * Le serveur n'écoute que sur cette machine, mais une page web visitée par
 * l'utilisateur peut malgré tout lui envoyer un formulaire (le navigateur
 * autorise ces envois d'un site à l'autre). Les navigateurs modernes
 * annoncent l'origine réelle dans `Sec-Fetch-Site` ; à défaut, l'en-tête
 * `Origin` fait foi. Les lectures (GET, HEAD) ne sont pas concernées :
 * elles ne changent rien.
 */
function refuserRequetesExterieures(req, res, suite) {
  if (req.method === 'GET' || req.method === 'HEAD') return suite();

  const provenance = req.get('Sec-Fetch-Site');
  const origine = req.get('Origin');
  const memeOrigine = provenance
    ? provenance === 'same-origin' || provenance === 'none'
    : !origine || origine === `http://${req.get('Host')}`;

  if (memeOrigine) return suite();
  res.status(403).json({ erreur: 'Requête refusée : elle ne vient pas de l’application.' });
}

/**
 * @param {object} [options]
 * @param {string} [options.dossierDonnees] dossier du fichier de données.
 * @param {object} [options.actifs] fichiers de l'interface servis depuis la
 *   mémoire (`{ '/index.html': { type, contenu } }`) au lieu du disque :
 *   c'est ainsi que l'exécutable autonome se passe de tout dossier annexe.
 * @param {string} [options.dossierSauvegardes] où ranger les sauvegardes
 *   automatiques (par défaut hors du dossier de données).
 * @param {() => void} [options.arreter] ferme le serveur et retire le verrou
 *   d'instance : appelé juste avant le redémarrage qui suit une mise à jour.
 */
export function creerApp({
  dossierDonnees, dossierSauvegardes, actifs, arreter
} = {}) {
  const dossier = dossierDonnees ?? DOSSIER_DONNEES_DEFAUT;
  const stockage = creerStockage(dossier, dossierSauvegardes ? { dossierSauvegardes } : {});

  const app = express();
  app.disable('x-powered-by');
  app.use(refuserRequetesExterieures);
  // Limite généreuse : un import CSV de plusieurs milliers de lignes passe en JSON.
  app.use(express.json({ limit: '20mb' }));

  // ---- API -----------------------------------------------------------------
  app.use('/api/recettes', routesRecettes(stockage));
  app.use('/api/achats', routesAchats(stockage));
  app.use('/api/clients', routesClients(stockage));
  app.use('/api/parametres', routesParametres(stockage));
  app.use('/api/exports', routesExports(stockage));
  app.use('/api/urssaf', routesUrssaf(stockage));
  app.use('/api/sauvegardes', routesSauvegardes(stockage));
  app.use('/api/maj', routesMaj(stockage, arreter));

  // GET /api/tableau-de-bord?annee=2025 (année courante par défaut)
  app.get('/api/tableau-de-bord', (req, res) => {
    const annee = Number.parseInt(req.query.annee, 10);
    res.json(statistiquesTableauDeBord(stockage.listerRecettes(), {
      annee: Number.isInteger(annee) && annee >= 2000 && annee <= 2100 ? annee : null
    }));
  });

  app.get('/api/systeme', (req, res) => {
    const parametres = stockage.obtenirParametres();
    const nombre = stockage.compter();
    res.json({
      version: VERSION,
      fichierDonnees: stockage.cheminFichier,
      dossierSauvegardes: stockage.dossierSauvegardes,
      corruption: stockage.corruption(),
      // Fichier de données disparu alors que des sauvegardes subsistent :
      // l'interface propose de le reconstituer avant toute saisie.
      donneesAbsentes: stockage.donneesAbsentes(),
      // Le registre des achats reste visible tant qu'il contient quelque
      // chose, même si l'activité déclarée ne l'exige plus.
      aDesAchats: nombre.achats > 0,
      // Première utilisation : l'interface dirige alors vers les Paramètres.
      premierLancement: nombre.recettes === 0 && nombre.clients === 0 &&
        !parametres.nomEntreprise && !parametres.typeActivite
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
  if (actifs) {
    app.use((req, res, suite) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return suite();
      const actif = actifs[req.path === '/' ? '/index.html' : req.path];
      if (!actif) return suite();
      res.type(actif.type).send(actif.contenu);
    });
  } else {
    app.use('/partage', express.static(path.join(ICI, 'partage')));
    app.use(express.static(path.join(RACINE, 'public')));
  }

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
