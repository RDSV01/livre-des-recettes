/**
 * La sécurité des données : sauvegardes automatiques et leur restauration,
 * sauvegarde à la demande et sa reprise, copie sur une clé (simulée par un
 * dossier temporaire), rappel de l'absence de copie, et les écrans de
 * récupération d'un livre abîmé, disparu ou momentanément illisible.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  test, expect, configurer, ajouterRecette, ouvrir, attendrePage, telecharger, nomsDansZip, lister, parametres,
  RECETTES_AVANT_INCIDENT, rendreLisible
} from './outils.js';

const etatCopie = (page) => page.locator('#etat-copie');

test.describe('copie hors de l’ordinateur', () => {
  test('sans copie, le menu le rappelle ; une clé choisie reçoit le livre', async ({ page, request, livre }) => {
    await configurer(request);
    await ajouterRecette(request);
    await ouvrir(page);
    await expect(etatCopie(page)).toBeVisible();
    await expect(etatCopie(page)).toContainText('Aucune sauvegarde externe');
    // Le conseil au survol, et pour les lecteurs d'écran.
    await expect(etatCopie(page)).toHaveAttribute('title', 'Pensez à faire une sauvegarde.');
    await expect(etatCopie(page).locator('.hors-ecran')).toHaveText(' : Pensez à faire une sauvegarde.');
    await etatCopie(page).click();
    await expect(page).toHaveURL(/#\/parametres\?section=securite/);
    await attendrePage(page);

    const ligne = page.locator('#securite-copie');
    await expect(ligne).toContainText('Aucune pour l’instant.');
    await ligne.locator('[data-securite="choisir"]').click();
    await expect(ligne.locator('.consigne-supports')).toHaveText('Sur quel support faire la copie ?');
    const support = ligne.locator('[data-support]');
    await expect(support).toContainText('CLE TEST (T:)');
    await expect(support).toContainText('amovible');
    await support.click();
    await expect(page.locator('#zone-securite .bandeau-retour')).toContainText('Livre copié sur « CLE TEST (T:) »');
    await expect(page.locator('#securite-copie')).toHaveClass(/ok/);
    await expect(etatCopie(page)).toBeHidden();
    // Le livre est bien sur la « clé ».
    const dossierCopie = path.join(livre.cle, 'Livre des recettes - copie de sécurité');
    expect(fs.existsSync(dossierCopie)).toBe(true);
    expect(fs.readdirSync(dossierCopie, { recursive: true }).some((f) => String(f).endsWith('.json'))).toBe(true);

    // « Copier maintenant », puis ne plus copier.
    await page.locator('#securite-copie [data-securite="copier"]').click();
    await expect(page.locator('#zone-securite .bandeau-retour')).toContainText('Livre copié sur « CLE TEST (T:) »');
    await page.locator('#securite-copie [data-securite="arreter"]').click();
    const boite = page.locator('dialog.boite');
    await expect(boite).toContainText('Ne plus faire de copie sur ce support ?');
    await boite.locator('[data-role="ok"]').click();
    await expect(page.locator('#securite-copie')).toContainText('Aucune pour l’instant.');
    await expect(etatCopie(page)).toBeVisible();
  });

  test('ne plus rappeler l’absence de copie demande une seconde validation, et se rétablit', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'parametres?section=securite');
    await page.locator('[data-securite="ne-plus-rappeler"]').click();
    const boite = page.locator('dialog.boite');
    const ok = boite.locator('[data-role="ok"]');
    await expect(ok).toBeDisabled();
    await boite.locator('.case-a-cocher input').check();
    await expect(ok).toBeEnabled();
    await ok.click();
    await expect(etatCopie(page)).toBeHidden();
    await expect(page.locator('#securite-copie')).toContainText('Le menu ne rappelle plus son absence.');
    expect((await parametres(request)).signalerAbsenceCopie).toBe(false);
    await page.locator('[data-securite="rappeler"]').click();
    await expect(etatCopie(page)).toBeVisible();
    expect((await parametres(request)).signalerAbsenceCopie).toBe(true);
  });

  test('renoncer dans la boîte ne change rien', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'parametres?section=securite');
    await page.locator('[data-securite="ne-plus-rappeler"]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.boite')).toHaveCount(0);
    expect((await parametres(request)).signalerAbsenceCopie).toBe(true);
  });
});

test.describe('sauvegarde à la demande et reprise', () => {
  test('sauvegarder maintenant, puis reprendre ce fichier remet le livre tel qu’il était', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { client: 'Avant sauvegarde', montant: 10 });
    await ouvrir(page, 'parametres?section=securite');
    const { nom, contenu } = await telecharger(page, () => page.locator('[data-securite="sauvegarder"]').click());
    expect(nom).toMatch(/\.zip$/);
    expect(nomsDansZip(contenu).some((n) => n.endsWith('.json'))).toBe(true);
    await expect(page.locator('[data-securite="sauvegarder"]')).toContainText('Sauvegardé');

    await ajouterRecette(request, { client: 'Après sauvegarde', montant: 20 });
    await page.locator('[data-securite="reprendre"]').click();
    const boite = page.locator('dialog.boite-reprise');
    await expect(boite).toContainText('Reprendre une sauvegarde');
    await expect(boite.locator('.sources-reprise')).toContainText('Aucune copie sur les clés et disques branchés.');
    const choix = page.waitForEvent('filechooser');
    await boite.locator('[data-role="fichier"]').click();
    await (await choix).setFiles({ name: nom, mimeType: 'application/zip', buffer: contenu });
    await expect(boite.locator('.apercu-reprise')).toContainText('Atelier Test');
    await expect(boite.locator('.apercu-reprise')).toContainText('1 recette');
    await expect(boite).toContainText('Il remplacera le livre de cet ordinateur (2 recettes)');
    await boite.locator('[data-role="reprendre"]').click();
    await expect(boite.locator('.reussite-reprise')).toContainText('Livre repris : 1 recette');
    await boite.locator('[data-role="ouvrir"]').click();
    await attendrePage(page);
    const { recettes } = await lister(request, '/api/recettes');
    expect(recettes.map((r) => r.client)).toEqual(['Avant sauvegarde']);
    // Le livre remplacé reste récupérable.
    const { sauvegardes } = await lister(request, '/api/sauvegardes');
    expect(sauvegardes.some((s) => s.fichier.endsWith('-avant-reprise.json'))).toBe(true);
  });

  test('un fichier qui n’est pas une sauvegarde est refusé, le choix reste ouvert', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'parametres?section=securite');
    await page.locator('[data-securite="reprendre"]').click();
    const boite = page.locator('dialog.boite-reprise');
    const choix = page.waitForEvent('filechooser');
    await boite.locator('[data-role="fichier"]').click();
    await (await choix).setFiles({ name: 'pas-une-sauvegarde.zip', mimeType: 'application/zip', buffer: Buffer.from('rien à voir') });
    await expect(boite.locator('.message-erreur')).toBeVisible();
    await expect(boite.locator('[data-role="fichier"]')).toBeVisible();
    await boite.locator('[data-role="annuler"]').click();
    await expect(boite).toHaveCount(0);
  });

  test('une copie trouvée sur la clé se reprend d’un clic', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { client: 'Sur la clé' });
    const copie = await request.post('/api/securite/copie-externe', { data: { chemin: (await (await request.get('/api/securite/supports')).json()).supports[0].chemin } });
    expect((await copie.json()).resultat.copie).toBe(true);
    await ajouterRecette(request, { client: 'Pas sur la clé' });
    await ouvrir(page, 'parametres?section=securite');
    await page.locator('[data-securite="reprendre"]').click();
    const boite = page.locator('dialog.boite-reprise');
    await boite.locator('[data-copie]').click();
    await expect(boite.locator('.apercu-reprise')).toContainText('depuis CLE TEST (T:)');
    await boite.locator('[data-role="reprendre"]').click();
    await boite.locator('[data-role="ouvrir"]').click();
    await attendrePage(page);
    expect((await lister(request, '/api/recettes')).recettes.map((r) => r.client)).toEqual(['Sur la clé']);
  });
});

test.describe('sauvegardes automatiques', () => {
  test('la liste des sauvegardes, et une restauration confirmée', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { client: 'Première' });
    await ajouterRecette(request, { client: 'Seconde' });
    await ouvrir(page, 'parametres?section=securite');
    await expect(page.locator('#securite-sauvegardes')).toHaveClass(/ok/);
    const liste = page.locator('#liste-sauvegardes');
    await expect(liste.locator('.ligne-gestion', { hasText: 'Copie de secours' })).toBeVisible();
    const jour = liste.locator('.ligne-gestion', { hasText: 'Sauvegarde du jour' });
    await expect(jour).toBeVisible();
    // Renoncer ne restaure rien.
    await jour.locator('[data-fichier]').click();
    await page.locator('dialog.boite [data-role="annuler"]').click();
    expect((await lister(request, '/api/recettes')).recettes).toHaveLength(2);
    await jour.locator('[data-fichier]').click();
    await expect(page.locator('dialog.boite')).toContainText('Restaurer cette sauvegarde ?');
    await page.locator('dialog.boite [data-role="ok"]').click();
    await attendrePage(page);
    expect((await lister(request, '/api/recettes')).recettes.length).toBeLessThan(2);
    const { sauvegardes } = await lister(request, '/api/sauvegardes');
    expect(sauvegardes.some((s) => s.fichier.endsWith('-avant-restauration.json'))).toBe(true);
  });
});

test.describe('livre abîmé au démarrage', () => {
  test.use({ livreAuDemarrage: 'corrompu' });

  test('l’écran de récupération propose les sauvegardes, et la restauration rend le livre', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Données à restaurer');
    await expect(page.locator('.avis')).toContainText('est illisible');
    await expect(page.locator('#recherche-rail')).toBeHidden();
    await expect(page.locator('#navigation .lien-nav[aria-current]')).toHaveCount(0);
    await expect(page.locator('#repartir-de-zero')).toHaveCount(0);
    // Pendant la récupération, la navigation et les raccourcis sont suspendus.
    await page.keyboard.press('n');
    await expect(page.locator('h1')).toHaveText('Données à restaurer');
    await page.locator('#liste-restauration .ligne-gestion', { hasText: 'Copie de secours' }).locator('[data-fichier]').click();
    await page.locator('dialog.boite [data-role="ok"]').click();
    await attendrePage(page);
    await expect(page.locator('h1')).not.toHaveText('Données à restaurer');
    await ouvrir(page, 'recettes');
    await expect(page.locator('#registre tbody tr[data-id]')).toHaveCount(RECETTES_AVANT_INCIDENT.length);
  });
});

test.describe('livre disparu au démarrage', () => {
  test.use({ livreAuDemarrage: 'disparu' });

  test('il se restaure, ou l’on repart d’un livre vide', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Fichier de données introuvable');
    await expect(page.locator('.avis')).toContainText('Il a pu être supprimé');
    await page.locator('#repartir-de-zero').click();
    const boite = page.locator('dialog.boite');
    await expect(boite).toContainText('Repartir d’un livre vide ?');
    await boite.locator('[data-role="ok"]').click();
    // Livre vide : l'accueil guidé du premier lancement.
    await expect(page.locator('.accueil')).toBeVisible();
    expect((await lister(request, '/api/recettes')).recettes).toHaveLength(0);
    // Les sauvegardes, elles, sont toujours là.
    const { sauvegardes } = await lister(request, '/api/sauvegardes');
    expect(sauvegardes.length).toBeGreaterThan(0);
  });
});

test.describe('livre momentanément illisible', () => {
  test.use({ livreAuDemarrage: 'illisible' });

  test('l’écran d’attente se rouvre de lui-même quand le livre revient', async ({ page, livre }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Livre momentanément inaccessible');
    await expect(page.locator('#reessayer')).toBeVisible();
    rendreLisible(livre);
    await expect(page.locator('#nom-entreprise')).toHaveText('Revenu du nuage', { timeout: 20_000 });
    await expect(page.locator('h1')).not.toHaveText('Livre momentanément inaccessible');
  });
});
