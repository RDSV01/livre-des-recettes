/**
 * Tests de l'interface dans un vrai navigateur (Playwright, Chromium) :
 * `npm run test:navigateur`.
 *
 * Chaque test démarre sa propre application sur un livre neuf, dans un
 * dossier temporaire (voir `tests/navigateur/outils.js`) : jamais le vrai
 * livre, jamais le réseau. Tout passe deux fois : avec les animations, comme
 * l'utilisateur les voit, puis en mouvement réduit, qui suit d'autres chemins
 * du code.
 *
 * Réservé au développement : rien de ceci n'entre dans l'application livrée.
 */

import { defineConfig, devices } from '@playwright/test';

const surIntegration = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/navigateur',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: surIntegration,
  // Un test qui ne passe qu'au second essai cache un défaut : il échoue.
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: surIntegration ? [['list'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    // Application de bureau : une fenêtre d'ordinateur portable ordinaire.
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
    // Pas de fuseau imposé au navigateur : il garde celui de la machine, comme
    // le serveur, et tous deux voient le même « aujourd'hui ».
    colorScheme: 'light',
    permissions: ['clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'animations', use: { reducedMotion: 'no-preference' } },
    { name: 'mouvement-reduit', use: { reducedMotion: 'reduce' } }
  ]
});
