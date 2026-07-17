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
 */

import fs from 'node:fs';
import path from 'node:path';

const NOM_VERROU = 'livre-des-recettes.verrou';
const BATTEMENT_MS = 10_000; // rafraîchissement du verrou
const PERIME_MS = 30_000;    // au-delà, le verrou est considéré comme abandonné

/**
 * Pose le verrou sur le dossier de données.
 * Lève une erreur `code: 'VERROU'` si une autre instance est active.
 * Le verrou est retiré automatiquement à l'arrêt du processus.
 */
export function acquerirVerrou(dossierDonnees) {
  fs.mkdirSync(dossierDonnees, { recursive: true });
  const chemin = path.join(dossierDonnees, NOM_VERROU);

  if (fs.existsSync(chemin) && Date.now() - fs.statSync(chemin).mtimeMs < PERIME_MS) {
    throw Object.assign(
      new Error(
        'Le livre des recettes semble déjà ouvert ailleurs (autre fenêtre, ou autre ' +
        'ordinateur partageant ce dossier de données). Fermez l’autre instance, ou ' +
        `supprimez « ${chemin} » s’il s’agit d’une erreur.`
      ),
      { code: 'VERROU' }
    );
  }

  const poser = () => fs.writeFileSync(chemin, String(process.pid), 'utf8');
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

  return liberer;
}
