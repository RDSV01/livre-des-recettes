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

/**
 * À appeler après un enregistrement des paramètres. L'événement permet aux
 * parties communes de l'interface (la navigation) de se remettre à jour.
 */
export function definirParametres(parametres) {
  etat.parametres = parametres;
  window.dispatchEvent(new Event('parametres-modifies'));
}

/**
 * Le registre des achats n'est obligatoire que pour les activités qui
 * vendent des marchandises : il est masqué pour une activité de pure
 * prestation, sauf s'il contient déjà des achats (rien ne disparaît).
 */
export function registreAchatsUtile() {
  return etat.parametres?.typeActivite !== 'prestations' || Boolean(etat.systeme?.aDesAchats);
}
