/**
 * Client HTTP minimal vers l'API locale.
 *
 * Toute erreur HTTP est transformée en exception portant `statut` et,
 * pour les erreurs de validation, `erreurs` ({ champ: message }).
 */

/**
 * @param {string} chemin
 * @param {object} [options]
 * @param {string} [options.methode]
 * @param {object} [options.corps] envoyé en JSON.
 * @param {Blob} [options.brut] envoyé tel quel (un fichier), avec `entetes`.
 * @param {object} [options.entetes]
 */
async function requete(chemin, options = {}) {
  const reponse = await fetch(chemin, {
    headers: options.brut ? options.entetes : options.corps ? { 'Content-Type': 'application/json' } : undefined,
    method: options.methode ?? 'GET',
    body: options.brut ?? (options.corps ? JSON.stringify(options.corps) : undefined)
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
  listerRecettes: () => requete('/api/recettes'),
  listerAnnees: () => requete('/api/recettes/annees'),
  creerRecette: (recette) => requete('/api/recettes', { methode: 'POST', corps: recette }),
  modifierRecette: (id, recette) => requete(`/api/recettes/${id}`, { methode: 'PUT', corps: recette }),
  importerRecettes: (demande) => requete('/api/recettes/import', { methode: 'POST', corps: demande }),
  // Opérations groupées, en une seule écriture (voir `src/routes/lots.js`).
  supprimerRecettes: (ids) => requete('/api/recettes/lot/supprimer', { methode: 'POST', corps: { ids } }),
  restaurerRecettes: (lignes) => requete('/api/recettes/lot/restaurer', { methode: 'POST', corps: { lignes } }),
  modifierRecettes: (lignes) => requete('/api/recettes/lot', { methode: 'PUT', corps: { lignes } }),

  // Achats
  listerAchats: () => requete('/api/achats'),
  listerAnneesAchats: () => requete('/api/achats/annees'),
  creerAchat: (achat) => requete('/api/achats', { methode: 'POST', corps: achat }),
  modifierAchat: (id, achat) => requete(`/api/achats/${id}`, { methode: 'PUT', corps: achat }),
  importerAchats: (demande) => requete('/api/achats/import', { methode: 'POST', corps: demande }),
  supprimerAchats: (ids) => requete('/api/achats/lot/supprimer', { methode: 'POST', corps: { ids } }),
  restaurerAchats: (lignes) => requete('/api/achats/lot/restaurer', { methode: 'POST', corps: { lignes } }),

  // Sauvegardes
  listerSauvegardes: () => requete('/api/sauvegardes'),
  restaurerSauvegarde: (fichier) => requete('/api/sauvegardes/restaurer', { methode: 'POST', corps: { fichier } }),
  repartirDeZero: () => requete('/api/sauvegardes/repartir-de-zero', { methode: 'POST', corps: {} }),

  // Jeu de démonstration
  chargerDemo: () => requete('/api/demo', { methode: 'POST', corps: {} }),

  // Clients
  listerClients: () => requete('/api/clients'),
  rechercherSiret: (siret) => requete(`/api/clients/recherche-siret${chaineRequete({ siret })}`),
  creerClient: (client) => requete('/api/clients', { methode: 'POST', corps: client }),
  modifierClient: (id, client) => requete(`/api/clients/${id}`, { methode: 'PUT', corps: client }),
  supprimerClient: (id) => requete(`/api/clients/${id}`, { methode: 'DELETE' }),

  // Pièces jointes (`registre` : 'recettes' ou 'achats'). Le PDF part tel
  // quel, son nom d'origine dans un en-tête (encodé : accents compris).
  joindrePiece: (registre, id, fichier) => requete(`/api/${registre}/${id}/piece`, {
    methode: 'POST',
    brut: fichier,
    entetes: { 'Content-Type': 'application/pdf', 'X-Nom-Fichier': encodeURIComponent(fichier.name) }
  }),
  retirerPiece: (registre, id) => requete(`/api/${registre}/${id}/piece`, { methode: 'DELETE' }),
  rattacherPiece: (registre, id, piece) =>
    requete(`/api/${registre}/${id}/piece/rattacher`, { methode: 'POST', corps: { piece } }),

  // Tableau de bord et bilan URSSAF
  tableauDeBord: (params) => requete(`/api/tableau-de-bord${chaineRequete(params)}`),
  bilanUrssaf: (params) => requete(`/api/urssaf${chaineRequete(params)}`),
  periodesUrssaf: (params) => requete(`/api/urssaf/periodes${chaineRequete(params)}`),

  // Contrôle d'un registre avant export (`registre` : '' ou '/achats')
  controlerExport: (periode, registre = '') =>
    requete(`/api/exports${registre}/controle${chaineRequete(periode)}`),

  // Paramètres et système
  obtenirParametres: () => requete('/api/parametres'),
  enregistrerParametres: (parametres) => requete('/api/parametres', { methode: 'PUT', corps: parametres }),
  systeme: () => requete('/api/systeme'),

  // Mise à jour de l'application
  miseAJour: () => requete('/api/maj'),
  appliquerMiseAJour: () => requete('/api/maj/appliquer', { methode: 'POST', corps: {} })
};

/**
 * URL de téléchargement d'un export (`format` : pdf, xlsx, csv).
 * `registre` vaut `''` pour le livre des recettes, `/achats` pour les achats.
 * `avecPieces` demande une archive ZIP : le registre et ses PDF joints.
 */
export function urlExport(format, periode, registre = '', { avecPieces = false } = {}) {
  return avecPieces
    ? `/api/exports${registre}/zip${chaineRequete({ ...periode, format })}`
    : `/api/exports${registre}/${format}${chaineRequete(periode)}`;
}

/**
 * Télécharge un fichier produit par le serveur (export, copie des données).
 *
 * Passer par `fetch` plutôt que par un simple lien : une erreur du serveur
 * (période invalide, disque illisible) remonte ici comme une exception,
 * au lieu d'ouvrir une page d'erreur à la place de l'application.
 */
export async function telechargerFichier(url) {
  const reponse = await fetch(url);
  if (!reponse.ok) {
    const corps = await reponse.json().catch(() => null);
    throw new Error(corps?.erreur ?? `Erreur ${reponse.status}`);
  }
  const disposition = reponse.headers.get('Content-Disposition') ?? '';
  const nom = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const nomAscii = /filename="([^"]+)"/i.exec(disposition)?.[1];
  const fichier = await reponse.blob();
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(fichier);
  lien.download = nom ? decodeURIComponent(nom) : nomAscii ?? 'export';
  document.body.append(lien);
  lien.click();
  lien.remove();
  // Libérée un peu plus tard : le navigateur doit d'abord avoir lu le fichier.
  setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
  return lien.download;
}

/** URL du PDF joint à une ligne (`registre` : 'recettes' ou 'achats'). */
export function urlPiece(registre, id) {
  return `/api/${registre}/${id}/piece`;
}

/** URL de téléchargement du rapport annuel de gestion (PDF uniquement). */
export function urlRapportAnnuel(annee) {
  return `/api/exports/rapport-annuel${chaineRequete({ annee })}`;
}
