/**
 * Verrou d'instance : empêche deux applications d'écrire dans le même dossier
 * de données en même temps (deux lancements sur la même machine, ou deux
 * ordinateurs partageant un dossier synchronisé), ce qui écraserait
 * silencieusement des recettes.
 *
 * Principe : un fichier `livre-des-recettes.verrou` est posé dans le dossier
 * de données et rafraîchi régulièrement. Un verrou dont la dernière mise à
 * jour est trop ancienne est considéré comme abandonné (application plantée)
 * et repris sans erreur.
 *
 * Le verrou retient aussi le port de l'instance en cours : un second
 * lancement sait ainsi ouvrir la fenêtre de celle qui tourne déjà, au lieu
 * de se contenter d'un refus.
 */

import fs from 'node:fs';
import path from 'node:path';

const NOM_VERROU = 'livre-des-recettes.verrou';
const BATTEMENT_MS = 10_000; // rafraîchissement du verrou
const PERIME_MS = 30_000;    // au-delà, le verrou est considéré comme abandonné

/**
 * Lit un verrou existant : `{ pid, port }`, chaque valeur pouvant être
 * `null`. Les versions antérieures n'y écrivaient que le numéro de processus.
 */
function lireVerrou(chemin) {
  const vide = { pid: null, port: null };
  try {
    const contenu = JSON.parse(fs.readFileSync(chemin, 'utf8'));
    if (Number.isInteger(contenu)) return { pid: contenu, port: null };
    return {
      pid: Number.isInteger(contenu?.pid) ? contenu.pid : null,
      port: Number.isInteger(contenu?.port) ? contenu.port : null
    };
  } catch {
    return vide; // fichier tronqué ou illisible
  }
}

/**
 * L'application qui a posé le verrou tourne-t-elle encore ? Un arrêt brutal
 * (gestionnaire des tâches, coupure) laisse un verrou tout frais derrière
 * lui : le reconnaître évite de faire patienter l'utilisateur sans raison.
 */
function processusVivant(pid) {
  if (pid === null) return true; // sans information, on respecte le verrou
  try {
    process.kill(pid, 0); // n'envoie aucun signal : teste seulement l'existence
    return true;
  } catch (erreur) {
    return erreur.code === 'EPERM'; // il existe, mais appartient à quelqu'un d'autre
  }
}

/**
 * Pose le verrou sur le dossier de données.
 *
 * Lève une erreur `code: 'VERROU'` si une autre instance est active ; cette
 * erreur porte le `port` de l'instance en question quand il est connu.
 * Le verrou est retiré automatiquement à l'arrêt du processus.
 *
 * @returns {{ liberer: () => void, noterPort: (port: number) => void }}
 */
export function acquerirVerrou(dossierDonnees) {
  fs.mkdirSync(dossierDonnees, { recursive: true });
  const chemin = path.join(dossierDonnees, NOM_VERROU);

  const recent = fs.existsSync(chemin) && Date.now() - fs.statSync(chemin).mtimeMs < PERIME_MS;
  const precedent = recent ? lireVerrou(chemin) : null;
  if (recent && processusVivant(precedent.pid)) {
    throw Object.assign(
      new Error(
        'Le livre des recettes semble déjà ouvert ailleurs (autre fenêtre, ou autre ' +
        'ordinateur partageant ce dossier de données). Fermez l’autre instance, ou ' +
        `supprimez « ${chemin} » s’il s’agit d’une erreur.`
      ),
      { code: 'VERROU', port: precedent.port }
    );
  }

  let port = null;
  const poser = () => fs.writeFileSync(chemin, JSON.stringify({ pid: process.pid, port }), 'utf8');
  poser();
  const battement = setInterval(() => {
    try { poser(); } catch { /* disque momentanément indisponible : réessayé au battement suivant */ }
  }, BATTEMENT_MS);
  battement.unref(); // le battement ne doit pas empêcher le processus de s'arrêter

  let libere = false;
  const liberer = () => {
    if (libere) return;
    libere = true;
    clearInterval(battement);
    try { fs.unlinkSync(chemin); } catch { /* déjà retiré */ }
  };
  process.on('exit', liberer);
  process.on('SIGINT', () => { liberer(); process.exit(0); });
  process.on('SIGTERM', () => { liberer(); process.exit(0); });

  return {
    liberer,
    /** Inscrit le port réellement écouté, une fois le serveur démarré. */
    noterPort(valeur) {
      port = valeur;
      try { poser(); } catch { /* réécrit au battement suivant */ }
    }
  };
}
