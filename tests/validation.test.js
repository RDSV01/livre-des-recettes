/**
 * Tests de la validation des recettes, des clients et des paramètres.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validerRecette, validerClient, validerParametres } from '../src/validation.js';

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

test('une recette ne conserve que les champs attendus', () => {
  const { valeurs } = validerRecette(RECETTE_VALIDE);
  assert.deepEqual(
    Object.keys(valeurs).sort(),
    ['categorie', 'client', 'dateEncaissement', 'libelle', 'modeReglement', 'montant', 'numeroFacture'].sort()
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

test('un mode personnalisé déclaré dans les paramètres est accepté', () => {
  const modesPersonnalises = [{ code: 'perso-a1b2c3d4', libelle: 'Lydia' }];
  assert.ok(validerRecette({ ...RECETTE_VALIDE, modeReglement: 'perso-a1b2c3d4' }).erreurs.modeReglement);
  assert.equal(validerRecette({ ...RECETTE_VALIDE, modeReglement: 'perso-a1b2c3d4' }, { modesPersonnalises }).erreurs, null);
});

test('la catégorie est libre en activité simple, obligatoire en activité mixte', () => {
  // Activité simple : catégorie facultative, mais contrôlée si fournie.
  assert.equal(validerRecette(RECETTE_VALIDE).valeurs.categorie, '');
  assert.equal(validerRecette({ ...RECETTE_VALIDE, categorie: 'ventes' }).valeurs.categorie, 'ventes');
  assert.ok(validerRecette({ ...RECETTE_VALIDE, categorie: 'troc' }).erreurs.categorie);

  // Activité mixte : la catégorie devient obligatoire.
  assert.ok(validerRecette(RECETTE_VALIDE, { typeActivite: 'mixte' }).erreurs.categorie);
  assert.equal(
    validerRecette({ ...RECETTE_VALIDE, categorie: 'prestations' }, { typeActivite: 'mixte' }).erreurs,
    null
  );
});

test('le montant accepte les écritures relâchées (« 12,5 » vaut 12,50)', () => {
  assert.equal(validerRecette({ ...RECETTE_VALIDE, montant: '12,5' }).valeurs.montant, 12.5);
  assert.equal(validerRecette({ ...RECETTE_VALIDE, montant: '12' }).valeurs.montant, 12);
  assert.equal(validerRecette({ ...RECETTE_VALIDE, montant: '1 234,56 €' }).valeurs.montant, 1234.56);
});

test('seuls les champs autorisés sont conservés', () => {
  const { valeurs } = validerRecette({ ...RECETTE_VALIDE, id: 'pirate', typeClient: 'x', notes: 'y' });
  assert.equal(valeurs.id, undefined);
  assert.equal(valeurs.typeClient, undefined);
  assert.equal(valeurs.notes, undefined);
});

test('les options d’interface sont des booléens, activées par défaut', () => {
  const { valeurs } = validerParametres({});
  assert.equal(valeurs.alertesNumerotation, true);
  assert.equal(valeurs.alerteRecetteSimilaire, true);
  assert.equal(valeurs.suiviSeuils, true);

  const desactive = validerParametres({ alertesNumerotation: false, suiviSeuils: false }).valeurs;
  assert.equal(desactive.alertesNumerotation, false);
  assert.equal(desactive.alerteRecetteSimilaire, true);
  assert.equal(desactive.suiviSeuils, false);
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

test('le type d’activité est contrôlé', () => {
  assert.equal(validerParametres({ typeActivite: 'prestations' }).erreurs, null);
  assert.equal(validerParametres({ typeActivite: '' }).erreurs, null);
  assert.ok(validerParametres({ typeActivite: 'artisanat' }).erreurs.typeActivite);
});

test('les modes personnalisés reçoivent un code stable et refusent les doublons', () => {
  const bon = validerParametres({ modesPersonnalises: [{ libelle: 'Lydia' }] });
  assert.equal(bon.erreurs, null);
  assert.match(bon.valeurs.modesPersonnalises[0].code, /^perso-[a-f0-9]{8}$/);

  // Un code existant bien formé est conservé (renommage sans casser les recettes).
  const renomme = validerParametres({
    modesPersonnalises: [{ code: 'perso-a1b2c3d4', libelle: 'Lydia Pro' }]
  });
  assert.equal(renomme.valeurs.modesPersonnalises[0].code, 'perso-a1b2c3d4');

  assert.ok(validerParametres({ modesPersonnalises: [{ libelle: '' }] }).erreurs.modesPersonnalises);
  assert.ok(validerParametres({ modesPersonnalises: [{ libelle: 'Virement' }] }).erreurs.modesPersonnalises);
  assert.ok(validerParametres({
    modesPersonnalises: [{ libelle: 'Lydia' }, { libelle: 'lydia' }]
  }).erreurs.modesPersonnalises);
});
