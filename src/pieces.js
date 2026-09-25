/**
 * Pièces jointes : la facture PDF d'une recette, le justificatif PDF d'un
 * achat.
 *
 * Chaque pièce est un fichier `pieces/<identifiant>.pdf` rangé à côté du
 * livre, dans le dossier de données : copier ce dossier (changement de PC,
 * clé USB) emporte donc aussi les PDF. La ligne du registre ne garde que sa
 * fiche (`{ id, nom, taille }`).
 *
 * Deux garanties, calquées sur celles du livre :
 *  - chaque pièce est doublée, une fois pour toutes, dans le dossier des
 *    sauvegardes (hors du dossier de données) : supprimer celui-ci ne fait
 *    perdre aucun PDF, la copie reprend sa place à la première lecture ;
 *  - un fichier n'est jamais effacé tant que le livre ou l'une des
 *    sauvegardes le cite : restaurer une sauvegarde retrouve ses PDF. Le
 *    ménage (`nettoyer`) ne retire que les pièces que plus rien ne cite.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ecrireDurablement } from './stockage.js';

const NOM_DOSSIER = 'pieces';

/** Poids maximal d'une pièce : une facture scannée tient largement dedans. */
export const TAILLE_MAX_PIECE = 10 * 1024 * 1024;

/** Identifiant d'une pièce : un UUID, ce qui borne toute traversée de chemin. */
const MOTIF_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MOTIF_FICHIER = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pdf$/;

/** Un PDF commence toujours par cette signature, quel que soit son nom. */
export const estPdf = (octets) => octets.length >= 5 && octets.subarray(0, 5).toString('latin1') === '%PDF-';

/**
 * Nom de fichier affichable et téléchargeable : sans chemin ni caractère de
 * contrôle, borné en longueur, terminé par « .pdf ».
 */
export function nomPiece(nom) {
  const base = String(nom ?? '').split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    .trim()
    .slice(0, 120);
  if (!base || base === '.pdf') return 'piece.pdf';
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

/**
 * Fiche de pièce jointe valide telle qu'elle vit dans une ligne, ou `null`.
 * Sert à accepter, sans la faire confiance à l'aveugle, la fiche que le
 * navigateur renvoie (annulation d'une suppression, rattachement).
 */
export function fichePiece(entree) {
  if (!entree || typeof entree !== 'object' || !MOTIF_ID.test(String(entree.id))) return null;
  const taille = Number(entree.taille);
  return {
    id: String(entree.id),
    nom: nomPiece(entree.nom),
    taille: Number.isInteger(taille) && taille > 0 && taille <= TAILLE_MAX_PIECE ? taille : 0
  };
}

/**
 * @param {string} dossierDonnees dossier du livre.
 * @param {string} dossierSauvegardes dossier des sauvegardes, hors du précédent.
 */
export function creerPieces(dossierDonnees, dossierSauvegardes) {
  const dossier = path.join(dossierDonnees, NOM_DOSSIER);
  const copies = path.join(dossierSauvegardes, NOM_DOSSIER);
  const principal = (id) => path.join(dossier, `${id}.pdf`);
  const copie = (id) => path.join(copies, `${id}.pdf`);

  /** Identifiants des fichiers présents dans un dossier. */
  const presents = (repertoire) => {
    try {
      return fs.readdirSync(repertoire).map((f) => MOTIF_FICHIER.exec(f)?.[1]).filter(Boolean);
    } catch {
      return [];
    }
  };

  return {
    dossier,

    /**
     * Enregistre un PDF reçu. Lève une erreur `{ code: 'PIECE' }` si le
     * contenu n'est pas un PDF ou dépasse la taille permise.
     * @returns {{ id: string, nom: string, taille: number }}
     */
    enregistrer(octets, nom) {
      if (!Buffer.isBuffer(octets) || !estPdf(octets)) {
        throw Object.assign(new Error('Ce fichier n’est pas un PDF.'), { code: 'PIECE' });
      }
      if (octets.length > TAILLE_MAX_PIECE) {
        throw Object.assign(new Error('Ce PDF dépasse 10 Mo.'), { code: 'PIECE' });
      }
      const id = crypto.randomUUID();
      fs.mkdirSync(dossier, { recursive: true });
      ecrireDurablement(principal(id), octets);
      // La copie hors du dossier de données est un filet : son échec
      // (dossier inaccessible) ne doit jamais empêcher de joindre la pièce.
      try {
        fs.mkdirSync(copies, { recursive: true });
        fs.copyFileSync(principal(id), copie(id));
      } catch { /* retentée d'elle-même : la copie reviendra à la lecture */ }
      return { id, nom: nomPiece(nom), taille: octets.length };
    },

    /**
     * Chemin du fichier d'une pièce, ou `null` s'il est perdu. Un fichier
     * disparu du dossier de données (supprimé, dossier recopié sans lui) est
     * remis en place depuis sa copie.
     */
    chemin(id) {
      if (!MOTIF_ID.test(String(id))) return null;
      if (fs.existsSync(principal(id))) return principal(id);
      if (!fs.existsSync(copie(id))) return null;
      try {
        fs.mkdirSync(dossier, { recursive: true });
        fs.copyFileSync(copie(id), principal(id));
        return principal(id);
      } catch {
        return copie(id);
      }
    },

    /**
     * Retire les fichiers que plus rien ne cite, ni le livre ni aucune
     * sauvegarde. Retourne le nombre de pièces effacées.
     * @param {Set<string>} citees identifiants encore cités.
     */
    nettoyer(citees) {
      let effacees = 0;
      for (const repertoire of [dossier, copies]) {
        for (const id of presents(repertoire)) {
          if (citees.has(id)) continue;
          try {
            fs.unlinkSync(path.join(repertoire, `${id}.pdf`));
            if (repertoire === dossier) effacees += 1;
          } catch { /* fichier retenu : ce sera pour le prochain démarrage */ }
        }
      }
      return effacees;
    }
  };
}
