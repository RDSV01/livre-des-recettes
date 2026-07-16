/**
 * API des sauvegardes : liste des copies disponibles et restauration.
 *
 * Les sauvegardes sont créées automatiquement (quotidiennes, avant chaque
 * import, avant chaque restauration) ; cette API permet de les consulter
 * depuis les paramètres et d'en restaurer une en cas de problème.
 */

import express from 'express';

export function routesSauvegardes(stockage) {
  const routeur = express.Router();

  routeur.get('/', (req, res) => {
    res.json({ sauvegardes: stockage.listerSauvegardes() });
  });

  // POST /api/sauvegardes/restaurer { fichier: "livre-des-recettes-....json" }
  routeur.post('/restaurer', (req, res) => {
    const fichier = String(req.body?.fichier ?? '');
    try {
      const resume = stockage.restaurerSauvegarde(fichier);
      res.json({ restauree: fichier, ...resume });
    } catch (erreur) {
      res.status(400).json({ erreur: erreur.message });
    }
  });

  return routeur;
}
