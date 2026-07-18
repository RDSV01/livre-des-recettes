/**
 * Tests du verrou d'instance : une seule application à la fois sur un même
 * dossier de données.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquerirVerrou } from '../src/verrou.js';

function dossierTemporaire() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'livre-recettes-verrou-'));
}

test('le verrou se pose, bloque une seconde instance, puis se libère', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  const verrou = acquerirVerrou(dossier);
  assert.ok(fs.existsSync(path.join(dossier, 'livre-des-recettes.verrou')));

  // Une seconde instance sur le même dossier est refusée.
  assert.throws(() => acquerirVerrou(dossier), (e) => e.code === 'VERROU');

  // Une fois libéré, le dossier redevient disponible.
  verrou.liberer();
  assert.equal(fs.existsSync(path.join(dossier, 'livre-des-recettes.verrou')), false);
  acquerirVerrou(dossier).liberer();
});

test('le verrou retient le port, pour rappeler la fenêtre déjà ouverte', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  const verrou = acquerirVerrou(dossier);
  verrou.noterPort(3007);

  // Un second lancement sait sur quelle adresse se trouve l'application.
  assert.throws(() => acquerirVerrou(dossier), (e) => e.code === 'VERROU' && e.port === 3007);
  verrou.liberer();
});

test('un verrou écrit par une version antérieure ne fait pas échouer la lecture', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  // Anciennes versions : le fichier ne contenait que le numéro de processus.
  // Celui du processus en cours vaut pour « une application bien vivante ».
  fs.writeFileSync(path.join(dossier, 'livre-des-recettes.verrou'), String(process.pid), 'utf8');
  assert.throws(() => acquerirVerrou(dossier), (e) => e.code === 'VERROU' && e.port === null);
});

test('un verrou tout frais laissé par une application arrêtée brutalement est repris', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  // Numéro d'un processus qui vient de se terminer : le verrou est récent,
  // mais plus personne ne le tient.
  const disparu = spawnSync(process.execPath, ['-e', '0']).pid;
  fs.writeFileSync(
    path.join(dossier, 'livre-des-recettes.verrou'),
    JSON.stringify({ pid: disparu, port: 3000 }),
    'utf8'
  );

  // L'utilisateur ne doit pas attendre trente secondes pour relancer.
  acquerirVerrou(dossier).liberer();
});

test('un verrou abandonné (application plantée) est repris sans erreur', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  // Verrou « fossile » dont la dernière mise à jour date de plusieurs minutes.
  const chemin = path.join(dossier, 'livre-des-recettes.verrou');
  fs.writeFileSync(chemin, '12345', 'utf8');
  const ancien = new Date(Date.now() - 5 * 60 * 1000);
  fs.utimesSync(chemin, ancien, ancien);

  acquerirVerrou(dossier).liberer();
});
