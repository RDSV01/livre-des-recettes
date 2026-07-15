/**
 * Tests de la recherche d'entreprise par SIRET.
 *
 * On ne teste pas l'appel réseau réel (dépendant d'un service externe) :
 * `extraireEntreprise` (analyse de la réponse) est une fonction pure, et
 * `rechercherEntreprise` est exercée avec un `fetch` factice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraireEntreprise, rechercherEntreprise } from '../src/entreprises.js';

const REPONSE = {
  results: [
    {
      siren: '356000000',
      nom_complet: 'Café des Arts',
      nom_raison_sociale: 'CAFE DES ARTS',
      siege: { siret: '35600000000048' }
    }
  ]
};

test('extraireEntreprise renvoie le nom et le SIRET demandé', () => {
  const r = extraireEntreprise(REPONSE, '35600000000048');
  assert.deepEqual(r, { nom: 'Café des Arts', siret: '35600000000048' });
});

test('extraireEntreprise retombe sur le SIRET du siège pour un SIREN', () => {
  const r = extraireEntreprise(REPONSE, '');
  assert.equal(r.siret, '35600000000048');
});

test('extraireEntreprise renvoie null sans résultat', () => {
  assert.equal(extraireEntreprise({ results: [] }, '12345678900012'), null);
  assert.equal(extraireEntreprise({}, ''), null);
});

test('rechercherEntreprise refuse un identifiant mal formé', async () => {
  await assert.rejects(() => rechercherEntreprise('12'), /SIRET/);
});

test('rechercherEntreprise utilise le fetch injecté', async () => {
  const fauxFetch = async (url) => {
    assert.match(url, /35600000000048/);
    return { ok: true, json: async () => REPONSE };
  };
  const r = await rechercherEntreprise('35600000000048', { fetch: fauxFetch });
  assert.equal(r.nom, 'Café des Arts');
});

test('rechercherEntreprise signale un service indisponible', async () => {
  const fauxFetch = async () => { throw new Error('offline'); };
  await assert.rejects(() => rechercherEntreprise('35600000000048', { fetch: fauxFetch }), /indisponible/);
});
