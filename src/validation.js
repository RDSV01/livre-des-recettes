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
import { normaliserTexte, majusculeInitiale } from './partage/texte.js';

const LONGUEUR_MAX = 500;
/** Un prénom, même composé, tient dans quarante caractères. */
const PRENOM_MAX = 40;
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

// ---- Contrôles de champ communs --------------------------------------------------
//
// Chacun inscrit son message dans `erreurs` sous la clé du champ, et ne dit
// rien quand la valeur convient : les validateurs n'ont plus qu'à les enchaîner.

/** Résultat d'un validateur : les valeurs si rien n'a été refusé. */
function resultat(erreurs, valeurs) {
  return Object.keys(erreurs).length > 0
    ? { erreurs, valeurs: null }
    : { erreurs: null, valeurs };
}

/** Date obligatoire et réelle (`AAAA-MM-JJ`) ; `nom` la désigne (« d’encaissement »). */
function verifierDate(erreurs, cle, date, nom) {
  if (!date) erreurs[cle] = `La date ${nom} est obligatoire.`;
  else if (!estDateIso(date)) erreurs[cle] = 'Date invalide (format attendu : AAAA-MM-JJ).';
}

/** Nom obligatoire d'un tiers (« client », « fournisseur »), de longueur raisonnable. */
function verifierNom(erreurs, cle, nom, tiers) {
  if (!nom) erreurs[cle] = `Le nom du ${tiers} est obligatoire.`;
  else if (nom.length > LONGUEUR_MAX) erreurs[cle] = `Le nom du ${tiers} dépasse ${LONGUEUR_MAX} caractères.`;
}

/**
 * Montant obligatoire, strictement positif et vraisemblable, sous toutes ses
 * écritures (« 12,5 » vaut 12,50). Retourne le montant arrondi au centime.
 * `quoi` le désigne dans le message (« encaissé », « de l’achat »).
 */
function verifierMontant(erreurs, valeur, quoi) {
  const montant = analyserMontant(valeur);
  if (montant === null) {
    erreurs.montant = `Le montant ${quoi} est obligatoire et doit être un nombre.`;
  } else if (montant <= 0) {
    erreurs.montant = 'Le montant doit être strictement positif.';
  } else if (montant > MONTANT_MAX) {
    erreurs.montant = 'Le montant est invraisemblablement élevé.';
  }
  return montant === null ? null : Math.round(montant * 100) / 100;
}

/** Mode connu : un mode par défaut, ou un mode personnalisé de l'utilisateur. */
function verifierMode(erreurs, code, modesPersonnalises, nom) {
  if (!MODES_REGLEMENT.some((m) => m.code === code) && !modesPersonnalises.some((m) => m.code === code)) {
    erreurs.modeReglement = `Mode de ${nom} inconnu.`;
  }
}

/**
 * SIREN (9 chiffres) ou SIRET (14) facultatif : s'il est renseigné, le format
 * puis la clé de contrôle. Les espaces de présentation sont tolérés ; la
 * valeur nettoyée est retournée.
 */
function verifierIdentifiant(erreurs, cle, valeur, type) {
  const chiffres = texte(valeur).replace(/\s/g, '');
  const longueur = type === 'SIREN' ? 9 : 14;
  if (chiffres && !new RegExp(`^\\d{${longueur}}$`).test(chiffres)) {
    erreurs[cle] = `Un ${type} comporte exactement ${longueur} chiffres.`;
  } else if (chiffres && !cleSirenValide(chiffres)) {
    erreurs[cle] = `Ce ${type} ne semble pas valide (clé de contrôle incorrecte) : vérifiez la saisie.`;
  }
  return chiffres;
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
 * et la ventilation de leurs exports. Hors activité mixte, la route des
 * recettes la pose d'office selon le type d'activité.
 *
 * @param {Array<{code: string}>} [modesPersonnalises] modes ajoutés par
 *   l'utilisateur dans les paramètres, acceptés en plus des modes par défaut.
 */
export function validerRecette(entree, modesPersonnalises = []) {
  const e = entree ?? {};
  const erreurs = {};

  const dateEncaissement = texte(e.dateEncaissement);
  verifierDate(erreurs, 'dateEncaissement', dateEncaissement, 'd’encaissement');
  const client = texte(e.client);
  verifierNom(erreurs, 'client', client, 'client');
  const montant = verifierMontant(erreurs, e.montant, 'encaissé');
  const modeReglement = texte(e.modeReglement);
  verifierMode(erreurs, modeReglement, modesPersonnalises, 'règlement');

  const libelle = texte(e.libelle);
  const numeroFacture = texte(e.numeroFacture);
  if (libelle.length > LONGUEUR_MAX) erreurs.libelle = `Le libellé dépasse ${LONGUEUR_MAX} caractères.`;
  if (numeroFacture.length > 100) erreurs.numeroFacture = 'Le numéro de facture dépasse 100 caractères.';

  const categorie = texte(e.categorie);
  if (categorie && !CATEGORIES_RECETTE.some((c) => c.code === categorie)) {
    erreurs.categorie = 'Catégorie inconnue (vente ou prestation).';
  }

  return resultat(erreurs, {
    dateEncaissement, client, libelle, numeroFacture, montant, modeReglement, categorie
  });
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
  verifierDate(erreurs, 'dateReglement', dateReglement, 'du règlement');
  const fournisseur = texte(e.fournisseur);
  verifierNom(erreurs, 'fournisseur', fournisseur, 'fournisseur');
  const montant = verifierMontant(erreurs, e.montant, 'de l’achat');
  const modeReglement = texte(e.modeReglement);
  verifierMode(erreurs, modeReglement, modesPersonnalises, 'paiement');

  const referenceFacture = texte(e.referenceFacture);
  if (referenceFacture.length > 100) {
    erreurs.referenceFacture = 'La référence dépasse 100 caractères.';
  }

  return resultat(erreurs, { dateReglement, fournisseur, referenceFacture, montant, modeReglement });
}

/**
 * Valide l'identité technique d'une ligne rendue au registre par une
 * annulation : son identifiant et ses horodatages d'origine. Une ligne
 * supprimée par erreur revient ainsi telle qu'elle était, au lieu de renaître
 * sous un autre identifiant avec une date de création du jour.
 *
 * Un horodatage illisible est remplacé par `null` : le stockage y met alors
 * l'heure courante, plutôt que de refuser la restauration.
 */
export function validerIdentite(entree) {
  const id = texte(entree?.id);
  if (!/^[A-Za-z0-9-]{1,100}$/.test(id)) {
    return { erreur: 'Identifiant de ligne invalide.', valeurs: null };
  }
  const horodatage = (valeur) =>
    (typeof valeur === 'string' && !Number.isNaN(Date.parse(valeur)) ? valeur : null);
  return {
    erreur: null,
    valeurs: { id, creeLe: horodatage(entree.creeLe), modifieLe: horodatage(entree.modifieLe) }
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
  verifierNom(erreurs, 'nom', nom, 'client');
  // SIRET facultatif : il sert à la recherche automatique du nom.
  const siret = verifierIdentifiant(erreurs, 'siret', e.siret, 'SIRET');

  return resultat(erreurs, { nom, siret });
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

const NUMEROS_IGNORES_MAX = 500;

/**
 * Valide la liste des numéros de facture à ne plus signaler. Les doublons de
 * saisie (casse, accents) sont fusionnés : l'analyse de la numérotation les
 * compare de la même façon.
 */
function validerNumerosIgnores(entree) {
  if (!Array.isArray(entree)) {
    return { erreur: 'Liste de numéros ignorés invalide.', valeurs: null };
  }
  const vus = new Set();
  const valeurs = [];
  for (const brut of entree) {
    const numero = texte(brut);
    if (!numero) continue;
    if (numero.length > 100) {
      return { erreur: 'Un numéro ignoré dépasse 100 caractères.', valeurs: null };
    }
    const cle = normaliserTexte(numero);
    if (vus.has(cle)) continue;
    vus.add(cle);
    valeurs.push(numero);
  }
  if (valeurs.length > NUMEROS_IGNORES_MAX) {
    return { erreur: `Au plus ${NUMEROS_IGNORES_MAX} numéros ignorés.`, valeurs: null };
  }
  return { erreur: null, valeurs };
}

const RECURRENCES_ECARTEES_MAX = 500;

/**
 * Valide la liste des recettes récurrentes à ne plus proposer : des clés
 * « client|libellé|centimes » (voir `partage/recurrences.js`), sans doublon.
 */
function validerRecurrencesEcartees(entree) {
  if (!Array.isArray(entree) || entree.some((c) => typeof c !== 'string')) {
    return { erreur: 'Liste de recettes récurrentes écartées invalide.', valeurs: null };
  }
  const valeurs = [...new Set(entree.filter(Boolean))];
  if (valeurs.some((c) => c.length > 600)) {
    return { erreur: 'Une recette récurrente écartée est trop longue.', valeurs: null };
  }
  if (valeurs.length > RECURRENCES_ECARTEES_MAX) {
    return { erreur: `Au plus ${RECURRENCES_ECARTEES_MAX} recettes récurrentes écartées.`, valeurs: null };
  }
  return { erreur: null, valeurs };
}

/** Valide et normalise les paramètres de l'application. */
export function validerParametres(entree) {
  const e = entree ?? {};
  const erreurs = {};

  // « camille » s'enregistre « Camille » : il s'affiche ainsi partout.
  const prenom = majusculeInitiale(texte(e.prenom));
  if (prenom.length > PRENOM_MAX) erreurs.prenom = `Au plus ${PRENOM_MAX} caractères.`;
  const accueil = texte(e.accueil);
  if (!['', 'en-cours', 'termine'].includes(accueil)) erreurs.accueil = 'État de l’accueil inconnu.';

  const nomEntreprise = texte(e.nomEntreprise);
  const adresse = texte(e.adresse);
  const activite = texte(e.activite);
  if (nomEntreprise.length > LONGUEUR_MAX) erreurs.nomEntreprise = 'Nom trop long.';
  if (adresse.length > LONGUEUR_MAX) erreurs.adresse = 'Adresse trop longue.';
  if (activite.length > LONGUEUR_MAX) erreurs.activite = 'Activité trop longue.';

  const siren = verifierIdentifiant(erreurs, 'siren', e.siren, 'SIREN');
  const siret = verifierIdentifiant(erreurs, 'siret', e.siret, 'SIRET');

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

  // Début d'activité : facultatif, il ne sert qu'à borner la période d'ACRE.
  // L'option cochée sans date n'est pas une erreur : l'estimation attend
  // simplement la date pour réduire le taux.
  const debutActivite = texte(e.debutActivite);
  if (debutActivite && !estDateIso(debutActivite)) {
    erreurs.debutActivite = 'Date de début d’activité invalide.';
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

  // Liste absente de la requête : elle est conservée telle qu'enregistrée
  // (voir plus bas). Une requête qui oublierait ce champ ne doit pas effacer
  // en silence ce que l'utilisateur a choisi de ne plus voir.
  const ignores = e.numerosIgnores === undefined ? null : validerNumerosIgnores(e.numerosIgnores);
  if (ignores?.erreur) {
    erreurs.numerosIgnores = ignores.erreur;
  }
  // Même règle pour les recettes récurrentes que l'utilisateur ne veut plus voir proposées.
  const ecartees = e.recurrencesEcartees === undefined ? null : validerRecurrencesEcartees(e.recurrencesEcartees);
  if (ecartees?.erreur) {
    erreurs.recurrencesEcartees = ecartees.erreur;
  }

  return resultat(erreurs, {
    prenom, accueil,
    nomEntreprise, siren, siret, adresse, activite, typeActivite, naturePrestations,
    versementLiberatoire: booleen(e.versementLiberatoire, false),
    activiteArtisanale: booleen(e.activiteArtisanale, false),
    acre: booleen(e.acre, false), debutActivite,
    devise, formatDate, modesPersonnalises: modes.valeurs,
    periodiciteUrssaf, dernierePeriodeDeclaree,
    alertesNumerotation: booleen(e.alertesNumerotation, true),
    ...(ignores ? { numerosIgnores: ignores.valeurs } : {}),
    ...(ecartees ? { recurrencesEcartees: ecartees.valeurs } : {}),
    alerteRecetteSimilaire: booleen(e.alerteRecetteSimilaire, true),
    suiviSeuils: booleen(e.suiviSeuils, true),
    comparerAnneePrecedente: booleen(e.comparerAnneePrecedente, true),
    proposerRenouvellements: booleen(e.proposerRenouvellements, true),
    signalerAbsenceCopie: booleen(e.signalerAbsenceCopie, true),
    verifierMisesAJour: booleen(e.verifierMisesAJour, true),
    // Le formulaire des paramètres renvoie ce drapeau à faux : enregistrer
    // ses propres paramètres sort du mode démonstration.
    jeuDemo: booleen(e.jeuDemo, false)
  });
}
