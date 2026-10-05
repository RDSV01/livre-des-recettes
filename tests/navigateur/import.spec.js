/**
 * L'import CSV, en trois étapes : fichier, correspondance des colonnes,
 * vérification (doublons, lignes en erreur), puis import et sa sauvegarde
 * préalable. Pour les recettes comme pour les achats.
 */

import { test, expect, configurer, ajouterRecette, ouvrir, lister } from './outils.js';

const annee = new Date().getFullYear();

const csv = (lignes, nom = 'historique.csv') => ({
  name: nom, mimeType: 'text/csv', buffer: Buffer.from(`\ufeff${lignes.join('\r\n')}\r\n`, 'utf8')
});

const FICHIER_RECETTES = csv([
  'Date;Client;Montant;Description;Paiement;N° facture',
  `05/01/${annee};Durand;120,50;Logo;Virement;F-100`,
  `12/01/${annee};Martin;80;Affiche;Chèque;F-101`,
  `20/01/${annee};;45;Sans client;Espèces;F-102`,
  `pas une date;Zola;10;Erreur;CB;F-103`
]);

/** Choisit le fichier à l'étape 1 et rend la carte de l'import. */
async function deposer(page, fichier) {
  await page.locator('#i-fichier').setInputFiles(fichier);
  return page.locator('#import');
}

test('les colonnes sont devinées, les lignes vérifiées, puis importées', async ({ page, request }) => {
  await configurer(request);
  await ajouterRecette(request, { client: 'Durand', montant: 120.5, dateEncaissement: `${annee}-01-05`, numeroFacture: 'F-100' });
  await ouvrir(page, 'import');
  const carte = await deposer(page, FICHIER_RECETTES);
  await expect(carte.locator('.etape.active')).toContainText('Colonnes');
  await expect(carte.locator('.fichier-importe')).toContainText('historique.csv : 4 lignes, 6 colonnes');
  await expect(carte.locator('#i-col-0')).toHaveValue('dateEncaissement');
  await expect(carte.locator('#i-col-1')).toHaveValue('client');
  await expect(carte.locator('#i-col-2')).toHaveValue('montant');
  await expect(carte.locator('#i-col-3')).toHaveValue('libelle');
  await expect(carte.locator('#i-col-4')).toHaveValue('modeReglement');
  await expect(carte.locator('#i-col-5')).toHaveValue('numeroFacture');

  await carte.locator('#i-analyser').click();
  await expect(carte.locator('.etape.active')).toContainText('Vérification');
  await expect(carte.locator('.points-import')).toContainText('1 recette prête à importer');
  await expect(carte.locator('.points-import li.alerte')).toContainText('1 doublon détecté');
  await expect(carte.locator('.points-import li.erreur')).toContainText('2 lignes en erreur, non importées');
  await expect(carte.locator('#i-importer')).toHaveText(/Importer 1 recette/);
  // Les doublons peuvent être importés aussi.
  await carte.locator('#i-doublons').check();
  await expect(carte.locator('#i-importer')).toHaveText(/Importer 2 recettes/);
  await carte.locator('#i-doublons').uncheck();

  await carte.locator('#i-importer').click();
  await expect(carte.locator('.reussite-import h2')).toHaveText('1 recette importée');
  await expect(carte.locator('.reussite-import')).toContainText('Une sauvegarde des données précédentes a été créée');
  const { recettes } = await lister(request, '/api/recettes');
  expect(recettes).toHaveLength(2);
  expect(recettes.find((r) => r.client === 'Martin')).toMatchObject({ montant: 80, modeReglement: 'cheque', libelle: 'Affiche', numeroFacture: 'F-101', dateEncaissement: `${annee}-01-12` });
  // La sauvegarde « avant import » est listée dans les paramètres.
  const { sauvegardes } = await lister(request, '/api/sauvegardes');
  expect(sauvegardes.some((s) => s.fichier.endsWith('-avant-import.json'))).toBe(true);
  await carte.locator('a', { hasText: 'Voir les recettes' }).click();
  await expect(page).toHaveURL(/#\/recettes$/);
});

test('une correspondance incomplète ou en double est refusée, « Retour » revient au fichier', async ({ page, request }) => {
  await configurer(request);
  await ouvrir(page, 'import');
  const carte = await deposer(page, FICHIER_RECETTES);
  await carte.locator('#i-col-1').selectOption('');
  await carte.locator('#i-analyser').click();
  await expect(carte.locator('[data-erreur]')).toHaveText('Associez une colonne au champ : Client.');
  await carte.locator('#i-col-1').selectOption('montant');
  await carte.locator('#i-analyser').click();
  await expect(carte.locator('[data-erreur]')).toContainText('Montant est choisi deux fois');
  await carte.locator('[data-etape="1"]').click();
  await expect(carte.locator('.etape.active')).toContainText('Fichier');
  // Le fichier lu se reprend sans le choisir de nouveau.
  await carte.locator('#i-reprendre').click();
  await expect(carte.locator('#i-col-1')).toHaveValue('client');
});

test('un fichier vide ou sans titres est refusé', async ({ page, request }) => {
  await configurer(request);
  await ouvrir(page, 'import');
  const carte = await deposer(page, csv(['seulement une ligne'], 'vide.csv'));
  await expect(carte.locator('[data-erreur]')).toContainText('Fichier vide ou illisible');
  await expect(carte.locator('.etape.active')).toContainText('Fichier');
});

test('un fichier glissé sur la zone est lu aussi', async ({ page, request }) => {
  await configurer(request);
  await ouvrir(page, 'import');
  const transfert = await page.evaluateHandle((texte) => {
    const dt = new DataTransfer();
    dt.items.add(new File([texte], 'glisse.csv', { type: 'text/csv' }));
    return dt;
  }, `Date;Client;Montant\n01/02/${annee};Glissé;10\n`);
  const depot = page.locator('#depot');
  await depot.dispatchEvent('dragover', { dataTransfer: transfert });
  await expect(depot).toHaveClass(/survol/);
  await depot.dispatchEvent('drop', { dataTransfer: transfert });
  await expect(page.locator('.fichier-importe')).toContainText('glisse.csv : 1 ligne, 3 colonnes');
});

test('aucune ligne valide : l’import reste fermé', async ({ page, request }) => {
  await configurer(request);
  await ouvrir(page, 'import');
  const carte = await deposer(page, csv(['Date;Client;Montant', 'nulle;Personne;abc']));
  await carte.locator('#i-analyser').click();
  await expect(carte.locator('#i-importer')).toBeDisabled();
});

test('seuls des doublons : rien à importer tant qu’ils ne sont pas demandés', async ({ page, request }) => {
  await configurer(request);
  await ajouterRecette(request, { client: 'Durand', montant: 120.5, dateEncaissement: `${annee}-01-05` });
  await ouvrir(page, 'import');
  const carte = await deposer(page, csv(['Date;Client;Montant', `05/01/${annee};Durand;120,50`]));
  await carte.locator('#i-analyser').click();
  await expect(carte.locator('#i-importer')).toHaveText(/Importer 0 recette/);
  await expect(carte.locator('#i-importer')).toBeDisabled();
  await carte.locator('#i-doublons').check();
  await expect(carte.locator('#i-importer')).toBeEnabled();
  await carte.locator('#i-importer').click();
  await expect(carte.locator('.reussite-import h2')).toHaveText('1 recette importée');
});

test('activité mixte : la catégorie lue, ou celle choisie par défaut', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'mixte' });
  await ouvrir(page, 'import');
  const carte = await deposer(page, csv([
    'Date;Client;Montant;Type',
    `01/02/${annee};A;10;Vente de marchandises`,
    `02/02/${annee};B;20;`
  ]));
  await expect(carte.locator('#i-col-3')).toHaveValue('categorie');
  await carte.locator('#i-categorie-defaut').selectOption('prestations');
  await carte.locator('#i-analyser').click();
  await carte.locator('#i-importer').click();
  await expect(carte.locator('.reussite-import h2')).toHaveText('2 recettes importées');
  const { recettes } = await lister(request, '/api/recettes');
  expect(Object.fromEntries(recettes.map((r) => [r.client, r.categorie]))).toEqual({ A: 'ventes', B: 'prestations' });
});

test('le registre des achats s’importe aussi, et « Importer un autre fichier » recommence', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'ventes' });
  await ouvrir(page, 'import');
  await page.locator('[data-registre="achats"]').click();
  await expect(page.locator('[data-registre="achats"]')).toHaveAttribute('aria-pressed', 'true');
  const carte = await deposer(page, csv(['Date;Fournisseur;Montant;Référence', `03/03/${annee};Grossiste;64,20;FA-9`]));
  await expect(carte.locator('#i-col-1')).toHaveValue('fournisseur');
  await expect(carte.locator('#i-col-3')).toHaveValue('referenceFacture');
  await carte.locator('#i-analyser').click();
  await expect(carte.locator('.points-import')).toContainText('1 achat prêt à importer');
  await carte.locator('#i-importer').click();
  await expect(carte.locator('.reussite-import h2')).toHaveText('1 achat importé');
  const { achats } = await lister(request, '/api/achats');
  expect(achats[0]).toMatchObject({ fournisseur: 'Grossiste', montant: 64.2, referenceFacture: 'FA-9' });
  await carte.locator('[data-etape="1"]').click();
  await expect(carte.locator('#depot')).toBeVisible();
});

test('un mode de règlement personnalisé est reconnu à son nom', async ({ page, request }) => {
  const { modesPersonnalises: [lydia] } = await configurer(request, { modesPersonnalises: [{ code: '', libelle: 'Lydia' }] });
  await ouvrir(page, 'import');
  const carte = await deposer(page, csv(['Date;Client;Montant;Mode', `04/04/${annee};Ami;15;lydia`]));
  await carte.locator('#i-analyser').click();
  await carte.locator('#i-importer').click();
  await expect(carte.locator('.reussite-import')).toBeVisible();
  expect((await lister(request, '/api/recettes')).recettes[0].modeReglement).toBe(lydia.code);
});
