/**
 * Tests de l'analyse de numérotation des factures : détection des doublons
 * et des numéros manquants, quelle que soit la convention de numérotation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyserNumerotation, suggererNumeroSuivant } from '../src/partage/factures.js';

/** Fabrique une liste de recettes à partir de numéros de facture. */
const recettes = (...numeros) => numeros.map((numeroFacture) => ({ numeroFacture }));

test('un trou dans une série est signalé (exemple de référence)', () => {
  const { manquants } = analyserNumerotation(recettes('F202606-47', 'F202606-48', 'F202606-50'));
  assert.equal(manquants.length, 1);
  assert.equal(manquants[0].serie, 'F202606-');
  assert.deepEqual(manquants[0].numeros, ['F202606-49']);
});

test('des conventions différentes ne sont jamais comparées entre elles', () => {
  const { manquants, doublons } = analyserNumerotation(
    recettes('F202606-48', 'ABC-12', 'CLIENT-X', '2026-001')
  );
  assert.deepEqual(manquants, []);
  assert.deepEqual(doublons, []);
});

test('le remplissage par zéros de la série est respecté', () => {
  const { manquants } = analyserNumerotation(recettes('FACT-001', 'FACT-003'));
  assert.deepEqual(manquants[0].numeros, ['FACT-002']);
});

test('des numéros sans préfixe forment aussi une série', () => {
  const { manquants } = analyserNumerotation(recettes('47', '48', '50'));
  assert.equal(manquants[0].serie, '(sans préfixe)');
  assert.deepEqual(manquants[0].numeros, ['49']);
});

test('un grand écart n’est pas un trou plausible', () => {
  const { manquants } = analyserNumerotation(recettes('F-1', 'F-500'));
  assert.deepEqual(manquants, []);
});

test('un numéro seul dans sa série ne déclenche rien', () => {
  const { manquants } = analyserNumerotation(recettes('A-2026-0007', 'B-2026-0001'));
  assert.deepEqual(manquants, []);
});

test('les doublons exacts sont détectés, insensibles à la casse', () => {
  const { doublons } = analyserNumerotation(recettes('FAC-12', 'fac-12', 'FAC-13'));
  assert.equal(doublons.length, 1);
  assert.equal(doublons[0].numero, 'FAC-12');
  assert.equal(doublons[0].occurrences, 2);
});

test('un doublon ne crée pas de faux trou', () => {
  // 47, 47, 48 : le doublon ne doit pas faire croire à un manque.
  const { manquants, doublons } = analyserNumerotation(recettes('F-47', 'F-47', 'F-48'));
  assert.equal(doublons.length, 1);
  assert.deepEqual(manquants, []);
});

test('les factures vides sont ignorées', () => {
  const { doublons, manquants } = analyserNumerotation(recettes('', '', 'F-1'));
  assert.deepEqual(doublons, []);
  assert.deepEqual(manquants, []);
});

test('plusieurs trous dans une même série sont tous listés', () => {
  const { manquants } = analyserNumerotation(recettes('X-1', 'X-3', 'X-6'));
  assert.deepEqual(manquants[0].numeros, ['X-2', 'X-4', 'X-5']);
});

// ---- Suggestion du prochain numéro ---------------------------------------------

/** Fabrique avec date de saisie, pour choisir la série la plus récente. */
const saisie = (numeroFacture, creeLe) => ({ numeroFacture, creeLe });

test('suggererNumeroSuivant incrémente la série de la dernière saisie', () => {
  const suggestion = suggererNumeroSuivant([
    saisie('FAC-2026-017', '2026-07-01T10:00:00Z'),
    saisie('FAC-2026-018', '2026-07-02T10:00:00Z'),
    saisie('DEVIS-99', '2026-01-01T10:00:00Z') // série plus ancienne : ignorée
  ]);
  assert.equal(suggestion, 'FAC-2026-019');
});

test('suggererNumeroSuivant respecte le remplissage par zéros', () => {
  assert.equal(suggererNumeroSuivant([
    saisie('F001', '2026-01-01T10:00:00Z'),
    saisie('F009', '2026-01-02T10:00:00Z')
  ]), 'F010');
});

test('suggererNumeroSuivant reprend le maximum de la série, pas la dernière saisie', () => {
  assert.equal(suggererNumeroSuivant([
    saisie('A-50', '2026-01-02T10:00:00Z'),
    saisie('A-49', '2026-01-03T10:00:00Z') // saisie après coup, mais 50 existe
  ]), 'A-51');
});

test('suggererNumeroSuivant vaut null sans numéro exploitable', () => {
  assert.equal(suggererNumeroSuivant([]), null);
  assert.equal(suggererNumeroSuivant([saisie('', '2026-01-01T10:00:00Z')]), null);
  // Sans partie numérique finale, rien à incrémenter.
  assert.equal(suggererNumeroSuivant([saisie('CLIENT-X', '2026-01-01T10:00:00Z')]), null);
});
