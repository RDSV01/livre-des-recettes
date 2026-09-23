/**
 * Routes des opérations groupées, communes aux deux registres :
 *
 *  - POST /lot/supprimer  `{ ids }`       supprime tout le lot en une écriture ;
 *  - POST /lot/restaurer  `{ lignes }`    remet des lignes supprimées, avec leur
 *                                         identifiant et leurs dates d'origine ;
 *  - PUT  /lot            `{ lignes }`    modifie plusieurs lignes (recettes :
 *                                         reclassement groupé).
 *
 * Chacune valide TOUT le lot avant d'écrire quoi que ce soit : une ligne
 * invalide fait refuser l'ensemble, le registre n'est jamais laissé à moitié
 * modifié.
 *
 * À installer AVANT les routes `/:id`, qui prendraient sinon « lot » pour un
 * identifiant.
 */

import { validerIdentite } from '../validation.js';

const LOT_MAX = 10_000;

/** Liste bornée tirée du corps, ou `null` si elle manque ou déborde. */
function liste(valeur) {
  return Array.isArray(valeur) && valeur.length > 0 && valeur.length <= LOT_MAX ? valeur : null;
}

/**
 * Valide chaque ligne d'un lot ; retourne `{ erreur }` au premier refus, en
 * disant laquelle (numérotée à partir de 1) et pourquoi.
 */
function validerLot(lignes, validerLigne) {
  const valides = [];
  for (const [i, ligne] of lignes.entries()) {
    const identite = validerIdentite(ligne);
    if (identite.erreur) return { erreur: `Ligne ${i + 1} : ${identite.erreur}` };
    const { erreurs, valeurs } = validerLigne(ligne);
    if (erreurs) return { erreur: `Ligne ${i + 1} : ${Object.values(erreurs)[0]}` };
    valides.push({ identite: identite.valeurs, valeurs });
  }
  return { valides };
}

/**
 * @param {import('express').Router} routeur
 * @param {object} options
 * @param {string} options.cle nom de la liste dans les réponses (`recettes`, `achats`).
 * @param {(ligne: object) => { erreurs, valeurs }} options.valider
 * @param {(ids: string[]) => object[]} options.supprimer
 * @param {(lignes: object[]) => object[]} options.restaurer
 * @param {(changements: object[]) => object[]|null} [options.modifier]
 */
export function installerRoutesLot(routeur, { cle, valider, supprimer, restaurer, modifier }) {
  routeur.post('/lot/supprimer', (req, res) => {
    const ids = liste(req.body?.ids);
    if (!ids || !ids.every((id) => typeof id === 'string')) {
      return res.status(400).json({ erreur: 'Liste d’identifiants manquante ou invalide.' });
    }
    res.json({ [cle]: supprimer(ids) });
  });

  routeur.post('/lot/restaurer', (req, res) => {
    const lignes = liste(req.body?.lignes);
    if (!lignes) return res.status(400).json({ erreur: 'Liste de lignes manquante ou invalide.' });
    const { erreur, valides } = validerLot(lignes, valider);
    if (erreur) return res.status(400).json({ erreur });
    try {
      const restaurees = restaurer(valides.map(({ identite, valeurs }) => ({
        id: identite.id, ...valeurs, creeLe: identite.creeLe, modifieLe: identite.modifieLe
      })));
      res.status(201).json({ [cle]: restaurees });
    } catch (e) {
      if (e.code === 'EXISTE') return res.status(409).json({ erreur: e.message });
      throw e;
    }
  });

  if (modifier) {
    routeur.put('/lot', (req, res) => {
      const lignes = liste(req.body?.lignes);
      if (!lignes) return res.status(400).json({ erreur: 'Liste de lignes manquante ou invalide.' });
      const { erreur, valides } = validerLot(lignes, valider);
      if (erreur) return res.status(400).json({ erreur });
      const modifiees = modifier(valides.map(({ identite, valeurs }) => ({ id: identite.id, champs: valeurs })));
      if (!modifiees) return res.status(404).json({ erreur: 'Une des lignes est introuvable : rien n’a été modifié.' });
      res.json({ [cle]: modifiees });
    });
  }
}
