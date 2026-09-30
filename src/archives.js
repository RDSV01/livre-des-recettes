/**
 * Archives annuelles.
 *
 * Le livre des recettes, le registre des achats et leurs justificatifs se
 * conservent 10 ans (article L123-22 du code de commerce). Les sauvegardes
 * automatiques, elles, tournent sur un an. Chaque année close est donc
 * figée une fois pour toutes, à côté des sauvegardes :
 *
 *   archives/2025/2026-01-15/livre-des-recettes-2025.json   (les lignes de l'année)
 *                            livre-des-recettes-2025.pdf    (le registre, prêt à présenter)
 *                            registre-des-achats-2025.pdf   (s'il y a des achats)
 *   archives/2025/pieces/<identifiant>.pdf                  (factures et justificatifs)
 *
 * Si une ligne de l'année change encore (une facture de décembre saisie en
 * janvier), une nouvelle version datée s'ajoute : les précédentes restent.
 * L'application n'efface jamais une archive.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { anneeDe, aujourdHuiIso } from './partage/dates.js';
import { registreRecettes, registreAchats } from './exports/registre.js';
import { genererPdfEnMemoire } from './exports/pdf.js';
import { ecrireDurablement } from './stockage.js';

const NOM_INDEX = 'archive.json';

/** JSON à clés triées : deux contenus égaux ont la même empreinte. */
function jsonStable(valeur) {
  if (Array.isArray(valeur)) return `[${valeur.map(jsonStable).join(',')}]`;
  if (valeur && typeof valeur === 'object') {
    return `{${Object.keys(valeur).sort().map((k) => `${JSON.stringify(k)}:${jsonStable(valeur[k])}`).join(',')}}`;
  }
  return JSON.stringify(valeur ?? null);
}

/** Année d'une date, ou NaN pour une ligne sans date (jamais archivée). */
const anneeSure = (iso) => (typeof iso === 'string' ? anneeDe(iso) : Number.NaN);

/**
 * @param {object} options
 * @param {string} options.dossier dossier des archives (dans celui des sauvegardes).
 * @param {object} options.stockage le livre.
 * @param {object} options.pieces les pièces jointes (pour recopier les PDF).
 */
export function creerArchives({ dossier, stockage, pieces }) {
  let derniereErreur = null;
  let enCours = null;

  /** Le contenu d'une année : paramètres, recettes et achats, dans un ordre stable. */
  function contenuAnnee(annee, recettes, achats) {
    const trier = (liste, cle) => liste
      .filter((l) => anneeSure(l[cle]) === annee)
      .sort((a, b) => String(a[cle]).localeCompare(String(b[cle])) || String(a.id).localeCompare(String(b.id)));
    return { version: 1, exercice: annee, parametres: stockage.obtenirParametres(), recettes: trier(recettes, 'dateEncaissement'), achats: trier(achats, 'dateReglement') };
  }

  function lireIndex(annee) {
    try {
      return JSON.parse(fs.readFileSync(path.join(dossier, String(annee), NOM_INDEX), 'utf8'));
    } catch {
      return null;
    }
  }

  /** Fige une année : une nouvelle version datée si son contenu a changé. */
  async function archiverAnnee(annee, recettes, achats) {
    const contenu = contenuAnnee(annee, recettes, achats);
    const empreinte = crypto.createHash('sha256').update(jsonStable({ recettes: contenu.recettes, achats: contenu.achats })).digest('hex');
    const index = lireIndex(annee);
    if (index?.empreinte === empreinte) return false;

    const dossierAnnee = path.join(dossier, String(annee));
    const version = path.join(dossierAnnee, aujourdHuiIso());
    fs.mkdirSync(version, { recursive: true });
    ecrireDurablement(path.join(version, `livre-des-recettes-${annee}.json`), JSON.stringify(contenu, null, 2));
    const parametres = contenu.parametres;
    if (contenu.recettes.length > 0) {
      const registre = registreRecettes(contenu.recettes, { annee }, { ventiler: parametres.typeActivite === 'mixte' });
      ecrireDurablement(path.join(version, `livre-des-recettes-${annee}.pdf`), await genererPdfEnMemoire(registre, parametres));
    }
    if (contenu.achats.length > 0) {
      ecrireDurablement(path.join(version, `registre-des-achats-${annee}.pdf`), await genererPdfEnMemoire(registreAchats(contenu.achats, { annee }), parametres));
    }
    // Les PDF joints de l'année : copiés une fois, ils ne changent jamais.
    const dossierPieces = path.join(dossierAnnee, 'pieces');
    for (const ligne of [...contenu.recettes, ...contenu.achats]) {
      const id = ligne.pieceJointe?.id;
      if (!id) continue;
      const cible = path.join(dossierPieces, `${id}.pdf`);
      const source = pieces.chemin(id);
      if (source && !fs.existsSync(cible)) {
        fs.mkdirSync(dossierPieces, { recursive: true });
        fs.copyFileSync(source, cible);
      }
    }
    const versions = [...new Set([...(index?.versions ?? []), aujourdHuiIso()])].sort();
    ecrireDurablement(path.join(dossierAnnee, NOM_INDEX), JSON.stringify({ exercice: annee, empreinte, le: new Date().toISOString(), versions }, null, 2));
    return true;
  }

  /** Fige toutes les années closes qui le demandent ; retourne celles archivées. */
  async function archiverTout(maintenant) {
    const archivees = [];
    try {
      if (stockage.corruption() || stockage.indisponible()) return archivees;
      const recettes = stockage.listerRecettes();
      const achats = stockage.listerAchats();
      const courante = maintenant.getFullYear();
      const annees = [...new Set([...recettes.map((r) => anneeSure(r.dateEncaissement)), ...achats.map((a) => anneeSure(a.dateReglement))])]
        .filter((a) => Number.isInteger(a) && a < courante)
        .sort();
      for (const annee of annees) {
        if (await archiverAnnee(annee, recettes, achats)) archivees.push(annee);
      }
      derniereErreur = null;
    } catch (erreur) {
      derniereErreur = erreur.message;
    }
    return archivees;
  }

  return {
    dossier,

    /**
     * Fige les années closes qui ne l'ont pas encore été, ou dont le contenu
     * a changé. Jamais d'erreur levée : le livre, lui, n'est pas concerné.
     * Retourne les années archivées à cette occasion. Un seul archivage à la
     * fois : les demandes pendant ce temps attendent le même.
     */
    archiver({ maintenant = new Date() } = {}) {
      // `finally` passe toujours après l'affectation, même quand il n'y a rien
      // à archiver : l'archivage suivant n'est donc jamais bloqué.
      enCours ??= archiverTout(maintenant).finally(() => { enCours = null; });
      return enCours;
    },

    /** Années archivées, de la plus récente à la plus ancienne. */
    lister() {
      try {
        return fs.readdirSync(dossier)
          .filter((nom) => /^\d{4}$/.test(nom))
          .map((nom) => ({ annee: Number(nom), ...lireIndex(nom) }))
          .filter((a) => a.le)
          .map(({ annee, le, versions }) => ({ annee, le, versions: versions ?? [] }))
          .sort((a, b) => b.annee - a.annee);
      } catch {
        return [];
      }
    },

    erreur: () => derniereErreur
  };
}
