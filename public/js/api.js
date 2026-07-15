/**
 * Client HTTP minimal vers l'API locale.
 *
 * Toute erreur HTTP est transformée en exception portant `statut` et,
 * pour les erreurs de validation, `erreurs` ({ champ: message }).
 */

async function requete(chemin, options = {}) {
  const reponse = await fetch(chemin, {
    headers: options.corps ? { 'Content-Type': 'application/json' } : undefined,
    method: options.methode ?? 'GET',
    body: options.corps ? JSON.stringify(options.corps) : undefined
  });

  if (!reponse.ok) {
    const corps = await reponse.json().catch(() => null);
    const erreur = new Error(corps?.erreur ?? `Erreur ${reponse.status}`);
    erreur.statut = reponse.status;
    erreur.erreurs = corps?.erreurs ?? null;
    throw erreur;
  }
  return reponse.status === 204 ? null : reponse.json();
}

/** Construit une chaîne de requête en ignorant les valeurs vides. */
function chaineRequete(params) {
  const remplis = Object.entries(params ?? {}).filter(([, v]) => v !== '' && v != null);
  if (remplis.length === 0) return '';
  return '?' + new URLSearchParams(remplis).toString();
}

export const api = {
  // Recettes
  listerRecettes: (filtres) => requete(`/api/recettes${chaineRequete(filtres)}`),
  listerAnnees: () => requete('/api/recettes/annees'),
  creerRecette: (recette) => requete('/api/recettes', { methode: 'POST', corps: recette }),
  modifierRecette: (id, recette) => requete(`/api/recettes/${id}`, { methode: 'PUT', corps: recette }),
  supprimerRecette: (id) => requete(`/api/recettes/${id}`, { methode: 'DELETE' }),
  importerRecettes: (demande) => requete('/api/recettes/import', { methode: 'POST', corps: demande }),

  // Clients
  listerClients: () => requete('/api/clients'),
  rechercherSiret: (siret) => requete(`/api/clients/recherche-siret${chaineRequete({ siret })}`),
  creerClient: (client) => requete('/api/clients', { methode: 'POST', corps: client }),
  modifierClient: (id, client) => requete(`/api/clients/${id}`, { methode: 'PUT', corps: client }),
  supprimerClient: (id) => requete(`/api/clients/${id}`, { methode: 'DELETE' }),

  // Tableau de bord et bilan URSSAF
  tableauDeBord: () => requete('/api/tableau-de-bord'),
  bilanUrssaf: (params) => requete(`/api/urssaf${chaineRequete(params)}`),

  // Paramètres et système
  obtenirParametres: () => requete('/api/parametres'),
  enregistrerParametres: (parametres) => requete('/api/parametres', { methode: 'PUT', corps: parametres }),
  systeme: () => requete('/api/systeme')
};

/** URL de téléchargement d'un export du registre (`format` : pdf, xlsx, csv). */
export function urlExport(format, periode) {
  return `/api/exports/${format}${chaineRequete(periode)}`;
}
