/**
 * Copie de sécurité sur une clé USB ou un disque : le bon support à coup
 * sûr, une copie complète et vérifiée, jamais sur un autre support.
 *
 * Les « clés » sont des dossiers temporaires, présentés comme des volumes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerStockage } from '../src/stockage.js';
import { creerPieces } from '../src/pieces.js';
import { creerArchives } from '../src/archives.js';
import { creerCopieExterne, NOM_DOSSIER_SUPPORT } from '../src/copie-externe.js';

const temporaire = (nom) => fs.mkdtempSync(path.join(os.tmpdir(), `livre-recettes-${nom}-`));
const RECETTE = { dateEncaissement: '2026-07-15', client: 'Client', libelle: 'Prestation', numeroFacture: '', montant: 100, modeReglement: 'carte' };
const pdf = Buffer.from('%PDF-1.4\n% test\n%%EOF\n', 'latin1');

function environnement(t, { ecarterMemeDisque = false } = {}) {
  const donnees = temporaire('ext-donnees');
  const sauvegardes = temporaire('ext-sauvegardes');
  const cle = temporaire('ext-cle');
  const autre = temporaire('ext-autre');
  t.after(() => [donnees, sauvegardes, cle, autre].forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  const stockage = creerStockage(donnees, { dossierSauvegardes: sauvegardes });
  const pieces = creerPieces(donnees, sauvegardes);
  const archives = creerArchives({ dossier: path.join(sauvegardes, 'archives'), stockage, pieces });
  const volumes = { liste: [{ chemin: cle, libelle: 'CLÉ (E:)', amovible: true, taille: 1e9, libre: 1e9 }] };
  const copie = creerCopieExterne({ stockage, pieces, archives, listerVolumes: async () => volumes.liste, ecarterMemeDisque });
  return { stockage, pieces, copie, cle, autre, volumes, sauvegardes };
}

test('choisir une clé y pose la marque et copie le livre, relu à l’identique', async (t) => {
  const { stockage, pieces, copie, cle } = environnement(t);
  const recette = stockage.ajouterRecette(RECETTE);
  stockage.joindrePiece('recettes', recette.id, pieces.enregistrer(pdf, 'facture.pdf'));

  assert.deepEqual((await copie.supports()).map((s) => s.libelle), ['CLÉ (E:)']);
  const resultat = await copie.choisir(cle);
  assert.equal(resultat.copie, true);

  const dossier = path.join(cle, NOM_DOSSIER_SUPPORT);
  assert.ok(fs.existsSync(path.join(dossier, '.livre-des-recettes-support.json')), 'marque posée');
  assert.deepEqual(fs.readFileSync(path.join(dossier, 'livre-des-recettes.json')), fs.readFileSync(stockage.cheminFichier));
  assert.equal(fs.readdirSync(path.join(dossier, 'pieces')).length, 1, 'la facture PDF suit');
  assert.equal(fs.readdirSync(path.join(dossier, 'versions')).length, 1, 'une version du jour');

  const etat = copie.etat();
  assert.equal(etat.active, true);
  assert.equal(etat.present, true);
  assert.equal(etat.enRetard, false);
  assert.ok(etat.derniereCopie);
  assert.equal((await copie.supports())[0].choisi, true);
});

test('la clé est reconnue à sa marque, même sous une autre lettre', async (t) => {
  const { stockage, copie, cle, volumes } = environnement(t);
  stockage.ajouterRecette(RECETTE);
  await copie.choisir(cle);

  // Rebranchée ailleurs (F: au lieu de E:) : même clé, nouveau chemin.
  const ailleurs = `${cle}-F`;
  fs.renameSync(cle, ailleurs);
  t.after(() => fs.rmSync(ailleurs, { recursive: true, force: true }));
  volumes.liste = [{ chemin: ailleurs, libelle: 'CLÉ (F:)', amovible: true, taille: 1e9, libre: 1e9 }];
  stockage.ajouterRecette({ ...RECETTE, montant: 7 });
  assert.equal((await copie.copier()).copie, true);
  const copieLue = JSON.parse(fs.readFileSync(path.join(ailleurs, NOM_DOSSIER_SUPPORT, 'livre-des-recettes.json'), 'utf8'));
  assert.equal(copieLue.recettes.length, 2);
  assert.equal(copie.etat().libelle, 'CLÉ (F:)');
});

test('rien n’est jamais copié sur un autre support', async (t) => {
  const { stockage, copie, cle, autre, volumes } = environnement(t);
  stockage.ajouterRecette(RECETTE);
  await copie.choisir(cle);

  // La clé est débranchée ; une autre est branchée et prend sa lettre (E:).
  const debranchee = `${cle}-debranchee`;
  fs.renameSync(cle, debranchee);
  t.after(() => fs.rmSync(debranchee, { recursive: true, force: true }));
  fs.renameSync(autre, cle);
  volumes.liste = [{ chemin: cle, libelle: 'AUTRE (E:)', amovible: true, taille: 1e9, libre: 1e9 }];
  stockage.ajouterRecette(RECETTE);
  const resultat = await copie.copier();
  assert.equal(resultat.raison, 'absent');
  assert.deepEqual(fs.readdirSync(cle), [], 'l’autre clé reste vierge');
  assert.equal(copie.etat().present, false);
});

test('un support plein est signalé, sans rien abîmer', async (t) => {
  const { stockage, copie, cle, volumes } = environnement(t);
  stockage.ajouterRecette(RECETTE);
  await copie.choisir(cle);
  const avant = fs.readFileSync(path.join(cle, NOM_DOSSIER_SUPPORT, 'livre-des-recettes.json'));
  // Place libre simulée à zéro : `statfs` lit le vrai disque, on la force ici.
  const statfs = fs.statfsSync;
  fs.statfsSync = () => ({ blocks: 1000, bsize: 512, bavail: 0 });
  t.after(() => { fs.statfsSync = statfs; });
  stockage.ajouterRecette({ ...RECETTE, montant: 3 });
  const resultat = await copie.copier();
  assert.equal(resultat.copie, false);
  assert.match(copie.etat().echec, /plein/);
  assert.deepEqual(fs.readFileSync(path.join(cle, NOM_DOSSIER_SUPPORT, 'livre-des-recettes.json')), avant, 'la copie précédente est intacte');
  void volumes;
});

test('le disque qui porte déjà le livre n’est jamais proposé', async (t) => {
  const { copie } = environnement(t, { ecarterMemeDisque: true });
  // La « clé » de ce test est un dossier du même disque : écartée.
  assert.deepEqual(await copie.supports(), []);
});

test('arrêter la copie laisse ce qui est déjà sur la clé', async (t) => {
  const { stockage, copie, cle } = environnement(t);
  stockage.ajouterRecette(RECETTE);
  await copie.choisir(cle);
  copie.arreter();
  assert.equal(copie.etat().active, false);
  assert.ok(fs.existsSync(path.join(cle, NOM_DOSSIER_SUPPORT, 'livre-des-recettes.json')));
});

test('un livre abîmé n’écrase jamais la dernière bonne copie', async (t) => {
  const { stockage, pieces, cle, volumes, sauvegardes } = environnement(t);
  stockage.ajouterRecette(RECETTE);
  await copie0(stockage, pieces, volumes, sauvegardes).choisir(cle);
  const bonne = fs.readFileSync(path.join(cle, NOM_DOSSIER_SUPPORT, 'livre-des-recettes.json'));

  fs.writeFileSync(stockage.cheminFichier, '{ abîmé', 'utf8');
  const relu = creerStockage(path.dirname(stockage.cheminFichier), { dossierSauvegardes: sauvegardes });
  assert.ok(relu.corruption());
  const resultat = await copie0(relu, pieces, volumes, sauvegardes).copier({ force: true });
  assert.equal(resultat.copie, false);
  assert.deepEqual(fs.readFileSync(path.join(cle, NOM_DOSSIER_SUPPORT, 'livre-des-recettes.json')), bonne);
});

test('une copie identique au livre n’est jamais en retard, même ancienne', async (t) => {
  const { stockage, copie, cle, sauvegardes } = environnement(t);
  stockage.ajouterRecette(RECETTE);
  await copie.choisir(cle);
  // Dernière copie il y a trois semaines, et le livre n'a pas changé depuis.
  const reglage = path.join(sauvegardes, 'copie-externe.json');
  const lu = JSON.parse(fs.readFileSync(reglage, 'utf8'));
  fs.writeFileSync(reglage, JSON.stringify({ ...lu, derniereCopie: new Date(Date.now() - 21 * 86_400_000).toISOString() }));
  assert.equal(copie.etat().enRetard, false);
  stockage.ajouterRecette({ ...RECETTE, montant: 5 });
  assert.equal(copie.etat().enRetard, true, 'le livre a changé depuis : la copie est en retard');
});

/** Une copie externe sur ce livre, avec son propre suivi (comme après un redémarrage). */
function copie0(stockage, pieces, volumes, sauvegardes) {
  const archives = creerArchives({ dossier: path.join(sauvegardes, 'archives'), stockage, pieces });
  return creerCopieExterne({ stockage, pieces, archives, listerVolumes: async () => volumes.liste, ecarterMemeDisque: false });
}
