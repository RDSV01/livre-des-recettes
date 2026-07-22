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
let dossierSauvegardes;
let serveur;
let base;

before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'livre-recettes-api-'));
  // Sauvegardes hors du dossier de données, comme en production, mais dans
  // un dossier temporaire pour ne rien laisser sur la machine.
  dossierSauvegardes = fs.mkdtempSync(path.join(os.tmpdir(), 'livre-recettes-api-copies-'));
  const app = creerApp({ dossierDonnees: dossier, dossierSauvegardes });
  await new Promise((resoudre) => {
    serveur = app.listen(0, '127.0.0.1', resoudre);
  });
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => {
  serveur.close();
  // Sans cela, les connexions gardées ouvertes par `fetch` (keep-alive)
  // empêchent `serveur.close()` de rendre la main, et `node --test` ne se
  // termine jamais : la CI reste bloquée sur cette étape.
  serveur.closeAllConnections();
  fs.rmSync(dossier, { recursive: true, force: true });
  fs.rmSync(dossierSauvegardes, { recursive: true, force: true });
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

test('GET /api/recettes renvoie tout, trié par date décroissante', async () => {
  await appeler('/api/recettes', {
    methode: 'POST',
    corps: { ...RECETTE, client: 'SARL Bâtiment Plus', dateEncaissement: '2025-03-01', montant: 800, modeReglement: 'virement', numeroFacture: 'FAC-002' }
  });

  const { recettes } = await (await appeler('/api/recettes')).json();
  assert.equal(recettes.length, 2);
  assert.equal(recettes[0].dateEncaissement, '2026-07-10');
  assert.equal(recettes[1].dateEncaissement, '2025-03-01');
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

test('un import réel crée une sauvegarde automatique restaurable', async () => {
  const lignes = [{ ...RECETTE, client: 'Client import sauvegarde', numeroFacture: 'SAUV-1' }];
  const rapport = await (await appeler('/api/recettes/import', {
    methode: 'POST',
    corps: { lignes }
  })).json();
  assert.equal(rapport.importees, 1);
  assert.match(rapport.sauvegarde, /avant-import\.json$/);

  const { sauvegardes } = await (await appeler('/api/sauvegardes')).json();
  assert.ok(sauvegardes.some((s) => s.fichier === rapport.sauvegarde));

  // La restaurer efface la recette importée (retour à l'état d'avant l'import).
  const restauration = await appeler('/api/sauvegardes/restaurer', {
    methode: 'POST',
    corps: { fichier: rapport.sauvegarde }
  });
  assert.equal(restauration.status, 200);
  const { recettes } = await (await appeler('/api/recettes')).json();
  assert.equal(recettes.filter((r) => r.numeroFacture === 'SAUV-1').length, 0);
});

test('GET /api/systeme annonce l’emplacement des sauvegardes, hors des données', async () => {
  const systeme = await (await appeler('/api/systeme')).json();
  assert.equal(systeme.dossierSauvegardes, dossierSauvegardes);
  assert.ok(!systeme.dossierSauvegardes.startsWith(dossier), 'les copies ne sont pas dans le dossier de données');
  // Fichier bien présent : rien à reconstituer.
  assert.equal(systeme.donneesAbsentes, false);
});

test('la restauration refuse un nom de fichier invalide', async () => {
  const reponse = await appeler('/api/sauvegardes/restaurer', {
    methode: 'POST',
    corps: { fichier: '../../nimporte.json' }
  });
  assert.equal(reponse.status, 400);
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

// ---- Achats --------------------------------------------------------------------

const ACHAT = {
  dateReglement: '2026-07-08',
  fournisseur: 'Métro Cash & Carry',
  referenceFacture: 'A-2026-014',
  montant: '89,90',
  modeReglement: 'carte'
};

test('POST /api/achats crée un achat limité aux cinq colonnes légales', async () => {
  const reponse = await appeler('/api/achats', { methode: 'POST', corps: { ...ACHAT, notes: 'ignoré' } });
  assert.equal(reponse.status, 201);
  const { achat } = await reponse.json();
  assert.equal(achat.montant, 89.9);
  assert.equal(achat.fournisseur, 'Métro Cash & Carry');
  assert.ok(achat.id);
  assert.equal(achat.notes, undefined);
});

test('POST /api/achats refuse un achat invalide avec le détail', async () => {
  const reponse = await appeler('/api/achats', {
    methode: 'POST',
    corps: { ...ACHAT, fournisseur: '', montant: '0', modeReglement: 'bitcoin' }
  });
  assert.equal(reponse.status, 400);
  const { erreurs } = await reponse.json();
  assert.ok(erreurs.fournisseur);
  assert.ok(erreurs.montant);
  assert.ok(erreurs.modeReglement);
});

test('GET /api/achats trie par date de règlement décroissante, /annees les liste', async () => {
  await appeler('/api/achats', {
    methode: 'POST',
    corps: { ...ACHAT, dateReglement: '2025-11-02', fournisseur: 'Papeterie Léon', referenceFacture: '', montant: 25 }
  });

  const { achats } = await (await appeler('/api/achats')).json();
  assert.equal(achats.length, 2);
  assert.equal(achats[0].dateReglement, '2026-07-08');
  assert.equal(achats[1].dateReglement, '2025-11-02');
  // La référence du justificatif reste facultative.
  assert.equal(achats[1].referenceFacture, '');

  const { annees } = await (await appeler('/api/achats/annees')).json();
  assert.deepEqual(annees, [2026, 2025]);
});

test('PUT et DELETE /api/achats mettent à jour puis suppriment', async () => {
  const { achat } = await (await appeler('/api/achats', {
    methode: 'POST',
    corps: { ...ACHAT, fournisseur: 'Fournisseur éphémère' }
  })).json();

  const maj = await appeler(`/api/achats/${achat.id}`, {
    methode: 'PUT',
    corps: { ...ACHAT, fournisseur: 'Fournisseur corrigé', montant: 12 }
  });
  assert.equal(maj.status, 200);
  assert.equal((await maj.json()).achat.fournisseur, 'Fournisseur corrigé');

  assert.equal((await appeler(`/api/achats/${achat.id}`, { methode: 'DELETE' })).status, 204);
  assert.equal((await appeler(`/api/achats/${achat.id}`, { methode: 'DELETE' })).status, 404);
});

// ---- Clients -------------------------------------------------------------------

test('la liste des clients porte le nombre de recettes et le CA par client', async () => {
  await appeler('/api/clients', { methode: 'POST', corps: { nom: 'Époux Lefèvre' } });
  const { clients } = await (await appeler('/api/clients')).json();
  const lefevre = clients.find((c) => c.nom === 'Époux Lefèvre');
  assert.ok(lefevre.nombreRecettes >= 1, 'les recettes du client sont comptées');
  assert.ok(lefevre.totalRecettes > 0, 'le CA du client est cumulé');
});

test('CRUD des clients et refus des doublons', async () => {
  const creation = await appeler('/api/clients', { methode: 'POST', corps: { nom: 'Café des Arts', siret: '12345678200010' } });
  assert.equal(creation.status, 201);
  const { client } = await creation.json();
  assert.equal(client.nom, 'Café des Arts');
  assert.equal(client.siret, '12345678200010');

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

test('GET /api/tableau-de-bord répond avec les statistiques et le CA mensuel', async () => {
  const stats = await (await appeler('/api/tableau-de-bord')).json();
  assert.ok(stats.caAnnee >= 0);
  assert.ok(Array.isArray(stats.dernieresRecettes));
  assert.equal(stats.caParMois.length, 12);
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

test('GET /api/exports/achats produit les trois formats du registre des achats', async () => {
  const csv = await appeler('/api/exports/achats/csv?annee=2026');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-disposition'), /registre-achats-2026\.csv/);
  const contenu = new TextDecoder('utf-8').decode(new Uint8Array(await csv.arrayBuffer()));
  assert.match(contenu, /Date du règlement;Fournisseur;Référence de la facture ou du justificatif/);
  assert.match(contenu, /Métro Cash & Carry/);
  assert.match(contenu, /Total juillet 2026/);

  const xlsx = await appeler('/api/exports/achats/xlsx?annee=2026');
  const octets = new Uint8Array(await xlsx.arrayBuffer());
  assert.equal(octets[0], 0x50);
  assert.equal(octets[1], 0x4b);

  const pdf = await appeler('/api/exports/achats/pdf?annee=2026');
  const texte = Buffer.from(await pdf.arrayBuffer()).toString('latin1');
  assert.equal(texte.slice(0, 5), '%PDF-');
});

test('les exports exigent une année valide', async () => {
  assert.equal((await appeler('/api/exports/csv')).status, 400);
  assert.equal((await appeler('/api/exports/pdf?annee=abc')).status, 400);
  assert.equal((await appeler('/api/exports/xlsx?annee=2026&mois=13')).status, 400);
  assert.equal((await appeler('/api/exports/achats/csv')).status, 400);
  assert.equal((await appeler('/api/exports/rapport-annuel')).status, 400);
  assert.equal((await appeler('/api/exports/controle?annee=abc')).status, 400);
});

test('GET /api/exports/rapport-annuel produit le rapport de gestion en PDF', async () => {
  const reponse = await appeler('/api/exports/rapport-annuel?annee=2026');
  assert.equal(reponse.status, 200);
  assert.match(reponse.headers.get('content-type'), /application\/pdf/);
  assert.match(reponse.headers.get('content-disposition'), /rapport-annuel-2026\.pdf/);
  const texte = Buffer.from(await reponse.arrayBuffer()).toString('latin1');
  assert.equal(texte.slice(0, 5), '%PDF-');
});

test('le contrôle avant export passe les deux registres en revue', async () => {
  const recettes = await (await appeler('/api/exports/controle?annee=2026')).json();
  assert.ok(recettes.nombre > 0, 'des recettes à contrôler sur 2026');
  assert.ok(Array.isArray(recettes.points) && recettes.points.length >= 6);
  for (const point of recettes.points) {
    assert.ok(['ok', 'attention', 'erreur'].includes(point.etat), `état connu : ${point.etat}`);
    assert.ok(point.libelle && point.detail, 'chaque point s’explique');
  }
  assert.ok(
    recettes.points.some((p) => p.libelle.startsWith('Continuité de la numérotation')),
    'la numérotation fait partie du contrôle des recettes'
  );

  const achats = await (await appeler('/api/exports/achats/controle?annee=2026')).json();
  assert.ok(achats.points.some((p) => p.libelle.startsWith('Référence de la pièce')));

  // Le contrôle observe, il n'écrit rien.
  const avant = (await (await appeler('/api/recettes')).json()).recettes.length;
  await appeler('/api/exports/controle?annee=2026');
  assert.equal((await (await appeler('/api/recettes')).json()).recettes.length, avant);
});

test('le contrôle se restreint au mois demandé', async () => {
  const annee = await (await appeler('/api/exports/controle?annee=2026')).json();
  const mois = await (await appeler('/api/exports/controle?annee=2026&mois=7')).json();
  assert.ok(mois.nombre <= annee.nombre, 'un mois ne contient pas plus que son année');
});

// ---- Requêtes venues d'un autre site --------------------------------------------

test('une écriture demandée par un site tiers est refusée', async () => {
  // Un site visité par l'utilisateur peut envoyer un formulaire vers
  // l'application locale : le navigateur annonce alors « cross-site ».
  const envoyer = (chemin, entetes) => fetch(`${base}${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...entetes },
    body: JSON.stringify({})
  });

  for (const chemin of ['/api/maj/appliquer', '/api/recettes', '/api/achats', '/api/sauvegardes/restaurer']) {
    const parSecFetch = await envoyer(chemin, { 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(parSecFetch.status, 403, `${chemin} doit refuser une requête cross-site`);

    const parOrigine = await envoyer(chemin, { Origin: 'https://exemple-malveillant.test' });
    assert.equal(parOrigine.status, 403, `${chemin} doit refuser une origine étrangère`);
  }

  // L'application elle-même reste évidemment servie.
  const legitime = await envoyer('/api/recettes', { 'Sec-Fetch-Site': 'same-origin' });
  assert.notEqual(legitime.status, 403);

  // Les lectures ne sont jamais bloquées.
  const lecture = await fetch(`${base}/api/recettes`, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(lecture.status, 200);
});

// ---- Mise à jour ---------------------------------------------------------------

test('GET /api/maj ne contacte rien quand la vérification est désactivée', async () => {
  const parametres = (await (await appeler('/api/parametres')).json()).parametres;
  await appeler('/api/parametres', {
    methode: 'PUT',
    corps: { ...parametres, verifierMisesAJour: false }
  });

  const maj = await (await appeler('/api/maj')).json();
  assert.equal(maj.actif, false);
  assert.equal(maj.disponible, false);
  // Lancée depuis les sources, l'application ne peut pas se remplacer.
  assert.equal(maj.remplacable, false);

  await appeler('/api/parametres', { methode: 'PUT', corps: parametres });
});

// ---- Paramètres, sauvegarde, routes inconnues ----------------------------------

test('PUT /api/parametres enregistre et valide', async () => {
  const bon = await appeler('/api/parametres', {
    methode: 'PUT',
    corps: { nomEntreprise: 'Ma micro', siren: '123 456 782', typeActivite: 'prestations', devise: 'EUR', formatDate: 'JJ/MM/AAAA' }
  });
  assert.equal(bon.status, 200);
  const { parametres } = await bon.json();
  assert.equal(parametres.siren, '123456782');
  assert.equal(parametres.typeActivite, 'prestations');

  const mauvais = await appeler('/api/parametres', { methode: 'PUT', corps: { siren: '12' } });
  assert.equal(mauvais.status, 400);
});

test('un mode personnalisé se crée, sert dans une recette, et ne peut plus être supprimé', async () => {
  // Création du mode.
  const creation = await (await appeler('/api/parametres', {
    methode: 'PUT',
    corps: { typeActivite: 'prestations', modesPersonnalises: [{ libelle: 'Lydia' }] }
  })).json();
  const mode = creation.parametres.modesPersonnalises[0];
  assert.equal(mode.libelle, 'Lydia');

  // Une recette peut l'utiliser.
  const recette = await appeler('/api/recettes', {
    methode: 'POST',
    corps: { ...RECETTE, client: 'Client Lydia', numeroFacture: 'LYD-1', modeReglement: mode.code }
  });
  assert.equal(recette.status, 201);
  const { recettes } = await (await appeler('/api/recettes')).json();
  assert.equal(recettes.filter((r) => r.modeReglement === mode.code).length, 1);

  // L'export CSV affiche le libellé du mode personnalisé.
  const csv = new TextDecoder('utf-8').decode(
    await (await appeler('/api/exports/csv?annee=2026')).arrayBuffer()
  );
  assert.match(csv, /Lydia/);

  // Suppression refusée tant que des recettes l'utilisent ; renommage accepté.
  const suppression = await appeler('/api/parametres', {
    methode: 'PUT',
    corps: { typeActivite: 'prestations', modesPersonnalises: [] }
  });
  assert.equal(suppression.status, 400);
  const renommage = await appeler('/api/parametres', {
    methode: 'PUT',
    corps: { typeActivite: 'prestations', modesPersonnalises: [{ code: mode.code, libelle: 'Lydia Pro' }] }
  });
  assert.equal(renommage.status, 200);
});

test('activité mixte : bilan URSSAF ventilé et exports avec catégorie', async () => {
  const { parametres } = await (await appeler('/api/parametres')).json();
  const bascule = await appeler('/api/parametres', {
    methode: 'PUT',
    corps: { ...parametres, typeActivite: 'mixte' }
  });
  assert.equal(bascule.status, 200);

  assert.equal((await appeler('/api/recettes', {
    methode: 'POST',
    corps: { ...RECETTE, client: 'Client mixte', numeroFacture: 'MIX-2', montant: 300, categorie: 'ventes' }
  })).status, 201);
  assert.equal((await appeler('/api/recettes', {
    methode: 'POST',
    corps: { ...RECETTE, client: 'Client mixte bis', numeroFacture: 'MIX-3', montant: 200, categorie: 'prestations' }
  })).status, 201);

  const bilan = await (await appeler('/api/urssaf?annee=2026&type=annee')).json();
  assert.ok(bilan.ventes.chiffreAffaires >= 300);
  assert.ok(bilan.prestations.chiffreAffaires >= 200);
  assert.ok(bilan.nonCategorise.nombreEncaissements >= 1);

  // Le tableau de bord expose la part prestations et respecte l'année demandée.
  const statsPassees = await (await appeler('/api/tableau-de-bord?annee=2025')).json();
  assert.equal(statsPassees.annee, 2025);
  const stats = await (await appeler('/api/tableau-de-bord')).json();
  assert.ok(stats.caAnneePrestations >= 200);
  assert.ok(stats.nombreNonCategorisees >= 1);

  // L'export CSV distingue les deux : colonne Catégorie et lignes « dont … ».
  const csv = new TextDecoder('utf-8').decode(
    await (await appeler('/api/exports/csv?annee=2026')).arrayBuffer()
  );
  assert.match(csv, /;Catégorie;/);
  assert.match(csv, /;Vente;/);
  assert.match(csv, /dont ventes de marchandises/);
  assert.match(csv, /dont prestations de services/);
  assert.match(csv, /dont non catégorisé/);

  // Retour à une activité simple : l'export redevient un registre à 6 colonnes.
  await appeler('/api/parametres', { methode: 'PUT', corps: { ...parametres, typeActivite: 'prestations' } });
  const csvSimple = new TextDecoder('utf-8').decode(
    await (await appeler('/api/exports/csv?annee=2026')).arrayBuffer()
  );
  assert.doesNotMatch(csvSimple, /Catégorie/);
  assert.doesNotMatch(csvSimple, /dont ventes/);
});

test('la recherche SIRET refuse une clé de contrôle invalide sans appel réseau', async () => {
  const reponse = await appeler('/api/clients/recherche-siret?siret=123456789');
  assert.equal(reponse.status, 400);
  assert.match((await reponse.json()).erreur, /clé de contrôle/);
});

test('GET /api/systeme signale la première utilisation, puis plus', async () => {
  // La base de test contient déjà recettes et paramètres : ce n'est plus un
  // premier lancement.
  const systeme = await (await appeler('/api/systeme')).json();
  assert.equal(systeme.premierLancement, false);
  assert.ok(systeme.version);
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

// ---- Disparition du dossier de données ------------------------------------------

/**
 * Scénario complet, sur ses propres dossiers : l'utilisateur supprime son
 * dossier de données, l'application le détecte au démarrage suivant et sait
 * le reconstituer, ou repartir d'un livre vide.
 */
test('le dossier de données supprimé est détecté, puis réparé', async (t) => {
  const donnees = fs.mkdtempSync(path.join(os.tmpdir(), 'livre-recettes-perte-'));
  const copies = fs.mkdtempSync(path.join(os.tmpdir(), 'livre-recettes-perte-copies-'));
  t.after(() => {
    fs.rmSync(donnees, { recursive: true, force: true });
    fs.rmSync(copies, { recursive: true, force: true });
  });

  /** Ouvre l'application sur ces dossiers, comme un nouveau lancement. */
  const lancer = async () => {
    const app = creerApp({ dossierDonnees: donnees, dossierSauvegardes: copies });
    const instance = await new Promise((pret) => {
      const s = app.listen(0, '127.0.0.1', () => pret(s));
    });
    const adresse = `http://127.0.0.1:${instance.address().port}`;
    return {
      adresse,
      // Les connexions gardées ouvertes par `fetch` retiendraient le
      // processus de test bien après la dernière assertion.
      fermer: () => { instance.close(); instance.closeAllConnections(); },
      lire: async (chemin) => (await fetch(adresse + chemin)).json(),
      poster: (chemin, corps) => fetch(adresse + chemin, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps)
      })
    };
  };

  // Vie normale : deux recettes, donc une sauvegarde quotidienne.
  const premier = await lancer();
  await premier.poster('/api/recettes', RECETTE);
  await premier.poster('/api/recettes', { ...RECETTE, numeroFacture: 'FAC-002' });
  premier.fermer();

  // L'utilisateur supprime tout le dossier de données.
  fs.rmSync(donnees, { recursive: true, force: true });

  const apres = await lancer();
  const systeme = await apres.lire('/api/systeme');
  assert.equal(systeme.donneesAbsentes, true, 'la disparition est détectée');
  assert.equal(systeme.premierLancement, true, 'le livre est vide, mais ce n’est pas un vrai début');

  const disponibles = (await apres.lire('/api/sauvegardes')).sauvegardes.map((s) => s.fichier);
  assert.ok(disponibles.some((f) => /^livre-des-recettes-\d{4}-\d{2}-\d{2}\.json$/.test(f)), 'la quotidienne a survécu');
  assert.equal(disponibles[0], 'livre-des-recettes-copie-de-secours.json', 'la plus récente est la copie de secours');

  // Restaurer la plus récente rend TOUTES les saisies, y compris la dernière.
  const restauration = await apres.poster('/api/sauvegardes/restaurer', { fichier: disponibles[0] });
  assert.equal(restauration.status, 200);
  assert.equal((await apres.lire('/api/systeme')).donneesAbsentes, false);
  assert.ok(fs.existsSync(path.join(donnees, 'livre-des-recettes.json')));
  assert.equal((await apres.lire('/api/recettes')).recettes.length, 2, 'rien n’est perdu');
  apres.fermer();

  // Autre issue possible : repartir d'un livre vide.
  fs.rmSync(donnees, { recursive: true, force: true });
  const dernier = await lancer();
  assert.equal((await dernier.lire('/api/systeme')).donneesAbsentes, true);
  assert.equal((await dernier.poster('/api/sauvegardes/repartir-de-zero', {})).status, 200);
  assert.equal((await dernier.lire('/api/systeme')).donneesAbsentes, false);
  assert.equal((await dernier.lire('/api/recettes')).recettes.length, 0);
  assert.ok((await dernier.lire('/api/sauvegardes')).sauvegardes.length > 0, 'les copies restent disponibles');
  dernier.fermer();
});

test('POST /api/demo charge un jeu, puis se refuse sur un livre non vide', async (t) => {
  const donnees = fs.mkdtempSync(path.join(os.tmpdir(), 'livre-recettes-demo-'));
  const copies = fs.mkdtempSync(path.join(os.tmpdir(), 'livre-recettes-demo-copies-'));
  t.after(() => {
    fs.rmSync(donnees, { recursive: true, force: true });
    fs.rmSync(copies, { recursive: true, force: true });
  });

  const app = creerApp({ dossierDonnees: donnees, dossierSauvegardes: copies });
  const instance = await new Promise((pret) => { const s = app.listen(0, '127.0.0.1', () => pret(s)); });
  const adresse = `http://127.0.0.1:${instance.address().port}`;
  const lire = async (chemin) => (await fetch(adresse + chemin)).json();
  const charger = () => fetch(adresse + '/api/demo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });

  const premier = await charger();
  assert.equal(premier.status, 200);

  const recettes = (await lire('/api/recettes')).recettes;
  const achats = (await lire('/api/achats')).achats;
  assert.ok(recettes.length > 0 && achats.length > 0, 'les deux registres sont remplis');
  assert.equal((await lire('/api/parametres')).parametres.jeuDemo, true);
  // Le total des achats remonte bien au tableau de bord.
  assert.ok((await lire('/api/tableau-de-bord')).achatsAnnee >= 0);

  // Une deuxième fois : refus, pour ne jamais recouvrir de vraies données.
  assert.equal((await charger()).status, 409);

  instance.close();
  instance.closeAllConnections();
});
