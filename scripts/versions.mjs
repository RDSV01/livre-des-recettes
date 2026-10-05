/**
 * Tout est-il à sa dernière version ? `npm run versions`, lancé aussi par
 * `npm test`.
 *
 * Vérifie les modules npm (dépendances et outils de développement), les
 * versions imposées à leurs sous-dépendances (`overrides`), les actions des
 * workflows GitHub, et l'absence de faille connue dans les modules livrés
 * avec l'application (`npm audit`). Échoue s'il en reste une en retard ou une
 * faille, en disant quoi faire. Le Node de la machine est seulement signalé :
 * son installation regarde le développeur, pas le projet.
 *
 * Sans réseau, rien ne peut être comparé : le script le dit et laisse passer.
 */

import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const paquet = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));

/**
 * Lance npm (des arguments écrits ici, jamais venus d'ailleurs) et rend sa
 * sortie, même quand il signale un retard par son code de sortie.
 */
function npm(...args) {
  return new Promise((resoudre, rejeter) => {
    exec(`npm ${args.join(' ')}`, { cwd: RACINE, maxBuffer: 1 << 24 }, (erreur, sortie, erreurs) => {
      if (erreur && !sortie.trim()) rejeter(new Error(erreurs.trim() || erreur.message));
      else resoudre(sortie);
    });
  });
}

/** Une réponse JSON de l'API publique de GitHub (le jeton de la CI évite sa limite de débit). */
async function github(chemin) {
  const jeton = process.env.GITHUB_TOKEN;
  const reponse = await fetch(`https://api.github.com/${chemin}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'livre-des-recettes', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    signal: AbortSignal.timeout(15_000)
  });
  if (!reponse.ok) throw new Error(`GitHub a répondu ${reponse.status} pour ${chemin}`);
  return reponse.json();
}

const majeure = (version) => Number(String(version).replace(/^v/, '').split('.')[0]);
const sansPrefixe = (version) => String(version).replace(/^[v^~>=<\s]+/, '');

const retards = [];
const avertissements = [];

async function verifierModules() {
  const enRetard = JSON.parse((await npm('outdated', '--json')) || '{}');
  for (const [nom, { current, latest }] of Object.entries(enRetard)) {
    if (current !== latest) retards.push(`${nom} ${current ?? '(absent)'} → ${latest} : npm install ${nom}@latest${paquet.devDependencies?.[nom] ? ' --save-dev' : ''}`);
  }
}

async function verifierOverrides() {
  for (const [nom, plage] of Object.entries(paquet.overrides ?? {})) {
    const derniere = (await npm('view', nom, 'version')).trim();
    if (sansPrefixe(plage) !== derniere) retards.push(`${nom} imposé en ${plage} → ${derniere} : « overrides » de package.json, puis npm install`);
  }
}

async function verifierActions() {
  const dossier = path.join(RACINE, '.github', 'workflows');
  const vues = new Map();
  for (const fichier of fs.readdirSync(dossier).filter((f) => /\.ya?ml$/.test(f))) {
    for (const [, action, reference, commentaire] of fs.readFileSync(path.join(dossier, fichier), 'utf8')
      .matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@([\w.-]+)(?:\s*#\s*(v[\d.]+))?/g)) {
      if (!vues.has(action)) vues.set(action, (await github(`repos/${action}/releases/latest`)).tag_name);
      const derniere = vues.get(action);
      // Épinglée par empreinte : la version est dite en commentaire.
      const epinglee = /^[0-9a-f]{40}$/.test(reference);
      const aJour = epinglee ? commentaire === derniere : majeure(reference) === majeure(derniere);
      if (!aJour) retards.push(`${action}@${epinglee ? (commentaire ?? reference) : reference} → ${derniere} : ${fichier}`);
    }
  }
}

/** Les modules embarqués dans l'exécutable : aucune faille connue n'y est tolérée. */
async function verifierFailles() {
  const rapport = JSON.parse((await npm('audit', '--omit=dev', '--json')) || '{}');
  const { total = 0 } = rapport.metadata?.vulnerabilities ?? {};
  if (total > 0) retards.push(`${total} faille(s) connue(s) dans les modules livrés : npm audit --omit=dev, puis mise à jour`);
}

async function signalerNode() {
  const versions = await (await fetch('https://nodejs.org/dist/index.json', { signal: AbortSignal.timeout(15_000) })).json();
  const lts = versions.find((v) => v.lts)?.version;
  if (lts && lts !== process.version) avertissements.push(`Node ${process.version} sur cette machine, dernière LTS ${lts} (https://nodejs.org).`);
}

let horsLigne = false;
for (const verification of [verifierModules, verifierOverrides, verifierActions, verifierFailles, signalerNode]) {
  try {
    await verification();
  } catch (erreur) {
    horsLigne = true;
    avertissements.push(`Vérification impossible (${verification.name}) : ${erreur.message}`);
  }
}

for (const message of avertissements) console.log(`  Attention : ${message}`);
if (retards.length > 0) {
  console.log('\n  Pas à la dernière version :');
  for (const retard of retards) console.log(`  - ${retard}`);
  console.log('');
  process.exit(1);
}
console.log(horsLigne
  ? '  Versions : vérification incomplète, sans réseau.'
  : '  Versions : tout est à jour (modules, versions imposées, actions GitHub), sans faille connue.');
