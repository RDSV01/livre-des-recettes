/**
 * Les exports : contrôle avant export point par point, registres en PDF,
 * Excel et CSV (fichiers vérifiés), archive avec les PDF joints, période
 * choisie, rapport annuel.
 */

import {
  test, expect, configurer, ajouterRecette, ajouterAchat, joindre, ouvrir, telecharger, nomsDansZip
} from './outils.js';

const annee = new Date().getFullYear();

test('registre des recettes en CSV : contrôle affiché, puis le fichier', async ({ page, request }) => {
  await configurer(request);
  await ajouterRecette(request, { client: 'Durand', libelle: 'Logo', numeroFacture: 'F-1', montant: 1234.5 });
  await ajouterRecette(request, { client: 'Martin', libelle: 'Site', numeroFacture: 'F-2', montant: 99 });
  await ouvrir(page, 'exports');
  const carte = page.locator('#carte-recettes');
  const { nom, contenu } = await telecharger(page, () => carte.locator('[data-format="csv"]').click());
  expect(nom).toBe(`livre-recettes-${annee}.csv`);
  const texte = contenu.toString('utf8');
  expect(texte.charCodeAt(0)).toBe(0xfeff);
  expect(texte).toContain('Durand');
  expect(texte).toContain('1234,50');
  expect(texte.split(/\r?\n/)[0]).toContain(';');
  // Le contrôle s'est affiché point par point, conclusion comprise.
  const controle = carte.locator('.controle-apercu');
  await expect(controle).toContainText(`Contrôle avant export · Année ${annee}`);
  await expect(controle.locator('.points li')).not.toHaveCount(0);
  await expect(controle.locator('.points li.ok', { hasText: 'Continuité de la numérotation' })).toBeVisible();
  await expect(controle.locator('.conclusion-controle')).toHaveText('Tout est en ordre : le registre est complet et cohérent.');
  await expect(carte.locator('[data-format="csv"]')).toContainText('Exporté');
  await carte.locator('[data-fermer-controle]').click();
  await expect(carte.locator('.apercu')).not.toHaveClass(/en-controle/);
});

test('PDF et Excel : de vrais fichiers, nommés selon la période choisie', async ({ page, request }) => {
  await configurer(request);
  await ajouterRecette(request, { dateEncaissement: `${annee}-01-10`, numeroFacture: 'F-1' });
  await ouvrir(page, 'exports');
  const carte = page.locator('#carte-recettes');
  const pdf = await telecharger(page, () => carte.locator('[data-format="pdf"]').click());
  expect(pdf.nom).toBe(`livre-recettes-${annee}.pdf`);
  expect(pdf.contenu.subarray(0, 5).toString()).toBe('%PDF-');
  await expect(carte.locator('[data-format="pdf"]')).toContainText('Exporté');

  await carte.locator('#recettes-mois').selectOption('1');
  const xlsx = await telecharger(page, () => carte.locator('[data-format="xlsx"]').click());
  expect(xlsx.nom).toBe(`livre-recettes-${annee}-01.xlsx`);
  expect(nomsDansZip(xlsx.contenu)).toContain('xl/workbook.xml');
});

test('les mentions manquantes et les doublons se signalent, sans empêcher l’export', async ({ page, request }) => {
  await configurer(request);
  await ajouterRecette(request, { client: 'Même', montant: 10, numeroFacture: '' });
  await ajouterRecette(request, { client: 'Même', montant: 10, numeroFacture: '' });
  await ouvrir(page, 'exports');
  const carte = page.locator('#carte-recettes');
  const { contenu } = await telecharger(page, () => carte.locator('[data-format="csv"]').click());
  expect(contenu.length).toBeGreaterThan(0);
  await expect(carte.locator('.points li.attention', { hasText: 'Absence de doublons' })).toBeVisible();
  await expect(carte.locator('.points li.attention', { hasText: 'Numéro de facture renseigné' })).toBeVisible();
  await expect(carte.locator('.conclusion-controle')).toHaveClass(/attention/);
  await expect(carte.locator('.conclusion-controle')).toContainText('à vérifier. Rien n’empêche l’export.');
});

test('une période vide le dit', async ({ page, request }) => {
  await configurer(request);
  await ajouterRecette(request, { dateEncaissement: `${annee}-01-10` });
  await ouvrir(page, 'exports');
  const carte = page.locator('#carte-recettes');
  await carte.locator('#recettes-mois').selectOption(annee === new Date().getFullYear() && new Date().getMonth() === 1 ? '3' : '2');
  await telecharger(page, () => carte.locator('[data-format="pdf"]').click());
  await expect(carte.locator('.conclusion-controle')).toHaveText('Aucune ligne sur cette période : le document sera vide.');
});

test('avec les PDF joints : une archive ZIP qui les contient', async ({ page, request }) => {
  await configurer(request);
  const r = await ajouterRecette(request, { client: 'Avec PDF', numeroFacture: 'F-1' });
  await ajouterRecette(request, { client: 'Sans PDF', numeroFacture: 'F-2' });
  await joindre(request, 'recettes', r.id, 'facture-F-1.pdf');
  await ouvrir(page, 'exports');
  const carte = page.locator('#carte-recettes');
  await expect(carte.locator('#recettes-pieces-texte')).toContainText('Avec 1 PDF joint');
  await carte.locator('#recettes-pieces').check();
  const { nom, contenu } = await telecharger(page, () => carte.locator('[data-format="csv"]').click());
  expect(nom).toBe(`livre-recettes-${annee}-avec-pdf.zip`);
  const noms = nomsDansZip(contenu);
  expect(noms).toContain(`livre-recettes-${annee}.csv`);
  expect(noms.some((n) => n.endsWith('.pdf'))).toBe(true);
  await expect(carte.locator('.points li.info')).toContainText('1 joints, 1 sans PDF');
  await expect(carte.locator('[data-format="csv"]')).toContainText('Exporté (.zip)');
});

test('sans PDF sur la période, l’option est éteinte', async ({ page, request }) => {
  await configurer(request);
  await ajouterRecette(request);
  await ouvrir(page, 'exports');
  await expect(page.locator('#recettes-pieces')).toBeDisabled();
  await expect(page.locator('#recettes-pieces-texte')).toHaveText('Aucun PDF joint sur cette période');
});

test('le registre des achats s’exporte quand l’activité en tient un', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'ventes' });
  await ajouterAchat(request, { fournisseur: 'Grossiste', referenceFacture: 'A-1', montant: 55 });
  await ouvrir(page, 'exports');
  const carte = page.locator('#carte-achats');
  const { nom, contenu } = await telecharger(page, () => carte.locator('[data-format="csv"]').click());
  expect(nom).toBe(`registre-achats-${annee}.csv`);
  expect(contenu.toString('utf8')).toContain('Grossiste');
  await expect(carte.locator('.points li', { hasText: 'Référence de la pièce justificative' })).toBeVisible();
});

test('une activité de services n’a pas de carte des achats', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'liberal' });
  await ouvrir(page, 'exports');
  await expect(page.locator('#carte-achats')).toHaveCount(0);
  await expect(page.locator('.documents')).toHaveClass(/deux/);
});

test('le rapport annuel de gestion, en PDF', async ({ page, request }) => {
  await configurer(request);
  await ajouterRecette(request, { montant: 800 });
  await ajouterRecette(request, { montant: 500, dateEncaissement: `${annee - 1}-03-03` });
  await ouvrir(page, 'exports');
  const carte = page.locator('#carte-rapport');
  await expect(carte.locator('#rapport-annee .annee-choisie')).toHaveText(String(annee));
  let rapport = await telecharger(page, () => carte.locator('#telecharger-rapport').click());
  expect(rapport.nom).toBe(`rapport-annuel-${annee}.pdf`);
  expect(rapport.contenu.subarray(0, 5).toString()).toBe('%PDF-');
  await expect(carte.locator('#telecharger-rapport')).toContainText('Rapport prêt');
  await carte.locator('#rapport-annee [data-pas="-1"]').click();
  rapport = await telecharger(page, () => carte.locator('#telecharger-rapport').click());
  expect(rapport.nom).toBe(`rapport-annuel-${annee - 1}.pdf`);
});

test('la bulle d’aide du titre renvoie vers l’écran URSSAF', async ({ page, request }) => {
  await configurer(request);
  await ouvrir(page, 'exports');
  await page.locator('h1 .declencheur-infobulle').click();
  await expect(page.locator('h1 .bulle-aide')).toHaveClass(/visible/);
  await expect(page.locator('h1 .bulle-aide')).toContainText('L’écran « URSSAF »');
});
