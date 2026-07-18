/**
 * Constantes métier partagées entre le serveur et le navigateur.
 *
 * Ce module ne doit dépendre d'aucune API Node ni d'aucune API navigateur :
 * il est importé par le serveur (`import ... from './partage/constantes.js'`)
 * et servi tel quel au navigateur sous `/partage/constantes.js`.
 */

/** Modes de règlement acceptés dans le livre des recettes. */
export const MODES_REGLEMENT = [
  { code: 'carte', libelle: 'Carte bancaire' },
  { code: 'virement', libelle: 'Virement' },
  { code: 'especes', libelle: 'Espèces' },
  { code: 'cheque', libelle: 'Chèque' },
  { code: 'paypal', libelle: 'PayPal' },
  { code: 'stripe', libelle: 'Stripe' },
  { code: 'autre', libelle: 'Autre' }
];

/** Devises proposées dans les paramètres. */
export const DEVISES = [
  { code: 'EUR', libelle: 'Euro (€)' },
  { code: 'CHF', libelle: 'Franc suisse (CHF)' },
  { code: 'USD', libelle: 'Dollar américain ($)' },
  { code: 'GBP', libelle: 'Livre sterling (£)' },
  { code: 'CAD', libelle: 'Dollar canadien ($ CA)' }
];

/** Formats d'affichage des dates proposés dans les paramètres. */
export const FORMATS_DATE = [
  { code: 'JJ/MM/AAAA', libelle: '31/12/2026' },
  { code: 'JJ-MM-AAAA', libelle: '31-12-2026' },
  { code: 'AAAA-MM-JJ', libelle: '2026-12-31' }
];

/**
 * Catégories d'une recette, pour les activités mixtes : la part « prestations »
 * a ses propres plafonds (micro et TVA) et la déclaration URSSAF distingue les
 * deux. La catégorie ne figure jamais dans les exports du registre légal.
 */
export const CATEGORIES_RECETTE = [
  { code: 'ventes', libelle: 'Vente de marchandises' },
  { code: 'prestations', libelle: 'Prestation de services' }
];

/**
 * Libellé court d'une catégorie (« Vente », « Prestation »), pour les
 * tableaux et les colonnes d'export, où le libellé complet serait trop long.
 * Retourne une chaîne vide pour une recette non catégorisée.
 */
export function libelleCategorieCourt(code) {
  return code === 'ventes' ? 'Vente' : code === 'prestations' ? 'Prestation' : '';
}

/** Paramètres appliqués tant que l'utilisateur n'a rien configuré. */
export const PARAMETRES_DEFAUT = {
  nomEntreprise: '',
  siren: '',
  siret: '',
  adresse: '',
  activite: '',
  typeActivite: '',
  devise: 'EUR',
  formatDate: 'JJ/MM/AAAA',
  modesPersonnalises: [],
  // Rappel de déclaration URSSAF : périodicité choisie et dernière période
  // marquée « déclarée » depuis le tableau de bord (« 2026-06 », « 2026-T2 »).
  periodiciteUrssaf: '',
  dernierePeriodeDeclaree: '',
  // Options d'interface, désactivables dans les paramètres.
  alertesNumerotation: true,
  alerteRecetteSimilaire: true,
  suiviSeuils: true,
  // Seul réglage qui autorise l'application à contacter Internet d'elle-même
  // (voir `src/maj.js`) : elle demande à GitHub s'il existe une version plus
  // récente, et rien d'autre.
  verifierMisesAJour: true
};

/**
 * Libellé lisible d'un code de mode de règlement (« virement » donne
 * « Virement »). Cherche d'abord dans les modes par défaut, puis dans les
 * modes personnalisés de l'utilisateur.
 */
export function libelleMode(code, modesPersonnalises = []) {
  const mode = MODES_REGLEMENT.find((m) => m.code === code) ??
    modesPersonnalises.find((m) => m.code === code);
  return mode ? mode.libelle : code;
}
