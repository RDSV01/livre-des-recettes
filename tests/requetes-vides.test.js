/**
 * Chaque route qui écrit répond proprement à un envoi vide ou mal formé :
 * un refus (4xx) ou un succès, jamais une erreur interne (5xx). Express ne
 * fournit pas de corps vide par défaut : sans ce garde-fou, une simple
 * déstructuration de `req.body` ferait tomber la route.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerApp } from '../src/app.js';
import { ecouterSurUnPortLibre } from '../src/lancement.js';

test('aucune route d’écriture ne tombe sur un envoi vide ou mal formé', async (t) => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'livre-recettes-vides-'));
  const app = creerApp({
    dossierDonnees: path.join(racine, 'donnees'),
    dossierSauvegardes: path.join(racine, 'sauvegardes'),
    listerVolumes: async () => []
  });
  const serveur = await ecouterSurUnPortLibre(app);
  t.after(() => {
    serveur.closeAllConnections();
    serveur.close();
    fs.rmSync(racine, { recursive: true, force: true });
  });
  const adresse = `http://127.0.0.1:${serveur.address().port}`;
  const envoyer = (methode, chemin, { corps, type } = {}) => fetch(adresse + chemin, {
    method: methode, headers: type ? { 'Content-Type': type } : {}, body: corps
  });

  // De quoi viser des lignes qui existent.
  const json = { type: 'application/json' };
  const recette = (await (await envoyer('POST', '/api/recettes', { ...json, corps: JSON.stringify({
    dateEncaissement: '2026-07-15', client: 'Client', libelle: '', numeroFacture: '', montant: 10, modeReglement: 'carte'
  }) })).json()).recette;
  const achat = (await (await envoyer('POST', '/api/achats', { ...json, corps: JSON.stringify({
    dateReglement: '2026-07-15', fournisseur: 'Fournisseur', referenceFacture: '', montant: 5, modeReglement: 'carte'
  }) })).json()).achat;
  const client = (await (await envoyer('POST', '/api/clients', { ...json, corps: JSON.stringify({ nom: 'Client', siret: '' }) })).json()).client;
  assert.ok(recette?.id && achat?.id && client?.id);

  const routes = [
    ['POST', '/api/recettes'], ['PUT', `/api/recettes/${recette.id}`], ['POST', '/api/recettes/import'],
    ['POST', '/api/recettes/lot/supprimer'], ['POST', '/api/recettes/lot/restaurer'], ['PUT', '/api/recettes/lot'],
    ['POST', `/api/recettes/${recette.id}/piece`], ['POST', `/api/recettes/${recette.id}/piece/rattacher`],
    ['POST', '/api/achats'], ['PUT', `/api/achats/${achat.id}`], ['POST', '/api/achats/import'],
    ['POST', '/api/achats/lot/supprimer'], ['POST', '/api/achats/lot/restaurer'],
    ['POST', `/api/achats/${achat.id}/piece`], ['POST', `/api/achats/${achat.id}/piece/rattacher`],
    ['POST', '/api/clients'], ['PUT', `/api/clients/${client.id}`],
    ['PUT', '/api/parametres'],
    ['POST', '/api/sauvegardes/restaurer'],
    ['POST', '/api/sauvegarde/fichier'], ['POST', '/api/sauvegarde/copie'], ['POST', '/api/sauvegarde/reprendre'],
    ['POST', '/api/securite/copie-externe'], ['POST', '/api/securite/copie-externe/copier'],
    ['POST', '/api/maj/echec-vu'], ['POST', '/api/demo']
  ];
  const envois = [
    ['sans corps', {}],
    ['JSON vide', { type: 'application/json', corps: '' }],
    ['JSON illisible', { type: 'application/json', corps: '{ pas du json' }],
    ['JSON null', { type: 'application/json', corps: 'null' }],
    ['tableau JSON', { type: 'application/json', corps: '[]' }],
    ['texte brut', { type: 'text/plain', corps: 'bonjour' }]
  ];
  const chutes = [];
  for (const [methode, chemin] of routes) {
    for (const [nom, envoi] of envois) {
      const reponse = await envoyer(methode, chemin, envoi);
      if (reponse.status >= 500) chutes.push(`${methode} ${chemin} (${nom}) : ${reponse.status} ${await reponse.text()}`);
    }
  }
  assert.deepEqual(chutes, []);
});
