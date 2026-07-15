/**
 * API du bilan URSSAF : chiffre d'affaires encaissé et nombre d'encaissements
 * sur une période (mois, trimestre ou année), pour aider à remplir la
 * déclaration.
 *
 * Simple calcul local, aucune connexion à l'URSSAF.
 */

import express from 'express';
import { bilanPeriode } from '../totaux.js';

export function routesUrssaf(stockage) {
  const routeur = express.Router();

  // GET /api/urssaf?annee=2026&type=trimestre&valeur=3
  routeur.get('/', (req, res) => {
    const annee = Number.parseInt(req.query.annee, 10);
    if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) {
      return res.status(400).json({ erreur: 'Paramètre « annee » manquant ou invalide.' });
    }
    const type = req.query.type;
    if (!['mois', 'trimestre', 'annee'].includes(type)) {
      return res.status(400).json({ erreur: 'Paramètre « type » invalide (mois, trimestre ou annee).' });
    }
    let valeur = null;
    if (type !== 'annee') {
      valeur = Number.parseInt(req.query.valeur, 10);
      const max = type === 'mois' ? 12 : 4;
      if (!Number.isInteger(valeur) || valeur < 1 || valeur > max) {
        return res.status(400).json({ erreur: `Paramètre « valeur » invalide (1 à ${max}).` });
      }
    }
    res.json(bilanPeriode(stockage.listerRecettes(), { annee, type, valeur }));
  });

  return routeur;
}
