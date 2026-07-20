/**
 * Vérification de bout en bout : `npm run verifier`.
 *
 * Démarre l'application sur des dossiers temporaires isolés, puis exerce chaque
 * route, les cas d'erreur et les tentatives d'abus, en observant les réponses
 * réelles. Complète `npm test` (qui teste les modules un à un) par un parcours
 * du serveur assemblé, tel qu'un navigateur le sollicite.
 *
 * Aucune donnée de l'utilisateur n'est touchée : tout vit dans des dossiers
 * jetables, supprimés à la fin.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerApp } from '../src/app.js';

const dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), 'ldr-verif-donnees-'));
const dossierSauvegardes = fs.mkdtempSync(path.join(os.tmpdir(), 'ldr-verif-sauv-'));

const app = creerApp({ dossierDonnees, dossierSauvegardes });
const serveur = await new Promise((pret) => {
  const instance = app.listen(0, '127.0.0.1', () => pret(instance));
});
const base = `http://127.0.0.1:${serveur.address().port}`;

const resultats = [];
async function verifier(nom, attendu, execution) {
  try {
    const obtenu = await execution();
    const ok = typeof attendu === 'function' ? attendu(obtenu) : attendu === obtenu;
    resultats.push({ nom, ok, detail: ok ? '' : `attendu ${attendu}, obtenu ${JSON.stringify(obtenu)}`.slice(0, 120) });
  } catch (erreur) {
    resultats.push({ nom, ok: false, detail: `exception : ${erreur.message}` });
  }
}

const appel = (chemin, options = {}) => fetch(`${base}${chemin}`, {
  ...options,
  headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', ...(options.headers || {}) }
});
const statut = (chemin, options) => appel(chemin, options).then((r) => r.status);
const json = (chemin, options) => appel(chemin, options).then((r) => r.json());

// ---- 1. Lectures de base ----------------------------------------------------
for (const chemin of [
  '/api/systeme', '/api/tableau-de-bord', '/api/recettes', '/api/recettes/annees',
  '/api/achats', '/api/achats/annees', '/api/clients', '/api/parametres', '/api/sauvegardes',
  '/api/urssaf?annee=2026&type=annee'
]) {
  await verifier(`GET ${chemin}`, 200, () => statut(chemin));
}

// ---- 2. Interface servie ----------------------------------------------------
for (const chemin of ['/', '/css/style.css', '/js/app.js', '/js/preferences-vues.js', '/partage/doublons.js']) {
  await verifier(`GET ${chemin}`, 200, () => statut(chemin));
}

// ---- 3. Cycle de vie d'une recette + validation ----------------------------
const recette = {
  dateEncaissement: '2026-03-15', client: 'Client Vérif', libelle: 'Prestation',
  numeroFacture: 'V-1', montant: 1234.56, modeReglement: 'virement', categorie: 'prestations'
};
let idRecette = null;
await verifier('POST recette valide', 201, async () => {
  const r = await appel('/api/recettes', { method: 'POST', body: JSON.stringify(recette) });
  idRecette = (await r.json()).recette?.id;
  return r.status;
});
await verifier('la recette est relue', 1234.56, async () => {
  const { recettes } = await json('/api/recettes');
  return recettes.find((r) => r.id === idRecette)?.montant;
});
await verifier('PUT recette', 200, () => statut(`/api/recettes/${idRecette}`, { method: 'PUT', body: JSON.stringify({ ...recette, montant: 99.99 }) }));
for (const [cas, corps] of Object.entries({
  'date absente': { ...recette, dateEncaissement: '' },
  'date impossible': { ...recette, dateEncaissement: '2026-02-31' },
  'montant négatif': { ...recette, montant: -1 },
  'mode inconnu': { ...recette, modeReglement: 'bitcoin' },
  'corps vide': {}
})) {
  await verifier(`POST recette refusée : ${cas}`, 400, () => statut('/api/recettes', { method: 'POST', body: JSON.stringify(corps) }));
}

// ---- 4. Cycle de vie d'un achat + validation -------------------------------
const achat = { dateReglement: '2026-03-10', fournisseur: 'Fournisseur Vérif', referenceFacture: 'FA-1', modeReglement: 'carte', montant: 250 };
let idAchat = null;
await verifier('POST achat valide', 201, async () => {
  const r = await appel('/api/achats', { method: 'POST', body: JSON.stringify(achat) });
  idAchat = (await r.json()).achat?.id;
  return r.status;
});
await verifier('PUT achat', 200, () => statut(`/api/achats/${idAchat}`, { method: 'PUT', body: JSON.stringify({ ...achat, montant: 300 }) }));
for (const [cas, corps] of Object.entries({
  'fournisseur absent': { ...achat, fournisseur: '' },
  'montant négatif': { ...achat, montant: -5 },
  'corps vide': {}
})) {
  await verifier(`POST achat refusé : ${cas}`, 400, () => statut('/api/achats', { method: 'POST', body: JSON.stringify(corps) }));
}

// ---- 5. Le total des achats remonte au tableau de bord ---------------------
await verifier('le tableau de bord additionne les achats', (v) => Number(v) >= 300, async () => {
  const stats = await json('/api/tableau-de-bord?annee=2026');
  return stats.achatsAnnee;
});

// ---- 6. Import des recettes -------------------------------------------------
const ligneRecette = { dateEncaissement: '2026-04-01', client: 'Import R', libelle: 'Ligne', numeroFacture: 'IR-1', montant: 42, modeReglement: 'especes' };
await verifier('import recettes en simulation n’écrit rien', 0, async () =>
  (await json('/api/recettes/import', { method: 'POST', body: JSON.stringify({ lignes: [ligneRecette], simulation: true }) })).importees);
await verifier('import recettes réel', 1, async () =>
  (await json('/api/recettes/import', { method: 'POST', body: JSON.stringify({ lignes: [ligneRecette] }) })).importees);
await verifier('import recettes détecte le doublon', 1, async () =>
  (await json('/api/recettes/import', { method: 'POST', body: JSON.stringify({ lignes: [ligneRecette] }) })).doublons.length);
await verifier('import recettes : liste vide refusée', 400, () => statut('/api/recettes/import', { method: 'POST', body: JSON.stringify({ lignes: [] }) }));

// ---- 7. Import des achats (nouveau) ----------------------------------------
const ligneAchat = { dateReglement: '2026-04-02', fournisseur: 'Import A', referenceFacture: 'IA-1', montant: 88, modeReglement: 'carte' };
await verifier('import achats en simulation n’écrit rien', 0, async () =>
  (await json('/api/achats/import', { method: 'POST', body: JSON.stringify({ lignes: [ligneAchat], simulation: true }) })).importees);
await verifier('import achats réel', 1, async () =>
  (await json('/api/achats/import', { method: 'POST', body: JSON.stringify({ lignes: [ligneAchat] }) })).importees);
await verifier('import achats détecte le doublon', 1, async () =>
  (await json('/api/achats/import', { method: 'POST', body: JSON.stringify({ lignes: [ligneAchat] }) })).doublons.length);
await verifier('import achats : le résumé de doublon est générique', true, async () => {
  const r = await json('/api/achats/import', { method: 'POST', body: JSON.stringify({ lignes: [ligneAchat], simulation: true }) });
  const d = r.doublons[0];
  return d.date === ligneAchat.dateReglement && d.tiers === ligneAchat.fournisseur;
});

// ---- 8. Exports (contenu, pas seulement statut) ----------------------------
for (const [registre, colonnes] of [['', ['Date', 'Client', 'Montant']], ['/achats', ['Date', 'Fournisseur', 'Montant']]]) {
  await verifier(`export${registre}/csv contient ses colonnes`, true, async () => {
    const reponse = await appel(`/api/exports${registre}/csv?annee=2026`);
    if (reponse.status !== 200) return `statut ${reponse.status}`;
    const texte = Buffer.from(await reponse.arrayBuffer()).toString('utf8');
    return colonnes.every((c) => texte.includes(c));
  });
  for (const format of ['xlsx', 'pdf']) {
    await verifier(`export${registre}/${format} non vide`, (n) => Number(n) > 100, async () => {
      const reponse = await appel(`/api/exports${registre}/${format}?annee=2026`);
      return reponse.status === 200 ? (await reponse.arrayBuffer()).byteLength : 0;
    });
  }
}
// L'injection de formule est désamorcée à l'export CSV.
await verifier('export CSV neutralise les formules', true, async () => {
  await appel('/api/recettes', { method: 'POST', body: JSON.stringify({ ...recette, numeroFacture: 'V-2', libelle: '=1+1' }) });
  const texte = Buffer.from(await (await appel('/api/exports/csv?annee=2026')).arrayBuffer()).toString('utf8');
  return texte.includes(' =1+1') && !texte.includes(';=1+1');
});

// ---- 9. Jeu de démonstration (nouveau) -------------------------------------
await verifier('la démo est refusée sur un livre non vide', 409, () => statut('/api/demo', { method: 'POST', body: '{}' }));

// ---- 10. Sécurité : chemins de restauration --------------------------------
for (const nom of ['../secret.json', '..\\secret.json', '/etc/passwd', 'pas-une-sauvegarde.txt', '']) {
  await verifier(`restauration refusée : ${nom || '(vide)'}`, (s) => s === 400 || s === 404, () =>
    statut('/api/sauvegardes/restaurer', { method: 'POST', body: JSON.stringify({ fichier: nom }) }));
}

// ---- 11. Protection contre les requêtes extérieures ------------------------
await verifier('POST cross-site refusé', 403, () => statut('/api/recettes', {
  method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' }, body: JSON.stringify(recette)
}));
await verifier('GET cross-site autorisé', 200, () => statut('/api/recettes', { headers: { 'Sec-Fetch-Site': 'cross-site' } }));

// ---- 12. Robustesse ---------------------------------------------------------
await verifier('JSON malformé : 400', 400, () => statut('/api/recettes', { method: 'POST', body: '{cassé' }));
await verifier('route API inconnue : 404', 404, () => statut('/api/inexistant'));

// ---- 13. Suppressions et intégrité finale ----------------------------------
await verifier('DELETE recette', (s) => s === 200 || s === 204, () => statut(`/api/recettes/${idRecette}`, { method: 'DELETE' }));
await verifier('DELETE achat', (s) => s === 200 || s === 204, () => statut(`/api/achats/${idAchat}`, { method: 'DELETE' }));
await verifier('le fichier de données reste sain', false, async () => Boolean((await json('/api/systeme')).corruption));

// ---- Rapport ----------------------------------------------------------------
serveur.close();
serveur.closeAllConnections?.();
fs.rmSync(dossierDonnees, { recursive: true, force: true });
fs.rmSync(dossierSauvegardes, { recursive: true, force: true });

const echecs = resultats.filter((r) => !r.ok);
for (const r of echecs) console.error(`  ÉCHEC  ${r.nom}\n         ${r.detail}`);
console.log(`\n${resultats.length - echecs.length}/${resultats.length} vérifications passées`);
if (echecs.length) console.error(`${echecs.length} échec(s).`);

// Sortie explicite : le serveur est fermé, mais une connexion HTTP gardée en
// vie par `fetch` pourrait sinon retenir le process sur les runners Unix et
// bloquer la CI. Le rapport ci-dessus est déjà écrit.
process.exit(echecs.length ? 1 : 0);
