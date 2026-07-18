/**
 * Point d'entrée de l'exécutable autonome (voir `scripts/construire-exe.mjs`).
 *
 * Tout est embarqué dans le fichier : Node.js, le serveur et l'interface.
 * L'utilisateur double-clique, son navigateur s'ouvre, c'est tout : aucune
 * fenêtre de console n'apparaît.
 *
 * L'exécutable ne laisse rien à côté de lui : les données vont dans
 * « Documents/Livre des recettes » (voir `src/emplacements.js`), qu'il soit
 * posé sur le bureau, dans les téléchargements ou sur une clé.
 * `LDR_DATA_DIR` reste prioritaire pour pointer ailleurs.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ACTIFS } from './actifs-generes.mjs';
import { DOSSIER_DONNEES_DEFAUT } from '../src/app.js';
import { demarrerServeur } from '../src/lancement.js';
import { ouvrirDansLeSysteme } from '../src/emplacements.js';

// Sans console attachée, écrire dans la sortie standard échoue : ces erreurs
// ne doivent pas interrompre l'application.
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});

/**
 * Explique le problème dans le navigateur : c'est le seul écran dont on
 * dispose quand l'application n'a pas pu démarrer.
 */
function abandonner(erreur) {
  const page = path.join(os.tmpdir(), 'livre-des-recettes-probleme.html');
  const message = String(erreur.message)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

  try {
    fs.writeFileSync(page, `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Livre des recettes : problème au démarrage</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a;
           display: flex; justify-content: center; padding: 48px 16px; }
    main { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
           padding: 28px; max-width: 560px; }
    h1 { font-size: 20px; margin: 0 0 16px; }
    p { line-height: 1.6; margin: 0 0 12px; }
    .attenue { color: #64748b; font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <h1>Le livre des recettes n'a pas pu s'ouvrir</h1>
    <p>${message}</p>
    <p class="attenue">Vos données ne sont pas concernées : elles restent dans le dossier
    « Livre des recettes » de vos documents.</p>
  </main>
</body>
</html>`, 'utf8');
    // La sortie attend l'ouverture : quitter avant tuerait la commande.
    return ouvrirDansLeSysteme(page, () => process.exit(1));
  } catch { /* même l'explication a échoué : il ne reste rien à faire */ }

  process.exit(1);
}

demarrerServeur({
  dossierDonnees: process.env.LDR_DATA_DIR || DOSSIER_DONNEES_DEFAUT,
  port: Number(process.env.PORT) || 3000,
  actifs: ACTIFS,
  surEchec: abandonner
});
