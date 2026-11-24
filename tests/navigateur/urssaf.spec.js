/**
 * L'écran URSSAF : rythme rappelé, périodes du rythme en onglets avec leur
 * état, détail d'une période et calcul, cases à reporter, période marquée
 * comme déclarée et son annulation.
 */

import {
  test, expect, configurer, ajouterRecette, ouvrir, attendrePage, eurosEntiers, dansMois, idMois, parametres
} from './outils.js';
import { periodeDepuisId, trimestreDe, formaterDate, dernierePeriodeEchue } from '../../src/partage/dates.js';
import { libellePeriode } from '../../src/partage/declarations.js';
import { periodeAcre } from '../../src/partage/acre.js';

const annee = new Date().getFullYear();
const mois = new Date().getMonth() + 1;
/** Le trimestre précédent déjà déclaré : l'écran s'ouvre sur le trimestre en cours. */
const aJour = { periodiciteUrssaf: 'trimestre', dernierePeriodeDeclaree: dernierePeriodeEchue('trimestre').id };

test('le rythme et l’activité sont rappelés, avec un lien pour les modifier', async ({ page, request }) => {
  await configurer(request, { periodiciteUrssaf: 'trimestre', typeActivite: 'liberal', versementLiberatoire: true });
  await ouvrir(page, 'urssaf');
  const rappel = page.locator('.entete-page .sous-titre');
  await expect(rappel).toContainText('Déclaration trimestrielle');
  await expect(rappel).toContainText('avec versement libératoire');
  await rappel.locator('a', { hasText: 'Modifier' }).click();
  await expect(page).toHaveURL(/#\/parametres\?section=regime/);
});

test('les quatre trimestres en onglets, le trimestre en cours choisi d’emblée', async ({ page, request }) => {
  await configurer(request, { periodiciteUrssaf: 'trimestre', dernierePeriodeDeclaree: '' });
  await ajouterRecette(request, { montant: 500 });
  await ouvrir(page, 'urssaf');
  const onglets = page.locator('#periodes .periode');
  await expect(onglets).toHaveCount(4);
  await expect(onglets.nth(trimestreDe(mois) - 1).locator('.etat')).toHaveText('En cours');
  if (trimestreDe(mois) < 4) await expect(onglets.nth(3).locator('.etat')).toHaveText('À venir');
  await expect(onglets.nth(trimestreDe(mois) - 1).locator('.montant')).toHaveText(`${eurosEntiers(500)} à ce jour`);
  // En frise : le repère de la période en cours, le trait rempli jusqu'à elle.
  await expect(onglets.nth(trimestreDe(mois) - 1)).toHaveClass(/etat-en-cours/);
  if (trimestreDe(mois) > 1) await expect(onglets.nth(trimestreDe(mois) - 2)).toHaveClass(/suite-faite/);
});

test('un onglet choisi affiche sa période et se retrouve dans l’adresse', async ({ page, request }) => {
  await configurer(request, { periodiciteUrssaf: 'mois', dernierePeriodeDeclaree: idMois(-1) });
  await ajouterRecette(request, { montant: 80, dateEncaissement: dansMois(0, 1) });
  await ouvrir(page, 'urssaf');
  await expect(page.locator('#periodes .periode')).toHaveCount(12);
  await page.locator(`#periodes .periode[data-valeur="${mois}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#/urssaf\\?periode=${annee}-${String(mois).padStart(2, '0')}`));
  await expect(page.locator('#titre-periode')).toHaveText(libellePeriode({ annee, type: 'mois', valeur: mois }));
  await expect(page.locator('.chiffre-cle.principal .valeur')).toContainText(eurosEntiers(80));
  await expect(page.locator('.statut-ligne')).toContainText('Période en cours');
});

test('les périodes suivent le rythme des paramètres : un lien vers un trimestre ouvre son dernier mois', async ({ page, request }) => {
  await configurer(request, { periodiciteUrssaf: 'mois' });
  await page.goto(`/#/urssaf?periode=${annee}-T${trimestreDe(mois)}`);
  await attendrePage(page);
  await expect(page.locator('#periodes .periode')).toHaveCount(12);
  await expect(page.locator('[data-decoupage]')).toHaveCount(0);
  const dernierMois = trimestreDe(mois) * 3;
  await expect(page.locator(`#periodes .periode[data-valeur="${dernierMois}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#titre-periode')).toHaveText(libellePeriode({ annee, type: 'mois', valeur: dernierMois }));
});

test('l’année se change depuis l’en-tête', async ({ page, request }) => {
  await configurer(request, { periodiciteUrssaf: 'trimestre' });
  await ajouterRecette(request, { montant: 300, dateEncaissement: `${annee - 1}-05-10` });
  await ajouterRecette(request, { montant: 10 });
  await ouvrir(page, 'urssaf');
  await page.locator('#urssaf-annee [data-pas="-1"]').click();
  await expect(page.locator('#urssaf-annee .annee-choisie')).toHaveText(String(annee - 1));
  await expect(page.locator('#periodes .periode[data-valeur="2"] .montant')).toContainText(eurosEntiers(300));
  // L'adresse suit le choix : un rechargement le retrouve.
  await expect(page).toHaveURL(new RegExp(`#/urssaf\\?periode=${annee - 1}-T\\d`));
  await page.reload();
  await attendrePage(page);
  await expect(page.locator('#urssaf-annee .annee-choisie')).toHaveText(String(annee - 1));
});

test('une période à déclarer : chiffres clés, copie, case à reporter, détail du calcul', async ({ page, request }) => {
  await configurer(request, { periodiciteUrssaf: 'mois', dernierePeriodeDeclaree: idMois(-2), typeActivite: 'liberal' });
  await ajouterRecette(request, { montant: 2000.4, dateEncaissement: dansMois(-1, 5) });
  const periode = periodeDepuisId(idMois(-1));
  // Un autre mois encaissé, où le détail du calcul doit rester déplié.
  const autreMois = periode.valeur === 1 ? 2 : 1;
  await ajouterRecette(request, { montant: 300, dateEncaissement: `${periode.annee}-${String(autreMois).padStart(2, '0')}-10` });
  await ouvrir(page, 'urssaf');
  await expect(page.locator('#titre-periode')).toHaveText(libellePeriode(periode));
  await expect(page.locator('.statut-ligne .etat')).toHaveText('À déclarer');
  await expect(page.locator('.chiffre-cle.principal .valeur')).toContainText(eurosEntiers(2000));
  await expect(page.locator('.chiffre-cle').nth(1).locator('.libelle')).toHaveText('Sera prélevé par l’URSSAF');
  await expect(page.locator('.chiffre-cle.reste .libelle')).toHaveText('Il vous restera');
  await expect(page.locator('#detail .bloc-note').last()).toContainText('À reporter dans la case');

  await page.locator('.chiffre-cle.principal [data-copier]').click();
  await expect(page.locator('.chiffre-cle.principal [data-copier]')).toContainText('Copié');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('2000');

  // Le détail du calcul se déplie, et reste déplié d'une période à l'autre.
  const details = page.locator('.details-calcul');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(details).toContainText('Encaissé sur la période');
  await expect(details).toContainText('Cotisations sociales');
  // Dessiné avant d'être détaillé : la part de l'URSSAF, puis ce qui reste.
  await expect(details.locator('.barre-calcul')).toHaveAttribute('aria-label', /^Cotisations sociales \d+ %.*Il vous restera \d+ %$/);
  await expect(details).toContainText('La déclaration se fait en euros entiers');
  await page.locator(`#periodes .periode[data-valeur="${autreMois}"]`).click();
  await expect(page.locator('.details-calcul')).toHaveAttribute('open', '');
});

test('une période sans chiffre d’affaires se dit en mots, pas en « 0 € »', async ({ page, request }) => {
  await configurer(request, { periodiciteUrssaf: 'mois', dernierePeriodeDeclaree: idMois(-2), typeActivite: 'mixte', naturePrestations: 'liberal' });
  await ajouterRecette(request, { montant: 100, dateEncaissement: dansMois(-3, 5) });
  await ouvrir(page, 'urssaf');
  await expect(page.locator('#titre-periode')).toHaveText(libellePeriode(periodeDepuisId(idMois(-1))));
  const detail = page.locator('#detail');
  await expect(detail.locator('.sans-chiffre-affaires')).toContainText('Aucun chiffre d’affaires sur cette période');
  await expect(detail.locator('.sans-chiffre-affaires')).toContainText('La déclaration reste obligatoire');
  await expect(detail.locator('.bloc-note')).toContainText('Indiquez 0 dans chaque case');
  // Ni montants nuls, ni cases à 0, ni calcul.
  await expect(detail.locator('.chiffre-cle, .case-urssaf, .details-calcul')).toHaveCount(0);
  await expect(detail).not.toContainText(eurosEntiers(0));
  // Déclarée, elle le reste en mots.
  await page.locator('#declarer').click();
  await expect(page.locator('.statut-ligne .etat')).toHaveText('Déclarée');
  await expect(detail.locator('.sans-chiffre-affaires')).toContainText('Déclarée sans chiffre d’affaires');
});

test('marquer comme déclarée, puis annuler la déclaration et revenir dessus', async ({ page, request }) => {
  await configurer(request, { periodiciteUrssaf: 'mois', dernierePeriodeDeclaree: idMois(-2) });
  await ajouterRecette(request, { montant: 100, dateEncaissement: dansMois(-1, 3) });
  await ouvrir(page, 'urssaf');
  await expect(page.locator('#navigation .alerte-nav')).toHaveText('À faire');
  await page.locator('#declarer').click();
  await expect(page.locator('#declarer')).toContainText('Déclarée');
  await expect(page.locator('.statut-ligne .etat')).toHaveText('Déclarée');
  await expect(page.locator('#annuler-declaration')).toBeVisible();
  await expect(page.locator('#navigation .alerte-nav')).toBeHidden();
  expect((await parametres(request)).dernierePeriodeDeclaree).toBe(idMois(-1));

  await page.locator('#annuler-declaration').click();
  await expect(page.locator('#detail .bandeau-retour')).toContainText('déclaration annulée');
  await expect(page.locator('.statut-ligne .etat')).toHaveText('À déclarer');
  expect((await parametres(request)).dernierePeriodeDeclaree).toBe(idMois(-2));
  await page.locator('#detail .bandeau-retour button').click();
  await expect(page.locator('.statut-ligne .etat')).toHaveText('Déclarée');
  expect((await parametres(request)).dernierePeriodeDeclaree).toBe(idMois(-1));
});

test('activité mixte : un montant par case, et les recettes à classer signalées', async ({ page, request }) => {
  await configurer(request, { ...aJour, typeActivite: 'mixte', naturePrestations: 'liberal' });
  await ajouterRecette(request, { montant: 300, categorie: 'ventes' });
  await ajouterRecette(request, { montant: 700, categorie: 'prestations' });
  await ajouterRecette(request, { montant: 50, categorie: '' });
  await ouvrir(page, 'urssaf');
  const cases = page.locator('.case-urssaf');
  await expect(cases).toHaveCount(2);
  await expect(cases.nth(0)).toContainText(eurosEntiers(300));
  await expect(cases.nth(1)).toContainText(eurosEntiers(700));
  await cases.nth(1).locator('[data-copier]').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('700');
  await expect(page.locator('#detail .avis')).toContainText('1 recette sans catégorie');
  await expect(page.locator('.chiffre-cle.principal .libelle')).toContainText('(total)');
});

test('sans type d’activité, le montant seul et une invitation à préciser', async ({ page, request }) => {
  await configurer(request, { ...aJour, typeActivite: '' });
  await ajouterRecette(request, { montant: 90 });
  await ouvrir(page, 'urssaf');
  await expect(page.locator('.chiffres-cles')).toHaveClass(/seul/);
  await expect(page.locator('#detail .bloc-note').first()).toContainText('Indiquez votre type d’activité');
  await expect(page.locator('.entete-page .sous-titre')).toContainText('activité non renseignée');
});

test('l’ACRE en cours se rappelle, et réduit l’estimation', async ({ page, request }) => {
  const debutActivite = dansMois(-2, 1);
  await configurer(request, { ...aJour, typeActivite: 'liberal', acre: true, debutActivite });
  const p = await parametres(request);
  const acre = periodeAcre(p);
  await ajouterRecette(request, { montant: 1000 });
  await ouvrir(page, 'urssaf');
  await expect(page.locator('.entete-page .sous-titre')).toContainText(`ACRE jusqu’au ${formaterDate(acre.fin)}`);
  await page.locator('.details-calcul summary').click();
  await expect(page.locator('.details-calcul')).toContainText('taux ACRE');
});

test('arriver par un lien de période l’ouvre directement', async ({ page, request }) => {
  await configurer(request, { periodiciteUrssaf: 'trimestre' });
  await page.goto(`/#/urssaf?periode=${annee}-T1`);
  await attendrePage(page);
  await expect(page.locator('#titre-periode')).toHaveText(libellePeriode({ annee, type: 'trimestre', valeur: 1 }));
  await expect(page.locator('#periodes .periode[data-valeur="1"]')).toHaveAttribute('aria-pressed', 'true');
});

test('aucun trait de la frise ne traverse la période choisie', async ({ page, request }) => {
  await configurer(request);
  await ouvrir(page, 'urssaf');
  const traitsHorsChoisie = () => page.locator('#periodes').evaluate((frise) => {
    const zone = frise.querySelector('.periode[aria-pressed="true"]').getBoundingClientRect();
    return [...frise.querySelectorAll('.periode')].flatMap((p) => {
      const trait = getComputedStyle(p, '::after');
      if (trait.content === 'none' || trait.display === 'none') return [];
      const gauche = p.getBoundingClientRect().left + Number.parseFloat(trait.left);
      const droite = gauche + Number.parseFloat(trait.width);
      // Un pixel de marge : les positions arrondies diffèrent d'un système à l'autre.
      return [droite <= zone.left + 1 || gauche >= zone.right - 1];
    });
  });
  // Une période entourée de deux autres : ni le trait qui arrive ni celui qui part n'y entrent.
  // La mesure attend la frise stable (la page se redessine après le clic).
  await page.locator('#periodes .periode[data-valeur="2"]').click();
  await expect(page.locator('#periodes .periode[data-valeur="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => {
    const traits = await traitsHorsChoisie();
    return traits.length > 0 && traits.every(Boolean);
  }).toBe(true);
});
