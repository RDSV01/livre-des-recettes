/**
 * Tests des calculs : totaux, statistiques du tableau de bord, bilan de
 * période et construction du registre exporté.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  totalMontants, filtrerParPeriode, statistiquesTableauDeBord, bilanPeriode, caMensuel
} from '../src/totaux.js';
import { registreRecettes, registreAchats } from '../src/exports/registre.js';

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

test('totalMontants cumule sans erreur d’arrondi', () => {
  assert.equal(totalMontants([recette('2026-07-01', 0.1), recette('2026-07-02', 0.2)]), 0.3);
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
  // La moyenne porte la trace du nombre d'encaissements : 600,40 / 5.
  assert.equal(stats.moyenneEncaissement, 120.08);
  assert.equal(stats.dernieresRecettes.length, 5);
  // Triées par date décroissante.
  assert.equal(stats.dernieresRecettes[0].dateEncaissement, '2026-07-02');
  // Le graphique couvre l'année affichée, de janvier à décembre.
  assert.equal(stats.caParMois.length, 12);
  assert.deepEqual(stats.caParMois[0], { annee: 2026, mois: 1, total: 300.10 });
  assert.deepEqual(stats.caParMois.at(-1), { annee: 2026, mois: 12, total: 0 });
});

test('statistiquesTableauDeBord additionne les achats de la période', () => {
  const achats = [
    { dateReglement: '2026-07-05', fournisseur: 'F', referenceFacture: '', montant: 200, modeReglement: 'carte' },
    { dateReglement: '2026-03-02', fournisseur: 'F', referenceFacture: '', montant: 50, modeReglement: 'carte' },
    { dateReglement: '2025-11-01', fournisseur: 'F', referenceFacture: '', montant: 999, modeReglement: 'carte' }
  ];
  const stats = statistiquesTableauDeBord(RECETTES, { maintenant: new Date(2026, 6, 16), achats });
  assert.equal(stats.achatsAnnee, 250, 'les deux achats de 2026, pas celui de 2025');
});

test('statistiquesTableauDeBord met les achats à zéro quand il n’y en a pas', () => {
  const stats = statistiquesTableauDeBord(RECETTES, { maintenant: new Date(2026, 6, 16) });
  assert.equal(stats.achatsAnnee, 0);
});

test('statistiquesTableauDeBord sait revenir sur une année passée', () => {
  const stats = statistiquesTableauDeBord(RECETTES, { maintenant: new Date(2026, 6, 16), annee: 2025 });
  assert.equal(stats.annee, 2025);
  assert.equal(stats.mois, 12); // année passée : décembre mis en avant
  assert.equal(stats.caAnnee, 999);
  assert.equal(stats.caMois, 999);
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

test('statistiquesTableauDeBord ventile aussi le mois et les graphiques', () => {
  const recettes = [
    recette('2026-07-03', 800, { categorie: 'prestations' }),
    recette('2026-07-20', 150, { categorie: 'ventes' }),
    recette('2026-07-25', 40), // non catégorisée : dans le total, dans aucune part
    recette('2026-03-05', 300, { categorie: 'prestations' }),
    recette('2026-03-09', 90, { categorie: 'ventes' })
  ];
  const stats = statistiquesTableauDeBord(recettes, { maintenant: new Date(2026, 6, 16) });

  // Mois en cours (juillet) : total, puis chaque catégorie.
  assert.equal(stats.caMois, 990);
  assert.equal(stats.caMoisPrestations, 800);
  assert.equal(stats.caMoisVentes, 150);
  assert.equal(stats.nombreMoisPrestations, 1);
  assert.equal(stats.nombreMoisVentes, 1);

  // Année entière.
  assert.equal(stats.caAnnee, 1380);
  assert.equal(stats.caAnneePrestations, 1100);
  assert.equal(stats.caAnneeVentes, 240);
  assert.equal(stats.nombreAnneePrestations, 2);
  assert.equal(stats.nombreAnneeVentes, 2);
  // Cinq recettes pour deux ventes et deux prestations : la cinquième n'entre
  // dans aucune des deux parts, et c'est ce compteur qui la signale.
  assert.equal(stats.nombreNonCategorisees, 1);
  assert.equal(stats.caAnneePrestations + stats.caAnneeVentes < stats.caAnnee, true);

  // Un graphique par catégorie, sur les mêmes douze mois que le graphique global.
  const juillet = (points) => points.find((p) => p.mois === 7).total;
  const mars = (points) => points.find((p) => p.mois === 3).total;
  assert.equal(stats.caParMoisPrestations.length, 12);
  assert.equal(stats.caParMoisVentes.length, 12);
  assert.equal(juillet(stats.caParMois), 990);
  assert.equal(juillet(stats.caParMoisPrestations), 800);
  assert.equal(juillet(stats.caParMoisVentes), 150);
  assert.equal(mars(stats.caParMoisPrestations), 300);
  assert.equal(mars(stats.caParMoisVentes), 90);
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

test('registreRecettes trie chronologiquement et insère les totaux', () => {
  const registre = registreRecettes(RECETTES, { annee: 2026 });
  assert.equal(registre.nombre, 5);
  assert.equal(registre.total, 600.40);
  assert.equal(registre.titrePeriode, 'Année 2026');
  assert.equal(registre.nomFichier, 'livre-recettes-2026');
  assert.equal(registre.resume, '5 encaissements');

  const types = registre.lignes.map((l) => l.type);
  // 2 recettes de janvier + total, 1 de mars + total, 2 de juillet + total, total annuel.
  assert.deepEqual(types, [
    'element', 'element', 'total',
    'element', 'total',
    'element', 'element', 'total',
    'total'
  ]);

  const totaux = registre.lignes.filter((l) => l.type === 'total');
  assert.equal(totaux[0].libelle, 'Total janvier 2026');
  assert.equal(totaux[0].montant, 300.10);
  assert.equal(totaux.at(-1).libelle, 'Total année 2026');
  assert.equal(totaux.at(-1).montant, 600.40);

  // Ordre chronologique croissant.
  const dates = registre.lignes.filter((l) => l.type === 'element').map((l) => l.element.dateEncaissement);
  assert.deepEqual(dates, [...dates].sort());
});

test('registreRecettes pour un seul mois : total mensuel uniquement', () => {
  const registre = registreRecettes(RECETTES, { annee: 2026, mois: 1 });
  assert.equal(registre.titrePeriode, 'Janvier 2026');
  assert.equal(registre.nomFichier, 'livre-recettes-2026-01');
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
  const registre = registreRecettes(recettesMixte, { annee: 2026 }, { ventiler: true });
  assert.ok(registre.colonnes.some((c) => c.titre === 'Catégorie'));

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
  const registrePropre = registreRecettes(recettesMixte.slice(0, 2), { annee: 2026 }, { ventiler: true });
  assert.equal(registrePropre.lignes.filter((l) => l.libelle === 'dont non catégorisé').length, 0);

  // Sans ventilation demandée : aucun « dont … ».
  const registreSimple = registreRecettes(recettesMixte, { annee: 2026 });
  assert.equal(registreSimple.lignes.filter((l) => l.type === 'ventilation').length, 0);
});

test('registreAchats reprend les cinq colonnes légales, montant en dernier', () => {
  const achat = (date, montant, extra = {}) => ({
    dateReglement: date,
    fournisseur: 'Fournisseur test',
    referenceFacture: 'F-1',
    montant,
    modeReglement: 'cb',
    creeLe: '2026-01-01T00:00:00.000Z',
    ...extra
  });
  const registre = registreAchats([
    achat('2026-02-15', 40),
    achat('2026-01-10', 60),
    achat('2025-11-02', 999)
  ], { annee: 2026 });

  assert.deepEqual(registre.colonnes.map((c) => c.titre), [
    'Date du règlement',
    'Fournisseur',
    'Référence de la facture ou du justificatif',
    'Mode de paiement',
    'Montant de l’achat'
  ]);
  assert.equal(registre.colonnes.findIndex((c) => c.montant), 4);
  assert.equal(registre.titreDocument, 'Registre des achats');
  assert.equal(registre.nomFichier, 'registre-achats-2026');
  assert.equal(registre.resume, '2 achats');
  assert.equal(registre.total, 100);

  // Ordre chronologique croissant, un total par mois puis le total annuel.
  const dates = registre.lignes.filter((l) => l.type === 'element').map((l) => l.element.dateReglement);
  assert.deepEqual(dates, ['2026-01-10', '2026-02-15']);
  assert.deepEqual(
    registre.lignes.filter((l) => l.type === 'total').map((l) => l.libelle),
    ['Total janvier 2026', 'Total février 2026', 'Total année 2026']
  );
  // Aucune ventilation : elle ne concerne que le livre des recettes.
  assert.equal(registre.lignes.filter((l) => l.type === 'ventilation').length, 0);
});
