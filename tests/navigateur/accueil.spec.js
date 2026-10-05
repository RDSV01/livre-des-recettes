/**
 * L'accueil guidé du premier lancement : quatre questions puis « C'est
 * prêt », chaque étape enregistrée en passant, la reprise d'un accueil
 * interrompu, « Configurer plus tard », le jeu de démonstration, et la
 * carte de bienvenue des paramètres.
 */

import { test, expect, regler, ouvrir, attendrePage, parametres, lister, ANNUAIRE } from './outils.js';
import { dernierePeriodeEchue, echeanceDeclaration, periodeDepuisId, aujourdHuiIso } from '../../src/partage/dates.js';

const accueil = (page) => page.locator('.accueil');
const continuer = (page) => accueil(page).locator('[type="submit"]').click();
const titre = (page) => accueil(page).locator('#titre-etape');

test('les quatre étapes, enregistrées une à une, puis la première recette', async ({ page, request }) => {
  await page.goto('/');
  await expect(accueil(page)).toBeVisible();
  await expect(titre(page)).toHaveText('Bienvenue');
  await expect(accueil(page).locator('#a-prenom')).toBeFocused();
  await accueil(page).locator('#a-prenom').fill('camille');
  await expect(titre(page)).toHaveText('Bienvenue Camille');
  await continuer(page);

  await expect(titre(page)).toHaveText('Votre entreprise');
  // Le prénom s'enregistre avec sa majuscule.
  expect(await parametres(request)).toMatchObject({ prenom: 'Camille', accueil: 'en-cours' });
  await expect(accueil(page).locator('.accueil-etapes li').first()).toHaveClass(/faite/);
  // Un SIRET mal formé est refusé ; un bon retrouve le nom.
  await accueil(page).locator('#a-siret').fill('123');
  await accueil(page).locator('[data-chercher]').click();
  await expect(accueil(page).locator('#a-resultat')).toContainText('Un SIRET compte 14 chiffres');
  await accueil(page).locator('#a-siret').fill(ANNUAIRE.atelier.siret);
  await accueil(page).locator('[data-chercher]').click();
  await expect(accueil(page).locator('#a-resultat')).toContainText(`Trouvé : ${ANNUAIRE.atelier.nom}`);
  await expect(accueil(page).locator('#a-nomEntreprise')).toHaveValue(ANNUAIRE.atelier.nom);
  await accueil(page).locator('#a-activite').fill('Menuiserie');
  await continuer(page);

  await expect(titre(page)).toHaveText('Votre activité');
  const nature = accueil(page).locator('.nature-prestations');
  await expect(nature).toBeHidden();
  await accueil(page).locator('.choix-carte', { hasText: 'Les deux : ventes et prestations' }).click();
  await expect(nature).toBeVisible();
  await nature.locator('.choix-carte').first().click();
  await continuer(page);

  await expect(titre(page)).toHaveText('Vos déclarations URSSAF');
  await accueil(page).locator('.choix-carte', { hasText: 'Chaque trimestre' }).click();
  await accueil(page).locator('#a-versementLiberatoire').click();
  await expect(accueil(page).locator('#a-versementLiberatoire')).toHaveAttribute('aria-checked', 'true');
  await continuer(page);

  await expect(titre(page)).toHaveText('Tout est prêt Camille');
  const recap = accueil(page).locator('.recapitulatif');
  await expect(recap).toContainText(ANNUAIRE.atelier.nom);
  await expect(recap).toContainText('Trimestrielle, avec versement libératoire');
  await expect(accueil(page).locator('[data-plus-tard]')).toBeHidden();
  const p = await parametres(request);
  expect(p).toMatchObject({
    accueil: 'termine', siret: ANNUAIRE.atelier.siret, siren: ANNUAIRE.atelier.siren, nomEntreprise: ANNUAIRE.atelier.nom,
    activite: 'Menuiserie', typeActivite: 'mixte', periodiciteUrssaf: 'trimestre', versementLiberatoire: true
  });
  // Une échéance déjà passée à l'installation est tenue pour réglée.
  const { id } = dernierePeriodeEchue('trimestre');
  const { annee, type, valeur } = periodeDepuisId(id);
  expect(p.dernierePeriodeDeclaree).toBe(aujourdHuiIso() > echeanceDeclaration(annee, type, valeur) ? id : '');

  await accueil(page).locator('[data-aller="recettes?nouvelle=1"]').click();
  await expect(accueil(page)).toHaveCount(0);
  await expect(page.locator('dialog.panneau[open] #titre-panneau')).toHaveText('Nouvelle recette');
  await expect(page.locator('#nom-entreprise')).toHaveText(ANNUAIRE.atelier.nom);
});

test('« Retour » revient en arrière en gardant la saisie', async ({ page }) => {
  await page.goto('/');
  await accueil(page).locator('#a-prenom').fill('Lou');
  await continuer(page);
  await accueil(page).locator('#a-nomEntreprise').fill('Lou Studio');
  await accueil(page).locator('[data-retour]').click();
  await expect(titre(page)).toHaveText('Bienvenue Lou');
  await continuer(page);
  await expect(accueil(page).locator('#a-nomEntreprise')).toHaveValue('Lou Studio');
});

test('un accueil interrompu reprend au lancement suivant', async ({ page, request }) => {
  await page.goto('/');
  await accueil(page).locator('#a-prenom').fill('Sam');
  await continuer(page);
  await expect(titre(page)).toHaveText('Votre entreprise');
  await page.reload();
  await expect(accueil(page)).toBeVisible();
  await expect(accueil(page).locator('#a-prenom')).toHaveValue('Sam');
  expect((await parametres(request)).accueil).toBe('en-cours');
});

test('« Configurer plus tard » referme l’accueil pour de bon ; les paramètres le proposent', async ({ page, request }) => {
  await page.goto('/');
  await accueil(page).locator('[data-plus-tard]').click();
  await expect(accueil(page)).toHaveCount(0);
  await attendrePage(page);
  expect((await parametres(request)).accueil).toBe('termine');
  await page.reload();
  await attendrePage(page);
  await expect(accueil(page)).toHaveCount(0);
  // Rien n'est configuré : la carte de bienvenue des paramètres relance l'accueil.
  await ouvrir(page, 'parametres');
  const bienvenue = page.locator('#carte-bienvenue');
  await expect(bienvenue).toContainText('Bienvenue !');
  await bienvenue.locator('#reprendre-accueil').click();
  await expect(accueil(page)).toBeVisible();
});

test('le jeu de démonstration depuis l’accueil garde le prénom tapé', async ({ page, request }) => {
  await page.goto('/');
  await accueil(page).locator('#a-prenom').fill('Lou');
  await accueil(page).locator('[data-demo]').click();
  await expect(accueil(page)).toHaveCount(0);
  await attendrePage(page);
  await expect(page.locator('h1')).toContainText('Lou');
  await expect(page.locator('#bandeaux')).toContainText('jeu de démonstration');
  expect((await parametres(request)).jeuDemo).toBe(true);
  expect((await lister(request, '/api/recettes')).recettes.length).toBeGreaterThan(20);
});

test('la carte de bienvenue charge aussi la démonstration', async ({ page, request }) => {
  await regler(request, { accueil: 'termine' });
  await ouvrir(page, 'parametres');
  await page.locator('#charger-demo').click();
  await attendrePage(page);
  await expect(page.locator('#bandeaux')).toContainText('jeu de démonstration');
  expect((await parametres(request)).jeuDemo).toBe(true);
});

test('la reprise d’une sauvegarde s’ouvre depuis l’accueil', async ({ page }) => {
  await page.goto('/');
  await accueil(page).locator('[data-reprise]').click();
  await expect(page.locator('dialog.boite-reprise')).toBeVisible();
  await page.locator('dialog.boite-reprise [data-role="annuler"]').click();
  await expect(accueil(page)).toBeVisible();
});

test('l’accueil s’affiche en clair, même sur un système en sombre', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(accueil(page)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await accueil(page).locator('[data-plus-tard]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('les raccourcis ne mènent nulle part pendant l’accueil', async ({ page }) => {
  await page.goto('/');
  await accueil(page).locator('h1').click();
  await page.keyboard.press('n');
  await page.keyboard.press('Control+k');
  await expect(page.locator('dialog.boite-recherche')).toHaveCount(0);
  await expect(page).toHaveURL(/\/(#\/?)?$/);
});

test('les choix de l’accueil se font aussi au clavier', async ({ page }) => {
  await page.goto('/');
  await continuer(page);
  await continuer(page);
  await expect(titre(page)).toHaveText('Votre activité');
  await accueil(page).locator('input[name="typeActivite"]').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(accueil(page).locator('input[name="typeActivite"]:checked')).toHaveValue('ventes');
});
