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
import { comparerParDateDesc } from '../totaux.js';
import { anneeDe } from '../partage/dates.js';

const IMPORT_MAX_LIGNES = 10_000;

export function routesRecettes(stockage) {
  const routeur = express.Router();

  /** Modes personnalisés courants, à passer à la validation. */
  const modesPersonnalises = () => stockage.obtenirParametres().modesPersonnalises;

  // Liste complète, triée par date décroissante. Le filtrage et la recherche
  // se font côté navigateur (`partage/filtres.js`) : une seule requête suffit.
  routeur.get('/', (req, res) => {
    res.json({ recettes: stockage.listerRecettes().sort(comparerParDateDesc) });
  });

  // Années présentes dans le livre (pour les exports, l'URSSAF, le tableau de bord).
  routeur.get('/annees', (req, res) => {
    const annees = [...new Set(stockage.listerRecettes().map((r) => anneeDe(r.dateEncaissement)))]
      .sort((a, b) => b - a);
    res.json({ annees });
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
    const { lignes, importerDoublons = false, simulation = false } = req.body ?? {};
    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ erreur: 'Aucune ligne à importer.' });
    }
    if (lignes.length > IMPORT_MAX_LIGNES) {
      return res.status(400).json({ erreur: `Import limité à ${IMPORT_MAX_LIGNES} lignes à la fois.` });
    }

    const modes = modesPersonnalises();
    const existantes = stockage.listerRecettes();
    const valides = [];
    const doublons = [];
    const erreurs = [];

    lignes.forEach((entree, index) => {
      const resultat = validerRecette(entree, modes);
      if (resultat.erreurs) {
        erreurs.push({ ligne: index + 1, erreurs: resultat.erreurs });
        return;
      }
      const dejaVues = valides.concat(doublons.map((d) => d.valeurs));
      if (estDoublon(resultat.valeurs, existantes) || estDoublon(resultat.valeurs, dejaVues)) {
        doublons.push({ ligne: index + 1, valeurs: resultat.valeurs });
        return;
      }
      valides.push(resultat.valeurs);
    });

    const aImporter = importerDoublons
      ? valides.concat(doublons.map((d) => d.valeurs))
      : valides;
    let sauvegarde = null;
    if (!simulation && aImporter.length > 0) {
      sauvegarde = stockage.creerSauvegarde('avant-import');
      stockage.ajouterRecettes(aImporter);
    }

    res.json({
      simulation,
      total: lignes.length,
      valides: valides.length,
      importables: aImporter.length,
      importees: simulation ? 0 : aImporter.length,
      sauvegarde,
      doublons: doublons.map(({ ligne, valeurs }) => ({
        ligne,
        dateEncaissement: valeurs.dateEncaissement,
        client: valeurs.client,
        montant: valeurs.montant
      })),
      erreurs
    });
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
