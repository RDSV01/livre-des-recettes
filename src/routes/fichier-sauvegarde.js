/**
 * API du fichier de sauvegarde (voir `src/fichier-sauvegarde.js`) :
 *  - GET  /             le fichier (.zip), à enregistrer où l'on veut ;
 *  - GET  /copies       les copies trouvées sur les clés et disques branchés ;
 *  - POST /fichier      un fichier de sauvegarde, brut (`application/octet-stream`,
 *                       son nom dans `X-Nom-Fichier`), lu et mis en attente ;
 *  - POST /copie        { chemin } la copie d'un support, lue et mise en attente ;
 *  - POST /reprendre    { jeton, continuerCopie } reprend la sauvegarde en attente.
 */

import express from 'express';

/** Poids maximal d'un fichier de sauvegarde reçu : le livre et tous ses PDF. */
const TAILLE_MAX = '1gb';

export function routesFichierSauvegarde(fichierSauvegarde) {
  const routeur = express.Router();

  /** Les erreurs de reprise sont pour l'utilisateur ; les autres, pour le gestionnaire commun. */
  const echec = (res, suite, erreur) => (erreur.code === 'REPRISE'
    ? res.status(400).json({ erreur: erreur.message })
    : suite(erreur));

  routeur.get('/', (req, res, suite) => {
    try {
      const { nom, contenu } = fichierSauvegarde.creer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
      res.send(contenu);
    } catch (erreur) {
      suite(erreur);
    }
  });

  routeur.get('/copies', async (req, res, suite) => {
    try {
      res.json({ copies: await fichierSauvegarde.copies() });
    } catch (erreur) {
      suite(erreur);
    }
  });

  routeur.post('/fichier', express.raw({ type: 'application/octet-stream', limit: TAILLE_MAX }), (req, res, suite) => {
    let nom = '';
    try { nom = decodeURIComponent(req.get('X-Nom-Fichier') ?? '').slice(0, 200); } catch { /* nom illisible : sans nom */ }
    try {
      res.json(fichierSauvegarde.analyserFichier(Buffer.isBuffer(req.body) ? req.body : null, nom));
    } catch (erreur) {
      echec(res, suite, erreur);
    }
  });

  routeur.post('/copie', async (req, res, suite) => {
    try {
      res.json(await fichierSauvegarde.analyserCopie(String(req.body?.chemin ?? '')));
    } catch (erreur) {
      echec(res, suite, erreur);
    }
  });

  routeur.post('/reprendre', async (req, res, suite) => {
    try {
      res.json(await fichierSauvegarde.reprendre(String(req.body?.jeton ?? ''), { continuerCopie: req.body?.continuerCopie === true }));
    } catch (erreur) {
      echec(res, suite, erreur);
    }
  });

  return routeur;
}
