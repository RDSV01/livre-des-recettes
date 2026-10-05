/**
 * Les licences de ce que l'exécutable embarque : Node.js et les modules npm
 * de l'application, sous-modules compris. Leurs licences (MIT, ISC, BSD,
 * Apache) demandent que leur texte accompagne chaque copie distribuée ; la
 * construction de l'exécutable joint donc ce texte à ses actifs, servi à
 * l'adresse `/licences.txt`.
 *
 * Installée depuis les sources, l'application n'en a pas besoin : `npm`
 * télécharge chaque module avec sa licence.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/** Fichiers où un module dépose sa licence et ses mentions obligatoires. */
const MENTIONS = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

const trait = '='.repeat(78);
const bloc = (titre, texte) => `${trait}\n${titre}\n${trait}\n\n${texte.trim()}`;

/** Chaque module de production, une fois, avec ses textes de licence. */
function modules(racine) {
  const arbre = JSON.parse(execSync('npm ls --omit=dev --all --json --long', { cwd: racine, encoding: 'utf8', maxBuffer: 1 << 26 }));
  const vus = new Map();
  const parcourir = (noeud) => {
    for (const [nom, module] of Object.entries(noeud.dependencies ?? {})) {
      if (module.path && !vus.has(module.path)) {
        const textes = fs.readdirSync(module.path).filter((f) => MENTIONS.test(f)).sort()
          .map((f) => fs.readFileSync(path.join(module.path, f), 'utf8').trim());
        vus.set(module.path, bloc(`${nom} ${module.version} (licence ${module.license ?? 'non précisée'})`,
          textes.join('\n\n') || `Licence ${module.license ?? 'non précisée'} déclarée par le module, sans texte joint.`));
      }
      // Toujours plus loin : un module vu « dédoublonné » n'avait pas ses sous-modules.
      parcourir(module);
    }
  };
  parcourir(arbre);
  return [...vus.values()].sort();
}

/** La licence du Node.js embarqué : à côté du `node` qui construit, sinon sur le dépôt de Node. */
async function licenceNode() {
  const dossier = path.dirname(process.execPath);
  const locale = [path.join(dossier, 'LICENSE'), path.join(dossier, '..', 'LICENSE')].find((f) => fs.existsSync(f));
  if (locale) return fs.readFileSync(locale, 'utf8');
  const reponse = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`);
  if (!reponse.ok) throw new Error(`Licence de Node.js ${process.version} introuvable (${reponse.status}).`);
  return reponse.text();
}

/**
 * Le texte complet, joint à l'exécutable. `lireLicenceNode` se remplace
 * dans les tests, qui n'ont pas forcément de réseau.
 */
export async function licencesEmbarquees(racine, { lireLicenceNode = licenceNode } = {}) {
  const blocs = [
    'Livre des recettes : licences des composants embarqués dans l\'exécutable.',
    'La licence de Livre des recettes lui-même est dans le fichier LICENSE du projet.',
    bloc(`Node.js ${process.version}`, await lireLicenceNode()),
    ...modules(racine)
  ];
  return `${blocs.join('\n\n')}\n`;
}
