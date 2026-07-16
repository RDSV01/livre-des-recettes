/**
 * Validation des données entrantes (formulaire et import CSV).
 *
 * Chaque fonction retourne `{ erreurs, valeurs }` :
 *  - `erreurs` : objet `{ champ: message }`, ou `null` si tout est valide ;
 *  - `valeurs` : données normalisées (chaînes nettoyées, montant arrondi),
 *    ou `null` en cas d'erreur. Seuls les champs autorisés sont retournés,
 *    ce qui protège le stockage de toute écriture de champ arbitraire.
 */

import crypto from 'node:crypto';
import { MODES_REGLEMENT, DEVISES, FORMATS_DATE, CATEGORIES_RECETTE } from './partage/constantes.js';
import { TYPES_ACTIVITE } from './partage/seuils.js';
import { estDateIso } from './partage/dates.js';
import { analyserMontant } from './partage/montants.js';
import { normaliserTexte } from './partage/texte.js';

const LONGUEUR_MAX = 500;
const MONTANT_MAX = 100_000_000; // garde-fou contre les fautes de frappe
const MODES_PERSONNALISES_MAX = 20;

/** Nettoie une valeur libre en chaîne (trim), `''` si absente. */
function texte(valeur) {
  if (valeur == null) return '';
  return String(valeur).trim();
}

/**
 * Valide et normalise une recette.
 *
 * Le livre des recettes exporté ne comporte que les six colonnes légales :
 * date d'encaissement, client, libellé, numéro de facture, montant et mode
 * de règlement. Seuls le client, la date, le montant et le mode sont
 * obligatoires ; le libellé et la facture restent facultatifs.
 *
 * Une recette porte en plus une catégorie interne (vente / prestation),
 * obligatoire pour les activités mixtes : elle alimente le suivi des seuils
 * et le bilan URSSAF, sans jamais apparaître dans les exports.
 *
 * @param {object} [contexte]
 * @param {Array<{code: string}>} [contexte.modesPersonnalises] modes ajoutés
 *   par l'utilisateur, acceptés en plus des modes par défaut.
 * @param {string} [contexte.typeActivite] type d'activité des paramètres :
 *   « mixte » rend la catégorie obligatoire.
 */
export function validerRecette(entree, { modesPersonnalises = [], typeActivite = '' } = {}) {
  const e = entree ?? {};
  const erreurs = {};

  const dateEncaissement = texte(e.dateEncaissement);
  if (!dateEncaissement) {
    erreurs.dateEncaissement = 'La date d’encaissement est obligatoire.';
  } else if (!estDateIso(dateEncaissement)) {
    erreurs.dateEncaissement = 'Date invalide (format attendu : AAAA-MM-JJ).';
  }

  const client = texte(e.client);
  if (!client) {
    erreurs.client = 'Le nom du client est obligatoire.';
  } else if (client.length > LONGUEUR_MAX) {
    erreurs.client = `Le nom du client dépasse ${LONGUEUR_MAX} caractères.`;
  }

  const montant = analyserMontant(e.montant);
  if (montant === null) {
    erreurs.montant = 'Le montant encaissé est obligatoire et doit être un nombre.';
  } else if (montant <= 0) {
    erreurs.montant = 'Le montant doit être strictement positif.';
  } else if (montant > MONTANT_MAX) {
    erreurs.montant = 'Le montant est invraisemblablement élevé.';
  }

  const modeReglement = texte(e.modeReglement);
  if (!MODES_REGLEMENT.some((m) => m.code === modeReglement) &&
      !modesPersonnalises.some((m) => m.code === modeReglement)) {
    erreurs.modeReglement = 'Mode de règlement inconnu.';
  }

  const libelle = texte(e.libelle);
  const numeroFacture = texte(e.numeroFacture);
  if (libelle.length > LONGUEUR_MAX) erreurs.libelle = `Le libellé dépasse ${LONGUEUR_MAX} caractères.`;
  if (numeroFacture.length > 100) erreurs.numeroFacture = 'Le numéro de facture dépasse 100 caractères.';

  const categorie = texte(e.categorie);
  if (categorie && !CATEGORIES_RECETTE.some((c) => c.code === categorie)) {
    erreurs.categorie = 'Catégorie inconnue (vente ou prestation).';
  } else if (typeActivite === 'mixte' && !categorie) {
    erreurs.categorie = 'Activité mixte : précisez s’il s’agit d’une vente ou d’une prestation.';
  }

  if (Object.keys(erreurs).length > 0) {
    return { erreurs, valeurs: null };
  }
  return {
    erreurs: null,
    valeurs: {
      dateEncaissement,
      client,
      libelle,
      numeroFacture,
      montant: Math.round(montant * 100) / 100,
      modeReglement,
      categorie
    }
  };
}

/**
 * Valide et normalise une fiche client.
 * Le livre des recettes n'a besoin que du nom ; le SIRET est facultatif et
 * sert à la recherche automatique. Aucune autre donnée n'est demandée.
 */
export function validerClient(entree) {
  const e = entree ?? {};
  const erreurs = {};

  const nom = texte(e.nom);
  if (!nom) {
    erreurs.nom = 'Le nom du client est obligatoire.';
  } else if (nom.length > LONGUEUR_MAX) {
    erreurs.nom = `Le nom dépasse ${LONGUEUR_MAX} caractères.`;
  }

  // SIRET facultatif ; s'il est renseigné, on vérifie le format (14 chiffres).
  // Les espaces de présentation sont tolérés et retirés.
  const siret = texte(e.siret).replace(/\s/g, '');
  if (siret && !/^\d{14}$/.test(siret)) {
    erreurs.siret = 'Un SIRET comporte exactement 14 chiffres.';
  }

  if (Object.keys(erreurs).length > 0) {
    return { erreurs, valeurs: null };
  }
  return { erreurs: null, valeurs: { nom, siret } };
}

/**
 * Valide la liste des modes de règlement personnalisés.
 * Chaque mode garde un code stable (`perso-xxxxxxxx`) même s'il est renommé :
 * les recettes stockent le code, jamais le libellé.
 */
function validerModesPersonnalises(entree) {
  const liste = Array.isArray(entree) ? entree : [];
  if (liste.length > MODES_PERSONNALISES_MAX) {
    return { erreur: `Au plus ${MODES_PERSONNALISES_MAX} modes personnalisés.`, valeurs: null };
  }

  const libellesVus = new Set(MODES_REGLEMENT.map((m) => normaliserTexte(m.libelle)));
  const codesVus = new Set();
  const valeurs = [];
  for (const mode of liste) {
    const libelle = texte(mode?.libelle);
    if (!libelle) {
      return { erreur: 'Un mode personnalisé n’a pas de nom.', valeurs: null };
    }
    if (libelle.length > 50) {
      return { erreur: `Le nom d’un mode dépasse 50 caractères (« ${libelle.slice(0, 20)}… »).`, valeurs: null };
    }
    const cle = normaliserTexte(libelle);
    if (libellesVus.has(cle)) {
      return { erreur: `Le mode « ${libelle} » existe déjà.`, valeurs: null };
    }
    libellesVus.add(cle);

    // Code stable conservé s'il est bien formé, sinon un nouveau est généré.
    let code = texte(mode?.code);
    if (!/^perso-[a-f0-9]{8}$/.test(code) || codesVus.has(code)) {
      code = `perso-${crypto.randomBytes(4).toString('hex')}`;
    }
    codesVus.add(code);
    valeurs.push({ code, libelle });
  }
  return { erreur: null, valeurs };
}

/** Booléen d'option : valeur explicite si fournie, sinon la valeur par défaut. */
function booleen(valeur, defaut) {
  if (valeur === undefined || valeur === null) return defaut;
  return valeur === true || valeur === 'true' || valeur === 'on';
}

/** Valide et normalise les paramètres de l'application. */
export function validerParametres(entree) {
  const e = entree ?? {};
  const erreurs = {};

  const nomEntreprise = texte(e.nomEntreprise);
  const adresse = texte(e.adresse);
  const activite = texte(e.activite);
  if (nomEntreprise.length > LONGUEUR_MAX) erreurs.nomEntreprise = 'Nom trop long.';
  if (adresse.length > LONGUEUR_MAX) erreurs.adresse = 'Adresse trop longue.';
  if (activite.length > LONGUEUR_MAX) erreurs.activite = 'Activité trop longue.';

  // SIREN / SIRET : facultatifs ; s'ils sont renseignés, on vérifie le format
  // (9 et 14 chiffres). Les espaces de présentation sont tolérés et retirés.
  const siren = texte(e.siren).replace(/\s/g, '');
  if (siren && !/^\d{9}$/.test(siren)) {
    erreurs.siren = 'Un SIREN comporte exactement 9 chiffres.';
  }
  const siret = texte(e.siret).replace(/\s/g, '');
  if (siret && !/^\d{14}$/.test(siret)) {
    erreurs.siret = 'Un SIRET comporte exactement 14 chiffres.';
  }

  const typeActivite = texte(e.typeActivite);
  if (!TYPES_ACTIVITE.some((t) => t.code === typeActivite)) {
    erreurs.typeActivite = 'Type d’activité inconnu.';
  }

  const devise = texte(e.devise) || 'EUR';
  if (!DEVISES.some((d) => d.code === devise)) {
    erreurs.devise = 'Devise non prise en charge.';
  }

  const formatDate = texte(e.formatDate) || 'JJ/MM/AAAA';
  if (!FORMATS_DATE.some((f) => f.code === formatDate)) {
    erreurs.formatDate = 'Format de date non pris en charge.';
  }

  const modes = validerModesPersonnalises(e.modesPersonnalises);
  if (modes.erreur) {
    erreurs.modesPersonnalises = modes.erreur;
  }

  if (Object.keys(erreurs).length > 0) {
    return { erreurs, valeurs: null };
  }
  return {
    erreurs: null,
    valeurs: {
      nomEntreprise, siren, siret, adresse, activite, typeActivite,
      devise, formatDate, modesPersonnalises: modes.valeurs,
      alertesNumerotation: booleen(e.alertesNumerotation, true),
      alerteRecetteSimilaire: booleen(e.alerteRecetteSimilaire, true),
      suiviSeuils: booleen(e.suiviSeuils, true)
    }
  };
}
