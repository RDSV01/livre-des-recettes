/**
 * API REST du registre des achats : liste chronologique et CRUD.
 *
 * Même contrat que les recettes : réponses JSON, et
 * `400 { erreurs: { champ: message } }` en cas de validation refusée.
 */

import express from 'express';
import { validerAchat } from '../validation.js';
import { parDateDesc } from '../totaux.js';
import { anneeDe } from '../partage/dates.js';

export function routesAchats(stockage) {
  const routeur = express.Router();

  /** Modes personnalisés courants, à passer à la validation. */
  const modesPersonnalises = () => stockage.obtenirParametres().modesPersonnalises;

  // Liste complète, triée par date de règlement décroissante. Le filtrage et
  // la recherche se font côté navigateur (`partage/filtres.js`).
  routeur.get('/', (req, res) => {
    res.json({ achats: stockage.listerAchats().sort(parDateDesc('dateReglement')) });
  });

  // Années présentes dans le registre (pour les filtres et les exports).
  routeur.get('/annees', (req, res) => {
    const annees = [...new Set(stockage.listerAchats().map((a) => anneeDe(a.dateReglement)))]
      .sort((a, b) => b - a);
    res.json({ annees });
  });

  routeur.post('/', (req, res) => {
    const { erreurs, valeurs } = validerAchat(req.body, modesPersonnalises());
    if (erreurs) return res.status(400).json({ erreurs });
    res.status(201).json({ achat: stockage.ajouterAchat(valeurs) });
  });

  routeur.put('/:id', (req, res) => {
    const { erreurs, valeurs } = validerAchat(req.body, modesPersonnalises());
    if (erreurs) return res.status(400).json({ erreurs });
    const achat = stockage.modifierAchat(req.params.id, valeurs);
    if (!achat) return res.status(404).json({ erreur: 'Achat introuvable.' });
    res.json({ achat });
  });

  routeur.delete('/:id', (req, res) => {
    if (!stockage.supprimerAchat(req.params.id)) {
      return res.status(404).json({ erreur: 'Achat introuvable.' });
    }
    res.status(204).end();
  });

  return routeur;
}
