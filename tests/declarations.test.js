/**
 * État des déclarations URSSAF : ce qui est dû, en retard, déclaré, et la
 * période que le tableau de bord met en avant.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  etatPeriode, periodeATraiter, alerteUrssaf, libellePeriode, periodePrecedente, periodeSuivante
} from '../src/partage/declarations.js';

const trimestriel = (derniere = '') => ({ periodiciteUrssaf: 'trimestre', dernierePeriodeDeclaree: derniere });
const T = (annee, valeur) => ({ annee, type: 'trimestre', valeur });

test('libellés et voisines des périodes', () => {
  assert.equal(libellePeriode(T(2026, 1)), '1er trimestre 2026');
  assert.equal(libellePeriode({ annee: 2026, type: 'mois', valeur: 8 }), 'Août 2026');
  assert.deepEqual(periodePrecedente(T(2026, 1)), T(2025, 4));
  assert.deepEqual(periodeSuivante({ annee: 2025, type: 'mois', valeur: 12 }), { annee: 2026, type: 'mois', valeur: 1 });
});

test('une période se dit à venir, en cours, puis due', () => {
  const jour = '2026-09-24';
  assert.equal(etatPeriode(T(2026, 4), trimestriel(), jour), 'a-venir');
  assert.equal(etatPeriode(T(2026, 3), trimestriel(), jour), 'en-cours');
  // Le 2e trimestre se déclare au plus tard le 31 juillet : le 24 septembre, c'est en retard.
  assert.equal(etatPeriode(T(2026, 2), trimestriel(), jour), 'en-retard');
  assert.equal(etatPeriode(T(2026, 2), trimestriel(), '2026-07-10'), 'a-declarer');
});

test('rien de marqué : seule la dernière période écoulée est réclamée', () => {
  const jour = '2026-09-24';
  assert.equal(etatPeriode(T(2026, 1), trimestriel(), jour), 'ecoulee');
  assert.equal(etatPeriode(T(2025, 4), trimestriel(), jour), 'ecoulee');
});

test('les déclarations se suivent : un trimestre sauté reste dû', () => {
  const jour = '2026-10-10';
  const parametres = trimestriel('2026-T1');
  assert.equal(etatPeriode(T(2026, 1), parametres, jour), 'declaree');
  assert.equal(etatPeriode(T(2025, 2), parametres, jour), 'declaree');
  assert.equal(etatPeriode(T(2026, 2), parametres, jour), 'en-retard');
  assert.equal(etatPeriode(T(2026, 3), parametres, jour), 'a-declarer');
  // La plus ancienne due passe en premier.
  assert.equal(periodeATraiter(parametres, jour).id, '2026-T2');
});

test('à jour : la carte montre la période en cours', () => {
  const periode = periodeATraiter(trimestriel('2026-T2'), '2026-09-24');
  assert.equal(periode.id, '2026-T3');
  assert.equal(periode.etat, 'en-cours');
  assert.equal(periode.echeance, '2026-10-31');
  assert.equal(alerteUrssaf(trimestriel('2026-T2'), '2026-09-24'), '');
});

test('la pastille du menu dit « À faire » puis « En retard »', () => {
  assert.equal(alerteUrssaf(trimestriel(), '2026-07-10'), 'À faire');
  assert.equal(alerteUrssaf(trimestriel(), '2026-08-02'), 'En retard');
  assert.equal(alerteUrssaf({ periodiciteUrssaf: '', dernierePeriodeDeclaree: '' }, '2026-08-02'), '');
});

test('une autre périodicité que la sienne n’est jamais due', () => {
  const jour = '2026-09-24';
  assert.equal(etatPeriode({ annee: 2026, type: 'mois', valeur: 7 }, trimestriel(), jour), 'ecoulee');
  assert.equal(periodeATraiter({ periodiciteUrssaf: '', dernierePeriodeDeclaree: '' }, jour), null);
});

test('en mensuel, janvier réclame décembre de l’année précédente', () => {
  const parametres = { periodiciteUrssaf: 'mois', dernierePeriodeDeclaree: '' };
  const periode = periodeATraiter(parametres, '2027-01-12');
  assert.equal(periode.id, '2026-12');
  assert.equal(periode.etat, 'a-declarer');
  assert.equal(periode.echeance, '2027-01-31');
});
