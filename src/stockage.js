/**
 * Persistance du livre des recettes.
 *
 * Toutes les données vivent dans UN SEUL fichier JSON lisible,
 * `livre-des-recettes.json`, rangé dans « Documents/Livre des recettes »
 * (voir `emplacements.js`). Ce choix est volontaire :
 *
 *  - aucune base de données à installer, l'application reste ultra légère ;
 *  - sauvegarder = copier un fichier ; changer de PC = copier un fichier ;
 *  - le fichier reste lisible par un humain (et par un tableur au besoin).
 *
 * Le fichier contient les deux registres (recettes et achats), la liste des
 * clients (aide à la saisie) et les paramètres de l'entreprise.
 *
 * Garanties contre la perte de données :
 *  - écriture atomique (fichier temporaire puis renommage) : une coupure en
 *    pleine écriture ne corrompt jamais le fichier existant ;
 *  - une sauvegarde quotidienne automatique est conservée HORS du dossier de
 *    données (voir `emplacements.js`), plus une sauvegarde étiquetée avant
 *    chaque opération sensible (import, restauration). Supprimer le dossier
 *    de données ne détruit donc pas les copies ;
 *  - toute écriture qui échoue est annulée en mémoire : mémoire et fichier ne
 *    divergent jamais ;
 *  - au démarrage, le fichier est vérifié : s'il est corrompu, l'application
 *    démarre en lecture seule et propose de restaurer une sauvegarde, sans
 *    JAMAIS écraser le fichier abîmé ;
 *  - s'il a purement disparu alors que des sauvegardes existent, l'application
 *    le signale et propose de le reconstituer.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PARAMETRES_DEFAUT } from './partage/constantes.js';
import { aujourdHuiIso } from './partage/dates.js';
import { normaliserTexte } from './partage/texte.js';
import { dossierSauvegardesParDefaut } from './emplacements.js';

const NOM_FICHIER = 'livre-des-recettes.json';
// Copie tenue à jour à chaque écriture, hors du dossier de données : une
// suppression de celui-ci ne fait alors perdre aucune saisie, pas même
// celles du jour (les autres copies sont quotidiennes).
const NOM_COPIE_DE_SECOURS = 'livre-des-recettes-copie-de-secours.json';
const SAUVEGARDES_ETIQUETEES_CONSERVEES = 10;

// Rotation des sauvegardes quotidiennes : tout est gardé 14 jours, puis une
// par semaine pendant 2 mois, puis une par mois pendant 1 an.
const ROTATION_QUOTIDIENNE_JOURS = 14;
const ROTATION_HEBDOMADAIRE_JOURS = 62;
const ROTATION_MENSUELLE_JOURS = 366;

/** Nom de fichier accepté pour une sauvegarde (borne toute traversée de chemin). */
const MOTIF_SAUVEGARDE = /^livre-des-recettes-[A-Za-z0-9-]+\.json$/;

/**
 * Horodatage d'un nom de sauvegarde étiquetée, à l'heure LOCALE
 * (« 2026-09-22-21-52-17 ») : c'est celle que l'utilisateur lit sur sa
 * montre. L'heure universelle affichait 19 h 52 pour une copie faite à 21 h 52.
 */
function horodatageFichier(date = new Date()) {
  const deux = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(), deux(date.getMonth() + 1), deux(date.getDate()),
    deux(date.getHours()), deux(date.getMinutes()), deux(date.getSeconds())
  ].join('-');
}

/**
 * Écrit un fichier de façon durable : contenu dans un fichier temporaire,
 * vidé jusqu'au disque (`fsync`), puis renommé par-dessus la cible.
 *
 * Sans le `fsync`, le renommage peut atteindre le disque AVANT le contenu :
 * une coupure de courant à ce moment laisse, sur certains systèmes de
 * fichiers, un fichier de données vide sous le bon nom. Le renommage, lui,
 * garantit qu'on lit toujours l'ancien fichier entier ou le nouveau entier.
 */
export function ecrireDurablement(chemin, contenu) {
  const temporaire = `${chemin}.tmp`;
  const fd = fs.openSync(temporaire, 'w');
  try {
    fs.writeFileSync(fd, contenu, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporaire, chemin);
  // Sous Linux et macOS, le renommage lui-même vit dans le dossier : on le
  // fige aussi. Windows ne sait pas ouvrir un dossier ainsi, et NTFS
  // journalise déjà l'opération.
  if (process.platform !== 'win32') {
    try {
      const dossier = fs.openSync(path.dirname(chemin), 'r');
      try { fs.fsyncSync(dossier); } finally { fs.closeSync(dossier); }
    } catch { /* système de fichiers qui refuse : le contenu est déjà sur disque */ }
  }
}

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
function estDonneesValides(objet) {
  return objet !== null &&
    typeof objet === 'object' &&
    !Array.isArray(objet) &&
    (objet.recettes === undefined || Array.isArray(objet.recettes)) &&
    (objet.achats === undefined || Array.isArray(objet.achats)) &&
    (objet.clients === undefined || Array.isArray(objet.clients)) &&
    (objet.parametres === undefined ||
      (typeof objet.parametres === 'object' && objet.parametres !== null && !Array.isArray(objet.parametres)));
}

/**
 * Crée le stockage adossé au dossier donné (créé au besoin).
 * Le contenu est chargé en mémoire une fois : le volume d'un livre des
 * recettes (quelques milliers de lignes au plus) le permet largement.
 *
 * @param {string} dossierDonnees dossier du fichier de données.
 * @param {object} [options]
 * @param {string} [options.dossierSauvegardes] où ranger les sauvegardes
 *   automatiques (par défaut : hors du dossier de données, voir
 *   `emplacements.js`). Les tests s'en servent pour rester isolés.
 */
export function creerStockage(dossierDonnees, { dossierSauvegardes = dossierSauvegardesParDefaut(dossierDonnees) } = {}) {
  const cheminFichier = path.join(dossierDonnees, NOM_FICHIER);

  /** Message d'erreur si le fichier est corrompu, sinon `null`. */
  let corruption = null;

  // Vrai si la dernière tentative de copie de secours a échoué : l'utilisateur
  // travaille alors sans filet (dossier de sauvegardes inaccessible) et
  // l'interface doit pouvoir l'en avertir, sans jamais bloquer la saisie.
  let copieDeSecoursEnEchec = false;

  // Un fichier absent alors que des sauvegardes existent n'est pas une
  // première utilisation : c'est une disparition, et elle se répare.
  const fichierAbsent = !fs.existsSync(cheminFichier);
  let donnees = charger();
  let disparition = fichierAbsent && sauvegardes().length > 0;

  /**
   * Sauvegardes présentes, de la plus récente à la plus ancienne.
   *
   * Un dossier illisible ne doit pas empêcher l'application de démarrer ni de
   * répondre : sans copies consultables, il reste toujours le fichier de
   * données. La liste vide dit exactement cela.
   */
  function sauvegardes() {
    try {
      return listerSauvegardesDuDossier();
    } catch {
      return [];
    }
  }

  function listerSauvegardesDuDossier() {
    if (!fs.existsSync(dossierSauvegardes)) return [];
    return fs.readdirSync(dossierSauvegardes)
      .filter((f) => MOTIF_SAUVEGARDE.test(f))
      .map((fichier) => {
        const infos = fs.statSync(path.join(dossierSauvegardes, fichier));
        return { fichier, date: infos.mtime.toISOString(), taille: infos.size };
      })
      // La copie de secours, réécrite à chaque saisie, reflète toujours l'état
      // le plus récent : elle passe en tête, indépendamment de l'horodatage du
      // système de fichiers. Sur Linux et macOS, deux écritures rapprochées
      // peuvent porter le même horodatage (résolution insuffisante) ; s'en
      // remettre à lui seul risquerait de proposer une sauvegarde plus ancienne
      // qu'elle pour la restauration.
      .sort((a, b) => {
        if (a.fichier === NOM_COPIE_DE_SECOURS) return -1;
        if (b.fichier === NOM_COPIE_DE_SECOURS) return 1;
        return b.date.localeCompare(a.date);
      });
  }

  /** Complète un contenu lu avec les valeurs par défaut manquantes. */
  function normaliser(lu) {
    return {
      version: 1,
      parametres: { ...PARAMETRES_DEFAUT, ...(lu.parametres ?? {}) },
      recettes: Array.isArray(lu.recettes) ? lu.recettes : [],
      achats: Array.isArray(lu.achats) ? lu.achats : [],
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
    const contenu = JSON.stringify(donnees, null, 2);
    ecrireDurablement(cheminFichier, contenu);
    rafraichirCopieDeSecours(contenu);
  }

  /**
   * Met à jour la copie de secours, hors du dossier de données, avec le
   * contenu qui vient d'être écrit.
   *
   * Son échec (disque plein, dossier inaccessible) ne doit jamais empêcher
   * l'utilisateur de travailler : le fichier principal vient d'être écrit,
   * et la copie repartira à l'écriture suivante.
   */
  function rafraichirCopieDeSecours(contenu) {
    try {
      fs.mkdirSync(dossierSauvegardes, { recursive: true });
      ecrireDurablement(path.join(dossierSauvegardes, NOM_COPIE_DE_SECOURS), contenu);
      copieDeSecoursEnEchec = false;
    } catch {
      // Réessayé à la prochaine écriture ; l'interface signale l'absence de filet.
      copieDeSecoursEnEchec = true;
    }
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

  /**
   * Copie le fichier courant une fois par jour avant de le modifier.
   *
   * Comme la copie de secours, son échec ne bloque jamais la saisie : tenir le
   * registre est l'obligation de l'utilisateur, la sauvegarde n'est qu'un
   * filet. Un dossier devenu inaccessible (lecteur réseau absent, disque
   * plein, antivirus) l'empêcherait sinon d'enregistrer la moindre recette.
   */
  function creerSauvegardeQuotidienne() {
    if (!fs.existsSync(cheminFichier)) return;
    try {
      fs.mkdirSync(dossierSauvegardes, { recursive: true });
      // Jour LOCAL : entre minuit et 2 h en été, l'heure universelle datait
      // encore la sauvegarde de la veille.
      const jour = aujourdHuiIso();
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
    } catch { /* réessayé à la prochaine écriture */ }
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

  // ---- Opérations sur les listes ------------------------------------------------
  //
  // Une seule écriture par opération, en tout ou rien, qu'elle porte sur une
  // ligne ou sur deux cents. Chaque opération remplace la liste par une
  // nouvelle : l'ancienne, restée intacte, sert à tout remettre en place si
  // l'écriture échoue.

  /** Copies des lignes : le stockage reste seul maître des originaux. */
  const copies = (lignes) => lignes.map((e) => ({ ...e }));

  /** Ligne neuve : identifiant et horodatages sont attribués ici. */
  const nouvelleLigne = (champs, maintenant) =>
    ({ id: crypto.randomUUID(), ...champs, creeLe: maintenant, modifieLe: maintenant });

  /** Remplace une liste en une écriture ; `resultat` est renvoyé si elle réussit. */
  function remplacer(collection, nouvelle, resultat) {
    const avant = donnees[collection];
    return ecrire(
      () => { donnees[collection] = nouvelle; return resultat; },
      () => { donnees[collection] = avant; }
    );
  }

  /** Ajoute des lignes déjà validées ; retourne les lignes créées. */
  function ajouterLot(collection, lot) {
    const maintenant = horodatage();
    const creees = lot.map((champs) => nouvelleLigne(champs, maintenant));
    return remplacer(collection, [...donnees[collection], ...creees], copies(creees));
  }

  /** Retire les lignes dont l'identifiant est donné ; retourne celles retirées. */
  function supprimerLot(collection, ids) {
    const cibles = new Set(ids);
    const retirees = donnees[collection].filter((e) => cibles.has(e.id));
    if (retirees.length === 0) return [];
    return remplacer(collection, donnees[collection].filter((e) => !cibles.has(e.id)), copies(retirees));
  }

  /**
   * Remet des lignes complètes (identifiant et horodatages d'origine compris),
   * pour annuler une suppression. Refuse un identifiant déjà présent :
   * restaurer deux fois créerait un doublon.
   */
  function restaurerLot(collection, lignes) {
    const presents = new Set(donnees[collection].map((e) => e.id));
    for (const ligne of lignes) {
      if (presents.has(ligne.id)) {
        throw Object.assign(new Error('Cette ligne figure déjà dans le registre.'), { code: 'EXISTE' });
      }
      presents.add(ligne.id);
    }
    const maintenant = horodatage();
    const restaurees = lignes.map((e) => ({
      ...e, creeLe: e.creeLe ?? maintenant, modifieLe: e.modifieLe ?? maintenant
    }));
    return remplacer(collection, [...donnees[collection], ...restaurees], copies(restaurees));
  }

  /**
   * Applique des modifications déjà validées (`[{ id, champs }]`). Retourne
   * `null`, sans rien écrire, si un identifiant est inconnu.
   */
  function modifierLot(collection, changements) {
    const parId = new Map(changements.map((c) => [c.id, c.champs]));
    const liste = donnees[collection];
    if (liste.filter((e) => parId.has(e.id)).length !== parId.size) return null;
    const maintenant = horodatage();
    const apres = liste.map((e) => (parId.has(e.id) ? { ...e, ...parId.get(e.id), modifieLe: maintenant } : e));
    return remplacer(collection, apres, copies(apres.filter((e) => parId.has(e.id))));
  }

  /** Une ligne modifiée, ou `null` si elle est absente. */
  const modifierUn = (collection, id, champs) => modifierLot(collection, [{ id, champs }])?.[0] ?? null;

  /** Vrai si la ligne existait et a été supprimée. */
  const supprimerUn = (collection, id) => supprimerLot(collection, [id]).length > 0;

  /** Une ligne, ou `null` si elle est absente. */
  const obtenirUn = (collection, id) => {
    const ligne = donnees[collection].find((e) => e.id === id);
    return ligne ? { ...ligne } : null;
  };

  /**
   * Retire la pièce jointe d'une ligne. Retourne `{ ligne, piece }` (la fiche
   * retirée, pour pouvoir la rattacher), ou `null` si la ligne est absente.
   * Le fichier, lui, reste en place : les sauvegardes peuvent encore le citer.
   */
  function retirerPiece(collection, id) {
    const ligne = donnees[collection].find((e) => e.id === id);
    if (!ligne) return null;
    const { pieceJointe, ...sans } = ligne;
    const apres = { ...sans, modifieLe: horodatage() };
    const nouvelle = donnees[collection].map((e) => (e.id === id ? apres : e));
    return remplacer(collection, nouvelle, { ligne: { ...apres }, piece: pieceJointe ?? null });
  }

  /**
   * Modifie un client. Si son nom change, ses recettes (rapprochées par le
   * nom, sans casse ni accents, comme partout ailleurs) prennent le nouveau
   * nom dans la même écriture : le carnet et le livre ne se contredisent
   * jamais, et la fiche du client garde ses encaissements.
   *
   * @returns {{ client: object, recettesRenommees: number }|null} `null` si
   *   le client est absent.
   */
  function modifierClient(id, champs) {
    const ancien = donnees.clients.find((c) => c.id === id);
    if (!ancien) return null;
    const maintenant = horodatage();
    const client = { ...ancien, ...champs, modifieLe: maintenant };
    const cle = normaliserTexte(ancien.nom);
    let recettesRenommees = 0;
    const recettes = donnees.recettes.map((r) => {
      if (client.nom === ancien.nom || r.client === client.nom || normaliserTexte(r.client) !== cle) return r;
      recettesRenommees += 1;
      return { ...r, client: client.nom, modifieLe: maintenant };
    });
    const avant = { clients: donnees.clients, recettes: donnees.recettes };
    return ecrire(
      () => {
        donnees.clients = donnees.clients.map((c) => (c.id === id ? client : c));
        donnees.recettes = recettes;
        return { client: { ...client }, recettesRenommees };
      },
      () => { Object.assign(donnees, avant); }
    );
  }

  /**
   * Identifiants des pièces citées par le livre ET par ses sauvegardes : une
   * pièce qu'une sauvegarde cite encore doit survivre, pour que la restaurer
   * retrouve ses PDF. Une sauvegarde illisible fait tout garder, par prudence.
   */
  function piecesCitees() {
    const citees = new Set();
    const relever = (contenu) => {
      for (const liste of [contenu?.recettes, contenu?.achats]) {
        for (const ligne of Array.isArray(liste) ? liste : []) {
          if (ligne?.pieceJointe?.id) citees.add(String(ligne.pieceJointe.id));
        }
      }
    };
    relever(donnees);
    for (const { fichier } of sauvegardes()) {
      try {
        relever(JSON.parse(fs.readFileSync(path.join(dossierSauvegardes, fichier), 'utf8')));
      } catch {
        return null;
      }
    }
    return citees;
  }

  return {
    cheminFichier,
    dossierSauvegardes,

    /** Message décrivant la corruption du fichier de données, ou `null`. */
    corruption() {
      return corruption;
    },

    /**
     * La copie de secours n'a pas pu être écrite lors de la dernière saisie :
     * l'utilisateur travaille sans filet (dossier de sauvegardes inaccessible).
     * L'interface l'en avertit ; la saisie, elle, n'est jamais bloquée.
     */
    sauvegardesEnEchec() {
      return copieDeSecoursEnEchec;
    },

    /**
     * Le fichier de données a-t-il disparu alors que des sauvegardes
     * existent ? L'interface propose alors de le reconstituer.
     */
    donneesAbsentes() {
      return disparition;
    },

    /**
     * Repart d'un livre vide : le fichier (et son dossier) sont recréés.
     * Choisi par l'utilisateur qui préfère ignorer les sauvegardes.
     *
     * La copie de secours reflète le dernier état connu : elle est mise de
     * côté avant d'être remplacée par le livre vide, pour qu'un changement
     * d'avis reste possible.
     */
    repartirDeZero() {
      const secours = path.join(dossierSauvegardes, NOM_COPIE_DE_SECOURS);
      if (fs.existsSync(secours)) {
        const horo = horodatageFichier();
        fs.copyFileSync(secours, path.join(dossierSauvegardes, `livre-des-recettes-${horo}-avant-remise-a-zero.json`));
        purger(/^livre-des-recettes-.*-avant-remise-a-zero\.json$/, SAUVEGARDES_ETIQUETEES_CONSERVEES);
      }
      donnees = normaliser({});
      corruption = null;
      sauvegarder();
      disparition = false;
    },

    /**
     * Remplace tout le contenu par un jeu de démonstration (champs métier sans
     * identifiant : ils sont générés ici). En une seule écriture, annulable si
     * elle échoue. La route appelante s'assure d'abord que le livre est vide.
     */
    chargerDemo(jeu) {
      const maintenant = horodatage();
      const avecId = (champs) => nouvelleLigne(champs, maintenant);
      const nouveau = normaliser({
        parametres: jeu.parametres,
        recettes: (jeu.recettes ?? []).map(avecId),
        achats: (jeu.achats ?? []).map(avecId),
        clients: (jeu.clients ?? []).map(avecId)
      });
      const avant = donnees;
      return ecrire(
        () => { donnees = nouveau; return true; },
        () => { donnees = avant; }
      );
    },

    /** Nombre d'éléments par registre, sans recopier les listes. */
    compter() {
      return {
        recettes: donnees.recettes.length,
        achats: donnees.achats.length,
        clients: donnees.clients.length
      };
    },

    // ---- Registres et carnet de clients ----------------------------------------
    //
    // Chaque opération unitaire est un cas particulier de l'opération groupée :
    // une seule implémentation par opération, pour les trois listes.

    /** Toutes les recettes. */
    listerRecettes: () => copies(donnees.recettes),
    /** Ajoute une recette déjà validée ; retourne la recette créée. */
    ajouterRecette: (champs) => ajouterLot('recettes', [champs])[0],
    /** Ajoute un lot de recettes validées en une seule écriture (import). */
    ajouterRecettes: (lot) => ajouterLot('recettes', lot),
    /** Met à jour une recette ; `null` si elle est absente. */
    modifierRecette: (id, champs) => modifierUn('recettes', id, champs),
    /** Supprime une recette ; `false` si l'identifiant est inconnu. */
    supprimerRecette: (id) => supprimerUn('recettes', id),
    /** Supprime plusieurs recettes en une écriture ; retourne celles supprimées. */
    supprimerRecettes: (ids) => supprimerLot('recettes', ids),
    /** Remet des recettes supprimées, identifiant et dates d'origine compris. */
    restaurerRecettes: (lignes) => restaurerLot('recettes', lignes),
    /** Modifie plusieurs recettes en une écriture (`null` si l'une est inconnue). */
    modifierRecettes: (changements) => modifierLot('recettes', changements),

    // ---- Pièces jointes (communes aux deux registres) ---------------------------

    /** Une ligne d'un registre (`recettes` ou `achats`), ou `null`. */
    obtenirLigne: obtenirUn,
    /** Attache la fiche d'une pièce à une ligne ; retourne la ligne, ou `null`. */
    joindrePiece: (collection, id, piece) => modifierUn(collection, id, { pieceJointe: piece }),
    retirerPiece,
    /** Pièces citées par le livre et ses sauvegardes, ou `null` si l'une est illisible. */
    piecesCitees,
    /** Nombre et poids des pièces jointes du livre. */
    bilanPieces() {
      const fiches = [...donnees.recettes, ...donnees.achats].map((l) => l.pieceJointe).filter(Boolean);
      return { nombre: fiches.length, taille: fiches.reduce((t, p) => t + (Number(p.taille) || 0), 0) };
    },

    listerAchats: () => copies(donnees.achats),
    ajouterAchat: (champs) => ajouterLot('achats', [champs])[0],
    ajouterAchats: (lot) => ajouterLot('achats', lot),
    modifierAchat: (id, champs) => modifierUn('achats', id, champs),
    supprimerAchat: (id) => supprimerUn('achats', id),
    supprimerAchats: (ids) => supprimerLot('achats', ids),
    restaurerAchats: (lignes) => restaurerLot('achats', lignes),

    /** Tous les clients, triés par nom. */
    listerClients: () => copies(donnees.clients)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })),
    ajouterClient: (champs) => ajouterLot('clients', [champs])[0],
    modifierClient,
    supprimerClient: (id) => supprimerUn('clients', id),

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
      const horo = horodatageFichier();
      const nom = `livre-des-recettes-${horo}-${etiquette}.json`;
      fs.copyFileSync(cheminFichier, path.join(dossierSauvegardes, nom));
      purger(new RegExp(`^livre-des-recettes-.*-${etiquette}\\.json$`), SAUVEGARDES_ETIQUETEES_CONSERVEES);
      return nom;
    },

    /** Sauvegardes disponibles, de la plus récente à la plus ancienne. */
    listerSauvegardes: sauvegardes,

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
        const horo = horodatageFichier();
        fs.copyFileSync(cheminFichier, path.join(dossierSauvegardes, `livre-des-recettes-${horo}-avant-restauration.json`));
        purger(/^livre-des-recettes-.*-avant-restauration\.json$/, SAUVEGARDES_ETIQUETEES_CONSERVEES);
      }

      donnees = normaliser(lu);
      corruption = null;
      // Le dossier de données est recréé au besoin par l'écriture qui suit.
      sauvegarder();
      disparition = false;
      return { recettes: donnees.recettes.length, clients: donnees.clients.length };
    },

    /** Copie complète des données, pour la sauvegarde téléchargeable. */
    exporterDonnees() {
      return structuredClone(donnees);
    }
  };
}
