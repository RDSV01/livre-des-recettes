/**
 * API de la sécurité des données : l'état de toutes les protections (écran
 * « Sécurité de vos données ») et la copie sur clé USB ou disque.
 */

import express from 'express';

export function routesSecurite({ stockage, copieExterne, archives }) {
  const routeur = express.Router();

  /** Tout ce que l'écran Sécurité affiche, en une requête. */
  routeur.get('/', (req, res) => {
    const sauvegardes = stockage.listerSauvegardes();
    res.json({
      sauvegardes: {
        nombre: sauvegardes.length,
        derniere: sauvegardes[0]?.date ?? null,
        verification: stockage.verification(),
        enEchec: stockage.sauvegardesEnEchec(),
        dossier: stockage.dossierSauvegardes
      },
      copieExterne: copieExterne.etat(),
      archives: { annees: archives.lister(), dossier: archives.dossier }
    });
  });

  // Supports branchés, proposables pour la copie (la recherche prend quelques secondes).
  routeur.get('/supports', async (req, res, suite) => {
    try {
      res.json({ supports: await copieExterne.supports() });
    } catch (erreur) {
      suite(erreur);
    }
  });

  // POST /api/securite/copie-externe { chemin } : le support choisi par l'utilisateur.
  routeur.post('/copie-externe', async (req, res, suite) => {
    try {
      const resultat = await copieExterne.choisir(String(req.body?.chemin ?? ''));
      res.json({ resultat, etat: copieExterne.etat() });
    } catch (erreur) {
      if (erreur.code === 'SUPPORT') return res.status(400).json({ erreur: erreur.message });
      suite(erreur);
    }
  });

  routeur.post('/copie-externe/copier', async (req, res, suite) => {
    try {
      const resultat = await copieExterne.copier({ force: true });
      res.json({ resultat, etat: copieExterne.etat() });
    } catch (erreur) {
      suite(erreur);
    }
  });

  routeur.delete('/copie-externe', (req, res) => {
    copieExterne.arreter();
    res.json({ etat: copieExterne.etat() });
  });

  return routeur;
}
