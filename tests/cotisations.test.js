/**
 * Tests de l'estimation des cotisations sociales.
 *
 * Un montant faux ici serait pire que pas de montant du tout : l'utilisateur
 * s'en sert pour mettre de l'argent de côté. D'où l'attention portée aux
 * arrondis, aux activités mixtes, aux encaissements qu'aucun taux ne couvre,
 * et surtout aux changements de taux en cours de période.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cotisationsUrssaf, palierPour } from '../src/cotisations.js';
import { PALIERS_COTISATIONS } from '../src/partage/bareme-seuils.js';

/** Palier le plus récent, et le plus ancien : les tests s'y adossent. */
const RECENT = PALIERS_COTISATIONS.reduce((a, b) => (b.duJour > a.duJour ? b : a));
const ANCIEN = PALIERS_COTISATIONS.reduce((a, b) => (b.duJour < a.duJour ? b : a));

/** Une recette réduite à ce dont le calcul a besoin. */
const recette = (dateEncaissement, montant, categorie = '') => ({
  dateEncaissement, montant, categorie, client: 'Client', modeReglement: 'virement'
});

/** Une date du palier le plus récent. */
const AU_RECENT = RECENT.duJour;

test('chaque activité simple cotise à son propre taux', () => {
  for (const type of ['ventes', 'prestations', 'liberal', 'liberalCipav']) {
    const resultat = cotisationsUrssaf([recette(AU_RECENT, 10_000)], { typeActivite: type });
    assert.equal(resultat.lignes.length, 1, `${type} : une seule base`);
    assert.equal(resultat.lignes[0].taux, RECENT[type], `${type} : le taux du palier`);
    assert.equal(resultat.lignes[0].base, 10_000);
    assert.equal(resultat.total, Math.round(10_000 * RECENT[type] / 100));
  }
});

test('les taux officiels sont bien ceux appliqués, année par année', () => {
  // Valeurs de contrôle relevées sur service-public.gouv.fr et urssaf.fr. Une
  // faute de frappe dans le barème se voit ici, avant d'être affichée à
  // l'utilisateur qui provisionne son argent dessus.
  const sur1000 = (date, type) =>
    cotisationsUrssaf([recette(date, 1000)], { typeActivite: type }).total;

  // 2026 : dernière marche de la hausse des libérales du régime général.
  assert.equal(sur1000('2026-06-15', 'ventes'), 123, 'vente : 12,3 %');
  assert.equal(sur1000('2026-06-15', 'prestations'), 212, 'prestations BIC : 21,2 %');
  assert.equal(sur1000('2026-06-15', 'liberal'), 256, 'BNC régime général : 25,6 %');
  assert.equal(sur1000('2026-06-15', 'liberalCipav'), 232, 'BNC CIPAV : 23,2 %');

  // 2025 : le taux BNC du régime général y était encore d'un point plus bas.
  assert.equal(sur1000('2025-06-15', 'ventes'), 123, 'vente : 12,3 %');
  assert.equal(sur1000('2025-06-15', 'prestations'), 212, 'prestations BIC : 21,2 %');
  assert.equal(sur1000('2025-06-15', 'liberal'), 246, 'BNC régime général : 24,6 %');
  assert.equal(sur1000('2025-06-15', 'liberalCipav'), 232, 'BNC CIPAV : 23,2 %');

  // Avant la réforme du décret 2024-484.
  assert.equal(sur1000('2024-06-30', 'liberal'), 211, 'BNC régime général : 21,1 %');
  assert.equal(sur1000('2024-06-30', 'liberalCipav'), 212, 'BNC CIPAV : 21,2 %');
  assert.equal(sur1000('2023-06-15', 'liberal'), 211, 'inchangé sur toute l’année 2023');
});

test('la marche du 1er juillet 2024 tombe au bon jour', () => {
  // Le décret 2024-484 fait tout basculer d'un jour à l'autre : une erreur de
  // borne se verrait sur les encaissements de fin juin ou de début juillet.
  const taux = (date, type) =>
    cotisationsUrssaf([recette(date, 1000)], { typeActivite: type }).lignes[0].taux;

  assert.equal(taux('2024-06-30', 'liberal'), 21.1, 'la veille : ancien taux');
  assert.equal(taux('2024-07-01', 'liberal'), 23.1, 'le jour même : nouveau taux');
  assert.equal(taux('2024-06-30', 'liberalCipav'), 21.2, 'la veille : ancien taux CIPAV');
  assert.equal(taux('2024-07-01', 'liberalCipav'), 23.2, 'le jour même : nouveau taux CIPAV');
  // Les activités commerciales, elles, n'ont pas bougé ce jour-là.
  assert.equal(taux('2024-06-30', 'ventes'), taux('2024-07-01', 'ventes'));
  assert.equal(taux('2024-06-30', 'prestations'), taux('2024-07-01', 'prestations'));
});

test('une année 2024 déclarée en entier se répartit sur les deux paliers', () => {
  // Cas réel : une déclaration annuelle 2024 enjambe la marche du 1er juillet.
  const resultat = cotisationsUrssaf([
    recette('2024-03-15', 10_000),
    recette('2024-09-15', 10_000)
  ], { typeActivite: 'liberal' });

  assert.equal(resultat.lignes.length, 2, 'une ligne par palier');
  assert.deepEqual(resultat.lignes.map((l) => l.taux), [23.1, 21.1], 'du plus récent au plus ancien');
  assert.equal(resultat.total, 2310 + 2110, 'chaque semestre à son taux');
});

test('la hausse du taux BNC se retrouve d’une année sur l’autre', () => {
  // Le seul taux qui bouge entre 2025 et 2026 : les autres doivent être stables.
  const taux = (date, type) =>
    cotisationsUrssaf([recette(date, 1000)], { typeActivite: type }).lignes[0].taux;
  for (const type of ['ventes', 'prestations', 'liberalCipav']) {
    assert.equal(taux('2025-06-15', type), taux('2026-06-15', type), `${type} : stable`);
  }
  assert.ok(
    taux('2026-06-15', 'liberal') > taux('2025-06-15', 'liberal'),
    'le taux des libérales du régime général a monté'
  );
});

test('une activité mixte calcule chaque part à son taux', () => {
  const resultat = cotisationsUrssaf([
    recette(AU_RECENT, 20_000, 'ventes'),
    recette(AU_RECENT, 10_000, 'prestations')
  ], { typeActivite: 'mixte' });

  assert.equal(resultat.lignes.length, 2);
  const ventes = resultat.lignes.find((l) => l.taux === RECENT.ventes);
  const prestations = resultat.lignes.find((l) => l.taux === RECENT.prestations);
  assert.equal(ventes.base, 20_000);
  assert.equal(ventes.montant, Math.round(20_000 * RECENT.ventes / 100));
  assert.equal(prestations.base, 10_000);
  assert.equal(prestations.montant, Math.round(10_000 * RECENT.prestations / 100));
  assert.equal(resultat.total, ventes.montant + prestations.montant);
});

test('la nature déclarée des prestations change le taux de la part mixte', () => {
  const lignes = (nature) => cotisationsUrssaf(
    [recette(AU_RECENT, 10_000, 'prestations')],
    { typeActivite: 'mixte', naturePrestations: nature }
  ).lignes[0];

  assert.equal(lignes('prestations').taux, RECENT.prestations, 'BIC');
  assert.equal(lignes('liberal').taux, RECENT.liberal, 'BNC');
  assert.equal(lignes('liberalCipav').taux, RECENT.liberalCipav, 'BNC CIPAV');

  // Livre d'avant l'option, ou valeur inconnue : repli sur le cas courant.
  for (const nature of [undefined, '', 'fantaisie']) {
    assert.equal(lignes(nature).taux, RECENT.prestations, `repli pour « ${nature} »`);
  }
});

// ---- Changements de taux en cours de période ---------------------------------

test('palierPour retient le palier en vigueur à la date exacte', () => {
  assert.equal(palierPour(RECENT.duJour), RECENT, 'le premier jour est déjà couvert');
  assert.equal(palierPour('2999-12-31'), RECENT, 'un palier ouvert court sans fin');
  assert.equal(palierPour(ANCIEN.duJour), ANCIEN);

  // La veille du plus ancien palier n'est couverte par rien.
  const veille = new Date(`${ANCIEN.duJour}T00:00:00Z`);
  veille.setUTCDate(veille.getUTCDate() - 1);
  assert.equal(palierPour(veille.toISOString().slice(0, 10)), null);
});

test('les paliers se suivent sans trou ni chevauchement', () => {
  // Un trou laisserait des encaissements sans taux ; un chevauchement rendrait
  // le résultat dépendant de l'ordre de la liste.
  const tries = [...PALIERS_COTISATIONS].sort((a, b) => a.duJour.localeCompare(b.duJour));
  for (let i = 1; i < tries.length; i += 1) {
    const precedent = tries[i - 1];
    assert.notEqual(precedent.auJour, null, `le palier du ${precedent.duJour} doit être borné`);
    const lendemain = new Date(`${precedent.auJour}T00:00:00Z`);
    lendemain.setUTCDate(lendemain.getUTCDate() + 1);
    assert.equal(
      tries[i].duJour, lendemain.toISOString().slice(0, 10),
      `le palier du ${tries[i].duJour} doit commencer au lendemain du précédent`
    );
  }
  assert.equal(tries.at(-1).auJour, null, 'le dernier palier reste ouvert');
});

test('une période à cheval sur deux paliers produit une ligne par palier', () => {
  if (PALIERS_COTISATIONS.length < 2) return; // un seul palier : rien à répartir

  const resultat = cotisationsUrssaf([
    recette(ANCIEN.duJour, 5000),
    recette(RECENT.duJour, 3000)
  ], { typeActivite: 'prestations' });

  assert.equal(resultat.lignes.length, 2, 'chaque palier a sa ligne');
  assert.deepEqual(
    resultat.lignes.map((l) => l.duJour),
    [RECENT.duJour, ANCIEN.duJour],
    'du palier le plus récent au plus ancien'
  );
  assert.equal(resultat.lignes[0].base, 3000);
  assert.equal(resultat.lignes[1].base, 5000);
  assert.equal(
    resultat.total,
    Math.round(3000 * RECENT.prestations / 100) + Math.round(5000 * ANCIEN.prestations / 100),
    'chaque part est calculée à son propre taux, puis additionnée'
  );
});

test('un encaissement antérieur à tout palier connu sort de l’estimation', () => {
  const veille = new Date(`${ANCIEN.duJour}T00:00:00Z`);
  veille.setUTCDate(veille.getUTCDate() - 1);
  const resultat = cotisationsUrssaf([
    recette(veille.toISOString().slice(0, 10), 4000),
    recette(AU_RECENT, 1000)
  ], { typeActivite: 'prestations' });

  assert.equal(resultat.horsEstimation, 4000, 'il est signalé, pas deviné');
  assert.equal(resultat.total, Math.round(1000 * RECENT.prestations / 100), 'et n’entre dans aucun calcul');
});

test('le chiffre d’affaires non ventilé d’une activité mixte sort de l’estimation', () => {
  const resultat = cotisationsUrssaf([
    recette(AU_RECENT, 10_000, 'ventes'),
    recette(AU_RECENT, 5000) // sans catégorie
  ], { typeActivite: 'mixte' });

  assert.equal(resultat.horsEstimation, 5000);
  assert.equal(resultat.total, Math.round(10_000 * RECENT.ventes / 100));
});

// ---- Arrondis ------------------------------------------------------------------

test('les cotisations sont arrondies à l’euro le plus proche', () => {
  // 21,2 % de 1 234,56 € = 261,72672 € : dû pour 262 €, jamais 261,73 €.
  const resultat = cotisationsUrssaf([recette(AU_RECENT, 1234.56)], { typeActivite: 'prestations' });
  assert.equal(resultat.total, 262);

  // Le demi-euro monte : 12,3 % de 2 565,04 € donne 315,49992 €, de 2 565,10 € 315,5073 €.
  const enVente = (montant) =>
    cotisationsUrssaf([recette(AU_RECENT, montant)], { typeActivite: 'ventes' }).total;
  assert.equal(enVente(2565.04), 315);
  assert.equal(enVente(2565.10), 316);
});

test('aucun montant de cotisation ne traîne de centimes', () => {
  const jeux = [
    [[recette(AU_RECENT, 1234.56)], 'prestations'],
    [[recette(AU_RECENT, 9876.54)], 'liberal'],
    [[recette(AU_RECENT, 4321.99)], 'liberalCipav'],
    [[recette(AU_RECENT, 20_000.33, 'ventes'), recette(AU_RECENT, 10_000.22, 'prestations')], 'mixte']
  ];
  for (const [recettes, typeActivite] of jeux) {
    const resultat = cotisationsUrssaf(recettes, { typeActivite });
    assert.ok(Number.isInteger(resultat.total), `${typeActivite} : total entier`);
    for (const l of resultat.lignes) {
      assert.ok(Number.isInteger(l.montant), `${typeActivite} : ligne « ${l.libelle} » entière`);
    }
    // Le détail affiché doit additionner exactement le total annoncé.
    assert.equal(resultat.lignes.reduce((acc, l) => acc + l.montant, 0), resultat.total);
  }
});

test('un chiffre d’affaires nul ou absent ne coûte rien', () => {
  assert.equal(cotisationsUrssaf([recette(AU_RECENT, 0)], { typeActivite: 'liberal' }).total, 0);
  const vide = cotisationsUrssaf([], { typeActivite: 'liberal' });
  assert.equal(vide.total, 0);
  assert.deepEqual(vide.lignes, []);
  assert.equal(vide.horsEstimation, 0);
});

test('sans activité renseignée, aucune estimation', () => {
  assert.equal(cotisationsUrssaf([recette(AU_RECENT, 10_000)], { typeActivite: '' }), null);
  assert.equal(cotisationsUrssaf([recette(AU_RECENT, 10_000)], { typeActivite: 'inconnu' }), null);
  assert.equal(cotisationsUrssaf([recette(AU_RECENT, 10_000)], {}), null);
});

test('chaque palier porte un taux pour chaque activité', () => {
  for (const palier of PALIERS_COTISATIONS) {
    assert.match(palier.duJour, /^\d{4}-\d{2}-\d{2}$/, 'une date ISO complète');
    assert.ok(palier.auJour === null || /^\d{4}-\d{2}-\d{2}$/.test(palier.auJour));
    for (const activite of ['ventes', 'prestations', 'liberal', 'liberalCipav']) {
      const taux = palier[activite];
      assert.ok(taux > 0 && taux < 100, `${palier.duJour} / ${activite} : un pourcentage`);
    }
  }
});
