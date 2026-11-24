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
 *
 * Le bouton « Banc d'essai », en bas de l'écran, met à portée de clic ce qui
 * se produit rarement : une autre date du jour, un livre chargé, un seuil
 * dépassé, une déclaration en retard, une clé retirée, une panne… (voir
 * essai/serveur.mjs et essai/client/). La copie externe n'y voit qu'une clé
 * simulée, dans un dossier temporaire : jamais une vraie clé.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dossierSauvegardesParDefaut } from '../src/emplacements.js';
import { acquerirVerrou } from '../src/verrou.js';
import { demarrerServeur } from '../src/lancement.js';
import { bancEssai } from './essai/serveur.mjs';

// ---- Date du jour simulée -------------------------------------------------------------
// Tout le processus voit la même date décalée : calculs, sauvegardes, échéances.
// Le navigateur reçoit le même décalage (voir essai/serveur.mjs).
const DateReelle = Date;
let decalage = 0;
class DateSimulee extends DateReelle {
  constructor(...valeurs) { super(...(valeurs.length ? valeurs : [DateReelle.now() + decalage])); }
  static now() { return DateReelle.now() + decalage; }
}
globalThis.Date = DateSimulee;
const horloge = {
  decalage: () => decalage,
  /** Le jour `iso`, à l'heure qu'il est ; `null` : le vrai jour. */
  fixer(iso) {
    if (!iso) { decalage = 0; return; }
    const maintenant = new DateReelle();
    const [a, m, j] = iso.split('-').map(Number);
    decalage = new DateReelle(a, m - 1, j, maintenant.getHours(), maintenant.getMinutes(), maintenant.getSeconds()) - maintenant;
  }
};

const garder = process.argv.includes('--garder');
const dossier = path.join(os.tmpdir(), 'livre-des-recettes-essai');
const sauvegardes = dossierSauvegardesParDefaut(dossier);
const dossierCle = path.join(os.tmpdir(), 'livre-des-recettes-essai-cle');
const effacer = () => {
  for (const d of [dossier, sauvegardes, dossierCle]) fs.rmSync(d, { recursive: true, force: true });
};

// ---- Clé de copie simulée ---------------------------------------------------------------
let cleBranchee = true;
const cle = { branchee: () => cleBranchee, brancher: (oui) => { cleBranchee = oui; } };
const listerVolumes = async () => {
  if (!cleBranchee) return [];
  fs.mkdirSync(dossierCle, { recursive: true });
  return [{ chemin: dossierCle, libelle: 'CLE D’ESSAI (T:)', amovible: true, taille: 8e9, libre: 4e9 }];
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

demarrerServeur({
  dossierDonnees: dossier,
  port: Number(process.env.PORT) || 3100,
  listerVolumes,
  essai: bancEssai({ horloge, cle })
});

// Posé après le verrou de l'application : celui-ci se retire d'abord.
if (neuf) process.on('exit', effacer);
