/**
 * Mise à jour de l'exécutable autonome.
 *
 * L'application interroge les versions publiées sur GitHub (API publique,
 * sans compte ni clé) et, si l'utilisateur le demande, télécharge la nouvelle
 * version et remplace son propre fichier.
 *
 * Deux garde-fous :
 *  - le fichier téléchargé doit provenir des releases du dépôt officiel ;
 *  - l'ancien exécutable est conservé jusqu'au démarrage suivant, donc un
 *    remplacement raté se répare en renommant un fichier.
 *
 * Le dossier de données n'est jamais touché : une mise à jour ne peut pas
 * faire perdre de recettes.
 *
 * Lancée depuis les sources (`npm start`), l'application se contente de
 * signaler la nouvelle version : la mise à jour se fait alors par `git pull`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEPOT = 'RDSV01/livre-des-recettes';
const API_VERSIONS = `https://api.github.com/repos/${DEPOT}/releases/latest`;
const PREFIXE_TELECHARGEMENT = `https://github.com/${DEPOT}/releases/download/`;
export const PAGE_VERSIONS = `https://github.com/${DEPOT}/releases/latest`;

const DELAI_MS = 8000;
const SUFFIXE_ANCIEN = '.ancien';
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

/** Adresse de téléchargement du fichier publié pour ce système. */
async function adresseTelechargement() {
  const publication = await lireVersionPubliee();
  const actif = (publication.assets ?? []).find((a) => a.name === ACTIF_ATTENDU);
  if (!actif) {
    throw new Error(`Aucun fichier « ${ACTIF_ATTENDU} » dans la dernière version publiée.`);
  }
  const adresse = String(actif.browser_download_url ?? '');
  // Le fichier ne peut venir que des releases du dépôt officiel.
  if (!adresse.startsWith(PREFIXE_TELECHARGEMENT)) {
    throw new Error('Adresse de téléchargement inattendue : mise à jour interrompue.');
  }
  return adresse;
}

/**
 * Télécharge la nouvelle version et remplace l'exécutable en cours.
 *
 * Un exécutable en cours d'exécution ne peut pas être supprimé sous Windows,
 * mais il peut être renommé : l'ancien est mis de côté et le nouveau prend sa
 * place. L'application tourne encore, sur son ancien fichier, jusqu'au
 * redémarrage.
 */
export async function appliquerMiseAJour() {
  if (!estExecutable()) {
    throw new Error('Cette installation vient des sources : mettez-la à jour avec « git pull ».');
  }

  const executable = process.execPath;
  const nouveau = `${executable}.nouveau`;
  const ancien = `${executable}${SUFFIXE_ANCIEN}`;

  const reponse = await fetch(await adresseTelechargement(), {
    headers: { 'User-Agent': 'livre-des-recettes' },
    signal: AbortSignal.timeout(10 * 60_000)
  });
  if (!reponse.ok) throw new Error(`Téléchargement impossible (${reponse.status}).`);

  fs.writeFileSync(nouveau, Buffer.from(await reponse.arrayBuffer()));
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
}

/**
 * Relance l'application dans sa nouvelle version.
 *
 * `arreter` ferme le serveur et retire le verrou : sans cela, la nouvelle
 * instance trouverait le port occupé et le dossier de données verrouillé.
 * L'appel se fait une fois la réponse envoyée au navigateur, qui attend
 * simplement que le serveur réponde de nouveau.
 */
export function redemarrer({ arreter } = {}) {
  arreter?.();
  setTimeout(() => {
    spawn(process.execPath, [], {
      detached: true,
      stdio: 'ignore',
      // La page de l'utilisateur se recharge d'elle-même : ouvrir le
      // navigateur lui donnerait un second onglet inutile.
      env: { ...process.env, LDR_NO_OPEN: '1' }
    }).unref();
    process.exit(0);
  }, 300);
}

/**
 * Efface l'exécutable remplacé lors d'une mise à jour précédente. Un antivirus
 * ou l'instance qui s'éteint peut le retenir quelques instants : dans ce cas
 * on n'insiste pas, le prochain démarrage s'en chargera.
 */
export function nettoyerAncienneVersion() {
  if (!estExecutable()) return;
  try {
    fs.rmSync(`${process.execPath}${SUFFIXE_ANCIEN}`, { force: true });
  } catch { /* fichier encore verrouillé : sans conséquence */ }
}
