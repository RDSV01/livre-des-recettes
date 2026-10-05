/**
 * Les paramètres : identité, régime et déclaration (ACRE comprise),
 * affichage, modes de règlement personnalisés, options, raccourcis, sommaire.
 * Chaque réglage s'enregistre dès qu'on le change.
 */

import {
  test, expect, configurer, regler, ajouterRecette, ouvrir, attendrePage, parametres, euros, aujourdhui, ANNUAIRE
} from './outils.js';
import { dateEnFrancaisLong } from '../../src/partage/dates.js';
import { finAcre } from '../../src/partage/acre.js';

/** La pastille « Enregistré » posée à côté d'un réglage. */
const enregistre = (page) => page.locator('.enregistre').last();

test.describe('identité', () => {
  test('identité vide : le formulaire d’emblée, puis la fiche lue', async ({ page, request }) => {
    await regler(request, { accueil: 'termine', prenom: '' });
    await ouvrir(page, 'parametres');
    const form = page.locator('#form-identite');
    await expect(form).toBeVisible();
    await expect(form.locator('#p-annuler')).toHaveCount(0);
    await form.locator('#p-prenom').fill('Alex');
    await form.locator('#p-nomEntreprise').fill('Atelier Alex');
    await form.locator('#p-siren').fill(ANNUAIRE.lumen.siren);
    await form.locator('#p-siret').fill(ANNUAIRE.lumen.siret);
    await form.locator('#p-activite').fill('Photographie');
    await form.locator('#p-adresse').fill('3 quai Ouest, 33000 Bordeaux');
    await form.locator('[type="submit"]').click();
    const lue = page.locator('#zone-identite .identite');
    await expect(lue).toContainText('Atelier Alex');
    await expect(lue).toContainText(ANNUAIRE.lumen.siren.replace(/(\d{3})(?=\d)/g, '$1 '));
    await expect(page.locator('#modifier-identite')).toContainText('Enregistré');
    await expect(page.locator('#nom-entreprise')).toHaveText('Atelier Alex');
    // La carte de bienvenue du premier lancement disparaît.
    await expect(page.locator('#carte-bienvenue')).toHaveCount(0);
    const p = await parametres(request);
    expect(p).toMatchObject({ prenom: 'Alex', nomEntreprise: 'Atelier Alex', siren: ANNUAIRE.lumen.siren, siret: ANNUAIRE.lumen.siret });
  });

  test('« Modifier » rouvre le formulaire ; une erreur se dit sur son champ ; « Annuler » le referme', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'parametres');
    await expect(page.locator('#zone-identite .identite')).toContainText('Atelier Test');
    await page.locator('#modifier-identite').click();
    const form = page.locator('#form-identite');
    await expect(form.locator('#p-prenom')).toBeFocused();
    await form.locator('#p-siret').fill('12345678901234');
    await form.locator('[type="submit"]').click();
    await expect(form.locator('[data-champ="siret"] .erreur-champ')).toContainText('clé de contrôle incorrecte');
    await form.locator('#p-annuler').click();
    await expect(page.locator('#zone-identite .identite')).toBeVisible();
    await expect(page.locator('#modifier-identite')).toBeFocused();
    expect((await parametres(request)).siret).toBe('');
  });

  test('renseigner son entreprise sort du jeu de démonstration', async ({ page, request }) => {
    await request.post('/api/demo', { data: {} });
    await ouvrir(page, 'parametres');
    await expect(page.locator('#bandeaux .bandeau-global')).toContainText('jeu de démonstration');
    await page.locator('#modifier-identite').click();
    await page.locator('#p-nomEntreprise').fill('Ma vraie entreprise');
    await page.locator('#form-identite [type="submit"]').click();
    await expect(page.locator('#zone-identite .identite')).toContainText('Ma vraie entreprise');
    expect((await parametres(request)).jeuDemo).toBe(false);
  });
});

test.describe('régime et déclaration', () => {
  test('le type d’activité règle ce qui en dépend, enregistré aussitôt', async ({ page, request }) => {
    await configurer(request, { typeActivite: '' });
    await ouvrir(page, 'parametres?section=regime');
    await expect(page.locator('#option-versementLiberatoire')).toBeHidden();
    await expect(page.locator('#option-acre')).toBeHidden();
    await page.locator('#p-typeActivite').selectOption('mixte');
    await expect(enregistre(page)).toBeVisible();
    await expect(page.locator('#champ-nature')).toBeVisible();
    await expect(page.locator('#option-activiteArtisanale')).toBeVisible();
    await page.locator('#p-naturePrestations').selectOption('liberal');
    await expect.poll(async () => (await parametres(request)).naturePrestations).toBe('liberal');
    await page.locator('#p-typeActivite').selectOption('liberal');
    await expect(page.locator('#champ-nature')).toBeHidden();
    await expect(page.locator('#option-activiteArtisanale')).toBeHidden();
    await expect.poll(async () => (await parametres(request)).typeActivite).toBe('liberal');
  });

  test('le rythme de déclaration et les interrupteurs', async ({ page, request }) => {
    await configurer(request, { periodiciteUrssaf: 'trimestre', typeActivite: 'prestations' });
    await ouvrir(page, 'parametres?section=regime');
    await page.locator('[data-periodicite="mois"]').click();
    await expect(page.locator('[data-periodicite="mois"]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await parametres(request)).periodiciteUrssaf).toBe('mois');
    for (const cle of ['versementLiberatoire', 'activiteArtisanale']) {
      const inter = page.locator(`#p-${cle}`);
      await inter.click();
      await expect(inter).toHaveAttribute('aria-checked', 'true');
      await expect.poll(async () => (await parametres(request))[cle]).toBe(true);
      await inter.click();
      await expect(inter).toHaveAttribute('aria-checked', 'false');
      await expect.poll(async () => (await parametres(request))[cle]).toBe(false);
    }
  });

  test('l’ACRE : la date de début d’activité, et ce qu’elle implique', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'liberal', acre: false });
    await ouvrir(page, 'parametres?section=regime');
    await expect(page.locator('#detail-acre')).toBeHidden();
    await page.locator('#p-acre').click();
    await expect(page.locator('#detail-acre')).toBeVisible();
    await expect(page.locator('#fin-acre')).toContainText('Indiquez votre date de début d’activité');
    await page.locator('#p-debutActivite').fill('01/09/2026');
    await page.locator('#p-debutActivite').blur();
    await expect.poll(async () => (await parametres(request)).debutActivite).toBe('2026-09-01');
    await expect(page.locator('#fin-acre')).toContainText(dateEnFrancaisLong(finAcre('2026-09-01')));
    await page.locator('#p-debutActivite').fill('01/01/2010');
    await page.locator('#p-debutActivite').blur();
    await expect(page.locator('#fin-acre')).toContainText('précède les règles de l’ACRE');
  });
});

test.describe('affichage', () => {
  test('la devise et le format des dates s’appliquent partout', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { montant: 42 });
    await ouvrir(page, 'parametres?section=affichage');
    await page.locator('#p-devise').selectOption('CHF');
    await expect(enregistre(page)).toBeVisible();
    await page.locator('#p-formatDate').selectOption('AAAA-MM-JJ');
    // Le témoin du champ paraît une fois la réponse prise en compte par la page.
    await expect(page.locator('.option-champ', { has: page.locator('#p-formatDate') }).locator('.enregistre')).toBeVisible();
    await expect.poll(async () => (await parametres(request)).formatDate).toBe('AAAA-MM-JJ');
    await ouvrir(page, 'recettes');
    await expect(page.locator('#registre td.montant').first()).toHaveText(euros(42, 'CHF'));
    await expect(page.locator('#registre td.date').first()).toHaveText(aujourdhui());
  });

  test('deux réglages changés coup sur coup sont gardés tous les deux', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'parametres?section=affichage');
    // Envois ralentis : le second changement part avant la réponse au premier.
    await page.route('**/api/parametres', async (route) => {
      if (route.request().method() === 'PUT') await new Promise((fin) => { setTimeout(fin, 400); });
      await route.continue();
    });
    await page.locator('#p-devise').selectOption('CHF');
    await page.locator('#p-formatDate').selectOption('AAAA-MM-JJ');
    for (const id of ['#p-devise', '#p-formatDate']) {
      await expect(page.locator('.option-champ', { has: page.locator(id) }).locator('.enregistre')).toBeVisible();
    }
    const { devise, formatDate } = await parametres(request);
    expect({ devise, formatDate }).toEqual({ devise: 'CHF', formatDate: 'AAAA-MM-JJ' });
  });
});

test.describe('modes de règlement personnalisés', () => {
  test('ajouter, renommer, supprimer et annuler la suppression', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'parametres?section=modes');
    const liste = page.locator('#liste-modes');
    await page.locator('#ajouter-mode').click();
    await expect(liste.locator('.ligne-gestion input').last()).toBeFocused();
    await liste.locator('.ligne-gestion input').last().fill('Lydia');
    await liste.locator('.ligne-gestion input').last().press('Tab');
    await expect.poll(async () => (await parametres(request)).modesPersonnalises.map((m) => m.libelle)).toEqual(['Lydia']);
    await expect(liste.locator('.ligne-gestion .quand')).toHaveText('jamais utilisé');
    await liste.locator('.ligne-gestion input').fill('Lydia Pro');
    await liste.locator('.ligne-gestion input').press('Tab');
    await expect.poll(async () => (await parametres(request)).modesPersonnalises.map((m) => m.libelle)).toEqual(['Lydia Pro']);
    await liste.locator('[data-supprimer-mode]').click();
    await expect(liste.locator('.bandeau-retour')).toContainText('« Lydia Pro » supprimé');
    expect((await parametres(request)).modesPersonnalises).toEqual([]);
    await liste.locator('.bandeau-retour button').click();
    await expect(liste.locator('.ligne-gestion input')).toHaveValue('Lydia Pro');
    expect((await parametres(request)).modesPersonnalises.map((m) => m.libelle)).toEqual(['Lydia Pro']);
  });

  test('un mode utilisé se renomme mais ne se supprime pas', async ({ page, request }) => {
    const { modesPersonnalises: [mode] } = await configurer(request, { modesPersonnalises: [{ code: '', libelle: 'Paylib' }] });
    await ajouterRecette(request, { modeReglement: mode.code });
    await ouvrir(page, 'parametres?section=modes');
    const ligne = page.locator('#liste-modes .ligne-gestion');
    await expect(ligne.locator('.quand')).toHaveText('utilisé par 1 ligne');
    await expect(ligne.locator('[data-supprimer-mode]')).toBeDisabled();
    // L'API refuse aussi la suppression.
    const refus = await request.put('/api/parametres', { data: { ...(await parametres(request)), modesPersonnalises: [] } });
    expect(refus.status()).toBe(400);
    expect((await refus.json()).erreurs.modesPersonnalises).toContain('ne peut pas être supprimé');
  });
});

test.describe('options', () => {
  test('chaque option s’active et se désactive, enregistrée aussitôt', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'parametres?section=options');
    const cles = ['suiviSeuils', 'comparerAnneePrecedente', 'proposerRenouvellements', 'alertesNumerotation', 'alerteRecetteSimilaire', 'verifierMisesAJour'];
    await expect(page.locator('#s-options .groupe-options h3')).toHaveText(['Tableau de bord', 'Saisie', 'Application']);
    for (const cle of cles) {
      const inter = page.locator(`#o-${cle}`);
      await expect(inter).toHaveAttribute('aria-checked', 'true');
      await inter.click();
      await expect(inter).toHaveAttribute('aria-checked', 'false');
      await expect.poll(async () => (await parametres(request))[cle]).toBe(false);
    }
    await page.reload();
    await attendrePage(page);
    for (const cle of cles) await expect(page.locator(`#o-${cle}`)).toHaveAttribute('aria-checked', 'false');
  });

  test('les numéros ignorés se signalent de nouveau, et s’annule', async ({ page, request }) => {
    await configurer(request, { numerosIgnores: ['F-002', 'F-007'] });
    await ouvrir(page, 'parametres?section=options');
    const zone = page.locator('#numeros-ignores');
    await expect(zone).toContainText('Numéros de facture que vous avez choisi de ne plus signaler');
    await expect(zone.locator('.ref')).toHaveText('F-002, F-007');
    await zone.locator('#reafficher-numeros').click();
    await expect(zone.locator('.bandeau-retour')).toContainText('Ces numéros seront de nouveau signalés');
    expect((await parametres(request)).numerosIgnores).toEqual([]);
    await zone.locator('.bandeau-retour button').click();
    await expect(zone.locator('.ref')).toHaveText('F-002, F-007');
    expect((await parametres(request)).numerosIgnores).toEqual(['F-002', 'F-007']);
  });
});

test.describe('navigation dans les paramètres', () => {
  test('le sommaire mène aux sections et suit la lecture', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'parametres');
    await page.locator('.sommaire a[data-section="securite"]').click();
    await expect(page.locator('.sommaire a[data-section="securite"]')).toHaveClass(/actif/);
    await expect(page.locator('#s-securite')).toBeInViewport();
    await page.locator('.sommaire a[data-section="identite"]').click();
    await expect(page.locator('#s-identite')).toBeInViewport();
  });

  test('un ancien lien de section mène à « Données et sécurité »', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page, 'parametres?section=sauvegardes');
    await expect(page.locator('#s-securite')).toBeInViewport();
  });

  test('les raccourcis listés suivent l’activité', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'ventes' });
    await ouvrir(page, 'parametres?section=raccourcis');
    await expect(page.locator('#s-raccourcis')).toContainText('Nouvel achat');
    await regler(request, { typeActivite: 'liberal' });
    await page.reload();
    await attendrePage(page);
    await expect(page.locator('#s-raccourcis')).not.toContainText('Nouvel achat');
  });

  test('les chemins des données se copient', async ({ page, request, livre }) => {
    await configurer(request);
    await ouvrir(page, 'parametres?section=securite');
    const bouton = page.locator('#s-securite [aria-label="Copier le chemin du fichier de données"]');
    await bouton.click();
    await expect(bouton).toContainText('Copié');
    const copie = await page.evaluate(() => navigator.clipboard.readText());
    expect(copie.startsWith(livre.dossierDonnees)).toBe(true);
  });
});
