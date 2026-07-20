/**
 * Tests de la mécanique d'import commune aux deux registres : validation,
 * détection des doublons (dans le fichier et vis-à-vis de l'existant),
 * simulation, et sauvegarde préalable à toute écriture.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traiterImport, IMPORT_MAX_LIGNES } from '../src/import-registre.js';

/** Config minimale : une ligne est valide si `montant > 0`. */
function configDeTest(existantes = [], ecrites = []) {
  return {
    valider: (e) => e.montant > 0
      ? { erreurs: null, valeurs: { tiers: e.tiers, montant: e.montant, date: e.date } }
      : { erreurs: { montant: 'positif attendu' } },
    estDoublon: (v, liste) => liste.some((a) => a.tiers === v.tiers && a.montant === v.montant),
    lister: () => existantes,
    ajouterLot: (lot) => ecrites.push(...lot),
    resume: (v) => ({ date: v.date, tiers: v.tiers, montant: v.montant })
  };
}

const stockageFactice = { creerSauvegarde: () => 'sauvegarde.json' };

test('un corps sans lignes est refusé', () => {
  assert.equal(traiterImport(stockageFactice, {}, configDeTest()).erreur, 'Aucune ligne à importer.');
  assert.equal(traiterImport(stockageFactice, { lignes: [] }, configDeTest()).erreur, 'Aucune ligne à importer.');
});

test('un import trop volumineux est refusé', () => {
  const lignes = Array.from({ length: IMPORT_MAX_LIGNES + 1 }, () => ({ tiers: 'x', montant: 1, date: '2026-01-01' }));
  assert.match(traiterImport(stockageFactice, { lignes }, configDeTest()).erreur, /limité/);
});

test('la simulation compte sans rien écrire ni sauvegarder', () => {
  const ecrites = [];
  let sauvegardes = 0;
  const stockage = { creerSauvegarde: () => { sauvegardes += 1; return 's'; } };
  const { rapport } = traiterImport(stockage, {
    lignes: [{ tiers: 'A', montant: 10, date: '2026-01-01' }, { tiers: 'B', montant: -1, date: '2026-01-02' }],
    simulation: true
  }, configDeTest([], ecrites));

  assert.equal(rapport.valides, 1);
  assert.equal(rapport.erreurs.length, 1);
  assert.equal(rapport.importees, 0);
  assert.equal(ecrites.length, 0, 'rien n’est écrit');
  assert.equal(sauvegardes, 0, 'aucune sauvegarde en simulation');
});

test('un import réel sauvegarde puis écrit les lignes valides', () => {
  const ecrites = [];
  const { rapport } = traiterImport(stockageFactice, {
    lignes: [{ tiers: 'A', montant: 10, date: '2026-01-01' }]
  }, configDeTest([], ecrites));

  assert.equal(rapport.importees, 1);
  assert.equal(rapport.sauvegarde, 'sauvegarde.json');
  assert.equal(ecrites.length, 1);
});

test('les doublons sont écartés, dans le fichier comme vis-à-vis de l’existant', () => {
  const ecrites = [];
  const existantes = [{ tiers: 'Déjà', montant: 50 }];
  const { rapport } = traiterImport(stockageFactice, {
    lignes: [
      { tiers: 'Déjà', montant: 50, date: '2026-01-01' }, // doublon d'un existant
      { tiers: 'Neuf', montant: 20, date: '2026-01-02' },
      { tiers: 'Neuf', montant: 20, date: '2026-01-03' }  // doublon de la ligne précédente
    ]
  }, configDeTest(existantes, ecrites));

  assert.equal(rapport.valides, 1, 'une seule ligne réellement nouvelle');
  assert.equal(rapport.doublons.length, 2);
  assert.equal(ecrites.length, 1);
  // Le résumé d'un doublon est générique (date, tiers, montant).
  assert.deepEqual(rapport.doublons[0], { ligne: 1, date: '2026-01-01', tiers: 'Déjà', montant: 50 });
});

test('importerDoublons ajoute aussi les doublons', () => {
  const ecrites = [];
  const existantes = [{ tiers: 'Déjà', montant: 50 }];
  const { rapport } = traiterImport(stockageFactice, {
    lignes: [{ tiers: 'Déjà', montant: 50, date: '2026-01-01' }],
    importerDoublons: true
  }, configDeTest(existantes, ecrites));

  assert.equal(rapport.importees, 1);
  assert.equal(ecrites.length, 1);
});
