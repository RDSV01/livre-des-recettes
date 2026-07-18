/**
 * Tests des modules partagés : dates, montants, texte, doublons, seuils.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estDateIso, formaterDate, analyserDateSouple, trimestreDe, dernierePeriodeEchue
} from '../src/partage/dates.js';
import { analyserMontant, sommeMontants, enCentimes } from '../src/partage/montants.js';
import { normaliserTexte } from '../src/partage/texte.js';
import { estDoublon, chercherSimilaire } from '../src/partage/doublons.js';
import { bilanSeuils, seuilsValentPour, SEUILS, ANNEE_SEUILS } from '../src/partage/seuils.js';
import { filtrerRecettes, filtrerAchats, valeursFrequentes } from '../src/partage/filtres.js';

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

test('dernierePeriodeEchue renvoie la dernière période complète', () => {
  const juillet = new Date(2026, 6, 16);
  assert.deepEqual(dernierePeriodeEchue('mois', juillet), { id: '2026-06', libelle: 'juin 2026' });
  assert.deepEqual(dernierePeriodeEchue('trimestre', juillet), { id: '2026-T2', libelle: '2e trimestre 2026' });
  // Janvier : la période précédente est sur l'année d'avant.
  const janvier = new Date(2026, 0, 5);
  assert.deepEqual(dernierePeriodeEchue('mois', janvier), { id: '2025-12', libelle: 'décembre 2025' });
  assert.deepEqual(dernierePeriodeEchue('trimestre', janvier), { id: '2025-T4', libelle: '4e trimestre 2025' });
  assert.equal(dernierePeriodeEchue('', juillet), null);
});

// ---- Filtrage des recettes (côté navigateur) ---------------------------------

const RECETTES_FILTRE = [
  { dateEncaissement: '2026-07-10', client: 'Époux Lefèvre', libelle: 'Cours de piano', numeroFacture: 'F-1', montant: 120.5, modeReglement: 'cheque', categorie: 'prestations' },
  { dateEncaissement: '2026-03-01', client: 'SARL Bâtiment', libelle: 'Site', numeroFacture: 'F-2', montant: 800, modeReglement: 'virement', categorie: 'ventes' },
  { dateEncaissement: '2025-03-01', client: 'Autre', libelle: '', numeroFacture: '', montant: 50, modeReglement: 'especes' }
];

test('filtrerRecettes croise année, mois, mode, catégorie et recherche', () => {
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { annee: '2026' }).length, 2);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { annee: 2026, mois: 7 }).length, 1);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { mode: 'virement' }).length, 1);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { categorie: 'ventes' }).length, 1);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { categorie: 'aucune' })[0].client, 'Autre');
  // Recherche insensible aux accents, et par montant exact.
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { q: 'epoux' }).length, 1);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { q: '120,50' }).length, 1);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { q: 'introuvable' }).length, 0);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, {}).length, 3);
});

test('valeursFrequentes dédoublonne et trie par fréquence puis alphabet', () => {
  const libelles = valeursFrequentes([
    { libelle: 'cours de piano' }, { libelle: 'Cours de piano' },
    { libelle: 'Accordage' }, { libelle: '' }
  ], 'libelle');
  assert.deepEqual(libelles, ['cours de piano', 'Accordage']);
});

const ACHATS_FILTRE = [
  { dateReglement: '2026-07-15', fournisseur: 'Métro', referenceFacture: 'A-12', montant: 120.50, modeReglement: 'carte' },
  { dateReglement: '2026-02-01', fournisseur: 'Papeterie Léon', referenceFacture: '', montant: 30, modeReglement: 'virement' },
  { dateReglement: '2025-12-10', fournisseur: 'Métro', referenceFacture: 'A-04', montant: 80, modeReglement: 'carte' }
];

test('filtrerAchats croise période, mode de paiement et recherche libre', () => {
  assert.equal(filtrerAchats(ACHATS_FILTRE, { annee: 2026 }).length, 2);
  assert.equal(filtrerAchats(ACHATS_FILTRE, { annee: 2026, mois: 7 }).length, 1);
  assert.equal(filtrerAchats(ACHATS_FILTRE, { mode: 'carte' }).length, 2);
  // Recherche sur le fournisseur (sans accent), la référence, puis le montant exact.
  assert.equal(filtrerAchats(ACHATS_FILTRE, { q: 'metro' }).length, 2);
  assert.equal(filtrerAchats(ACHATS_FILTRE, { q: 'A-04' }).length, 1);
  assert.equal(filtrerAchats(ACHATS_FILTRE, { q: '120,50' }).length, 1);
  assert.equal(filtrerAchats(ACHATS_FILTRE, {}).length, 3);
});

// ---- Doublons et similarité ------------------------------------------------

const EXISTANTES = [
  { dateEncaissement: '2026-07-15', client: 'Boulangerie Dupré', montant: 450, numeroFacture: 'FAC-1' }
];

test('même date + même client + même montant = doublon', () => {
  assert.equal(estDoublon(
    { dateEncaissement: '2026-07-15', client: 'boulangerie dupre', montant: 450, numeroFacture: '' },
    EXISTANTES
  ), true);
});

test('deux factures différentes de même montant ne sont pas des doublons', () => {
  assert.equal(estDoublon(
    { dateEncaissement: '2026-07-15', client: 'Boulangerie Dupré', montant: 450, numeroFacture: 'FAC-2' },
    EXISTANTES
  ), false);
});

test('un montant différent n’est pas un doublon', () => {
  assert.equal(estDoublon(
    { dateEncaissement: '2026-07-15', client: 'Boulangerie Dupré', montant: 450.01, numeroFacture: '' },
    EXISTANTES
  ), false);
});

test('chercherSimilaire trouve aussi une facture identique', () => {
  const similaire = chercherSimilaire(
    { dateEncaissement: '2026-08-01', client: 'Autre client', montant: 10, numeroFacture: 'fac-1' },
    EXISTANTES
  );
  assert.equal(similaire, EXISTANTES[0]);
  assert.equal(chercherSimilaire(
    { dateEncaissement: '2026-08-01', client: 'Autre client', montant: 10, numeroFacture: 'FAC-9' },
    EXISTANTES
  ), null);
});

// ---- Seuils micro et franchise de TVA ---------------------------------------

test('bilanSeuils suit le type d’activité choisi', () => {
  // La moitié du plafond : le test reste vrai quand les seuils sont mis à jour.
  const moitie = SEUILS.prestations.plafondMicro / 2;
  const bilan = bilanSeuils(moitie, 'prestations');
  assert.equal(bilan.plafondMicro.seuil, SEUILS.prestations.plafondMicro);
  assert.equal(bilan.plafondMicro.pourcentage, 50);
  assert.equal(bilan.plafondMicro.restant, moitie);
  assert.equal(bilan.franchiseTva.seuil, SEUILS.prestations.franchiseTva);
  assert.equal(bilan.franchiseTva.seuilMajore, SEUILS.prestations.franchiseTvaMajore);
  assert.equal(bilan.prestations, null);
});

test('bilanSeuils plafonne le restant à zéro en cas de dépassement', () => {
  const bilan = bilanSeuils(SEUILS.prestations.plafondMicro + 1000, 'prestations');
  assert.equal(bilan.plafondMicro.restant, 0);
  assert.ok(bilan.plafondMicro.pourcentage > 100);
});

test('bilanSeuils vaut null sans type d’activité', () => {
  assert.equal(bilanSeuils(1000, ''), null);
  assert.equal(bilanSeuils(1000, 'inconnu'), null);
});

test('bilanSeuils suit la part prestations d’une activité mixte', () => {
  const bilan = bilanSeuils(100_000, 'mixte', SEUILS.prestations.franchiseTva);
  assert.equal(bilan.plafondMicro.seuil, SEUILS.mixte.plafondMicro);
  assert.equal(bilan.prestations.chiffreAffaires, SEUILS.prestations.franchiseTva);
  assert.equal(bilan.prestations.plafondMicro.seuil, SEUILS.prestations.plafondMicro);
  assert.equal(bilan.prestations.franchiseTva.pourcentage, 100);
  // Sans CA prestations fourni, pas de bilan de la part prestations.
  assert.equal(bilanSeuils(100_000, 'mixte').prestations, null);
});

test('une activité mixte n’impose aucun plafond propre aux ventes', () => {
  // Deux conditions cumulatives, et deux seulement : le total et la part
  // prestations. La part ventes n'est bornée que par le total.
  const bilan = bilanSeuils(SEUILS.mixte.plafondMicro, 'mixte', 1000);
  assert.deepEqual(Object.keys(bilan.prestations), ['chiffreAffaires', 'plafondMicro', 'franchiseTva']);
  assert.equal(bilan.ventes, undefined, 'aucun seuil des ventes ne doit être calculé');
});

test('seuilsValentPour délimite la période de validité', () => {
  const [debut, fin] = ANNEE_SEUILS.split('-').map(Number);
  assert.equal(seuilsValentPour(debut), true);
  assert.equal(seuilsValentPour(fin), true);
  // Un exercice antérieur relevait d'autres montants : le tableau de bord
  // doit pouvoir prévenir que ses jauges ne valent pas pour cette année.
  assert.equal(seuilsValentPour(debut - 1), false);
  assert.equal(seuilsValentPour(fin + 1), false);
});
