/**
 * Tests de la recherche d'entreprise dans l'annuaire, par nom, SIREN ou SIRET.
 *
 * On ne teste pas l'appel réseau réel (dépendant d'un service externe) :
 * l'analyse de la réponse est faite de fonctions pures, et les recherches
 * sont exercées avec un `fetch` factice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraireEntreprise, extraireEntreprises, rechercherEntreprise, rechercherEntreprises } from '../src/entreprises.js';

const REPONSE = {
  total_results: 1,
  results: [
    {
      siren: '356000000',
      nom_complet: 'Café des Arts',
      nom_raison_sociale: 'CAFE DES ARTS',
      date_creation: '2019-04-02',
      etat_administratif: 'A',
      siege: { siret: '35600000000048', adresse: '12 RUE DES ARTS 69001 LYON', etat_administratif: 'A' },
      matching_etablissements: [
        { siret: '35600000000055', adresse: '3 PLACE DU MARCHE 69002 LYON', etat_administratif: 'F' }
      ]
    }
  ]
};

test('extraireEntreprise renvoie le nom, le SIRET demandé, l’adresse et l’état de cet établissement', () => {
  assert.deepEqual(extraireEntreprise(REPONSE, '35600000000055'), {
    nom: 'Café des Arts', siren: '356000000', siret: '35600000000055',
    adresse: '3 PLACE DU MARCHE 69002 LYON', active: false, creation: '2019-04-02'
  });
});

test('extraireEntreprise retombe sur le siège pour un SIREN', () => {
  const r = extraireEntreprise(REPONSE, '');
  assert.equal(r.siret, '35600000000048');
  assert.equal(r.adresse, '12 RUE DES ARTS 69001 LYON');
  assert.equal(r.active, true);
});

test('une adresse non diffusée n’est pas montrée', () => {
  const r = extraireEntreprise({ results: [{ nom_complet: 'X', siege: { siret: '1', adresse: '[NON-DIFFUSIBLE]' } }] });
  assert.equal(r.adresse, '');
});

test('extraireEntreprise renvoie null sans résultat', () => {
  assert.equal(extraireEntreprise({ results: [] }, '12345678200010'), null);
  assert.equal(extraireEntreprise({}, ''), null);
  assert.deepEqual(extraireEntreprises({}), []);
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

test('rechercherEntreprises cherche un nom : quelques résultats, et leur nombre total', async () => {
  let adresse = '';
  const fauxFetch = async (url) => { adresse = url; return { ok: true, json: async () => ({ ...REPONSE, total_results: 42 }) }; };
  const { entreprises, total } = await rechercherEntreprises('café des arts', { fetch: fauxFetch });
  assert.match(adresse, /q=caf%C3%A9%20des%20arts/);
  assert.match(adresse, /per_page=5/);
  assert.equal(entreprises[0].nom, 'Café des Arts');
  assert.equal(total, 42);
});

test('rechercherEntreprises passe par le numéro quand on tape un SIRET', async () => {
  const fauxFetch = async (url) => { assert.match(url, /per_page=1/); return { ok: true, json: async () => REPONSE }; };
  const { entreprises, total } = await rechercherEntreprises('356 000 000 00048', { fetch: fauxFetch });
  assert.equal(entreprises[0].siret, '35600000000048');
  assert.equal(total, 1);
});

test('rechercherEntreprises refuse une recherche trop courte, sans rien envoyer', async () => {
  const fauxFetch = async () => { throw new Error('ne doit pas être appelé'); };
  await assert.rejects(() => rechercherEntreprises('ab', { fetch: fauxFetch }), /3 lettres/);
});
