# Contribuer à Livre des recettes

## Périmètre

Le projet tient les deux registres obligatoires des micro-entrepreneurs français : le livre des
recettes et le registre des achats. Une pull request qui s'en éloigne sera refusée, même
excellente. Hors périmètre :

- facturation, devis, comptabilité générale ;
- télédéclaration ou connexion à l'URSSAF ou aux impôts ;
- hébergement, comptes utilisateurs, synchronisation par un serveur tiers ;
- framework côté navigateur, bundler, étape de build ;
- nouvelle dépendance sans nécessité forte. En développement seulement : `esbuild`, `postject`
  et `resedit` pour l'exécutable, Playwright pour les tests.

En cas de doute, ouvrez une issue avant de coder.

## Démarrer

Avec Node.js 22.12 ou plus :

```bash
git clone https://github.com/RDSV01/livre-des-recettes.git
cd livre-des-recettes
npm install
npm start          # l'application sur http://localhost:3000
npm run essai      # sur un livre vide et temporaire (« -- --garder » pour le conserver)
```

L'application écrit dans « Documents/Livre des recettes », jamais dans le dépôt.
`LDR_DATA_DIR=./data npm start` la lance sur un autre dossier.

## Tests

`npm test` enchaîne ces quatre étapes et s'arrête au premier échec :

```bash
npm run versions         # modules et actions à leur dernière version, sans faille connue
npm run test:unitaires   # calculs, validation, stockage, API (tests/*.test.js, node:test)
npm run verifier         # l'application assemblée, de bout en bout
npm run test:navigateur  # chaque écran dans Chromium (tests/navigateur/, Playwright)
```

Chaque test de l'interface démarre l'application sur un livre neuf, dans un dossier
temporaire, sans réseau : l'annuaire des entreprises et la clé USB sont simulés. Une erreur
dans la page fait échouer le test. Tout passe deux fois, avec les animations puis en
mouvement réduit. Chromium se télécharge au premier lancement. Après un échec,
`npx playwright show-trace test-results/<test>/trace.zip` rejoue le test pas à pas ;
`npx playwright test --headed tests/navigateur/recettes.spec.js` le montre à l'écran.

`npm run construire:exe` fabrique l'exécutable de votre système dans `dist/`, et
`npm run verifier:exe` le lance pour en vérifier chaque partie (interface, exports,
sauvegarde).

Sur GitHub, un seul workflow, « Vérifier et publier », refait tout cela sous Windows,
macOS et Linux à chaque envoi et à chaque pull request. Une version se publie d'elle-même
quand le numéro de `package.json` monte sur `main`, et seulement si tout a réussi sur les
trois systèmes : un seul échec, et rien n'est publié.

Les dépendances restent à leur dernière version, majeures comprises : `npm run versions`
signale tout retard (modules et actions GitHub) et toute faille connue, et aucune version
ne se publie tant qu'il en reste. La mise à jour se fait à la main, avec l'adaptation du
code et des tests quand une API change.

## Architecture

- `server.js` démarre Express, uniquement sur 127.0.0.1.
- `src/stockage.js` : le livre, un fichier JSON unique écrit de façon atomique, et ses
  sauvegardes. C'est la pièce la plus sensible.
- `src/emplacements.js` : les données dans « Documents/Livre des recettes », les sauvegardes
  dans le dossier applicatif du système. Ne les rapprochez pas : séparées, les copies
  survivent à la perte des données.
- `src/pieces.js` : les PDF joints, doublés dans les sauvegardes, jamais effacés tant qu'une
  sauvegarde les cite.
- `src/archives.js`, `src/copie-externe.js`, `src/fichier-sauvegarde.js` : archives
  annuelles, copie sur clé ou disque, sauvegarde à la demande et sa reprise.
- `src/validation.js` : toute donnée entrante passe par là.
- `src/totaux.js`, `src/cotisations.js`, `src/rapport-annuel.js`, `src/controle-export.js` :
  calculs, estimation des prélèvements URSSAF, rapport annuel, contrôle avant export.
- `src/entreprises.js` et `src/maj.js` : les deux seuls appels réseau (recherche par SIRET,
  nouvelle version). N'en ajoutez pas d'autre.
- `src/partage/` : modules communs au serveur et au navigateur, sans dépendance.
- `src/exports/` : PDF, Excel, CSV et .zip ; chaque registre décrit ses colonnes dans
  `registre.js`.
- `public/` : l'interface. Les vues sont dans `public/js/vues/`, les couleurs et espacements
  dans `public/css/theme.css`.

## Conventions

- Français partout : code, commentaires, messages, documentation. Modules ES, indentation de
  2 espaces (`.editorconfig`).
- Pas d'emoji : les pictogrammes passent par `icone('nom')` (Lucide, `public/js/icones.js`).
- Couleurs : seulement les variables de `public/css/theme.css`, pour les deux thèmes.
- Montants en centimes entiers (`src/partage/montants.js`), jamais en flottants.
- Montants légaux (plafonds, TVA, taux de cotisations) uniquement dans
  `src/partage/bareme-seuils.js`, avec leurs dates de validité.
- Les exports s'en tiennent aux colonnes officielles, plus la catégorie vente ou prestation
  d'une activité mixte.
- Sécurité : tout texte passe par `echapperHtml` dans le navigateur et par
  `src/validation.js` sur le serveur. Toute route qui modifie quelque chose reste derrière le
  contrôle de provenance de `src/app.js`. Dans le CSV, une valeur qui commence par `=`, `+`,
  `-` ou `@` reçoit une espace devant.
- Ni `alert`, ni `confirm`, ni `prompt` : les modales de `public/js/ui.js`. L'exécutable n'a
  pas de console, tout message destiné à l'utilisateur passe par l'interface.
- Animations discrètes, utiles, coupées sous `prefers-reduced-motion`. On anime une
  transformation, une opacité ou une découpe (`clip-path`), jamais une largeur ou une
  hauteur ; les ressorts se règlent dans `public/js/ressort.js`.
- Un correctif arrive avec le test qui l'aurait attrapé, une fonctionnalité avec les siens,
  dans l'interface aussi (`tests/navigateur/`).

## Licence de vos contributions

Le projet est distribué sous la licence décrite dans [LICENSE](LICENSE) : gratuit, code
ouvert, sans usage commercial. En proposant une contribution (code, correctif, texte, image),
vous déclarez en être l'auteur ou avoir le droit de la proposer, et vous accordez au titulaire
des droits du projet, à titre gratuit et non exclusif, pour le monde entier et pour toute la
durée des droits d'auteur, le droit de reproduire, représenter, adapter, traduire, distribuer
et sous-licencier votre contribution, sous la licence du projet comme sous toute autre
licence, y compris commerciale. Vous gardez vos droits sur votre contribution.

Cet accord permet au projet de faire évoluer sa licence sans retrouver chaque contributeur ;
le modèle de pull request vous le fait confirmer.

## Proposer un changement

1. Ouvrez une issue qui décrit le problème ou la proposition.
2. Créez une branche depuis `main`, par exemple `correction/mon-sujet`.
3. Faites des commits ciblés aux messages clairs (« Corrige le tri des recettes du même
   jour », pas « fix »).
4. Vérifiez que `npm test` passe, puis ouvrez la pull request en expliquant le pourquoi.

## Signaler un bug

Ouvrez une issue avec le formulaire « Signaler un bug » : il demande la version, le système
et les étapes pour reproduire. Ne joignez jamais votre vrai `livre-des-recettes.json` à une
issue publique : il contient vos clients et vos montants.

Une faille de sécurité se signale en privé, jamais dans une issue : voir
[SECURITY.md](SECURITY.md).

Toute participation au projet suit le [code de conduite](CODE_OF_CONDUCT.md).
