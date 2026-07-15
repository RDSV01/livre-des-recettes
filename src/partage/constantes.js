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

/** Paramètres appliqués tant que l'utilisateur n'a rien configuré. */
export const PARAMETRES_DEFAUT = {
  nomEntreprise: '',
  siren: '',
  siret: '',
  adresse: '',
  activite: '',
  devise: 'EUR',
  formatDate: 'JJ/MM/AAAA'
};

/** Libellé lisible d'un code de mode de règlement (« virement » donne « Virement »). */
export function libelleMode(code) {
  const mode = MODES_REGLEMENT.find((m) => m.code === code);
  return mode ? mode.libelle : code;
}
