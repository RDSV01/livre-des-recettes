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
import { categorieImposee } from '../partage/seuils.js';
import { parDateDesc, anneesPresentes } from '../totaux.js';
import { traiterImport } from '../import-registre.js';
import { installerRoutesLot } from './lots.js';
import { installerRoutesPiece } from './pieces.js';

export function routesRecettes(stockage, pieces) {
  const routeur = express.Router();

  /**
   * Valide une recette selon les paramètres courants. Une activité à nature
   * unique (tout sauf mixte) impose sa catégorie : le formulaire ne la demande
   * pas, et le livre reste classé si l'activité devient mixte un jour.
   */
  const valider = (entree) => {
    const { modesPersonnalises, typeActivite } = stockage.obtenirParametres();
    const resultat = validerRecette(entree, modesPersonnalises);
    const imposee = categorieImposee(typeActivite);
    if (resultat.valeurs && imposee) resultat.valeurs.categorie = imposee;
    return resultat;
  };

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
    const { erreurs, valeurs } = valider(req.body);
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
      valider,
      estDoublon,
      lister: () => stockage.listerRecettes(),
      ajouterLot: (lot) => stockage.ajouterRecettes(lot),
      resume: (v) => ({ date: v.dateEncaissement, tiers: v.client, montant: v.montant })
    });
    if (erreur) return res.status(400).json({ erreur });
    res.json(rapport);
  });

  // Suppression, restauration et reclassement groupés (voir `lots.js`).
  installerRoutesLot(routeur, {
    cle: 'recettes',
    valider,
    supprimer: (ids) => stockage.supprimerRecettes(ids),
    restaurer: (lignes) => stockage.restaurerRecettes(lignes),
    modifier: (changements) => stockage.modifierRecettes(changements),
    pieces
  });

  // Facture PDF jointe (voir `pieces.js`).
  installerRoutesPiece(routeur, { collection: 'recettes', cle: 'recette', stockage, pieces });

  routeur.put('/:id', (req, res) => {
    const { erreurs, valeurs } = valider(req.body);
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
