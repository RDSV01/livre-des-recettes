# Contribuer à Livre des recettes

Merci de votre intérêt ! Ce document explique comment contribuer efficacement.

## Le périmètre du projet (à lire d'abord)

Le projet fait **une seule chose** : tenir le livre des recettes des
micro-entrepreneurs français. Les pull requests qui l'éloignent de ce cap seront
refusées, même excellentes techniquement. En particulier :

- facturation, devis, comptabilité générale : hors périmètre ;
- télédéclaration ou connexion à l'URSSAF / aux impôts : hors périmètre ;
- hébergement cloud, comptes utilisateurs, synchronisation via un serveur tiers : hors périmètre ;
- frameworks front (React, Vue…), bundlers, ou toute étape de build : hors périmètre ;
- nouvelles dépendances, sauf nécessité forte argumentée : hors périmètre.

En cas de doute, ouvrez une issue **avant** de coder : on en discute.

## Démarrer

```bash
git clone https://github.com/RDSV01/livre-des-recettes.git
cd livre-des-recettes
npm install
npm start        # lance l'application sur http://localhost:3000
npm test         # lance la suite de tests (node:test, aucune dépendance)
```

Prérequis : Node.js >= 18. Les données de développement vivent dans `data/`
(ignoré par git) ; pour repartir de zéro, supprimez ce dossier.

## Architecture en deux minutes

- `server.js` démarre Express (uniquement sur 127.0.0.1) ;
- `src/stockage.js` : persistance dans un fichier JSON unique (recettes, clients,
  paramètres), écriture atomique, sauvegarde quotidienne. C'est la pièce la plus
  sensible du projet ;
- `src/validation.js` : toute donnée entrante passe par là ;
- `src/entreprises.js` : recherche du nom d'une entreprise par SIRET via l'API
  publique. C'est le **seul** appel réseau du logiciel, et il est déclenché
  explicitement par l'utilisateur ;
- `src/partage/` : modules **sans dépendance** utilisés à la fois par le serveur
  et par le navigateur (servis sous `/partage/`). N'y mettez rien de spécifique
  à Node ou au navigateur ;
- `src/exports/` : générateurs PDF / Excel / CSV du registre ;
- `public/` : interface en JavaScript vanilla (modules ES, pas de build). Les vues
  vivent dans `public/js/vues/`, les icônes dans `public/js/icones.js`.

## Conventions

- **Langue** : code, commentaires, messages et documentation en français.
  Le vocabulaire du domaine (recette, encaissement, libellé) doit rester lisible
  par le public visé.
- **Pas d'emoji** dans l'interface, les exports ni la documentation. Pour les
  pictogrammes, utilisez les icônes existantes (`icone('nom')`, style Lucide) ;
  ajoutez un tracé à `public/js/icones.js` si besoin.
- **Thèmes** : ne codez jamais une couleur en dur. Utilisez les variables CSS
  (`var(--accent)`, `var(--carte)`…) définies pour les thèmes sombre et clair
  dans `public/css/style.css`. Évitez les encadrés à bordure sur un seul côté.
- **Style** : modules ES, `const` par défaut, fonctions courtes, JSDoc sur les
  fonctions exportées. Indentation 2 espaces (voir `.editorconfig`).
- **Montants** : toute somme d'argent se calcule **en centimes entiers**
  (`src/partage/montants.js`), jamais d'addition directe de flottants.
- **Registre légal** : les exports se limitent aux six colonnes officielles
  (date, client, libellé, facture, mode de règlement, montant). La seule donnée
  interne supplémentaire d'une recette est sa catégorie vente / prestation
  (suivi des seuils et ventilation URSSAF des activités mixtes) ; elle
  n'apparaît jamais dans les exports. N'ajoutez pas d'autre champ « pour faire
  joli » : cela alourdirait un outil qui se veut minimal.
- **Seuils légaux** (plafond micro, franchise de TVA) : uniquement dans
  `src/partage/seuils.js`, avec leur année de validité. Aucune valeur de seuil
  en dur ailleurs.
- **Sécurité** : côté navigateur, tout texte utilisateur passe par `echapperHtml`
  avant insertion dans le DOM ; côté serveur, par `src/validation.js`.
- **Tests** : toute correction de bug arrive avec le test qui l'aurait attrapée ;
  toute fonctionnalité arrive avec ses tests. `npm test` doit rester vert.

## Proposer un changement

1. Ouvrez une issue décrivant le problème ou la proposition (en français de
   préférence, l'anglais est accepté).
2. Créez une branche depuis `main` : `git checkout -b correction/mon-sujet`.
3. Faites des commits ciblés avec des messages clairs (« Corrige le tri des
   recettes du même jour », pas « fix »).
4. Vérifiez `npm test`, puis ouvrez la pull request en expliquant le _pourquoi_.

Les mainteneurs relisent au plus vite. Soyez bienveillants dans les échanges ;
tout le monde ici donne de son temps libre.

## Signaler un bug

Ouvrez une issue avec : votre système (Windows / macOS / Linux), la version de
Node (`node -v`), les étapes pour reproduire, le comportement attendu et le
comportement observé. Si l'application a affiché une erreur dans le terminal,
copiez-la.

**Ne joignez jamais votre fichier `data/livre-des-recettes.json` réel** à une
issue publique : il contient les noms de vos clients et vos montants.
