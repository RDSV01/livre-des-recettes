/**
 * Tests des recettes qui reviennent chaque mois : quand le tableau de bord
 * propose d'ajouter celle du mois, et quand il s'en garde.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recettesARenouveler, cleRecurrence } from '../src/partage/recurrences.js';

const maintenance = (date, montant = 120) =>
  ({ dateEncaissement: date, client: 'Café des Arts', libelle: 'Maintenance mensuelle', montant });

const TROIS_MOIS = [maintenance('2026-07-15'), maintenance('2026-08-14'), maintenance('2026-09-16')];

test('trois mois de suite : celle du mois est proposée une fois son jour venu', () => {
  const proposees = recettesARenouveler(TROIS_MOIS, { aujourdhui: '2026-10-20' });
  assert.equal(proposees.length, 1);
  assert.equal(proposees[0].derniere.dateEncaissement, '2026-09-16');
  assert.equal(proposees[0].cle, cleRecurrence(TROIS_MOIS[0]));
});

test('pas avant le jour où elle arrive d’habitude (le plus tôt des trois derniers mois)', () => {
  assert.equal(recettesARenouveler(TROIS_MOIS, { aujourdhui: '2026-10-13' }).length, 0);
  assert.equal(recettesARenouveler(TROIS_MOIS, { aujourdhui: '2026-10-14' }).length, 1);
});

test('un jour habituel au-delà de la fin du mois vaut le dernier jour', () => {
  const finDeMois = [maintenance('2026-11-30'), maintenance('2026-12-31'), maintenance('2027-01-31')];
  assert.equal(recettesARenouveler(finDeMois, { aujourdhui: '2027-02-27' }).length, 0);
  assert.equal(recettesARenouveler(finDeMois, { aujourdhui: '2027-02-28' }).length, 1);
});

test('une recette déjà saisie pour un mois à venir n’avance pas la proposition', () => {
  const avecNovembre = [...TROIS_MOIS, maintenance('2026-11-01')];
  assert.equal(recettesARenouveler(avecNovembre, { aujourdhui: '2026-10-13' }).length, 0);
  const proposees = recettesARenouveler(avecNovembre, { aujourdhui: '2026-10-14' });
  assert.equal(proposees.length, 1);
  assert.equal(proposees[0].derniere.dateEncaissement, '2026-09-16', 'le modèle est la dernière encaissée');
});

test('déjà encaissée ce mois-ci : rien à proposer', () => {
  const avecOctobre = [...TROIS_MOIS, maintenance('2026-10-15')];
  assert.equal(recettesARenouveler(avecOctobre, { aujourdhui: '2026-10-20' }).length, 0);
});

test('ajoutée ce mois-ci à un autre montant (tarif changé) : plus proposée non plus', () => {
  const avecOctobre = [...TROIS_MOIS, maintenance('2026-10-15', 130)];
  assert.equal(recettesARenouveler(avecOctobre, { aujourdhui: '2026-10-20' }).length, 0);
});

test('une habitude rompue (un mois manque) ou trop courte n’est pas proposée', () => {
  const rompue = [maintenance('2026-06-15'), maintenance('2026-08-14'), maintenance('2026-09-16')];
  assert.equal(recettesARenouveler(rompue, { aujourdhui: '2026-10-20' }).length, 0);
  assert.equal(recettesARenouveler(TROIS_MOIS.slice(1), { aujourdhui: '2026-10-20' }).length, 0);
  // Le mois dernier manque : l'habitude est passée.
  assert.equal(recettesARenouveler(TROIS_MOIS, { aujourdhui: '2026-11-20' }).length, 0);
});

test('même client et libellé mais montant différent : ce n’est pas la même série', () => {
  const variable = [maintenance('2026-07-15', 120), maintenance('2026-08-14', 150), maintenance('2026-09-16', 120)];
  assert.equal(recettesARenouveler(variable, { aujourdhui: '2026-10-20' }).length, 0);
});

test('casse et accents ne séparent pas une série ; un libellé vide n’en fait jamais une', () => {
  const ecritures = [
    maintenance('2026-07-15'),
    { ...maintenance('2026-08-14'), client: 'CAFE DES ARTS' },
    { ...maintenance('2026-09-16'), libelle: 'maintenance Mensuelle' }
  ];
  assert.equal(recettesARenouveler(ecritures, { aujourdhui: '2026-10-20' }).length, 1);
  const sansLibelle = TROIS_MOIS.map((r) => ({ ...r, libelle: '' }));
  assert.equal(recettesARenouveler(sansLibelle, { aujourdhui: '2026-10-20' }).length, 0);
});

test('une série écartée (« Ne plus proposer ») ne revient pas', () => {
  const cle = cleRecurrence(TROIS_MOIS[0]);
  assert.equal(recettesARenouveler(TROIS_MOIS, { aujourdhui: '2026-10-20', ecartees: [cle] }).length, 0);
});

test('l’habitude franchit le changement d’année', () => {
  const hiver = [maintenance('2026-10-05'), maintenance('2026-11-05'), maintenance('2026-12-05')];
  assert.equal(recettesARenouveler(hiver, { aujourdhui: '2027-01-06' }).length, 1);
});
