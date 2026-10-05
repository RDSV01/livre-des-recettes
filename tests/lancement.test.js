/**
 * Tests du démarrage (`src/lancement.js`), sur l'application lancée pour de
 * vrai par `server.js`, dans un processus à part.
 *
 * Tout ce qu'elle écrit (données, sauvegardes) va dans un dossier temporaire :
 * le dossier applicatif du système est redirigé (LOCALAPPDATA, HOME).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PORTS_REFUSES_PAR_LES_NAVIGATEURS } from '../src/lancement.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Lance `server.js` sur `port` et rend ce qu'il écrit une fois l'application ouverte. */
async function lancer(port, t) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'livre-recettes-lancement-'));
  const enfant = spawn(process.execPath, ['server.js'], {
    cwd: RACINE,
    env: {
      ...process.env,
      PORT: String(port),
      LDR_NO_OPEN: '1',
      LDR_DATA_DIR: path.join(dossier, 'donnees'),
      LOCALAPPDATA: dossier,
      HOME: dossier,
      USERPROFILE: dossier
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    enfant.kill();
    await new Promise((fin) => { if (enfant.exitCode !== null) fin(); else enfant.once('exit', fin); });
    fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  let sortie = '';
  enfant.stdout.on('data', (morceau) => { sortie += morceau; });
  enfant.stderr.on('data', (morceau) => { sortie += morceau; });
  for (let essai = 0; essai < 100 && !sortie.includes('Ctrl+C'); essai += 1) {
    await new Promise((suite) => { setTimeout(suite, 100); });
  }
  // Le temps qu'un éventuel second message arrive.
  await new Promise((suite) => { setTimeout(suite, 300); });
  return sortie;
}

test('un port que les navigateurs refusent est sauté', async (t) => {
  const sortie = await lancer(6665, t);
  const [annonce] = [...sortie.matchAll(/Ouvert sur http:\/\/localhost:(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(annonce >= 6670, `adresse annoncée hors des ports refusés (6665 à 6669) :\n${sortie}`);
  assert.equal(PORTS_REFUSES_PAR_LES_NAVIGATEURS.has(annonce), false);
});

test('un port occupé est remplacé par le suivant, sans annoncer celui qui était pris', async (t) => {
  const occupant = net.createServer();
  await new Promise((pret) => { occupant.listen(0, '127.0.0.1', pret); });
  t.after(() => new Promise((fin) => { occupant.close(fin); }));
  const pris = occupant.address().port;

  const sortie = await lancer(pris, t);
  const annonces = [...sortie.matchAll(/Ouvert sur http:\/\/localhost:(\d+)/g)].map((m) => Number(m[1]));
  assert.equal(annonces.length, 1, `une seule adresse annoncée :\n${sortie}`);
  assert.ok(annonces[0] > pris, `l’adresse annoncée n’est pas celle du port pris (${pris}) :\n${sortie}`);
});
