/**
 * Archive ZIP minimale, sans dépendance : les fichiers y sont rangés tels
 * quels (méthode « stocké », sans compression). Les PDF et les classeurs
 * Excel sont déjà compressés, les recompresser ne gagnerait presque rien.
 *
 * Noms en UTF-8 (drapeau 11 du format), lus correctement par l'explorateur
 * de Windows, le Finder et les outils usuels. Pas de ZIP64 : l'archive reste
 * sous 4 Go, ce qu'un livre de micro-entreprise ne dépasse pas.
 *
 * `lireZip` relit une sauvegarde : celles de l'application, mais aussi une
 * archive refaite par l'explorateur de fichiers (compressée).
 */

import zlib from 'node:zlib';

/** Table du CRC-32 (polynôme 0xEDB88320), calculée une fois. */
const TABLE_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(octets) {
  let crc = 0xffffffff;
  for (const octet of octets) crc = TABLE_CRC[(crc ^ octet) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Date et heure au format MS-DOS du ZIP (heure locale, à 2 secondes près). */
function dateDos(date) {
  const heure = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const jour = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { heure, jour };
}

/**
 * Archive les fichiers donnés.
 * @param {{ nom: string, contenu: Buffer|string }[]} fichiers noms uniques,
 *   éventuellement dans des sous-dossiers (« pieces/facture.pdf »).
 * @param {Date} [date] date inscrite sur chaque fichier.
 * @returns {Buffer}
 */
export function creerZip(fichiers, date = new Date()) {
  const { heure, jour } = dateDos(date);
  const locaux = [];
  const central = [];
  let position = 0;

  for (const { nom, contenu } of fichiers) {
    const donnees = Buffer.isBuffer(contenu) ? contenu : Buffer.from(contenu, 'utf8');
    const nomOctets = Buffer.from(nom, 'utf8');
    const crc = crc32(donnees);

    const entete = Buffer.alloc(30);
    entete.writeUInt32LE(0x04034b50, 0);
    entete.writeUInt16LE(20, 4); // version nécessaire
    entete.writeUInt16LE(0x0800, 6); // noms en UTF-8
    entete.writeUInt16LE(0, 8); // stocké
    entete.writeUInt16LE(heure, 10);
    entete.writeUInt16LE(jour, 12);
    entete.writeUInt32LE(crc, 14);
    entete.writeUInt32LE(donnees.length, 18);
    entete.writeUInt32LE(donnees.length, 22);
    entete.writeUInt16LE(nomOctets.length, 26);
    entete.writeUInt16LE(0, 28);
    locaux.push(entete, nomOctets, donnees);

    const repertoire = Buffer.alloc(46);
    repertoire.writeUInt32LE(0x02014b50, 0);
    repertoire.writeUInt16LE(20, 4); // créé par
    repertoire.writeUInt16LE(20, 6); // version nécessaire
    repertoire.writeUInt16LE(0x0800, 8);
    repertoire.writeUInt16LE(0, 10);
    repertoire.writeUInt16LE(heure, 12);
    repertoire.writeUInt16LE(jour, 14);
    repertoire.writeUInt32LE(crc, 16);
    repertoire.writeUInt32LE(donnees.length, 20);
    repertoire.writeUInt32LE(donnees.length, 24);
    repertoire.writeUInt16LE(nomOctets.length, 28);
    repertoire.writeUInt32LE(position, 42); // position de l'en-tête local
    central.push(repertoire, nomOctets);

    position += entete.length + nomOctets.length + donnees.length;
  }

  const tailleCentral = central.reduce((t, b) => t + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(position, 16);
  return Buffer.concat([...locaux, ...central, fin]);
}

/**
 * Relit une archive ZIP : `[{ nom, contenu }]`, dossiers exclus. Fichiers
 * stockés ou compressés (méthode « deflate », celle de l'explorateur de
 * Windows et du Finder) ; chaque contenu est contrôlé par son CRC-32. Lève
 * une erreur si l'archive est illisible ou abîmée.
 * @param {Buffer} octets
 */
export function lireZip(octets) {
  const abimee = () => new Error('Archive ZIP illisible ou abîmée.');
  // Fin du répertoire central : dans les derniers octets (commentaire compris).
  let fin = -1;
  for (let i = octets.length - 22; i >= Math.max(0, octets.length - 22 - 0xffff); i -= 1) {
    if (octets.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw abimee();
  const nombre = octets.readUInt16LE(fin + 10);
  let position = octets.readUInt32LE(fin + 16);

  const fichiers = [];
  for (let n = 0; n < nombre; n += 1) {
    if (position + 46 > octets.length || octets.readUInt32LE(position) !== 0x02014b50) throw abimee();
    const methode = octets.readUInt16LE(position + 10);
    const crc = octets.readUInt32LE(position + 16);
    const tailleCompressee = octets.readUInt32LE(position + 20);
    const taille = octets.readUInt32LE(position + 24);
    const longueurNom = octets.readUInt16LE(position + 28);
    const longueurExtra = octets.readUInt16LE(position + 30);
    const longueurCommentaire = octets.readUInt16LE(position + 32);
    const local = octets.readUInt32LE(position + 42);
    const nom = octets.subarray(position + 46, position + 46 + longueurNom).toString('utf8').replace(/\\/g, '/');
    position += 46 + longueurNom + longueurExtra + longueurCommentaire;
    if (nom.endsWith('/')) continue;

    if (local + 30 > octets.length || octets.readUInt32LE(local) !== 0x04034b50) throw abimee();
    const debut = local + 30 + octets.readUInt16LE(local + 26) + octets.readUInt16LE(local + 28);
    const brut = octets.subarray(debut, debut + tailleCompressee);
    if (brut.length !== tailleCompressee) throw abimee();
    let contenu;
    if (methode === 0) contenu = brut;
    else if (methode === 8) {
      try { contenu = zlib.inflateRawSync(brut, { maxOutputLength: Math.max(taille, 1) }); } catch { throw abimee(); }
    } else {
      throw new Error('Archive ZIP compressée d’une façon inconnue : refaites-la avec l’explorateur de fichiers.');
    }
    if (contenu.length !== taille || crc32(contenu) !== crc) throw abimee();
    fichiers.push({ nom, contenu });
  }
  return fichiers;
}

/**
 * Longueur maximale d'un nom, extension comprise. Les systèmes de fichiers
 * refusent au-delà de 255 caractères, et un nom de client peut en compter 500 :
 * sans borne, le PDF ne s'extrairait pas de l'archive.
 */
const NOM_MAX = 150;

/** Coupe un nom trop long avant son extension, sans point ni espace final (que Windows refuse). */
function borner(nom) {
  const caracteres = [...nom];
  if (caracteres.length <= NOM_MAX) return nom;
  const point = nom.lastIndexOf('.');
  const extension = point > 0 && nom.length - point <= 10 ? nom.slice(point) : '';
  return `${caracteres.slice(0, NOM_MAX - extension.length).join('').replace(/[. ]+$/, '')}${extension}`;
}

/**
 * Rend chaque nom unique dans l'archive (« facture.pdf », « facture (2).pdf »),
 * sans caractère interdit par les systèmes de fichiers et de longueur bornée.
 */
export function nomsUniques(noms) {
  const vus = new Map();
  return noms.map((brut) => {
    const propre = borner(String(brut).replace(/[\u0000-\u001f<>:"\\|?*]/g, '').replace(/\s+/g, ' ').trim()) || 'fichier';
    const cle = propre.toLowerCase();
    const rang = (vus.get(cle) ?? 0) + 1;
    vus.set(cle, rang);
    if (rang === 1) return propre;
    const point = propre.lastIndexOf('.');
    return point > 0 ? `${propre.slice(0, point)} (${rang})${propre.slice(point)}` : `${propre} (${rang})`;
  });
}
