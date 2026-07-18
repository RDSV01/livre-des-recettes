/**
 * API de mise à jour : savoir si une version plus récente est publiée, et
 * l'installer sur demande.
 *
 * La vérification n'a lieu que si l'utilisateur l'a laissée active dans ses
 * paramètres : sans cela, l'application ne contacte pas GitHub du tout.
 */

import express from 'express';
import { VERSION } from '../app.js';
import { chercherMiseAJour, appliquerMiseAJour, redemarrer, estExecutable, PAGE_VERSIONS } from '../maj.js';

export function routesMaj(stockage, arreter) {
  const routeur = express.Router();

  routeur.get('/', async (req, res) => {
    const actif = stockage.obtenirParametres().verifierMisesAJour;
    if (!actif) {
      return res.json({
        actif: false, disponible: false, version: null,
        page: PAGE_VERSIONS, remplacable: estExecutable(), erreur: null
      });
    }
    res.json({ actif: true, versionActuelle: VERSION, ...(await chercherMiseAJour(VERSION)) });
  });

  /**
   * Installe la nouvelle version : le fichier est remplacé, puis
   * l'application redémarre d'elle-même. Le navigateur n'a plus qu'à
   * attendre que le serveur réponde de nouveau.
   */
  routeur.post('/appliquer', async (req, res) => {
    try {
      // Le remplacement d'abord : en cas d'échec, rien n'est perturbé et
      // l'erreur part au navigateur normalement.
      await appliquerMiseAJour();
      // Le redémarrage seulement une fois la réponse partie, sinon le
      // navigateur ne saurait jamais si la mise à jour a abouti.
      res.on('finish', () => redemarrer({ arreter }));
      res.json({ redemarrage: true });
    } catch (erreur) {
      // Le message compte ici (fichier absent de la version publiée,
      // téléchargement interrompu…) : le gestionnaire générique le
      // remplacerait par « Erreur interne du serveur ».
      console.error(erreur);
      res.status(502).json({ erreur: erreur.message });
    }
  });

  return routeur;
}
