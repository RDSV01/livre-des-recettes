/**
 * API des paramètres de l'application (identité de l'entreprise, devise,
 * format de date).
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
    res.json({ parametres: stockage.modifierParametres(valeurs) });
  });

  return routeur;
}
