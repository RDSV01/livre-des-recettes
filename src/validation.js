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
import { TYPES_ACTIVITE, NATURES_PRESTATIONS } from './partage/seuils.js';
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
 * Vérifie la clé de contrôle d'un SIREN (9 chiffres) ou d'un SIRET
 * (14 chiffres) : algorithme de Luhn, qui détecte la quasi-totalité des
 * fautes de frappe. Exception historique : les établissements de La Poste
 * (SIREN 356000000) sont aussi acceptés quand la somme simple de leurs
 * chiffres est un multiple de 5.
 */
export function cleSirenValide(chiffres) {
  let somme = 0;
  for (let i = 0; i < chiffres.length; i += 1) {
    // En partant de la droite, un chiffre sur deux est doublé.
    let n = Number(chiffres[chiffres.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somme += n;
  }
  if (somme % 10 === 0) return true;
  return chiffres.startsWith('356000000') &&
    [...chiffres].reduce((s, c) => s + Number(c), 0) % 5 === 0;
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
 * facultative : elle alimente le suivi des seuils et le bilan URSSAF des
 * activités mixtes (le formulaire la rend alors obligatoire à la saisie),
 * et la ventilation de leurs exports.
 *
 * @param {Array<{code: string}>} [modesPersonnalises] modes ajoutés par
 *   l'utilisateur dans les paramètres, acceptés en plus des modes par défaut.
 */
export function validerRecette(entree, modesPersonnalises = []) {
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
 * Valide et normalise un achat du registre des achats.
 *
 * Cinq colonnes légales : date du règlement, fournisseur, référence de la
 * facture ou du justificatif, mode de paiement, montant. Seule la référence
 * est facultative (un petit achat n'a pas toujours de pièce numérotée).
 *
 * @param {Array<{code: string}>} [modesPersonnalises] modes ajoutés par
 *   l'utilisateur dans les paramètres, acceptés en plus des modes par défaut.
 */
export function validerAchat(entree, modesPersonnalises = []) {
  const e = entree ?? {};
  const erreurs = {};

  const dateReglement = texte(e.dateReglement);
  if (!dateReglement) {
    erreurs.dateReglement = 'La date du règlement est obligatoire.';
  } else if (!estDateIso(dateReglement)) {
    erreurs.dateReglement = 'Date invalide (format attendu : AAAA-MM-JJ).';
  }

  const fournisseur = texte(e.fournisseur);
  if (!fournisseur) {
    erreurs.fournisseur = 'Le nom du fournisseur est obligatoire.';
  } else if (fournisseur.length > LONGUEUR_MAX) {
    erreurs.fournisseur = `Le nom du fournisseur dépasse ${LONGUEUR_MAX} caractères.`;
  }

  const montant = analyserMontant(e.montant);
  if (montant === null) {
    erreurs.montant = 'Le montant de l’achat est obligatoire et doit être un nombre.';
  } else if (montant <= 0) {
    erreurs.montant = 'Le montant doit être strictement positif.';
  } else if (montant > MONTANT_MAX) {
    erreurs.montant = 'Le montant est invraisemblablement élevé.';
  }

  const modeReglement = texte(e.modeReglement);
  if (!MODES_REGLEMENT.some((m) => m.code === modeReglement) &&
      !modesPersonnalises.some((m) => m.code === modeReglement)) {
    erreurs.modeReglement = 'Mode de paiement inconnu.';
  }

  const referenceFacture = texte(e.referenceFacture);
  if (referenceFacture.length > 100) {
    erreurs.referenceFacture = 'La référence dépasse 100 caractères.';
  }

  if (Object.keys(erreurs).length > 0) {
    return { erreurs, valeurs: null };
  }
  return {
    erreurs: null,
    valeurs: {
      dateReglement,
      fournisseur,
      referenceFacture,
      montant: Math.round(montant * 100) / 100,
      modeReglement
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

  // SIRET facultatif ; s'il est renseigné, on vérifie le format (14 chiffres)
  // puis la clé de contrôle. Les espaces de présentation sont tolérés.
  const siret = texte(e.siret).replace(/\s/g, '');
  if (siret && !/^\d{14}$/.test(siret)) {
    erreurs.siret = 'Un SIRET comporte exactement 14 chiffres.';
  } else if (siret && !cleSirenValide(siret)) {
    erreurs.siret = 'Ce SIRET ne semble pas valide (clé de contrôle incorrecte) : vérifiez la saisie.';
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
  // (9 et 14 chiffres) puis la clé de contrôle. Les espaces sont tolérés.
  const siren = texte(e.siren).replace(/\s/g, '');
  if (siren && !/^\d{9}$/.test(siren)) {
    erreurs.siren = 'Un SIREN comporte exactement 9 chiffres.';
  } else if (siren && !cleSirenValide(siren)) {
    erreurs.siren = 'Ce SIREN ne semble pas valide (clé de contrôle incorrecte) : vérifiez la saisie.';
  }
  const siret = texte(e.siret).replace(/\s/g, '');
  if (siret && !/^\d{14}$/.test(siret)) {
    erreurs.siret = 'Un SIRET comporte exactement 14 chiffres.';
  } else if (siret && !cleSirenValide(siret)) {
    erreurs.siret = 'Ce SIRET ne semble pas valide (clé de contrôle incorrecte) : vérifiez la saisie.';
  }

  const typeActivite = texte(e.typeActivite);
  if (!TYPES_ACTIVITE.some((t) => t.code === typeActivite)) {
    erreurs.typeActivite = 'Type d’activité inconnu.';
  }

  // Nature de la part « prestations », utile à la seule activité mixte. Un
  // champ vide reprend le cas courant plutôt que de refuser l'enregistrement :
  // les livres d'avant cette option ne portent pas encore ce réglage.
  const naturePrestations = texte(e.naturePrestations) || 'prestations';
  if (!NATURES_PRESTATIONS.some((n) => n.code === naturePrestations)) {
    erreurs.naturePrestations = 'Nature de prestations inconnue.';
  }

  const periodiciteUrssaf = texte(e.periodiciteUrssaf);
  if (!['', 'mois', 'trimestre'].includes(periodiciteUrssaf)) {
    erreurs.periodiciteUrssaf = 'Périodicité inconnue (mensuelle ou trimestrielle).';
  }
  // Identifiant de période posé par le bouton « C'est fait » du tableau de bord.
  const dernierePeriodeDeclaree = texte(e.dernierePeriodeDeclaree);
  if (dernierePeriodeDeclaree && !/^\d{4}-(0[1-9]|1[0-2]|T[1-4])$/.test(dernierePeriodeDeclaree)) {
    erreurs.dernierePeriodeDeclaree = 'Période déclarée invalide.';
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
      nomEntreprise, siren, siret, adresse, activite, typeActivite, naturePrestations,
      devise, formatDate, modesPersonnalises: modes.valeurs,
      periodiciteUrssaf, dernierePeriodeDeclaree,
      alertesNumerotation: booleen(e.alertesNumerotation, true),
      alerteRecetteSimilaire: booleen(e.alerteRecetteSimilaire, true),
      suiviSeuils: booleen(e.suiviSeuils, true),
      verifierMisesAJour: booleen(e.verifierMisesAJour, true),
      // Le formulaire ne renvoie pas ce drapeau : enregistrer ses paramètres
      // sort donc du mode démonstration.
      jeuDemo: booleen(e.jeuDemo, false)
    }
  };
}
