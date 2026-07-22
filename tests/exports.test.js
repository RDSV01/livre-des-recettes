/**
 * Tests des générateurs d'export.
 *
 * Les polices standard du PDF utilisent l'encodage WinAnsi : les espaces
 * insécables produits par le formatage des montants doivent en être retirés
 * avant écriture, faute de quoi « 1 500,00 € » s'imprime « 1/500,00 € ».
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { texteSur } from '../src/exports/pdf-commun.js';
import { genererCsv } from '../src/exports/csv.js';
import { formaterMontant } from '../src/partage/montants.js';

test('un montant à quatre chiffres s’imprime avec une espace ordinaire', () => {
  const montant = formaterMontant(1500, 'EUR');
  // Le formatage français sépare bien les milliers par une espace insécable.
  assert.match(montant, /[\u202F\u00A0]/, 'le montant contient un espace insécable');

  assert.equal(texteSur(montant), '1 500,00 €');
});

test('tous les espaces inconnus de WinAnsi sont remplacés', () => {
  const avec = `1\u202F500\u00A0€ x\u2009y\u2007z`;
  assert.equal(texteSur(avec), '1 500 € x y z');
  assert.doesNotMatch(texteSur(avec), /[\u202F\u00A0\u2009\u2007]/);
});

test('le CSV neutralise les formules héritées d’un tableur', () => {
  // Une migration depuis Excel peut apporter un libellé commençant par « = » :
  // sans précaution, le tableur l'exécuterait à la réouverture de l'export.
  const registre = {
    colonnes: [
      { titre: 'Client', valeur: (r) => r.client },
      { titre: 'Libellé', valeur: (r) => r.libelle },
      { titre: 'Montant', montant: true }
    ],
    lignes: [
      { type: 'element', element: { client: '=1+1', libelle: '@SUM(A1:A9)', montant: 100 } },
      { type: 'element', element: { client: 'Client normal', libelle: 'Prestation ; suite', montant: 50 } },
      { type: 'total', libelle: 'Total année 2026', montant: 150 }
    ]
  };

  const lignes = genererCsv(registre, {}).split('\r\n');

  assert.ok(lignes[1].startsWith(' =1+1;'), 'la formule est désamorcée par une espace en tête');
  assert.ok(lignes[1].includes(' @SUM(A1:A9)'));
  assert.ok(!lignes[1].includes(';=1+1'), 'aucune cellule ne commence par un signe égal');
  // Ce que le tableur ajoute doit repartir tout seul à la réimportation.
  assert.equal(' =1+1'.trim(), '=1+1', 'la valeur d’origine se retrouve par un simple trim');
  // Le reste de l'échappement continue de fonctionner.
  assert.ok(lignes[2].startsWith('Client normal;'), 'un texte ordinaire n’est pas touché');
  assert.ok(lignes[2].includes('"Prestation ; suite"'), 'le point-virgule protège toujours par des guillemets');
  assert.ok(lignes[3].startsWith('Total année 2026;'), 'les lignes de total restent lisibles');
});

test('texteSur accepte les valeurs absentes', () => {
  assert.equal(texteSur(null), '');
  assert.equal(texteSur(undefined), '');
});
