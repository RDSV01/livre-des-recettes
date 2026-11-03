/**
 * Recherche d'une entreprise par son nom, son SIREN ou son SIRET, via l'API
 * publique et gratuite « Recherche d'entreprises » de l'annuaire des
 * entreprises (data.gouv.fr) : https://recherche-entreprises.api.gouv.fr
 *
 * C'est le SEUL point du logiciel qui contacte l'extérieur pour des données,
 * et uniquement lorsque l'utilisateur lance lui-même une recherche : seul ce
 * qu'il cherche (le nom ou le numéro) est envoyé. Aucune clé d'API n'est
 * requise. Tout le reste de l'application reste 100 % local.
 */

const URL_API = 'https://recherche-entreprises.api.gouv.fr/search';
const DELAI_MAX_MS = 8000;
/** Résultats rendus pour une recherche par nom : de quoi reconnaître la bonne, sans noyer. */
const NOMBRE_PAR_NOM = 5;

/** Un SIREN (9 chiffres) ou un SIRET (14 chiffres), espaces retirés. */
export const estIdentifiant = (texte) => /^\d{9}$|^\d{14}$/.test(String(texte ?? '').replace(/\s/g, ''));

/**
 * La fiche d'une entreprise telle que l'application la montre : de quoi
 * vérifier que c'est la bonne avant de la choisir. L'établissement retenu est
 * celui du SIRET demandé, sinon le siège. Un entrepreneur peut avoir demandé
 * que son adresse ne soit pas diffusée : elle est alors absente.
 *
 * @param {object} resultat une entrée de `results` de l'API
 * @param {string} [siretDemande] SIRET (14 chiffres) recherché, s'il est complet
 * @returns {{ nom: string, siren: string, siret: string, adresse: string, active: boolean, creation: string }|null}
 */
export function ficheEntreprise(resultat, siretDemande = '') {
  const nom = (resultat?.nom_complet || resultat?.nom_raison_sociale || resultat?.nom || '').trim();
  if (!nom) return null;
  const etablissement = (siretDemande && resultat.matching_etablissements?.find((e) => e.siret === siretDemande))
    || resultat.siege || resultat.matching_etablissements?.[0] || {};
  const adresse = String(etablissement.adresse ?? '').trim();
  const etat = etablissement.etat_administratif ?? resultat.etat_administratif;
  return {
    nom,
    siren: resultat.siren ?? '',
    siret: siretDemande || etablissement.siret || '',
    adresse: /NON-DIFFUSIBLE|^\[/i.test(adresse) ? '' : adresse,
    active: etat !== 'F',
    creation: resultat.date_creation ?? etablissement.date_creation ?? ''
  };
}

/**
 * Les fiches d'une réponse de l'API. Fonction pure (sans réseau), testable.
 * @param {object} donnees corps JSON renvoyé par l'API
 * @param {string} [siretDemande]
 */
export function extraireEntreprises(donnees, siretDemande = '') {
  const resultats = Array.isArray(donnees?.results) ? donnees.results : [];
  return resultats.map((r) => ficheEntreprise(r, siretDemande)).filter(Boolean);
}

/**
 * La première fiche d'une réponse de l'API (recherche par numéro).
 * @returns {ReturnType<typeof ficheEntreprise>}
 */
export function extraireEntreprise(donnees, siretDemande = '') {
  return extraireEntreprises(donnees, siretDemande)[0] ?? null;
}

/** Interroge l'API ; une indisponibilité devient une erreur lisible. */
async function interroger(texte, parPage, fetch) {
  const url = `${URL_API}?q=${encodeURIComponent(texte)}&page=1&per_page=${parPage}`;
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MAX_MS);
  let reponse;
  try {
    reponse = await fetch(url, { signal: controleur.signal, headers: { Accept: 'application/json' } });
  } catch (erreur) {
    throw Object.assign(
      new Error('Service de recherche indisponible (vérifiez votre connexion Internet).'),
      { code: 'RESEAU', cause: erreur }
    );
  } finally {
    clearTimeout(minuteur);
  }
  if (!reponse.ok) {
    throw Object.assign(new Error('L’annuaire des entreprises ne répond pas pour l’instant : réessayez un peu plus tard.'), { code: 'STATUT', statut: reponse.status });
  }
  return reponse.json();
}

/**
 * Recherche une entreprise par SIRET (14 chiffres) ou SIREN (9 chiffres).
 * @param {string} identifiant chiffres du SIRET / SIREN
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] permet d'injecter un `fetch` (tests)
 * @returns {Promise<ReturnType<typeof ficheEntreprise>>}
 * @throws {Error} en cas d'indisponibilité du service (réseau, délai, statut)
 */
export async function rechercherEntreprise(identifiant, { fetch = globalThis.fetch } = {}) {
  const chiffres = String(identifiant ?? '').replace(/\s/g, '');
  if (!estIdentifiant(chiffres)) {
    throw Object.assign(new Error('SIRET (14 chiffres) ou SIREN (9 chiffres) attendu.'), { code: 'FORMAT' });
  }
  return extraireEntreprise(await interroger(chiffres, 1, fetch), chiffres.length === 14 ? chiffres : '');
}

/**
 * Recherche par nom (ou par numéro) : les entreprises qui correspondent, les
 * plus pertinentes d'abord, et combien il y en a en tout.
 * @param {string} texte nom, SIREN ou SIRET
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @returns {Promise<{ entreprises: ReturnType<typeof ficheEntreprise>[], total: number }>}
 */
export async function rechercherEntreprises(texte, { fetch = globalThis.fetch } = {}) {
  const saisie = String(texte ?? '').trim();
  if (estIdentifiant(saisie)) {
    const entreprise = await rechercherEntreprise(saisie, { fetch });
    return { entreprises: entreprise ? [entreprise] : [], total: entreprise ? 1 : 0 };
  }
  if (saisie.length < 3) {
    throw Object.assign(new Error('Tapez au moins 3 lettres du nom, ou un SIREN ou un SIRET.'), { code: 'FORMAT' });
  }
  const donnees = await interroger(saisie, NOMBRE_PAR_NOM, fetch);
  const entreprises = extraireEntreprises(donnees);
  return { entreprises, total: Math.max(Number(donnees?.total_results) || 0, entreprises.length) };
}
