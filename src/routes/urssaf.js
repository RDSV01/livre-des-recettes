/**
 * API du bilan URSSAF : chiffre d'affaires encaissé et nombre d'encaissements
 * sur une période (mois, trimestre ou année), pour aider à remplir la
 * déclaration.
 *
 * Simple calcul local, aucune connexion à l'URSSAF.
 */

import express from 'express';
import { bilanPeriode, selectionPeriode } from '../totaux.js';
import { idPeriode } from '../partage/dates.js';
import { cotisationsUrssaf } from '../cotisations.js';
import { lireAnnee } from './requetes.js';

export function routesUrssaf(stockage) {
  const routeur = express.Router();

  // GET /api/urssaf?annee=2026&type=trimestre&valeur=3
  routeur.get('/', (req, res) => {
    const annee = lireAnnee(req, res);
    if (annee === null) return;
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
    // L'estimation des cotisations se fait ici, et non dans le navigateur :
    // chaque encaissement cotise au taux en vigueur le jour où il a été
    // encaissé, ce qui demande les recettes ligne à ligne.
    const recettes = stockage.listerRecettes();
    const periode = { annee, type, valeur };
    const { selection } = selectionPeriode(recettes, periode);
    res.json({
      ...bilanPeriode(recettes, periode),
      cotisations: cotisationsUrssaf(selection, stockage.obtenirParametres())
    });
  });

  /**
   * Toutes les périodes d'une année d'un coup, pour les onglets de l'écran
   * URSSAF : le montant à déclarer et le nombre d'encaissements de chacune.
   * GET /api/urssaf/periodes?annee=2026&type=mois (ou trimestre)
   */
  routeur.get('/periodes', (req, res) => {
    const annee = lireAnnee(req, res);
    if (annee === null) return;
    const type = req.query.type;
    if (!['mois', 'trimestre'].includes(type)) {
      return res.status(400).json({ erreur: 'Paramètre « type » invalide (mois ou trimestre).' });
    }
    const recettes = stockage.listerRecettes();
    const nombre = type === 'mois' ? 12 : 4;
    res.json({
      periodes: Array.from({ length: nombre }, (_, i) => {
        const bilan = bilanPeriode(recettes, { annee, type, valeur: i + 1 });
        return {
          id: idPeriode(annee, type, i + 1),
          valeur: i + 1,
          libellePeriode: bilan.libellePeriode,
          chiffreAffaires: bilan.chiffreAffaires,
          aDeclarer: bilan.aDeclarer,
          nombreEncaissements: bilan.nombreEncaissements
        };
      })
    });
  });

  return routeur;
}
