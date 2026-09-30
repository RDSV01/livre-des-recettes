/**
 * Garde-fous du stockage : fichier resté dans le nuage, sauvegardes
 * vérifiées, copie de secours refaite, écriture réessayée.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerStockage, reessayer } from '../src/stockage.js';

const temporaire = (nom) => fs.mkdtempSync(path.join(os.tmpdir(), `livre-recettes-${nom}-`));

const RECETTE = { dateEncaissement: '2026-07-15', client: 'Client test', libelle: 'Prestation', numeroFacture: '', montant: 100, modeReglement: 'carte' };

/** Un dossier de données et son dossier de sauvegardes, effacés après le test. */
function dossiers(t, nom) {
  const donnees = temporaire(nom);
  const sauvegardes = temporaire(`${nom}-sauvegardes`);
  t.after(() => [donnees, sauvegardes].forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  return { donnees, sauvegardes };
}

test('un livre resté dans iCloud n’est jamais pris pour une disparition', (t) => {
  const { donnees, sauvegardes } = dossiers(t, 'nuage');
  const premier = creerStockage(donnees, { dossierSauvegardes: sauvegardes });
  premier.ajouterRecette(RECETTE);
  premier.ajouterRecette(RECETTE);
  // iCloud a libéré la place : le fichier est remplacé par son marqueur.
  const chemin = premier.cheminFichier;
  const marqueur = path.join(path.dirname(chemin), '.livre-des-recettes.json.icloud');
  fs.renameSync(chemin, marqueur);

  const apres = creerStockage(donnees, { dossierSauvegardes: sauvegardes });
  assert.match(apres.indisponible(), /iCloud/);
  assert.equal(apres.donneesAbsentes(), false, 'pas de proposition de repartir de zéro');
  assert.throws(() => apres.ajouterRecette(RECETTE), { code: 'INDISPONIBLE' });

  // Le fichier revient : il est repris sans relancer l'application.
  fs.renameSync(marqueur, chemin);
  assert.equal(apres.rafraichir({ force: true }), true);
  assert.equal(apres.indisponible(), null);
  assert.equal(apres.listerRecettes().length, 2);
});

test('les sauvegardes sont vérifiées, et une copie de secours abîmée se refait', (t) => {
  const { donnees, sauvegardes } = dossiers(t, 'verif');
  const stockage = creerStockage(donnees, { dossierSauvegardes: sauvegardes });
  stockage.ajouterRecette(RECETTE);
  stockage.ajouterRecette(RECETTE);
  assert.deepEqual(stockage.verifierSauvegardes().problemes, []);

  const quotidienne = fs.readdirSync(sauvegardes).find((f) => /^livre-des-recettes-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  fs.appendFileSync(path.join(sauvegardes, quotidienne), ' ');       // octets changés : empreinte fausse
  fs.writeFileSync(path.join(sauvegardes, 'livre-des-recettes-copie-de-secours.json'), '{ abîmé');
  const bilan = stockage.verifierSauvegardes();
  assert.deepEqual(bilan.problemes, [quotidienne]);
  assert.equal(bilan.reparee, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(sauvegardes, 'livre-des-recettes-copie-de-secours.json'), 'utf8')).recettes.length, 2);
});

test('une copie de secours disparue est refaite dès le démarrage', (t) => {
  const { donnees, sauvegardes } = dossiers(t, 'secours');
  creerStockage(donnees, { dossierSauvegardes: sauvegardes }).ajouterRecette(RECETTE);
  const secours = path.join(sauvegardes, 'livre-des-recettes-copie-de-secours.json');
  fs.rmSync(secours);
  creerStockage(donnees, { dossierSauvegardes: sauvegardes }).assurerCopieDeSecours();
  assert.equal(JSON.parse(fs.readFileSync(secours, 'utf8')).recettes.length, 1);
});

test('une opération retenue un instant par le système est réessayée', () => {
  let essais = 0;
  const resultat = reessayer(() => {
    essais += 1;
    if (essais < 3) throw Object.assign(new Error('occupé'), { code: 'EBUSY' });
    return 'fait';
  }, { pauseMs: 1 });
  assert.equal(resultat, 'fait');
  assert.equal(essais, 3);
  assert.throws(() => reessayer(() => { throw Object.assign(new Error('absent'), { code: 'ENOENT' }); }), { code: 'ENOENT' });
});
