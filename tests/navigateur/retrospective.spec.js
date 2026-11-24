/**
 * La Rétrospective : hors du menu, mise en avant sur le tableau de bord en fin
 * d'année, lancée depuis le rapport annuel (Exports) toute l'année, avec sa
 * page des années (Ctrl+K). Puis le récit en plein écran : scènes,
 * commandes, chiffres qui défilent, carte de l'année.
 */

import { test, expect, configurer, ajouterRecette, ouvrir, attendrePage, eurosEntiers } from './outils.js';

const annee = new Date().getFullYear();
const lecteur = (page) => page.locator('dialog.retro[open]');
/** La scène à l'écran : la dernière posée (l'ancienne s'efface pendant la transition). */
const scene = (page) => lecteur(page).locator('.retro-scene').last();

/** Le défilement automatique suspendu (il n'existe pas en mouvement réduit). */
async function suspendre(page) {
  const pause = lecteur(page).locator('[data-pause]');
  if (await pause.isVisible()) await pause.click();
}

async function allerALaFin(page) {
  const suivant = lecteur(page).locator('[data-pas="1"]');
  while (await suivant.isEnabled()) await suivant.click();
  await expect(scene(page)).toHaveAttribute('data-scene', 'recap');
}

async function deuxRecettes(request, parametres = {}) {
  await configurer(request, parametres);
  await ajouterRecette(request, { client: 'Premier', montant: 300 });
  await ajouterRecette(request, { client: 'Second', montant: 100 });
}

test('hors saison, pas dans le menu : la page des années se trouve par Ctrl+K', async ({ page, request }) => {
  await deuxRecettes(request);
  await page.clock.setFixedTime(new Date(annee, 5, 15, 10));
  await ouvrir(page);
  await expect(page.locator('#navigation .lien-nav[data-route="retrospective"]')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  const boite = page.locator('dialog.boite-recherche');
  await boite.locator('input[type="search"]').fill('rétro');
  await boite.locator('.groupe-resultats[aria-label="Pages"] .resultat', { hasText: 'Rétrospective' }).click();
  await expect(page).toHaveURL(/#\/retrospective$/);
  await attendrePage(page);
  await expect(page.locator('.affiche-annee')).toHaveText(String(annee));
  await expect(page.locator('.affiche-resume')).toContainText(`${eurosEntiers(400)} encaissés, 2 encaissements, 2 clients`);
});

test('du 15 décembre au 31 janvier, elle a sa place dans le menu, avec son année', async ({ page, request }) => {
  await deuxRecettes(request);
  await page.clock.setFixedTime(new Date(annee + 1, 0, 10, 10));
  await ouvrir(page);
  const lien = page.locator('#navigation .liens-rares .lien-nav[data-route="retrospective"]');
  await expect(lien).toContainText(`Rétrospective${annee}`);
  // Avec Importer et Exports, en tête de ce groupe.
  await expect(page.locator('#navigation .liens-rares .lien-nav').first()).toHaveAttribute('data-route', 'retrospective');
  await lien.click();
  await expect(page).toHaveURL(/#\/retrospective$/);
  await expect(lien).toHaveAttribute('aria-current', 'page');
});

test('sans recette, la page des années invite à commencer', async ({ page, request }) => {
  await configurer(request);
  await ouvrir(page, 'retrospective');
  await expect(page.locator('.affiche-vide')).toContainText('Votre première rétrospective apparaîtra ici');
  await expect(page.locator('[data-lancer]')).toHaveCount(0);
});

test('toute l’année, le rapport annuel des exports lance la rétrospective de son année', async ({ page, request }) => {
  await deuxRecettes(request);
  await ajouterRecette(request, { client: 'Ancien', montant: 50, dateEncaissement: `${annee - 1}-06-10` });
  await ouvrir(page, 'exports');
  await page.locator('#rapport-annee [data-pas="-1"]').click();
  await page.locator('#voir-retrospective').click();
  await suspendre(page);
  await expect(scene(page).locator('.retro-annee')).toHaveText(String(annee - 1));
  await page.keyboard.press('ArrowRight');
  await expect(scene(page).locator('.retro-geant')).toHaveText(eurosEntiers(50));
});

test('en fin d’année, le tableau de bord la met en avant, et se laisse masquer', async ({ page, request }) => {
  await deuxRecettes(request);
  await page.clock.setFixedTime(new Date(annee, 11, 20, 10));
  await ouvrir(page);
  const carte = page.locator('.carte-retro-saison');
  await expect(carte.locator('h2')).toHaveText(`Votre année ${annee} en rétrospective`);
  await expect(carte).not.toContainText('Toutes vos années');
  await carte.locator('[data-bilan]').click();
  await expect(lecteur(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await carte.locator('[data-masquer-bilan]').click();
  await expect(page.locator('.carte-retro-saison')).toHaveCount(0);
  await page.reload();
  await attendrePage(page);
  await expect(page.locator('.carte-retro-saison')).toHaveCount(0);
});

test('le récit, scène après scène jusqu’à la carte de l’année', async ({ page, request }) => {
  await deuxRecettes(request, { typeActivite: 'liberal', nomEntreprise: 'Atelier Test' });
  await ouvrir(page, 'retrospective');
  const lancer = page.locator('[data-lancer]').first();
  await lancer.click();
  await expect(lecteur(page)).toBeVisible();
  await suspendre(page);
  await expect(scene(page)).toHaveAttribute('data-scene', 'ouverture');
  await expect(scene(page).locator('.retro-sur')).toHaveText('Atelier Test');
  await expect(scene(page).locator('.retro-annee')).toHaveText(String(annee));

  // La flèche avance ; un clic sur le tiers gauche de l'écran recule.
  await page.keyboard.press('ArrowRight');
  await expect(scene(page)).toHaveAttribute('data-scene', 'total');
  await expect(scene(page).locator('.retro-geant')).toHaveText(eurosEntiers(400));
  await expect(lecteur(page).locator('[data-annonce]')).toContainText(`${eurosEntiers(400)} encaissés`);
  await expect(lecteur(page).locator('.retro-numero')).toContainText('2 sur');
  await page.mouse.click(80, 450);
  await expect(scene(page)).toHaveAttribute('data-scene', 'ouverture');
  await expect(lecteur(page).locator('[data-pas="-1"]')).toBeDisabled();

  // Jusqu'à la carte de l'année : ses chiffres, l'export du livre, sans image.
  await allerALaFin(page);
  const carte = scene(page).locator('.retro-carte');
  await expect(carte.locator('.recap-total')).toHaveText(eurosEntiers(400));
  await expect(carte.locator('.recap-grille')).toContainText('Premier client');
  await expect(carte.locator('.recap-grille')).toContainText('Premier');
  await expect(scene(page).locator('[data-exporter]')).toHaveAttribute('href', `#/exports?registre=recettes&annee=${annee}`);
  await expect(scene(page).locator('.retro-action')).toHaveCount(2);
  await expect(lecteur(page).locator('[data-pause]')).toBeHidden();

  // « Revoir » repart du début ; Échap ferme et rend le focus au bouton.
  await scene(page).locator('[data-revoir]').click();
  await expect(scene(page)).toHaveAttribute('data-scene', 'ouverture');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.retro')).toHaveCount(0);
  await expect(lancer).toBeFocused();
});

test('les montants montent sur place : même largeur, même texte à l’arrivée, rien par-dessus', async ({ page, request }, info) => {
  test.skip(info.project.name === 'mouvement-reduit', 'en mouvement réduit, rien ne bouge');
  await deuxRecettes(request);
  await ouvrir(page, 'retrospective');
  await page.locator('[data-lancer]').first().click();
  await suspendre(page);
  await page.keyboard.press('ArrowRight');
  const montant = scene(page).locator('.retro-geant [data-compteur]');
  // Pendant la montée : le montant s'écrit dans son propre texte (aucun
  // calque), dans une largeur réservée qui ne bouge pas.
  await expect(montant).not.toHaveText(eurosEntiers(400));
  const pendant = await montant.boundingBox();
  expect(await montant.locator('*').count()).toBe(0);
  await expect(montant).toHaveText(eurosEntiers(400));
  const apres = await montant.boundingBox();
  expect(Math.abs(apres.x - pendant.x) + Math.abs(apres.y - pendant.y) + Math.abs(apres.width - pendant.width)).toBeLessThan(0.5);
});

test('les scènes viennent selon ce que le livre peut raconter', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'mixte', naturePrestations: 'liberal' });
  const modes = ['virement', 'cheque', 'especes', 'carte', 'virement', 'cheque'];
  for (const [i, mode] of modes.entries()) {
    await ajouterRecette(request, {
      client: `Client ${i % 3}`, montant: 100 + i * 10, modeReglement: mode, categorie: i % 2 ? 'ventes' : 'prestations'
    });
  }
  await ouvrir(page, 'retrospective');
  await page.locator('[data-lancer]').first().click();
  await suspendre(page);
  const vues = [];
  const suivant = lecteur(page).locator('[data-pas="1"]');
  for (;;) {
    vues.push(await scene(page).getAttribute('data-scene'));
    if (!(await suivant.isEnabled())) break;
    await suivant.click();
    await expect(scene(page)).not.toHaveAttribute('data-scene', vues.at(-1));
  }
  expect(vues).toEqual(expect.arrayContaining(['mosaique', 'client', 'clients', 'rythme', 'paiement', 'categories', 'recap']));
  expect(vues[0]).toBe('ouverture');
  expect(vues.at(-1)).toBe('recap');
});

test('le récit avance seul, se met en pause, et un appui long le suspend', async ({ page, request }, info) => {
  test.skip(info.project.name === 'mouvement-reduit', 'en mouvement réduit, rien ne défile seul');
  await deuxRecettes(request);
  await ouvrir(page, 'retrospective');
  await page.locator('[data-lancer]').first().click();
  await expect(scene(page)).toHaveAttribute('data-scene', 'ouverture');
  // La première scène passe d'elle-même.
  await expect(scene(page)).toHaveAttribute('data-scene', 'total', { timeout: 9000 });
  const pause = lecteur(page).locator('[data-pause]');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-label', 'Reprendre');
  await page.waitForTimeout(7500);
  await expect(scene(page)).toHaveAttribute('data-scene', 'total');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-label', 'Mettre en pause');
  // Appui long relâché sur une commande : le récit reprend, sans changer de scène.
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await expect(lecteur(page)).toHaveClass(/tenu/);
  await page.mouse.move(1380, 860);
  await page.mouse.up();
  await expect(lecteur(page)).not.toHaveClass(/tenu/);
  await expect(scene(page)).toHaveAttribute('data-scene', 'total');
});
