/**
 * Point d'entrée : `npm start` (ou `node server.js`).
 *
 * L'application n'écoute que sur 127.0.0.1 : elle n'est accessible que
 * depuis la machine de l'utilisateur, jamais depuis le réseau.
 *
 * Variables d'environnement :
 *  - `PORT`         : port d'écoute (défaut : 3000) ;
 *  - `LDR_DATA_DIR` : dossier des données (défaut : « Documents/Livre des
 *                     recettes »), pratique pour pointer vers un dossier
 *                     synchronisé ou un jeu de données de développement ;
 *  - `LDR_NO_OPEN`  : si définie, n'ouvre pas le navigateur au démarrage.
 */

import { DOSSIER_DONNEES_DEFAUT } from './src/app.js';
import { demarrerServeur } from './src/lancement.js';

demarrerServeur({
  dossierDonnees: process.env.LDR_DATA_DIR || DOSSIER_DONNEES_DEFAUT,
  port: Number(process.env.PORT) || 3000
});
