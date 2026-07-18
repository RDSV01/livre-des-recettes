/**
 * Tests de l'emplacement des sauvegardes : il doit se trouver hors du dossier
 * de données, là où le système range les données applicatives.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dossierDonneesParDefaut, dossierSauvegardesParDefaut } from '../src/emplacements.js';

test('les données vont dans un dossier « Livre des recettes » visible', () => {
  const dossier = dossierDonneesParDefaut();

  assert.ok(path.isAbsolute(dossier));
  assert.ok(dossier.startsWith(os.homedir()), 'chez l’utilisateur, jamais à côté de l’exécutable');
  assert.match(dossier, /Livre des recettes$/);
});

test('les données et les sauvegardes ne sont pas au même endroit', () => {
  // C'est toute la garantie : supprimer l'un ne détruit pas l'autre.
  const donnees = dossierDonneesParDefaut();
  const copies = dossierSauvegardesParDefaut();
  assert.notEqual(donnees, copies);
  assert.ok(!copies.startsWith(donnees + path.sep), 'les copies ne sont pas à l’intérieur des données');
});

test('les sauvegardes sont rangées dans le dossier applicatif de l’utilisateur', () => {
  const dossier = dossierSauvegardesParDefaut();

  assert.ok(path.isAbsolute(dossier), 'un chemin absolu, indépendant du dossier courant');
  assert.ok(dossier.startsWith(os.homedir()), 'sous le dossier personnel de l’utilisateur');
  assert.match(dossier, /livre-des-recettes/);
  assert.match(dossier, /sauvegardes$/);

  // L'emplacement attendu diffère selon le système.
  const attendu = {
    win32: /AppData[\\/]Local/i,
    darwin: /Library[\\/]Application Support/,
    linux: /\.local[\\/]share|XDG/
  }[process.platform];
  if (attendu) assert.match(dossier, attendu);
});

test('l’ouverture ne passe jamais par l’interpréteur de commandes', () => {
  // Une fenêtre noire apparaissait brièvement à chaque ouverture : `cmd.exe`
  // est de sous-système « console », Windows lui dessine donc une fenêtre,
  // même pour une commande qui dure dix millisecondes. Le programme
  // d'ouverture est désormais appelé directement.
  //
  // L'invariant se vérifie sur le texte du module : appeler la fonction
  // ouvrirait pour de bon une fenêtre sur la machine qui lance les tests.
  const source = fs.readFileSync(
    fileURLToPath(new URL('../src/emplacements.js', import.meta.url)), 'utf8'
  ).replace(/^\s*(\/\/|\*|\/\*).*$/gm, ''); // hors commentaires

  assert.doesNotMatch(source, /\bexec(Sync|File)?\s*\(/, 'exec lance un interpréteur de commandes');
  assert.doesNotMatch(source, /shell\s*:\s*true/, 'shell: true lance un interpréteur de commandes');
  assert.match(source, /windowsHide:\s*true/, 'le lancement reste silencieux sous Windows');
});

test('l’emplacement est stable d’un appel à l’autre', () => {
  // Sans quoi les sauvegardes se disperseraient à chaque démarrage.
  assert.equal(dossierSauvegardesParDefaut(), dossierSauvegardesParDefaut());
});

test('chaque dossier de données a ses propres sauvegardes', () => {
  // Un jeu d'essai (LDR_DATA_DIR) ne doit pas écraser la copie de secours
  // du dossier habituel : elle protégerait alors d'autres données que les
  // siennes, ce qui est pire que pas de sauvegarde du tout.
  const habituel = dossierSauvegardesParDefaut(dossierDonneesParDefaut());
  const essai = dossierSauvegardesParDefaut(path.join(os.tmpdir(), 'jeu-d-essai'));
  const autre = dossierSauvegardesParDefaut(path.join(os.tmpdir(), 'un-autre-jeu'));

  assert.notEqual(essai, habituel);
  assert.notEqual(essai, autre);
  assert.match(habituel, /sauvegardes$/, 'le cas courant garde un chemin simple');
  assert.equal(essai, dossierSauvegardesParDefaut(path.join(os.tmpdir(), 'jeu-d-essai')));
});
