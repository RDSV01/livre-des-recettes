/**
 * Recherche du nom d'une entreprise à partir de son SIRET, via l'API publique
 * et gratuite « Recherche d'entreprises » de l'annuaire des entreprises
 * (data.gouv.fr) : https://recherche-entreprises.api.gouv.fr
 *
 * C'est le SEUL point du logiciel qui contacte l'extérieur, et uniquement
 * lorsque l'utilisateur lance explicitement une recherche par SIRET. Aucune
 * clé d'API n'est requise. Tout le reste de l'application reste 100 % local.
 */

const URL_API = 'https://recherche-entreprises.api.gouv.fr/search';
const DELAI_MAX_MS = 8000;

/**
 * Extrait le nom et le SIRET d'une réponse de l'API.
 * Fonction pure (sans réseau) pour être testable simplement.
 *
 * @param {object} donnees corps JSON renvoyé par l'API
 * @param {string} siretDemande SIRET (14 chiffres) recherché, s'il est complet
 * @returns {{ nom: string, siret: string }|null}
 */
export function extraireEntreprise(donnees, siretDemande = '') {
  const resultats = Array.isArray(donnees?.results) ? donnees.results : [];
  if (resultats.length === 0) return null;

  const premier = resultats[0];
  const nom = premier.nom_complet || premier.nom_raison_sociale || premier.nom || '';
  if (!nom) return null;

  const siret = /^\d{14}$/.test(siretDemande)
    ? siretDemande
    : (premier.siege?.siret || premier.matching_etablissements?.[0]?.siret || '');

  return { nom: nom.trim(), siret };
}

/**
 * Recherche une entreprise par SIRET (14 chiffres) ou SIREN (9 chiffres).
 * @param {string} identifiant chiffres du SIRET / SIREN
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] permet d'injecter un `fetch` (tests)
 * @returns {Promise<{ nom: string, siret: string }|null>}
 * @throws {Error} en cas d'indisponibilité du service (réseau, délai, statut)
 */
export async function rechercherEntreprise(identifiant, { fetch = globalThis.fetch } = {}) {
  const chiffres = String(identifiant ?? '').replace(/\s/g, '');
  if (!/^\d{9}$|^\d{14}$/.test(chiffres)) {
    throw Object.assign(new Error('SIRET (14 chiffres) ou SIREN (9 chiffres) attendu.'), { code: 'FORMAT' });
  }

  const url = `${URL_API}?q=${encodeURIComponent(chiffres)}&page=1&per_page=1`;
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MAX_MS);
  let reponse;
  try {
    reponse = await fetch(url, {
      signal: controleur.signal,
      headers: { Accept: 'application/json' }
    });
  } catch (erreur) {
    throw Object.assign(
      new Error('Service de recherche indisponible (vérifiez votre connexion Internet).'),
      { code: 'RESEAU', cause: erreur }
    );
  } finally {
    clearTimeout(minuteur);
  }

  if (!reponse.ok) {
    throw Object.assign(
      new Error(`Le service de recherche a répondu par une erreur (${reponse.status}).`),
      { code: 'STATUT' }
    );
  }

  const donnees = await reponse.json();
  return extraireEntreprise(donnees, chiffres.length === 14 ? chiffres : '');
}
