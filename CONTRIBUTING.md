# Contribuer à Livre des recettes

Merci de votre intérêt ! Ce document explique comment contribuer efficacement.

## Le périmètre du projet (à lire d'abord)

Le projet fait **une seule chose** : tenir les registres obligatoires des
micro-entrepreneurs français, le livre des recettes et le registre des achats.
Les pull requests qui l'éloignent de ce cap seront refusées, même excellentes
techniquement. En particulier :

- facturation, devis, comptabilité générale : hors périmètre ;
- télédéclaration ou connexion à l'URSSAF / aux impôts : hors périmètre ;
- hébergement cloud, comptes utilisateurs, synchronisation via un serveur tiers : hors périmètre ;
- frameworks front (React, Vue…), bundlers, ou toute étape de build : hors périmètre ;
- nouvelles dépendances, sauf nécessité forte argumentée : hors périmètre. Seule
  la construction de l'exécutable autonome (`npm run construire:exe`) en utilise
  trois, `esbuild`, `postject` et `resedit`, réservées au développement.

En cas de doute, ouvrez une issue **avant** de coder : on en discute.

## Démarrer

```bash
git clone https://github.com/RDSV01/livre-des-recettes.git
cd livre-des-recettes
npm install
npm start        # lance l'application sur http://localhost:3000
npm test         # lance la suite de tests (node:test, aucune dépendance)
npm run verifier # exerce l'application assemblée de bout en bout (toutes les routes)
```

Prérequis : Node.js >= 18. L'application écrit dans le dossier de l'utilisateur
(« Documents/Livre des recettes »), jamais dans le dépôt. Pour développer sur un
jeu de données jetable, lancez-la avec `LDR_DATA_DIR` :

```bash
LDR_DATA_DIR=./data npm start     # Windows : set LDR_DATA_DIR=.\data
```

## Architecture en deux minutes

- `server.js` démarre Express (uniquement sur 127.0.0.1) ;
- `src/stockage.js` : persistance dans un fichier JSON unique (recettes, achats,
  clients, paramètres), écriture atomique, sauvegardes. C'est la pièce la plus
  sensible du projet ;
- `src/emplacements.js` : décide où vivent les données (« Documents/Livre des
  recettes ») et les sauvegardes (dossier applicatif du système). Les deux sont
  volontairement séparés, pour que les copies survivent à la suppression des
  données ; ne les rapprochez pas, c'est tout l'intérêt. Chaque dossier de
  données a ses propres sauvegardes : lancer l'application sur un jeu d'essai
  ne touche donc pas aux copies de votre vrai livre. L'application n'écrit
  jamais à côté de son exécutable ;
- `src/validation.js` : toute donnée entrante passe par là ;
- `src/entreprises.js` : recherche du nom d'une entreprise par SIRET via l'API
  publique, déclenchée explicitement par l'utilisateur ;
- `src/maj.js` : détection et installation d'une nouvelle version publiée.
  Avec le fichier précédent, ce sont les **deux seuls** appels réseau du
  logiciel, tous deux désactivables et sans envoi de données. N'en ajoutez
  pas d'autre ;
- `src/partage/` : modules **sans dépendance** utilisés à la fois par le serveur
  et par le navigateur (servis sous `/partage/`). N'y mettez rien de spécifique
  à Node ou au navigateur ;
- `src/exports/` : générateurs PDF / Excel / CSV. Les deux registres partagent
  ces générateurs : chacun décrit ses colonnes dans `src/exports/registre.js`,
  les trois formats se contentent de les dérouler ;
- `src/import-registre.js` : mécanique d'import en lot (validation, doublons,
  simulation, sauvegarde) commune aux recettes et aux achats ; chaque route
  fournit sa validation, sa détection de doublon et son accès au stockage ;
- `src/demo.js` : jeu de démonstration, chargé sur un livre vide et effaçable ;
- `public/` : interface en JavaScript vanilla (modules ES, pas de build). Les vues
  vivent dans `public/js/vues/`, les icônes dans `public/js/icones.js`.

## Conventions

- **Langue** : code, commentaires, messages et documentation en français.
  Le vocabulaire du domaine (recette, encaissement, libellé) doit rester lisible
  par le public visé.
- **Pas d'emoji** dans l'interface, les exports ni la documentation. Pour les
  pictogrammes, utilisez les icônes existantes (`icone('nom')`, style Lucide) ;
  ajoutez un tracé à `public/js/icones.js` si besoin.
- **Icône de l'exécutable** : `assets/icone.ico` reprend le pictogramme de la
  marque (`public/js/icones.js`), en blanc sur le bleu du thème. Elle n'est à
  refaire que si l'identité visuelle change.
- **Thèmes** : ne codez jamais une couleur en dur. Utilisez les variables CSS
  (`var(--accent)`, `var(--carte)`…) définies pour les thèmes sombre et clair
  dans `public/css/style.css`. Évitez les encadrés à bordure sur un seul côté.
- **Style** : modules ES, `const` par défaut, fonctions courtes, JSDoc sur les
  fonctions exportées. Indentation 2 espaces (voir `.editorconfig`).
- **Montants** : toute somme d'argent se calcule **en centimes entiers**
  (`src/partage/montants.js`), jamais d'addition directe de flottants.
- **Registres légaux** : les exports se limitent aux colonnes officielles, six
  pour les recettes (date, client, libellé, facture, mode de règlement, montant)
  et cinq pour les achats (date du règlement, fournisseur, référence de la pièce,
  mode de paiement, montant). La seule donnée interne supplémentaire d'une
  recette est sa catégorie vente / prestation
  (suivi des seuils et ventilation URSSAF), elle n'apparaît dans les exports
  que pour les activités mixtes (colonne Catégorie et sous-totaux). N'ajoutez
  pas d'autre champ « pour faire joli » : cela alourdirait un outil qui se veut
  minimal.
- **Seuils légaux** (plafond micro, franchise de TVA) : uniquement dans
  `src/partage/seuils.js`, avec leur année de validité. Aucune valeur de seuil
  en dur ailleurs.
- **Sécurité** : côté navigateur, tout texte utilisateur passe par `echapperHtml`
  avant insertion dans le DOM ; côté serveur, par `src/validation.js` ; dans
  l'export CSV, une valeur commençant par `=`, `+`, `-` ou `@` est précédée
  d'une espace, sans quoi le tableur qui rouvre le fichier l'exécuterait comme
  une formule (un libellé peut venir d'un import). L'espace repart au `trim()`
  de la validation si le fichier est réimporté. Le
  serveur n'écoute que sur cette machine, mais une page web visitée par
  l'utilisateur peut lui envoyer un formulaire : toute route qui modifie
  quelque chose doit donc rester derrière le contrôle de provenance de
  `src/app.js`, et ne jamais agir sans corps de requête valide.
- **Exécutable sans console** : l'application distribuée n'ouvre aucune fenêtre
  de terminal. Rien de ce qui est écrit avec `console.log` n'est donc visible
  par l'utilisateur : tout message qui lui est destiné passe par l'interface
  (ou, si le serveur n'a pas pu démarrer, par la page d'explication ouverte
  dans le navigateur, voir `scripts/entree-exe.js`).
- **Interface** : jamais de `alert`, `confirm` ni `prompt` du navigateur.
  Utilisez les modales maison de `public/js/ui.js` (`confirmer`,
  `dialogueAttente`). Dans un gestionnaire d'événement, retenez l'élément
  cliqué **avant** le premier `await` : le navigateur remet `currentTarget`
  à `null` dès la fin de l'événement.
- **Animations** : discrètes et porteuses de sens (ce qui apparaît, se remplit,
  change). Aucune 3D, aucune bibliothèque. Toute animation doit se couper sous
  `@media (prefers-reduced-motion: reduce)`, déjà respecté par la feuille de
  style.
- **Tests** : toute correction de bug arrive avec le test qui l'aurait attrapée ;
  toute fonctionnalité arrive avec ses tests. `npm test` et `npm run verifier`
  doivent rester verts.

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

**Ne joignez jamais votre fichier `livre-des-recettes.json` réel** à une issue
publique : il contient les noms de vos clients et vos montants.
