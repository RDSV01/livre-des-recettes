/**
 * Lecture des paramètres de période communs à plusieurs routes (exports,
 * bilan URSSAF). Une valeur invalide est refusée d'un 400 au message clair,
 * et la fonction retourne alors `null` : la route n'a plus qu'à s'arrêter.
 */

/** Années plausibles pour un livre des recettes. */
const ANNEE_MIN = 2000;
const ANNEE_MAX = 2100;

/** Année demandée (`?annee=`), ou `null` après avoir répondu 400. */
export function lireAnnee(req, res) {
  const annee = Number.parseInt(req.query.annee, 10);
  if (!Number.isInteger(annee) || annee < ANNEE_MIN || annee > ANNEE_MAX) {
    res.status(400).json({ erreur: 'Paramètre « annee » manquant ou invalide.' });
    return null;
  }
  return annee;
}

/**
 * Période d'export : `annee` obligatoire, `mois` facultatif (1 à 12).
 * Retourne `{ annee, mois }`, ou `null` après avoir répondu 400.
 */
export function lirePeriode(req, res) {
  const annee = lireAnnee(req, res);
  if (annee === null) return null;
  let mois;
  if (req.query.mois !== undefined && req.query.mois !== '') {
    mois = Number.parseInt(req.query.mois, 10);
    if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
      res.status(400).json({ erreur: 'Paramètre « mois » invalide (1 à 12).' });
      return null;
    }
  }
  return { annee, mois };
}
