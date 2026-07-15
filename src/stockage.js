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
 *    `data/sauvegardes/` (30 jours glissants) avant la première écriture du jour ;
 *  - toute écriture qui échoue est annulée en mémoire : mémoire et fichier ne
 *    divergent jamais.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PARAMETRES_DEFAUT } from './partage/constantes.js';

const NOM_FICHIER = 'livre-des-recettes.json';
const DOSSIER_SAUVEGARDES = 'sauvegardes';
const SAUVEGARDES_CONSERVEES = 30;

/**
 * Crée le stockage adossé au dossier donné (créé au besoin).
 * Le contenu est chargé en mémoire une fois : le volume d'un livre des
 * recettes (quelques milliers de lignes au plus) le permet largement.
 */
export function creerStockage(dossierDonnees) {
  const cheminFichier = path.join(dossierDonnees, NOM_FICHIER);
  const dossierSauvegardes = path.join(dossierDonnees, DOSSIER_SAUVEGARDES);

  const donnees = charger();

  function charger() {
    if (!fs.existsSync(cheminFichier)) {
      return { version: 1, parametres: { ...PARAMETRES_DEFAUT }, recettes: [], clients: [] };
    }
    const brut = fs.readFileSync(cheminFichier, 'utf8');
    let lu;
    try {
      lu = JSON.parse(brut);
    } catch (erreur) {
      // On ne repart JAMAIS de zéro en écrasant un fichier illisible :
      // l'utilisateur doit pouvoir restaurer une sauvegarde.
      throw new Error(
        `Le fichier de données « ${cheminFichier} » est illisible (JSON invalide : ${erreur.message}). ` +
        `Restaurez une copie depuis « ${dossierSauvegardes} » puis relancez l'application.`
      );
    }
    return {
      version: 1,
      parametres: { ...PARAMETRES_DEFAUT, ...(lu.parametres ?? {}) },
      recettes: Array.isArray(lu.recettes) ? lu.recettes : [],
      clients: Array.isArray(lu.clients) ? lu.clients : []
    };
  }

  function sauvegarder() {
    fs.mkdirSync(dossierDonnees, { recursive: true });
    creerSauvegardeQuotidienne();
    const temporaire = `${cheminFichier}.tmp`;
    fs.writeFileSync(temporaire, JSON.stringify(donnees, null, 2), 'utf8');
    fs.renameSync(temporaire, cheminFichier);
  }

  /** Copie le fichier courant une fois par jour avant de le modifier. */
  function creerSauvegardeQuotidienne() {
    if (!fs.existsSync(cheminFichier)) return;
    fs.mkdirSync(dossierSauvegardes, { recursive: true });
    const jour = new Date().toISOString().slice(0, 10);
    const cible = path.join(dossierSauvegardes, `livre-des-recettes-${jour}.json`);
    if (fs.existsSync(cible)) return;
    fs.copyFileSync(cheminFichier, cible);

    // Purge : on garde les 30 sauvegardes les plus récentes (tri par nom = tri par date).
    const anciennes = fs.readdirSync(dossierSauvegardes)
      .filter((f) => /^livre-des-recettes-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .slice(0, -SAUVEGARDES_CONSERVEES);
    for (const fichier of anciennes) {
      fs.unlinkSync(path.join(dossierSauvegardes, fichier));
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
      return { ...donnees.parametres };
    },

    /** Remplace les paramètres (déjà validés). */
    modifierParametres(parametres) {
      const avant = donnees.parametres;
      return ecrire(
        () => { donnees.parametres = { ...donnees.parametres, ...parametres }; return { ...donnees.parametres }; },
        () => { donnees.parametres = avant; }
      );
    },

    /** Copie complète des données, pour la sauvegarde téléchargeable. */
    exporterDonnees() {
      return structuredClone(donnees);
    }
  };
}
