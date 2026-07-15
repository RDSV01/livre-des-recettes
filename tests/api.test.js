/**
 * Tests d'intégration de l'API : l'application démarre sur un dossier
 * temporaire et un port éphémère, puis on l'exerce en vrai HTTP.
 *
 * La recherche SIRET externe n'est pas testée en réseau : on vérifie
 * seulement que la route rejette un identifiant mal formé.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerApp } from '../src/app.js';

let dossier;
let serveur;
let base;

before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'livre-recettes-api-'));
  const app = creerApp({ dossierDonnees: dossier });
  await new Promise((resoudre) => {
    serveur = app.listen(0, '127.0.0.1', resoudre);
  });
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => {
  serveur.close();
  fs.rmSync(dossier, { recursive: true, force: true });
});

async function appeler(chemin, options = {}) {
  const reponse = await fetch(`${base}${chemin}`, {
    method: options.methode ?? 'GET',
    headers: options.corps ? { 'Content-Type': 'application/json' } : undefined,
    body: options.corps ? JSON.stringify(options.corps) : undefined
  });
  return reponse;
}

const RECETTE = {
  dateEncaissement: '2026-07-10',
  client: 'Époux Lefèvre',
  libelle: 'Cours de piano',
  numeroFacture: 'FAC-001',
  montant: '120,50',
  modeReglement: 'cheque'
};

// ---- Recettes ------------------------------------------------------------------

test('POST /api/recettes crée une recette (montant français accepté)', async () => {
  const reponse = await appeler('/api/recettes', { methode: 'POST', corps: RECETTE });
  assert.equal(reponse.status, 201);
  const { recette } = await reponse.json();
  assert.equal(recette.montant, 120.5);
  assert.ok(recette.id);
  // Le modèle est strictement limité aux six colonnes légales.
  assert.equal(recette.typeClient, undefined);
  assert.equal(recette.notes, undefined);
});

test('POST /api/recettes refuse une recette invalide avec le détail', async () => {
  const reponse = await appeler('/api/recettes', {
    methode: 'POST',
    corps: { ...RECETTE, client: '', montant: '-3' }
  });
  assert.equal(reponse.status, 400);
  const { erreurs } = await reponse.json();
  assert.ok(erreurs.client);
  assert.ok(erreurs.montant);
});

test('GET /api/recettes filtre et recherche', async () => {
  await appeler('/api/recettes', {
    methode: 'POST',
    corps: { ...RECETTE, client: 'SARL Bâtiment Plus', dateEncaissement: '2025-03-01', montant: 800, modeReglement: 'virement', numeroFacture: 'FAC-002' }
  });

  let corps = await (await appeler('/api/recettes?annee=2026')).json();
  assert.equal(corps.recettes.length, 1);
  assert.equal(corps.recettes[0].client, 'Époux Lefèvre');

  // Recherche insensible aux accents.
  corps = await (await appeler('/api/recettes?q=epoux')).json();
  assert.equal(corps.recettes.length, 1);

  // Recherche par montant.
  corps = await (await appeler('/api/recettes?q=120,50')).json();
  assert.equal(corps.recettes.length, 1);

  // Filtre par mode.
  corps = await (await appeler('/api/recettes?mode=virement')).json();
  assert.equal(corps.recettes.length, 1);
  assert.equal(corps.recettes[0].modeReglement, 'virement');
});

test('GET /api/recettes/annees liste les années décroissantes', async () => {
  const { annees } = await (await appeler('/api/recettes/annees')).json();
  assert.deepEqual(annees, [2026, 2025]);
});

test('PUT et DELETE fonctionnent et signalent les identifiants inconnus', async () => {
  const creation = await (await appeler('/api/recettes', { methode: 'POST', corps: RECETTE })).json();
  const id = creation.recette.id;

  const misAJour = await appeler(`/api/recettes/${id}`, {
    methode: 'PUT',
    corps: { ...RECETTE, montant: 999 }
  });
  assert.equal(misAJour.status, 200);
  assert.equal((await misAJour.json()).recette.montant, 999);

  assert.equal((await appeler('/api/recettes/inconnu', { methode: 'PUT', corps: RECETTE })).status, 404);
  assert.equal((await appeler(`/api/recettes/${id}`, { methode: 'DELETE' })).status, 204);
  assert.equal((await appeler(`/api/recettes/${id}`, { methode: 'DELETE' })).status, 404);
});

test('l’import détecte doublons et erreurs, la simulation n’écrit rien', async () => {
  const lignes = [
    RECETTE, // doublon de la recette déjà en base
    { ...RECETTE, client: 'Nouveau client', numeroFacture: '' },
    { ...RECETTE, client: '', montant: 'abc' } // deux erreurs
  ];

  const avant = (await (await appeler('/api/recettes')).json()).recettes.length;

  const simulation = await (await appeler('/api/recettes/import', {
    methode: 'POST',
    corps: { lignes, simulation: true }
  })).json();
  assert.equal(simulation.valides, 1);
  assert.equal(simulation.doublons.length, 1);
  assert.equal(simulation.erreurs.length, 1);
  assert.equal(simulation.importees, 0);

  const apresSimulation = (await (await appeler('/api/recettes')).json()).recettes.length;
  assert.equal(apresSimulation, avant, 'la simulation ne doit rien écrire');

  const reel = await (await appeler('/api/recettes/import', {
    methode: 'POST',
    corps: { lignes, importerDoublons: false }
  })).json();
  assert.equal(reel.importees, 1);

  const apres = (await (await appeler('/api/recettes')).json()).recettes.length;
  assert.equal(apres, avant + 1);
});

// ---- Clients -------------------------------------------------------------------

test('CRUD des clients et refus des doublons', async () => {
  const creation = await appeler('/api/clients', { methode: 'POST', corps: { nom: 'Café des Arts', siret: '12345678900012' } });
  assert.equal(creation.status, 201);
  const { client } = await creation.json();
  assert.equal(client.nom, 'Café des Arts');
  assert.equal(client.siret, '12345678900012');

  // Doublon (même nom) refusé.
  assert.equal((await appeler('/api/clients', { methode: 'POST', corps: { nom: 'café des arts' } })).status, 409);

  // Nom obligatoire.
  assert.equal((await appeler('/api/clients', { methode: 'POST', corps: { nom: '' } })).status, 400);

  const liste = await (await appeler('/api/clients')).json();
  assert.ok(liste.clients.some((c) => c.id === client.id));

  const maj = await appeler(`/api/clients/${client.id}`, { methode: 'PUT', corps: { nom: 'Café des Arts', siret: '' } });
  assert.equal(maj.status, 200);
  assert.equal((await maj.json()).client.siret, '');

  assert.equal((await appeler(`/api/clients/${client.id}`, { methode: 'DELETE' })).status, 204);
  assert.equal((await appeler(`/api/clients/${client.id}`, { methode: 'DELETE' })).status, 404);
});

test('la recherche SIRET valide le format avant tout appel externe', async () => {
  assert.equal((await appeler('/api/clients/recherche-siret?siret=12')).status, 400);
  assert.equal((await appeler('/api/clients/recherche-siret')).status, 400);
});

// ---- Tableau de bord, URSSAF, exports ------------------------------------------

test('GET /api/tableau-de-bord répond avec les statistiques', async () => {
  const stats = await (await appeler('/api/tableau-de-bord')).json();
  assert.ok(stats.caAnnee >= 0);
  assert.ok(Array.isArray(stats.dernieresRecettes));
});

test('GET /api/urssaf calcule un bilan de trimestre', async () => {
  const bilan = await (await appeler('/api/urssaf?annee=2026&type=trimestre&valeur=3')).json();
  assert.equal(bilan.libellePeriode, '3e trimestre 2026');
  assert.ok(bilan.chiffreAffaires > 0);
  assert.ok(bilan.nombreEncaissements > 0);
});

test('GET /api/urssaf exige des paramètres valides', async () => {
  assert.equal((await appeler('/api/urssaf?type=annee')).status, 400);
  assert.equal((await appeler('/api/urssaf?annee=2026&type=nimporte')).status, 400);
  assert.equal((await appeler('/api/urssaf?annee=2026&type=mois&valeur=13')).status, 400);
});

test('GET /api/exports/csv produit un CSV avec BOM et totaux', async () => {
  const reponse = await appeler('/api/exports/csv?annee=2026');
  assert.equal(reponse.status, 200);
  assert.match(reponse.headers.get('content-type'), /text\/csv/);
  // `response.text()` retire silencieusement le BOM : on vérifie les octets bruts.
  const octets = new Uint8Array(await reponse.arrayBuffer());
  assert.deepEqual([...octets.slice(0, 3)], [0xef, 0xbb, 0xbf], 'BOM UTF-8 attendu');
  const contenu = new TextDecoder('utf-8').decode(octets);
  assert.match(contenu, /Date de réception du paiement;Client;Montant/);
  assert.match(contenu, /Total juillet 2026/);
  assert.match(contenu, /Total année 2026/);
});

test('GET /api/exports/xlsx produit un fichier Excel', async () => {
  const reponse = await appeler('/api/exports/xlsx?annee=2026');
  assert.equal(reponse.status, 200);
  const octets = new Uint8Array(await reponse.arrayBuffer());
  // Un .xlsx est une archive ZIP : signature « PK ».
  assert.equal(octets[0], 0x50);
  assert.equal(octets[1], 0x4b);
});

test('GET /api/exports/pdf produit un PDF', async () => {
  const reponse = await appeler('/api/exports/pdf?annee=2026');
  assert.equal(reponse.status, 200);
  const texte = Buffer.from(await reponse.arrayBuffer()).toString('latin1');
  assert.equal(texte.slice(0, 5), '%PDF-');
});

test('les exports exigent une année valide', async () => {
  assert.equal((await appeler('/api/exports/csv')).status, 400);
  assert.equal((await appeler('/api/exports/pdf?annee=abc')).status, 400);
  assert.equal((await appeler('/api/exports/xlsx?annee=2026&mois=13')).status, 400);
});

// ---- Paramètres, sauvegarde, routes inconnues ----------------------------------

test('PUT /api/parametres enregistre et valide', async () => {
  const bon = await appeler('/api/parametres', {
    methode: 'PUT',
    corps: { nomEntreprise: 'Ma micro', siren: '123 456 789', devise: 'EUR', formatDate: 'JJ/MM/AAAA' }
  });
  assert.equal(bon.status, 200);
  assert.equal((await bon.json()).parametres.siren, '123456789');

  const mauvais = await appeler('/api/parametres', { methode: 'PUT', corps: { siren: '12' } });
  assert.equal(mauvais.status, 400);
});

test('GET /api/sauvegarde renvoie le fichier de données complet', async () => {
  const reponse = await appeler('/api/sauvegarde');
  assert.equal(reponse.status, 200);
  assert.match(reponse.headers.get('content-disposition'), /sauvegarde-livre-des-recettes/);
  const donnees = await reponse.json();
  assert.ok(Array.isArray(donnees.recettes));
  assert.ok(Array.isArray(donnees.clients));
  assert.ok(donnees.parametres);
});

test('une route API inconnue répond 404 en JSON', async () => {
  const reponse = await appeler('/api/nimporte-quoi');
  assert.equal(reponse.status, 404);
  assert.ok((await reponse.json()).erreur);
});
