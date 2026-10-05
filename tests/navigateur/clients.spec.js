/**
 * Le carnet de clients : liste et ses tris, recherche, fiche et ses
 * encaissements, ajout (par SIRET ou par le nom), modification qui renomme
 * les recettes, retrait annulable.
 */

import {
  test, expect, configurer, ajouterRecette, ajouterClient, joindre, ouvrir, euros, eurosEntiers, dansJours,
  ANNUAIRE, lister
} from './outils.js';

test('carnet vide : de quoi commencer', async ({ page, request }) => {
  await configurer(request);
  await ouvrir(page, 'clients');
  await expect(page.locator('#resume-clients')).toHaveText('Votre carnet de clients.');
  await expect(page.locator('#liste-clients .vide')).toContainText('Votre carnet est vide');
  await expect(page.locator('#fiche')).toContainText('Le premier client ajouté s’affichera ici');
});

test('la liste, classée par chiffre d’affaires, par nom ou par récence', async ({ page, request }) => {
  await configurer(request);
  await ajouterClient(request, { nom: 'Zénith', siret: ANNUAIRE.lumen.siret });
  await ajouterClient(request, { nom: 'Alpha' });
  await ajouterClient(request, { nom: 'Milieu' });
  await ajouterRecette(request, { client: 'Alpha', montant: 100, dateEncaissement: dansJours(-30) });
  await ajouterRecette(request, { client: 'Zénith', montant: 900, dateEncaissement: dansJours(-60) });
  await ajouterRecette(request, { client: 'Milieu', montant: 300, dateEncaissement: dansJours(-1) });
  await ouvrir(page, 'clients');
  await expect(page.locator('#resume-clients')).toHaveText('3 clients·1 avec SIRET');
  const noms = page.locator('#liste-clients .client-ligne .nom');
  await expect(noms).toHaveText(['Zénith', 'Milieu', 'Alpha']);
  // Le plus gros client est montré d'emblée.
  await expect(page.locator('#titre-fiche')).toHaveText('Zénith');
  await expect(page.locator('#liste-clients .client-ligne').first().locator('.ca')).toContainText(eurosEntiers(900));
  await page.locator('[data-ordre="nom"]').click();
  await expect(noms).toHaveText(['Alpha', 'Milieu', 'Zénith']);
  await page.locator('[data-ordre="recent"]').click();
  await expect(noms).toHaveText(['Milieu', 'Alpha', 'Zénith']);
  // La recherche porte sur le nom et le SIRET, sans accents.
  await page.locator('#c-filtre').fill('zenith');
  await expect(noms).toHaveText(['Zénith']);
  await page.locator('#c-filtre').fill(ANNUAIRE.lumen.siret.slice(0, 6));
  await expect(noms).toHaveText(['Zénith']);
  await page.locator('#c-filtre').fill('personne');
  await expect(page.locator('#liste-clients .vide')).toHaveText('Aucun client ne correspond.');
});

test('la fiche d’un client : ses encaissements, son total, ses factures jointes', async ({ page, request }) => {
  await configurer(request);
  await ajouterClient(request, { nom: 'Cabinet Roux' });
  const r = await ajouterRecette(request, { client: 'cabinet roux', libelle: 'Audit', numeroFacture: 'F-77', montant: 1500, dateEncaissement: dansJours(-2) });
  await ajouterRecette(request, { client: 'Cabinet Roux', libelle: 'Suivi', montant: 250, dateEncaissement: dansJours(-40) });
  await joindre(request, 'recettes', r.id, 'audit.pdf');
  await ouvrir(page, 'clients');
  const fiche = page.locator('#fiche');
  await expect(fiche.locator('#titre-fiche')).toHaveText('Cabinet Roux');
  await expect(fiche.locator('.fiche-chiffres')).toContainText(euros(1750));
  await expect(fiche.locator('tbody tr')).toHaveCount(2);
  await expect(fiche.locator('tfoot')).toContainText('2 encaissements');
  await fiche.locator('[data-piece]').click();
  await expect(page.locator('dialog.panneau[open] #titre-piece')).toHaveText('audit.pdf');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.panneau')).toHaveCount(0);
});

test('ajouter un client par son SIRET, retrouvé dans l’annuaire', async ({ page, request }) => {
  await configurer(request);
  await ouvrir(page, 'clients');
  await page.locator('#nouveau-client').click();
  const form = page.locator('#form-client');
  await expect(form.locator('#c-recherche')).toBeFocused();
  await form.locator('#c-recherche').fill('123');
  await form.locator('#c-chercher').click();
  await expect(form.locator('#c-resultat')).toContainText('Un SIRET compte 14 chiffres');
  await form.locator('#c-recherche').fill(ANNUAIRE.boulangerie.siret);
  await form.locator('#c-recherche').press('Enter');
  await expect(form.locator('#c-resultat')).toContainText(`Trouvé : ${ANNUAIRE.boulangerie.nom}`);
  await expect(form.locator('#c-nom')).toHaveValue(ANNUAIRE.boulangerie.nom);
  await expect(form.locator('#c-siret')).toHaveValue(ANNUAIRE.boulangerie.siret);
  await form.locator('[type="submit"]').click();
  await expect(page.locator('#fiche .bandeau-retour')).toContainText('Client ajouté au carnet');
  await expect(page.locator('#titre-fiche')).toHaveText(ANNUAIRE.boulangerie.nom);
  const { clients } = await lister(request, '/api/clients');
  expect(clients).toEqual([expect.objectContaining({ nom: ANNUAIRE.boulangerie.nom, siret: ANNUAIRE.boulangerie.siret })]);
});

test('un SIRET à la clé fausse ou inconnu de l’annuaire est dit', async ({ page, request }) => {
  await configurer(request);
  await ouvrir(page, 'clients');
  await page.locator('#nouveau-client').click();
  const form = page.locator('#form-client');
  const faux = `${ANNUAIRE.lumen.siret.slice(0, 13)}${(Number(ANNUAIRE.lumen.siret[13]) + 1) % 10}`;
  await form.locator('#c-recherche').fill(faux);
  await form.locator('#c-chercher').click();
  await expect(form.locator('#c-resultat')).toContainText('clé de contrôle incorrecte');
});

test('ajouter par le nom ; un doublon et un SIRET invalide sont refusés', async ({ page, request }) => {
  await configurer(request);
  await ajouterClient(request, { nom: 'Déjà Là' });
  await ouvrir(page, 'clients');
  await page.locator('#nouveau-client').click();
  const form = page.locator('#form-client');
  await form.locator('#c-nom').fill('deja la');
  await form.locator('[type="submit"]').click();
  await expect(form.locator('[data-champ="nom"] .erreur-champ')).toContainText('existe déjà');
  await form.locator('#c-nom').fill('Nouveau Venu');
  await form.locator('#c-siret').fill('12345678901234');
  await form.locator('[type="submit"]').click();
  await expect(form.locator('[data-champ="siret"]')).toHaveClass(/invalide/);
  await form.locator('#c-siret').fill('');
  await form.locator('[type="submit"]').click();
  await expect(page.locator('#titre-fiche')).toHaveText('Nouveau Venu');
  await expect(page.locator('#liste-clients .client-ligne[aria-pressed="true"]')).toHaveClass(/nouvelle/);
});

test('« Annuler » referme le formulaire sans rien changer', async ({ page, request }) => {
  await configurer(request);
  await ajouterClient(request, { nom: 'Stable' });
  await ouvrir(page, 'clients');
  await page.locator('#nouveau-client').click();
  await page.locator('#c-nom').fill('Abandonné');
  await page.locator('#c-annuler').click();
  await expect(page.locator('#titre-fiche')).toHaveText('Stable');
  expect((await lister(request, '/api/clients')).clients).toHaveLength(1);
});

test('renommer un client renomme aussi ses recettes', async ({ page, request }) => {
  await configurer(request);
  await ajouterClient(request, { nom: 'Ancien Nom' });
  await ajouterRecette(request, { client: 'Ancien Nom' });
  await ajouterRecette(request, { client: 'ancien nom' });
  await ouvrir(page, 'clients');
  await page.locator('#modifier-client').click();
  const form = page.locator('#form-client');
  await expect(form.locator('#c-nom')).toHaveValue('Ancien Nom');
  await expect(form.locator('#c-recherche')).toHaveCount(0);
  await form.locator('#c-nom').fill('Nouveau Nom');
  await form.locator('[type="submit"]').click();
  await expect(page.locator('#fiche .bandeau-retour')).toContainText('Client modifié, 2 recettes renommées');
  const { recettes } = await lister(request, '/api/recettes');
  expect(recettes.map((r) => r.client)).toEqual(['Nouveau Nom', 'Nouveau Nom']);
});

test('retirer un client du carnet garde ses recettes, et s’annule', async ({ page, request }) => {
  await configurer(request);
  await ajouterClient(request, { nom: 'À Retirer', siret: ANNUAIRE.atelier.siret });
  await ajouterRecette(request, { client: 'À Retirer' });
  await ouvrir(page, 'clients');
  await page.locator('#supprimer-client').click();
  await expect(page.locator('#liste-clients .bandeau-retour')).toContainText('À Retirer retiré du carnet, ses recettes sont conservées');
  expect((await lister(request, '/api/clients')).clients).toHaveLength(0);
  expect((await lister(request, '/api/recettes')).recettes).toHaveLength(1);
  await page.locator('#liste-clients .bandeau-retour button').click();
  await expect(page.locator('#fiche .bandeau-retour')).toContainText('Client remis dans le carnet');
  const { clients } = await lister(request, '/api/clients');
  expect(clients).toEqual([expect.objectContaining({ nom: 'À Retirer', siret: ANNUAIRE.atelier.siret })]);
});

test('le client choisi est retenu d’une visite à l’autre', async ({ page, request }) => {
  await configurer(request);
  await ajouterClient(request, { nom: 'Premier' });
  await ajouterClient(request, { nom: 'Second' });
  await ouvrir(page, 'clients');
  await page.locator('#liste-clients .client-ligne', { hasText: 'Second' }).click();
  await expect(page.locator('#titre-fiche')).toHaveText('Second');
  await page.locator('#navigation .lien-nav[data-route="recettes"]').click();
  await page.locator('#navigation .lien-nav[data-route="clients"]').click();
  await expect(page.locator('#titre-fiche')).toHaveText('Second');
});
