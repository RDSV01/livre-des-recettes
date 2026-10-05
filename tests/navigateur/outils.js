/**
 * Outils communs aux tests de l'interface (Playwright).
 *
 * Chaque test reçoit sa propre application (`creerApp`), démarrée dans ce
 * processus sur un port libre, avec un livre neuf dans un dossier temporaire :
 * jamais le vrai livre ni ses sauvegardes. Les clés et disques proposés pour
 * la copie externe sont des dossiers temporaires, et le réseau extérieur est
 * coupé : l'annuaire des entreprises répond depuis une table fictive, GitHub
 * ne répond pas.
 *
 * Toute erreur dans la page (exception, `console.error`, réponse 5xx du
 * serveur) fait échouer le test qui l'a provoquée.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as base, expect } from '@playwright/test';
import { creerApp } from '../../src/app.js';
import { ecouterSurUnPortLibre } from '../../src/lancement.js';
import { lireZip } from '../../src/exports/zip.js';
import { creerStockage } from '../../src/stockage.js';
import { validerParametres, validerRecette } from '../../src/validation.js';
import { aujourdHuiIso, formaterDate } from '../../src/partage/dates.js';
import { formaterMontant, formaterMontantEntier } from '../../src/partage/montants.js';

export { expect };

// ---- Numéros d'entreprise -----------------------------------------------------------

/** Complète un numéro par sa clé de Luhn : SIREN et SIRET fictifs mais valides. */
export function avecCle(debut) {
  for (let chiffre = 0; chiffre <= 9; chiffre += 1) {
    const numero = `${debut}${chiffre}`;
    let somme = 0;
    for (let i = 0; i < numero.length; i += 1) {
      let n = Number(numero[numero.length - 1 - i]);
      if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
      somme += n;
    }
    if (somme % 10 === 0) return numero;
  }
  throw new Error(`Aucune clé pour ${debut}`);
}

/** Entreprises que l'annuaire fictif connaît. */
export const ANNUAIRE = (() => {
  const fiche = (debutSiren, nic, nom) => {
    const siren = avecCle(debutSiren);
    return { siren, siret: avecCle(`${siren}${nic}`), nom };
  };
  return {
    lumen: fiche('81234567', '0001', 'STUDIO LUMEN'),
    boulangerie: fiche('42424242', '0002', 'BOULANGERIE DES HALLES'),
    atelier: fiche('53311122', '0003', 'ATELIER DU CANAL')
  };
})();

/** Un SIRET valide que l'annuaire fictif ne connaît pas. */
export const SIRET_INCONNU = avecCle(`${avecCle('99988877')}0004`);

// ---- Réseau extérieur coupé ------------------------------------------------------------

const fetchLocal = globalThis.fetch;
globalThis.fetch = async (cible, options) => {
  const adresse = String(cible instanceof Request ? cible.url : cible);
  if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(adresse)) return fetchLocal(cible, options);
  if (adresse.startsWith('https://recherche-entreprises.api.gouv.fr/')) {
    const q = new URL(adresse).searchParams.get('q') ?? '';
    const trouvee = Object.values(ANNUAIRE).find((e) => e.siren === q.slice(0, 9));
    const results = trouvee ? [{ siren: trouvee.siren, nom_complet: trouvee.nom, siege: { siret: trouvee.siret } }] : [];
    return new Response(JSON.stringify({ results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  // GitHub (mises à jour) et tout le reste : hors ligne, comme un ordinateur sans réseau.
  throw new TypeError(`Réseau extérieur coupé pendant les tests : ${adresse}`);
};

// ---- Fichiers ---------------------------------------------------------------------------

/** Un vrai PDF d'une page, minuscule, portant `texte`. */
export function pdf(texte = 'Facture') {
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  const flux = `BT /F1 18 Tf 30 100 Td (${texte.replace(/[()\\]/g, '')}) Tj ET`;
  objets[3] = `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`;
  let corps = '%PDF-1.4\n';
  const positions = objets.map((objet, i) => {
    const position = corps.length;
    corps += `${i + 1} 0 obj\n${objet}\nendobj\n`;
    return position;
  });
  const xref = corps.length;
  corps += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  corps += positions.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('');
  corps += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corps, 'latin1');
}

/** Les noms des fichiers d'une archive ZIP, relue comme le fait l'application. */
export const nomsDansZip = (octets) => lireZip(octets).map((fichier) => fichier.nom);

/** Un fichier à déposer dans un sélecteur de fichiers (`setInputFiles`, `filechooser`). */
export const fichierPdf = (nom = 'facture.pdf', texte = 'Facture') => ({ name: nom, mimeType: 'application/pdf', buffer: pdf(texte) });

// ---- Textes attendus ----------------------------------------------------------------------

/** « 1 234,50 € » tel que l'affiche l'application, espaces insécables compris. */
export const euros = (montant, devise = 'EUR') => formaterMontant(montant, devise);
export const eurosEntiers = (montant, devise = 'EUR') => formaterMontantEntier(montant, devise);
export const dateAffichee = (iso, format = 'JJ/MM/AAAA') => formaterDate(iso, format);
export const aujourdhui = () => aujourdHuiIso();

/** Une date ISO décalée de `jours` par rapport à aujourd'hui (à midi : aucun piège d'heure d'été). */
export function dansJours(jours) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + jours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Le même jour (ou le dernier du mois) `mois` mois plus tôt ou plus tard. */
export function dansMois(mois, jour = new Date().getDate()) {
  const d = new Date();
  const cible = new Date(d.getFullYear(), d.getMonth() + mois, 1, 12);
  const dernier = new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate();
  cible.setDate(Math.min(jour, dernier));
  return `${cible.getFullYear()}-${String(cible.getMonth() + 1).padStart(2, '0')}-${String(cible.getDate()).padStart(2, '0')}`;
}

/** Identifiant de déclaration du mois décalé de `decalage` (« 2026-07 »). */
export const idMois = (decalage) => dansMois(decalage, 1).slice(0, 7);

// ---- Préparation du livre par l'API ----------------------------------------------------------

async function json(reponse) {
  const corps = await reponse.json().catch(() => null);
  if (!reponse.ok()) throw new Error(`${reponse.status()} ${reponse.url()} : ${JSON.stringify(corps)}`);
  return corps;
}

/** Modifie les paramètres, tout le reste repris tel quel (l'API attend le jeu complet). */
export async function regler(request, modification) {
  const { parametres } = await json(await request.get('/api/parametres'));
  return (await json(await request.put('/api/parametres', { data: { ...parametres, ...modification } }))).parametres;
}

/**
 * Une entreprise configurée, l'accueil guidé déjà fait : l'application
 * s'ouvre sur le tableau de bord.
 */
export function configurer(request, modification = {}) {
  return regler(request, {
    accueil: 'termine',
    prenom: 'Camille',
    nomEntreprise: 'Atelier Test',
    activite: 'Graphisme',
    adresse: '1 rue des Essais, 75001 Paris',
    typeActivite: 'liberal',
    periodiciteUrssaf: 'trimestre',
    ...modification
  });
}

export async function ajouterRecette(request, champs = {}) {
  return (await json(await request.post('/api/recettes', {
    data: {
      dateEncaissement: aujourdHuiIso(),
      client: 'Client Exemple',
      libelle: 'Prestation',
      numeroFacture: '',
      montant: 100,
      modeReglement: 'virement',
      categorie: '',
      ...champs
    }
  }))).recette;
}

export async function ajouterAchat(request, champs = {}) {
  return (await json(await request.post('/api/achats', {
    data: {
      dateReglement: aujourdHuiIso(),
      fournisseur: 'Fournisseur Exemple',
      referenceFacture: '',
      montant: 50,
      modeReglement: 'carte',
      ...champs
    }
  }))).achat;
}

export async function ajouterClient(request, champs = {}) {
  return (await json(await request.post('/api/clients', { data: { nom: 'Client Exemple', siret: '', ...champs } }))).client;
}

/** Joint un PDF à une ligne (`registre` : recettes ou achats). */
export async function joindre(request, registre, id, nom = 'facture.pdf') {
  return json(await request.post(`/api/${registre}/${id}/piece`, {
    data: pdf(nom),
    headers: { 'Content-Type': 'application/pdf', 'X-Nom-Fichier': encodeURIComponent(nom) }
  }));
}

export const chargerDemo = async (request) => json(await request.post('/api/demo', { data: {} }));
export const lister = async (request, chemin) => json(await request.get(chemin));
export const parametres = async (request) => (await json(await request.get('/api/parametres'))).parametres;

// ---- Navigation dans l'application --------------------------------------------------------

/**
 * Ouvre une page de l'application et attend qu'elle soit dessinée (plus de
 * squelette de chargement), son titre `h1` en place.
 */
export async function ouvrir(page, route = '') {
  await page.goto(`/#/${route}`);
  await attendrePage(page);
}

export async function attendrePage(page) {
  await expect(page.locator('#vue .page:not(.squelette) h1').first()).toBeVisible();
  // Le fondu enchaîné entre deux pages est fini : plus rien ne recouvre la nouvelle.
  await page.waitForFunction(() => !document.documentElement.classList.contains('fondu-en-cours'));
}

/** Le panneau de saisie ouvert (recette, achat). */
export const panneau = (page) => page.locator('dialog.panneau[open]').last();

/** Le dernier message éphémère affiché (« toast »). */
export const toast = (page) => page.locator('#toasts .toast').last();

/**
 * Attend un téléchargement déclenché par `action` et rend son nom et son contenu.
 */
export async function telecharger(page, action) {
  const [telechargement] = await Promise.all([page.waitForEvent('download'), action()]);
  const chemin = await telechargement.path();
  return { nom: telechargement.suggestedFilename(), contenu: fs.readFileSync(chemin) };
}

// ---- Livre trouvé au démarrage -----------------------------------------------------------------

/** Le fichier du livre, dans son dossier (voir `src/stockage.js`). */
const NOM_FICHIER = 'livre-des-recettes.json';

/** Les deux recettes du livre préparé avant un incident. */
export const RECETTES_AVANT_INCIDENT = [
  { client: 'Avant Incident', libelle: 'Première', montant: 111 },
  { client: 'Avant Incident', libelle: 'Seconde', montant: 222 }
];

/**
 * Prépare le dossier du livre avant le démarrage de l'application :
 *  - `corrompu` : un livre tenu (sauvegardes comprises), puis son fichier abîmé ;
 *  - `disparu` : le même, puis son fichier supprimé ;
 *  - `illisible` : un dossier à la place du fichier, que le système refuse de
 *    lire comme tel (comme un livre resté dans le nuage).
 */
function preparerLivre(etat, { dossierDonnees, dossierSauvegardes }) {
  if (etat === 'neuf') return;
  const fichier = path.join(dossierDonnees, NOM_FICHIER);
  if (etat === 'illisible') {
    fs.mkdirSync(fichier, { recursive: true });
    return;
  }
  const stockage = creerStockage(dossierDonnees, { dossierSauvegardes });
  stockage.modifierParametres(validerParametres({ nomEntreprise: 'Atelier Test', accueil: 'termine', typeActivite: 'liberal' }).valeurs);
  for (const recette of RECETTES_AVANT_INCIDENT) {
    stockage.ajouterRecette(validerRecette({ dateEncaissement: aujourdHuiIso(), modeReglement: 'virement', ...recette }).valeurs);
  }
  if (etat === 'corrompu') fs.writeFileSync(fichier, '{ "recettes": [ abîmé');
  else if (etat === 'disparu') fs.rmSync(fichier);
  else throw new Error(`État de livre inconnu : ${etat}`);
}

/** Rend lisible un livre préparé `illisible` : le système le rend, intact. */
export function rendreLisible({ dossierDonnees }) {
  const fichier = path.join(dossierDonnees, NOM_FICHIER);
  fs.rmSync(fichier, { recursive: true, force: true });
  fs.writeFileSync(fichier, JSON.stringify({ version: 1, parametres: { nomEntreprise: 'Revenu du nuage', accueil: 'termine' }, recettes: [], achats: [], clients: [] }));
}

// ---- Fixtures -------------------------------------------------------------------------------

export const test = base.extend({
  /** Expressions des erreurs de la page qu'un test provoque exprès. */
  erreursPermises: [[], { option: true }],

  /**
   * Livre trouvé au démarrage de l'application (voir `preparerLivre`) :
   * `'neuf'`, `'corrompu'`, `'disparu'` ou `'illisible'`.
   */
  livreAuDemarrage: ['neuf', { option: true }],

  /** L'application du test : son adresse et ses dossiers. */
  livre: async ({ livreAuDemarrage }, use) => {
    const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'ldr-navigateur-'));
    const dossierDonnees = path.join(racine, 'donnees');
    const dossierSauvegardes = path.join(racine, 'sauvegardes');
    const cle = path.join(racine, 'cle-usb');
    fs.mkdirSync(cle);
    preparerLivre(livreAuDemarrage, { dossierDonnees, dossierSauvegardes });
    const app = creerApp({
      dossierDonnees,
      dossierSauvegardes,
      listerVolumes: async () => [{ chemin: cle, libelle: 'CLE TEST (T:)', amovible: true, taille: 8e9, libre: 4e9 }]
    });
    const serveur = await ecouterSurUnPortLibre(app);
    await use({ url: `http://127.0.0.1:${serveur.address().port}`, racine, dossierDonnees, dossierSauvegardes, cle });
    serveur.closeAllConnections();
    await new Promise((fin) => { serveur.close(fin); });
    fs.rmSync(racine, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  },

  baseURL: async ({ livre }, use) => use(livre.url),

  page: async ({ page, erreursPermises }, use) => {
    const erreurs = [];
    const permise = (texte) => erreursPermises.some((motif) => motif.test(texte));
    page.on('pageerror', (erreur) => { if (!permise(erreur.message)) erreurs.push(`Exception : ${erreur.message}`); });
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const texte = message.text();
      // Une réponse 4xx attendue (doublon refusé, validation) s'inscrit aussi
      // dans la console du navigateur : seules les 5xx comptent (plus bas).
      if (/^Failed to load resource: the server responded with a status of 4\d\d/.test(texte) || permise(texte)) return;
      erreurs.push(`Console : ${texte}`);
    });
    page.on('response', (reponse) => {
      if (reponse.status() >= 500 && !permise(reponse.url())) erreurs.push(`HTTP ${reponse.status()} : ${reponse.url()}`);
    });
    // La fenêtre « Enregistrer sous » du système bloquerait le test : la
    // sauvegarde passe par un téléchargement ordinaire, comme dans Firefox.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
    });
    await use(page);
    expect(erreurs, 'erreurs relevées dans la page').toEqual([]);
  }
});
