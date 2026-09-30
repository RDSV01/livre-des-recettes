# Contribuer à Livre des recettes

Merci de votre intérêt pour le projet.

## Le périmètre (à lire d'abord)

Le projet tient les registres obligatoires des micro-entrepreneurs français : le livre des
recettes et le registre des achats. Une pull request qui l'éloigne de ce cap sera refusée,
même excellente. Sont hors périmètre :

- facturation, devis, comptabilité générale ;
- télédéclaration ou connexion à l'URSSAF ou aux impôts ;
- hébergement, comptes utilisateurs, synchronisation par un serveur tiers ;
- frameworks front, bundlers ou étape de build ;
- nouvelles dépendances, sauf nécessité forte. Seul l'exécutable utilise `esbuild`,
  `postject` et `resedit`, en développement.

En cas de doute, ouvrez une issue avant de coder.

## Démarrer

```bash
git clone https://github.com/RDSV01/livre-des-recettes.git
cd livre-des-recettes
npm install
npm start          # l'application sur http://localhost:3000
npm run essai      # sur un livre vide et temporaire (« -- --garder » pour le conserver)
npm test           # la suite de tests (node:test)
npm run verifier   # l'application assemblée, de bout en bout
```

Node.js 18 ou plus. L'application écrit dans « Documents/Livre des recettes », jamais dans
le dépôt ; `LDR_DATA_DIR=./data npm start` la lance sur un autre dossier.

## Architecture

- `server.js` démarre Express, uniquement sur 127.0.0.1.
- `src/stockage.js` : le livre, un fichier JSON unique écrit de façon atomique, et ses
  sauvegardes. C'est la pièce la plus sensible.
- `src/emplacements.js` : les données dans « Documents/Livre des recettes », les sauvegardes
  dans le dossier applicatif du système. Les deux restent séparés pour que les copies
  survivent à la perte des données : ne les rapprochez pas.
- `src/pieces.js` : les PDF joints, doublés dans les sauvegardes, jamais effacés tant qu'une
  sauvegarde les cite.
- `src/archives.js`, `src/copie-externe.js`, `src/fichier-sauvegarde.js` : archives
  annuelles, copie sur clé ou disque, sauvegarde à la demande et sa reprise.
- `src/validation.js` : toute donnée entrante passe par là.
- `src/totaux.js`, `src/cotisations.js`, `src/rapport-annuel.js`, `src/controle-export.js` :
  calculs, estimation des prélèvements URSSAF, rapport annuel, vérification avant export.
- `src/entreprises.js` et `src/maj.js` : les deux seuls appels réseau (recherche par SIRET,
  nouvelle version), désactivables et sans envoi de données. N'en ajoutez pas d'autre.
- `src/partage/` : modules communs au serveur et au navigateur, sans dépendance.
- `src/exports/` : PDF, Excel, CSV et .zip ; chaque registre décrit ses colonnes dans
  `registre.js`.
- `public/` : l'interface, sans framework. Les vues sont dans `public/js/vues/`, les jetons de
  couleur et d'espacement dans `public/css/theme.css`.

## Conventions

- **Français** partout : code, commentaires, messages, documentation. Modules ES,
  indentation de 2 espaces (`.editorconfig`).
- **Pas d'emoji** : les pictogrammes passent par `icone('nom')` (Lucide), tracés dans
  `public/js/icones.js`.
- **Aucune couleur en dur** : les variables de `public/css/theme.css`, pour les deux thèmes.
- **Montants en centimes entiers** (`src/partage/montants.js`), jamais en flottants.
- **Montants légaux** (plafonds, TVA, taux de cotisations) uniquement dans
  `src/partage/bareme-seuils.js`, avec leurs dates de validité.
- **Registres légaux** : les exports s'en tiennent aux colonnes officielles, plus la
  catégorie vente ou prestation pour une activité mixte. N'ajoutez pas d'autre champ.
- **Sécurité** : tout texte passe par `echapperHtml` dans le navigateur et par
  `src/validation.js` sur le serveur. Toute route qui modifie quelque chose reste derrière le
  contrôle de provenance de `src/app.js`. Dans le CSV, une valeur qui commence par `=`, `+`,
  `-` ou `@` reçoit une espace devant.
- **Interface** : ni `alert`, ni `confirm`, ni `prompt`, mais les modales de
  `public/js/ui.js`. L'exécutable n'a pas de console : tout message destiné à l'utilisateur
  passe par l'interface.
- **Animations** : seulement quand elles ont un sens, et coupées sous
  `prefers-reduced-motion`.
- **Tests** : un correctif arrive avec le test qui l'aurait attrapé, une fonctionnalité avec
  les siens. `npm test` et `npm run verifier` restent verts.

## Proposer un changement

1. Ouvrez une issue qui décrit le problème ou la proposition.
2. Créez une branche depuis `main`, par exemple `correction/mon-sujet`.
3. Faites des commits ciblés aux messages clairs (« Corrige le tri des recettes du même
   jour », pas « fix »).
4. Vérifiez `npm test`, puis ouvrez la pull request en expliquant le pourquoi.

## Signaler un bug

Indiquez votre système, la version de Node (`node -v`), les étapes pour reproduire et ce que
vous attendiez. **Ne joignez jamais votre vrai `livre-des-recettes.json`** à une issue
publique : il contient vos clients et vos montants.
