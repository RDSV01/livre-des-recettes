/**
 * API des clients : liste (avec le chiffre d'affaires généré par chacun),
 * CRUD et recherche par SIRET.
 *
 * Le carnet de clients sert uniquement à fiabiliser la saisie des recettes
 * (choisir un client existant évite les fautes de frappe sur le nom). Une
 * fiche client ne contient que le nom et, facultativement, le SIRET.
 */

import express from 'express';
import { validerClient } from '../validation.js';
import { rechercherEntreprise } from '../entreprises.js';
import { normaliserTexte } from '../partage/texte.js';
import { enCentimes, enEuros } from '../partage/montants.js';

/** Cherche un client déjà enregistré portant le même nom ou le même SIRET. */
function clientExistant(clients, { nom, siret }) {
  const nomN = normaliserTexte(nom);
  return clients.find((c) =>
    normaliserTexte(c.nom) === nomN || (siret && c.siret && c.siret === siret)
  );
}

export function routesClients(stockage) {
  const routeur = express.Router();

  // Liste triée par nom, enrichie du nombre de recettes et du CA par client
  // (rapprochement par nom, insensible à la casse et aux accents).
  routeur.get('/', (req, res) => {
    const totaux = new Map();
    for (const recette of stockage.listerRecettes()) {
      const cle = normaliserTexte(recette.client);
      const entree = totaux.get(cle) ?? { nombre: 0, centimes: 0 };
      entree.nombre += 1;
      entree.centimes += enCentimes(recette.montant);
      totaux.set(cle, entree);
    }
    const clients = stockage.listerClients().map((client) => {
      const stats = totaux.get(normaliserTexte(client.nom)) ?? { nombre: 0, centimes: 0 };
      return { ...client, nombreRecettes: stats.nombre, totalRecettes: enEuros(stats.centimes) };
    });
    res.json({ clients });
  });

  /**
   * Recherche le nom d'une entreprise par SIRET (API publique).
   * GET /api/clients/recherche-siret?siret=12345678900012
   * Ne crée rien : renvoie juste le nom trouvé, que l'utilisateur confirme.
   */
  routeur.get('/recherche-siret', async (req, res) => {
    const siret = String(req.query.siret ?? '').replace(/\s/g, '');
    if (!/^\d{9}$|^\d{14}$/.test(siret)) {
      return res.status(400).json({ erreur: 'SIRET (14 chiffres) ou SIREN (9 chiffres) attendu.' });
    }
    try {
      const entreprise = await rechercherEntreprise(siret);
      if (!entreprise) {
        return res.status(404).json({ erreur: 'Aucune entreprise trouvée pour ce numéro.' });
      }
      res.json({ entreprise });
    } catch (erreur) {
      // Indisponibilité du service externe : ce n'est pas une erreur du serveur local.
      res.status(502).json({ erreur: erreur.message });
    }
  });

  routeur.post('/', (req, res) => {
    const { erreurs, valeurs } = validerClient(req.body);
    if (erreurs) return res.status(400).json({ erreurs });
    if (clientExistant(stockage.listerClients(), valeurs)) {
      return res.status(409).json({ erreur: 'Un client portant ce nom ou ce SIRET existe déjà.' });
    }
    res.status(201).json({ client: stockage.ajouterClient(valeurs) });
  });

  routeur.put('/:id', (req, res) => {
    const { erreurs, valeurs } = validerClient(req.body);
    if (erreurs) return res.status(400).json({ erreurs });
    const autres = stockage.listerClients().filter((c) => c.id !== req.params.id);
    if (clientExistant(autres, valeurs)) {
      return res.status(409).json({ erreur: 'Un autre client porte déjà ce nom ou ce SIRET.' });
    }
    const client = stockage.modifierClient(req.params.id, valeurs);
    if (!client) return res.status(404).json({ erreur: 'Client introuvable.' });
    res.json({ client });
  });

  routeur.delete('/:id', (req, res) => {
    if (!stockage.supprimerClient(req.params.id)) {
      return res.status(404).json({ erreur: 'Client introuvable.' });
    }
    res.status(204).end();
  });

  return routeur;
}
