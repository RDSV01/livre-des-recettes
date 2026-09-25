# Contribuer à Livre des recettes

Merci de votre intérêt pour le projet. Voici comment contribuer.

## Le périmètre du projet (à lire d'abord)

Le projet fait une seule chose : tenir les registres obligatoires des micro-entrepreneurs
français, le livre des recettes et le registre des achats. Une pull request qui l'éloigne de
ce cap sera refusée, même excellente techniquement. Sont hors périmètre :

- facturation, devis, comptabilité générale ;
- télédéclaration ou connexion à l'URSSAF ou aux impôts ;
- hébergement cloud, comptes utilisateurs, synchronisation par un serveur tiers ;
- frameworks front (React, Vue…), bundlers ou toute étape de build ;
- nouvelles dépendances, sauf nécessité forte et argumentée. Seule la construction de
  l'exécutable autonome (`npm run construire:exe`) en utilise trois, `esbuild`, `postject`
  et `resedit`, réservées au développement.

En cas de doute, ouvrez une issue avant de coder : on en discute.

## Démarrer

```bash
git clone https://github.com/RDSV01/livre-des-recettes.git
cd livre-des-recettes
npm install
npm start        # lance l'application sur http://localhost:3000
npm test         # lance la suite de tests (node:test, aucune dépendance)
npm run verifier # exerce l'application assemblée de bout en bout (toutes les routes)
```

Prérequis : Node.js 18 ou plus. L'application écrit dans le dossier de l'utilisateur
(« Documents/Livre des recettes »), jamais dans le dépôt. Pour essayer sans risque,
`npm run essai` la lance sur un livre vide et temporaire (port 3100), effacé à l'arrêt :
l'accueil guidé du premier lancement s'y rejoue à chaque fois, et
`npm run essai -- --garder` conserve ce livre d'un lancement à l'autre. Pour travailler sur
un jeu de données de votre choix, utilisez `LDR_DATA_DIR` :

```bash
LDR_DATA_DIR=./data npm start     # Windows : set LDR_DATA_DIR=.\data
```

## Architecture en deux minutes

- `server.js` démarre Express, uniquement sur 127.0.0.1 ;
- `src/stockage.js` : persistance dans un fichier JSON unique (recettes, achats, clients,
  paramètres), écriture atomique, sauvegardes. C'est la pièce la plus sensible du projet ;
- `src/emplacements.js` : décide où vivent les données (« Documents/Livre des recettes »)
  et les sauvegardes (dossier applicatif du système). Les deux restent séparés pour que les
  copies survivent à la suppression des données : ne les rapprochez pas. Chaque dossier de
  données a ses propres sauvegardes, si bien qu'un jeu d'essai ne touche pas aux copies de
  votre vrai livre. L'application n'écrit jamais à côté de son exécutable ;
- `src/pieces.js` : les PDF joints aux lignes, rangés dans `pieces/` à côté du livre et
  doublés dans le dossier des sauvegardes. Le ménage du démarrage n'efface un fichier que
  lorsque ni le livre ni aucune sauvegarde ne le cite ; au moindre doute, il reste ;
- `src/validation.js` : toute donnée entrante passe par là ;
- `src/entreprises.js` : recherche du nom d'une entreprise par SIRET via l'API publique,
  lancée explicitement par l'utilisateur ;
- `src/maj.js` : détection et installation d'une nouvelle version publiée. Avec le fichier
  précédent, ce sont les deux seuls appels réseau du logiciel, tous deux désactivables et
  sans envoi de données. N'en ajoutez pas d'autre ;
- `src/partage/` : modules sans dépendance, communs au serveur et au navigateur (servis
  sous `/partage/`). N'y mettez rien de propre à Node ou au navigateur ;
- `src/exports/` : générateurs PDF, Excel et CSV, partagés par les deux registres : chacun
  décrit ses colonnes dans `src/exports/registre.js`, et les trois formats les déroulent.
  `zip.js` écrit, sans dépendance, l'archive du registre avec ses PDF joints ;
- `src/import-registre.js` : import en lot (validation, doublons, simulation, sauvegarde)
  commun aux recettes et aux achats ; chaque route fournit sa validation, sa détection de
  doublon et son accès au stockage ;
- `src/demo.js` : jeu de démonstration, chargé sur un livre vide et effaçable ;
- `public/` : interface en JavaScript sans framework (modules ES, pas de build). Les vues
  sont dans `public/js/vues/`, les icônes dans `public/js/icones.js`. Les deux registres
  partagent `public/js/registre.js` (filtres, tri, sélection, retours « Annuler », pièces
  jointes). Les retours posés sur place sont dans `retours.js`, le panneau de saisie dans
  `panneau.js`, l'autocomplétion dans `autocompletion.js`, l'accueil guidé dans
  `accueil.js`. Les jetons de couleur, d'espacement et de mouvement sont dans
  `public/css/theme.css`, les composants dans `style.css`.

## Conventions

- **Langue** : code, commentaires, messages et documentation en français. Le vocabulaire du
  domaine (recette, encaissement, libellé) doit rester lisible par le public visé.
- **Pas d'emoji** dans l'interface, les exports ni la documentation. Pour les pictogrammes,
  utilisez les icônes existantes (`icone('nom')`, style Lucide), ou ajoutez un tracé à
  `public/js/icones.js`.
- **Icône de l'exécutable** : `assets/icone.ico` reprend le pictogramme de la marque
  (`public/js/icones.js`) en blanc sur le bleu du thème. Elle n'est à refaire que si
  l'identité visuelle change.
- **Thèmes** : aucune couleur en dur. Utilisez les variables CSS (`var(--accent)`,
  `var(--carte)`…) définies pour les thèmes clair et sombre dans `public/css/theme.css`.
  Évitez les encadrés à bordure sur un seul côté.
- **Style** : modules ES, `const` par défaut, fonctions courtes, JSDoc sur les fonctions
  exportées, indentation de 2 espaces (voir `.editorconfig`).
- **Montants** : toute somme d'argent se calcule en centimes entiers
  (`src/partage/montants.js`), jamais en additionnant des flottants.
- **Registres légaux** : les exports se limitent aux colonnes officielles, six pour les
  recettes (date, client, libellé, facture, mode de règlement, montant) et cinq pour les
  achats (date du règlement, fournisseur, référence de la pièce, mode de paiement,
  montant). La seule donnée interne en plus est la catégorie vente / prestation d'une
  recette (suivi des seuils et ventilation URSSAF), qui n'apparaît dans les exports que
  pour les activités mixtes (colonne Catégorie et sous-totaux). N'ajoutez pas d'autre
  champ : l'outil doit rester minimal.
- **Montants légaux** (plafonds micro, franchise de TVA, taux de cotisations) : uniquement
  dans `src/partage/bareme-seuils.js`, avec leurs dates de validité. Aucune de ces valeurs
  en dur ailleurs.
- **Sécurité** : côté navigateur, tout texte de l'utilisateur passe par `echapperHtml`
  avant d'entrer dans le DOM ; côté serveur, par `src/validation.js`. Dans l'export CSV, une
  valeur qui commence par `=`, `+`, `-` ou `@` reçoit une espace devant, sans quoi le
  tableur qui rouvre le fichier l'exécuterait comme une formule (un libellé peut venir d'un
  import). La validation retire cette espace si le fichier est réimporté. Le serveur
  n'écoute que cette machine, mais une page web visitée par l'utilisateur peut lui envoyer
  un formulaire : toute route qui modifie quelque chose reste donc derrière le contrôle de
  provenance de `src/app.js`, et n'agit jamais sans corps de requête valide.
- **Exécutable sans console** : l'application distribuée n'ouvre aucun terminal, donc rien
  de ce qu'écrit `console.log` n'est visible par l'utilisateur. Tout message qui lui est
  destiné passe par l'interface (ou, si le serveur n'a pas pu démarrer, par la page
  d'explication ouverte dans le navigateur, voir `scripts/entree-exe.js`).
- **Interface** : jamais d'`alert`, de `confirm` ni de `prompt` du navigateur. Utilisez les
  modales de `public/js/ui.js` (`confirmer`, `dialogueAttente`). Dans un gestionnaire
  d'événement, retenez l'élément cliqué avant le premier `await` : le navigateur remet
  `currentTarget` à `null` dès la fin de l'événement.
- **Animations** : elles doivent avoir un sens (ce qui apparaît, se remplit, change). Ni 3D
  ni bibliothèque. Toute animation se coupe sous `@media (prefers-reduced-motion: reduce)`,
  ce que la feuille de style respecte déjà.
- **Tests** : une correction de bug arrive avec le test qui l'aurait attrapée, une
  fonctionnalité avec ses tests. `npm test` et `npm run verifier` doivent rester verts.

## Proposer un changement

1. Ouvrez une issue qui décrit le problème ou la proposition (en français de préférence,
   l'anglais est accepté).
2. Créez une branche depuis `main` : `git checkout -b correction/mon-sujet`.
3. Faites des commits ciblés aux messages clairs (« Corrige le tri des recettes du même
   jour », pas « fix »).
4. Vérifiez `npm test`, puis ouvrez la pull request en expliquant le _pourquoi_.

Les mainteneurs relisent au plus vite. Restez bienveillants : tout le monde ici donne de son
temps libre.

## Signaler un bug

Ouvrez une issue avec votre système (Windows, macOS ou Linux), la version de Node
(`node -v`), les étapes pour reproduire, le comportement attendu et celui observé. Si
l'application a affiché une erreur dans le terminal, copiez-la.

**Ne joignez jamais votre vrai fichier `livre-des-recettes.json`** à une issue publique : il
contient les noms de vos clients et vos montants.
