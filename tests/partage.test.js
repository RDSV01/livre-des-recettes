/**
 * Tests des modules partagés : dates, montants, texte.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estDateIso, formaterDate, analyserDateSouple, trimestreDe
} from '../src/partage/dates.js';
import { analyserMontant, sommeMontants, enCentimes } from '../src/partage/montants.js';
import { normaliserTexte } from '../src/partage/texte.js';

test('estDateIso accepte les dates réelles et refuse le reste', () => {
  assert.equal(estDateIso('2026-07-15'), true);
  assert.equal(estDateIso('2026-02-29'), false); // 2026 n'est pas bissextile
  assert.equal(estDateIso('2024-02-29'), true);  // 2024 l'est
  assert.equal(estDateIso('2026-13-01'), false);
  assert.equal(estDateIso('15/07/2026'), false);
  assert.equal(estDateIso(''), false);
});

test('formaterDate suit le format des paramètres', () => {
  assert.equal(formaterDate('2026-07-15', 'JJ/MM/AAAA'), '15/07/2026');
  assert.equal(formaterDate('2026-07-15', 'JJ-MM-AAAA'), '15-07-2026');
  assert.equal(formaterDate('2026-07-15', 'AAAA-MM-JJ'), '2026-07-15');
});

test('analyserDateSouple comprend les formats usuels des tableurs', () => {
  assert.equal(analyserDateSouple('2026-07-15'), '2026-07-15');
  assert.equal(analyserDateSouple('15/07/2026'), '2026-07-15');
  assert.equal(analyserDateSouple('5/7/2026'), '2026-07-05');
  assert.equal(analyserDateSouple('15-07-26'), '2026-07-15');
  assert.equal(analyserDateSouple('15.07.2026'), '2026-07-15');
  assert.equal(analyserDateSouple('32/07/2026'), null);
  assert.equal(analyserDateSouple('n’importe quoi'), null);
});

test('trimestreDe regroupe les mois par trimestre civil', () => {
  assert.equal(trimestreDe(1), 1);
  assert.equal(trimestreDe(3), 1);
  assert.equal(trimestreDe(4), 2);
  assert.equal(trimestreDe(12), 4);
});

test('analyserMontant comprend les écritures françaises et anglaises', () => {
  assert.equal(analyserMontant(12.5), 12.5);
  assert.equal(analyserMontant('1234.56'), 1234.56);
  assert.equal(analyserMontant('1234,56'), 1234.56);
  assert.equal(analyserMontant('1 234,56 €'), 1234.56);
  assert.equal(analyserMontant('1.234,56'), 1234.56);
  assert.equal(analyserMontant('1,234.56'), 1234.56);
  assert.equal(analyserMontant('1.234'), 1234);   // 3 décimales : séparateur de milliers
  assert.equal(analyserMontant('12,5'), 12.5);
  assert.equal(analyserMontant('abc'), null);
  assert.equal(analyserMontant(''), null);
  assert.equal(analyserMontant(null), null);
});

test('sommeMontants évite les erreurs des flottants', () => {
  // En flottant naïf : 0.1 + 0.2 = 0.30000000000000004
  assert.equal(sommeMontants([0.1, 0.2]), 0.3);
  assert.equal(sommeMontants([19.99, 0.01, 100]), 120);
  assert.equal(enCentimes(19.99), 1999);
});

test('normaliserTexte ignore casse, accents et espaces superflus', () => {
  assert.equal(normaliserTexte('  Boulangerie   Dupré '), 'boulangerie dupre');
  assert.equal(normaliserTexte('CRÈME brûlée'), 'creme brulee');
  assert.equal(normaliserTexte(null), '');
});
