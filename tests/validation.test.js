/**
 * Tests de la validation des recettes, des clients et des paramètres,
 * ainsi que de la détection de doublons.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validerRecette, estDoublon, validerClient, validerParametres } from '../src/validation.js';

const RECETTE_VALIDE = {
  dateEncaissement: '2026-07-15',
  client: 'Boulangerie Dupré',
  libelle: 'Création de site vitrine',
  numeroFacture: 'FAC-2026-042',
  montant: '450,00',
  modeReglement: 'virement'
};

test('une recette complète est acceptée et normalisée', () => {
  const { erreurs, valeurs } = validerRecette(RECETTE_VALIDE);
  assert.equal(erreurs, null);
  assert.equal(valeurs.montant, 450);
  assert.equal(valeurs.client, 'Boulangerie Dupré');
});

test('une recette ne conserve que les six champs légaux', () => {
  const { valeurs } = validerRecette(RECETTE_VALIDE);
  assert.deepEqual(
    Object.keys(valeurs).sort(),
    ['client', 'dateEncaissement', 'libelle', 'modeReglement', 'montant', 'numeroFacture'].sort()
  );
});

test('le client est obligatoire', () => {
  const { erreurs } = validerRecette({ ...RECETTE_VALIDE, client: '   ' });
  assert.ok(erreurs.client);
});

test('le montant doit être un nombre strictement positif', () => {
  assert.ok(validerRecette({ ...RECETTE_VALIDE, montant: '0' }).erreurs.montant);
  assert.ok(validerRecette({ ...RECETTE_VALIDE, montant: '-5' }).erreurs.montant);
  assert.ok(validerRecette({ ...RECETTE_VALIDE, montant: 'douze' }).erreurs.montant);
  assert.ok(validerRecette({ ...RECETTE_VALIDE, montant: '' }).erreurs.montant);
});

test('la date doit être une vraie date ISO', () => {
  assert.ok(validerRecette({ ...RECETTE_VALIDE, dateEncaissement: '2026-02-30' }).erreurs.dateEncaissement);
  assert.ok(validerRecette({ ...RECETTE_VALIDE, dateEncaissement: '' }).erreurs.dateEncaissement);
});

test('facture et libellé sont facultatifs', () => {
  const { erreurs } = validerRecette({ ...RECETTE_VALIDE, numeroFacture: '', libelle: '' });
  assert.equal(erreurs, null);
});

test('un mode de règlement inconnu est refusé', () => {
  assert.ok(validerRecette({ ...RECETTE_VALIDE, modeReglement: 'bitcoin' }).erreurs.modeReglement);
});

test('seuls les champs autorisés sont conservés', () => {
  const { valeurs } = validerRecette({ ...RECETTE_VALIDE, id: 'pirate', typeClient: 'x', notes: 'y' });
  assert.equal(valeurs.id, undefined);
  assert.equal(valeurs.typeClient, undefined);
  assert.equal(valeurs.notes, undefined);
});

// ---- Doublons -----------------------------------------------------------------

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

// ---- Clients ------------------------------------------------------------------

test('un client valide se limite au nom et au SIRET', () => {
  const { erreurs, valeurs } = validerClient({ nom: '  Café des Arts ', siret: '123 456 789 00012', adresse: 'ignorée' });
  assert.equal(erreurs, null);
  assert.deepEqual(valeurs, { nom: 'Café des Arts', siret: '12345678900012' });
});

test('le nom du client est obligatoire', () => {
  assert.ok(validerClient({ nom: '' }).erreurs.nom);
});

test('un SIRET client mal formé est refusé, mais il reste facultatif', () => {
  assert.ok(validerClient({ nom: 'X', siret: '123' }).erreurs.siret);
  assert.equal(validerClient({ nom: 'X' }).erreurs, null);
});

// ---- Paramètres ------------------------------------------------------------------

test('le SIREN et le SIRET sont vérifiés quand ils sont renseignés', () => {
  assert.ok(validerParametres({ siren: '123' }).erreurs.siren);
  assert.ok(validerParametres({ siret: '123' }).erreurs.siret);
  assert.equal(validerParametres({ siren: '123 456 789', siret: '123 456 789 00012' }).erreurs, null);
  assert.equal(validerParametres({}).erreurs, null);
});

test('les espaces de présentation du SIREN sont retirés', () => {
  const { valeurs } = validerParametres({ siren: '123 456 789' });
  assert.equal(valeurs.siren, '123456789');
});
