/**
 * Routes des pièces jointes, communes aux deux registres :
 *
 *  - POST   /:id/piece            le PDF brut (`Content-Type: application/pdf`),
 *                                 son nom d'origine dans `X-Nom-Fichier` ;
 *                                 remplace la pièce existante s'il y en a une ;
 *  - GET    /:id/piece            le PDF, à afficher ou télécharger ;
 *  - DELETE /:id/piece            détache la pièce, et la renvoie pour qu'on
 *                                 puisse la rattacher (annulation) ;
 *  - POST   /:id/piece/rattacher  `{ piece }` : remet une pièce détachée.
 *
 * Le fichier n'est jamais effacé ici : une sauvegarde peut encore le citer.
 * Le ménage se fait au démarrage (voir `pieces.nettoyer`).
 */

import path from 'node:path';
import express from 'express';
import { TAILLE_MAX_PIECE, fichePiece } from '../pieces.js';

/**
 * @param {import('express').Router} routeur
 * @param {object} options
 * @param {'recettes'|'achats'} options.collection
 * @param {'recette'|'achat'} options.cle nom de la ligne dans les réponses.
 * @param {object} options.stockage
 * @param {object} options.pieces
 */
export function installerRoutesPiece(routeur, { collection, cle, stockage, pieces }) {
  const introuvable = (res) => res.status(404).json({ erreur: cle === 'recette' ? 'Recette introuvable.' : 'Achat introuvable.' });

  routeur.post('/:id/piece', express.raw({ type: 'application/pdf', limit: TAILLE_MAX_PIECE }), (req, res) => {
    if (!stockage.obtenirLigne(collection, req.params.id)) return introuvable(res);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ erreur: 'Envoyez le PDF lui-même (type application/pdf).' });
    }
    let nom = 'piece.pdf';
    try { nom = decodeURIComponent(req.get('X-Nom-Fichier') ?? nom); } catch { /* nom illisible : nom par défaut */ }
    try {
      const piece = pieces.enregistrer(req.body, nom);
      const ligne = stockage.joindrePiece(collection, req.params.id, piece);
      if (!ligne) return introuvable(res);
      res.status(201).json({ [cle]: ligne });
    } catch (erreur) {
      if (erreur.code === 'PIECE') return res.status(400).json({ erreur: erreur.message });
      throw erreur;
    }
  });

  routeur.get('/:id/piece', (req, res) => {
    const ligne = stockage.obtenirLigne(collection, req.params.id);
    if (!ligne) return introuvable(res);
    const chemin = ligne.pieceJointe ? pieces.chemin(ligne.pieceJointe.id) : null;
    if (!chemin) return res.status(404).json({ erreur: 'Aucune pièce jointe, ou fichier introuvable.' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Nom d'origine, accents compris (RFC 5987), avec un repli ASCII.
    const nom = ligne.pieceJointe.nom;
    const ascii = nom.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '');
    res.setHeader('Content-Disposition', `inline; filename="${ascii || 'piece.pdf'}"; filename*=UTF-8''${encodeURIComponent(nom)}`);
    res.sendFile(path.resolve(chemin));
  });

  routeur.delete('/:id/piece', (req, res) => {
    const retrait = stockage.retirerPiece(collection, req.params.id);
    if (!retrait) return introuvable(res);
    res.json({ [cle]: retrait.ligne, piece: retrait.piece });
  });

  routeur.post('/:id/piece/rattacher', (req, res) => {
    const piece = fichePiece(req.body?.piece);
    if (!piece || !pieces.chemin(piece.id)) {
      return res.status(400).json({ erreur: 'Pièce introuvable : elle ne peut pas être rattachée.' });
    }
    const ligne = stockage.joindrePiece(collection, req.params.id, piece);
    if (!ligne) return introuvable(res);
    res.json({ [cle]: ligne });
  });
}
