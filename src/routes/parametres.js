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

    // Un mode personnalisé utilisé par une recette ou un achat ne peut pas être
    // supprimé : les lignes stockent son code, elles deviendraient illisibles.
    const conserves = new Set(valeurs.modesPersonnalises.map((m) => m.code));
    const supprimes = (stockage.obtenirParametres().modesPersonnalises ?? [])
      .filter((m) => !conserves.has(m.code));
    if (supprimes.length > 0) {
      const recettes = stockage.listerRecettes();
      const achats = stockage.listerAchats();
      const compter = (lignes, code) => lignes.filter((l) => l.modeReglement === code).length;
      for (const mode of supprimes) {
        const parRecettes = compter(recettes, mode.code);
        const parAchats = compter(achats, mode.code);
        if (parRecettes + parAchats > 0) {
          const usages = [
            parRecettes ? `${parRecettes} recette${parRecettes > 1 ? 's' : ''}` : '',
            parAchats ? `${parAchats} achat${parAchats > 1 ? 's' : ''}` : ''
          ].filter(Boolean).join(' et ');
          return res.status(400).json({
            erreurs: {
              modesPersonnalises:
                `Le mode « ${mode.libelle} » est utilisé par ${usages} ` +
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
