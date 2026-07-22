/**
 * Tests du contrôle qui précède un export.
 *
 * Deux exigences : ne jamais crier au loup sur un registre sain (l'utilisateur
 * cesserait de lire les avertissements), et ne rien laisser passer de ce qu'un
 * contrôleur verrait immédiatement.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlerRecettes, controlerAchats } from '../src/controle-export.js';

function recette(date, extra = {}) {
  return {
    dateEncaissement: date,
    client: 'Client test',
    libelle: 'Prestation',
    numeroFacture: 'F-001',
    montant: 100,
    modeReglement: 'virement',
    creeLe: '2026-01-01T00:00:00.000Z',
    ...extra
  };
}

function achat(date, extra = {}) {
  return {
    dateReglement: date,
    fournisseur: 'Fournisseur test',
    referenceFacture: 'A-001',
    montant: 50,
    modeReglement: 'carte',
    creeLe: '2026-01-01T00:00:00.000Z',
    ...extra
  };
}

/** Retrouve un point de contrôle par son libellé. */
const point = (rapport, debutLibelle) =>
  rapport.points.find((p) => p.libelle.startsWith(debutLibelle));

const PERIODE = { annee: 2026 };

test('un registre de recettes sain ne déclenche aucune alerte', () => {
  const recettes = [
    recette('2026-01-10', { numeroFacture: 'F-001' }),
    recette('2026-02-10', { numeroFacture: 'F-002' }),
    recette('2026-03-10', { numeroFacture: 'F-003' })
  ];
  const rapport = controlerRecettes(recettes, PERIODE, {});

  assert.equal(rapport.nombre, 3);
  assert.ok(rapport.points.length >= 6, 'tous les points sont passés en revue');
  assert.deepEqual(
    rapport.points.filter((p) => p.etat !== 'ok').map((p) => p.libelle),
    [],
    'rien à signaler'
  );
});

test('le contrôle ne regarde que la période demandée', () => {
  const recettes = [recette('2026-01-10'), recette('2025-01-10'), recette('2026-06-10')];

  assert.equal(controlerRecettes(recettes, { annee: 2026 }, {}).nombre, 2);
  assert.equal(controlerRecettes(recettes, { annee: 2026, mois: 1 }, {}).nombre, 1);
  assert.equal(controlerRecettes(recettes, { annee: 2025 }, {}).nombre, 1);
});

test('une mention légale absente est une erreur, pas un simple avertissement', () => {
  const rapport = controlerRecettes([recette('2026-01-10', { client: '   ' })], PERIODE, {});
  const client = point(rapport, 'Identité du client');

  assert.equal(client.etat, 'erreur');
  assert.match(client.detail, /1 ligne sans client/);
});

test('un mode de règlement inconnu est signalé, un mode personnalisé accepté', () => {
  const inconnu = controlerRecettes([recette('2026-01-10', { modeReglement: 'bitcoin' })], PERIODE, {});
  assert.equal(point(inconnu, 'Mode de règlement').etat, 'erreur');

  const personnalise = controlerRecettes(
    [recette('2026-01-10', { modeReglement: 'lydia' })],
    PERIODE,
    { modesPersonnalises: [{ code: 'lydia', libelle: 'Lydia' }] }
  );
  assert.equal(point(personnalise, 'Mode de règlement').etat, 'ok');
});

test('un numéro de facture manquant appelle l’attention sans être une erreur', () => {
  const rapport = controlerRecettes([
    recette('2026-01-10', { numeroFacture: 'F-001' }),
    recette('2026-02-10', { numeroFacture: '' })
  ], PERIODE, {});
  const numero = point(rapport, 'Numéro de facture');

  assert.equal(numero.etat, 'attention');
  assert.match(numero.detail, /1 recette sans numéro/);
});

test('un trou et un doublon dans la numérotation remontent ensemble', () => {
  const rapport = controlerRecettes([
    recette('2026-01-10', { numeroFacture: 'F-001' }),
    recette('2026-02-10', { numeroFacture: 'F-001' }),
    recette('2026-03-10', { numeroFacture: 'F-004' })
  ], PERIODE, {});
  const numerotation = point(rapport, 'Continuité de la numérotation');

  assert.equal(numerotation.etat, 'attention');
  assert.match(numerotation.detail, /en double/);
  assert.match(numerotation.detail, /manquants? dans la série/);
});

test('deux recettes identiques sont repérées comme doublon', () => {
  const rapport = controlerRecettes([
    recette('2026-01-10', { numeroFacture: '' }),
    recette('2026-01-10', { numeroFacture: '' })
  ], PERIODE, {});
  const doublons = point(rapport, 'Absence de doublons');

  assert.equal(doublons.etat, 'attention');
  assert.match(doublons.detail, /1 recette ressemble/);
});

test('la ventilation n’est contrôlée qu’en activité mixte', () => {
  const recettes = [recette('2026-01-10', { categorie: '' })];

  assert.equal(point(controlerRecettes(recettes, PERIODE, {}), 'Ventilation'), undefined);

  const mixte = controlerRecettes(recettes, PERIODE, { typeActivite: 'mixte' });
  assert.equal(point(mixte, 'Ventilation').etat, 'attention');
});

test('une période sans aucune ligne ne signale rien de faux', () => {
  const rapport = controlerRecettes([], PERIODE, {});

  assert.equal(rapport.nombre, 0);
  assert.deepEqual(rapport.points.filter((p) => p.etat !== 'ok'), [], 'aucun reproche à un registre vide');
});

test('un registre des achats sain ne déclenche aucune alerte', () => {
  const rapport = controlerAchats([achat('2026-01-10'), achat('2026-05-10', { referenceFacture: 'A-002' })], PERIODE, {});

  assert.equal(rapport.nombre, 2);
  assert.deepEqual(rapport.points.filter((p) => p.etat !== 'ok').map((p) => p.libelle), []);
});

test('un achat sans référence de justificatif appelle l’attention', () => {
  const rapport = controlerAchats([achat('2026-01-10', { referenceFacture: '' })], PERIODE, {});
  const reference = point(rapport, 'Référence de la pièce');

  assert.equal(reference.etat, 'attention');
  assert.match(reference.detail, /1 achat sans référence/);
});

test('un achat sans fournisseur ni montant valide est une erreur', () => {
  const rapport = controlerAchats([achat('2026-01-10', { fournisseur: '', montant: 0 })], PERIODE, {});

  assert.equal(point(rapport, 'Identité du fournisseur').etat, 'erreur');
  assert.equal(point(rapport, 'Montant de l').etat, 'erreur');
});
