/**
 * Tests du stockage JSON : cycle de vie complet, persistance entre deux
 * ouvertures, protection du fichier corrompu.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerStockage } from '../src/stockage.js';

function dossierTemporaire() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'livre-recettes-test-'));
}

const CHAMPS = {
  dateEncaissement: '2026-07-15',
  client: 'Client test',
  libelle: 'Prestation',
  numeroFacture: '',
  montant: 100,
  modeReglement: 'carte'
};

test('cycle complet : ajout, modification, suppression', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  const stockage = creerStockage(dossier);
  assert.deepEqual(stockage.listerRecettes(), []);

  const creee = stockage.ajouterRecette(CHAMPS);
  assert.ok(creee.id);
  assert.ok(creee.creeLe);
  assert.equal(stockage.listerRecettes().length, 1);

  const modifiee = stockage.modifierRecette(creee.id, { ...CHAMPS, montant: 250 });
  assert.equal(modifiee.montant, 250);
  assert.equal(modifiee.id, creee.id);

  assert.equal(stockage.modifierRecette('id-inconnu', CHAMPS), null);
  assert.equal(stockage.supprimerRecette('id-inconnu'), false);
  assert.equal(stockage.supprimerRecette(creee.id), true);
  assert.deepEqual(stockage.listerRecettes(), []);
});

test('les données survivent à une réouverture (persistance fichier)', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  const premier = creerStockage(dossier);
  premier.ajouterRecette(CHAMPS);
  premier.modifierParametres({ nomEntreprise: 'Ma micro' });

  // Nouvelle « session » sur le même dossier.
  const second = creerStockage(dossier);
  assert.equal(second.listerRecettes().length, 1);
  assert.equal(second.listerRecettes()[0].client, 'Client test');
  assert.equal(second.obtenirParametres().nomEntreprise, 'Ma micro');
});

test('une sauvegarde quotidienne est créée avant modification', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  const stockage = creerStockage(dossier);
  stockage.ajouterRecette(CHAMPS);  // première écriture : rien à sauvegarder
  stockage.ajouterRecette(CHAMPS);  // le fichier existe : sauvegarde du jour créée

  const sauvegardes = fs.readdirSync(path.join(dossier, 'sauvegardes'));
  assert.equal(sauvegardes.length, 1);
  assert.match(sauvegardes[0], /^livre-des-recettes-\d{4}-\d{2}-\d{2}\.json$/);
});

test('un fichier corrompu passe en lecture seule au lieu d’être écrasé', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  const contenuCorrompu = '{ pas du json';
  fs.writeFileSync(path.join(dossier, 'livre-des-recettes.json'), contenuCorrompu, 'utf8');

  const stockage = creerStockage(dossier);
  assert.match(stockage.corruption(), /illisible/);
  assert.deepEqual(stockage.listerRecettes(), []);

  // Toute écriture est refusée : le fichier abîmé n'est jamais écrasé.
  assert.throws(() => stockage.ajouterRecette(CHAMPS), /corrompues/);
  assert.equal(fs.readFileSync(path.join(dossier, 'livre-des-recettes.json'), 'utf8'), contenuCorrompu);
});

test('après corruption, restaurer une sauvegarde remet tout en état', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  // Vie normale : une recette, puis une sauvegarde étiquetée.
  const sain = creerStockage(dossier);
  sain.ajouterRecette(CHAMPS);
  const nomSauvegarde = sain.creerSauvegarde('avant-import');
  assert.match(nomSauvegarde, /avant-import\.json$/);

  // Corruption du fichier, puis restauration.
  fs.writeFileSync(path.join(dossier, 'livre-des-recettes.json'), '###', 'utf8');
  const abime = creerStockage(dossier);
  assert.ok(abime.corruption());
  const resume = abime.restaurerSauvegarde(nomSauvegarde);
  assert.equal(resume.recettes, 1);
  assert.equal(abime.corruption(), null);
  assert.equal(abime.listerRecettes().length, 1);
  abime.ajouterRecette(CHAMPS); // les écritures fonctionnent à nouveau
  assert.equal(abime.listerRecettes().length, 2);
});

test('les sauvegardes se listent et les noms hostiles sont refusés', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  const stockage = creerStockage(dossier);
  stockage.ajouterRecette(CHAMPS);
  stockage.creerSauvegarde('avant-import');

  const liste = stockage.listerSauvegardes();
  assert.ok(liste.length >= 1);
  assert.ok(liste[0].fichier.startsWith('livre-des-recettes-'));
  assert.ok(liste[0].taille > 0);
  assert.ok(liste[0].date);

  assert.throws(() => stockage.restaurerSauvegarde('../../secrets.json'), /invalide/);
  assert.throws(() => stockage.restaurerSauvegarde('livre-des-recettes-9999-01-01.json'), /introuvable/);
});

test('l’import en lot n’écrit qu’une fois et retourne les copies', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  const stockage = creerStockage(dossier);
  const creees = stockage.ajouterRecettes([CHAMPS, { ...CHAMPS, montant: 50 }]);
  assert.equal(creees.length, 2);
  assert.notEqual(creees[0].id, creees[1].id);
  assert.equal(stockage.listerRecettes().length, 2);
});

test('cycle complet des clients, triés par nom et persistés', (t) => {
  const dossier = dossierTemporaire();
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

  const stockage = creerStockage(dossier);
  assert.deepEqual(stockage.listerClients(), []);

  const zoe = stockage.ajouterClient({ nom: 'Zoé Studio', siret: '' });
  stockage.ajouterClient({ nom: 'Atelier Alpha', siret: '12345678900012' });
  assert.ok(zoe.id);

  // Tri alphabétique insensible à la casse et aux accents.
  assert.deepEqual(stockage.listerClients().map((c) => c.nom), ['Atelier Alpha', 'Zoé Studio']);

  const modifie = stockage.modifierClient(zoe.id, { nom: 'Zoé Studio', siret: '99999999900019' });
  assert.equal(modifie.siret, '99999999900019');

  assert.equal(stockage.modifierClient('inconnu', { nom: 'X' }), null);
  assert.equal(stockage.supprimerClient(zoe.id), true);
  assert.equal(stockage.supprimerClient('inconnu'), false);

  // Persistance après réouverture.
  const second = creerStockage(dossier);
  assert.deepEqual(second.listerClients().map((c) => c.nom), ['Atelier Alpha']);
});
