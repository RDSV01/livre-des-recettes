/**
 * API REST des recettes : liste filtrée, CRUD et import en lot.
 *
 * Toutes les réponses sont en JSON. En cas d'erreur de validation, le
 * serveur répond `400 { erreurs: { champ: message } }` ; le formulaire du
 * navigateur affiche ces messages champ par champ.
 */

import express from 'express';
import { validerRecette, estDoublon } from '../validation.js';
import { comparerParDateDesc, filtrerParPeriode } from '../totaux.js';
import { normaliserTexte } from '../partage/texte.js';
import { analyserMontant, enCentimes } from '../partage/montants.js';
import { anneeDe } from '../partage/dates.js';

const IMPORT_MAX_LIGNES = 10_000;

/** Entier positif d'un paramètre de requête, ou `undefined`. */
function entier(valeur) {
  const n = Number.parseInt(valeur, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Une recette correspond-elle à la recherche libre ?
 * On cherche dans le client, le libellé et le numéro de facture (sans tenir
 * compte de la casse ni des accents) ; si la saisie ressemble à un montant,
 * on cherche aussi l'égalité exacte du montant.
 */
function correspondRecherche(recette, recherche) {
  const aiguille = normaliserTexte(recherche);
  const botteDeFoin = [recette.client, recette.libelle, recette.numeroFacture]
    .map(normaliserTexte)
    .join(' | ');
  if (botteDeFoin.includes(aiguille)) return true;

  const montant = analyserMontant(recherche);
  return montant !== null && enCentimes(montant) === enCentimes(recette.montant);
}

export function routesRecettes(stockage) {
  const routeur = express.Router();

  // Liste filtrée : GET /api/recettes?annee=2026&mois=7&mode=virement&q=dupont
  routeur.get('/', (req, res) => {
    let recettes = filtrerParPeriode(stockage.listerRecettes(), {
      annee: entier(req.query.annee),
      mois: entier(req.query.mois)
    });
    if (req.query.mode) {
      recettes = recettes.filter((r) => r.modeReglement === req.query.mode);
    }
    const recherche = String(req.query.q ?? '').trim();
    if (recherche) {
      recettes = recettes.filter((r) => correspondRecherche(r, recherche));
    }
    recettes.sort(comparerParDateDesc);
    res.json({ recettes });
  });

  // Années présentes dans le livre (pour les filtres et les exports).
  routeur.get('/annees', (req, res) => {
    const annees = [...new Set(stockage.listerRecettes().map((r) => anneeDe(r.dateEncaissement)))]
      .sort((a, b) => b - a);
    res.json({ annees });
  });

  routeur.post('/', (req, res) => {
    const { erreurs, valeurs } = validerRecette(req.body);
    if (erreurs) return res.status(400).json({ erreurs });
    res.status(201).json({ recette: stockage.ajouterRecette(valeurs) });
  });

  /**
   * Import en lot : POST /api/recettes/import
   * Corps : `{ lignes: [...], importerDoublons: bool, simulation: bool }`.
   * En simulation, rien n'est écrit : le rapport permet à l'utilisateur de
   * décider avant d'importer réellement.
   */
  routeur.post('/import', (req, res) => {
    const { lignes, importerDoublons = false, simulation = false } = req.body ?? {};
    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ erreur: 'Aucune ligne à importer.' });
    }
    if (lignes.length > IMPORT_MAX_LIGNES) {
      return res.status(400).json({ erreur: `Import limité à ${IMPORT_MAX_LIGNES} lignes à la fois.` });
    }

    const existantes = stockage.listerRecettes();
    const valides = [];
    const doublons = [];
    const erreurs = [];

    lignes.forEach((entree, index) => {
      const resultat = validerRecette(entree);
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
    if (!simulation && aImporter.length > 0) {
      stockage.ajouterRecettes(aImporter);
    }

    res.json({
      simulation,
      total: lignes.length,
      valides: valides.length,
      importables: aImporter.length,
      importees: simulation ? 0 : aImporter.length,
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
    const { erreurs, valeurs } = validerRecette(req.body);
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
