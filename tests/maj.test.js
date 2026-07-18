/**
 * Tests de la mise à jour : comparaison des numéros de version et refus de
 * se remplacer quand l'application tourne depuis les sources.
 *
 * Rien n'est demandé au réseau ici : la recherche d'une version publiée est
 * volontairement tolérante (hors ligne, elle ne doit rien casser).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  comparerVersions, estExecutable, appliquerMiseAJour, redemarrer, nettoyerAncienneVersion
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
