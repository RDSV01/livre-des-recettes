/**
 * Pièces jointes PDF : module de rangement, archive ZIP, et routes HTTP
 * (joindre, lire, retirer, rattacher, restaurer une ligne supprimée, exporter
 * avec les PDF). Tout se passe dans des dossiers temporaires.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { creerApp } from '../src/app.js';
import { creerStockage } from '../src/stockage.js';
import { creerPieces, fichePiece, nomPiece, estPdf } from '../src/pieces.js';
import { creerZip, crc32, nomsUniques } from '../src/exports/zip.js';

/** Un PDF minimal : seule la signature compte pour le serveur. */
const pdf = (texte = 'facture') => Buffer.from(`%PDF-1.4\n% ${texte}\n%%EOF\n`, 'latin1');

const temporaire = (nom) => fs.mkdtempSync(path.join(os.tmpdir(), `livre-recettes-${nom}-`));

describe('module des pièces', () => {
  let donnees;
  let copies;

  before(() => {
    donnees = temporaire('pieces');
    copies = temporaire('pieces-copies');
  });

  after(() => {
    fs.rmSync(donnees, { recursive: true, force: true });
    fs.rmSync(copies, { recursive: true, force: true });
  });

  test('reconnaît un PDF à sa signature, pas à son nom', () => {
    assert.equal(estPdf(pdf()), true);
    assert.equal(estPdf(Buffer.from('PK\u0003\u0004', 'latin1')), false);
    assert.equal(estPdf(Buffer.alloc(0)), false);
  });

  test('nettoie le nom de fichier et garde l’extension', () => {
    assert.equal(nomPiece('C:\\Users\\moi\\Facture été.pdf'), 'Facture été.pdf');
    assert.equal(nomPiece('../../secret'), 'secret.pdf');
    assert.equal(nomPiece('a"b<c>.PDF'), 'abc.PDF');
    assert.equal(nomPiece(''), 'piece.pdf');
  });

  test('n’accepte qu’une fiche à identifiant UUID', () => {
    assert.equal(fichePiece({ id: '../livre-des-recettes', nom: 'x.pdf', taille: 3 }), null);
    assert.equal(fichePiece(null), null);
    const id = crypto.randomUUID();
    assert.deepEqual(fichePiece({ id, nom: 'x', taille: 12 }), { id, nom: 'x.pdf', taille: 12 });
  });

  test('enregistre, double hors du dossier de données et reconstitue', () => {
    const pieces = creerPieces(donnees, copies);
    const fiche = pieces.enregistrer(pdf(), 'Facture.pdf');
    assert.equal(fiche.nom, 'Facture.pdf');
    assert.ok(fs.existsSync(path.join(donnees, 'pieces', `${fiche.id}.pdf`)));
    assert.ok(fs.existsSync(path.join(copies, 'pieces', `${fiche.id}.pdf`)));

    // Le fichier principal disparaît : la copie reprend sa place.
    fs.unlinkSync(path.join(donnees, 'pieces', `${fiche.id}.pdf`));
    const chemin = pieces.chemin(fiche.id);
    assert.equal(chemin, path.join(donnees, 'pieces', `${fiche.id}.pdf`));
    assert.deepEqual(fs.readFileSync(chemin), pdf());
  });

  test('refuse un fichier qui n’est pas un PDF', () => {
    const pieces = creerPieces(donnees, copies);
    assert.throws(() => pieces.enregistrer(Buffer.from('bonjour'), 'x.pdf'), { code: 'PIECE' });
  });

  test('ne rend aucun chemin pour un identifiant douteux', () => {
    const pieces = creerPieces(donnees, copies);
    assert.equal(pieces.chemin('../livre-des-recettes'), null);
    assert.equal(pieces.chemin(crypto.randomUUID()), null);
  });

  test('le ménage n’efface que ce que plus rien ne cite', () => {
    const pieces = creerPieces(donnees, copies);
    const gardee = pieces.enregistrer(pdf('a'), 'a.pdf');
    const orpheline = pieces.enregistrer(pdf('b'), 'b.pdf');
    pieces.nettoyer(new Set([gardee.id]));
    assert.ok(pieces.chemin(gardee.id));
    assert.equal(pieces.chemin(orpheline.id), null);
    assert.equal(fs.existsSync(path.join(copies, 'pieces', `${orpheline.id}.pdf`)), false);
  });

  test('le double perdu d’une pièce est refait', () => {
    const pieces = creerPieces(donnees, copies);
    const fiche = pieces.enregistrer(pdf('d'), 'd.pdf');
    fs.rmSync(path.join(copies, 'pieces', `${fiche.id}.pdf`));
    assert.equal(pieces.redoubler(new Set([fiche.id])), 1);
    assert.ok(fs.existsSync(path.join(copies, 'pieces', `${fiche.id}.pdf`)));
    fs.rmSync(path.join(donnees, 'pieces', `${fiche.id}.pdf`));
    assert.equal(pieces.redoubler(new Set([fiche.id])), 1);
    assert.ok(fs.existsSync(path.join(donnees, 'pieces', `${fiche.id}.pdf`)));
  });
});

describe('pièces citées par le livre et ses sauvegardes', () => {
  test('une pièce citée par une sauvegarde seulement est gardée', () => {
    const donnees = temporaire('citees');
    const copies = temporaire('citees-copies');
    try {
      const stockage = creerStockage(donnees, { dossierSauvegardes: copies });
      const recette = stockage.ajouterRecette({ dateEncaissement: '2026-03-02', client: 'A', montant: 10 });
      const id = crypto.randomUUID();
      stockage.joindrePiece('recettes', recette.id, { id, nom: 'a.pdf', taille: 10 });
      assert.ok(stockage.piecesCitees().has(id));

      // Retirée du livre, la pièce reste citée par la copie de secours tant
      // qu'elle n'a pas été rafraîchie ; une sauvegarde datée la garde aussi.
      stockage.creerSauvegarde('avant-import');
      stockage.retirerPiece('recettes', recette.id);
      assert.ok(stockage.piecesCitees().has(id));
    } finally {
      fs.rmSync(donnees, { recursive: true, force: true });
      fs.rmSync(copies, { recursive: true, force: true });
    }
  });

  test('une sauvegarde illisible fait tout garder', () => {
    const donnees = temporaire('citees-illisible');
    const copies = temporaire('citees-illisible-copies');
    try {
      const stockage = creerStockage(donnees, { dossierSauvegardes: copies });
      stockage.ajouterRecette({ dateEncaissement: '2026-03-02', client: 'A', montant: 10 });
      fs.writeFileSync(path.join(copies, 'livre-des-recettes-2026-01-01.json'), '{ abîmé');
      assert.equal(stockage.piecesCitees(), null);
    } finally {
      fs.rmSync(donnees, { recursive: true, force: true });
      fs.rmSync(copies, { recursive: true, force: true });
    }
  });

  test('un livre disparu ne déclenche aucun ménage au démarrage', () => {
    const donnees = temporaire('citees-disparu');
    const copies = temporaire('citees-disparu-copies');
    try {
      const stockage = creerStockage(donnees, { dossierSauvegardes: copies });
      const recette = stockage.ajouterRecette({ dateEncaissement: '2026-03-02', client: 'A', montant: 10 });
      stockage.creerSauvegarde('avant-import');
      // Jointe après la dernière sauvegarde : seul le livre la cite.
      const piece = creerPieces(donnees, copies).enregistrer(pdf(), 'a.pdf');
      stockage.joindrePiece('recettes', recette.id, piece);
      fs.rmSync(stockage.cheminFichier);
      fs.rmSync(path.join(copies, 'livre-des-recettes-copie-de-secours.json'), { force: true });

      creerApp({ dossierDonnees: donnees, dossierSauvegardes: copies });
      assert.ok(fs.existsSync(path.join(donnees, 'pieces', `${piece.id}.pdf`)));
      assert.ok(fs.existsSync(path.join(copies, 'pieces', `${piece.id}.pdf`)));
    } finally {
      fs.rmSync(donnees, { recursive: true, force: true });
      fs.rmSync(copies, { recursive: true, force: true });
    }
  });
});

describe('archive ZIP', () => {
  test('CRC-32 de référence', () => {
    assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  });

  test('se relit avec ses noms accentués et ses sous-dossiers', async () => {
    const zip = await JSZip.loadAsync(creerZip([
      { nom: 'registre.csv', contenu: 'Date;Montant\r\n' },
      { nom: 'factures/2026-03-02 Époux Lefèvre.pdf', contenu: pdf() }
    ]));
    assert.deepEqual(Object.keys(zip.files).sort(), ['factures/2026-03-02 Époux Lefèvre.pdf', 'registre.csv']);
    assert.equal(await zip.file('registre.csv').async('string'), 'Date;Montant\r\n');
    assert.deepEqual(await zip.file('factures/2026-03-02 Époux Lefèvre.pdf').async('nodebuffer'), pdf());
  });

  test('rend les noms uniques et valides', () => {
    assert.deepEqual(nomsUniques(['a.pdf', 'A.pdf', 'a.pdf', 'b?:.pdf']), ['a.pdf', 'A (2).pdf', 'a (3).pdf', 'b.pdf']);
  });

  test('borne la longueur des noms, extension gardée', () => {
    const [long, double] = nomsUniques([`2026-03-02 ${'Client '.repeat(80)}F1.pdf`, `2026-03-02 ${'Client '.repeat(80)}F2.pdf`]);
    assert.equal(long.length, 150);
    assert.match(long, /^2026-03-02 (Client )+Cl\.pdf$/);
    // Coupés au même endroit, les deux noms se distinguent encore.
    assert.equal(double, long.replace(/\.pdf$/, ' (2).pdf'));
    assert.equal(nomsUniques([`${'é'.repeat(200)}.pdf`])[0], `${'é'.repeat(146)}.pdf`);
  });
});

describe('routes des pièces jointes', () => {
  let dossier;
  let dossierSauvegardes;
  let serveur;
  let base;

  before(async () => {
    dossier = temporaire('api-pieces');
    dossierSauvegardes = temporaire('api-pieces-copies');
    const app = creerApp({ dossierDonnees: dossier, dossierSauvegardes });
    await new Promise((resoudre) => { serveur = app.listen(0, '127.0.0.1', resoudre); });
    base = `http://127.0.0.1:${serveur.address().port}`;
  });

  after(() => {
    serveur.close();
    serveur.closeAllConnections();
    fs.rmSync(dossier, { recursive: true, force: true });
    fs.rmSync(dossierSauvegardes, { recursive: true, force: true });
  });

  const json = (chemin, methode, corps) => fetch(`${base}${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps)
  });
  const envoyer = (chemin, octets, nom = 'Facture été.pdf', type = 'application/pdf') => fetch(`${base}${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': type, 'X-Nom-Fichier': encodeURIComponent(nom) },
    body: octets
  });

  async function nouvelleRecette(numero) {
    const reponse = await json('/api/recettes', 'POST', {
      dateEncaissement: '2026-03-02', client: 'Époux Lefèvre', libelle: 'Cours', numeroFacture: numero, montant: '120', modeReglement: 'virement'
    });
    return (await reponse.json()).recette;
  }

  test('joint, lit puis retire un PDF, et le rattache (annulation)', async () => {
    const recette = await nouvelleRecette('F-1');
    const envoi = await envoyer(`/api/recettes/${recette.id}/piece`, pdf());
    assert.equal(envoi.status, 201);
    const { recette: jointe } = await envoi.json();
    assert.equal(jointe.pieceJointe.nom, 'Facture été.pdf');
    assert.equal(jointe.pieceJointe.taille, pdf().length);

    const lecture = await fetch(`${base}/api/recettes/${recette.id}/piece`);
    assert.equal(lecture.status, 200);
    assert.equal(lecture.headers.get('content-type'), 'application/pdf');
    assert.match(lecture.headers.get('content-disposition'), /filename\*=UTF-8''Facture%20%C3%A9t%C3%A9\.pdf/);
    assert.deepEqual(Buffer.from(await lecture.arrayBuffer()), pdf());

    // Une modification du formulaire ne fait pas perdre la pièce.
    const modif = await json(`/api/recettes/${recette.id}`, 'PUT', {
      dateEncaissement: '2026-03-03', client: 'Époux Lefèvre', libelle: 'Cours', numeroFacture: 'F-1', montant: '130', modeReglement: 'virement'
    });
    assert.equal((await modif.json()).recette.pieceJointe.id, jointe.pieceJointe.id);

    const retrait = await fetch(`${base}/api/recettes/${recette.id}/piece`, { method: 'DELETE' });
    const { recette: sans, piece } = await retrait.json();
    assert.equal(sans.pieceJointe, undefined);
    assert.equal(piece.id, jointe.pieceJointe.id);

    const rattache = await json(`/api/recettes/${recette.id}/piece/rattacher`, 'POST', { piece });
    assert.equal((await rattache.json()).recette.pieceJointe.id, piece.id);
  });

  test('refuse un fichier qui n’est pas un PDF, ou trop lourd', async () => {
    const recette = await nouvelleRecette('F-2');
    const faux = await envoyer(`/api/recettes/${recette.id}/piece`, Buffer.from('pas un pdf'));
    assert.equal(faux.status, 400);

    const lourd = Buffer.concat([pdf(), Buffer.alloc(10 * 1024 * 1024)]);
    const trop = await envoyer(`/api/recettes/${recette.id}/piece`, lourd);
    assert.equal(trop.status, 413);

    const autreType = await envoyer(`/api/recettes/${recette.id}/piece`, pdf(), 'x.pdf', 'image/png');
    assert.equal(autreType.status, 400);
  });

  test('refuse de rattacher une pièce inconnue ou un chemin détourné', async () => {
    const recette = await nouvelleRecette('F-3');
    const inconnue = await json(`/api/recettes/${recette.id}/piece/rattacher`, 'POST', {
      piece: { id: crypto.randomUUID(), nom: 'x.pdf', taille: 3 }
    });
    assert.equal(inconnue.status, 400);
    const detour = await json(`/api/recettes/${recette.id}/piece/rattacher`, 'POST', {
      piece: { id: '../../livre-des-recettes', nom: 'x.pdf', taille: 3 }
    });
    assert.equal(detour.status, 400);
  });

  test('une ligne supprimée puis restaurée retrouve sa pièce', async () => {
    const recette = await nouvelleRecette('F-4');
    await envoyer(`/api/recettes/${recette.id}/piece`, pdf('F-4'));
    const suppression = await json('/api/recettes/lot/supprimer', 'POST', { ids: [recette.id] });
    const { recettes: supprimees } = await suppression.json();
    assert.ok(supprimees[0].pieceJointe);

    const restauration = await json('/api/recettes/lot/restaurer', 'POST', { lignes: supprimees });
    const { recettes: restaurees } = await restauration.json();
    assert.equal(restaurees[0].pieceJointe.id, supprimees[0].pieceJointe.id);
  });

  test('les achats ont aussi leur justificatif', async () => {
    const reponse = await json('/api/achats', 'POST', {
      dateReglement: '2026-03-05', fournisseur: 'Papeterie', libelle: 'Ramettes', referenceFacture: 'P-9', montant: '30', modeReglement: 'carte'
    });
    const { achat } = await reponse.json();
    const envoi = await envoyer(`/api/achats/${achat.id}/piece`, pdf('achat'), 'ticket.pdf');
    assert.equal(envoi.status, 201);
    assert.equal((await envoi.json()).achat.pieceJointe.nom, 'ticket.pdf');
  });

  test('export ZIP : le registre et les factures de la période', async () => {
    const reponse = await fetch(`${base}/api/exports/zip?annee=2026&mois=3&format=csv`);
    assert.equal(reponse.status, 200);
    assert.match(reponse.headers.get('content-disposition'), /-avec-pdf\.zip"$/);
    const zip = await JSZip.loadAsync(Buffer.from(await reponse.arrayBuffer()));
    const noms = Object.keys(zip.files);
    assert.ok(noms.some((n) => n.endsWith('.csv')));
    const factures = noms.filter((n) => n.startsWith('factures/'));
    assert.equal(factures.length, 2); // F-1 et F-4 (F-2 et F-3 sans pièce)
    assert.ok(factures.every((n) => n.endsWith('.pdf')));
    assert.ok(!noms.includes('pieces-introuvables.txt'));
  });

  test('export ZIP : un PDF perdu est signalé, pas bloquant', async () => {
    const recette = await nouvelleRecette('F-5');
    const envoi = await envoyer(`/api/recettes/${recette.id}/piece`, pdf('F-5'));
    const { pieceJointe } = (await envoi.json()).recette;
    fs.unlinkSync(path.join(dossier, 'pieces', `${pieceJointe.id}.pdf`));
    fs.unlinkSync(path.join(dossierSauvegardes, 'pieces', `${pieceJointe.id}.pdf`));

    const reponse = await fetch(`${base}/api/exports/zip?annee=2026&format=pdf`);
    const zip = await JSZip.loadAsync(Buffer.from(await reponse.arrayBuffer()));
    const perdues = await zip.file('pieces-introuvables.txt').async('string');
    assert.match(perdues, /F-5/);
  });

  test('sauvegarde complète : le livre et ses PDF', async () => {
    const reponse = await fetch(`${base}/api/sauvegarde`);
    assert.equal(reponse.status, 200);
    const zip = await JSZip.loadAsync(Buffer.from(await reponse.arrayBuffer()));
    assert.ok(zip.file('LISEZ-MOI.txt'), 'un mot explique comment la reprendre');
    const livre = JSON.parse(await zip.file('livre-des-recettes.json').async('string'));
    const citees = [...livre.recettes, ...livre.achats].filter((l) => l.pieceJointe).map((l) => l.pieceJointe.id);
    const presentes = Object.keys(zip.files).filter((n) => n.startsWith('pieces/'));
    // La pièce perdue (F-5) est citée mais absente : tout le reste est là.
    assert.equal(presentes.length, citees.length - 1);
  });

  test('le système annonce le nombre et le poids des pièces', async () => {
    const { pieces } = await (await fetch(`${base}/api/systeme`)).json();
    assert.equal(pieces.nombre, 4); // F-1, F-4, F-5 (perdue) et l’achat
    assert.ok(pieces.taille > 0);
    assert.equal(pieces.dossier, path.join(dossier, 'pieces'));
  });

  test('les fichiers de l’interface sont revalidés à chaque chargement', async () => {
    const reponse = await fetch(`${base}/`);
    assert.equal(reponse.headers.get('cache-control'), 'no-cache');
  });
});
