/**
 * API des paramètres de l'application (identité de l'entreprise, type
 * d'activité, devise, format de date, modes de règlement personnalisés).
 */

import express from 'express';
import { validerParametres } from '../validation.js';

export function routesParametres(stockage) {
  const routeur = express.Router();

  routeur.get('/', (req, res) => {
    res.json({ parametres: stockage.obtenirParametres() });
  });

  routeur.put('/', (req, res) => {
    const { erreurs, valeurs } = validerParametres(req.body);
    if (erreurs) return res.status(400).json({ erreurs });

    // Un mode personnalisé utilisé par des recettes ne peut pas être supprimé :
    // les recettes stockent son code, elles deviendraient illisibles.
    const conserves = new Set(valeurs.modesPersonnalises.map((m) => m.code));
    const supprimes = (stockage.obtenirParametres().modesPersonnalises ?? [])
      .filter((m) => !conserves.has(m.code));
    if (supprimes.length > 0) {
      const recettes = stockage.listerRecettes();
      for (const mode of supprimes) {
        const utilisations = recettes.filter((r) => r.modeReglement === mode.code).length;
        if (utilisations > 0) {
          return res.status(400).json({
            erreurs: {
              modesPersonnalises:
                `Le mode « ${mode.libelle} » est utilisé par ${utilisations} recette${utilisations > 1 ? 's' : ''} ` +
                'et ne peut pas être supprimé. Vous pouvez le renommer.'
            }
          });
        }
      }
    }

    res.json({ parametres: stockage.modifierParametres(valeurs) });
  });

  return routeur;
}
