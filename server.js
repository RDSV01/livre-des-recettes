/**
 * Point d'entrée : `npm start` (ou `node server.js`).
 *
 * L'application n'écoute que sur 127.0.0.1 : elle n'est accessible que
 * depuis la machine de l'utilisateur, jamais depuis le réseau.
 *
 * Variables d'environnement :
 *  - `PORT`         : port d'écoute (défaut : 3000) ;
 *  - `LDR_DATA_DIR` : dossier des données (défaut : `./data`), pratique
 *                     pour pointer vers un dossier synchronisé ;
 *  - `LDR_NO_OPEN`  : si définie, n'ouvre pas le navigateur au démarrage.
 */

import { exec } from 'node:child_process';
import { creerApp, VERSION, DOSSIER_DONNEES_DEFAUT } from './src/app.js';
import { acquerirVerrou } from './src/verrou.js';

const port = Number(process.env.PORT) || 3000;
const dossierDonnees = process.env.LDR_DATA_DIR || DOSSIER_DONNEES_DEFAUT;

// Une seule instance à la fois sur un même dossier de données : deux
// applications qui écriraient en parallèle s'écraseraient mutuellement.
try {
  acquerirVerrou(dossierDonnees);
} catch (erreur) {
  if (erreur.code !== 'VERROU') throw erreur;
  console.error(erreur.message);
  process.exit(1);
}

const app = creerApp({ dossierDonnees });

const serveur = app.listen(port, '127.0.0.1', () => {
  const adresse = `http://localhost:${port}`;
  console.log('');
  console.log(`  Livre des recettes v${VERSION}`);
  console.log(`  Ouvert sur ${adresse} (vos données restent sur cette machine).`);
  console.log('  Ctrl+C pour arrêter.');
  console.log('');
  if (!process.env.LDR_NO_OPEN) ouvrirNavigateur(adresse);
});

serveur.on('error', (erreur) => {
  if (erreur.code === 'EADDRINUSE') {
    console.error(
      `Le port ${port} est déjà utilisé (application déjà lancée ?). ` +
      `Relancez avec un autre port : PORT=3001 npm start`
    );
    process.exit(1);
  }
  throw erreur;
});

/** Ouvre le navigateur par défaut ; un échec n'est jamais bloquant. */
function ouvrirNavigateur(adresse) {
  const commande =
    process.platform === 'win32' ? `start "" "${adresse}"` :
    process.platform === 'darwin' ? `open "${adresse}"` :
    `xdg-open "${adresse}"`;
  exec(commande, () => {});
}
