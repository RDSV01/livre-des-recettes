/**
 * Vérification de l'exécutable construit : `npm run verifier:exe`, après
 * `npm run construire:exe`. Le workflow « Vérifier et publier » la lance sur
 * chaque système, avant toute publication.
 *
 * Les autres tests font tourner l'application avec Node. L'exécutable, lui,
 * embarque un script empaqueté où un module peut se comporter autrement (un
 * chemin, une police, un fichier lu à côté du code) : il est donc lancé tel
 * que l'utilisateur le reçoit, et chaque partie qui dépend de l'empaquetage
 * est sollicitée : interface, police, licences, exports PDF, Excel, CSV et
 * .zip, pièces jointes, sauvegarde.
 *
 * Tout ce que l'application écrit (livre, sauvegardes, verrou) reste dans un
 * dossier temporaire, supprimé à la fin.
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PORTS_REFUSES_PAR_LES_NAVIGATEURS } from '../src/lancement.js';
import { lireZip } from '../src/exports/zip.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
const executable = path.resolve(process.argv[2]
  ?? path.join(RACINE, 'dist', `livre-des-recettes${process.platform === 'win32' ? '.exe' : ''}`));
if (!fs.existsSync(executable)) {
  console.error(`Exécutable introuvable : ${executable} (npm run construire:exe)`);
  process.exit(1);
}

/** Un port libre que les navigateurs acceptent : l'application le prend tel quel. */
async function portLibre() {
  for (;;) {
    const port = await new Promise((pret, echec) => {
      const serveur = net.createServer().once('error', echec).listen(0, '127.0.0.1', () => {
        const { port: libre } = serveur.address();
        serveur.close(() => pret(libre));
      });
    });
    if (!PORTS_REFUSES_PAR_LES_NAVIGATEURS.has(port)) return port;
  }
}

const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'ldr-verif-exe-'));
const dossierDonnees = path.join(racine, 'donnees');
const port = await portLibre();
const base = `http://127.0.0.1:${port}`;
// Dossier applicatif et dossier personnel redirigés : sous Windows, macOS et
// Linux, les sauvegardes et le verrou atterrissent eux aussi dans `racine`.
const processus = spawn(executable, [], {
  env: {
    ...process.env, PORT: String(port), LDR_NO_OPEN: '1', LDR_DATA_DIR: dossierDonnees,
    LOCALAPPDATA: racine, XDG_DATA_HOME: racine, HOME: racine, USERPROFILE: racine
  },
  stdio: 'ignore'
});
let arret = null;
processus.on('exit', (code, signal) => { arret = signal ?? code; });
/** Faux dès que l'exécutable s'est arrêté (l'événement arrive pendant une attente). */
const enMarche = () => arret === null;

const resultats = [];
/** `execution` rend `true`, ou ce qui ne va pas. */
async function verifier(nom, execution) {
  try {
    const verdict = await execution();
    resultats.push({ nom, ok: verdict === true, detail: verdict === true ? '' : String(verdict).slice(0, 160) });
  } catch (erreur) {
    resultats.push({ nom, ok: false, detail: `exception : ${erreur.message}` });
  }
}
const appel = (chemin, options = {}) => fetch(`${base}${chemin}`, {
  ...options,
  headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', ...options.headers }
});
const octets = async (chemin) => {
  const reponse = await appel(chemin);
  return { statut: reponse.status, type: reponse.headers.get('content-type') ?? '', corps: Buffer.from(await reponse.arrayBuffer()) };
};
const commencePar = (corps, debut) => {
  const attendu = Buffer.from(debut);
  return corps.subarray(0, attendu.length).equals(attendu);
};

try {
  // ---- Démarrage ------------------------------------------------------------
  let systeme = null;
  for (let i = 0; i < 150 && !systeme && enMarche(); i += 1) {
    try { systeme = await (await appel('/api/systeme')).json(); } catch { await new Promise((r) => { setTimeout(r, 200); }); }
  }
  await verifier('l’exécutable démarre et répond', () => systeme !== null || `aucune réponse (arrêt : ${arret})`);
  if (!systeme) throw new Error('démarrage impossible');
  await verifier(`version ${version}`, () => systeme.version === version || systeme.version);
  const livre = path.join(dossierDonnees, 'livre-des-recettes.json');
  await verifier('livre ouvert dans le dossier demandé', () => systeme.fichierDonnees === livre || systeme.fichierDonnees);

  // ---- Interface et fichiers embarqués --------------------------------------
  for (const chemin of ['/', '/css/style.css', '/css/theme.css', '/js/app.js', '/js/vues/tableau-de-bord.js', '/partage/montants.js']) {
    await verifier(`GET ${chemin}`, async () => (await appel(chemin)).status === 200 || 'statut inattendu');
  }
  await verifier('police Commissioner', async () => {
    const { statut, type, corps } = await octets('/polices/commissioner-latin.woff2');
    return (statut === 200 && type.includes('font/woff2') && commencePar(corps, 'wOF2')) || `${statut} ${type}`;
  });
  await verifier('licences des composants (/licences.txt)', async () => {
    const { statut, corps } = await octets('/licences.txt');
    const texte = corps.toString('utf8');
    return (statut === 200 && texte.includes('Node.js v') && texte.includes('express ')) || `${statut}, ${texte.length} caractères`;
  });

  // ---- Exports, sur le jeu de démonstration --------------------------------
  await verifier('jeu de démonstration chargé et écrit sur le disque', async () =>
    ((await appel('/api/demo', { method: 'POST', body: '{}' })).ok && fs.existsSync(livre)) || 'refusé ou non écrit');
  const annee = new Date().getFullYear();
  for (const [nom, chemin, debut] of [
    ['registre des recettes en PDF', `/api/exports/pdf?annee=${annee}`, '%PDF'],
    ['registre des achats en PDF', `/api/exports/achats/pdf?annee=${annee}`, '%PDF'],
    ['rapport annuel en PDF', `/api/exports/rapport-annuel?annee=${annee}`, '%PDF'],
    ['registre en Excel', `/api/exports/xlsx?annee=${annee}`, 'PK'],
    ['registre en CSV', `/api/exports/csv?annee=${annee}`, '\ufeff']
  ]) {
    await verifier(nom, async () => {
      const { statut, corps } = await octets(chemin);
      return (statut === 200 && corps.length > 500 && commencePar(corps, debut)) || `${statut}, ${corps.length} octets`;
    });
  }
  await verifier('registre et PDF joints dans un .zip', async () => {
    const { statut, corps } = await octets(`/api/exports/zip?annee=${annee}`);
    const fichiers = statut === 200 ? lireZip(corps) : [];
    return fichiers.filter((f) => f.nom.endsWith('.pdf')).length > 1 || `${statut}, ${fichiers.length} fichiers`;
  });
  await verifier('pièce jointe servie', async () => {
    const { recettes } = await (await appel('/api/recettes')).json();
    const avecPdf = recettes.find((r) => r.pieceJointe);
    if (!avecPdf) return 'aucune recette avec PDF dans la démonstration';
    const { statut, corps } = await octets(`/api/recettes/${avecPdf.id}/piece`);
    return (statut === 200 && commencePar(corps, '%PDF')) || `${statut}`;
  });
  await verifier('« Sauvegarder maintenant »', async () => {
    const { statut, corps } = await octets('/api/sauvegarde');
    return (statut === 200 && lireZip(corps).some((f) => f.nom === 'livre-des-recettes.json')) || `${statut}`;
  });
  await verifier('toujours en marche après tout cela', () => enMarche() || `arrêté (${arret})`);
} catch {
  // Déjà consigné dans les résultats.
} finally {
  processus.kill();
  await new Promise((r) => { setTimeout(r, 1000); });
  fs.rmSync(racine, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

const echecs = resultats.filter((r) => !r.ok);
for (const r of echecs) console.error(`  ÉCHEC  ${r.nom}\n         ${r.detail}`);
console.log(`\n${resultats.length - echecs.length}/${resultats.length} vérifications de l'exécutable passées`);
// Sortie explicite : une connexion gardée en vie par `fetch` retiendrait le process.
process.exit(echecs.length ? 1 : 0);
