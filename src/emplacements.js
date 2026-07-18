/**
 * Emplacements de l'utilisateur, et ouverture d'un dossier dans son système.
 *
 * Deux endroits distincts, et c'est volontaire :
 *
 *  - les DONNÉES vont dans « Documents/Livre des recettes ». Visible, facile à
 *    retrouver, à copier sur une clé ou à sauvegarder avec le reste des
 *    documents : le fichier appartient à l'utilisateur, il ne se cache pas ;
 *  - les SAUVEGARDES vont dans le dossier applicatif du système, hors du
 *    précédent. Supprimer ses documents ne détruit donc pas les copies, et
 *    l'application sait tout reconstituer.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const NOM_DOSSIER = 'Livre des recettes';
const NOM_APPLICATION = 'livre-des-recettes';

/**
 * Dossier des données : `Documents/Livre des recettes`, ou directement dans
 * le dossier personnel si cette machine n'a pas de dossier « Documents ».
 */
export function dossierDonneesParDefaut() {
  const documents = path.join(os.homedir(), 'Documents');
  const parent = fs.existsSync(documents) ? documents : os.homedir();
  return path.join(parent, NOM_DOSSIER);
}

/**
 * Dossier des sauvegardes automatiques :
 *  - Windows : `%LOCALAPPDATA%\livre-des-recettes\sauvegardes`
 *  - macOS   : `~/Library/Application Support/livre-des-recettes/sauvegardes`
 *  - Linux   : `~/.local/share/livre-des-recettes/sauvegardes`
 *
 * Chaque dossier de données a les siennes. Sans cela, lancer l'application
 * sur un autre dossier (`LDR_DATA_DIR`, jeu d'essai ou dossier synchronisé)
 * écraserait la copie de secours du dossier habituel : les sauvegardes
 * diraient alors le contraire des données qu'elles sont censées protéger.
 * Le dossier par défaut garde le chemin simple, les autres reçoivent une
 * empreinte de leur emplacement.
 */
export function dossierSauvegardesParDefaut(dossierDonnees = dossierDonneesParDefaut()) {
  const habituel = path.resolve(dossierDonneesParDefaut());
  const demande = path.resolve(dossierDonnees);
  if (demande === habituel) return path.join(dossierApplication(), 'sauvegardes');

  const empreinte = crypto.createHash('sha1').update(demande).digest('hex').slice(0, 8);
  return path.join(dossierApplication(), `sauvegardes-${empreinte}`);
}

function dossierApplication() {
  const maison = os.homedir();
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(maison, 'AppData', 'Local');
    return path.join(local, NOM_APPLICATION);
  }
  if (process.platform === 'darwin') {
    return path.join(maison, 'Library', 'Application Support', NOM_APPLICATION);
  }
  const donnees = process.env.XDG_DATA_HOME || path.join(maison, '.local', 'share');
  return path.join(donnees, NOM_APPLICATION);
}

/**
 * Montre une cible à l'utilisateur : un dossier dans son explorateur de
 * fichiers, une adresse ou un fichier dans son navigateur.
 *
 * Sous Windows, l'explorateur est appelé directement plutôt que par
 * `cmd /c start` : passer par l'interpréteur de commandes fait apparaître une
 * fenêtre noire le temps d'un clignement d'œil. La cible est passée en
 * argument, jamais concaténée dans une ligne de commande : les espaces et les
 * guillemets d'un chemin ne peuvent donc rien casser.
 *
 * L'attente n'est pas un détail : le lancement est asynchrone, et quitter le
 * processus sans l'attendre tuerait la commande avant qu'elle n'ait ouvert
 * quoi que ce soit.
 */
export function ouvrirDansLeSysteme(cible, apres = () => {}) {
  const commande =
    process.platform === 'win32' ? 'explorer.exe' :
    process.platform === 'darwin' ? 'open' :
    'xdg-open';

  let fini = false;
  const terminer = () => {
    if (fini) return;
    fini = true;
    apres();
  };

  const enfant = spawn(commande, [cible], { detached: true, stdio: 'ignore', windowsHide: true });
  // `explorer.exe` rend la main aussitôt, parfois avec un code non nul même
  // quand tout s'est bien passé : seule compte la fin du lancement.
  enfant.on('close', terminer);
  enfant.on('error', terminer);
  // Filet de sécurité si la commande ne rend jamais la main.
  setTimeout(terminer, 5000).unref();
}
