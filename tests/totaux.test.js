/**
 * Tests des calculs : totaux, statistiques du tableau de bord, bilan de
 * période et construction du registre exporté.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  totalRecettes, filtrerParPeriode, statistiquesTableauDeBord, bilanPeriode, caMensuel
} from '../src/totaux.js';
import { construireRegistre } from '../src/exports/registre.js';

/** Petite fabrique de recettes pour les tests. */
function recette(date, montant, extra = {}) {
  return {
    dateEncaissement: date,
    client: 'Client test',
    libelle: '',
    numeroFacture: '',
    montant,
    modeReglement: 'virement',
    creeLe: '2026-01-01T00:00:00.000Z',
    ...extra
  };
}

const RECETTES = [
  recette('2026-01-10', 100),
  recette('2026-01-20', 200.10),
  recette('2026-03-05', 300),
  recette('2026-07-01', 0.1),
  recette('2026-07-02', 0.2),
  recette('2025-12-31', 999)
];

test('totalRecettes cumule sans erreur d’arrondi', () => {
  assert.equal(totalRecettes([recette('2026-07-01', 0.1), recette('2026-07-02', 0.2)]), 0.3);
});

test('filtrerParPeriode filtre par année, mois et trimestre', () => {
  assert.equal(filtrerParPeriode(RECETTES, { annee: 2026 }).length, 5);
  assert.equal(filtrerParPeriode(RECETTES, { annee: 2026, mois: 1 }).length, 2);
  assert.equal(filtrerParPeriode(RECETTES, { annee: 2026, trimestre: 1 }).length, 3);
  assert.equal(filtrerParPeriode(RECETTES, { annee: 2025 }).length, 1);
});

test('statistiquesTableauDeBord calcule le mois et l’année en cours', () => {
  const stats = statistiquesTableauDeBord(RECETTES, { maintenant: new Date(2026, 0, 25) });
  assert.equal(stats.caMois, 300.10);
  assert.equal(stats.caAnnee, 600.40);
  assert.equal(stats.nombreEncaissements, 5);
  assert.equal(stats.moyenneEncaissement, 120.08);
  assert.equal(stats.dernieresRecettes.length, 5);
  // Triées par date décroissante.
  assert.equal(stats.dernieresRecettes[0].dateEncaissement, '2026-07-02');
  // Le graphique couvre l'année affichée, de janvier à décembre.
  assert.equal(stats.caParMois.length, 12);
  assert.deepEqual(stats.caParMois[0], { annee: 2026, mois: 1, total: 300.10 });
  assert.deepEqual(stats.caParMois.at(-1), { annee: 2026, mois: 12, total: 0 });
});

test('statistiquesTableauDeBord sait revenir sur une année passée', () => {
  const stats = statistiquesTableauDeBord(RECETTES, { maintenant: new Date(2026, 6, 16), annee: 2025 });
  assert.equal(stats.annee, 2025);
  assert.equal(stats.mois, 12); // année passée : décembre mis en avant
  assert.equal(stats.caAnnee, 999);
  assert.equal(stats.caMois, 999);
  assert.equal(stats.nombreEncaissements, 1);
  // Le graphique couvre janvier à décembre de l'année choisie.
  assert.deepEqual(stats.caParMois[0], { annee: 2025, mois: 1, total: 0 });
  assert.deepEqual(stats.caParMois.at(-1), { annee: 2025, mois: 12, total: 999 });
  // Les dernières recettes sont celles de l'année choisie.
  assert.ok(stats.dernieresRecettes.every((r) => r.dateEncaissement.startsWith('2025')));
});

test('statistiquesTableauDeBord ventile la part prestations et les non catégorisées', () => {
  const recettes = [
    recette('2026-01-10', 100, { categorie: 'prestations' }),
    recette('2026-01-20', 200, { categorie: 'ventes' }),
    recette('2026-02-01', 50)
  ];
  const stats = statistiquesTableauDeBord(recettes, { maintenant: new Date(2026, 6, 16) });
  assert.equal(stats.caAnnee, 350);
  assert.equal(stats.caAnneePrestations, 100);
  assert.equal(stats.nombreNonCategorisees, 1);
});

test('caMensuel couvre les mois vides et franchit les années', () => {
  const points = caMensuel(RECETTES, { maintenant: new Date(2026, 1, 10) }); // février 2026
  assert.equal(points.length, 12);
  assert.deepEqual(points[0], { annee: 2025, mois: 3, total: 0 });
  assert.deepEqual(points.at(-2), { annee: 2026, mois: 1, total: 300.10 });
  assert.deepEqual(points.at(-1), { annee: 2026, mois: 2, total: 0 });
  // Décembre 2025 (999 €) est bien dans la fenêtre.
  assert.equal(points.find((p) => p.annee === 2025 && p.mois === 12).total, 999);
});

test('bilanPeriode répond pour un mois, un trimestre et une année', () => {
  const mois = bilanPeriode(RECETTES, { annee: 2026, type: 'mois', valeur: 1 });
  assert.equal(mois.chiffreAffaires, 300.10);
  assert.equal(mois.nombreEncaissements, 2);
  assert.equal(mois.libellePeriode, 'janvier 2026');

  const trimestre = bilanPeriode(RECETTES, { annee: 2026, type: 'trimestre', valeur: 3 });
  assert.equal(trimestre.chiffreAffaires, 0.3);
  assert.equal(trimestre.libellePeriode, '3e trimestre 2026');

  const annee = bilanPeriode(RECETTES, { annee: 2026, type: 'annee' });
  assert.equal(annee.chiffreAffaires, 600.40);
  assert.equal(annee.nombreEncaissements, 5);
});

test('bilanPeriode ventile ventes, prestations et non catégorisé', () => {
  const recettes = [
    recette('2026-01-10', 100, { categorie: 'prestations' }),
    recette('2026-01-20', 200, { categorie: 'ventes' }),
    recette('2026-02-01', 50)
  ];
  const bilan = bilanPeriode(recettes, { annee: 2026, type: 'annee' });
  assert.deepEqual(bilan.ventes, { chiffreAffaires: 200, nombreEncaissements: 1 });
  assert.deepEqual(bilan.prestations, { chiffreAffaires: 100, nombreEncaissements: 1 });
  assert.deepEqual(bilan.nonCategorise, { chiffreAffaires: 50, nombreEncaissements: 1 });
});

test('construireRegistre trie chronologiquement et insère les totaux', () => {
  const registre = construireRegistre(RECETTES, { annee: 2026 });
  assert.equal(registre.nombre, 5);
  assert.equal(registre.total, 600.40);
  assert.equal(registre.titre, 'Année 2026');

  const types = registre.lignes.map((l) => l.type);
  // 2 recettes de janvier + total, 1 de mars + total, 2 de juillet + total, total annuel.
  assert.deepEqual(types, [
    'recette', 'recette', 'total',
    'recette', 'total',
    'recette', 'recette', 'total',
    'total'
  ]);

  const totaux = registre.lignes.filter((l) => l.type === 'total');
  assert.equal(totaux[0].libelle, 'Total janvier 2026');
  assert.equal(totaux[0].montant, 300.10);
  assert.equal(totaux.at(-1).libelle, 'Total année 2026');
  assert.equal(totaux.at(-1).final, true);

  // Ordre chronologique croissant.
  const dates = registre.lignes.filter((l) => l.type === 'recette').map((l) => l.recette.dateEncaissement);
  assert.deepEqual(dates, [...dates].sort());
});

test('construireRegistre pour un seul mois : total mensuel uniquement', () => {
  const registre = construireRegistre(RECETTES, { annee: 2026, mois: 1 });
  assert.equal(registre.titre, 'Janvier 2026');
  const totaux = registre.lignes.filter((l) => l.type === 'total');
  assert.equal(totaux.length, 1);
  assert.equal(totaux[0].libelle, 'Total janvier 2026');
});

test('un registre ventilé ajoute les lignes « dont … » sous chaque total', () => {
  const recettesMixte = [
    recette('2026-01-10', 100, { categorie: 'prestations' }),
    recette('2026-01-20', 200, { categorie: 'ventes' }),
    recette('2026-01-25', 50) // non catégorisée
  ];
  const registre = construireRegistre(recettesMixte, { annee: 2026 }, { ventiler: true });
  assert.equal(registre.ventiler, true);

  const ventilations = registre.lignes.filter((l) => l.type === 'ventilation');
  // Trois lignes après le total de janvier, trois après le total annuel.
  assert.equal(ventilations.length, 6);
  assert.deepEqual(
    ventilations.slice(0, 3).map((l) => [l.libelle, l.montant]),
    [
      ['dont ventes de marchandises', 200],
      ['dont prestations de services', 100],
      ['dont non catégorisé', 50]
    ]
  );

  // Sans recette non catégorisée, la ligne correspondante disparaît.
  const registrePropre = construireRegistre(recettesMixte.slice(0, 2), { annee: 2026 }, { ventiler: true });
  assert.equal(registrePropre.lignes.filter((l) => l.libelle === 'dont non catégorisé').length, 0);

  // Sans ventilation demandée : aucun « dont … ».
  const registreSimple = construireRegistre(recettesMixte, { annee: 2026 });
  assert.equal(registreSimple.lignes.filter((l) => l.type === 'ventilation').length, 0);
});
