/**
 * Validation des données entrantes (formulaire et import CSV).
 *
 * Chaque fonction retourne `{ erreurs, valeurs }` :
 *  - `erreurs` : objet `{ champ: message }`, ou `null` si tout est valide ;
 *  - `valeurs` : données normalisées (chaînes nettoyées, montant arrondi),
 *    ou `null` en cas d'erreur. Seuls les champs autorisés sont retournés,
 *    ce qui protège le stockage de toute écriture de champ arbitraire.
 */

import { MODES_REGLEMENT, DEVISES, FORMATS_DATE } from './partage/constantes.js';
import { estDateIso } from './partage/dates.js';
import { analyserMontant, enCentimes } from './partage/montants.js';
import { normaliserTexte } from './partage/texte.js';

const LONGUEUR_MAX = 500;
const MONTANT_MAX = 100_000_000; // garde-fou contre les fautes de frappe

/** Nettoie une valeur libre en chaîne (trim), `''` si absente. */
function texte(valeur) {
  if (valeur == null) return '';
  return String(valeur).trim();
}

/**
 * Valide et normalise une recette.
 *
 * Le livre des recettes ne comporte que les six colonnes légales :
 * date d'encaissement, client, libellé, numéro de facture, montant et
 * mode de règlement. Seuls le client, la date, le montant et le mode sont
 * obligatoires ; le libellé et la facture restent facultatifs.
 */
export function validerRecette(entree) {
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
  if (!MODES_REGLEMENT.some((m) => m.code === modeReglement)) {
    erreurs.modeReglement = 'Mode de règlement inconnu.';
  }

  const libelle = texte(e.libelle);
  const numeroFacture = texte(e.numeroFacture);
  if (libelle.length > LONGUEUR_MAX) erreurs.libelle = `Le libellé dépasse ${LONGUEUR_MAX} caractères.`;
  if (numeroFacture.length > 100) erreurs.numeroFacture = 'Le numéro de facture dépasse 100 caractères.';

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
      modeReglement
    }
  };
}

/**
 * Détecte si une recette est un doublon parmi `existantes`.
 * Règle : même date d'encaissement, même montant et même client
 * (comparaison insensible à la casse et aux accents). Si les deux recettes
 * portent un numéro de facture, il doit aussi coïncider : deux factures
 * distinctes de même montant le même jour ne sont pas des doublons.
 */
export function estDoublon(recette, existantes) {
  const client = normaliserTexte(recette.client);
  const facture = normaliserTexte(recette.numeroFacture);
  const centimes = enCentimes(recette.montant);
  return existantes.some((autre) =>
    autre.dateEncaissement === recette.dateEncaissement &&
    enCentimes(autre.montant) === centimes &&
    normaliserTexte(autre.client) === client &&
    (!facture || !normaliserTexte(autre.numeroFacture) ||
      normaliserTexte(autre.numeroFacture) === facture)
  );
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

  const devise = texte(e.devise) || 'EUR';
  if (!DEVISES.some((d) => d.code === devise)) {
    erreurs.devise = 'Devise non prise en charge.';
  }

  const formatDate = texte(e.formatDate) || 'JJ/MM/AAAA';
  if (!FORMATS_DATE.some((f) => f.code === formatDate)) {
    erreurs.formatDate = 'Format de date non pris en charge.';
  }

  if (Object.keys(erreurs).length > 0) {
    return { erreurs, valeurs: null };
  }
  return {
    erreurs: null,
    valeurs: { nomEntreprise, siren, siret, adresse, activite, devise, formatDate }
  };
}
