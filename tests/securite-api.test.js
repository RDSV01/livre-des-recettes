/**
 * Routes de la sécurité des données, en conditions réelles (serveur à
 * l'écoute).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerApp } from '../src/app.js';

const RECETTE = { dateEncaissement: '2026-07-15', client: 'Client', libelle: 'Prestation', numeroFacture: 'F1', montant: 100, modeReglement: 'carte' };

/** Lance l'application sur ces dossiers ; `fermer` libère le port. */
async function lancer(donnees, sauvegardes) {
  const app = creerApp({ dossierDonnees: donnees, dossierSauvegardes: sauvegardes });
  const serveur = await new Promise((pret) => { const s = app.listen(0, '127.0.0.1', () => pret(s)); });
  const adresse = `http://127.0.0.1:${serveur.address().port}`;
  const envoyer = async (methode, chemin, corps) => {
    const reponse = await fetch(adresse + chemin, {
      method: methode, headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined
    });
    const texte = await reponse.text();
    return { statut: reponse.status, corps: texte ? JSON.parse(texte) : null };
  };
  return {
    lire: (chemin) => envoyer('GET', chemin),
    poster: (chemin, corps) => envoyer('POST', chemin, corps ?? {}),
    telecharger: async (chemin) => Buffer.from(await (await fetch(adresse + chemin)).arrayBuffer()),
    /** Envoie un fichier tel quel, comme le fait l'interface. */
    envoyerFichier: async (chemin, octets, nom) => {
      const reponse = await fetch(adresse + chemin, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Nom-Fichier': encodeURIComponent(nom) }, body: octets
      });
      return { statut: reponse.status, corps: await reponse.json() };
    },
    fermer: () => { serveur.close(); serveur.closeAllConnections(); }
  };
}

function dossiers(t, ...noms) {
  const liste = noms.map((n) => fs.mkdtempSync(path.join(os.tmpdir(), `livre-recettes-${n}-`)));
  t.after(() => liste.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  return liste;
}

test('l’écran Sécurité reçoit l’état de toutes les protections', async (t) => {
  const [donnees, sauvegardes] = dossiers(t, 'secu', 'secu-sauv');
  const app = await lancer(donnees, sauvegardes);
  t.after(app.fermer);
  await app.poster('/api/recettes', RECETTE);
  await app.poster('/api/recettes', RECETTE);

  const { statut, corps } = await app.lire('/api/securite');
  assert.equal(statut, 200);
  assert.ok(corps.sauvegardes.nombre >= 2, 'copie de secours et sauvegarde du jour');
  assert.ok(corps.sauvegardes.derniere);
  assert.deepEqual(corps.sauvegardes.verification.problemes, []);
  assert.equal(corps.copieExterne.active, false);
  assert.deepEqual(corps.archives.annees, []);

  const systeme = (await app.lire('/api/systeme')).corps;
  assert.equal(systeme.copieExterne.active, false);
  assert.equal(systeme.indisponible, null);
  assert.equal(systeme.majEchouee, null);
  // L'interface signale avoir montré l'échec d'une mise à jour : il ne revient plus.
  assert.equal((await app.poster('/api/maj/echec-vu')).statut, 204);
  assert.equal((await app.lire('/api/systeme')).corps.majEchouee, null);
});

test('« Sauvegarder maintenant » sur un ordinateur, « Reprendre » sur un autre', async (t) => {
  const [donneesA, sauvA, donneesB, sauvB] = dossiers(t, 'transfert-a', 'transfert-a-sauv', 'transfert-b', 'transfert-b-sauv');
  const ancien = await lancer(donneesA, sauvA);
  t.after(ancien.fermer);
  await ancien.poster('/api/recettes', RECETTE);
  const fichier = await ancien.telecharger('/api/sauvegarde');

  const nouveau = await lancer(donneesB, sauvB);
  t.after(nouveau.fermer);
  const refus = await nouveau.envoyerFichier('/api/sauvegarde/fichier', Buffer.from('pas une sauvegarde'), 'notes.txt');
  assert.equal(refus.statut, 400);
  assert.match(refus.corps.erreur, /pas une sauvegarde/);

  const lu = await nouveau.envoyerFichier('/api/sauvegarde/fichier', fichier, 'sauvegarde-livre-des-recettes.zip');
  assert.equal(lu.statut, 200);
  assert.equal(lu.corps.sauvegarde.recettes, 1);
  assert.equal((await nouveau.lire('/api/recettes')).corps.recettes.length, 0, 'rien avant l’accord');

  const reprise = await nouveau.poster('/api/sauvegarde/reprendre', { jeton: lu.corps.jeton });
  assert.equal(reprise.statut, 200);
  assert.deepEqual((await nouveau.lire('/api/recettes')).corps.recettes.map((r) => r.numeroFacture), ['F1']);
  assert.equal((await nouveau.poster('/api/sauvegarde/reprendre', { jeton: lu.corps.jeton })).statut, 400, 'une seule fois');
});
