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

import fs from 'node:fs';
import { creerApp, VERSION } from './app.js';
import { acquerirVerrou } from './verrou.js';
import { nettoyerAncienneVersion, TEMOIN_MAJ } from './maj.js';
import { ouvrirDansLeSysteme } from './emplacements.js';

/** Nombre de ports essayés avant d'abandonner (3000, 3001, 3002…). */
const PORTS_ESSAYES = 10;

/**
 * Ports que les navigateurs refusent d'ouvrir (protocoles sensibles :
 * courrier, X11, IRC…), liste de Chromium et de Firefox. L'application n'y
 * écoute jamais : la page s'ouvrirait sur une erreur.
 */
export const PORTS_REFUSES_PAR_LES_NAVIGATEURS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103,
  104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513,
  514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720,
  1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080
]);

/**
 * Fait écouter `app` sur un port libre choisi par le système, en écartant
 * ceux que navigateurs et `fetch` refusent : certains systèmes les attribuent
 * aussi (Windows peut le faire dès le port 1024). Pour les tests et les
 * vérifications, qui démarrent l'application sur un port quelconque.
 *
 * @returns {Promise<import('node:http').Server>}
 */
export async function ecouterSurUnPortLibre(app) {
  for (;;) {
    const serveur = await new Promise((pret) => { const s = app.listen(0, '127.0.0.1', () => pret(s)); });
    if (!PORTS_REFUSES_PAR_LES_NAVIGATEURS.has(serveur.address().port)) return serveur;
    await new Promise((fin) => { serveur.close(fin); });
  }
}

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
  const app = creerApp({ dossierDonnees, actifs, arreter, taches: true });

  const ecouter = (portEssai, restants) => {
    if (PORTS_REFUSES_PAR_LES_NAVIGATEURS.has(portEssai)) return ecouter(portEssai + 1, restants);
    serveur = app.listen(portEssai, '127.0.0.1', (erreur) => {
      // Express rappelle aussi en cas d'échec (port occupé) : l'écouteur
      // `error` ci-dessous s'en charge, rien n'est annoncé ni ouvert.
      if (erreur) return;
      verrou.noterPort(portEssai);
      // Nouvelle version lancée par une mise à jour : l'ancienne attend ce
      // signe pour s'effacer ; sans lui, elle reprend la main (voir `maj.js`).
      if (process.env[TEMOIN_MAJ]) {
        try { fs.writeFileSync(process.env[TEMOIN_MAJ], String(process.pid), 'utf8'); } catch { /* l'ancienne rétablira sa version */ }
      }
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
