/**
 * Filtres et tri des registres, conservés le temps de la session.
 *
 * En mémoire uniquement : rien n'est écrit dans le navigateur (ni cookie, ni
 * localStorage), conformément à la promesse « 100 % local ». Revenir sur un
 * registre retrouve donc ses filtres ; recharger la page (F5) les réinitialise.
 *
 * Chaque vue reçoit une référence stable qu'elle mute directement : c'est cette
 * référence partagée qui fait persister l'état d'une visite à l'autre.
 */
const etats = {
  recettes: {
    filtres: { q: '', annee: '', mois: '', mode: '', categorie: '' },
    tri: { colonne: 'date', sens: 'desc' }
  },
  achats: {
    filtres: { q: '', annee: '', mois: '', mode: '' },
    tri: { colonne: 'date', sens: 'desc' }
  }
};

/** État conservé (filtres + tri) d'un registre (« recettes » ou « achats »). */
export function etatFiltres(registre) {
  return etats[registre];
}
