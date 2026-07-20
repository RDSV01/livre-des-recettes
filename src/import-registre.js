/**
 * Import en lot, commun aux deux registres (recettes et achats).
 *
 * La mécanique est identique : valider chaque ligne, écarter les doublons (au
 * sein du fichier comme vis-à-vis de l'existant), simuler pour un rapport que
 * l'utilisateur relit, puis n'écrire qu'après une sauvegarde. Seuls le
 * validateur, la détection de doublon, l'accès à la liste et le résumé d'une
 * ligne changent d'un registre à l'autre : ils sont fournis par la route.
 */

/** Un import massif reste borné : au-delà, mieux vaut découper le fichier. */
export const IMPORT_MAX_LIGNES = 10_000;

/**
 * @param {object} stockage
 * @param {object} corps `{ lignes, importerDoublons, simulation }` reçu de la requête.
 * @param {object} config
 * @param {(entree: object) => { erreurs, valeurs }} config.valider validation d'une ligne.
 * @param {(valeurs: object, existantes: object[]) => boolean} config.estDoublon détection de doublon.
 * @param {() => object[]} config.lister lignes déjà enregistrées.
 * @param {(lot: object[]) => void} config.ajouterLot écriture du lot validé.
 * @param {(valeurs: object) => { date, tiers, montant }} config.resume aperçu d'une ligne en doublon.
 * @returns {{ erreur: string } | { rapport: object }}
 */
export function traiterImport(stockage, corps, config) {
  const { lignes, importerDoublons = false, simulation = false } = corps ?? {};
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return { erreur: 'Aucune ligne à importer.' };
  }
  if (lignes.length > IMPORT_MAX_LIGNES) {
    return { erreur: `Import limité à ${IMPORT_MAX_LIGNES} lignes à la fois.` };
  }

  const existantes = config.lister();
  const valides = [];
  const doublons = [];
  const erreurs = [];

  lignes.forEach((entree, index) => {
    const resultat = config.valider(entree);
    if (resultat.erreurs) {
      erreurs.push({ ligne: index + 1, erreurs: resultat.erreurs });
      return;
    }
    // Un doublon peut se cacher parmi l'existant, mais aussi plus haut dans le
    // fichier lui-même : les deux sont comparés.
    const dejaVues = valides.concat(doublons.map((d) => d.valeurs));
    if (config.estDoublon(resultat.valeurs, existantes) || config.estDoublon(resultat.valeurs, dejaVues)) {
      doublons.push({ ligne: index + 1, valeurs: resultat.valeurs });
      return;
    }
    valides.push(resultat.valeurs);
  });

  const aImporter = importerDoublons
    ? valides.concat(doublons.map((d) => d.valeurs))
    : valides;
  let sauvegarde = null;
  if (!simulation && aImporter.length > 0) {
    sauvegarde = stockage.creerSauvegarde('avant-import');
    config.ajouterLot(aImporter);
  }

  return {
    rapport: {
      simulation,
      total: lignes.length,
      valides: valides.length,
      importables: aImporter.length,
      importees: simulation ? 0 : aImporter.length,
      sauvegarde,
      doublons: doublons.map(({ ligne, valeurs }) => ({ ligne, ...config.resume(valeurs) })),
      erreurs
    }
  };
}
