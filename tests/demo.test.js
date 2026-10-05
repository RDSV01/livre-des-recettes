/**
 * Tests du jeu de démonstration : des lignes valides (elles passeront la
 * validation du stockage), jamais dans le futur, et de quoi faire travailler
 * chaque écran quel que soit le jour où on le charge : l'année d'avant pour
 * comparer, une recette à renouveler, un numéro de facture manquant, des PDF
 * joints, une déclaration à faire mais jamais en retard.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireJeuDemo, piecesDemo } from '../src/demo.js';
import { validerRecette, validerAchat } from '../src/validation.js';
import { MODES_REGLEMENT } from '../src/partage/constantes.js';
import { recettesARenouveler } from '../src/partage/recurrences.js';
import { analyserNumerotation } from '../src/partage/factures.js';
import { periodeATraiter } from '../src/partage/declarations.js';
import { estPdf } from '../src/pieces.js';

/** Des jours qui piègent : premier et dernier de l'année, fin de mois, échéances. */
const JOURS = ['2026-01-01', '2026-01-31', '2026-02-15', '2026-03-03', '2026-04-30', '2026-05-01',
  '2026-07-20', '2026-10-02', '2026-11-30', '2026-12-31'];
const date = (iso) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), 12);

test('le jeu de démonstration contient les deux registres et des clients', () => {
  const jeu = construireJeuDemo();
  assert.ok(jeu.recettes.length > 0);
  assert.ok(jeu.achats.length > 0);
  assert.ok(jeu.clients.length > 0);
  assert.equal(jeu.parametres.jeuDemo, true);
  assert.equal(jeu.parametres.typeActivite, 'mixte');
});

for (const jour of JOURS) {
  test(`démonstration chargée le ${jour} : tout l'écran a de quoi s'afficher`, () => {
    const jeu = construireJeuDemo(date(jour));
    const annee = Number(jour.slice(0, 4));
    const mois = Number(jour.slice(5, 7));
    const { modesPersonnalises } = jeu.parametres;

    for (const recette of jeu.recettes) {
      assert.equal(validerRecette(recette, modesPersonnalises).erreurs, null, `recette invalide : ${JSON.stringify(recette)}`);
      assert.ok(recette.dateEncaissement <= jour, `recette dans le futur : ${recette.dateEncaissement}`);
      assert.ok(recette.dateEncaissement >= `${annee - 1}-01-01`);
    }
    for (const achat of jeu.achats) {
      assert.equal(validerAchat(achat, modesPersonnalises).erreurs, null, `achat invalide : ${JSON.stringify(achat)}`);
      assert.ok(achat.dateReglement <= jour, `achat dans le futur : ${achat.dateReglement}`);
    }

    // Chaque mois de l'année d'avant, et chaque mois écoulé de l'année, a ses encaissements.
    const moisVus = new Set(jeu.recettes.map((r) => r.dateEncaissement.slice(0, 7)));
    for (let m = 1; m <= 12; m += 1) assert.ok(moisVus.has(`${annee - 1}-${String(m).padStart(2, '0')}`), `mois ${m} de l'année d'avant`);
    for (let m = 1; m <= mois; m += 1) assert.ok(moisVus.has(`${annee}-${String(m).padStart(2, '0')}`), `mois ${m} de l'année`);

    // Le tableau de bord propose la maintenance du mois.
    const aRenouveler = recettesARenouveler(jeu.recettes, { aujourdhui: jour });
    assert.equal(aRenouveler.length, 1);
    assert.equal(aRenouveler[0].derniere.libelle, 'Maintenance mensuelle');

    // Un seul numéro manquant, aucun doublon.
    const { doublons, manquants } = analyserNumerotation(jeu.recettes);
    assert.equal(doublons.length, 0);
    assert.equal(manquants.flatMap((s) => s.numeros).length, 1, JSON.stringify(manquants));

    // Une déclaration à faire ou la période en cours, jamais un retard.
    assert.ok(['a-declarer', 'en-cours'].includes(periodeATraiter(jeu.parametres, jour).etat));

    // Les PDF vont à des lignes facturées ; il reste des factures sans PDF.
    const { recettes: aJoindre, achats: achatsAJoindre } = jeu.aJoindre;
    assert.ok(aJoindre.length > 0 && achatsAJoindre.length > 0);
    assert.ok(aJoindre.every((i) => jeu.recettes[i]?.numeroFacture));
    assert.ok(achatsAJoindre.every((i) => jeu.achats[i]?.referenceFacture));
    assert.ok(jeu.recettes.some((r, i) => r.numeroFacture && !aJoindre.includes(i)), 'une facture récente sans PDF');

    // Le carnet connaît chaque client, et aucun marqueur interne ne traîne sur les lignes.
    const noms = new Set(jeu.clients.map((c) => c.nom));
    assert.ok(jeu.recettes.every((r) => noms.has(r.client)));
    assert.ok(jeu.recettes.every((r) => !('facturee' in r) && !('avecPiece' in r)));
  });
}

test('le jeu emploie chaque mode de règlement, dont un personnalisé, et les deux catégories', () => {
  const jeu = construireJeuDemo(date('2026-10-02'));
  const modes = new Set(jeu.recettes.map((r) => r.modeReglement));
  for (const { code } of MODES_REGLEMENT.filter((m) => m.code !== 'autre')) assert.ok(modes.has(code), code);
  assert.ok(modes.has(jeu.parametres.modesPersonnalises[0].code));
  assert.deepEqual(new Set(jeu.recettes.map((r) => r.categorie)), new Set(['ventes', 'prestations']));
});

test('piecesDemo crée un vrai PDF par ligne désignée et pose sa fiche', async () => {
  const jeu = construireJeuDemo(date('2026-10-02'));
  const ranges = [];
  await piecesDemo(jeu, (octets, nom) => {
    assert.ok(estPdf(octets));
    ranges.push(nom);
    return { id: `id-${ranges.length}`, nom, taille: octets.length };
  });
  assert.equal(ranges.length, jeu.aJoindre.recettes.length + jeu.aJoindre.achats.length);
  for (const i of jeu.aJoindre.recettes) assert.match(jeu.recettes[i].pieceJointe.nom, /^Facture F\d{4}-\d{3}\.pdf$/);
  assert.ok(jeu.recettes.some((r) => !r.pieceJointe));
});
