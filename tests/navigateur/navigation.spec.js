/**
 * Le cadre de l'application : menu, routage, titre, recherche dans tout le
 * livre (Ctrl+K), raccourcis clavier, thème, bandeaux et erreurs.
 */

import {
  test, expect, configurer, ajouterRecette, ajouterAchat, ajouterClient, ouvrir, attendrePage,
  euros, chargerDemo, regler
} from './outils.js';

test.describe('menu et routage', () => {
  test('chaque page du menu s’ouvre, avec son titre et la page courante marquée', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'mixte' });
    await ouvrir(page);
    const pages = [
      ['Tableau de bord', '', 'Livre des recettes'],
      ['Recettes', 'recettes', 'Recettes · Livre des recettes'],
      ['Achats', 'achats', 'Achats · Livre des recettes'],
      ['URSSAF', 'urssaf', 'URSSAF · Livre des recettes'],
      ['Clients', 'clients', 'Clients · Livre des recettes'],
      ['Importer', 'import', 'Importer · Livre des recettes'],
      ['Exports', 'exports', 'Exports · Livre des recettes'],
      ['Paramètres', 'parametres', 'Paramètres · Livre des recettes']
    ];
    for (const [libelle, route, titre] of pages) {
      await page.locator('#navigation .lien-nav', { hasText: libelle }).click();
      await expect(page).toHaveURL(new RegExp(`#/${route}$`));
      await attendrePage(page);
      await expect(page).toHaveTitle(titre);
      await expect(page.locator(`#navigation .lien-nav[data-route="${route}"]`)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#navigation .lien-nav[aria-current="page"]')).toHaveCount(1);
    }
  });

  test('une adresse inconnue mène au tableau de bord', async ({ page, request }) => {
    await configurer(request);
    await page.goto('/#/nulle-part');
    await attendrePage(page);
    await expect(page.locator('h1')).toContainText('Camille');
    await expect(page.locator('#navigation .lien-nav[data-route=""]')).toHaveAttribute('aria-current', 'page');
  });

  test('le menu montre le nom de l’entreprise et la version', async ({ page, request }) => {
    await configurer(request, { nomEntreprise: 'Studio <b>Nord</b>' });
    await ouvrir(page);
    await expect(page.locator('#nom-entreprise')).toHaveText('Studio <b>Nord</b>');
    const { version } = JSON.parse(await (await request.get('/api/systeme')).text());
    await expect(page.locator('#version-app')).toHaveText(`Version ${version}`);
  });

  test('la page Achats n’apparaît que pour une activité qui revend, ou un registre déjà rempli', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'liberal' });
    await ouvrir(page);
    await expect(page.locator('#navigation .lien-nav[data-route="achats"]')).toHaveCount(0);
    // Changer d'activité dans les paramètres fait apparaître la page sans recharger.
    await ouvrir(page, 'parametres');
    await page.locator('#p-typeActivite').selectOption('ventes');
    await expect(page.locator('#navigation .lien-nav[data-route="achats"]')).toHaveCount(1);
    await page.locator('#p-typeActivite').selectOption('liberal');
    await expect(page.locator('#navigation .lien-nav[data-route="achats"]')).toHaveCount(0);
    // Un achat déjà enregistré garde la page visible, quelle que soit l'activité.
    await ajouterAchat(request);
    await page.reload();
    await attendrePage(page);
    await expect(page.locator('#navigation .lien-nav[data-route="achats"]')).toHaveCount(1);
  });

  test('l’heure d’enregistrement prend un instant la place de la version', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    const ligne = page.locator('#navigation .ligne-version');
    const heure = page.locator('#etat-enregistrement');
    await expect(ligne).not.toHaveClass(/montre-heure/);
    await expect(heure).toHaveAttribute('aria-hidden', 'true');
    const avant = await ligne.boundingBox();
    await page.locator('#nouvelle-recette').click();
    const p = page.locator('dialog.panneau[open]');
    await p.locator('#f-client').fill('Durand');
    await p.locator('#f-montant').fill('80');
    await p.locator('[type="submit"]').click();
    await expect(ligne).toHaveClass(/montre-heure/);
    await expect(heure).toHaveText(/^Enregistré à \d{1,2} h \d{2}$/);
    await expect(heure).not.toHaveAttribute('aria-hidden');
    // Rien ne bouge dans le menu : l'heure se superpose à la version.
    expect(await ligne.boundingBox()).toEqual(avant);
    // Puis la version revient.
    await expect(ligne).not.toHaveClass(/montre-heure/, { timeout: 10_000 });
    await expect(heure).toHaveAttribute('aria-hidden', 'true');
  });

  test('changer de page referme le panneau ouvert, sans rien demander', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page);
    await page.locator('#navigation .lien-nav[data-route="recettes"]').click();
    await attendrePage(page);
    await page.locator('#nouvelle-recette').click();
    await page.locator('#f-client').fill('Laissé là');
    await page.goBack();
    await attendrePage(page);
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
    await expect(page.locator('dialog.boite')).toHaveCount(0);
    await expect(page.locator('#barre-selection')).toBeHidden();
  });

  test('le lien d’évitement mène au contenu sans changer de page', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    // Chaque page prend le focus à son arrivée ; le lien sert depuis le haut du document.
    await expect(page.locator('#contenu')).toBeFocused();
    await page.locator('.lien-evitement').focus();
    await expect(page.locator('.lien-evitement')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#contenu')).toBeFocused();
    await expect(page).toHaveURL(/#\/recettes$/);
  });
});

test.describe('recherche dans tout le livre', () => {
  test('Ctrl+K trouve pages, actions, clients, recettes et achats, et y mène', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'mixte' });
    await ajouterClient(request, { nom: 'Boulangerie Martin' });
    const recette = await ajouterRecette(request, { client: 'Boulangerie Martin', libelle: 'Logo et charte', montant: 1250.5, numeroFacture: 'F-042', categorie: 'prestations' });
    await ajouterAchat(request, { fournisseur: 'Papeterie Martin', montant: 42 });
    await ouvrir(page);

    await page.keyboard.press('Control+k');
    const boite = page.locator('dialog.boite-recherche');
    await expect(boite).toBeVisible();
    const champ = boite.locator('input[type="search"]');
    await expect(champ).toBeFocused();
    // Sans saisie : les pages et les actions.
    await expect(boite.locator('.groupe-resultats[aria-label="Pages"] .resultat')).toHaveCount(5);
    await expect(boite.locator('.groupe-resultats[aria-label="Actions"]')).toContainText('Nouvelle recette');

    await champ.fill('martin');
    await expect(boite.locator('.groupe-resultats[aria-label="Clients"]')).toContainText('Boulangerie Martin');
    await expect(boite.locator('.groupe-resultats[aria-label="Recettes"]')).toContainText('Logo et charte');
    await expect(boite.locator('.groupe-resultats[aria-label="Achats"]')).toContainText('Papeterie Martin');
    await expect(boite.locator('mark').first()).toHaveText(/martin/i);

    // Un montant se cherche aussi, quelle que soit son écriture.
    await champ.fill('1250,50');
    await expect(boite.locator('.groupe-resultats[aria-label="Recettes"] .resultat')).toHaveCount(1);
    await champ.fill('F-042');
    await expect(boite.locator('.groupe-resultats[aria-label="Recettes"] .resultat')).toHaveCount(1);

    // Entrée ouvre le registre sur la recette, mise en avant.
    await page.keyboard.press('Enter');
    await expect(boite).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`#/recettes\\?voir=${recette.id}`));
    await attendrePage(page);
    await expect(page.locator(`tr[data-id="${recette.id}"]`)).toBeVisible();
  });

  test('les flèches choisissent, Échap referme et rend le focus', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'recettes');
    await page.locator('#nouvelle-recette').focus();
    await page.keyboard.press('Control+k');
    const boite = page.locator('dialog.boite-recherche');
    await expect(boite.locator('.resultat[aria-selected="true"]')).toHaveText(/Tableau de bord/);
    await page.keyboard.press('ArrowDown');
    await expect(boite.locator('.resultat[aria-selected="true"]')).toHaveText(/Recettes/);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    // Du premier, la flèche haute revient au dernier.
    await expect(boite.locator('.resultat').last()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(boite).toHaveCount(0);
    await expect(page.locator('#nouvelle-recette')).toBeFocused();
  });

  test('un clic sur le voile referme la recherche ; rien ne correspond est dit', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page);
    await page.locator('#recherche-rail').click();
    const boite = page.locator('dialog.boite-recherche');
    await boite.locator('input').fill('zzzz introuvable');
    await expect(boite.locator('.aucun-resultat')).toContainText('Rien ne correspond');
    await page.mouse.click(1400, 880);
    await expect(boite).toHaveCount(0);
  });

  test('la recherche répond au clavier avant même que le livre soit lu', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { client: 'Paramount Studio' });
    await ouvrir(page);
    // Le livre met du temps à arriver : la frappe, elle, n'attend pas.
    let livrer;
    const livre = new Promise((suite) => { livrer = suite; });
    await page.route('**/api/recettes', async (route) => { await livre; await route.continue(); });
    await page.keyboard.press('Control+k');
    const boite = page.locator('dialog.boite-recherche');
    await boite.locator('input').fill('param');
    await expect(boite.locator('.resultat[aria-selected="true"]')).toHaveText(/Paramètres/);
    livrer();
    // La recette arrive ensuite, sans changer le résultat choisi.
    await expect(boite.locator('.groupe-resultats[aria-label="Recettes"]')).toContainText('Paramount Studio');
    await expect(boite.locator('.resultat[aria-selected="true"]')).toHaveText(/Paramètres/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/parametres$/);
  });

  test('Entrée tapée aussitôt mène au résultat, sans attendre le livre', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page);
    await page.route('**/api/recettes', () => {});
    await page.keyboard.press('Control+k');
    await page.locator('dialog.boite-recherche input').fill('param');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/parametres$/);
  });

  test('un client trouvé ouvre sa fiche ; une page trouvée y mène', async ({ page, request }) => {
    await configurer(request);
    const client = await ajouterClient(request, { nom: 'Cabinet Rivière' });
    await ouvrir(page);
    await page.keyboard.press('Control+k');
    const boite = page.locator('dialog.boite-recherche');
    await boite.locator('input').fill('rivi');
    await boite.locator('.resultat', { hasText: 'Cabinet Rivière' }).click();
    await expect(page).toHaveURL(new RegExp(`#/clients\\?client=${client.id}`));
    await attendrePage(page);
    await expect(page.locator('#titre-fiche')).toHaveText('Cabinet Rivière');

    await page.keyboard.press('Control+k');
    await boite.locator('input').fill('param');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/parametres$/);
  });
});

test.describe('raccourcis clavier', () => {
  test('N ouvre une nouvelle recette, A un nouvel achat, ? la liste des raccourcis', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'ventes' });
    await ouvrir(page);
    await page.keyboard.press('n');
    await expect(page).toHaveURL(/#\/recettes\?nouvelle=1/);
    await expect(page.locator('dialog.panneau[open] #titre-panneau')).toHaveText('Nouvelle recette');
    // Dans un champ, la touche s'écrit.
    await page.locator('#f-client').click();
    await page.keyboard.press('n');
    await expect(page.locator('#f-client')).toHaveValue('n');
    await page.locator('dialog.panneau[open] [data-fermer]').first().click();
    await page.locator('dialog.boite [data-role="ok"]').click();
    await expect(page.locator('dialog.panneau')).toHaveCount(0);

    await page.keyboard.press('a');
    await expect(page).toHaveURL(/#\/achats\?nouveau=1/);
    await expect(page.locator('dialog.panneau[open] #titre-panneau')).toHaveText('Nouvel achat');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.panneau')).toHaveCount(0);

    await page.keyboard.press('?');
    await expect(page).toHaveURL(/#\/parametres\?section=raccourcis/);
    await attendrePage(page);
    await expect(page.locator('#s-raccourcis')).toContainText('Rechercher dans tout le livre');
  });

  test('N sur la page des recettes ouvre le panneau sur place ; / va à la recherche de la page', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request);
    await ouvrir(page, 'recettes');
    await page.keyboard.press('/');
    await expect(page.locator('#filtre-q')).toBeFocused();
    await page.locator('h1').click();
    await page.keyboard.press('N');
    await expect(page).toHaveURL(/#\/recettes$/);
    await expect(page.locator('dialog.panneau[open] #titre-panneau')).toHaveText('Nouvelle recette');
  });

  test('A ne fait rien sans registre des achats ; / sans recherche ouvre celle du livre', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'liberal' });
    await ouvrir(page);
    await page.keyboard.press('a');
    await expect(page).toHaveURL(/#\/$/);
    await page.keyboard.press('/');
    await expect(page.locator('dialog.boite-recherche')).toBeVisible();
  });
});

test.describe('thème', () => {
  test('le bouton du menu bascule le thème, retenu au rechargement', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page);
    const racine = page.locator('html');
    await expect(racine).toHaveAttribute('data-theme', 'light');
    await page.locator('#bouton-theme').click();
    await expect(racine).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#bouton-theme')).toHaveAttribute('aria-label', 'Passer au thème clair');
    await page.reload();
    await attendrePage(page);
    await expect(racine).toHaveAttribute('data-theme', 'dark');
    // Les paramètres le reflètent, et le changent aussi.
    await ouvrir(page, 'parametres');
    await expect(page.locator('[data-theme-choix="dark"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-theme-choix="light"]').click();
    await expect(racine).toHaveAttribute('data-theme', 'light');
    await page.locator('#bouton-theme').click();
    await expect(page.locator('[data-theme-choix="dark"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('bandeaux et mises à jour', () => {
  test('une nouvelle version publiée s’annonce en tête de page', async ({ page, request }) => {
    await configurer(request);
    await page.route('**/api/maj', (route) => route.fulfill({
      json: { actif: true, disponible: true, version: '99.0.0', page: 'https://github.com/RDSV01/livre-des-recettes/releases/latest', remplacable: false, erreur: null }
    }));
    await ouvrir(page);
    const bandeau = page.locator('#bandeaux .bandeau-global');
    await expect(bandeau).toContainText('Version 99.0.0 disponible');
    await expect(bandeau.locator('a')).toHaveAttribute('href', /github\.com/);
  });

  test('l’exécutable propose d’installer la nouvelle version, après confirmation', async ({ page, request }) => {
    await configurer(request);
    await page.route('**/api/maj', (route) => route.fulfill({
      json: { actif: true, disponible: true, version: '99.0.0', page: 'https://github.com/RDSV01/livre-des-recettes/releases/latest', remplacable: true, erreur: null }
    }));
    let installation = false;
    await page.route('**/api/maj/appliquer', (route) => { installation = true; return route.abort(); });
    await ouvrir(page);
    await page.locator('#lancer-maj').click();
    const boite = page.locator('dialog.boite');
    await expect(boite).toContainText('Installer la version 99.0.0 ?');
    await boite.locator('[data-role="annuler"]').click();
    await expect(boite).toHaveCount(0);
    expect(installation).toBe(false);
    await expect(page.locator('#lancer-maj')).toBeEnabled();
  });

  test('une mise à jour qui n’a pas pu démarrer est annoncée une fois', async ({ page, request }) => {
    await configurer(request);
    let vu = false;
    await page.route('**/api/systeme', async (route) => {
      const reponse = await route.fetch();
      const corps = await reponse.json();
      await route.fulfill({ response: reponse, json: { ...corps, majEchouee: vu ? null : { version: '99.0.0' } } });
    });
    await page.route('**/api/maj/echec-vu', (route) => { vu = true; return route.fulfill({ status: 204 }); });
    await ouvrir(page);
    await expect(page.locator('#toasts .toast.erreur')).toContainText('La version 99.0.0 n’a pas pu démarrer');
    await expect.poll(() => vu).toBe(true);
  });

  test('hors ligne, la vérification des versions ne montre rien', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page);
    const reponse = await (await request.get('/api/maj')).json();
    expect(reponse.disponible).toBe(false);
    await expect(page.locator('#bandeaux .bandeau-global')).toHaveCount(0);
  });

  test('le jeu de démonstration se signale, et s’efface pour repartir de zéro', async ({ page, request }) => {
    await chargerDemo(request);
    await ouvrir(page);
    const bandeau = page.locator('#bandeaux .bandeau-global');
    await expect(bandeau).toContainText('jeu de démonstration');
    await bandeau.locator('#effacer-demo').click();
    await page.locator('dialog.boite [data-role="ok"]').click();
    // Livre vide : l'accueil guidé reprend.
    await expect(page.locator('.accueil')).toBeVisible();
    const { recettes } = await (await request.get('/api/recettes')).json();
    expect(recettes).toHaveLength(0);
  });
});

test.describe('Annuler et Rétablir au clavier', () => {
  test('Ctrl+Z annule un ajout depuis le tableau de bord, Ctrl+Y le rétablit', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { montant: 100 });
    await ouvrir(page, 'recettes');
    await page.locator('#nouvelle-recette').click();
    const p = page.locator('dialog.panneau[open]');
    await p.locator('#f-client').fill('Nouveau client');
    await p.locator('#f-montant').fill('250');
    await p.locator('[type="submit"]').click();
    await expect(page.locator('tfoot [data-total]')).toHaveText(euros(350));

    await page.locator('#navigation .lien-nav[data-route=""]').click();
    await attendrePage(page);
    await expect(page.locator('.indicateur.principal .indicateur-valeur')).toHaveText(euros(350));
    await page.keyboard.press('Control+z');
    await expect(page.locator('#toasts .toast').last()).toHaveText('Action annulée.');
    await expect(page.locator('.indicateur.principal .indicateur-valeur')).toHaveText(euros(100));
    await page.keyboard.press('Control+y');
    await expect(page.locator('#toasts .toast').last()).toHaveText('Action rétablie.');
    await expect(page.locator('.indicateur.principal .indicateur-valeur')).toHaveText(euros(350));
  });

  test('le message reste tant qu’on le survole, puis s’en va', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request);
    await ouvrir(page, 'recettes');
    await page.locator('#nouvelle-recette').click();
    await page.locator('#f-client').fill('Survol');
    await page.locator('#f-montant').fill('3');
    await page.locator('dialog.panneau [type="submit"]').click();
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
    await page.locator('h1').click();
    await page.keyboard.press('Control+z');
    const message = page.locator('#toasts .toast').last();
    await expect(message).toHaveText('Action annulée.');
    await message.hover();
    await page.waitForTimeout(5000);
    await expect(message).toBeVisible();
    await page.mouse.move(5, 5);
    await expect(page.locator('#toasts .toast')).toHaveCount(0, { timeout: 5000 });
  });

  test('Ctrl+Z dans un champ reste l’annulation de texte du navigateur', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request);
    await ouvrir(page, 'recettes');
    await page.locator('#filtre-q').fill('abc');
    await page.keyboard.press('Control+z');
    await expect(page.locator('#toasts .toast')).toHaveCount(0);
    const { recettes } = await (await request.get('/api/recettes')).json();
    expect(recettes).toHaveLength(1);
  });
});

test.describe('erreurs', () => {
  test.use({ erreursPermises: [/Erreur interne|status of 500|\/api\/recettes$/] });

  test('une page qui ne peut pas s’afficher le dit, sans masquer les données', async ({ page, request }) => {
    await configurer(request);
    await page.route('**/api/recettes', (route) => route.fulfill({ status: 500, json: { erreur: 'Erreur interne du serveur.' } }));
    await ouvrir(page);
    await page.goto('/#/recettes');
    await expect(page.locator('.erreur-page')).toContainText('Cette page n’a pas pu s’afficher');
    await expect(page.locator('.erreur-page')).toContainText('Erreur interne du serveur.');
    await expect(page.locator('#recharger-page')).toBeVisible();
  });
});

test.describe('données sensibles', () => {
  test('un texte saisi n’est jamais interprété comme du HTML', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'mixte', prenom: '<img src=x onerror="window.pirate=1">' });
    const piege = '<img src=x onerror="window.pirate=1">';
    await ajouterClient(request, { nom: `${piege} SARL` });
    await ajouterRecette(request, { client: `${piege} SARL`, libelle: `<script>window.pirate=2</script>`, numeroFacture: `"><b>F</b>`, categorie: 'ventes' });
    await ajouterAchat(request, { fournisseur: piege, referenceFacture: '<i>R</i>' });
    for (const route of ['', 'recettes', 'achats', 'clients', 'urssaf', 'exports', 'parametres']) {
      await ouvrir(page, route);
    }
    await page.keyboard.press('Control+k');
    await page.locator('dialog.boite-recherche input').fill('img');
    await expect(page.locator('dialog.boite-recherche .resultat').first()).toBeVisible();
    expect(await page.evaluate(() => window.pirate)).toBeUndefined();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
  });
});

test('le livre se relit après la démonstration, menu compris', async ({ page, request }) => {
  await regler(request, { prenom: 'Lou' });
  await chargerDemo(request);
  await ouvrir(page);
  await expect(page.locator('h1')).toContainText('Lou');
  await expect(page.locator('#nom-entreprise')).toHaveText('Atelier Démonstration');
});
