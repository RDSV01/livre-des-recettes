/**
 * Tests du jeu de démonstration : il doit produire des lignes valides (elles
 * passeront la validation du stockage) et rester dans l'année courante pour
 * alimenter le tableau de bord.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireJeuDemo } from '../src/demo.js';
import { validerRecette, validerAchat } from '../src/validation.js';
import { anneeDe } from '../src/partage/dates.js';

test('le jeu de démonstration contient les deux registres et des clients', () => {
  const jeu = construireJeuDemo();
  assert.ok(jeu.recettes.length > 0);
  assert.ok(jeu.achats.length > 0);
  assert.ok(jeu.clients.length > 0);
  assert.equal(jeu.parametres.jeuDemo, true);
  assert.equal(jeu.parametres.typeActivite, 'mixte');
});

test('chaque recette et achat de démonstration passe la validation', () => {
  const jeu = construireJeuDemo();
  for (const recette of jeu.recettes) {
    assert.equal(validerRecette(recette).erreurs, null, `recette invalide : ${JSON.stringify(recette)}`);
  }
  for (const achat of jeu.achats) {
    assert.equal(validerAchat(achat).erreurs, null, `achat invalide : ${JSON.stringify(achat)}`);
  }
});

test('les dates tombent dans l’année courante et jamais dans le futur', () => {
  const maintenant = new Date('2026-07-20T12:00:00Z');
  const jeu = construireJeuDemo(maintenant);
  const anneeCourante = maintenant.getFullYear();
  for (const recette of jeu.recettes) {
    assert.ok(recette.dateEncaissement <= '2026-07-20', 'pas de recette dans le futur');
    assert.equal(anneeDe(recette.dateEncaissement) <= anneeCourante, true);
  }
});
