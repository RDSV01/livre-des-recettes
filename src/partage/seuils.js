/**
 * Seuils du régime micro-entrepreneur et de la franchise en base de TVA.
 *
 * TOUTES les valeurs vivent ici et nulle part ailleurs : quand les seuils
 * évoluent (loi de finances), il suffit de mettre à jour ce fichier.
 * Les montants sont en euros, pour la période indiquée par `ANNEE_SEUILS`.
 *
 * Le suivi est purement informatif : l'application ne gère ni TVA, ni
 * facturation, ni déclaration. En cas de doute sur sa situation, l'utilisateur
 * doit vérifier les valeurs en vigueur (economie.gouv.fr, URSSAF).
 *
 * Module partagé serveur / navigateur : aucune dépendance.
 */

import { enCentimes, enEuros } from './montants.js';

/** Période de validité des montants ci-dessous. */
export const ANNEE_SEUILS = '2026-2028';

/**
 * Ces seuils valent-ils pour cette année ? Le tableau de bord se consulte
 * année par année : mesurer un exercice passé avec les seuils d'aujourd'hui
 * donnerait un résultat faux, l'interface doit pouvoir le signaler.
 */
export function seuilsValentPour(annee) {
  const [debut, fin] = ANNEE_SEUILS.split('-').map(Number);
  return annee >= debut && annee <= fin;
}

/**
 * Seuils par type d'activité.
 *  - `plafondMicro` : chiffre d'affaires annuel maximal du régime micro ;
 *  - `franchiseTva` : seuil de la franchise en base de TVA ;
 *  - `franchiseTvaMajore` : seuil majoré (tolérance) de la franchise de TVA.
 *
 * Pour une activité mixte, les plafonds globaux sont ceux des ventes, et la
 * part « prestations de services » doit en plus rester sous les seuils des
 * prestations : ce suivi s'appuie sur la catégorie renseignée sur chaque
 * recette (voir `CATEGORIES_RECETTE` dans `constantes.js`).
 */
export const SEUILS = {
  ventes: {
    libelle: 'Achat / vente de marchandises',
    plafondMicro: 203_100,
    franchiseTva: 85_000,
    franchiseTvaMajore: 93_500
  },
  prestations: {
    libelle: 'Prestations de services',
    plafondMicro: 83_600,
    franchiseTva: 37_500,
    franchiseTvaMajore: 41_250
  },
  mixte: {
    libelle: 'Activité mixte (ventes + prestations)',
    plafondMicro: 203_100,
    franchiseTva: 85_000,
    franchiseTvaMajore: 93_500
  }
};

/** Types d'activité proposés dans les paramètres. */
export const TYPES_ACTIVITE = [
  { code: '', libelle: 'Non renseigné' },
  { code: 'ventes', libelle: SEUILS.ventes.libelle },
  { code: 'prestations', libelle: SEUILS.prestations.libelle },
  { code: 'mixte', libelle: SEUILS.mixte.libelle }
];

/** Progression d'un chiffre d'affaires vers un seuil (calcul en centimes). */
function progression(chiffreAffaires, seuil) {
  const ca = enCentimes(chiffreAffaires);
  const plafond = enCentimes(seuil);
  return {
    seuil,
    restant: enEuros(Math.max(0, plafond - ca)),
    pourcentage: Math.round((ca / plafond) * 100)
  };
}

/**
 * Bilan des seuils pour un chiffre d'affaires annuel et un type d'activité.
 * Retourne `null` si le type d'activité n'est pas renseigné.
 *
 * Pour une activité mixte, si le chiffre d'affaires de la part « prestations »
 * est fourni (recettes catégorisées), le bilan contient aussi la progression
 * de cette part vers ses propres seuils.
 */
export function bilanSeuils(chiffreAffaires, typeActivite, caPrestations = null) {
  const seuils = SEUILS[typeActivite];
  if (!seuils) return null;

  const bilan = {
    typeActivite,
    plafondMicro: progression(chiffreAffaires, seuils.plafondMicro),
    franchiseTva: {
      ...progression(chiffreAffaires, seuils.franchiseTva),
      seuilMajore: seuils.franchiseTvaMajore
    },
    prestations: null
  };

  if (typeActivite === 'mixte' && caPrestations !== null) {
    bilan.prestations = {
      chiffreAffaires: caPrestations,
      plafondMicro: progression(caPrestations, SEUILS.prestations.plafondMicro),
      franchiseTva: {
        ...progression(caPrestations, SEUILS.prestations.franchiseTva),
        seuilMajore: SEUILS.prestations.franchiseTvaMajore
      }
    };
  }
  return bilan;
}
