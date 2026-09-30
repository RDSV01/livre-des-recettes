/**
 * Le fichier de sauvegarde et sa reprise : d'un ordinateur à l'autre, depuis
 * un fichier ou depuis la copie d'une clé, sans jamais rien perdre.
 *
 * Chaque « ordinateur » a ses dossiers temporaires ; les « clés » sont des
 * dossiers présentés comme des volumes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { creerStockage } from '../src/stockage.js';
import { creerPieces } from '../src/pieces.js';
import { creerArchives } from '../src/archives.js';
import { creerCopieExterne } from '../src/copie-externe.js';
import { creerFichierSauvegarde } from '../src/fichier-sauvegarde.js';
import { creerZip, lireZip, crc32 } from '../src/exports/zip.js';

const temporaire = (nom) => fs.mkdtempSync(path.join(os.tmpdir(), `livre-recettes-${nom}-`));
const RECETTE = { dateEncaissement: '2026-07-15', client: 'Atelier Dupont', libelle: 'Prestation', numeroFacture: 'F-1', montant: 100, modeReglement: 'carte' };
const pdf = (texte = 'facture') => Buffer.from(`%PDF-1.4\n% ${texte}\n%%EOF\n`, 'latin1');

/** Un ordinateur : son livre, ses pièces, sa copie externe, son fichier de sauvegarde. */
function ordinateur(t, nom, volumes = { liste: [] }) {
  const donnees = temporaire(`${nom}-donnees`);
  const sauvegardes = temporaire(`${nom}-sauvegardes`);
  t.after(() => [donnees, sauvegardes].forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  const stockage = creerStockage(donnees, { dossierSauvegardes: sauvegardes });
  const pieces = creerPieces(donnees, sauvegardes);
  const archives = creerArchives({ dossier: path.join(sauvegardes, 'archives'), stockage, pieces });
  const copieExterne = creerCopieExterne({ stockage, pieces, archives, listerVolumes: async () => volumes.liste, ecarterMemeDisque: false });
  return { donnees, sauvegardes, stockage, pieces, copieExterne, fichier: creerFichierSauvegarde({ stockage, pieces, copieExterne }) };
}

/** Un livre tenu : un client, une recette avec sa facture PDF, un paramètre. */
function livreTenu(pc) {
  pc.stockage.modifierParametres({ nomEntreprise: 'Atelier Martin' });
  pc.stockage.ajouterClient({ nom: 'Atelier Dupont' });
  const recette = pc.stockage.ajouterRecette(RECETTE);
  const piece = pc.pieces.enregistrer(pdf(), 'facture F-1.pdf');
  pc.stockage.joindrePiece('recettes', recette.id, piece);
  return { recette, piece };
}

const sansDates = (lignes) => lignes.map(({ modifieLe, ...reste }) => reste);

test('sauvegarder maintenant, puis reprendre sur un autre ordinateur : tout revient', async (t) => {
  const bureau = ordinateur(t, 'bureau');
  const { piece } = livreTenu(bureau);
  const { nom, contenu } = bureau.fichier.creer();
  assert.match(nom, /^sauvegarde-livre-des-recettes-\d{4}-\d{2}-\d{2}\.zip$/);

  const portable = ordinateur(t, 'portable');
  const analyse = portable.fichier.analyserFichier(contenu, nom);
  assert.deepEqual(analyse.sauvegarde, {
    entreprise: 'Atelier Martin', recettes: 1, achats: 0, clients: 1, pdf: 1, pdfManquants: 0,
    derniereSaisie: analyse.sauvegarde.derniereSaisie
  });
  assert.ok(analyse.sauvegarde.derniereSaisie);
  assert.deepEqual(analyse.actuel, { recettes: 0, achats: 0, clients: 0 });
  assert.equal(analyse.origine.libelle, nom);
  assert.equal(portable.stockage.compter().recettes, 0, 'rien n’est repris avant l’accord');

  const resultat = await portable.fichier.reprendre(analyse.jeton);
  assert.equal(resultat.recettes, 1);
  assert.equal(resultat.pdf, 1);
  assert.deepEqual(portable.stockage.listerRecettes(), bureau.stockage.listerRecettes());
  assert.deepEqual(portable.stockage.listerClients(), bureau.stockage.listerClients());
  assert.equal(portable.stockage.obtenirParametres().nomEntreprise, 'Atelier Martin');
  assert.deepEqual(fs.readFileSync(portable.pieces.chemin(piece.id)), pdf(), 'la facture est à sa place');
  assert.ok(fs.existsSync(path.join(portable.sauvegardes, 'pieces', `${piece.id}.pdf`)), 'et doublée, comme toute pièce');
});

test('reprendre sur un livre déjà tenu : l’ancien reste récupérable', async (t) => {
  const bureau = ordinateur(t, 'bureau');
  livreTenu(bureau);
  const portable = ordinateur(t, 'portable');
  portable.stockage.ajouterRecette({ ...RECETTE, numeroFacture: 'P-9', montant: 999 });

  const analyse = portable.fichier.analyserFichier(bureau.fichier.creer().contenu);
  assert.equal(analyse.actuel.recettes, 1, 'l’utilisateur sait ce qui sera remplacé');
  await portable.fichier.reprendre(analyse.jeton);
  assert.deepEqual(portable.stockage.listerRecettes().map((r) => r.numeroFacture), ['F-1']);

  const mise = portable.stockage.listerSauvegardes().find((s) => s.fichier.endsWith('-avant-reprise.json'));
  assert.ok(mise, 'le livre remplacé est mis de côté');
  portable.stockage.restaurerSauvegarde(mise.fichier);
  assert.deepEqual(portable.stockage.listerRecettes().map((r) => r.numeroFacture), ['P-9']);
});

test('une archive refaite par l’explorateur (compressée, dans un dossier) se reprend aussi', async (t) => {
  const bureau = ordinateur(t, 'bureau');
  const { piece } = livreTenu(bureau);
  // Le fichier décompressé, puis le dossier recompressé : méthode « deflate », un dossier en tête.
  const recompressee = zipCompresse(lireZip(bureau.fichier.creer().contenu).map((f) => ({ nom: `Ma sauvegarde/${f.nom}`, contenu: f.contenu })));

  const portable = ordinateur(t, 'portable');
  const analyse = portable.fichier.analyserFichier(recompressee, 'Ma sauvegarde.zip');
  assert.equal(analyse.sauvegarde.pdf, 1);
  await portable.fichier.reprendre(analyse.jeton);
  assert.equal(portable.stockage.listerRecettes().length, 1);
  assert.ok(portable.pieces.chemin(piece.id));
});

test('un livre seul (.json) se reprend, en signalant les PDF qui manquent', async (t) => {
  const bureau = ordinateur(t, 'bureau');
  livreTenu(bureau);
  const portable = ordinateur(t, 'portable');
  const json = Buffer.from(JSON.stringify(bureau.stockage.exporterDonnees()), 'utf8');
  const analyse = portable.fichier.analyserFichier(json, 'livre.json');
  assert.equal(analyse.sauvegarde.pdf, 0);
  assert.equal(analyse.sauvegarde.pdfManquants, 1);
  await portable.fichier.reprendre(analyse.jeton);
  assert.equal(portable.stockage.listerRecettes().length, 1);
});

test('ce qui n’est pas une sauvegarde est refusé, sans rien toucher', async (t) => {
  const portable = ordinateur(t, 'portable');
  portable.stockage.ajouterRecette(RECETTE);
  const avant = fs.readFileSync(portable.stockage.cheminFichier);
  const refus = [
    Buffer.alloc(0),
    Buffer.from('bonjour'),
    Buffer.from(JSON.stringify({ nom: 'autre chose' })),
    Buffer.from(JSON.stringify({ recettes: 'pas une liste', parametres: {} })),
    creerZip([{ nom: 'photo.txt', contenu: 'rien' }]),
    Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(40)])
  ];
  for (const octets of refus) {
    assert.throws(() => portable.fichier.analyserFichier(octets), { code: 'REPRISE' });
  }
  await assert.rejects(() => portable.fichier.reprendre('jeton-inconnu'), { code: 'REPRISE' });
  assert.deepEqual(fs.readFileSync(portable.stockage.cheminFichier), avant);
});

test('la copie d’une clé se reprend sur un nouvel ordinateur, et la copie automatique continue', async (t) => {
  const cle = temporaire('reprise-cle');
  t.after(() => fs.rmSync(cle, { recursive: true, force: true }));
  const volumes = { liste: [{ chemin: cle, libelle: 'KINGSTON (E:)', amovible: true, taille: 1e9, libre: 1e9 }] };

  const ancien = ordinateur(t, 'ancien', volumes);
  const { piece } = livreTenu(ancien);
  assert.equal((await ancien.copieExterne.choisir(cle)).copie, true);

  const nouveau = ordinateur(t, 'nouveau', volumes);
  const copies = await nouveau.fichier.copies();
  assert.equal(copies.length, 1);
  assert.equal(copies[0].libelle, 'KINGSTON (E:)');
  assert.equal(copies[0].sauvegarde.recettes, 1);

  const analyse = await nouveau.fichier.analyserCopie(cle);
  assert.equal(analyse.origine.type, 'support');
  assert.equal(analyse.copieActive, false);
  const resultat = await nouveau.fichier.reprendre(analyse.jeton, { continuerCopie: true });
  assert.equal(resultat.pdf, 1);
  assert.deepEqual(sansDates(nouveau.stockage.listerRecettes()), sansDates(ancien.stockage.listerRecettes()));
  assert.ok(nouveau.pieces.chemin(piece.id));
  assert.equal(resultat.copie.copie, true);
  assert.equal(nouveau.copieExterne.etat().active, true, 'la même clé, sans la rechoisir');
  assert.equal(nouveau.copieExterne.etat().enRetard, false);
});

test('seule une copie trouvée sur un support branché peut être lue', async (t) => {
  const nouveau = ordinateur(t, 'nouveau');
  await assert.rejects(() => nouveau.fichier.analyserCopie('C:\\Windows'), { code: 'REPRISE' });
});

test('une clé retirée pendant la reprise : rien n’est remplacé', async (t) => {
  const cle = temporaire('reprise-retiree');
  t.after(() => fs.rmSync(cle, { recursive: true, force: true }));
  const volumes = { liste: [{ chemin: cle, libelle: 'CLÉ (F:)', amovible: true, taille: 1e9, libre: 1e9 }] };
  const ancien = ordinateur(t, 'ancien', volumes);
  livreTenu(ancien);
  await ancien.copieExterne.choisir(cle);

  const nouveau = ordinateur(t, 'nouveau', volumes);
  nouveau.stockage.ajouterRecette({ ...RECETTE, numeroFacture: 'N-1' });
  const analyse = await nouveau.fichier.analyserCopie(cle);
  fs.rmSync(path.join(cle, 'Livre des recettes - copie de sécurité', 'pieces'), { recursive: true });
  await assert.rejects(() => nouveau.fichier.reprendre(analyse.jeton), { code: 'REPRISE' });
  assert.deepEqual(nouveau.stockage.listerRecettes().map((r) => r.numeroFacture), ['N-1']);
});

test('un livre momentanément inaccessible n’est jamais remplacé', (t) => {
  const pc = ordinateur(t, 'nuage');
  pc.stockage.ajouterRecette(RECETTE);
  fs.renameSync(pc.stockage.cheminFichier, path.join(pc.donnees, '.livre-des-recettes.json.icloud'));
  const relu = creerStockage(pc.donnees, { dossierSauvegardes: pc.sauvegardes });
  assert.ok(relu.indisponible());
  assert.throws(() => relu.reprendre({ recettes: [], parametres: {} }), { code: 'INDISPONIBLE' });
});

test('l’archive ZIP relue est contrôlée : un octet changé est repéré', () => {
  const zip = creerZip([{ nom: 'livre-des-recettes.json', contenu: '{"recettes":[],"parametres":{}}' }]);
  assert.equal(lireZip(zip)[0].contenu.toString(), '{"recettes":[],"parametres":{}}');
  const abimee = Buffer.from(zip);
  abimee[30 + 'livre-des-recettes.json'.length + 5] ^= 0xff; // dans le contenu du fichier
  assert.throws(() => lireZip(abimee), /abîmée/);
});

/** Une archive compressée (« deflate »), comme celles de l'explorateur de fichiers. */
function zipCompresse(fichiers) {
  const locaux = [];
  const central = [];
  let position = 0;
  for (const { nom, contenu } of fichiers) {
    const donnees = zlib.deflateRawSync(contenu);
    const nomOctets = Buffer.from(nom, 'utf8');
    const entete = Buffer.alloc(30);
    entete.writeUInt32LE(0x04034b50, 0);
    entete.writeUInt16LE(20, 4);
    entete.writeUInt16LE(0x0800, 6);
    entete.writeUInt16LE(8, 8);
    entete.writeUInt32LE(crc32(contenu), 14);
    entete.writeUInt32LE(donnees.length, 18);
    entete.writeUInt32LE(contenu.length, 22);
    entete.writeUInt16LE(nomOctets.length, 26);
    locaux.push(entete, nomOctets, donnees);
    const repertoire = Buffer.alloc(46);
    repertoire.writeUInt32LE(0x02014b50, 0);
    repertoire.writeUInt16LE(20, 4);
    repertoire.writeUInt16LE(20, 6);
    repertoire.writeUInt16LE(0x0800, 8);
    repertoire.writeUInt16LE(8, 10);
    repertoire.writeUInt32LE(crc32(contenu), 16);
    repertoire.writeUInt32LE(donnees.length, 20);
    repertoire.writeUInt32LE(contenu.length, 24);
    repertoire.writeUInt16LE(nomOctets.length, 28);
    repertoire.writeUInt32LE(position, 42);
    central.push(repertoire, nomOctets);
    position += 30 + nomOctets.length + donnees.length;
  }
  const taille = central.reduce((t, b) => t + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(taille, 12);
  fin.writeUInt32LE(position, 16);
  return Buffer.concat([...locaux, ...central, fin]);
}

test('un livre illisible ne donne jamais de sauvegarde vide', (t) => {
  const pc = ordinateur(t, 'abime');
  pc.stockage.ajouterRecette(RECETTE);
  fs.writeFileSync(pc.stockage.cheminFichier, '{ abîmé', 'utf8');
  const relu = creerStockage(pc.donnees, { dossierSauvegardes: pc.sauvegardes });
  const fichier = creerFichierSauvegarde({ stockage: relu, pieces: pc.pieces, copieExterne: pc.copieExterne });
  assert.throws(() => fichier.creer(), { code: 'INDISPONIBLE' });
});
