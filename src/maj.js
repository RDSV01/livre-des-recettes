/**
 * Mise à jour de l'exécutable autonome.
 *
 * L'application interroge les versions publiées sur GitHub (API publique,
 * sans compte ni clé) et, si l'utilisateur le demande, télécharge la nouvelle
 * version et remplace son propre fichier.
 *
 * Trois garde-fous :
 *  - le fichier téléchargé doit provenir des releases du dépôt officiel, et
 *    son empreinte SHA-256 correspondre à celle publiée ;
 *  - l'ancien exécutable est conservé jusqu'au démarrage suivant ;
 *  - l'ancienne version attend que la nouvelle ait bien démarré. Sinon (elle
 *    s'arrête net, ou ne répond pas dans la minute), l'ancienne remet son
 *    exécutable en place, redémarre, et le signale à l'utilisateur.
 *
 * Le dossier de données n'est jamais touché : une mise à jour ne peut pas
 * faire perdre de recettes.
 *
 * Lancée depuis les sources (`npm start`), l'application se contente de
 * signaler la nouvelle version : la mise à jour se fait alors par `git pull`.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

/**
 * Variable d'environnement transmise à la nouvelle version : le fichier
 * qu'elle écrit une fois son serveur à l'écoute (voir `lancement.js`).
 */
export const TEMOIN_MAJ = 'LDR_MAJ_TEMOIN';
/** Temps laissé à la nouvelle version pour démarrer. */
const DELAI_DEMARRAGE_MS = 60_000;
const SUFFIXE_ECHEC = '.echec';
/** Mot laissé à la version rétablie : quelle version n'a pas pu démarrer. */
const FICHIER_ECHEC = path.join(os.tmpdir(), 'livre-des-recettes-maj-echec.json');

const DEPOT = 'RDSV01/livre-des-recettes';
const API_VERSIONS = `https://api.github.com/repos/${DEPOT}/releases/latest`;
const PREFIXE_TELECHARGEMENT = `https://github.com/${DEPOT}/releases/download/`;
export const PAGE_VERSIONS = `https://github.com/${DEPOT}/releases/latest`;

const DELAI_MS = 8000;
const SUFFIXE_ANCIEN = '.ancien';
// Empreinte SHA-256 publiée à côté de chaque exécutable, vérifiée avant tout
// remplacement (voir `.github/workflows/executables.yml`).
const SUFFIXE_EMPREINTE = '.sha256';
// L'API publique de GitHub est limitée à 60 appels par heure et par adresse :
// la réponse est gardée en mémoire pour ne pas la solliciter à chaque
// ouverture de page.
const DUREE_CACHE_MS = 6 * 60 * 60 * 1000;

let cache = null; // { instant, publication }

/** Nom du fichier publié pour le système courant. */
const ACTIF_ATTENDU = {
  win32: 'livre-des-recettes-windows.exe',
  darwin: 'livre-des-recettes-macos',
  linux: 'livre-des-recettes-linux'
}[process.platform];

/**
 * L'application tourne-t-elle en exécutable autonome ? Dans ce cas seulement,
 * elle sait se remplacer elle-même.
 */
export const estExecutable = () => !/^node(\.exe)?$/i.test(path.basename(process.execPath));

/** Compare deux versions « 1.10.2 » : positif si `a` est plus récente que `b`. */
export function comparerVersions(a, b) {
  const morceaux = (v) => String(v).replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [ma, mb] = [morceaux(a), morceaux(b)];
  for (let i = 0; i < Math.max(ma.length, mb.length); i += 1) {
    const difference = (ma[i] ?? 0) - (mb[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Requête JSON courte, qui n'empêche jamais l'application de fonctionner. */
async function lireVersionPubliee() {
  if (cache && Date.now() - cache.instant < DUREE_CACHE_MS) return cache.publication;

  const reponse = await fetch(API_VERSIONS, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'livre-des-recettes' },
    signal: AbortSignal.timeout(DELAI_MS)
  });
  if (!reponse.ok) throw new Error(`GitHub a répondu ${reponse.status}.`);

  const publication = await reponse.json();
  cache = { instant: Date.now(), publication };
  return publication;
}

/**
 * Y a-t-il une version plus récente ? Retourne toujours un objet exploitable,
 * même hors ligne : l'absence de réseau n'est pas une erreur à afficher.
 *
 * @returns {Promise<{disponible: boolean, version: string|null, page: string,
 *   remplacable: boolean, erreur: string|null}>}
 */
export async function chercherMiseAJour(versionActuelle) {
  const base = { disponible: false, version: null, page: PAGE_VERSIONS, remplacable: estExecutable(), erreur: null };
  try {
    const publication = await lireVersionPubliee();
    const version = String(publication.tag_name ?? '').replace(/^v/, '');
    if (!version) return base;
    return { ...base, version, disponible: comparerVersions(version, versionActuelle) > 0 };
  } catch (erreur) {
    return { ...base, erreur: erreur.message };
  }
}

/**
 * Adresse de téléchargement d'un fichier publié, cherché par son nom exact
 * dans la dernière version. Le fichier ne peut venir que des releases du dépôt
 * officiel, jamais d'une URL glissée dans la réponse de l'API.
 */
async function adresseActif(nom) {
  const publication = await lireVersionPubliee();
  const actif = (publication.assets ?? []).find((a) => a.name === nom);
  if (!actif) {
    throw new Error(`Aucun fichier « ${nom} » dans la dernière version publiée.`);
  }
  const adresse = String(actif.browser_download_url ?? '');
  if (!adresse.startsWith(PREFIXE_TELECHARGEMENT)) {
    throw new Error('Adresse de téléchargement inattendue : mise à jour interrompue.');
  }
  return adresse;
}

/**
 * Empreinte SHA-256 attendue du fichier publié, calculée sur la machine de
 * publication et jointe à la version. Le fichier `.sha256` contient le condensé
 * hexadécimal (format `sha256sum`, éventuellement suivi du nom).
 */
async function empreinteAttendue() {
  const adresse = await adresseActif(`${ACTIF_ATTENDU}${SUFFIXE_EMPREINTE}`);
  const reponse = await fetch(adresse, {
    headers: { 'User-Agent': 'livre-des-recettes' },
    signal: AbortSignal.timeout(DELAI_MS)
  });
  if (!reponse.ok) throw new Error(`Empreinte indisponible (${reponse.status}).`);
  const condense = (await reponse.text()).match(/[a-f0-9]{64}/i);
  if (!condense) throw new Error('Empreinte publiée illisible : mise à jour interrompue.');
  return condense[0].toLowerCase();
}

/**
 * Télécharge la nouvelle version et remplace l'exécutable en cours.
 *
 * Un exécutable en cours d'exécution ne peut pas être supprimé sous Windows,
 * mais il peut être renommé : l'ancien est mis de côté et le nouveau prend sa
 * place. L'application tourne encore, sur son ancien fichier, jusqu'au
 * redémarrage.
 *
 * Le fichier téléchargé n'est écrit sur le disque qu'après vérification de son
 * empreinte SHA-256 : elle est calculée localement, sans service tiers, et
 * comparée à celle publiée avec la version. Un fichier altéré ou tronqué est
 * donc rejeté avant de pouvoir remplacer l'application.
 */
export async function appliquerMiseAJour() {
  if (!estExecutable()) {
    throw new Error('Cette installation vient des sources : mettez-la à jour avec « git pull ».');
  }

  const executable = process.execPath;
  const nouveau = `${executable}.nouveau`;
  const ancien = `${executable}${SUFFIXE_ANCIEN}`;

  // Le numéro de version et l'empreinte sont lus d'abord : inutile de
  // télécharger 90 Mo si l'empreinte manque déjà, et plus rien à demander au
  // réseau une fois l'exécutable remplacé.
  const version = String((await lireVersionPubliee()).tag_name ?? '').replace(/^v/, '');
  const attendue = await empreinteAttendue();
  const reponse = await fetch(await adresseActif(ACTIF_ATTENDU), {
    headers: { 'User-Agent': 'livre-des-recettes' },
    signal: AbortSignal.timeout(10 * 60_000)
  });
  if (!reponse.ok) throw new Error(`Téléchargement impossible (${reponse.status}).`);

  const octets = Buffer.from(await reponse.arrayBuffer());
  const reelle = crypto.createHash('sha256').update(octets).digest('hex');
  if (reelle !== attendue) {
    throw new Error('L’empreinte du fichier téléchargé ne correspond pas : mise à jour interrompue par sécurité.');
  }

  fs.writeFileSync(nouveau, octets);
  fs.chmodSync(nouveau, 0o755);

  try {
    fs.rmSync(ancien, { force: true });
    fs.renameSync(executable, ancien);
    fs.renameSync(nouveau, executable);
  } catch (erreur) {
    // Remise en état : l'application reste utilisable dans sa version actuelle.
    if (!fs.existsSync(executable) && fs.existsSync(ancien)) fs.renameSync(ancien, executable);
    fs.rmSync(nouveau, { force: true });
    throw new Error(`Remplacement impossible : ${erreur.message}`);
  }
  return version;
}

/**
 * Attend le signe de la nouvelle version (son témoin écrit) ; faux si elle
 * s'arrête avant, ou ne l'écrit pas dans le délai.
 */
function attendreTemoin(temoin, enfant, delaiMs) {
  return new Promise((resoudre) => {
    let arretee = false;
    enfant.on?.('exit', () => { arretee = true; });
    const debut = Date.now();
    const verifier = () => {
      if (fs.existsSync(temoin)) return resoudre(true);
      if (arretee || Date.now() - debut > delaiMs) return resoudre(false);
      setTimeout(verifier, 300);
    };
    verifier();
  });
}

/** Remet l'ancien exécutable à sa place ; la version fautive est gardée à côté. */
function retablirAncienneVersion() {
  const executable = process.execPath;
  fs.rmSync(`${executable}${SUFFIXE_ECHEC}`, { force: true });
  fs.renameSync(executable, `${executable}${SUFFIXE_ECHEC}`);
  fs.renameSync(`${executable}${SUFFIXE_ANCIEN}`, executable);
}

function lancerExecutable(env) {
  spawn(process.execPath, [], { detached: true, stdio: 'ignore', env }).on('error', () => {}).unref();
}

/**
 * Surveille le démarrage de la nouvelle version et, s'il échoue, rétablit
 * l'ancienne et la relance. Retourne `'reussi'` ou `'retabli'`. Les actions
 * sur les fichiers et les processus sont injectables pour les tests.
 */
export async function surveillerDemarrage({
  temoin, enfant, version = null, delaiMs = DELAI_DEMARRAGE_MS,
  retablir = retablirAncienneVersion, relancer = () => lancerExecutable({ ...process.env, LDR_NO_OPEN: '1', [TEMOIN_MAJ]: '' })
}) {
  if (await attendreTemoin(temoin, enfant, delaiMs)) {
    fs.rmSync(temoin, { force: true });
    return 'reussi';
  }
  try { enfant.kill?.(); } catch { /* déjà arrêtée */ }
  // Même si l'ancien exécutable ne peut pas être remis (fichier retenu), une
  // version est relancée : l'utilisateur ne doit jamais rester sans application.
  try { retablir(); } catch { /* la version en place est relancée telle quelle */ }
  try {
    fs.writeFileSync(FICHIER_ECHEC, JSON.stringify({ version, le: new Date().toISOString() }), 'utf8');
  } catch { /* le rétablissement compte plus que le message */ }
  relancer();
  return 'retabli';
}

/**
 * Relance l'application dans sa nouvelle version, et reste là le temps de
 * vérifier qu'elle démarre (voir `surveillerDemarrage`).
 *
 * `arreter` ferme le serveur et retire le verrou : sans cela, la nouvelle
 * instance trouverait le port occupé et le dossier de données verrouillé.
 * L'appel se fait une fois la réponse envoyée au navigateur, qui attend
 * simplement que le serveur réponde de nouveau.
 */
export function redemarrer({ arreter, version = null } = {}) {
  arreter?.();
  setTimeout(() => {
    const temoin = path.join(os.tmpdir(), `livre-des-recettes-maj-${process.pid}-${Date.now()}.ok`);
    const enfant = spawn(process.execPath, [], {
      detached: true,
      stdio: 'ignore',
      // La page de l'utilisateur se recharge d'elle-même : ouvrir le
      // navigateur lui donnerait un second onglet inutile.
      env: { ...process.env, LDR_NO_OPEN: '1', [TEMOIN_MAJ]: temoin }
    });
    enfant.on('error', () => {});
    enfant.unref();
    surveillerDemarrage({ temoin, enfant, version })
      .catch(() => {})
      .finally(() => process.exit(0));
  }, 300);
}

/**
 * Une mise à jour a-t-elle échoué avant ce démarrage ? Retourne
 * `{ version, le }` une seule fois (le mot est ensuite effacé), sinon `null`.
 */
export function constaterEchecMaj() {
  try {
    const echec = JSON.parse(fs.readFileSync(FICHIER_ECHEC, 'utf8'));
    fs.rmSync(FICHIER_ECHEC, { force: true });
    return echec;
  } catch {
    return null;
  }
}

/**
 * Efface l'exécutable remplacé lors d'une mise à jour précédente (et celui
 * d'une mise à jour qui a échoué). Un antivirus ou l'instance qui s'éteint
 * peut le retenir quelques instants : dans ce cas on n'insiste pas, le
 * prochain démarrage s'en chargera.
 *
 * Juste après une mise à jour, l'ancien exécutable doit rester : l'ancienne
 * version pourrait encore avoir à le remettre en place.
 */
export function nettoyerAncienneVersion() {
  if (!estExecutable() || process.env[TEMOIN_MAJ]) return;
  for (const suffixe of [SUFFIXE_ANCIEN, SUFFIXE_ECHEC]) {
    try {
      fs.rmSync(`${process.execPath}${suffixe}`, { force: true });
    } catch { /* fichier encore verrouillé : sans conséquence */ }
  }
}
