/**
 * Le livre des recettes : saisie et ses aides, modification, suppression,
 * duplication, sélection et actions groupées, filtres, tri, pièces jointes,
 * numérotation des factures, et chaque geste annulable.
 */

import {
  test, expect, configurer, regler, ajouterRecette, joindre, ouvrir, attendrePage, panneau,
  euros, dateAffichee, aujourdhui, dansJours, dansMois, fichierPdf, ANNUAIRE, SIRET_INCONNU, lister, telecharger
} from './outils.js';

/** Ouvre le panneau d'une nouvelle recette et le rend. */
async function nouvelle(page) {
  await page.locator('#nouvelle-recette').click();
  const p = panneau(page);
  await expect(p.locator('#titre-panneau')).toHaveText('Nouvelle recette');
  return p;
}

const ligne = (page, id) => page.locator(`#registre tbody tr[data-id="${id}"]`);
const total = (page) => page.locator('#registre tfoot [data-total]');
const lignes = (page) => page.locator('#registre tbody tr[data-id]');

test.describe('saisie d’une recette', () => {
  test('livre vide : l’invitation ouvre la saisie, la recette s’ajoute avec son nouveau client', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    await expect(page.locator('#registre .ligne-vide')).toContainText('Aucune recette pour l’instant.');
    await page.locator('#registre [data-nouveau]').click();
    const p = panneau(page);
    await expect(p.locator('#f-date')).toHaveValue(dateAffichee(aujourdhui()));
    await expect(p.locator('#f-mode')).toHaveValue('virement');

    await p.locator('#f-client').fill('Durand Rénovation');
    await expect(p.locator('.suggestions .sugg.extra')).toContainText('Nouveau client « Durand Rénovation »');
    await p.locator('#f-libelle').fill('Site vitrine');
    await p.locator('#f-montant').fill('1200,5');
    await p.locator('#f-montant').blur();
    await expect(p.locator('#f-montant')).toHaveValue('1200,50');
    await p.locator('#f-facture').fill('F-001');
    await p.locator('[type="submit"]').click();

    await expect(page.locator('dialog.panneau')).toHaveCount(0);
    const { recettes } = await lister(request, '/api/recettes');
    expect(recettes).toHaveLength(1);
    expect(recettes[0]).toMatchObject({ client: 'Durand Rénovation', libelle: 'Site vitrine', montant: 1200.5, numeroFacture: 'F-001', modeReglement: 'virement', dateEncaissement: aujourdhui() });
    const tr = ligne(page, recettes[0].id);
    await expect(tr.locator('.texte-retour')).toHaveText('Ajoutée, nouveau client');
    await expect(tr.locator('td.montant')).toHaveText(euros(1200.5));
    await expect(total(page)).toHaveText(euros(1200.5));
    // Le client a rejoint le carnet.
    const { clients } = await lister(request, '/api/clients');
    expect(clients.map((c) => c.nom)).toEqual(['Durand Rénovation']);
  });

  test('les champs obligatoires et un montant illisible se signalent sur place', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    await p.locator('[type="submit"]').click();
    await expect(p.locator('[data-champ="client"] .erreur-champ')).toHaveText('Indiquez le client.');
    await expect(p.locator('#f-client')).toBeFocused();

    await p.locator('#f-client').fill('Martin');
    await p.locator('#f-montant').fill('douze');
    await p.locator('#f-montant').blur();
    await expect(p.locator('[data-champ="montant"] .erreur-champ')).toContainText('Montant non reconnu');
    await p.locator('[type="submit"]').click();
    await expect(p.locator('[data-champ="montant"]')).toHaveClass(/invalide/);
    // Une date illisible est dite sous le champ, et refusée à l'enregistrement.
    await p.locator('#f-montant').fill('15');
    await p.locator('#f-date').fill('31/02/2026');
    await p.locator('#f-date').blur();
    await expect(p.locator('#f-date-apercu')).toContainText('Date non reconnue');
    await p.locator('[type="submit"]').click();
    await expect(p.locator('[data-champ="dateEncaissement"]')).toHaveClass(/invalide/);
    expect((await lister(request, '/api/recettes')).recettes).toHaveLength(0);
  });

  test('le champ de date : + et −, A, saisie courte et calendrier', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    const date = p.locator('#f-date');
    const cache = p.locator('input[name="dateEncaissement"]');
    await date.click();
    await expect(p.locator('.calendrier')).toBeVisible();
    await date.press('+');
    await expect(cache).toHaveValue(dansJours(1));
    await date.press('-');
    await date.press('-');
    await expect(cache).toHaveValue(dansJours(-1));
    await date.press('a');
    await expect(cache).toHaveValue(aujourdhui());
    await date.fill('5/3');
    await expect(cache).toHaveValue(`${new Date().getFullYear()}-03-05`);
    await expect(p.locator('#f-date-apercu')).toContainText('5 mars');
    // Flèche bas : le calendrier, parcouru au clavier.
    await date.press('ArrowDown');
    await expect(p.locator('.calendrier [data-jour]:focus')).toHaveAttribute('data-jour', `${new Date().getFullYear()}-03-05`);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(cache).toHaveValue(`${new Date().getFullYear()}-03-06`);
    await expect(p.locator('.calendrier')).toBeHidden();
    // Échap ferme le calendrier, pas le panneau.
    await date.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(p.locator('.calendrier')).toBeHidden();
    await expect(p).toBeVisible();
    // Le bouton du calendrier, puis un jour choisi à la souris.
    await p.locator('.champ-date-bouton').click();
    await p.locator('.calendrier [data-mois="-1"]').click();
    await p.locator('.calendrier td [data-jour$="-15"]').click();
    await expect(cache).toHaveValue(/-15$/);
  });

  test('client connu : suggestions, dernier encaissement, mode de paiement et libellé repris', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { client: 'Boulangerie Martin', libelle: 'Affiches', montant: 320, modeReglement: 'cheque', dateEncaissement: dansJours(-10) });
    await ajouterRecette(request, { client: 'Autre client', libelle: 'Logo', montant: 500, modeReglement: 'especes', dateEncaissement: dansJours(-20) });
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    await p.locator('#f-client').click();
    // Au focus, les clients connus, le plus récent d'abord.
    await expect(p.locator('.suggestions .sugg').first()).toContainText('Boulangerie Martin');
    await p.locator('#f-client').fill('boul');
    await expect(p.locator('.suggestions .sugg mark').first()).toHaveText('Boul');
    await page.keyboard.press('Enter');
    await expect(p.locator('#f-client')).toHaveValue('Boulangerie Martin');
    await expect(p.locator('#f-client-aide')).toContainText(`Dernier encaissement le ${dateAffichee(dansJours(-10))} : Affiches`);
    await expect(p.locator('#f-mode')).toHaveValue('cheque');
    await expect(p.locator('#f-libelle')).toBeFocused();
    // Le libellé déjà facturé à ce client passe devant, avec son montant.
    await expect(p.locator('.suggestions:visible .sugg').first()).toContainText('Déjà facturé à ce client');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(p.locator('#f-libelle')).toHaveValue('Affiches');
    await expect(p.locator('#f-montant')).toHaveValue('320,00');
    await p.locator('[type="submit"]').click();
    // Un client déjà connu : pas de mention « nouveau client ».
    await expect(page.locator('.texte-retour').first()).toHaveText('Ajoutée');
  });

  test('un mode choisi à la main n’est plus remplacé par celui du client', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { client: 'Studio Lumen', modeReglement: 'cheque' });
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    await p.locator('#f-mode').selectOption('especes');
    await p.locator('#f-client').fill('Studio Lumen');
    await p.locator('#f-client').press('Tab');
    await expect(p.locator('#f-mode')).toHaveValue('especes');
  });

  test('un SIRET tapé à la place du nom retrouve l’entreprise dans l’annuaire', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    await p.locator('#f-client').fill(ANNUAIRE.lumen.siret);
    await expect(p.locator('.suggestions .sugg.extra')).toContainText('Rechercher le SIRET');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(p.locator('#f-client')).toHaveValue(ANNUAIRE.lumen.nom);
    await expect(p.locator('#f-client-aide')).toContainText(`${ANNUAIRE.lumen.nom} : sera ajouté à vos clients`);
    await p.locator('#f-montant').fill('90');
    await p.locator('[type="submit"]').click();
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
    const { clients } = await lister(request, '/api/clients');
    expect(clients).toEqual([expect.objectContaining({ nom: ANNUAIRE.lumen.nom, siret: ANNUAIRE.lumen.siret })]);
  });

  test('un SIRET enregistré tel quel est résolu, un SIRET inconnu est refusé avec une explication', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    await p.locator('#f-client').fill(SIRET_INCONNU);
    await p.locator('#f-montant').fill('90');
    await p.locator('[type="submit"]').click();
    await expect(p.locator('[data-champ="client"] .erreur-champ')).toContainText(`Nom introuvable pour « ${SIRET_INCONNU} »`);
    await p.locator('#f-client').fill(ANNUAIRE.atelier.siren);
    await p.locator('[type="submit"]').click();
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
    const { recettes } = await lister(request, '/api/recettes');
    expect(recettes[0].client).toBe(ANNUAIRE.atelier.nom);
  });

  test('le numéro de facture suivant est proposé', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { numeroFacture: 'F2026-007' });
    await ajouterRecette(request, { numeroFacture: 'F2026-008' });
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    const suggestion = p.locator('#f-suggestion-facture');
    await expect(suggestion).toHaveText('Utiliser F2026-009, le numéro suivant');
    await suggestion.click();
    await expect(p.locator('#f-facture')).toHaveValue('F2026-009');
    await expect(suggestion).toBeHidden();
    await p.locator('#f-facture').fill('');
    await expect(suggestion).toBeVisible();
  });

  test('une recette très similaire avertit, puis s’enregistre quand même', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { client: 'Durand', montant: 150, numeroFacture: 'F-1' });
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    await p.locator('#f-client').fill('Durand');
    await p.locator('#f-montant').fill('150');
    await p.locator('[type="submit"]').click();
    await expect(p.locator('#f-similaire')).toContainText('Une recette très similaire existe déjà');
    await expect(p.locator('#f-similaire')).toContainText('facture F-1');
    await expect(p.locator('[type="submit"]')).toHaveText(/Enregistrer quand même/);
    // Changer la saisie rouvre la question au lieu de passer en silence.
    await p.locator('#f-libelle').fill('Autre chose');
    await p.locator('[type="submit"]').click();
    await page.waitForTimeout(400);
    await expect(p.locator('[type="submit"]')).toHaveText(/Enregistrer quand même/);
    expect((await lister(request, '/api/recettes')).recettes).toHaveLength(1);
    await p.locator('[type="submit"]').click();
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
    expect((await lister(request, '/api/recettes')).recettes).toHaveLength(2);
  });

  test('l’avertissement des recettes similaires se coupe dans les options', async ({ page, request }) => {
    await configurer(request, { alerteRecetteSimilaire: false });
    await ajouterRecette(request, { client: 'Durand', montant: 150 });
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    await p.locator('#f-client').fill('Durand');
    await p.locator('#f-montant').fill('150');
    await p.locator('[type="submit"]').click();
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
  });

  test('Ctrl+Entrée ajoute et garde le panneau ouvert, à la même date et au même paiement', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    await p.locator('#f-date').fill(dateAffichee(dansJours(-3)));
    await p.locator('#f-mode').selectOption('carte');
    await p.locator('#f-client').fill('Premier');
    await p.locator('#f-montant').fill('10');
    await p.locator('#f-montant').press('Control+Enter');
    await expect(p.locator('#f-client')).toHaveValue('');
    await expect(p.locator('#f-client')).toBeFocused();
    await expect(p.locator('#f-montant')).toHaveValue('');
    await expect(p.locator('input[name="dateEncaissement"]')).toHaveValue(dansJours(-3));
    await expect(p.locator('#f-mode')).toHaveValue('carte');
    // Le lien du pied fait de même.
    await p.locator('#f-client').fill('Deuxième');
    await p.locator('#f-montant').fill('20');
    await p.locator('[data-enchainer]').click();
    await expect(p.locator('#f-client')).toHaveValue('');
    await p.locator('#f-client').fill('Troisième');
    await p.locator('#f-montant').fill('30');
    await p.locator('[type="submit"]').click();
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
    const { recettes } = await lister(request, '/api/recettes');
    expect(recettes.map((r) => r.client).sort()).toEqual(['Deuxième', 'Premier', 'Troisième']);
    expect(new Set(recettes.map((r) => r.dateEncaissement))).toEqual(new Set([dansJours(-3)]));
    expect(new Set(recettes.map((r) => r.modeReglement))).toEqual(new Set(['carte']));
    await expect(lignes(page)).toHaveCount(3);
  });

  test('abandonner une saisie commencée demande confirmation', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    // Panneau intact : il se ferme sans rien demander.
    await nouvelle(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.panneau')).toHaveCount(0);

    const p = await nouvelle(page);
    await p.locator('#f-client').fill('Brouillon');
    // Échap ferme d'abord les suggestions du champ, puis le panneau.
    await page.keyboard.press('Escape');
    await expect(p.locator('.suggestions:visible')).toHaveCount(0);
    await expect(page.locator('dialog.boite')).toHaveCount(0);
    await page.keyboard.press('Escape');
    const boite = page.locator('dialog.boite');
    await expect(boite).toContainText('Abandonner cette saisie ?');
    await boite.locator('[data-role="annuler"]').click();
    await expect(p.locator('#f-client')).toHaveValue('Brouillon');
    await p.locator('.panneau-pied [data-fermer]').click();
    await boite.locator('[data-role="ok"]').click();
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
    expect((await lister(request, '/api/recettes')).recettes).toHaveLength(0);
  });

  test('un clic sur le voile ferme le panneau', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    await nouvelle(page);
    await page.mouse.click(100, 450);
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
  });

  test('depuis le tableau de bord, « Nouvelle recette » ouvre le panneau', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page);
    await page.locator('.entete-page a.btn-principal', { hasText: 'Nouvelle recette' }).click();
    await expect(panneau(page).locator('#titre-panneau')).toHaveText('Nouvelle recette');
  });
});

test.describe('modifier, dupliquer, supprimer', () => {
  test('un clic sur la ligne la modifie ; « Annuler » sur la ligne défait la modification', async ({ page, request }) => {
    await configurer(request);
    const r = await ajouterRecette(request, { client: 'Durand', libelle: 'Maquette', montant: 400 });
    await ouvrir(page, 'recettes');
    await ligne(page, r.id).locator('td.client').click();
    const p = panneau(page);
    await expect(p.locator('#titre-panneau')).toHaveText('Modifier la recette');
    await expect(p.locator('#f-montant')).toBeFocused();
    await expect(p.locator('#f-montant')).toHaveValue('400,00');
    await expect(p.locator('[data-enchainer]')).toHaveCount(0);
    await p.locator('#f-montant').fill('450');
    await p.locator('[type="submit"]').click();
    await expect(ligne(page, r.id).locator('.texte-retour')).toHaveText('Modifiée');
    await expect(ligne(page, r.id).locator('td.montant')).toHaveText(euros(450));
    await ligne(page, r.id).locator('[data-annuler-retour]').click();
    await expect(ligne(page, r.id).locator('.texte-retour')).toHaveText('Modification annulée');
    await expect(ligne(page, r.id).locator('td.montant')).toHaveText(euros(400));
    expect((await lister(request, '/api/recettes')).recettes[0].montant).toBe(400);
  });

  test('« Annuler » sur une recette ajoutée la retire', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    await p.locator('#f-client').fill('Éphémère');
    await p.locator('#f-montant').fill('5');
    await p.locator('[type="submit"]').click();
    await page.locator('[data-annuler-retour]').click();
    await expect(lignes(page)).toHaveCount(0);
    expect((await lister(request, '/api/recettes')).recettes).toHaveLength(0);
  });

  test('le menu « … » duplique une recette, datée d’aujourd’hui, sans facture', async ({ page, request }) => {
    await configurer(request);
    const r = await ajouterRecette(request, { client: 'Abonné', libelle: 'Maintenance', montant: 60, numeroFacture: 'F-9', modeReglement: 'carte', dateEncaissement: dansMois(-1) });
    await ouvrir(page, 'recettes');
    await ligne(page, r.id).locator('[data-action="menu"]').click();
    const menu = page.locator('.menu-contextuel');
    await expect(menu.locator('[role="menuitem"]')).toHaveText(['Modifier', 'Dupliquer (paiement récurrent)', 'Joindre la facture (PDF)', 'Supprimer']);
    await menu.locator('[role="menuitem"]', { hasText: 'Dupliquer' }).click();
    const p = panneau(page);
    await expect(p.locator('.panneau-tete p')).toHaveText('Copie d’un paiement récurrent, datée d’aujourd’hui.');
    await expect(p.locator('#f-client')).toHaveValue('Abonné');
    await expect(p.locator('#f-libelle')).toHaveValue('Maintenance');
    await expect(p.locator('#f-montant')).toHaveValue('60,00');
    await expect(p.locator('#f-mode')).toHaveValue('carte');
    await expect(p.locator('#f-facture')).toHaveValue('');
    await expect(p.locator('input[name="dateEncaissement"]')).toHaveValue(aujourdhui());
    await p.locator('[type="submit"]').click();
    expect((await lister(request, '/api/recettes')).recettes).toHaveLength(2);
  });

  test('le menu se parcourt au clavier et se referme à Échap', async ({ page, request }) => {
    await configurer(request);
    const r = await ajouterRecette(request);
    await ouvrir(page, 'recettes');
    const bouton = ligne(page, r.id).locator('[data-action="menu"]');
    await bouton.focus();
    await page.keyboard.press('Enter');
    await expect(bouton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.menu-contextuel [role="menuitem"]').first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.menu-contextuel [role="menuitem"]', { hasText: 'Supprimer' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-contextuel')).toHaveCount(0);
    await expect(bouton).toBeFocused();
    await expect(bouton).toHaveAttribute('aria-expanded', 'false');
  });

  test('une suppression laisse sa place, avec « Annuler » qui remet la recette telle quelle', async ({ page, request }) => {
    await configurer(request);
    const r = await ajouterRecette(request, { client: 'Durand', montant: 75 });
    await joindre(request, 'recettes', r.id, 'facture-durand.pdf');
    await ouvrir(page, 'recettes');
    await ligne(page, r.id).locator('[data-action="menu"]').click();
    await page.locator('.menu-contextuel [role="menuitem"]', { hasText: 'Supprimer' }).click();
    const place = page.locator('tr.place-retiree');
    await expect(place).toContainText(`Recette de ${euros(75)} (Durand) supprimée`.replace(/\s/g, ' '));
    expect((await lister(request, '/api/recettes')).recettes).toHaveLength(0);
    await expect(total(page)).toHaveCount(0);
    await place.locator('[data-restaurer-place]').click();
    await expect(ligne(page, r.id).locator('.texte-retour')).toHaveText('Restaurée');
    const [remise] = (await lister(request, '/api/recettes')).recettes;
    expect(remise.id).toBe(r.id);
    expect(remise.pieceJointe?.nom).toBe('facture-durand.pdf');
  });
});

test.describe('sélection et actions groupées', () => {
  test('cocher des lignes, les supprimer en une fois, puis annuler depuis la barre', async ({ page, request }) => {
    await configurer(request);
    const a = await ajouterRecette(request, { client: 'A', montant: 10 });
    const b = await ajouterRecette(request, { client: 'B', montant: 20 });
    await ajouterRecette(request, { client: 'C', montant: 30 });
    await ouvrir(page, 'recettes');
    await ligne(page, a.id).locator('[data-cocher]').check();
    await ligne(page, b.id).locator('[data-cocher]').check();
    const barre = page.locator('#barre-selection');
    await expect(barre).toBeVisible();
    await expect(barre.locator('.compte')).toHaveText(`2 recettes sélectionnées · ${euros(30)}`.replace(/\s/g, ' '));
    await expect(page.locator('#tout-selectionner')).toHaveJSProperty('indeterminate', true);
    await barre.locator('[data-lot="supprimer"]').click();
    await expect(barre.locator('.compte')).toHaveText('2 recettes supprimées');
    await expect(lignes(page)).toHaveCount(1);
    await barre.locator('[data-lot="annuler"]').click();
    await expect(lignes(page)).toHaveCount(3);
    expect((await lister(request, '/api/recettes')).recettes).toHaveLength(3);
  });

  test('tout sélectionner, puis tout désélectionner', async ({ page, request }) => {
    await configurer(request);
    for (const client of ['A', 'B', 'C']) await ajouterRecette(request, { client });
    await ouvrir(page, 'recettes');
    await page.locator('#tout-selectionner').check();
    await expect(page.locator('#barre-selection .compte')).toContainText('3 recettes sélectionnées');
    await expect(page.locator('#registre tbody tr.choisie')).toHaveCount(3);
    await page.locator('#barre-selection [data-lot="fermer"]').click();
    await expect(page.locator('#barre-selection')).toBeHidden();
    await expect(page.locator('#registre tbody tr.choisie')).toHaveCount(0);
  });

  test('activité mixte : reclasser un lot en ventes, et l’annuler', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'mixte' });
    const a = await ajouterRecette(request, { client: 'A', categorie: 'prestations' });
    const b = await ajouterRecette(request, { client: 'B', categorie: 'prestations' });
    await ouvrir(page, 'recettes');
    await page.locator('#tout-selectionner').check();
    await page.locator('#barre-selection [data-lot="ventes"]').click();
    await expect(page.locator('#barre-selection .compte')).toHaveText('2 recettes classées en ventes');
    await expect(ligne(page, a.id).locator('.categorie')).toHaveText('Vente');
    let { recettes } = await lister(request, '/api/recettes');
    expect(recettes.map((r) => r.categorie)).toEqual(['ventes', 'ventes']);
    await page.locator('#barre-selection [data-lot="annuler"]').click();
    await expect(ligne(page, b.id).locator('.categorie')).toHaveText('Prestation');
    ({ recettes } = await lister(request, '/api/recettes'));
    expect(recettes.map((r) => r.categorie)).toEqual(['prestations', 'prestations']);
  });

  test('activité mixte : la catégorie se choisit à la saisie, la dernière est reprise', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'mixte' });
    await ajouterRecette(request, { client: 'A', categorie: 'ventes' });
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    await expect(p.locator('[data-categorie="ventes"]')).toHaveAttribute('aria-pressed', 'true');
    await p.locator('[data-categorie="prestations"]').click();
    await expect(p.locator('[data-categorie="prestations"]')).toHaveAttribute('aria-pressed', 'true');
    await p.locator('#f-client').fill('B');
    await p.locator('#f-montant').fill('12');
    await p.locator('[type="submit"]').click();
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
    const { recettes } = await lister(request, '/api/recettes');
    expect(recettes.find((r) => r.client === 'B').categorie).toBe('prestations');
    await expect(page.locator('#registre thead')).toContainText('Catégorie');
  });
});

test.describe('filtres, recherche et tri', () => {
  async function preparer(request) {
    await configurer(request);
    const annee = new Date().getFullYear();
    const r1 = await ajouterRecette(request, { client: 'Dupré', libelle: 'Logo', montant: 100, modeReglement: 'cheque', dateEncaissement: `${annee}-01-15` });
    const r2 = await ajouterRecette(request, { client: 'Martin', libelle: 'Site', montant: 300, modeReglement: 'virement', dateEncaissement: `${annee}-02-10` });
    const r3 = await ajouterRecette(request, { client: 'Zola', libelle: 'Affiche', montant: 50, modeReglement: 'virement', dateEncaissement: `${annee - 1}-12-20` });
    await joindre(request, 'recettes', r2.id);
    return { annee, r1, r2, r3 };
  }

  test('la recherche filtre sans tenir compte des accents, surligne, et se dit partielle', async ({ page, request }) => {
    const { r1 } = await preparer(request);
    await ouvrir(page, 'recettes');
    await page.locator('#filtre-q').fill('dupre');
    await expect(lignes(page)).toHaveCount(1);
    await expect(ligne(page, r1.id).locator('mark')).toHaveText('Dupré');
    await expect(page.locator('.resume-registre')).toContainText('1 recette sur 3');
    await expect(page.locator('#registre tfoot')).toContainText('Total des lignes filtrées');
    await expect(total(page)).toHaveText(euros(100));
    // Un montant se cherche aussi.
    await page.locator('#filtre-q').fill('300');
    await expect(lignes(page)).toHaveCount(1);
    await page.locator('#filtre-q').fill('aucune chance');
    await expect(page.locator('#registre .ligne-vide')).toContainText('Aucune ligne ne correspond à ces filtres.');
    await page.locator('#registre .ligne-vide [data-effacer-filtres]').click();
    await expect(lignes(page)).toHaveCount(3);
    await expect(page.locator('#filtre-q')).toHaveValue('');
  });

  test('l’année se choisit aux flèches ou dans la liste', async ({ page, request }) => {
    const { annee } = await preparer(request);
    await ouvrir(page, 'recettes');
    const choix = page.locator('#annee-recettes');
    await expect(choix.locator('.annee-choisie')).toHaveText('Toutes');
    await expect(choix.locator('[data-pas="1"]')).toHaveAttribute('aria-disabled', 'true');
    await choix.locator('[data-pas="-1"]').click();
    await expect(choix.locator('.annee-choisie')).toHaveText(String(annee));
    await expect(lignes(page)).toHaveCount(2);
    await choix.locator('[data-pas="-1"]').click();
    await expect(choix.locator('.annee-choisie')).toHaveText(String(annee - 1));
    await expect(lignes(page)).toHaveCount(1);
    await expect(choix.locator('[data-pas="-1"]')).toHaveAttribute('aria-disabled', 'true');
    await choix.locator('.annee-choisie').click();
    const menu = page.locator('.menu-contextuel.menu-choix');
    await expect(menu.locator('[role="menuitemradio"]')).toHaveText(['Toutes', String(annee), String(annee - 1)]);
    await expect(menu.locator('[aria-checked="true"]')).toHaveText(String(annee - 1));
    await menu.locator('[role="menuitemradio"]', { hasText: 'Toutes' }).click();
    await expect(lignes(page)).toHaveCount(3);
    await expect(choix.locator('.annee-choisie')).toBeFocused();
  });

  test('les filtres du panneau : mois, paiement, PDF joint, avec leurs pastilles', async ({ page, request }) => {
    const { r1, r2 } = await preparer(request);
    await ouvrir(page, 'recettes');
    await page.locator('.btn-filtres').click();
    const filtres = page.locator('#filtres-recettes');
    await expect(filtres).toBeVisible();
    await filtres.locator('#filtre-mode').selectOption('virement');
    await expect(lignes(page)).toHaveCount(2);
    await filtres.locator('#filtre-piece [data-valeur="avec"]').click();
    await expect(lignes(page)).toHaveCount(1);
    await expect(ligne(page, r2.id)).toBeVisible();
    await expect(page.locator('.compte-filtres')).toHaveText('2');
    await page.keyboard.press('Escape');
    await expect(filtres).toBeHidden();
    const pastilles = page.locator('.filtres-actifs .pastille-filtre');
    await expect(pastilles).toHaveText(['Virement', 'Avec PDF joint']);
    await pastilles.filter({ hasText: 'Virement' }).click();
    await expect(page.locator('.btn-filtres')).toBeFocused();
    await expect(lignes(page)).toHaveCount(1);
    await page.locator('.btn-filtres').click();
    await filtres.locator('[data-vider-panneau]').click();
    await expect(lignes(page)).toHaveCount(3);
    await expect(pastilles).toHaveCount(0);
    // Le mois.
    await page.locator('.btn-filtres').click();
    await filtres.locator('#filtre-mois').selectOption('1');
    await expect(lignes(page)).toHaveCount(1);
    await expect(ligne(page, r1.id)).toBeVisible();
  });

  test('activité mixte : le filtre de catégorie, recettes non classées comprises', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'mixte' });
    await ajouterRecette(request, { client: 'Vente', categorie: 'ventes' });
    await ajouterRecette(request, { client: 'Prestation', categorie: 'prestations' });
    await ajouterRecette(request, { client: 'Sans', categorie: '' });
    await ouvrir(page, 'recettes');
    await page.locator('.btn-filtres').click();
    const groupe = page.locator('#filtre-categorie');
    await groupe.locator('[data-valeur="ventes"]').click();
    await expect(lignes(page)).toHaveCount(1);
    await expect(page.locator('#registre td.client')).toHaveText('Vente');
    await groupe.locator('[data-valeur="aucune"]').click();
    await expect(page.locator('#registre td.client')).toHaveText('Sans');
    await expect(page.locator('#registre td .attenue', { hasText: 'Non catégorisée' })).toBeVisible();
    await expect(page.locator('.filtres-actifs .pastille-filtre')).toHaveText('Non catégorisées');
    await groupe.locator('[data-valeur=""]').click();
    await expect(lignes(page)).toHaveCount(3);
  });

  test('« recettes sans PDF » filtre d’un clic', async ({ page, request }) => {
    await preparer(request);
    await ouvrir(page, 'recettes');
    await page.locator('[data-voir-sans-piece]').click();
    await expect(lignes(page)).toHaveCount(2);
    await expect(page.locator('.filtres-actifs .pastille-filtre')).toHaveText('Sans PDF joint');
  });

  test('les filtres sont gardés d’une visite à l’autre, et l’export reprend la période filtrée', async ({ page, request }) => {
    const { annee } = await preparer(request);
    await ouvrir(page, 'recettes');
    await page.locator('#annee-recettes [data-pas="-1"]').click();
    await page.locator('.btn-filtres').click();
    await page.locator('#filtre-mois').selectOption('2');
    await expect(page.locator('#lien-exporter')).toHaveAttribute('href', `#/exports?registre=recettes&annee=${annee}&mois=2`);
    await page.keyboard.press('Escape');
    await page.locator('#navigation .lien-nav[data-route="clients"]').click();
    await attendrePage(page);
    await page.locator('#navigation .lien-nav[data-route="recettes"]').click();
    await attendrePage(page);
    await expect(page.locator('#annee-recettes .annee-choisie')).toHaveText(String(annee));
    await expect(lignes(page)).toHaveCount(1);
    await page.locator('#lien-exporter').click();
    await attendrePage(page);
    await expect(page.locator('#carte-recettes')).toHaveClass(/mise-en-avant/);
    await expect(page.locator('#recettes-annee .annee-choisie')).toHaveText(String(annee));
    await expect(page.locator('#recettes-mois')).toHaveValue('2');
  });

  test('le tri par colonne, et les mois séparés avec leur sous-total quand on trie par date', async ({ page, request }) => {
    const { r1, r2, r3, annee } = await preparer(request);
    await ouvrir(page, 'recettes');
    const ids = async () => lignes(page).evaluateAll((trs) => trs.map((tr) => tr.dataset.id));
    expect(await ids()).toEqual([r2.id, r1.id, r3.id]);
    await expect(page.locator('tr.separateur-mois')).toHaveCount(3);
    await expect(page.locator(`tr.separateur-mois[data-mois="${annee}-02"]`)).toContainText(`Février ${annee}`);
    await expect(page.locator(`tr.separateur-mois[data-mois="${annee}-02"] .montant`)).toHaveText(euros(300));

    const enteteClient = page.locator('th[data-tri="client"]');
    await enteteClient.locator('button').click();
    await expect(enteteClient).toHaveAttribute('aria-sort', 'ascending');
    await expect.poll(ids).toEqual([r1.id, r2.id, r3.id]);
    await expect(page.locator('tr.separateur-mois')).toHaveCount(0);
    await enteteClient.locator('button').click();
    await expect(enteteClient).toHaveAttribute('aria-sort', 'descending');
    await expect.poll(ids).toEqual([r3.id, r2.id, r1.id]);
    await page.locator('th[data-tri="montant"] button').click();
    await expect(page.locator('th[data-tri="montant"]')).toHaveAttribute('aria-sort', 'descending');
    await expect.poll(ids).toEqual([r2.id, r1.id, r3.id]);
  });

  test('au-delà de 200 lignes, l’affichage se fait en deux temps', async ({ page, request }) => {
    await configurer(request);
    const lignesImport = Array.from({ length: 203 }, (_, i) => ({
      dateEncaissement: dansJours(-(i % 300)), client: `Client ${i}`, libelle: '', numeroFacture: '', montant: i + 1, modeReglement: 'virement', categorie: ''
    }));
    const reponse = await request.post('/api/recettes/import', { data: { lignes: lignesImport } });
    expect(reponse.ok()).toBe(true);
    await ouvrir(page, 'recettes');
    await expect(lignes(page)).toHaveCount(200);
    await expect(page.locator('[data-action="afficher-plus"]')).toHaveText('Afficher les 3 recettes restantes');
    await page.locator('[data-action="afficher-plus"]').click();
    await expect(lignes(page)).toHaveCount(203);
    // « Tout sélectionner » ne prend que les lignes affichées, et le dit.
    await page.locator('#filtre-q').fill('Client');
    await expect(lignes(page)).toHaveCount(200);
    await page.locator('#tout-selectionner').check();
    await expect(page.locator('#barre-selection .note-selection')).toHaveText('3 autres non affichées, hors du lot');
  });

  test('arriver avec « voir » retire les filtres qui cacheraient la recette et la met en avant', async ({ page, request }) => {
    const { r3, annee } = await preparer(request);
    await ouvrir(page, 'recettes');
    await page.locator('#filtre-q').fill('Martin');
    await expect(lignes(page)).toHaveCount(1);
    await page.goto(`/#/recettes?voir=${r3.id}`);
    await attendrePage(page);
    await expect(ligne(page, r3.id)).toBeVisible();
    await expect(ligne(page, r3.id)).toHaveClass(/nouvelle/);
    await expect(page.locator('#filtre-q')).toHaveValue('');
    await expect(page.locator('#annee-recettes .annee-choisie')).toHaveText(String(annee - 1));
  });
});

test.describe('pièces jointes', () => {
  test('joindre un PDF depuis la ligne, le voir, le retirer, puis annuler le retrait', async ({ page, request }) => {
    await configurer(request);
    const r = await ajouterRecette(request, { client: 'Durand', montant: 90 });
    await ouvrir(page, 'recettes');
    const choix = page.waitForEvent('filechooser');
    await ligne(page, r.id).locator('[data-action="joindre"]').click();
    await (await choix).setFiles(fichierPdf('facture-90.pdf'));
    await expect(ligne(page, r.id).locator('.texte-retour')).toHaveText('PDF joint');
    await expect(ligne(page, r.id).locator('.piece-oui')).toBeVisible();

    await ligne(page, r.id).locator('[data-action="voir-piece"]').click();
    const apercu = panneau(page);
    await expect(apercu.locator('#titre-piece')).toHaveText('facture-90.pdf');
    await expect(apercu.locator('iframe')).toHaveAttribute('src', new RegExp(`/api/recettes/${r.id}/piece`));
    const { contenu } = await telecharger(page, () => apercu.locator('a[download]').click());
    expect(contenu.subarray(0, 5).toString()).toBe('%PDF-');
    await apercu.locator('[data-retirer]').click();
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
    await expect(ligne(page, r.id).locator('.texte-retour')).toHaveText('PDF retiré');
    expect((await lister(request, '/api/recettes')).recettes[0].pieceJointe).toBeFalsy();
    await ligne(page, r.id).locator('[data-annuler-retour]').click();
    await expect(ligne(page, r.id).locator('.texte-retour')).toHaveText('PDF remis');
    expect((await lister(request, '/api/recettes')).recettes[0].pieceJointe?.nom).toBe('facture-90.pdf');
  });

  test('remplacer le PDF depuis l’aperçu', async ({ page, request }) => {
    await configurer(request);
    const r = await ajouterRecette(request);
    await joindre(request, 'recettes', r.id, 'ancienne.pdf');
    await ouvrir(page, 'recettes');
    await ligne(page, r.id).locator('[data-action="voir-piece"]').click();
    const choix = page.waitForEvent('filechooser');
    await panneau(page).locator('[data-remplacer]').click();
    await (await choix).setFiles(fichierPdf('nouvelle.pdf'));
    await expect(ligne(page, r.id).locator('.texte-retour')).toHaveText('PDF remplacé');
    expect((await lister(request, '/api/recettes')).recettes[0].pieceJointe.nom).toBe('nouvelle.pdf');
    await ligne(page, r.id).locator('[data-annuler-retour]').click();
    await expect(ligne(page, r.id).locator('.texte-retour')).toHaveText('Ancien PDF remis');
    expect((await lister(request, '/api/recettes')).recettes[0].pieceJointe.nom).toBe('ancienne.pdf');
  });

  test('un fichier qui n’est pas un PDF est refusé sur place', async ({ page, request }) => {
    await configurer(request);
    const r = await ajouterRecette(request);
    await ouvrir(page, 'recettes');
    const choix = page.waitForEvent('filechooser');
    await ligne(page, r.id).locator('[data-action="joindre"]').click();
    await (await choix).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') });
    await expect(ligne(page, r.id).locator('.retour-ligne.erreur')).toContainText('« notes.txt » n’est pas un PDF.');
    // Un faux PDF (bon nom, mauvais contenu) est refusé par le serveur.
    const choix2 = page.waitForEvent('filechooser');
    await ligne(page, r.id).locator('[data-action="joindre"]').click();
    await (await choix2).setFiles({ name: 'faux.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pas un pdf') });
    await expect(ligne(page, r.id).locator('.retour-ligne.erreur')).toContainText('PDF non joint');
    expect((await lister(request, '/api/recettes')).recettes[0].pieceJointe).toBeFalsy();
  });

  test('un PDF déposé sur la ligne s’y attache', async ({ page, request }) => {
    await configurer(request);
    const r = await ajouterRecette(request);
    await ouvrir(page, 'recettes');
    const transfert = await page.evaluateHandle((octets) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(octets)], 'depose.pdf', { type: 'application/pdf' }));
      return dt;
    }, [...fichierPdf().buffer]);
    const tr = ligne(page, r.id);
    await tr.dispatchEvent('dragover', { dataTransfer: transfert });
    await expect(tr).toHaveClass(/cible-depot/);
    await tr.dispatchEvent('drop', { dataTransfer: transfert });
    await expect(tr.locator('.texte-retour')).toHaveText('PDF joint');
    expect((await lister(request, '/api/recettes')).recettes[0].pieceJointe.nom).toBe('depose.pdf');
  });

  test('un PDF choisi dans le panneau part avec la nouvelle recette ; son aperçu ne ferme pas la saisie', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    await p.locator('#f-client').fill('Avec facture');
    await p.locator('#f-montant').fill('44');
    const choix = page.waitForEvent('filechooser');
    await p.locator('[data-piece="choisir"]').click();
    await (await choix).setFiles(fichierPdf('jointe.pdf'));
    await expect(p.locator('.piece-jointe')).toContainText('jointe.pdf');
    await expect(p.locator('.piece-jointe')).toContainText('sera joint à l’enregistrement');
    // L'aperçu s'ouvre par-dessus, puis rend la saisie intacte.
    await p.locator('[data-piece="voir"]').click();
    const apercu = page.locator('dialog.panneau.large[open]');
    await expect(apercu.locator('#titre-piece')).toHaveText('jointe.pdf');
    await apercu.locator('[data-fermer]').click();
    await expect(apercu).toHaveCount(0);
    const saisie = page.locator('dialog.panneau[open]');
    await expect(saisie.locator('#f-client')).toHaveValue('Avec facture');
    await saisie.locator('[type="submit"]').click();
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
    const { recettes } = await lister(request, '/api/recettes');
    expect(recettes[0].pieceJointe?.nom).toBe('jointe.pdf');
  });

  test('retirer le PDF dans le panneau de modification le détache à l’enregistrement', async ({ page, request }) => {
    await configurer(request);
    const r = await ajouterRecette(request);
    await joindre(request, 'recettes', r.id, 'a-retirer.pdf');
    await ouvrir(page, 'recettes');
    await ligne(page, r.id).locator('td.client').click();
    const p = panneau(page);
    await expect(p.locator('.piece-jointe')).toContainText('a-retirer.pdf');
    await p.locator('[data-piece="retirer"]').click();
    await expect(p.locator('[data-piece="choisir"]')).toBeFocused();
    await p.locator('[type="submit"]').click();
    await expect(ligne(page, r.id).locator('.piece-non')).toBeAttached();
    expect((await lister(request, '/api/recettes')).recettes[0].pieceJointe).toBeFalsy();
  });
});

test.describe('numérotation des factures', () => {
  test('un numéro manquant se signale, se déplie, et peut ne plus être signalé', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { numeroFacture: 'F-001' });
    await ajouterRecette(request, { numeroFacture: 'F-003' });
    await ouvrir(page, 'recettes');
    const pastille = page.locator('.pastille-signal');
    await expect(pastille).toHaveText('Numérotation : 1 numéro manquant');
    await pastille.click();
    await expect(pastille).toHaveAttribute('aria-expanded', 'true');
    const avis = page.locator('#avis-numerotation');
    await expect(avis).toContainText('il semble manquer « F-002 »');
    await avis.locator('[data-ignorer="F-002"]').click();
    await expect(page.locator('.zone-avis .bandeau-retour')).toContainText('« F-002 » ne sera plus signalé');
    await expect(pastille).toHaveCount(0);
    expect((await (await request.get('/api/parametres')).json()).parametres.numerosIgnores).toEqual(['F-002']);
    await page.locator('.zone-avis .bandeau-retour button').click();
    await expect(page.locator('.pastille-signal')).toBeVisible();
    expect((await (await request.get('/api/parametres')).json()).parametres.numerosIgnores).toEqual([]);
  });

  test('un numéro en double se signale ; l’option coupe les alertes', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { numeroFacture: 'F-010', client: 'A' });
    await ajouterRecette(request, { numeroFacture: 'F-010', client: 'B' });
    await ouvrir(page, 'recettes');
    await expect(page.locator('.pastille-signal')).toHaveText('Numérotation : 1 numéro en double');
    await page.locator('.pastille-signal').click();
    await expect(page.locator('#avis-numerotation')).toContainText('« F-010 » est utilisé par 2 recettes');
    await regler(request, { alertesNumerotation: false });
    await page.reload();
    await attendrePage(page);
    await expect(page.locator('.pastille-signal')).toHaveCount(0);
  });
});

test.describe('Annuler et Rétablir au clavier dans le registre', () => {
  test('Ctrl+Z défait l’ajout, Ctrl+Y le refait, la liste se met à jour sur place', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { montant: 10 });
    await ouvrir(page, 'recettes');
    const p = await nouvelle(page);
    await p.locator('#f-client').fill('Clavier');
    await p.locator('#f-montant').fill('20');
    await p.locator('[type="submit"]').click();
    await expect(lignes(page)).toHaveCount(2);
    await page.locator('h1').click();
    await page.keyboard.press('Control+z');
    await expect(lignes(page)).toHaveCount(1);
    await expect(total(page)).toHaveText(euros(10));
    await page.keyboard.press('Control+y');
    await expect(lignes(page)).toHaveCount(2);
    await expect(total(page)).toHaveText(euros(30));
    // Rien de plus à rétablir.
    await page.keyboard.press('Control+y');
    await expect(lignes(page)).toHaveCount(2);
  });

  test('après Ctrl+Z, l’« Annuler » d’une suppression disparaît avec elle', async ({ page, request }) => {
    await configurer(request);
    const r = await ajouterRecette(request);
    await ouvrir(page, 'recettes');
    await ligne(page, r.id).locator('[data-action="menu"]').click();
    await page.locator('.menu-contextuel [role="menuitem"]', { hasText: 'Supprimer' }).click();
    await expect(page.locator('tr.place-retiree')).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(ligne(page, r.id)).toBeVisible();
    await expect(page.locator('tr.place-retiree')).toHaveCount(0);
  });
});

test('un mode de règlement personnalisé se choisit et s’affiche', async ({ page, request }) => {
  await configurer(request, { modesPersonnalises: [{ code: '', libelle: 'Lydia' }] });
  await ouvrir(page, 'recettes');
  const p = await nouvelle(page);
  await p.locator('#f-mode').selectOption({ label: 'Lydia' });
  await p.locator('#f-client').fill('Ami');
  await p.locator('#f-montant').fill('25');
  await p.locator('[type="submit"]').click();
  await expect(page.locator('#registre td.mode')).toHaveText('Lydia');
});
