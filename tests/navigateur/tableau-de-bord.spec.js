/**
 * Le tableau de bord : indicateurs, graphique mensuel (survol, clic, tableau,
 * année précédente), choix de l'année, déclaration URSSAF à faire, recettes
 * qui reviennent chaque mois, dernières recettes et suivi des seuils.
 */

import {
  test, expect, configurer, ajouterRecette, ajouterAchat, ouvrir, attendrePage, euros, eurosEntiers,
  aujourdhui, dansMois, idMois, lister, parametres
} from './outils.js';
import { bilanSeuils } from '../../src/partage/seuils.js';
import { nomMois, periodeDepuisId } from '../../src/partage/dates.js';
import { libellePeriode } from '../../src/partage/declarations.js';

const annee = new Date().getFullYear();
const moisCourant = new Date().getMonth() + 1;
const valeur = (page, cle) => page.locator(`.indicateur-valeur[data-cle="${cle}"]`);

test.describe('indicateurs', () => {
  test('livre vide : des zéros, et de quoi commencer', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page);
    await expect(valeur(page, 'annee')).toHaveText(euros(0));
    await expect(page.locator('.vide-graphique')).toContainText(`Le graphique apparaîtra dès vos premiers encaissements de ${annee}.`);
    await expect(page.locator('.carte-dernieres .vide-carte')).toContainText('Votre livre des recettes est vide');
    await page.locator('.carte-dernieres .vide-carte a').click();
    await expect(page.locator('dialog.panneau[open] #titre-panneau')).toHaveText('Nouvelle recette');
  });

  test('chiffre d’affaires, mois, panier moyen et compteurs', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { client: 'A', montant: 100, dateEncaissement: aujourdhui() });
    await ajouterRecette(request, { client: 'B', montant: 300.5, dateEncaissement: aujourdhui() });
    if (moisCourant > 1) await ajouterRecette(request, { client: 'A', montant: 200, dateEncaissement: `${annee}-01-02` });
    const ca = moisCourant > 1 ? 600.5 : 400.5;
    const nombre = moisCourant > 1 ? 3 : 2;
    await ouvrir(page);
    await expect(valeur(page, 'annee')).toHaveText(euros(ca));
    await expect(valeur(page, 'mois')).toHaveText(euros(400.5));
    await expect(valeur(page, 'moyenne')).toHaveText(euros(Math.round((ca / nombre) * 100) / 100));
    await expect(page.locator('.indicateur.principal .compteurs')).toHaveText(`${nombre} encaissements, 2 clients`);
    await expect(page.locator('.indicateur', { hasText: 'Panier moyen' }).locator('.indicateur-detail')).toHaveText(`Sur ${nombre} encaissements`);
    // Pas d'achats pour une activité libérale.
    await expect(valeur(page, 'achats')).toHaveCount(0);
  });

  test('seule la carte de l’année est pleine, de la couleur du menu, dans les deux thèmes', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'mixte' });
    await ajouterRecette(request, { montant: 120, categorie: 'prestations' });
    await ajouterRecette(request, { montant: 80, categorie: 'ventes' });
    await ouvrir(page);
    const mesure = () => page.evaluate(() => {
      const encre = (variable) => {
        const temoin = document.createElement('span');
        temoin.style.color = `var(${variable})`;
        document.body.append(temoin);
        const couleur = getComputedStyle(temoin).color;
        temoin.remove();
        return couleur;
      };
      const principal = document.querySelector('.indicateur.principal');
      const couleur = (selecteur, propriete = 'color') => getComputedStyle(principal.querySelector(selecteur))[propriete];
      return {
        couleurDuMenu: getComputedStyle(principal).backgroundImage === getComputedStyle(document.querySelector('.rail')).backgroundImage,
        autresNeutres: [...document.querySelectorAll('.indicateur:not(.principal)')]
          .every((carte) => getComputedStyle(carte).backgroundImage === 'none'),
        chiffreEnClair: couleur('.indicateur-valeur') === encre('--carte-forte-texte'),
        // Ventes et prestations éclaircies pour rester lisibles sur le bleu nuit.
        ventesLisibles: couleur('.repartition .ventes', 'backgroundColor') === encre('--carte-forte-vente')
      };
    });
    const attendu = { couleurDuMenu: true, autresNeutres: true, chiffreEnClair: true, ventesLisibles: true };
    await expect.poll(mesure).toEqual(attendu);
    await page.locator('#bouton-theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(mesure).toEqual(attendu);
  });

  test('activité qui revend : les achats de l’année, et « Nouvel achat »', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'ventes' });
    await ajouterAchat(request, { montant: 80 });
    await ajouterAchat(request, { montant: 20 });
    await ouvrir(page);
    await expect(valeur(page, 'achats')).toHaveText(euros(100));
    await expect(page.locator('.indicateur', { hasText: 'Achats en' }).locator('.indicateur-detail')).toHaveText('2 achats au registre');
    await page.locator('.entete-page a', { hasText: 'Nouvel achat' }).click();
    await expect(page.locator('dialog.panneau[open] #titre-panneau')).toHaveText('Nouvel achat');
  });

  test('activité mixte : la répartition ventes, prestations et non catégorisé', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'mixte' });
    await ajouterRecette(request, { montant: 300, categorie: 'prestations' });
    await ajouterRecette(request, { montant: 100, categorie: 'ventes' });
    await ajouterRecette(request, { montant: 50, categorie: '' });
    await ouvrir(page);
    const legende = page.locator('.indicateur.principal .legende');
    await expect(legende.locator('.cle-prestations')).toHaveText(`Prestations ${euros(300)}`);
    await expect(legende.locator('.cle-ventes')).toHaveText(`Ventes ${euros(100)}`);
    await expect(legende.locator('.cle-neutre')).toHaveText(`Non catégorisé ${euros(50)}`);
    await expect(page.locator('.repartition')).toHaveAttribute('aria-label', 'Prestations 67 %, Ventes 22 %, Non catégorisé 11 %');
    await expect(page.locator('.carte-plafonds')).toContainText(`1 recette de ${annee} sans catégorie`);
    // Le graphique empile les trois séries.
    await expect(page.locator('.pied-graphique .cle')).toHaveCount(3);
  });
});

test.describe('graphique mensuel', () => {
  test('douze colonnes, une bulle au survol, le tableau des chiffres à la demande', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { montant: 250 });
    await ouvrir(page);
    const colonnes = page.locator('.graphique .colonne');
    await expect(colonnes).toHaveCount(12);
    await expect(page.locator('.graphique .colonne.avenir')).toHaveCount(12 - moisCourant);
    const courante = page.locator(`.graphique .colonne[data-mois="${moisCourant}"]`);
    await expect(courante).toHaveAttribute('aria-label', new RegExp(`${nomMois(moisCourant)} ${annee} : ${euros(250).replace(/\s/g, '\\s')} encaissés`));
    await courante.locator('.zone').hover();
    const bulle = page.locator('.bulle-graphique');
    await expect(bulle).toHaveClass(/visible/);
    await expect(bulle).toContainText('1 encaissement');
    await page.mouse.move(5, 5);
    await expect(bulle).not.toHaveClass(/visible/);

    await page.locator('.carte-graphique [data-vue="tableau"]').click();
    await expect(page.locator('.carte-graphique .graphique')).toBeHidden();
    const tableau = page.locator('.carte-graphique .vue-tableau table');
    await expect(tableau.locator('tbody tr')).toHaveCount(moisCourant);
    await expect(tableau.locator('tfoot')).toContainText(euros(250));
    await page.locator('.carte-graphique [data-vue="graphique"]').click();
    await expect(page.locator('.carte-graphique .graphique')).toBeVisible();
  });

  test('un mois choisi au clic ou au clavier ouvre ses recettes', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { client: 'Ce mois', montant: 40 });
    await ouvrir(page);
    await page.locator(`.graphique .colonne[data-mois="${moisCourant}"] .zone`).click();
    await expect(page).toHaveURL(/#\/recettes$/);
    await attendrePage(page);
    await expect(page.locator('#annee-recettes .annee-choisie')).toHaveText(String(annee));
    await expect(page.locator('.filtres-actifs .pastille-filtre')).toHaveText(nomMois(moisCourant).replace(/^./, (c) => c.toUpperCase()));
    await expect(page.locator('#registre tbody tr[data-id]')).toHaveCount(1);

    await ouvrir(page);
    await page.locator(`.graphique .colonne[data-mois="${moisCourant}"]`).focus();
    await expect(page.locator('.bulle-graphique')).toHaveClass(/visible/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/recettes$/);
  });

  test('l’année précédente se dessine en retrait, et se coupe dans les options', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { montant: 100 });
    await ajouterRecette(request, { montant: 700, dateEncaissement: `${annee - 1}-${String(moisCourant).padStart(2, '0')}-01` });
    await ouvrir(page);
    await expect(page.locator('.graphique .barre-precedente')).toHaveCount(1);
    await expect(page.locator('.pied-graphique .cle-precedente')).toHaveText(`${annee - 1} ${eurosEntiers(700)}`);
    await expect(page.locator(`.graphique .colonne[data-mois="${moisCourant}"]`)).toHaveAttribute('aria-label', new RegExp(`${annee - 1} : ${euros(700).replace(/\s/g, '\\s')}`));
    await page.locator('.carte-graphique [data-vue="tableau"]').click();
    await expect(page.locator('.vue-tableau thead')).toContainText(String(annee - 1));

    await ouvrir(page, 'parametres?section=options');
    await page.locator('#o-comparerAnneePrecedente').click();
    await expect(page.locator('#o-comparerAnneePrecedente')).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => (await parametres(request)).comparerAnneePrecedente).toBe(false);
    await ouvrir(page);
    await expect(page.locator('.graphique .barre-precedente')).toHaveCount(0);
    await expect(page.locator('.pied-graphique .cle-precedente')).toHaveCount(0);
  });
});

test.describe('choix de l’année', () => {
  test('les flèches passent d’une année à l’autre, titres et montants suivent', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request, { montant: 100 });
    await ajouterRecette(request, { client: 'Ancien', montant: 900, dateEncaissement: `${annee - 1}-06-15` });
    await ouvrir(page);
    const choix = page.locator('#annee-tableau');
    await expect(choix.locator('.annee-choisie')).toHaveText(String(annee));
    await choix.locator('[data-pas="-1"]').click();
    await expect(choix.locator('.annee-choisie')).toHaveText(String(annee - 1));
    await expect(valeur(page, 'annee')).toHaveText(euros(900));
    await expect(page.locator('#titre-dernieres')).toHaveText(`Dernières recettes de ${annee - 1}`);
    await expect(page.locator('#titre-mois')).toHaveText(`Chiffre d’affaires mensuel ${annee - 1}`);
    await expect(page.locator('.indicateur', { hasText: 'CA de' }).or(page.locator('.indicateur', { hasText: 'CA d’' })).first()).toContainText(String(annee - 1));
    // Une année passée : tous ses mois sont écoulés, aucun « à venir ».
    await expect(page.locator('.graphique .colonne.avenir')).toHaveCount(0);
    // La flèche garde le focus du clavier, même redessinée.
    await expect(choix.locator('[data-pas="1"]')).toHaveAttribute('aria-disabled', 'false');
    await choix.locator('[data-pas="1"]').focus();
    await page.keyboard.press('Enter');
    await expect(choix.locator('.annee-choisie')).toHaveText(String(annee));
    await expect(choix.locator('[data-pas="1"]')).toBeFocused();
    await expect(valeur(page, 'annee')).toHaveText(euros(100));
  });

  test('sans année passée, pas de sélecteur', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request);
    await ouvrir(page);
    await expect(page.locator('#annee-tableau')).toHaveCount(0);
  });
});

test.describe('déclaration URSSAF', () => {
  test('sans rythme choisi, la carte invite à le choisir', async ({ page, request }) => {
    await configurer(request, { periodiciteUrssaf: '' });
    await ouvrir(page);
    await expect(page.locator('#declaration')).toContainText('Indiquez votre rythme de déclaration');
    await page.locator('#declaration a', { hasText: 'Choisir mon rythme' }).click();
    await expect(page).toHaveURL(/#\/parametres\?section=regime/);
  });

  test('une période à déclarer : le montant, sa copie, « C’est fait », puis l’annulation', async ({ page, request }) => {
    await configurer(request, { periodiciteUrssaf: 'mois', dernierePeriodeDeclaree: idMois(-2) });
    await ajouterRecette(request, { montant: 1234.56, dateEncaissement: dansMois(-1, 10) });
    const periode = periodeDepuisId(idMois(-1));
    await ouvrir(page);
    const carte = page.locator('#declaration');
    await expect(carte.locator('.declaration-periode')).toHaveText(libellePeriode(periode));
    await expect(carte.locator('.etat')).toHaveText('À déclarer');
    await expect(carte.locator('.echeance')).toContainText('À déclarer avant le');
    await expect(carte.locator('.ligne-montant.principal .valeur')).toHaveText(eurosEntiers(1235));
    await expect(page.locator('.entete-page .sous-titre')).toContainText('Votre déclaration URSSAF pour');
    await expect(page.locator('#navigation .alerte-nav')).toHaveText('À faire');

    await carte.locator('[data-copier]').click();
    await expect(carte.locator('[data-copier]')).toContainText('Copié');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('1235');

    await carte.locator('#declarer').click();
    await expect(carte.locator('#declarer')).toContainText('Déclarée');
    await expect(carte.locator('.bandeau-retour')).toContainText(`${libellePeriode(periode)} déclaré`);
    await expect(carte.locator('.etat')).toHaveText('En cours');
    await expect(page.locator('#navigation .alerte-nav')).toBeHidden();
    expect((await parametres(request)).dernierePeriodeDeclaree).toBe(idMois(-1));
    await carte.locator('.bandeau-retour button').click();
    await expect(carte.locator('.etat')).toHaveText('À déclarer');
    expect((await parametres(request)).dernierePeriodeDeclaree).toBe(idMois(-2));
  });

  test('une échéance passée se dit en retard, jusque dans le menu', async ({ page, request }) => {
    await configurer(request, { periodiciteUrssaf: 'mois', dernierePeriodeDeclaree: idMois(-3) });
    await ouvrir(page);
    await expect(page.locator('#declaration .etat')).toHaveText('En retard');
    await expect(page.locator('#declaration .echeance.retard')).toContainText('dépassée de');
    await expect(page.locator('#navigation .alerte-nav')).toHaveText('En retard');
    await expect(page.locator('.entete-page .sous-titre')).toContainText('l’échéance du');
    await page.locator('#declaration a', { hasText: 'Voir le détail' }).click();
    await expect(page).toHaveURL(new RegExp(`#/urssaf\\?periode=${idMois(-2)}`));
  });

  test('sans type d’activité, pas d’estimation mais une invitation', async ({ page, request }) => {
    await configurer(request, { typeActivite: '', periodiciteUrssaf: 'mois', dernierePeriodeDeclaree: idMois(-1) });
    await ajouterRecette(request);
    await ouvrir(page);
    await expect(page.locator('#declaration .note-carte')).toContainText('Indiquez votre type d’activité');
    await expect(page.locator('.carte-plafonds')).toContainText('Indiquez votre type d’activité pour suivre votre plafond');
  });
});

test.describe('recettes qui reviennent chaque mois', () => {
  async function preparer(request) {
    await configurer(request);
    for (const decalage of [-1, -2, -3]) {
      await ajouterRecette(request, { client: 'Abonné', libelle: 'Maintenance', montant: 49, modeReglement: 'cheque', dateEncaissement: dansMois(decalage, 1) });
    }
    // De quoi afficher l'année en cours, même en janvier.
    await ajouterRecette(request, { client: 'Autre', libelle: 'Divers', montant: 10 });
  }

  test('« Ajouter » ouvre la saisie pré-remplie, datée d’aujourd’hui', async ({ page, request }) => {
    await preparer(request);
    await ouvrir(page);
    const bande = page.locator('.a-renouveler');
    await expect(bande.locator('.ligne-renouveler')).toHaveCount(1);
    await expect(bande).toContainText(`Maintenance, Abonné, ${euros(49)}`);
    await bande.locator('a', { hasText: 'Ajouter' }).click();
    const p = page.locator('dialog.panneau[open]');
    await expect(p.locator('#f-client')).toHaveValue('Abonné');
    await expect(p.locator('#f-libelle')).toHaveValue('Maintenance');
    await expect(p.locator('#f-montant')).toHaveValue('49,00');
    await expect(p.locator('#f-mode')).toHaveValue('cheque');
    await expect(p.locator('input[name="dateEncaissement"]')).toHaveValue(aujourdhui());
    await p.locator('[type="submit"]').click();
    await expect(page.locator('dialog.panneau')).toHaveCount(0);
    await ouvrir(page);
    await expect(page.locator('.a-renouveler')).toHaveCount(0);
  });

  test('« Ne plus proposer » l’écarte, « Annuler » la remet', async ({ page, request }) => {
    await preparer(request);
    await ouvrir(page);
    await page.locator('.a-renouveler [data-ecarter]').click();
    await expect(page.locator('.a-renouveler .ligne-renouveler')).toHaveCount(0);
    await expect(page.locator('.a-renouveler .bandeau-retour')).toContainText('Ne sera plus proposée');
    expect((await parametres(request)).recurrencesEcartees).toHaveLength(1);
    await page.locator('.a-renouveler .bandeau-retour button').click();
    await expect(page.locator('.a-renouveler .ligne-renouveler')).toHaveCount(1);
    expect((await parametres(request)).recurrencesEcartees).toHaveLength(0);
  });

  test('l’option coupe les propositions', async ({ page, request }) => {
    await preparer(request);
    await configurer(request, { proposerRenouvellements: false });
    await ouvrir(page);
    await expect(page.locator('.a-renouveler')).toHaveCount(0);
  });
});

test.describe('dernières recettes', () => {
  test('une ligne ouvre le registre sur la recette, mise en avant', async ({ page, request }) => {
    await configurer(request);
    const r = await ajouterRecette(request, { client: 'Cliquable', libelle: 'Ligne', montant: 12 });
    await ouvrir(page);
    const tr = page.locator('.carte-dernieres tbody tr', { hasText: 'Cliquable' });
    await tr.locator('td.montant').click();
    await expect(page).toHaveURL(new RegExp(`#/recettes\\?voir=${r.id}`));
    await attendrePage(page);
    await expect(page.locator(`#registre tr[data-id="${r.id}"]`)).toHaveClass(/nouvelle/);
    // Le lien du client se suit aussi au clavier.
    await ouvrir(page);
    await page.locator('.carte-dernieres .lien-ligne').first().focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`#/recettes\\?voir=${r.id}`));
  });

  test('« Voir toutes les recettes » mène au registre', async ({ page, request }) => {
    await configurer(request);
    await ajouterRecette(request);
    await ouvrir(page);
    await page.locator('.lien-suite').click();
    await expect(page).toHaveURL(/#\/recettes$/);
  });
});

test.describe('suivi des seuils', () => {
  test('les jauges du plafond et de la franchise de TVA, puis l’alerte à l’approche', async ({ page, request }) => {
    await configurer(request, { typeActivite: 'liberal' });
    const { plafondMicro, franchiseTva } = bilanSeuils(1, 'liberal', 0, annee);
    await ajouterRecette(request, { montant: 1000 });
    await ouvrir(page);
    const carte = page.locator('.carte-plafonds');
    await expect(carte.locator('[role="meter"]')).toHaveCount(2);
    await expect(carte.locator('.regle').first()).toContainText(`${eurosEntiers(1000)} / ${eurosEntiers(plafondMicro.seuil)}`);
    await expect(carte.locator('.reste').first()).toHaveText(`Il reste ${eurosEntiers(plafondMicro.seuil - 1000)}`);

    // À 90 % du seuil de TVA, l'alerte apparaît.
    await ajouterRecette(request, { montant: Math.round(franchiseTva.seuil * 0.9) - 1000 });
    await page.reload();
    await attendrePage(page);
    await expect(carte.locator('.regle-note.attention')).toContainText('Vous approchez du seuil de franchise de TVA (90 %)');
    // Au-delà du seuil de base : la franchise reste jusqu'au 31 décembre.
    await ajouterRecette(request, { montant: Math.round(franchiseTva.seuil * 0.15) });
    await page.reload();
    await attendrePage(page);
    await expect(carte.locator('.regle-note.depasse')).toContainText('Seuil de base dépassé');
  });

  test('l’option masque la carte, les dernières recettes prennent la place', async ({ page, request }) => {
    await configurer(request, { suiviSeuils: false });
    await ajouterRecette(request);
    await ouvrir(page);
    await expect(page.locator('.carte-plafonds')).toHaveCount(0);
    await expect(page.locator('.carte-dernieres')).toHaveClass(/pleine/);
  });

  test('la bulle d’aide s’ouvre au survol, au clavier et au clic', async ({ page, request }) => {
    await configurer(request);
    await ouvrir(page);
    const declencheur = page.locator('.carte-plafonds .declencheur-infobulle');
    const bulle = page.locator('.carte-plafonds .bulle-aide');
    await declencheur.hover();
    await expect(bulle).toHaveClass(/visible/);
    await page.mouse.move(5, 5);
    await expect(bulle).not.toHaveClass(/visible/);
    await declencheur.focus();
    await expect(bulle).toHaveClass(/visible/);
    await expect(declencheur).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await page.locator('h1').click();
    await expect(bulle).not.toHaveClass(/visible/);
    await declencheur.click();
    await page.mouse.move(5, 5);
    await expect(bulle).toHaveClass(/visible/);
    await page.locator('h1').click();
    await expect(bulle).not.toHaveClass(/visible/);
  });
});

test('le jeu de démonstration remplit chaque carte du tableau de bord', async ({ page, request }) => {
  const reponse = await request.post('/api/demo', { data: {} });
  expect(reponse.ok()).toBe(true);
  await ouvrir(page);
  await expect(page.locator('.graphique .colonne')).toHaveCount(12);
  await expect(page.locator('.graphique .barre-precedente').first()).toBeVisible();
  await expect(page.locator('.carte-dernieres tbody tr').first()).toBeVisible();
  await expect(page.locator('.carte-plafonds [role="meter"]').first()).toBeVisible();
  await expect(page.locator('#declaration .declaration-periode')).toBeVisible();
  await expect(page.locator('#annee-tableau')).toBeVisible();
  const { recettes } = await lister(request, '/api/recettes');
  expect(recettes.length).toBeGreaterThan(20);
});
