/**
 * Le registre des achats : saisie et autocomplétion des fournisseurs,
 * modification, duplication, suppression, justificatifs PDF, saisie en série.
 * La mécanique du tableau (filtres, tri, sélection) est celle des recettes,
 * vérifiée dans `recettes.spec.js` ; ici, ce qui est propre aux achats.
 */

import {
  test, expect, configurer, ajouterAchat, joindre, ouvrir, panneau, euros, dateAffichee, aujourdhui, dansJours,
  fichierPdf, lister
} from './outils.js';

const ligne = (page, id) => page.locator(`#registre tbody tr[data-id="${id}"]`);

async function nouveau(page) {
  await page.locator('#nouvel-achat').click();
  const p = panneau(page);
  await expect(p.locator('#titre-panneau')).toHaveText('Nouvel achat');
  return p;
}

test('livre vide : le premier achat, avec son justificatif', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'ventes' });
  await ouvrir(page, 'achats');
  await expect(page.locator('#registre .ligne-vide')).toContainText('Aucun achat pour l’instant.');
  const p = await nouveau(page);
  await expect(p.locator('#f-date')).toHaveValue(dateAffichee(aujourdhui()));
  await p.locator('#f-fournisseur').fill('Grossiste Papier');
  await expect(p.locator('.suggestions .sugg.extra')).toContainText('Nouveau fournisseur « Grossiste Papier »');
  await p.locator('#f-montant').fill('89.9');
  await p.locator('#f-reference').fill('FA-2201');
  await p.locator('#f-mode').selectOption('carte');
  const choix = page.waitForEvent('filechooser');
  await p.locator('[data-piece="choisir"]').click();
  await (await choix).setFiles(fichierPdf('ticket.pdf'));
  await p.locator('[type="submit"]').click();
  await expect(page.locator('dialog.panneau')).toHaveCount(0);
  const { achats } = await lister(request, '/api/achats');
  expect(achats).toHaveLength(1);
  expect(achats[0]).toMatchObject({ fournisseur: 'Grossiste Papier', montant: 89.9, referenceFacture: 'FA-2201', modeReglement: 'carte' });
  expect(achats[0].pieceJointe.nom).toBe('ticket.pdf');
  await expect(ligne(page, achats[0].id).locator('.texte-retour')).toHaveText('Ajouté');
  await expect(ligne(page, achats[0].id).locator('.piece-oui')).toBeVisible();
  await expect(page.locator('#registre tfoot [data-total]')).toHaveText(euros(89.9));
});

test('le fournisseur connu : suggestions, dernier achat et mode de paiement repris', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'ventes' });
  await ajouterAchat(request, { fournisseur: 'Imprimerie Centrale', montant: 120, modeReglement: 'cheque', dateReglement: dansJours(-5) });
  await ouvrir(page, 'achats');
  const p = await nouveau(page);
  await p.locator('#f-fournisseur').fill('impr');
  await expect(p.locator('.suggestions .sugg').first()).toContainText('1 achat, le dernier le');
  await page.keyboard.press('Enter');
  await expect(p.locator('#f-fournisseur')).toHaveValue('Imprimerie Centrale');
  await expect(p.locator('#f-fournisseur-aide')).toContainText(`Dernier achat le ${dateAffichee(dansJours(-5))} : ${euros(120)}`.replace(/\s/g, ' '));
  await expect(p.locator('#f-mode')).toHaveValue('cheque');
  await expect(p.locator('#f-montant')).toBeFocused();
});

test('un montant manquant ou un fournisseur vide sont refusés champ par champ', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'ventes' });
  await ouvrir(page, 'achats');
  const p = await nouveau(page);
  await p.locator('[type="submit"]').click();
  await expect(p.locator('[data-champ="fournisseur"]')).toHaveClass(/invalide/);
  await expect(p.locator('[data-champ="montant"]')).toHaveClass(/invalide/);
  expect((await lister(request, '/api/achats')).achats).toHaveLength(0);
});

test('modifier un achat, puis annuler la modification', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'ventes' });
  const a = await ajouterAchat(request, { fournisseur: 'Encre & Co', montant: 30 });
  await ouvrir(page, 'achats');
  await ligne(page, a.id).locator('td.client').click();
  const p = panneau(page);
  await expect(p.locator('#titre-panneau')).toHaveText('Modifier l’achat');
  await p.locator('#f-montant').fill('35');
  await p.locator('[type="submit"]').click();
  await expect(ligne(page, a.id).locator('.texte-retour')).toHaveText('Modifié');
  await expect(ligne(page, a.id).locator('td.montant')).toHaveText(euros(35));
  await ligne(page, a.id).locator('[data-annuler-retour]').click();
  await expect(ligne(page, a.id).locator('td.montant')).toHaveText(euros(30));
});

test('dupliquer un achat récurrent, puis supprimer l’original et annuler', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'ventes' });
  const a = await ajouterAchat(request, { fournisseur: 'Hébergeur', montant: 9.99, referenceFacture: 'H-1', dateReglement: dansJours(-30) });
  await ouvrir(page, 'achats');
  await ligne(page, a.id).locator('[data-action="menu"]').click();
  await page.locator('.menu-contextuel [role="menuitem"]', { hasText: 'Dupliquer (achat récurrent)' }).click();
  const p = panneau(page);
  await expect(p.locator('.panneau-tete p')).toHaveText('Copie d’un achat récurrent, datée d’aujourd’hui.');
  await expect(p.locator('#f-reference')).toHaveValue('');
  await expect(p.locator('input[name="dateReglement"]')).toHaveValue(aujourdhui());
  await p.locator('[type="submit"]').click();
  await expect(page.locator('#registre tbody tr[data-id]')).toHaveCount(2);

  await ligne(page, a.id).locator('[data-action="menu"]').click();
  await page.locator('.menu-contextuel [role="menuitem"]', { hasText: 'Supprimer' }).click();
  await expect(page.locator('tr.place-retiree')).toContainText('Achat de');
  await expect(page.locator('tr.place-retiree')).toContainText('(Hébergeur) supprimé');
  await page.locator('[data-restaurer-place]').click();
  await expect(ligne(page, a.id).locator('.texte-retour')).toHaveText('Restauré');
  expect((await lister(request, '/api/achats')).achats).toHaveLength(2);
});

test('Ctrl+Entrée enchaîne les achats', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'ventes' });
  await ouvrir(page, 'achats');
  const p = await nouveau(page);
  for (const [fournisseur, montant] of [['Un', '1'], ['Deux', '2']]) {
    await p.locator('#f-fournisseur').fill(fournisseur);
    await p.locator('#f-montant').fill(montant);
    await p.locator('#f-montant').press('Control+Enter');
    await expect(p.locator('#f-fournisseur')).toHaveValue('');
    await expect(p.locator('#f-fournisseur')).toBeFocused();
  }
  // Panneau remis à zéro : il se ferme sans demander d'abandonner quoi que ce soit.
  await p.locator('.panneau-pied [data-fermer]').click();
  await expect(page.locator('dialog.panneau')).toHaveCount(0);
  expect((await lister(request, '/api/achats')).achats.map((a) => a.fournisseur).sort()).toEqual(['Deux', 'Un']);
});

test('le justificatif se joint depuis le menu, se voit et se retire', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'ventes' });
  const a = await ajouterAchat(request);
  await ouvrir(page, 'achats');
  await ligne(page, a.id).locator('[data-action="menu"]').click();
  const choix = page.waitForEvent('filechooser');
  await page.locator('.menu-contextuel [role="menuitem"]', { hasText: 'Joindre le justificatif (PDF)' }).click();
  await (await choix).setFiles(fichierPdf('justificatif.pdf'));
  await expect(ligne(page, a.id).locator('.texte-retour')).toHaveText('PDF joint');
  await ligne(page, a.id).locator('[data-action="menu"]').click();
  await page.locator('.menu-contextuel [role="menuitem"]', { hasText: 'Voir le justificatif (PDF)' }).click();
  await expect(panneau(page).locator('#titre-piece')).toHaveText('justificatif.pdf');
  await panneau(page).locator('[data-retirer]').click();
  await expect(ligne(page, a.id).locator('.texte-retour')).toHaveText('PDF retiré');
  expect((await lister(request, '/api/achats')).achats[0].pieceJointe).toBeFalsy();
});

test('le registre des achats filtre et cherche comme celui des recettes', async ({ page, request }) => {
  await configurer(request, { typeActivite: 'ventes' });
  const a = await ajouterAchat(request, { fournisseur: 'Électricité', montant: 60, modeReglement: 'virement' });
  await ajouterAchat(request, { fournisseur: 'Fournitures', montant: 15, modeReglement: 'especes' });
  await joindre(request, 'achats', a.id);
  await ouvrir(page, 'achats');
  await page.locator('#filtre-q').fill('electricite');
  await expect(page.locator('#registre tbody tr[data-id]')).toHaveCount(1);
  await expect(page.locator('#registre mark')).toHaveText('Électricité');
  await page.locator('#filtre-q').fill('');
  await page.locator('[data-voir-sans-piece]').click();
  await expect(page.locator('#registre tbody tr[data-id]')).toHaveCount(1);
  await expect(page.locator('#lien-exporter')).toHaveAttribute('href', '#/exports?registre=achats');
});
