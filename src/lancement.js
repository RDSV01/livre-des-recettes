/**
 * Démarrage du serveur local, commun à `npm start` et à l'exécutable
 * autonome : verrou d'instance, écoute sur 127.0.0.1 uniquement, message
 * d'accueil et ouverture du navigateur.
 *
 * L'exécutable n'ouvre aucune fenêtre de console : rien de ce qui est écrit
 * ici ne doit être indispensable à l'utilisateur. Les deux situations qu'il
 * peut rencontrer se règlent donc toutes seules : une application déjà
 * ouverte est simplement rappelée à l'écran, et un port occupé est remplacé
 * par le suivant.
 */

import { creerApp, VERSION } from './app.js';
import { acquerirVerrou } from './verrou.js';
import { nettoyerAncienneVersion } from './maj.js';
import { ouvrirDansLeSysteme } from './emplacements.js';

/** Nombre de ports essayés avant d'abandonner (3000, 3001, 3002…). */
const PORTS_ESSAYES = 10;

/**
 * Lance l'application.
 *
 * @param {object} options
 * @param {string} options.dossierDonnees dossier du fichier de données.
 * @param {number} [options.port] premier port essayé (défaut : 3000).
 * @param {object} [options.actifs] interface servie depuis la mémoire.
 * @param {(erreur: Error) => void} [options.surEchec] appelé au lieu de
 *   `process.exit` quand l'application ne peut vraiment pas démarrer.
 */
export function demarrerServeur({ dossierDonnees, port = 3000, actifs, surEchec }) {
  const abandonner = (erreur) => {
    if (surEchec) return surEchec(erreur);
    console.error(erreur.message);
    process.exit(1);
  };

  // Une seule instance à la fois sur un même dossier de données : deux
  // applications qui écriraient en parallèle s'écraseraient mutuellement.
  let verrou;
  try {
    verrou = acquerirVerrou(dossierDonnees);
  } catch (erreur) {
    if (erreur.code !== 'VERROU') throw erreur;
    // L'application est déjà lancée : plutôt qu'un refus, on ramène à l'écran
    // la fenêtre de l'instance en cours (l'utilisateur a pu fermer l'onglet
    // sans arrêter l'application).
    const adresse = `http://localhost:${erreur.port ?? port}`;
    console.log(`  Le livre des recettes est déjà ouvert : ${adresse}`);
    if (process.env.LDR_NO_OPEN) process.exit(0);
    return ouvrirDansLeSysteme(adresse, () => process.exit(0));
  }

  // Reste d'une mise à jour précédente : l'ancien exécutable ne sert plus.
  nettoyerAncienneVersion();

  let serveur;
  // Libère la place (port et verrou) pour la nouvelle version qui va prendre
  // la suite après une mise à jour.
  const arreter = () => {
    verrou.liberer();
    serveur.close();
    serveur.closeAllConnections?.();
  };
  const app = creerApp({ dossierDonnees, actifs, arreter });

  const ecouter = (portEssai, restants) => {
    serveur = app.listen(portEssai, '127.0.0.1', () => {
      verrou.noterPort(portEssai);
      const adresse = `http://localhost:${portEssai}`;
      console.log('');
      console.log(`  Livre des recettes v${VERSION}`);
      console.log(`  Ouvert sur ${adresse} (vos données restent sur cette machine).`);
      console.log(`  Données : ${dossierDonnees}`);
      console.log('  Ctrl+C pour arrêter.');
      console.log('');
      if (!process.env.LDR_NO_OPEN) ouvrirDansLeSysteme(adresse);
    });

    serveur.on('error', (erreur) => {
      if (erreur.code !== 'EADDRINUSE') throw erreur;
      // Port occupé par un autre logiciel : on prend le suivant.
      if (restants > 0) return ecouter(portEssai + 1, restants - 1);
      verrou.liberer();
      abandonner(new Error(
        `Aucun port disponible entre ${port} et ${portEssai} pour ouvrir l’application. ` +
        'Fermez les logiciels qui les occupent, puis relancez.'
      ));
    });
  };

  ecouter(port, PORTS_ESSAYES - 1);
}
