/**
 * État global minimal du navigateur : paramètres de l'application et
 * informations système, chargés une fois au démarrage.
 */

import { api } from './api.js';

export const etat = {
  parametres: null,
  systeme: null
};

export async function chargerEtat() {
  const [parametres, systeme] = await Promise.all([api.obtenirParametres(), api.systeme()]);
  etat.parametres = parametres.parametres;
  etat.systeme = systeme;
}

/** À appeler après un enregistrement des paramètres. */
export function definirParametres(parametres) {
  etat.parametres = parametres;
}
