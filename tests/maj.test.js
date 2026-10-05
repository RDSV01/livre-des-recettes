/**
 * Tests de la mise à jour : comparaison des numéros de version et refus de
 * se remplacer quand l'application tourne depuis les sources.
 *
 * Rien n'est demandé au réseau ici : la recherche d'une version publiée est
 * volontairement tolérante (hors ligne, elle ne doit rien casser).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  comparerVersions, estExecutable, appliquerMiseAJour, redemarrer, nettoyerAncienneVersion,
  surveillerDemarrage, constaterEchecMaj
} from '../src/maj.js';

test('comparerVersions ordonne les versions, y compris à deux chiffres', () => {
  assert.ok(comparerVersions('1.4.0', '1.3.0') > 0);
  assert.ok(comparerVersions('1.10.0', '1.9.0') > 0, '10 est plus récent que 9');
  assert.ok(comparerVersions('2.0.0', '1.99.99') > 0);
  assert.equal(comparerVersions('1.3.0', '1.3.0'), 0);
  assert.equal(comparerVersions('v1.3.0', '1.3.0'), 0, 'le « v » du tag est ignoré');
  assert.ok(comparerVersions('1.3.0', '1.3.1') < 0);
});

test('lancée depuis les sources, l’application ne se remplace pas elle-même', async () => {
  assert.equal(estExecutable(), false, 'les tests tournent avec « node »');
  await assert.rejects(() => appliquerMiseAJour(), /git pull/);
});

test('nettoyerAncienneVersion ne fait rien depuis les sources et n’échoue jamais', () => {
  // Un fichier verrouillé par l'antivirus ne doit pas empêcher le démarrage.
  assert.doesNotThrow(() => nettoyerAncienneVersion());
});

test('le redémarrage libère d’abord le port et le verrou', () => {
  // `redemarrer` programme le lancement de la nouvelle version : seul
  // l'ordre nous intéresse ici, le processus de test n'est pas relancé.
  let libere = false;
  const minuteur = globalThis.setTimeout;
  globalThis.setTimeout = () => ({ unref() {} }); // le relancement n'a pas lieu
  try {
    redemarrer({ arreter: () => { libere = true; } });
  } finally {
    globalThis.setTimeout = minuteur;
  }
  assert.equal(libere, true, 'la place doit être libérée avant de relancer');
});

// ---- Mise à jour qui ne démarre pas : l'ancienne version reprend la main ------------

/** Une nouvelle version simulée : un processus qu'on peut arrêter. */
function enfantSimule() {
  const enfant = new EventEmitter();
  enfant.tue = false;
  enfant.kill = () => { enfant.tue = true; };
  return enfant;
}

test('une nouvelle version qui démarre : l’ancienne s’efface sans rien toucher', async () => {
  const temoin = path.join(os.tmpdir(), `livre-recettes-temoin-${process.pid}-ok`);
  const enfant = enfantSimule();
  let retablie = false;
  setTimeout(() => fs.writeFileSync(temoin, '1'), 50);
  const issue = await surveillerDemarrage({ temoin, enfant, delaiMs: 5000, retablir: () => { retablie = true; }, relancer: () => {} });
  assert.equal(issue, 'reussi');
  assert.equal(retablie, false);
  assert.equal(fs.existsSync(temoin), false, 'le témoin est retiré');
});

test('une nouvelle version qui s’arrête net : l’ancienne est remise en place et relancée', async () => {
  const temoin = path.join(os.tmpdir(), `livre-recettes-temoin-${process.pid}-plante`);
  const enfant = enfantSimule();
  const actions = [];
  setTimeout(() => enfant.emit('exit', 1), 50);
  const issue = await surveillerDemarrage({
    temoin, enfant, version: '9.9.9', delaiMs: 5000,
    retablir: () => actions.push('retablir'), relancer: () => actions.push('relancer')
  });
  assert.equal(issue, 'retabli');
  assert.deepEqual(actions, ['retablir', 'relancer']);
  // La version rétablie saura dire laquelle n'a pas pu démarrer, une seule fois.
  assert.equal(constaterEchecMaj()?.version, '9.9.9');
  assert.equal(constaterEchecMaj(), null);
});

test('même si l’ancien exécutable ne peut pas être remis, une version est relancée', async () => {
  const temoin = path.join(os.tmpdir(), `livre-recettes-temoin-${process.pid}-retenu`);
  const enfant = enfantSimule();
  const actions = [];
  setTimeout(() => enfant.emit('exit', 1), 50);
  const issue = await surveillerDemarrage({
    temoin, enfant, version: '9.9.8', delaiMs: 5000,
    retablir: () => { throw Object.assign(new Error('fichier retenu'), { code: 'EBUSY' }); },
    relancer: () => actions.push('relancer')
  });
  assert.equal(issue, 'retabli');
  assert.deepEqual(actions, ['relancer'], 'l’utilisateur ne reste jamais sans application');
  assert.equal(constaterEchecMaj()?.version, '9.9.8'); // consommé : rien ne reste pour la vraie application
});

test('une nouvelle version qui ne répond pas : arrêtée au bout du délai, et l’ancienne revient', async () => {
  const temoin = path.join(os.tmpdir(), `livre-recettes-temoin-${process.pid}-muet`);
  const enfant = enfantSimule();
  const issue = await surveillerDemarrage({ temoin, enfant, delaiMs: 400, retablir: () => {}, relancer: () => {} });
  assert.equal(issue, 'retabli');
  assert.equal(enfant.tue, true);
  constaterEchecMaj();
});
