/**
 * Persistance du livre des recettes.
 *
 * Toutes les données vivent dans UN SEUL fichier JSON lisible :
 * `data/livre-des-recettes.json`. Ce choix est volontaire :
 *
 *  - aucune base de données à installer, l'application reste ultra légère ;
 *  - sauvegarder = copier un fichier ; changer de PC = copier un fichier ;
 *  - le fichier reste lisible par un humain (et par un tableur au besoin).
 *
 * Le fichier contient les recettes, la liste des clients (aide à la saisie)
 * et les paramètres de l'entreprise.
 *
 * Garanties contre la perte de données :
 *  - écriture atomique (fichier temporaire puis renommage) : une coupure en
 *    pleine écriture ne corrompt jamais le fichier existant ;
 *  - une sauvegarde quotidienne automatique est conservée dans
 *    `data/sauvegardes/` (30 jours glissants), plus une sauvegarde étiquetée
 *    avant chaque opération sensible (import, restauration) ;
 *  - toute écriture qui échoue est annulée en mémoire : mémoire et fichier ne
 *    divergent jamais ;
 *  - au démarrage, le fichier est vérifié : s'il est corrompu, l'application
 *    démarre en lecture seule et propose de restaurer une sauvegarde, sans
 *    JAMAIS écraser le fichier abîmé.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PARAMETRES_DEFAUT } from './partage/constantes.js';

const NOM_FICHIER = 'livre-des-recettes.json';
const DOSSIER_SAUVEGARDES = 'sauvegardes';
const SAUVEGARDES_ETIQUETEES_CONSERVEES = 10;

// Rotation des sauvegardes quotidiennes : tout est gardé 14 jours, puis une
// par semaine pendant 2 mois, puis une par mois pendant 1 an.
const ROTATION_QUOTIDIENNE_JOURS = 14;
const ROTATION_HEBDOMADAIRE_JOURS = 62;
const ROTATION_MENSUELLE_JOURS = 366;

/** Nom de fichier accepté pour une sauvegarde (borne toute traversée de chemin). */
const MOTIF_SAUVEGARDE = /^livre-des-recettes-[A-Za-z0-9-]+\.json$/;

/**
 * Applique la rotation aux dates (`AAAA-MM-JJ`) des sauvegardes quotidiennes
 * et retourne celles à SUPPRIMER. Fonction pure, exportée pour les tests.
 */
export function sauvegardesObsoletes(dates, aujourdHui) {
  const reference = Date.parse(`${aujourdHui}T00:00:00Z`);
  const jour = 24 * 60 * 60 * 1000;

  // Représentante conservée par période : la plus récente de chaque semaine
  // ISO (clé = lundi de la semaine) et de chaque mois.
  const gardees = new Set();
  const parCle = new Map();
  const retenir = (cle, date) => {
    if (!parCle.has(cle) || date > parCle.get(cle)) parCle.set(cle, date);
  };
  for (const date of dates) {
    const age = (reference - Date.parse(`${date}T00:00:00Z`)) / jour;
    if (age <= ROTATION_QUOTIDIENNE_JOURS) {
      gardees.add(date);
    } else if (age <= ROTATION_HEBDOMADAIRE_JOURS) {
      const d = new Date(`${date}T00:00:00Z`);
      const lundi = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * jour);
      retenir(`semaine-${lundi.toISOString().slice(0, 10)}`, date);
    } else if (age <= ROTATION_MENSUELLE_JOURS) {
      retenir(`mois-${date.slice(0, 7)}`, date);
    }
    // au-delà d'un an : supprimée
  }
  for (const date of parCle.values()) gardees.add(date);
  return dates.filter((date) => !gardees.has(date));
}

/** Vérifie qu'un objet a bien la forme attendue du fichier de données. */
export function estDonneesValides(objet) {
  return objet !== null &&
    typeof objet === 'object' &&
    !Array.isArray(objet) &&
    (objet.recettes === undefined || Array.isArray(objet.recettes)) &&
    (objet.clients === undefined || Array.isArray(objet.clients)) &&
    (objet.parametres === undefined ||
      (typeof objet.parametres === 'object' && objet.parametres !== null && !Array.isArray(objet.parametres)));
}

/**
 * Crée le stockage adossé au dossier donné (créé au besoin).
 * Le contenu est chargé en mémoire une fois : le volume d'un livre des
 * recettes (quelques milliers de lignes au plus) le permet largement.
 */
export function creerStockage(dossierDonnees) {
  const cheminFichier = path.join(dossierDonnees, NOM_FICHIER);
  const dossierSauvegardes = path.join(dossierDonnees, DOSSIER_SAUVEGARDES);

  /** Message d'erreur si le fichier est corrompu, sinon `null`. */
  let corruption = null;

  let donnees = charger();

  /** Complète un contenu lu avec les valeurs par défaut manquantes. */
  function normaliser(lu) {
    return {
      version: 1,
      parametres: { ...PARAMETRES_DEFAUT, ...(lu.parametres ?? {}) },
      recettes: Array.isArray(lu.recettes) ? lu.recettes : [],
      clients: Array.isArray(lu.clients) ? lu.clients : []
    };
  }

  function charger() {
    if (!fs.existsSync(cheminFichier)) {
      return normaliser({});
    }
    try {
      const lu = JSON.parse(fs.readFileSync(cheminFichier, 'utf8'));
      if (!estDonneesValides(lu)) {
        throw new Error('structure inattendue');
      }
      return normaliser(lu);
    } catch (erreur) {
      // On ne repart JAMAIS de zéro en écrasant un fichier illisible : le
      // stockage passe en lecture seule et l'application proposera de
      // restaurer une sauvegarde.
      corruption = `Le fichier de données « ${cheminFichier} » est illisible (${erreur.message}).`;
      return normaliser({});
    }
  }

  function sauvegarder() {
    if (corruption) {
      throw Object.assign(
        new Error('Les données sont corrompues : restaurez une sauvegarde avant toute modification.'),
        { code: 'CORROMPU' }
      );
    }
    fs.mkdirSync(dossierDonnees, { recursive: true });
    creerSauvegardeQuotidienne();
    const temporaire = `${cheminFichier}.tmp`;
    fs.writeFileSync(temporaire, JSON.stringify(donnees, null, 2), 'utf8');
    fs.renameSync(temporaire, cheminFichier);
  }

  /** Garde les `garder` sauvegardes les plus récentes correspondant au motif. */
  function purger(motif, garder) {
    const anciennes = fs.readdirSync(dossierSauvegardes)
      .filter((f) => motif.test(f))
      .sort() // le nom commence par la date : tri par nom = tri chronologique
      .slice(0, -garder);
    for (const fichier of anciennes) {
      fs.unlinkSync(path.join(dossierSauvegardes, fichier));
    }
  }

  /** Copie le fichier courant une fois par jour avant de le modifier. */
  function creerSauvegardeQuotidienne() {
    if (!fs.existsSync(cheminFichier)) return;
    fs.mkdirSync(dossierSauvegardes, { recursive: true });
    const jour = new Date().toISOString().slice(0, 10);
    const cible = path.join(dossierSauvegardes, `livre-des-recettes-${jour}.json`);
    if (fs.existsSync(cible)) return;
    fs.copyFileSync(cheminFichier, cible);

    // Rotation : quotidiennes 14 jours, hebdomadaires 2 mois, mensuelles 1 an.
    const motifQuotidien = /^livre-des-recettes-(\d{4}-\d{2}-\d{2})\.json$/;
    const dates = fs.readdirSync(dossierSauvegardes)
      .map((f) => motifQuotidien.exec(f)?.[1])
      .filter(Boolean);
    for (const date of sauvegardesObsoletes(dates, jour)) {
      fs.unlinkSync(path.join(dossierSauvegardes, `livre-des-recettes-${date}.json`));
    }
  }

  const horodatage = () => new Date().toISOString();

  /**
   * Exécute une mutation sur `donnees`, sauvegarde, et annule la mutation
   * en mémoire si l'écriture disque échoue.
   * @param {() => T} muter applique le changement et retourne le résultat
   * @param {() => void} annuler remet l'état précédent en cas d'échec
   */
  function ecrire(muter, annuler) {
    const resultat = muter();
    try {
      sauvegarder();
    } catch (erreur) {
      annuler();
      throw erreur;
    }
    return resultat;
  }

  return {
    cheminFichier,

    /** Message décrivant la corruption du fichier de données, ou `null`. */
    corruption() {
      return corruption;
    },

    // ---- Recettes ------------------------------------------------------------

    /** Toutes les recettes (copies : le stockage reste seul maître des originaux). */
    listerRecettes() {
      return donnees.recettes.map((r) => ({ ...r }));
    },

    /** Ajoute une recette déjà validée. Retourne la recette créée. */
    ajouterRecette(champs) {
      return this.ajouterRecettes([champs])[0];
    },

    /** Ajoute un lot de recettes validées en une seule écriture (import). */
    ajouterRecettes(lot) {
      const maintenant = horodatage();
      const creees = lot.map((champs) => ({
        id: crypto.randomUUID(),
        ...champs,
        creeLe: maintenant,
        modifieLe: maintenant
      }));
      return ecrire(
        () => { donnees.recettes.push(...creees); return creees.map((r) => ({ ...r })); },
        () => { donnees.recettes.length -= creees.length; }
      );
    },

    /** Met à jour une recette. Retourne la recette modifiée, ou `null` si absente. */
    modifierRecette(id, champs) {
      const recette = donnees.recettes.find((r) => r.id === id);
      if (!recette) return null;
      const avant = { ...recette };
      return ecrire(
        () => { Object.assign(recette, champs, { modifieLe: horodatage() }); return { ...recette }; },
        () => { Object.assign(recette, avant); }
      );
    },

    /** Supprime une recette. Retourne `false` si l'identifiant est inconnu. */
    supprimerRecette(id) {
      const index = donnees.recettes.findIndex((r) => r.id === id);
      if (index === -1) return false;
      const [supprimee] = donnees.recettes.slice(index, index + 1);
      return ecrire(
        () => { donnees.recettes.splice(index, 1); return true; },
        () => { donnees.recettes.splice(index, 0, supprimee); }
      );
    },

    // ---- Clients -------------------------------------------------------------

    /** Tous les clients, triés par nom. */
    listerClients() {
      return donnees.clients
        .map((c) => ({ ...c }))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
    },

    /** Ajoute un client déjà validé. Retourne le client créé. */
    ajouterClient(champs) {
      const maintenant = horodatage();
      const cree = { id: crypto.randomUUID(), ...champs, creeLe: maintenant, modifieLe: maintenant };
      return ecrire(
        () => { donnees.clients.push(cree); return { ...cree }; },
        () => { donnees.clients.pop(); }
      );
    },

    /** Met à jour un client. Retourne le client modifié, ou `null` si absent. */
    modifierClient(id, champs) {
      const client = donnees.clients.find((c) => c.id === id);
      if (!client) return null;
      const avant = { ...client };
      return ecrire(
        () => { Object.assign(client, champs, { modifieLe: horodatage() }); return { ...client }; },
        () => { Object.assign(client, avant); }
      );
    },

    /** Supprime un client. Retourne `false` si l'identifiant est inconnu. */
    supprimerClient(id) {
      const index = donnees.clients.findIndex((c) => c.id === id);
      if (index === -1) return false;
      const [supprime] = donnees.clients.slice(index, index + 1);
      return ecrire(
        () => { donnees.clients.splice(index, 1); return true; },
        () => { donnees.clients.splice(index, 0, supprime); }
      );
    },

    // ---- Paramètres ----------------------------------------------------------

    obtenirParametres() {
      return structuredClone(donnees.parametres);
    },

    /** Remplace les paramètres (déjà validés). */
    modifierParametres(parametres) {
      const avant = donnees.parametres;
      return ecrire(
        () => { donnees.parametres = { ...donnees.parametres, ...parametres }; return structuredClone(donnees.parametres); },
        () => { donnees.parametres = avant; }
      );
    },

    // ---- Sauvegardes ----------------------------------------------------------

    /**
     * Copie immédiate du fichier de données, étiquetée (« avant-import »…).
     * Les 10 plus récentes de chaque étiquette sont conservées.
     * Retourne le nom du fichier créé, ou `null` s'il n'y a rien à copier.
     */
    creerSauvegarde(etiquette) {
      if (!fs.existsSync(cheminFichier)) return null;
      fs.mkdirSync(dossierSauvegardes, { recursive: true });
      const horo = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const nom = `livre-des-recettes-${horo}-${etiquette}.json`;
      fs.copyFileSync(cheminFichier, path.join(dossierSauvegardes, nom));
      purger(new RegExp(`^livre-des-recettes-.*-${etiquette}\\.json$`), SAUVEGARDES_ETIQUETEES_CONSERVEES);
      return nom;
    },

    /** Sauvegardes disponibles, de la plus récente à la plus ancienne. */
    listerSauvegardes() {
      if (!fs.existsSync(dossierSauvegardes)) return [];
      return fs.readdirSync(dossierSauvegardes)
        .filter((f) => MOTIF_SAUVEGARDE.test(f))
        .map((fichier) => {
          const infos = fs.statSync(path.join(dossierSauvegardes, fichier));
          return { fichier, date: infos.mtime.toISOString(), taille: infos.size };
        })
        .sort((a, b) => b.date.localeCompare(a.date));
    },

    /**
     * Remplace les données courantes par le contenu d'une sauvegarde.
     * Le fichier courant est d'abord mis de côté (étiquette
     * « avant-restauration ») : une restauration n'efface jamais rien.
     */
    restaurerSauvegarde(fichier) {
      if (!MOTIF_SAUVEGARDE.test(fichier)) {
        throw new Error('Nom de sauvegarde invalide.');
      }
      const chemin = path.join(dossierSauvegardes, fichier);
      if (!fs.existsSync(chemin)) {
        throw new Error('Sauvegarde introuvable.');
      }
      let lu;
      try {
        lu = JSON.parse(fs.readFileSync(chemin, 'utf8'));
      } catch {
        throw new Error('Cette sauvegarde est elle-même illisible : choisissez-en une autre.');
      }
      if (!estDonneesValides(lu)) {
        throw new Error('Cette sauvegarde n’a pas la structure attendue : choisissez-en une autre.');
      }

      // Mise de côté du fichier courant (même corrompu : ce sont des octets).
      if (fs.existsSync(cheminFichier)) {
        fs.mkdirSync(dossierSauvegardes, { recursive: true });
        const horo = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        fs.copyFileSync(cheminFichier, path.join(dossierSauvegardes, `livre-des-recettes-${horo}-avant-restauration.json`));
        purger(/^livre-des-recettes-.*-avant-restauration\.json$/, SAUVEGARDES_ETIQUETEES_CONSERVEES);
      }

      donnees = normaliser(lu);
      corruption = null;
      sauvegarder();
      return { recettes: donnees.recettes.length, clients: donnees.clients.length };
    },

    /** Copie complète des données, pour la sauvegarde téléchargeable. */
    exporterDonnees() {
      return structuredClone(donnees);
    }
  };
}
