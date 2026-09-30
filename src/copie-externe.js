/**
 * Copie de sécurité hors de l'ordinateur : sur une clé USB ou un disque
 * externe choisi par l'utilisateur.
 *
 * Les sauvegardes automatiques vivent sur le même disque que le livre : une
 * panne, un vol ou un rançongiciel les emporterait ensemble. Cette copie est
 * la troisième, sur un autre support (la règle « 3-2-1 » de l'ANSSI).
 *
 * Le bon support, à coup sûr. Au premier choix, un petit fichier portant un
 * identifiant est posé sur le support, dans son dossier « Livre des recettes -
 * copie de sécurité » ; le support est ensuite reconnu à cet identifiant, et
 * non à sa lettre de lecteur (E:, F:…), qui change d'un branchement à l'autre. Rien n'est jamais copié sur un autre
 * support, ni sur le disque qui porte déjà le livre ou ses sauvegardes.
 *
 * Chaque copie vérifie la place libre, écrit le livre de façon atomique et le
 * relit pour s'assurer qu'il est complet : une clé retirée en pleine copie
 * n'abîme jamais la copie précédente. Tant que la clé est absente, la copie
 * attend ; elle reprend dès qu'elle est rebranchée.
 *
 *   <support>/Livre des recettes - copie de sécurité/
 *     livre-des-recettes.json      le livre, à jour de la dernière copie
 *     versions/                    une version par jour (14 jours, puis par semaine et par mois)
 *     pieces/                      les factures et justificatifs PDF
 *     archives/                    les années closes (voir `archives.js`)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { aujourdHuiIso } from './partage/dates.js';
import { ecrireDurablement, sauvegardesObsoletes } from './stockage.js';

export const NOM_DOSSIER_SUPPORT = 'Livre des recettes - copie de sécurité';
const NOM_MARQUE = '.livre-des-recettes-support.json';
const NOM_REGLAGE = 'copie-externe.json';
/** Au-delà, l'absence de copie récente est signalée (discrètement). */
const RETARD_JOURS = 7;
const DELAI_APRES_ECRITURE_MS = 10_000;
const INTERVALLE_RECHERCHE_MS = 5 * 60_000;
const DUREE_CACHE_VOLUMES_MS = 60_000;

const sha256 = (octets) => crypto.createHash('sha256').update(octets).digest('hex');
const peripherique = (chemin) => {
  try { return fs.statSync(chemin).dev; } catch { return null; }
};

/** Exécute une commande et rend sa sortie (texte UTF-8), ou `null` en cas d'échec. */
function sortieDe(commande, args, delaiMs = 10_000) {
  return new Promise((resoudre) => {
    let sortie = '';
    let fini = false;
    const terminer = (valeur) => { if (!fini) { fini = true; resoudre(valeur); } };
    let enfant;
    try {
      enfant = spawn(commande, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return terminer(null);
    }
    enfant.stdout.setEncoding('utf8');
    enfant.stdout.on('data', (morceau) => { sortie += morceau; });
    enfant.on('error', () => terminer(null));
    enfant.on('close', (code) => terminer(code === 0 ? sortie : null));
    setTimeout(() => { enfant.kill(); terminer(null); }, delaiMs).unref();
  });
}

/** Place totale et libre d'un volume, en octets. */
function placeDe(chemin) {
  try {
    const infos = fs.statfsSync(chemin);
    return { taille: infos.blocks * infos.bsize, libre: infos.bavail * infos.bsize };
  } catch {
    return { taille: null, libre: null };
  }
}

/**
 * Volumes branchés sur cet ordinateur : `[{ chemin, libelle, amovible, taille, libre }]`.
 * Les lecteurs réseau n'y figurent pas : un disque absent du réseau ne doit
 * pas bloquer la recherche.
 */
async function listerVolumesDuSysteme() {
  if (process.platform === 'win32') {
    const sortie = await sortieDe('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Volume | Where-Object { $_.DriveLetter } | ' +
      'Select-Object DriveLetter,FileSystemLabel,DriveType,Size,SizeRemaining | ConvertTo-Json -Compress']);
    if (!sortie?.trim()) return [];
    let volumes;
    try { volumes = JSON.parse(sortie); } catch { return []; }
    return (Array.isArray(volumes) ? volumes : [volumes])
      .filter((v) => v?.DriveLetter && v.DriveType !== 'CD-ROM' && v.Size > 0)
      .map((v) => {
        const lettre = String(v.DriveLetter).toUpperCase();
        const amovible = v.DriveType === 'Removable';
        const nom = String(v.FileSystemLabel ?? '').trim() || (amovible ? 'Clé USB' : 'Disque');
        return { chemin: `${lettre}:\\`, libelle: `${nom} (${lettre}:)`, amovible, taille: v.Size, libre: v.SizeRemaining };
      });
  }
  const racines = process.platform === 'darwin'
    ? ['/Volumes']
    : [`/media/${os.userInfo().username}`, `/run/media/${os.userInfo().username}`, '/media', '/mnt'];
  const volumes = [];
  for (const racine of racines) {
    let noms = [];
    try { noms = fs.readdirSync(racine); } catch { continue; }
    for (const nom of noms) {
      const chemin = path.join(racine, nom);
      try {
        // Le disque du système apparaît aussi sous /Volumes : il est écarté.
        if (fs.realpathSync(chemin) === '/' || peripherique(chemin) === peripherique(racine)) continue;
      } catch { continue; }
      volumes.push({ chemin, libelle: nom, amovible: true, ...placeDe(chemin) });
    }
  }
  return volumes;
}

/**
 * @param {object} options
 * @param {object} options.stockage le livre (son fichier, ses dossiers).
 * @param {object} options.pieces les pièces jointes.
 * @param {object} options.archives les archives annuelles.
 * @param {() => Promise<object[]>} [options.listerVolumes] injectable pour les tests.
 * @param {boolean} [options.ecarterMemeDisque] écarte le disque du livre (les
 *   tests simulent une clé par un dossier du même disque).
 */
export function creerCopieExterne({ stockage, pieces, archives, listerVolumes = listerVolumesDuSysteme, ecarterMemeDisque = true }) {
  const cheminReglage = path.join(stockage.dossierSauvegardes, NOM_REGLAGE);
  let present = null;
  let enCours = null;
  let minuterie = null;
  let volumesEnCache = null;

  function lireReglage() {
    try {
      return JSON.parse(fs.readFileSync(cheminReglage, 'utf8'));
    } catch {
      return null;
    }
  }
  function ecrireReglage(reglage) {
    fs.mkdirSync(path.dirname(cheminReglage), { recursive: true });
    ecrireDurablement(cheminReglage, JSON.stringify(reglage, null, 2));
  }

  async function volumes({ frais = false } = {}) {
    if (!frais && volumesEnCache && Date.now() - volumesEnCache.le < DUREE_CACHE_VOLUMES_MS) return volumesEnCache.liste;
    const liste = await listerVolumes();
    volumesEnCache = { le: Date.now(), liste };
    return liste;
  }

  /** La marque d'un support : sa signature, ou `null`. */
  function marqueDe(racine) {
    try {
      return JSON.parse(fs.readFileSync(path.join(racine, NOM_DOSSIER_SUPPORT, NOM_MARQUE), 'utf8')).signature ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Supports proposables : branchés, et distincts du disque qui porte le livre
   * ou ses sauvegardes (une copie au même endroit ne protégerait de rien).
   */
  async function supports() {
    const exclus = new Set(ecarterMemeDisque
      ? [peripherique(stockage.dossierDonnees), peripherique(stockage.dossierSauvegardes)].filter((d) => d !== null)
      : []);
    const reglage = lireReglage();
    return (await volumes({ frais: true }))
      .filter((v) => !exclus.has(peripherique(v.chemin)))
      .map((v) => ({ ...v, choisi: Boolean(reglage && marqueDe(v.chemin) === reglage.signature) }));
  }

  /** Le support choisi, s'il est branché : là où porte sa marque. */
  async function localiser() {
    const reglage = lireReglage();
    if (!reglage) return null;
    if (reglage.chemin && marqueDe(reglage.chemin) === reglage.signature) return reglage.chemin;
    for (const volume of await volumes()) {
      if (marqueDe(volume.chemin) === reglage.signature) {
        ecrireReglage({ ...reglage, chemin: volume.chemin, libelle: volume.libelle });
        return volume.chemin;
      }
    }
    return null;
  }

  /** Copie un fichier si la cible manque ou diffère en taille (les PDF ne changent jamais). */
  function copierSiBesoin(source, cible) {
    const taille = fs.statSync(source).size;
    try {
      if (fs.statSync(cible).size === taille) return 0;
    } catch { /* absente */ }
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.copyFileSync(source, `${cible}.tmp`);
    fs.renameSync(`${cible}.tmp`, cible);
    if (fs.statSync(cible).size !== taille) throw new Error(`Copie incomplète de ${path.basename(cible)}.`);
    return taille;
  }

  /** Fichiers d'un dossier, récursivement, en chemins relatifs. */
  function fichiersDe(dossier, prefixe = '') {
    try {
      return fs.readdirSync(path.join(dossier, prefixe), { withFileTypes: true }).flatMap((e) => {
        const relatif = path.join(prefixe, e.name);
        return e.isDirectory() ? fichiersDe(dossier, relatif) : [relatif];
      });
    } catch {
      return [];
    }
  }

  /** Taille de ce qui reste à copier (pour vérifier la place avant d'écrire). */
  function besoin(racine, livre, aCopier) {
    let total = livre.length * 2; // le livre, et sa version du jour
    for (const { source, cible } of aCopier) {
      try {
        const taille = fs.statSync(source).size;
        let deja = -1;
        try { deja = fs.statSync(cible).size; } catch { /* absente */ }
        if (deja !== taille) total += taille;
      } catch { /* source disparue : ignorée */ }
    }
    return total;
  }

  async function copierMaintenant({ force = false } = {}) {
    const reglage = lireReglage();
    if (!reglage) return { copie: false, raison: 'inactive' };
    const racine = await localiser();
    present = Boolean(racine);
    if (!racine) return { copie: false, raison: 'absent' };
    if (!fs.existsSync(stockage.cheminFichier)) return { copie: false, raison: 'vide' };
    // Un livre abîmé ou momentanément illisible n'écrase jamais la dernière
    // bonne copie : elle est peut-être ce qui permettra de tout retrouver.
    if (stockage.corruption() || stockage.indisponible()) return { copie: false, raison: 'livre' };

    const dossier = path.join(racine, NOM_DOSSIER_SUPPORT);
    try {
      const livre = fs.readFileSync(stockage.cheminFichier);
      JSON.parse(livre.toString('utf8'));
      const empreinte = sha256(livre);
      const fiches = [...stockage.listerRecettes(), ...stockage.listerAchats()]
        .map((l) => l.pieceJointe?.id).filter(Boolean);
      const aCopier = [
        ...[...new Set(fiches)].map((id) => ({ source: pieces.chemin(id), cible: path.join(dossier, 'pieces', `${id}.pdf`) })).filter((f) => f.source),
        ...fichiersDe(archives.dossier).map((relatif) => ({ source: path.join(archives.dossier, relatif), cible: path.join(dossier, 'archives', relatif) }))
      ];
      const { libre } = placeDe(racine);
      if (libre !== null && libre < besoin(racine, livre, aCopier) + 1024 * 1024) {
        throw new Error('Le support est plein : libérez de la place, ou choisissez-en un autre.');
      }

      if (force || reglage.empreinte !== empreinte || !fs.existsSync(path.join(dossier, 'livre-des-recettes.json'))) {
        const cible = path.join(dossier, 'livre-des-recettes.json');
        ecrireDurablement(cible, livre);
        if (sha256(fs.readFileSync(cible)) !== empreinte) throw new Error('La copie relue ne correspond pas : elle sera refaite.');
        // Une version par jour, avec la même rotation que les sauvegardes.
        const versions = path.join(dossier, 'versions');
        fs.mkdirSync(versions, { recursive: true });
        ecrireDurablement(path.join(versions, `livre-des-recettes-${aujourdHuiIso()}.json`), livre);
        const dates = fs.readdirSync(versions).map((f) => /^livre-des-recettes-(\d{4}-\d{2}-\d{2})\.json$/.exec(f)?.[1]).filter(Boolean);
        for (const date of sauvegardesObsoletes(dates, aujourdHuiIso())) {
          fs.rmSync(path.join(versions, `livre-des-recettes-${date}.json`), { force: true });
        }
      }
      for (const { source, cible } of aCopier) copierSiBesoin(source, cible);

      ecrireReglage({ ...lireReglage(), empreinte, derniereCopie: new Date().toISOString(), echec: null });
      return { copie: true };
    } catch (erreur) {
      const message = ['ENOSPC'].includes(erreur.code)
        ? 'Le support est plein : libérez de la place, ou choisissez-en un autre.'
        : ['ENOENT', 'EIO', 'EPERM', 'EACCES', 'EBUSY'].includes(erreur.code)
          ? 'Le support a été retiré ou refuse l’écriture : la copie reprendra au prochain branchement.'
          : erreur.message;
      try { ecrireReglage({ ...lireReglage(), echec: { le: new Date().toISOString(), message } }); } catch { /* réglage illisible */ }
      return { copie: false, raison: 'echec', message };
    }
  }

  /** Empreinte du livre tel qu'il est sur le disque (recalculée seulement s'il a changé). */
  let empreinteEnCache = null;
  function empreinteDuLivre() {
    try {
      const { mtimeMs, size } = fs.statSync(stockage.cheminFichier);
      const signature = `${mtimeMs}:${size}`;
      if (empreinteEnCache?.signature !== signature) {
        empreinteEnCache = { signature, empreinte: sha256(fs.readFileSync(stockage.cheminFichier)) };
      }
      return empreinteEnCache.empreinte;
    } catch {
      return null;
    }
  }

  /** Une seule copie à la fois ; les demandes pendant ce temps attendent la même. */
  function copier(options) {
    enCours ??= copierMaintenant(options).finally(() => { enCours = null; });
    return enCours;
  }

  return {
    supports,

    /**
     * Choisit le support de la copie (l'un de ceux proposés), y pose la
     * marque, puis fait la première copie.
     */
    async choisir(chemin) {
      const support = (await supports()).find((v) => v.chemin === chemin);
      if (!support) throw Object.assign(new Error('Ce support n’est pas disponible : branchez-le, puis réessayez.'), { code: 'SUPPORT' });
      const dossier = path.join(support.chemin, NOM_DOSSIER_SUPPORT);
      fs.mkdirSync(dossier, { recursive: true });
      // Une clé déjà marquée (choisie une première fois, puis abandonnée) garde sa marque.
      const signature = marqueDe(support.chemin) ?? crypto.randomUUID();
      ecrireDurablement(path.join(dossier, NOM_MARQUE), JSON.stringify({ signature, creeLe: new Date().toISOString() }));
      ecrireReglage({ signature, chemin: support.chemin, libelle: support.libelle, choisiLe: new Date().toISOString(), derniereCopie: null, empreinte: null, echec: null });
      volumesEnCache = null;
      return copier({ force: true });
    },

    /**
     * Copies de sécurité présentes sur les clés et disques branchés, pour
     * reprendre le livre (sur un nouvel ordinateur, par exemple) :
     * `[{ chemin, libelle, dossier, fichier, date }]`.
     */
    async copiesPresentes() {
      const trouvees = [];
      for (const volume of await volumes({ frais: true })) {
        const dossier = path.join(volume.chemin, NOM_DOSSIER_SUPPORT);
        const fichier = path.join(dossier, 'livre-des-recettes.json');
        try {
          trouvees.push({ chemin: volume.chemin, libelle: volume.libelle, dossier, fichier, date: fs.statSync(fichier).mtime.toISOString() });
        } catch { /* pas de copie sur ce volume */ }
      }
      return trouvees;
    },

    /** Arrête la copie externe (ce qui est déjà sur le support y reste). */
    arreter() {
      fs.rmSync(cheminReglage, { force: true });
      present = null;
    },

    copier,

    /** Après chaque écriture du livre : une copie dans quelques secondes. */
    planifier() {
      if (!fs.existsSync(cheminReglage)) return;
      clearTimeout(minuterie);
      minuterie = setTimeout(() => { copier().catch(() => {}); }, DELAI_APRES_ECRITURE_MS);
      minuterie.unref?.();
    },

    /** Première copie peu après le démarrage, puis recherche régulière du support absent. */
    demarrer() {
      setTimeout(() => { copier().catch(() => {}); }, 5000).unref?.();
      setInterval(() => {
        const reglage = lireReglage();
        if (!reglage) return;
        if (!present || reglage.empreinte !== empreinteDuLivre()) copier().catch(() => {});
      }, INTERVALLE_RECHERCHE_MS).unref?.();
    },

    /** État pour l'écran Sécurité et l'indication discrète du menu. */
    etat() {
      const reglage = lireReglage();
      if (!reglage) return { active: false };
      // Une copie identique au livre n'est jamais en retard, si vieille soit-elle :
      // rien n'a changé depuis.
      const aJour = reglage.empreinte != null && reglage.empreinte === empreinteDuLivre();
      const age = aJour ? 0 : reglage.derniereCopie ? Date.now() - Date.parse(reglage.derniereCopie) : Number.POSITIVE_INFINITY;
      return {
        active: true,
        libelle: reglage.libelle,
        dossier: reglage.chemin ? path.join(reglage.chemin, NOM_DOSSIER_SUPPORT) : null,
        present,
        derniereCopie: reglage.derniereCopie,
        enRetard: age > RETARD_JOURS * 24 * 60 * 60 * 1000,
        echec: reglage.echec?.message ?? null
      };
    }
  };
}
