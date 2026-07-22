/**
 * API REST du registre des achats : liste chronologique et CRUD.
 *
 * Même contrat que les recettes : réponses JSON, et
 * `400 { erreurs: { champ: message } }` en cas de validation refusée.
 */

import express from 'express';
import { validerAchat } from '../validation.js';
import { estDoublonAchat } from '../partage/doublons.js';
import { parDateDesc, anneesPresentes } from '../totaux.js';
import { traiterImport } from '../import-registre.js';

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
    res.json({ annees: anneesPresentes(stockage.listerAchats(), 'dateReglement') });
  });

  routeur.post('/', (req, res) => {
    const { erreurs, valeurs } = validerAchat(req.body, modesPersonnalises());
    if (erreurs) return res.status(400).json({ erreurs });
    res.status(201).json({ achat: stockage.ajouterAchat(valeurs) });
  });

  /**
   * Import en lot : POST /api/achats/import
   * Même contrat que l'import des recettes (voir `import-registre.js`) :
   * simulation pour un rapport relu avant écriture, sauvegarde automatique
   * juste avant l'import réel.
   */
  routeur.post('/import', (req, res) => {
    const { erreur, rapport } = traiterImport(stockage, req.body, {
      valider: (entree) => validerAchat(entree, modesPersonnalises()),
      estDoublon: estDoublonAchat,
      lister: () => stockage.listerAchats(),
      ajouterLot: (lot) => stockage.ajouterAchats(lot),
      resume: (v) => ({ date: v.dateReglement, tiers: v.fournisseur, montant: v.montant })
    });
    if (erreur) return res.status(400).json({ erreur });
    res.json(rapport);
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
