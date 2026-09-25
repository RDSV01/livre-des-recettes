/**
 * Mode essai : `npm run essai`.
 *
 * L'application sur un livre vide, dans un dossier temporaire : de quoi
 * refaire l'accueil guidé du premier lancement, ou tenter une manipulation,
 * sans jamais toucher au vrai livre. Ni son fichier, ni ses pièces jointes,
 * ni ses sauvegardes : celles d'un autre dossier de données sont rangées à
 * part (voir `dossierSauvegardesParDefaut`). Il écoute sur un autre port
 * (3100), donc le navigateur lui garde aussi ses propres préférences
 * d'affichage.
 *
 * Le livre d'essai repart de zéro à chaque lancement et s'efface à l'arrêt
 * (Ctrl+C). `npm run essai -- --garder` le conserve d'un lancement à l'autre :
 * pratique pour vérifier qu'un accueil interrompu reprend bien.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dossierSauvegardesParDefaut } from '../src/emplacements.js';
import { acquerirVerrou } from '../src/verrou.js';
import { demarrerServeur } from '../src/lancement.js';

const garder = process.argv.includes('--garder');
const dossier = path.join(os.tmpdir(), 'livre-des-recettes-essai');
const sauvegardes = dossierSauvegardesParDefaut(dossier);
const effacer = () => {
  for (const d of [dossier, sauvegardes]) fs.rmSync(d, { recursive: true, force: true });
};

/** Un essai déjà lancé : il n'est pas effacé sous ses pieds, sa fenêtre est rouverte. */
function essaiEnCours() {
  try {
    acquerirVerrou(dossier).liberer();
    return false;
  } catch (erreur) {
    if (erreur.code === 'VERROU') return true;
    throw erreur;
  }
}

const enCours = essaiEnCours();
const neuf = !garder && !enCours;
if (neuf) effacer();

console.log('');
console.log('  MODE ESSAI : livre temporaire, votre vrai livre n’est pas touché.');
console.log(garder
  ? '  Le livre d’essai est conservé d’un lancement à l’autre.'
  : '  Il repart de zéro à chaque lancement et s’efface à l’arrêt.');

demarrerServeur({ dossierDonnees: dossier, port: Number(process.env.PORT) || 3100 });

// Posé après le verrou de l'application : celui-ci se retire d'abord.
if (neuf) process.on('exit', effacer);
