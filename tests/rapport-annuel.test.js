/**
 * Tests du rapport annuel de gestion : agrégats, classements et rendu PDF.
 *
 * Le rapport n'a aucune valeur légale, mais ses chiffres doivent tomber juste :
 * c'est sur eux que le dirigeant lit son année.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { inflateSync } from 'node:zlib';
import { rapportAnnuel } from '../src/rapport-annuel.js';
import { genererRapportPdf } from '../src/exports/rapport-pdf.js';

/** Fabrique de recettes, pour ne garder dans les tests que ce qui compte. */
function recette(date, montant, extra = {}) {
  return {
    dateEncaissement: date,
    client: 'Client test',
    libelle: 'Prestation',
    numeroFacture: '',
    montant,
    modeReglement: 'virement',
    creeLe: '2026-01-01T00:00:00.000Z',
    ...extra
  };
}

const PARAMETRES = {
  nomEntreprise: 'Atelier Test', devise: 'EUR', formatDate: 'JJ/MM/AAAA',
  typeActivite: 'mixte', modesPersonnalises: []
};

// Montants choisis pour que rien ne soit à égalité : un classement départagé
// par hasard ne prouverait pas qu'il trie.
const RECETTES = [
  recette('2026-01-10', 100, { client: 'Alpha', categorie: 'ventes', modeReglement: 'carte' }),
  recette('2026-01-20', 250, { client: 'Bêta', categorie: 'prestations' }),
  recette('2026-03-05', 200, { client: 'Alpha', categorie: 'prestations', modeReglement: 'carte' }),
  recette('2026-11-02', 450, { client: 'Gamma' }),
  recette('2025-06-01', 500, { client: 'Alpha' })
];

const ACHATS = [
  { dateReglement: '2026-02-01', fournisseur: 'Papeterie', referenceFacture: 'A-1', montant: 150, modeReglement: 'carte', creeLe: '2026-01-01T00:00:00.000Z' },
  { dateReglement: '2026-05-01', fournisseur: 'Papeterie', referenceFacture: 'A-2', montant: 50, modeReglement: 'carte', creeLe: '2026-01-01T00:00:00.000Z' }
];

test('la synthèse cumule le chiffre d’affaires, le panier moyen et les achats', () => {
  const rapport = rapportAnnuel({ recettes: RECETTES, achats: ACHATS, parametres: PARAMETRES }, 2026);
  const { synthese } = rapport;

  assert.equal(synthese.chiffreAffaires, 1000, 'les 4 recettes de 2026, sans celle de 2025');
  assert.equal(synthese.nombreEncaissements, 4);
  assert.equal(synthese.panierMoyen, 250);
  assert.equal(synthese.achats.montant, 200);
  assert.equal(synthese.achats.nombre, 2);
  assert.equal(synthese.resultatBrut, 800, 'recettes moins achats');
  assert.equal(synthese.premierEncaissement, '2026-01-10');
  assert.equal(synthese.dernierEncaissement, '2026-11-02');
});

test('la ventilation par catégorie couvre aussi les recettes non classées', () => {
  const { synthese } = rapportAnnuel({ recettes: RECETTES, achats: [], parametres: PARAMETRES }, 2026);

  assert.deepEqual(synthese.ventes, { montant: 100, nombre: 1, part: 10 });
  assert.deepEqual(synthese.prestations, { montant: 450, nombre: 2, part: 45 });
  assert.deepEqual(synthese.nonCategorise, { montant: 450, nombre: 1, part: 45 });
});

test('les douze mois sont présents, les mois creux à zéro', () => {
  const { mensuel, synthese } = rapportAnnuel({ recettes: RECETTES, achats: ACHATS, parametres: PARAMETRES }, 2026);

  assert.equal(mensuel.length, 12);
  assert.equal(mensuel[0].montant, 350, 'janvier : 100 + 250');
  assert.equal(mensuel[0].nombre, 2);
  assert.equal(mensuel[1].montant, 0, 'février sans recette');
  assert.equal(mensuel[1].achats, 150, 'mais un achat');
  assert.equal(synthese.meilleurMois.nom, 'novembre', 'le mois à 450');
});

test('le classement des clients trie par montant et calcule les parts', () => {
  const { clients } = rapportAnnuel({ recettes: RECETTES, achats: [], parametres: PARAMETRES }, 2026);

  assert.equal(clients.nombre, 3, 'Alpha, Bêta et Gamma en 2026');
  assert.equal(clients.classement[0].nom, 'Gamma');
  assert.equal(clients.classement[0].montant, 450);
  assert.equal(clients.classement[0].part, 45);
  assert.equal(clients.classement[1].nombre, 2, 'Alpha a réglé deux fois');
  assert.deepEqual(
    clients.classement.map((c) => c.nom),
    ['Gamma', 'Alpha', 'Bêta'],
    'du plus gros au plus petit'
  );
});

test('un même client écrit différemment ne compte qu’une fois', () => {
  const recettes = [
    recette('2026-01-01', 100, { client: 'Studio Été' }),
    recette('2026-02-01', 100, { client: 'studio ete' }),
    recette('2026-03-01', 100, { client: '  STUDIO ÉTÉ  ' })
  ];
  const { clients } = rapportAnnuel({ recettes, achats: [], parametres: PARAMETRES }, 2026);

  assert.equal(clients.nombre, 1);
  assert.equal(clients.classement.length, 1);
  assert.equal(clients.classement[0].nombre, 3);
  assert.equal(clients.classement[0].montant, 300);
  assert.equal(clients.classement[0].nom, 'Studio Été', 'le premier nom saisi fait foi');
});

test('la répartition par mode de règlement suit les montants', () => {
  const { modesReglement } = rapportAnnuel({ recettes: RECETTES, achats: [], parametres: PARAMETRES }, 2026);

  assert.equal(modesReglement[0].code, 'virement');
  assert.equal(modesReglement[0].libelle, 'Virement');
  assert.equal(modesReglement[0].montant, 700);
  assert.equal(modesReglement[0].part, 70);
  assert.equal(modesReglement[1].code, 'carte');
  assert.equal(modesReglement[1].montant, 300);
});

test('un mode de règlement personnalisé garde son libellé', () => {
  const parametres = { ...PARAMETRES, modesPersonnalises: [{ code: 'lydia', libelle: 'Lydia' }] };
  const recettes = [recette('2026-01-01', 50, { modeReglement: 'lydia' })];
  const { modesReglement } = rapportAnnuel({ recettes, achats: [], parametres }, 2026);

  assert.equal(modesReglement[0].libelle, 'Lydia');
});

test('l’évolution se mesure sur l’année précédente, et vaut null sans passé', () => {
  const avec = rapportAnnuel({ recettes: RECETTES, achats: [], parametres: PARAMETRES }, 2026);
  assert.equal(avec.comparaison.annee, 2025);
  assert.equal(avec.comparaison.chiffreAffaires, 500);
  assert.equal(avec.comparaison.evolution, 100, 'de 500 à 1000 : +100 %');

  const sans = rapportAnnuel({ recettes: RECETTES, achats: [], parametres: PARAMETRES }, 2025);
  assert.equal(sans.comparaison.evolution, null, 'rien en 2024 : pas de pourcentage');
});

test('une année vide ne divise par zéro nulle part', () => {
  const rapport = rapportAnnuel({ recettes: [], achats: [], parametres: PARAMETRES }, 2026);

  assert.equal(rapport.synthese.chiffreAffaires, 0);
  assert.equal(rapport.synthese.panierMoyen, 0);
  assert.equal(rapport.synthese.meilleurMois, null);
  assert.equal(rapport.synthese.premierEncaissement, null);
  assert.equal(rapport.clients.nombre, 0);
  assert.deepEqual(rapport.modesReglement, []);
  assert.equal(rapport.mensuel.length, 12);
});

test('le détail reprend toutes les recettes de l’année, en ordre chronologique', () => {
  const { detail } = rapportAnnuel({ recettes: RECETTES, achats: [], parametres: PARAMETRES }, 2026);

  assert.equal(detail.length, 4);
  assert.deepEqual(
    detail.map((r) => r.dateEncaissement),
    ['2026-01-10', '2026-01-20', '2026-03-05', '2026-11-02']
  );
});

/**
 * Rend le rapport en PDF et en extrait le texte. PDFKit compresse ses flux et
 * écrit les chaînes en hexadécimal : il faut défaire les deux pour relire ce
 * qui est réellement imprimé.
 */
async function texteDuRapport(recettes, typeActivite) {
  const parametres = { ...PARAMETRES, typeActivite };
  const rapport = rapportAnnuel({ recettes, achats: [], parametres }, 2026);

  const morceaux = [];
  const flux = new PassThrough();
  flux.on('data', (m) => morceaux.push(m));
  const fini = new Promise((suite) => flux.on('end', suite));
  genererRapportPdf(rapport, parametres, flux);
  await fini;

  const source = Buffer.concat(morceaux).toString('latin1');
  let brut = '';
  const flux2 = /stream\r?\n/g;
  let trouve;
  while ((trouve = flux2.exec(source)) !== null) {
    const debut = trouve.index + trouve[0].length;
    const fin = source.indexOf('endstream', debut);
    if (fin === -1) continue;
    try {
      brut += inflateSync(Buffer.from(source.slice(debut, fin), 'latin1')).toString('latin1');
    } catch { /* flux binaire, sans texte */ }
  }
  return (brut.match(/<[0-9a-fA-F]+>/g) ?? [])
    .map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1'))
    .join('');
}

test('le rapport tait les natures d’activité qui ne concernent pas l’entreprise', async () => {
  const prestations = [
    recette('2026-03-05', 1000, { categorie: 'prestations' }),
    recette('2026-04-05', 2000, { categorie: 'prestations' })
  ];
  const texte = await texteDuRapport(prestations, 'prestations');
  assert.ok(!texte.includes('Vente de marchandises'), 'aucune ligne de vente pour une pure prestation');

  const ventes = [
    recette('2026-03-05', 1000, { categorie: 'ventes' }),
    recette('2026-04-05', 2000, { categorie: 'ventes' })
  ];
  assert.ok(
    !(await texteDuRapport(ventes, 'ventes')).includes('Prestation de services'),
    'et réciproquement pour une activité de vente'
  );

  // Rien de catégorisé : la répartition n'aurait qu'une ligne, elle disparaît.
  const sansCategorie = [recette('2026-03-05', 1000), recette('2026-04-05', 2000)];
  const nu = await texteDuRapport(sansCategorie, 'liberal');
  assert.ok(!nu.includes('Répartition par activité'), 'pas de section sans rien à répartir');
});

test('les classements impriment bien leurs libellés', async () => {
  // Les entrées classées ne portent pas leur libellé sous la même clé : un
  // client a un `nom`, un mode de règlement un `libelle`. Le tableau doit lire
  // la bonne, sans quoi la colonne sort vide.
  const recettes = [
    recette('2026-03-05', 1000, { client: 'Studio Belleville', modeReglement: 'virement' }),
    recette('2026-04-05', 500, { client: 'Mairie de Rouen', modeReglement: 'cheque' })
  ];
  const texte = await texteDuRapport(recettes, 'prestations');

  // Les libellés se retrouvent aussi dans le détail des encaissements :
  // chercher dans tout le document ne prouverait rien. On isole donc la
  // section, de son titre à celui de la suivante.
  const entre = (debut, fin) => texte.slice(texte.indexOf(debut), texte.indexOf(fin));
  const moyensDePaiement = entre('Moyens de paiement', 'Clients');
  const clients = entre('Clients', 'Détail des encaissements');

  assert.ok(moyensDePaiement.includes('Virement'), 'le mode de règlement est nommé');
  assert.ok(moyensDePaiement.includes('Chèque'), 'les autres modes aussi');
  assert.ok(clients.includes('Studio Belleville'), 'le client est nommé');
  assert.ok(clients.includes('Mairie de Rouen'));
});

test('une activité mixte garde les deux natures, même l’une à zéro', async () => {
  // Une seule part remplie : la voir à zéro renseigne autant que l'autre.
  const texte = await texteDuRapport([recette('2026-03-05', 1000, { categorie: 'prestations' })], 'mixte');

  assert.ok(texte.includes('Répartition par activité'));
  assert.ok(texte.includes('Vente de marchandises'), 'la part vente reste affichée');
  assert.ok(texte.includes('Prestation de services'));
});

test('le rapport se rend en PDF, même pour une année vide', async () => {
  for (const recettes of [RECETTES, []]) {
    const rapport = rapportAnnuel({ recettes, achats: ACHATS, parametres: PARAMETRES }, 2026);
    const morceaux = [];
    const flux = new PassThrough();
    flux.on('data', (m) => morceaux.push(m));
    const fini = new Promise((suite) => flux.on('end', suite));

    genererRapportPdf(rapport, PARAMETRES, flux);
    await fini;

    const pdf = Buffer.concat(morceaux);
    assert.ok(pdf.length > 1000, 'un PDF non vide');
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', 'un en-tête de PDF');
  }
});
