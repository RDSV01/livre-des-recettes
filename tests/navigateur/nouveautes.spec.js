/**
 * Les nouveautés d'une version : présentées une seule fois, à la première
 * ouverture qui suit la mise à jour ; jamais à la découverte de l'application.
 */

import { test, expect, configurer, ajouterRecette, ouvrir } from './outils.js';

test('à la première ouverture après la mise à jour, la boîte s’ouvre d’elle-même', async ({ page, request }) => {
  await configurer(request);
  await ajouterRecette(request);
  // Ce navigateur avait vu les nouveautés de la version précédente.
  await page.addInitScript(() => localStorage.setItem('ldr-nouveautes-vues', '2.3.1'));
  await page.goto('/#/');
  const boite = page.locator('dialog.boite-nouveautes[open]');
  await expect(boite.locator('h2')).toHaveText('Ce qui change dans la version 2.4.0');
  await boite.getByRole('button', { name: 'Compris' }).click();
  await expect(page.locator('dialog.boite-nouveautes')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ldr-nouveautes-vues'))).toBe('2.4.0');
});

/** Appelle la boîte comme au lancement, la mémoire des nouveautés vidée. */
async function montrer(page, version, decouverte = false) {
  await page.evaluate(async ([v, d]) => {
    const { montrerNouveautes } = await import('/js/nouveautes.js');
    montrerNouveautes(v, { decouverte: d });
  }, [version, decouverte]);
}

test('les nouveautés de la 2.4.0 se présentent une fois, chacune avec son icône', async ({ page, request }) => {
  await configurer(request);
  await ajouterRecette(request);
  await ouvrir(page);
  await page.evaluate(() => localStorage.removeItem('ldr-nouveautes-vues'));
  await montrer(page, '2.4.0');
  const boite = page.locator('dialog.boite-nouveautes[open]');
  await expect(boite.locator('h2')).toHaveText('Ce qui change dans la version 2.4.0');
  await expect(boite.locator('.liste-nouveautes li')).toHaveCount(5);
  await expect(boite.locator('.tuile-nouveaute svg')).toHaveCount(5);
  await expect(boite).toContainText('La rétrospective de l’année');
  await boite.getByRole('button', { name: 'Compris' }).click();
  await expect(page.locator('dialog.boite-nouveautes')).toHaveCount(0);
  // Déjà vues : plus rien.
  await montrer(page, '2.4.0');
  await expect(page.locator('dialog.boite-nouveautes')).toHaveCount(0);
});

test('à la découverte de l’application, rien n’est présenté (la version est seulement notée)', async ({ page, request }) => {
  await configurer(request);
  await ouvrir(page);
  await page.evaluate(() => localStorage.removeItem('ldr-nouveautes-vues'));
  await montrer(page, '2.4.0', true);
  await expect(page.locator('dialog.boite-nouveautes')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ldr-nouveautes-vues'))).toBe('2.4.0');
});

test('une version sans nouveautés ne montre rien', async ({ page, request }) => {
  await configurer(request);
  await ouvrir(page);
  await page.evaluate(() => localStorage.removeItem('ldr-nouveautes-vues'));
  await montrer(page, '2.3.9');
  await expect(page.locator('dialog.boite-nouveautes')).toHaveCount(0);
});
