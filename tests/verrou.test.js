/**
 * Tests du verrou d'instance : une seule application à la fois sur un même
 * dossier de données.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquerirVerrou } from '../src/verrou.js';

function dossierTemporaire() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'livre-recettes-verrou-'));
}

test('le verrou se pose, bloque une seconde instance, puis se libère', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  const liberer = acquerirVerrou(dossier);
  assert.ok(fs.existsSync(path.join(dossier, 'livre-des-recettes.verrou')));

  // Une seconde instance sur le même dossier est refusée.
  assert.throws(() => acquerirVerrou(dossier), (e) => e.code === 'VERROU');

  // Une fois libéré, le dossier redevient disponible.
  liberer();
  assert.equal(fs.existsSync(path.join(dossier, 'livre-des-recettes.verrou')), false);
  const seconde = acquerirVerrou(dossier);
  seconde();
});

test('un verrou abandonné (application plantée) est repris sans erreur', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  // Verrou « fossile » dont la dernière mise à jour date de plusieurs minutes.
  const chemin = path.join(dossier, 'livre-des-recettes.verrou');
  fs.writeFileSync(chemin, '12345', 'utf8');
  const ancien = new Date(Date.now() - 5 * 60 * 1000);
  fs.utimesSync(chemin, ancien, ancien);

  const liberer = acquerirVerrou(dossier);
  liberer();
});
