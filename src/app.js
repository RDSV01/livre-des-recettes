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
import { creerPieces } from './pieces.js';
import { routesRecettes } from './routes/recettes.js';
import { routesAchats } from './routes/achats.js';
import { routesMaj } from './routes/maj.js';
import { routesClients } from './routes/clients.js';
import { routesParametres } from './routes/parametres.js';
import { routesExports } from './routes/exports.js';
import { routesUrssaf } from './routes/urssaf.js';
import { routesSauvegardes } from './routes/sauvegardes.js';
import { routesSecurite } from './routes/securite.js';
import { routesFichierSauvegarde } from './routes/fichier-sauvegarde.js';
import { statistiquesTableauDeBord } from './totaux.js';
import { recettesARenouveler } from './partage/recurrences.js';
import { aujourdHuiIso } from './partage/dates.js';
import { construireJeuDemo, piecesDemo } from './demo.js';
import { dossierDonneesParDefaut } from './emplacements.js';
import { creerFichierSauvegarde } from './fichier-sauvegarde.js';
import { creerArchives } from './archives.js';
import { creerCopieExterne } from './copie-externe.js';
import { constaterEchecMaj } from './maj.js';

/** Délai avant de refaire les archives après une écriture (une rafale de saisies n'en fait qu'une). */
const DELAI_ARCHIVES_MS = 60_000;

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

/** Noms sous lesquels l'application se sert elle-même, sur cette machine. */
const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Refuse toute requête adressée à un autre nom que la machine elle-même.
 *
 * Parade au « DNS rebinding » : un site malveillant peut faire pointer son
 * propre nom de domaine vers 127.0.0.1. Son script parle alors à ce serveur
 * en se croyant chez lui : le navigateur le laisse lire les réponses (le
 * livre entier via `/api/sauvegarde`) et annonce ses écritures comme venant
 * de la même origine, ce qui déjouerait `refuserRequetesExterieures`. Le seul
 * indice qui le trahit est l'en-tête `Host`, qui porte encore son nom de
 * domaine : il est vérifié avant tout le reste. Le port, lui, n'importe pas.
 */
function refuserHotesInconnus(req, res, suite) {
  const hote = String(req.get('Host') ?? '').toLowerCase().replace(/:\d+$/, '');
  if (HOTES_LOCAUX.has(hote)) return suite();
  res.status(403).json({ erreur: 'Requête refusée : adresse inconnue de l’application.' });
}

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
 * @param {boolean} [options.taches] lance les tâches de fond (copie externe,
 *   archives annuelles) : seulement pour l'application lancée pour de vrai,
 *   pas pour les tests.
 * @param {() => Promise<object[]>} [options.listerVolumes] clés et disques
 *   proposés pour la copie externe, à la place de ceux de la machine : les
 *   tests de l'interface y mettent des dossiers temporaires, pour ne jamais
 *   écrire sur une vraie clé.
 */
export function creerApp({
  dossierDonnees, dossierSauvegardes, actifs, arreter, taches = false, listerVolumes
} = {}) {
  const dossier = dossierDonnees ?? DOSSIER_DONNEES_DEFAUT;
  const stockage = creerStockage(dossier, dossierSauvegardes ? { dossierSauvegardes } : {});
  const pieces = creerPieces(dossier, stockage.dossierSauvegardes);
  const archives = creerArchives({ dossier: path.join(stockage.dossierSauvegardes, 'archives'), stockage, pieces });
  // Des volumes simulés vivent sur le disque du livre : ils ne sont pas écartés comme lui.
  const copieExterne = creerCopieExterne(listerVolumes
    ? { stockage, pieces, archives, listerVolumes, ecarterMemeDisque: false }
    : { stockage, pieces, archives });
  // Une mise à jour qui n'a pas pu démarrer : la version rétablie le dit une fois.
  let majEchouee = taches ? constaterEchecMaj() : null;

  // Au démarrage, sur un livre sain : la copie de secours et le double de
  // chaque PDF sont refaits s'ils manquent, et les sauvegardes récentes relues.
  const sain = !stockage.corruption() && !stockage.donneesAbsentes() && !stockage.indisponible();
  if (sain) {
    stockage.assurerCopieDeSecours();
    const citees = stockage.piecesCitees();
    pieces.redoubler(citees ?? new Set());
    // Ménage des PDF que plus rien ne cite (ni le livre, ni une sauvegarde).
    // Un fichier corrompu ou disparu (il peut reparaître) ne dit pas quelles
    // pièces il citait, et une sauvegarde illisible fait tout garder.
    if (citees) pieces.nettoyer(citees);
  }
  stockage.verifierSauvegardes();

  if (taches) {
    let minuterieArchives = null;
    stockage.surEcriture(() => {
      copieExterne.planifier();
      clearTimeout(minuterieArchives);
      minuterieArchives = setTimeout(() => archives.archiver().then(() => copieExterne.planifier()), DELAI_ARCHIVES_MS);
      minuterieArchives.unref();
    });
    setTimeout(() => archives.archiver().then(() => copieExterne.planifier()), 3000).unref();
    copieExterne.demarrer();
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(refuserHotesInconnus);
  app.use(refuserRequetesExterieures);
  // Limite généreuse : un import CSV de plusieurs milliers de lignes passe en JSON.
  app.use(express.json({ limit: '20mb' }));

  // ---- API -----------------------------------------------------------------
  // Un livre momentanément inaccessible (resté dans le nuage…) est relu avant
  // de répondre : l'interface le retrouve dès qu'il redevient lisible.
  app.use('/api', (req, res, suite) => {
    stockage.rafraichir();
    suite();
  });
  app.use('/api/recettes', routesRecettes(stockage, pieces));
  app.use('/api/achats', routesAchats(stockage, pieces));
  app.use('/api/clients', routesClients(stockage));
  app.use('/api/parametres', routesParametres(stockage));
  app.use('/api/exports', routesExports(stockage, pieces));
  app.use('/api/urssaf', routesUrssaf(stockage));
  app.use('/api/sauvegardes', routesSauvegardes(stockage));
  // Le livre et ses PDF dans un seul fichier, et sa reprise (clé, autre ordinateur).
  app.use('/api/sauvegarde', routesFichierSauvegarde(creerFichierSauvegarde({ stockage, pieces, copieExterne })));
  app.use('/api/securite', routesSecurite({ stockage, copieExterne, archives }));
  app.use('/api/maj', routesMaj(stockage, arreter));
  // L'échec d'une mise à jour a été montré à l'utilisateur : il ne l'est plus.
  app.post('/api/maj/echec-vu', (req, res) => {
    majEchouee = null;
    res.status(204).end();
  });

  // GET /api/tableau-de-bord?annee=2025 (année courante par défaut), avec les
  // recettes qui reviennent chaque mois et attendent celle d'aujourd'hui.
  app.get('/api/tableau-de-bord', (req, res) => {
    const annee = Number.parseInt(req.query.annee, 10);
    const recettes = stockage.listerRecettes();
    res.json({
      ...statistiquesTableauDeBord(recettes, {
        annee: Number.isInteger(annee) && annee >= 2000 && annee <= 2100 ? annee : null,
        achats: stockage.listerAchats()
      }),
      aRenouveler: recettesARenouveler(recettes, {
        aujourdhui: aujourdHuiIso(),
        ecartees: stockage.obtenirParametres().recurrencesEcartees ?? []
      })
    });
  });

  app.get('/api/systeme', (req, res) => {
    const parametres = stockage.obtenirParametres();
    const nombre = stockage.compter();
    res.json({
      version: VERSION,
      fichierDonnees: stockage.cheminFichier,
      dossierSauvegardes: stockage.dossierSauvegardes,
      corruption: stockage.corruption(),
      // Copie de secours impossible à écrire : l'utilisateur travaille sans
      // filet, les paramètres l'en avertissent.
      sauvegardesEnEchec: stockage.sauvegardesEnEchec(),
      // Fichier de données disparu alors que des sauvegardes subsistent :
      // l'interface propose de le reconstituer avant toute saisie.
      donneesAbsentes: stockage.donneesAbsentes(),
      // Livre présent mais momentanément illisible (resté dans le nuage…).
      indisponible: stockage.indisponible(),
      // Copie sur clé ou disque : l'indication discrète du menu en dépend.
      copieExterne: copieExterne.etat(),
      majEchouee,
      // Le registre des achats reste visible tant qu'il contient quelque
      // chose, même si l'activité déclarée ne l'exige plus.
      aDesAchats: nombre.achats > 0,
      // Pièces jointes : combien, quel poids, et où elles sont rangées.
      pieces: { ...stockage.bilanPieces(), dossier: pieces.dossier },
      // Première utilisation : l'interface dirige alors vers les Paramètres.
      premierLancement: nombre.recettes === 0 && nombre.clients === 0 &&
        !parametres.nomEntreprise && !parametres.typeActivite
    });
  });

  /**
   * Charge le jeu de démonstration : POST /api/demo.
   * Refusé si le livre contient déjà quoi que ce soit, pour ne jamais
   * recouvrir de vraies données.
   */
  app.post('/api/demo', async (req, res, suite) => {
    const vide = () => {
      const nombre = stockage.compter();
      return nombre.recettes === 0 && nombre.achats === 0 && nombre.clients === 0;
    };
    const refus = () => res.status(409).json({ erreur: 'Le jeu de démonstration ne se charge que sur un livre vide.' });
    if (!vide()) return refus();
    try {
      const jeu = construireJeuDemo();
      // Ce qui tient à la personne et non à l'entreprise fictive reste tel
      // quel : son prénom, ses préférences d'affichage et de copie. L'accueil,
      // lui, est terminé : on a choisi de découvrir avec l'exemple.
      const actuels = stockage.obtenirParametres();
      for (const cle of ['prenom', 'formatDate', 'devise', 'verifierMisesAJour', 'signalerAbsenceCopie']) {
        jeu.parametres[cle] = actuels[cle];
      }
      jeu.parametres.accueil = 'termine';
      await piecesDemo(jeu, (octets, nom) => pieces.enregistrer(octets, nom));
      // Le temps de créer les PDF, le livre a pu recevoir une ligne : on ne la
      // recouvre pas (les PDF orphelins partiront au prochain ménage).
      if (!vide()) return refus();
      stockage.chargerDemo(jeu);
      res.json({ charge: true });
    } catch (erreur) {
      suite(erreur);
    }
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ erreur: 'Route inconnue.' });
  });

  // ---- Fichiers statiques ----------------------------------------------------
  // « no-cache » : le navigateur redemande toujours si le fichier a changé
  // (réponse 304 s'il est identique). Sans cela, après une mise à jour, il
  // pourrait garder d'anciens modules et mêler deux versions de l'interface.
  const sansCache = (res) => res.setHeader('Cache-Control', 'no-cache');
  if (actifs) {
    app.use((req, res, suite) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return suite();
      const actif = actifs[req.path === '/' ? '/index.html' : req.path];
      if (!actif) return suite();
      sansCache(res);
      res.type(actif.type).send(actif.contenu);
    });
  } else {
    app.use('/partage', express.static(path.join(ICI, 'partage'), { setHeaders: sansCache }));
    app.use(express.static(path.join(RACINE, 'public'), { setHeaders: sansCache }));
  }

  // ---- Gestion d'erreurs -----------------------------------------------------
  // eslint-disable-next-line no-unused-vars -- Express identifie ce middleware à ses 4 paramètres.
  app.use((erreur, req, res, next) => {
    if (erreur.type === 'entity.parse.failed') {
      return res.status(400).json({ erreur: 'Corps de requête JSON invalide.' });
    }
    if (erreur.type === 'entity.too.large') {
      return res.status(413).json({
        erreur: req.is('application/pdf') ? 'Ce PDF dépasse 10 Mo.' : 'Envoi trop volumineux.'
      });
    }
    if (erreur.code === 'CORROMPU' || erreur.code === 'INDISPONIBLE') {
      return res.status(503).json({ erreur: erreur.message });
    }
    console.error(erreur);
    res.status(500).json({ erreur: 'Erreur interne du serveur.' });
  });

  return app;
}
