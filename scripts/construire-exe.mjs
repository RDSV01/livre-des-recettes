/**
 * Construit l'exécutable autonome : `npm run construire:exe`.
 *
 * Trois étapes, sans magie :
 *  1. l'interface (`public/` et `src/partage/`) est convertie en un module
 *     JavaScript qui la porte en mémoire, pour qu'un seul fichier suffise ;
 *  2. esbuild réunit le serveur et ses dépendances en un seul script ;
 *  3. Node en fait une « single executable application » (SEA) : le script
 *     est injecté dans une copie de `node` par postject.
 *
 * Le résultat est produit dans `dist/`. Un exécutable ne peut être construit
 * que pour le système sur lequel tourne la commande (le `node` utilisé est
 * celui qui sert de socle).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { NtExecutable, NtExecutableResource, Data, Resource } from 'resedit';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..');
const DIST = path.join(RACINE, 'dist');

const { version, name, description } = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
const ICONE = path.join(RACINE, 'assets', 'icone.ico');
// Langue déclarée pour les ressources Windows. Peu importe laquelle, à
// condition qu'il n'en reste qu'une : Windows choisit sinon selon la langue
// du système, et pourrait retomber sur les ressources d'origine de Node.
const LANGUE = 1033;
// Types de ressources Windows (icône, groupe d'icônes, informations de version).
const TYPE_ICONE = 3;
const TYPE_GROUPE_ICONES = 14;
const TYPE_VERSION = 16;

const TYPES_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

/** Liste récursive des fichiers d'un dossier, chemins relatifs en URL. */
function listerFichiers(dossier, prefixe = '') {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const complet = path.join(dossier, entree.name);
    const url = `${prefixe}/${entree.name}`;
    return entree.isDirectory() ? listerFichiers(complet, url) : [{ complet, url }];
  });
}

/**
 * Étape 1 : le module des actifs. Les fichiers sont encodés en base64 pour
 * traverser sans dommage l'empaquetage (et rester binaires si besoin).
 */
function genererActifs() {
  const fichiers = [
    ...listerFichiers(path.join(RACINE, 'public')),
    ...listerFichiers(path.join(RACINE, 'src', 'partage'), '/partage')
  ];

  const entrees = fichiers.map(({ complet, url }) => {
    const type = TYPES_MIME[path.extname(url).toLowerCase()] ?? 'application/octet-stream';
    const base64 = fs.readFileSync(complet).toString('base64');
    return `  '${url}': { type: '${type}', contenu: Buffer.from('${base64}', 'base64') }`;
  });

  const module = `/**
 * Interface embarquée dans l'exécutable : fichier GÉNÉRÉ par
 * \`npm run construire:exe\`, ne pas modifier à la main.
 */

export const ACTIFS = {
${entrees.join(',\n')}
};
`;
  fs.writeFileSync(path.join(ICI, 'actifs-generes.mjs'), module);
  console.log(`  Interface embarquée : ${fichiers.length} fichiers.`);
}

/** Étape 2 : un seul script CommonJS, dépendances comprises. */
async function empaqueter() {
  await build({
    entryPoints: [path.join(ICI, 'entree-exe.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile: path.join(DIST, 'livre-des-recettes.cjs'),
    define: {
      // La version n'est plus lisible dans package.json une fois embarquée.
      'process.env.LDR_VERSION': JSON.stringify(version),
      // `import.meta` n'existe pas au format CommonJS : les modules basculent
      // alors sur des chemins relatifs à l'exécutable (voir `src/app.js`).
      'import.meta.url': '""'
    },
    alias: {
      // Cette variante de PDFKit embarque les polices standard du PDF,
      // que la version habituelle lit dans ses fichiers .afm.
      pdfkit: 'pdfkit/js/pdfkit.standalone.js'
    },
    logLevel: 'warning'
  });
  const taille = fs.statSync(path.join(DIST, 'livre-des-recettes.cjs')).size;
  console.log(`  Script empaqueté : ${Math.round(taille / 1024)} Ko.`);
}

/**
 * Donne son identité à l'exécutable Windows : l'icône de l'application, et
 * les informations affichées par le gestionnaire de tâches ou la fenêtre de
 * propriétés du fichier (sans quoi il se présenterait comme « Node.js »).
 */
function habillerExecutable(executable) {
  // `node.exe` est signé par ses auteurs ; cette signature ne survit de toute
  // façon pas à l'injection du script, elle est donc écartée ici.
  const binaire = NtExecutable.from(fs.readFileSync(executable), { ignoreCert: true });
  const ressources = NtExecutableResource.from(binaire);

  // L'icône et la fiche d'identité de `node.exe` sont retirées d'abord :
  // laissées en place, elles cohabiteraient avec les nôtres dans une autre
  // langue, et Windows afficherait l'une ou l'autre selon le système.
  ressources.entries = ressources.entries.filter(
    (e) => e.type !== TYPE_ICONE && e.type !== TYPE_GROUPE_ICONES && e.type !== TYPE_VERSION
  );

  const icone = Data.IconFile.from(fs.readFileSync(ICONE));
  Resource.IconGroupEntry.replaceIconsForResource(
    ressources.entries, 1, LANGUE, icone.icons.map((i) => i.data)
  );

  const infos = Resource.VersionInfo.createEmpty();
  infos.setFileVersion(...version.split('.').map(Number), 0, LANGUE);
  infos.setProductVersion(...version.split('.').map(Number), 0, LANGUE);
  infos.setStringValues({ lang: LANGUE, codepage: 1200 }, {
    ProductName: 'Livre des recettes',
    FileDescription: description,
    OriginalFilename: `${name}.exe`,
    LegalCopyright: 'Licence MIT'
  });
  infos.outputToResourceEntries(ressources.entries);

  ressources.outputResource(binaire);
  fs.writeFileSync(executable, Buffer.from(binaire.generate()));
  console.log('  Icône et identité de l’application appliquées.');
}

/**
 * Windows ouvre une fenêtre de console pour tout programme marqué « console »
 * dans son en-tête, ce dont hérite la copie de `node.exe`. Basculer ce
 * marqueur sur « interface graphique » suffit à lancer l'application sans
 * fenêtre noire : elle ne s'adresse de toute façon qu'au navigateur.
 *
 * Le champ tient sur deux octets, à position fixe dans l'en-tête PE :
 * adresse de l'en-tête (offset 0x3C), puis signature (4) + en-tête COFF (20)
 * + 68 octets d'en-tête optionnel.
 */
function masquerFenetreConsole(executable) {
  const SOUS_SYSTEME_GRAPHIQUE = 2;
  const binaire = fs.readFileSync(executable);
  if (binaire.toString('latin1', 0, 2) !== 'MZ') {
    throw new Error('En-tête PE introuvable : exécutable inattendu.');
  }
  const enTetePe = binaire.readUInt32LE(0x3c);
  if (binaire.toString('latin1', enTetePe, enTetePe + 4) !== 'PE\0\0') {
    throw new Error('Signature PE invalide : exécutable inattendu.');
  }
  const positionSousSysteme = enTetePe + 4 + 20 + 68;
  binaire.writeUInt16LE(SOUS_SYSTEME_GRAPHIQUE, positionSousSysteme);
  fs.writeFileSync(executable, binaire);
  console.log('  Fenêtre de console désactivée.');
}

/** Étape 3 : injection du script dans une copie de l'exécutable Node. */
function fabriquerExecutable() {
  const suffixe = process.platform === 'win32' ? '.exe' : '';
  const executable = path.join(DIST, `${name}${suffixe}`);
  const configuration = path.join(DIST, 'sea-config.json');

  fs.writeFileSync(configuration, JSON.stringify({
    main: path.join(DIST, 'livre-des-recettes.cjs'),
    output: path.join(DIST, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true
  }, null, 2));

  execFileSync(process.execPath, ['--experimental-sea-config', configuration], { stdio: 'inherit' });
  fs.copyFileSync(process.execPath, executable);

  // macOS refuse un binaire dont la signature ne correspond plus au contenu :
  // elle est retirée avant l'injection, puis réapposée localement.
  const surMac = process.platform === 'darwin';
  if (surMac) {
    execFileSync('codesign', ['--remove-signature', executable], { stdio: 'inherit' });
  }

  // postject est appelé par son script Node plutôt que par `npx` : les
  // chemins contenant des espaces passeraient mal par le shell de Windows.
  execFileSync(process.execPath, [
    path.join(RACINE, 'node_modules', 'postject', 'dist', 'cli.js'),
    executable, 'NODE_SEA_BLOB', path.join(DIST, 'sea-prep.blob'),
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ...(surMac ? ['--macho-segment-name', 'NODE_SEA'] : [])
  ], { stdio: 'inherit' });

  // L'habillage vient APRÈS l'injection : appliqué avant, il réorganise les
  // ressources du fichier et postject signale ensuite une table de
  // relocation incohérente (« Relocation corrupted »).
  if (process.platform === 'win32') {
    habillerExecutable(executable);
    masquerFenetreConsole(executable);
  }

  // La signature doit être apposée en dernier : toute retouche du fichier
  // l'invaliderait.
  if (surMac) {
    execFileSync('codesign', ['--sign', '-', executable], { stdio: 'inherit' });
  }

  const taille = fs.statSync(executable).size;
  console.log(`  Exécutable : ${executable} (${Math.round(taille / 1024 / 1024)} Mo).`);
}

console.log(`Construction de l'exécutable v${version}`);
fs.mkdirSync(DIST, { recursive: true });
genererActifs();
await empaqueter();
fabriquerExecutable();
console.log('Terminé.');
