/**
 * Le fichier de sauvegarde : tout le livre et ses PDF dans un seul fichier,
 * à ranger où l'on veut (« Sauvegarder maintenant »), et sa reprise, sur cet
 * ordinateur ou sur un autre (« Reprendre une sauvegarde »).
 *
 * Une reprise se fait en deux temps, pour que rien ne soit remplacé à
 * l'aveugle : la sauvegarde est d'abord lue et vérifiée, et son contenu
 * montré ; elle n'est reprise qu'avec l'accord de l'utilisateur. Le livre en
 * place est alors mis de côté dans les sauvegardes (« avant-reprise ») : rien
 * n'est jamais perdu.
 *
 * Trois sources sont acceptées :
 *  - le fichier .zip de « Sauvegarder maintenant » (ou la copie complète des
 *    versions précédentes), même décompressé puis recompressé ;
 *  - un fichier .json seul : le livre, sans ses PDF ;
 *  - la copie de sécurité d'une clé USB ou d'un disque (voir `copie-externe.js`).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { creerZip, lireZip } from './exports/zip.js';
import { estPdf } from './pieces.js';
import { aujourdHuiIso } from './partage/dates.js';

const NOM_LIVRE = 'livre-des-recettes.json';
const MOTIF_PIECE = /(?:^|\/)pieces\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pdf$/i;

/** Mot glissé dans le fichier, pour qui l'ouvrirait sans savoir quoi en faire. */
const LISEZ_MOI = [
  'Sauvegarde du Livre des recettes',
  '',
  'Ce fichier contient tout le livre : recettes, achats, clients, paramètres,',
  'et les factures et justificatifs PDF joints.',
  '',
  'Pour le reprendre, sur cet ordinateur ou sur un autre : ouvrez le Livre des',
  'recettes, puis Paramètres, section « Sécurité de vos données », et',
  '« Reprendre une sauvegarde ». Choisissez ce fichier tel quel, sans le',
  'décompresser.',
  ''
].join('\r\n');

const erreurReprise = (message) => Object.assign(new Error(message), { code: 'REPRISE' });

/** Le contenu a-t-il bien la forme d'un livre des recettes ? */
function estUnLivre(contenu) {
  return contenu !== null && typeof contenu === 'object' && !Array.isArray(contenu) &&
    Array.isArray(contenu.recettes) &&
    contenu.parametres !== null && typeof contenu.parametres === 'object' && !Array.isArray(contenu.parametres) &&
    (contenu.achats === undefined || Array.isArray(contenu.achats)) &&
    (contenu.clients === undefined || Array.isArray(contenu.clients));
}

/** Le livre d'une sauvegarde, ou une erreur que l'utilisateur comprend. */
function lireLivre(octets) {
  let contenu;
  try {
    contenu = JSON.parse(octets.toString('utf8').replace(/^﻿/, ''));
  } catch {
    throw erreurReprise('Ce fichier n’est pas une sauvegarde du Livre des recettes, ou il est abîmé.');
  }
  if (!estUnLivre(contenu)) throw erreurReprise('Ce fichier n’est pas une sauvegarde du Livre des recettes.');
  return contenu;
}

/** Identifiants des PDF que cite un livre. */
const piecesCitees = (contenu) => new Set([...(contenu.recettes ?? []), ...(contenu.achats ?? [])]
  .map((ligne) => ligne?.pieceJointe?.id)
  .filter((id) => typeof id === 'string'));

/** Date de la saisie la plus récente d'un livre (ISO), ou `null`. */
function derniereSaisie(contenu) {
  let plusRecente = null;
  for (const ligne of [...contenu.recettes, ...(contenu.achats ?? []), ...(contenu.clients ?? [])]) {
    for (const date of [ligne?.modifieLe, ligne?.creeLe]) {
      if (typeof date === 'string' && (!plusRecente || date > plusRecente)) plusRecente = date;
    }
  }
  return plusRecente;
}

/** Les PDF d'une copie de sécurité : identifiant → chemin du fichier. */
function piecesDuDossier(dossier) {
  const trouvees = new Map();
  try {
    for (const nom of fs.readdirSync(path.join(dossier, 'pieces'))) {
      const id = MOTIF_PIECE.exec(`pieces/${nom}`)?.[1]?.toLowerCase();
      if (id) trouvees.set(id, path.join(dossier, 'pieces', nom));
    }
  } catch { /* pas de PDF sur ce support */ }
  return trouvees;
}

/**
 * @param {object} options
 * @param {object} options.stockage le livre.
 * @param {object} options.pieces les pièces jointes.
 * @param {object} options.copieExterne la copie sur clé ou disque (ses copies
 *   servent de source, et elle peut reprendre sur la clé d'où vient le livre).
 */
export function creerFichierSauvegarde({ stockage, pieces, copieExterne }) {
  /** Sauvegarde lue et vérifiée, en attente de l'accord de l'utilisateur. */
  let enAttente = null;

  /** Ce que contient une sauvegarde, pour que l'utilisateur la reconnaisse. */
  function resume(contenu, disponibles) {
    const citees = piecesCitees(contenu);
    const manquants = [...citees].filter((id) => !disponibles.has(id) && !pieces.chemin(id)).length;
    return {
      entreprise: String(contenu.parametres.nomEntreprise ?? '').trim() || null,
      recettes: contenu.recettes.length,
      achats: (contenu.achats ?? []).length,
      clients: (contenu.clients ?? []).length,
      pdf: citees.size - manquants,
      pdfManquants: manquants,
      derniereSaisie: derniereSaisie(contenu)
    };
  }

  /** Met une sauvegarde en attente, et dit ce qu'elle contient et ce qu'elle remplacerait. */
  function mettreEnAttente(contenu, sources, origine) {
    enAttente = { jeton: crypto.randomUUID(), contenu, sources, origine };
    return {
      jeton: enAttente.jeton,
      origine: { type: origine.type, libelle: origine.libelle },
      sauvegarde: resume(contenu, sources),
      actuel: stockage.compter(),
      copieActive: copieExterne.etat().active
    };
  }

  return {
    /**
     * Le fichier de « Sauvegarder maintenant » : `{ nom, contenu }`, une archive
     * ZIP. Refusé tant que le livre ne peut pas être lu : la sauvegarde serait
     * vide, et trompeuse.
     */
    creer() {
      if (stockage.corruption() || stockage.indisponible()) {
        throw Object.assign(new Error('Le livre ne peut pas être lu pour l’instant : il n’y a rien à sauvegarder.'), { code: 'INDISPONIBLE' });
      }
      const donnees = stockage.exporterDonnees();
      const fichiers = [
        { nom: NOM_LIVRE, contenu: JSON.stringify(donnees, null, 2) },
        { nom: 'LISEZ-MOI.txt', contenu: LISEZ_MOI }
      ];
      for (const id of piecesCitees(donnees)) {
        const chemin = pieces.chemin(id);
        if (chemin) fichiers.push({ nom: `pieces/${id}.pdf`, contenu: fs.readFileSync(chemin) });
      }
      return { nom: `sauvegarde-livre-des-recettes-${aujourdHuiIso()}.zip`, contenu: creerZip(fichiers) };
    },

    /** Copies de sécurité trouvées sur les clés et disques branchés, lisibles. */
    async copies() {
      const liste = [];
      for (const copie of await copieExterne.copiesPresentes()) {
        try {
          const contenu = lireLivre(fs.readFileSync(copie.fichier));
          liste.push({ chemin: copie.chemin, libelle: copie.libelle, date: copie.date, sauvegarde: resume(contenu, piecesDuDossier(copie.dossier)) });
        } catch { /* copie illisible : pas proposée */ }
      }
      return liste;
    },

    /** Lit un fichier de sauvegarde reçu (ZIP ou JSON) et le met en attente. */
    analyserFichier(octets, nom = '') {
      if (!Buffer.isBuffer(octets) || octets.length === 0) throw erreurReprise('Le fichier reçu est vide.');
      const origine = { type: 'fichier', libelle: nom || 'le fichier choisi' };
      if (octets.length < 4 || octets.readUInt32LE(0) !== 0x04034b50) {
        return mettreEnAttente(lireLivre(octets), new Map(), origine);
      }
      let entrees;
      try {
        entrees = lireZip(octets);
      } catch (erreur) {
        throw erreurReprise(erreur.message);
      }
      // Le livre à la racine de l'archive, ou dans son dossier s'il a été recompressé.
      const livre = entrees
        .filter((e) => path.posix.basename(e.nom) === NOM_LIVRE)
        .sort((a, b) => a.nom.length - b.nom.length)[0];
      if (!livre) throw erreurReprise('Cette archive ne contient pas de livre des recettes.');
      const sources = new Map();
      for (const { nom: chemin, contenu } of entrees) {
        const id = MOTIF_PIECE.exec(chemin)?.[1]?.toLowerCase();
        if (id && estPdf(contenu)) sources.set(id, contenu);
      }
      return mettreEnAttente(lireLivre(livre.contenu), sources, origine);
    },

    /** Lit la copie de sécurité d'une clé ou d'un disque branché, et la met en attente. */
    async analyserCopie(chemin) {
      const copie = (await copieExterne.copiesPresentes()).find((c) => c.chemin === chemin);
      if (!copie) throw erreurReprise('Cette clé ou ce disque n’est plus branché, ou ne porte plus de copie.');
      let octets;
      try {
        octets = fs.readFileSync(copie.fichier);
      } catch {
        throw erreurReprise('La copie de ce support ne peut pas être lue.');
      }
      return mettreEnAttente(lireLivre(octets), piecesDuDossier(copie.dossier), { type: 'support', libelle: copie.libelle, chemin: copie.chemin });
    },

    /**
     * Reprend la sauvegarde en attente : ses PDF d'abord (le livre ne cite
     * ainsi jamais un fichier absent), puis le livre. Avec `continuerCopie`,
     * la clé d'où vient le livre devient celle de la copie automatique.
     */
    async reprendre(jeton, { continuerCopie = false } = {}) {
      if (!enAttente || enAttente.jeton !== jeton) {
        throw erreurReprise('Cette sauvegarde n’est plus prête à être reprise : choisissez-la de nouveau.');
      }
      const { contenu, sources, origine } = enAttente;
      const citees = piecesCitees(contenu);
      let pdf = 0;
      for (const [id, source] of sources) {
        if (!citees.has(id)) continue;
        let octets;
        try {
          octets = Buffer.isBuffer(source) ? source : fs.readFileSync(source);
        } catch {
          throw erreurReprise('Le support a été retiré pendant la reprise : rien n’a été remplacé. Rebranchez-le, puis recommencez.');
        }
        if (pieces.deposer(id, octets)) pdf += 1;
      }
      const resultat = stockage.reprendre(contenu);
      enAttente = null;

      let copie = null;
      if (continuerCopie && origine.type === 'support') {
        try {
          copie = await copieExterne.choisir(origine.chemin);
        } catch (erreur) {
          copie = { copie: false, message: erreur.message };
        }
      }
      return { ...resultat, achats: (contenu.achats ?? []).length, pdf, copie };
    }
  };
}
