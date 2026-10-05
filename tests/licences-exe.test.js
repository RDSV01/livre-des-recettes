/**
 * Tests du texte des licences joint à l'exécutable (`scripts/licences-exe.mjs`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { licencesEmbarquees } from '../scripts/licences-exe.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const paquet = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));

test('le texte joint à l’exécutable couvre Node.js et chaque module embarqué, pas les outils', async () => {
  const texte = await licencesEmbarquees(RACINE, { lireLicenceNode: async () => 'Licence de Node.js' });
  assert.match(texte, new RegExp(`^Node\\.js ${process.version.replace(/\./g, '\\.')}\\n=+\\n\\nLicence de Node\\.js$`, 'm'));
  for (const nom of Object.keys(paquet.dependencies)) assert.match(texte, new RegExp(`^${nom} \\d`, 'm'), `${nom} présent`);
  // Les sous-modules aussi : ceux d'Express, par exemple.
  assert.match(texte, /^body-parser \d/m);
  for (const nom of Object.keys(paquet.devDependencies)) assert.doesNotMatch(texte, new RegExp(`^${nom} \\d`, 'm'), `${nom} absent`);
  assert.match(texte, /Permission is hereby granted/);
  // Un bloc par module installé pour l'application, ni plus ni moins (plus celui de Node.js).
  const installes = new Set(execSync('npm ls --omit=dev --all --parseable', { cwd: RACINE, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean).slice(1));
  const blocs = texte.split('\n').filter((ligne, i, lignes) => lignes[i - 1]?.startsWith('====') && lignes[i + 1]?.startsWith('===='));
  assert.equal(blocs.length, installes.size + 1);
});
