/**
 * Tests de l'ACRE : période, part du taux normal, arrondi et plancher.
 *
 * Valeurs de contrôle relevées en septembre 2026 sur le code de la sécurité
 * sociale (articles D131-6-3, décret 2026-69), service-public.gouv.fr (fiche
 * F11677) et les règles du simulateur de l'URSSAF.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finAcre, fractionAcre, periodeAcre, sousAcre, tauxAcre } from '../src/partage/acre.js';
import { cotisationsUrssaf } from '../src/cotisations.js';
import { validerParametres } from '../src/validation.js';
import { PARAMETRES_DEFAUT } from '../src/partage/constantes.js';

test('l’ACRE court jusqu’à la fin du 3e trimestre civil qui suit le début d’activité', () => {
  assert.equal(finAcre('2026-09-03'), '2027-06-30', 'exemple de service-public.gouv.fr');
  assert.equal(finAcre('2026-01-01'), '2026-12-31', 'début de trimestre : douze mois pleins');
  assert.equal(finAcre('2026-03-31'), '2026-12-31', 'fin de trimestre : à peine neuf mois');
  assert.equal(finAcre('2026-12-15'), '2027-09-30');
  assert.equal(finAcre('2025-05-20'), '2026-03-31', 'le 31 mars, pas le 30');
});

test('la part du taux normal dépend de la date de création', () => {
  assert.equal(fractionAcre('2026-06-30'), 50, 'créée avant le 1er juillet 2026 : moitié du taux');
  assert.equal(fractionAcre('2026-07-01'), 75, 'à partir du 1er juillet 2026 : trois quarts');
  assert.equal(fractionAcre('2023-04-12'), 50);
  assert.equal(fractionAcre('2019-12-31'), null, 'avant 2020, d’autres règles');
});

test('le taux réduit est arrondi au dixième de point supérieur, sans passer sous le plancher', () => {
  // Création avant le 1er juillet 2026 : la moitié du taux.
  assert.equal(tauxAcre(12.3, 50), 6.2, 'vente : 6,15 % monte à 6,2 %');
  assert.equal(tauxAcre(21.2, 50), 10.6, 'prestations BIC');
  assert.equal(tauxAcre(25.6, 50), 12.8, 'BNC 2026');
  assert.equal(tauxAcre(24.6, 50), 12.3, 'BNC 2025');
  assert.equal(tauxAcre(23.1, 50), 11.6, 'BNC fin 2024 : 11,55 % monte à 11,6 %');
  assert.equal(tauxAcre(21.1, 50), 10.6, 'BNC 2023');
  // Création à partir du 1er juillet 2026 : les trois quarts.
  assert.equal(tauxAcre(12.3, 75), 9.3, 'vente : 9,225 % monte à 9,3 %, pas 9,2 %');
  assert.equal(tauxAcre(21.2, 75), 15.9, 'prestations BIC');
  assert.equal(tauxAcre(25.6, 75), 19.2, 'BNC');
  // CIPAV : l'ACRE n'y exonère ni la CSG-CRDS ni la retraite complémentaire.
  assert.equal(tauxAcre(23.2, 50, 13.4), 13.4, 'la moitié (11,6 %) passerait sous le plancher de 2026');
  assert.equal(tauxAcre(23.2, 50, 13.9), 13.9, 'plancher de fin 2024 et 2025');
  assert.equal(tauxAcre(21.2, 50, 12.1), 12.1, 'plancher de 2023');
  assert.equal(tauxAcre(23.2, 75, 13.4), 17.4, 'les trois quarts restent au-dessus du plancher');
});

test('sans l’option ou sans date, pas d’ACRE', () => {
  assert.equal(periodeAcre({ acre: false, debutActivite: '2026-03-10' }), null);
  assert.equal(periodeAcre({ acre: true, debutActivite: '' }), null);
  assert.equal(periodeAcre({ acre: true, debutActivite: '2019-06-01' }), null);
  const periode = periodeAcre({ acre: true, debutActivite: '2026-03-10' });
  assert.deepEqual(periode, { debut: '2026-03-10', fin: '2026-12-31', fraction: 50 });
  assert.equal(sousAcre('2026-03-09', periode), false, 'la veille du début');
  assert.equal(sousAcre('2026-03-10', periode), true);
  assert.equal(sousAcre('2026-12-31', periode), true, 'le dernier jour');
  assert.equal(sousAcre('2027-01-01', periode), false, 'le lendemain de la fin');
  assert.equal(PARAMETRES_DEFAUT.acre, false, 'un livre existant ne bénéficie de rien par défaut');
});

// ---- Dans l'estimation ----------------------------------------------------------

const recette = (dateEncaissement, montant, categorie = '') => ({
  dateEncaissement, montant, categorie, client: 'Client', modeReglement: 'virement'
});
const LIBERAL_ACRE = { typeActivite: 'liberal', acre: true, debutActivite: '2026-03-10' };

test('pendant l’ACRE, seules les cotisations sociales baissent', () => {
  const c = cotisationsUrssaf([recette('2026-05-15', 1000)], { ...LIBERAL_ACRE, versementLiberatoire: true });
  assert.equal(c.lignes[0].taux, 12.8);
  assert.equal(c.lignes[0].acre, true);
  assert.match(c.lignes[0].libelle, /taux ACRE/);
  assert.equal(c.total, 128, 'la moitié des 256 € du taux normal');
  assert.equal(c.formationPro.total, 2, 'formation professionnelle en entier : 0,2 %');
  assert.equal(c.versementLiberatoire.total, 22, 'versement libératoire en entier : 2,2 %');
});

test('une année à cheval sur la fin de l’ACRE se calcule en deux parts', () => {
  const c = cotisationsUrssaf([
    recette('2026-11-15', 1000),
    recette('2027-01-15', 1000)
  ], { ...LIBERAL_ACRE, versementLiberatoire: true });
  assert.deepEqual(c.lignes.map((l) => [l.taux, l.acre]).sort(), [[12.8, true], [25.6, false]]);
  assert.equal(c.total, 128 + 256);
  // Formation et versement libératoire : une seule base, ACRE ou non.
  assert.equal(c.formationPro.lignes.length, 1);
  assert.equal(c.formationPro.lignes[0].base, 2000);
  assert.equal(c.versementLiberatoire.lignes.length, 1);
});

test('un encaissement avant le début d’activité cotise au taux normal', () => {
  const c = cotisationsUrssaf([recette('2026-03-01', 1000)], LIBERAL_ACRE);
  assert.equal(c.lignes[0].taux, 25.6);
  assert.equal(c.lignes[0].acre, false);
});

test('les trois quarts pour une création à partir du 1er juillet 2026', () => {
  const c = cotisationsUrssaf([recette('2026-10-01', 1000)], {
    typeActivite: 'ventes', acre: true, debutActivite: '2026-09-03'
  });
  assert.equal(c.lignes[0].taux, 9.3);
  assert.equal(c.total, 93);
});

test('CIPAV : le taux réduit tient son plancher', () => {
  const c = cotisationsUrssaf([recette('2026-04-01', 1000)], {
    typeActivite: 'liberalCipav', acre: true, debutActivite: '2026-02-01'
  });
  assert.equal(c.lignes[0].taux, 13.4);
  assert.equal(c.total, 134);
});

test('activité mixte : chaque part à son taux réduit', () => {
  const c = cotisationsUrssaf([
    recette('2026-05-15', 1000, 'ventes'),
    recette('2026-05-20', 1000, 'prestations')
  ], { typeActivite: 'mixte', naturePrestations: 'liberal', acre: true, debutActivite: '2026-03-10' });
  assert.deepEqual(c.lignes.map((l) => l.taux).sort((a, b) => a - b), [6.2, 12.8]);
  assert.equal(c.total, 62 + 128);
});

test('les paramètres acceptent l’ACRE, et refusent une date illisible', () => {
  const valides = validerParametres({ ...PARAMETRES_DEFAUT, typeActivite: 'liberal', acre: true, debutActivite: '2026-03-10' });
  assert.equal(valides.erreurs, null);
  assert.equal(valides.valeurs.acre, true);
  assert.equal(valides.valeurs.debutActivite, '2026-03-10');
  // Cochée sans date : ce n'est pas une erreur, l'estimation attend la date.
  assert.equal(validerParametres({ ...PARAMETRES_DEFAUT, typeActivite: 'liberal', acre: true }).erreurs, null);
  const invalide = validerParametres({ ...PARAMETRES_DEFAUT, debutActivite: '2026-02-30' });
  assert.match(invalide.erreurs.debutActivite, /invalide/);
});
