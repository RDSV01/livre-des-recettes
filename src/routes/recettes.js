/**
 * API REST des recettes : liste filtrée, CRUD et import en lot.
 *
 * Toutes les réponses sont en JSON. En cas d'erreur de validation, le
 * serveur répond `400 { erreurs: { champ: message } }` ; le formulaire du
 * navigateur affiche ces messages champ par champ.
 */

import express from 'express';
import { validerRecette } from '../validation.js';
import { estDoublon } from '../partage/doublons.js';
import { parDateDesc, anneesPresentes } from '../totaux.js';
import { traiterImport } from '../import-registre.js';

export function routesRecettes(stockage) {
  const routeur = express.Router();

  /** Modes personnalisés courants, à passer à la validation. */
  const modesPersonnalises = () => stockage.obtenirParametres().modesPersonnalises;

  // Liste complète, triée par date décroissante. Le filtrage et la recherche
  // se font côté navigateur (`partage/filtres.js`) : une seule requête suffit.
  routeur.get('/', (req, res) => {
    res.json({ recettes: stockage.listerRecettes().sort(parDateDesc('dateEncaissement')) });
  });

  // Années présentes dans le livre (pour les exports, l'URSSAF, le tableau de bord).
  routeur.get('/annees', (req, res) => {
    res.json({ annees: anneesPresentes(stockage.listerRecettes(), 'dateEncaissement') });
  });

  routeur.post('/', (req, res) => {
    const { erreurs, valeurs } = validerRecette(req.body, modesPersonnalises());
    if (erreurs) return res.status(400).json({ erreurs });
    res.status(201).json({ recette: stockage.ajouterRecette(valeurs) });
  });

  /**
   * Import en lot : POST /api/recettes/import
   * Corps : `{ lignes: [...], importerDoublons: bool, simulation: bool }`.
   * En simulation, rien n'est écrit : le rapport permet à l'utilisateur de
   * décider avant d'importer réellement. Un import réel est toujours précédé
   * d'une sauvegarde automatique, restaurable depuis les paramètres.
   */
  routeur.post('/import', (req, res) => {
    const { erreur, rapport } = traiterImport(stockage, req.body, {
      valider: (entree) => validerRecette(entree, modesPersonnalises()),
      estDoublon,
      lister: () => stockage.listerRecettes(),
      ajouterLot: (lot) => stockage.ajouterRecettes(lot),
      resume: (v) => ({ date: v.dateEncaissement, tiers: v.client, montant: v.montant })
    });
    if (erreur) return res.status(400).json({ erreur });
    res.json(rapport);
  });

  routeur.put('/:id', (req, res) => {
    const { erreurs, valeurs } = validerRecette(req.body, modesPersonnalises());
    if (erreurs) return res.status(400).json({ erreurs });
    const recette = stockage.modifierRecette(req.params.id, valeurs);
    if (!recette) return res.status(404).json({ erreur: 'Recette introuvable.' });
    res.json({ recette });
  });

  routeur.delete('/:id', (req, res) => {
    if (!stockage.supprimerRecette(req.params.id)) {
      return res.status(404).json({ erreur: 'Recette introuvable.' });
    }
    res.status(204).end();
  });

  return routeur;
}
