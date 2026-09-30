/**
 * Archives annuelles : chaque année close figée avec ses registres et ses
 * PDF, jamais l'année en cours, et un archivage jamais bloqué.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerStockage } from '../src/stockage.js';
import { creerPieces } from '../src/pieces.js';
import { creerArchives } from '../src/archives.js';

const temporaire = (nom) => fs.mkdtempSync(path.join(os.tmpdir(), `livre-recettes-${nom}-`));
const RECETTE = { client: 'Client', libelle: 'Prestation', numeroFacture: 'F-1', montant: 100, modeReglement: 'carte' };
const MAINTENANT = new Date('2026-09-29T12:00:00');

function environnement(t) {
  const donnees = temporaire('arch-donnees');
  const sauvegardes = temporaire('arch-sauvegardes');
  t.after(() => [donnees, sauvegardes].forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  const stockage = creerStockage(donnees, { dossierSauvegardes: sauvegardes });
  const pieces = creerPieces(donnees, sauvegardes);
  const dossier = path.join(sauvegardes, 'archives');
  return { stockage, pieces, dossier, archives: creerArchives({ dossier, stockage, pieces }) };
}

test('une année close est figée avec son registre et ses PDF, jamais l’année en cours', async (t) => {
  const { stockage, pieces, dossier, archives } = environnement(t);
  const ancienne = stockage.ajouterRecette({ ...RECETTE, dateEncaissement: '2025-03-10' });
  stockage.joindrePiece('recettes', ancienne.id, pieces.enregistrer(Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1'), 'f.pdf'));
  stockage.ajouterRecette({ ...RECETTE, dateEncaissement: '2026-02-01', numeroFacture: 'F-2' });

  assert.deepEqual(await archives.archiver({ maintenant: MAINTENANT }), [2025]);
  const version = path.join(dossier, '2025', fs.readdirSync(path.join(dossier, '2025')).find((n) => /^\d{4}-/.test(n)));
  assert.ok(fs.existsSync(path.join(version, 'livre-des-recettes-2025.pdf')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(version, 'livre-des-recettes-2025.json'), 'utf8')).recettes.length, 1);
  assert.equal(fs.readdirSync(path.join(dossier, '2025', 'pieces')).length, 1);
  assert.ok(!fs.existsSync(path.join(dossier, '2026')), 'l’année en cours n’est pas close');
  assert.deepEqual(await archives.archiver({ maintenant: MAINTENANT }), [], 'rien de changé, rien de refait');
});

test('un premier archivage sans année close ne bloque pas les suivants', async (t) => {
  const { stockage, archives } = environnement(t);
  // Premier lancement : aucune année close, l'archivage n'a rien à faire.
  assert.deepEqual(await archives.archiver({ maintenant: MAINTENANT }), []);
  // Une facture de l'an dernier saisie ensuite, dans la même session.
  stockage.ajouterRecette({ ...RECETTE, dateEncaissement: '2025-12-20' });
  assert.deepEqual(await archives.archiver({ maintenant: MAINTENANT }), [2025]);
  assert.deepEqual(archives.lister().map((a) => a.annee), [2025]);
});
