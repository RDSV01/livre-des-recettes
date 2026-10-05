/**
 * Tests de l'historique Annuler / Rétablir du navigateur
 * (`public/js/historique.js`, module sans dépendance).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enregistrerAction, annulerAction, estAnnulable, annuler, retablir } from '../public/js/historique.js';

/** Une action qui note ce qu'on lui fait faire ; `echecs` fait refuser les premiers appels. */
function action(journal, nom, { echecs = 0 } = {}) {
  let restants = echecs;
  const jouer = (sens) => async () => {
    if (restants > 0) { restants -= 1; throw new Error(`${nom} refusée`); }
    journal.push(`${sens} ${nom}`);
  };
  return { annuler: jouer('annuler'), retablir: jouer('rétablir') };
}

/**
 * Repart d'un historique vide : tout ce qui reste est annulé, et la première
 * action enregistrée par le test effacera ce qui restait à rétablir.
 */
async function viderHistorique() {
  while (await annuler());
}

test('annuler puis rétablir rejouent les actions dans l’ordre', async () => {
  await viderHistorique();
  const journal = [];
  enregistrerAction(action(journal, 'A'));
  enregistrerAction(action(journal, 'B'));
  assert.equal(await annuler(), true);
  assert.equal(await annuler(), true);
  assert.equal(await retablir(), true);
  assert.deepEqual(journal, ['annuler B', 'annuler A', 'rétablir A']);
});

test('une nouvelle action efface ce qui restait à rétablir', async () => {
  await viderHistorique();
  const journal = [];
  enregistrerAction(action(journal, 'A'));
  await annuler();
  enregistrerAction(action(journal, 'B'));
  assert.equal(await retablir(), false);
});

test('une annulation refusée par le serveur garde l’action, qui reste à annuler', async () => {
  await viderHistorique();
  const journal = [];
  const fragile = enregistrerAction(action(journal, 'A', { echecs: 1 }));
  await assert.rejects(annuler(), /A refusée/);
  assert.equal(estAnnulable(fragile), true);
  assert.equal(await annuler(), true);
  assert.deepEqual(journal, ['annuler A']);
});

test('un rétablissement refusé reste à rétablir', async () => {
  await viderHistorique();
  const journal = [];
  const a = action(journal, 'A');
  let refus = 1;
  const fragile = { annuler: a.annuler, retablir: async () => { if (refus-- > 0) throw new Error('refus'); await a.retablir(); } };
  enregistrerAction(fragile);
  await annuler();
  await assert.rejects(retablir(), /refus/);
  assert.equal(estAnnulable(fragile), false);
  assert.equal(await retablir(), true);
  assert.equal(estAnnulable(fragile), true);
});

test('une action plus ancienne s’annule seule depuis son retour, et quitte l’historique', async () => {
  await viderHistorique();
  const journal = [];
  const ancienne = enregistrerAction(action(journal, 'A'));
  enregistrerAction(action(journal, 'B'));
  assert.equal(await annulerAction(ancienne), true);
  assert.equal(estAnnulable(ancienne), false);
  assert.equal(await annulerAction(ancienne), false);
  assert.equal(await annuler(), true);
  assert.deepEqual(journal, ['annuler A', 'annuler B']);
});
