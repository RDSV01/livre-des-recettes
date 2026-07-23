# Roadmap

La boussole du projet : **une seule mission** (les registres obligatoires du
micro-entrepreneur), une application locale, légère et simple. Chaque évolution
est jugée à cette aune.

## Déjà livré

### v1.6

- Graphique du chiffre d'affaires mensuel ventilé : en activité mixte, une
  seule barre par mois empile ventes et prestations (et le non catégorisé s'il
  y en a), là où trois graphiques distincts se répartissaient l'écran. La
  composition d'un mois se lit d'un coup d'œil, détail au survol.
- Langage de couleur unifié : le bleu désigne toujours une vente, le vert une
  prestation, partout, des badges du tableau aux jauges, au graphique et au
  rapport annuel.
- Seuil majoré de la franchise de TVA rendu visible : les jauges se graduent
  jusqu'à lui, un repère marque le seuil de base, et la zone de tolérance entre
  les deux se voit au lieu d'être seulement décrite.
- Registres distingués d'un coup d'œil : une pastille colorée devant chaque
  titre, bleue pour les recettes, violette pour les achats.
- Interface adaptée aux écrans étroits : sous une certaine largeur, les deux
  registres passent en cartes empilées, une par ligne, plutôt qu'en colonnes
  illisibles.
- Détails de lecture : le montant ressort davantage dans les tableaux, et les
  tuiles à zéro s'effacent derrière les chiffres qui comptent.
- Barème des seuils reconduit au-delà de sa dernière période connue :
  l'application reste utilisable l'année où la loi change, en attendant la mise
  à jour qui apporte le nouveau barème, plutôt que d'afficher un écran vide.
- Vérification avant export accélérée : sur un registre de plusieurs milliers
  de lignes, la recherche de doublons ne fige plus l'écran.

### v1.5

- Rapport annuel de gestion en PDF pour le dirigeant : chiffre d'affaires et sa répartition, panier moyen,
  évolution mois par mois en graphique, moyens de paiement, clients de l'année
  et meilleurs d'entre eux, comparaison avec l'année précédente, puis le détail
  de chaque encaissement. Les deux registres légaux restent inchangés.
- Vérification avant chaque export : les points qu'un contrôleur regarderait
  (mentions obligatoires, continuité de la numérotation, doublons). Informe seulement sans bloquer le téléchargement.
- Intitulés plus précis : le type d'activité distingue désormais l'activité
  libérale (BNC) des prestations commerciales ou artisanales (BIC), et rappelle
  le régime de bénéfices et l'abattement forfaitaire qui s'y attachent.
- Suivi des seuils réorganisé en deux blocs distincts, qui disent chacun sur
  quel montant ils portent. Les deux réglementations se franchissent
  indépendamment : on peut rester en micro tout en devenant redevable de la
  TVA, et l'écran l'énonce désormais explicitement. Le dépassement du seuil de
  base de TVA se distingue de celui du seuil majoré, dont les conséquences ne
  sont pas les mêmes.
- Estimation des cotisations sociales sur l'écran URSSAF : à côté du chiffre
  d'affaires à déclarer, ce qui sera prélevé, au taux de l'activité. Le détail
  montre la base et le taux appliqués. Une activité mixte calcule chaque part
  au sien, ce qui n'est pas catégorisé est signalé plutôt que compté au
  hasard.
- Le type d'activité distingue désormais les professions libérales affiliées à
  la CIPAV des autres, leurs taux de cotisation différant. Une activité mixte
  précise en outre la nature de ses prestations (commerciales ou artisanales,
  libérales, libérales CIPAV) : les plafonds sont les mêmes, mais ni le régime
  de bénéfices ni le taux de cotisations.
- Montants légaux sortis du code et regroupés dans un barème daté
  (`src/partage/bareme-seuils.js`) : mettre à jour les seuils après une loi de
  finances ne demande plus que d'y ajouter un bloc. Les exercices passés
  gardent les seuils de leur époque, et une année sans barème connu est
  signalée au lieu d'être mesurée avec de faux montants.
- Les taux de cotisations y sont bornés au jour près, et non à l'année : un
  relèvement au 1er juillet se déclare tel quel. Chaque encaissement cotise au
  taux en vigueur le jour où il a été encaissé, si bien qu'une période à
  déclarer qui enjambe un changement se répartit toute seule, une ligne par
  taux, avec sa date d'entrée en vigueur.

### v1.4

- Import CSV du registre des achats, sur le modèle de l'import des recettes
  (correspondance des colonnes, détection des doublons, rapport avant import).
- Total des achats de l'année sur le tableau de bord, à côté du chiffre
  d'affaires.
- Jeu de démonstration : un livre fictif à charger en un clic pour découvrir
  l'application, effaçable d'un clic, jamais mêlé aux vraies données.
- Mises à jour vérifiées par empreinte SHA-256 : le fichier téléchargé est
  contrôlé localement, sans service tiers, avant de remplacer l'application.
- Total de la sélection multiple affiché dans les deux registres.
- Filtres et tri conservés le temps de la session (en mémoire, rien n'est écrit
  dans le navigateur).
- Chemins des données et des sauvegardes copiables d'un clic, avertissement
  quand une sauvegarde n'a pas pu être écrite.
- Lien vers les nouveautés dans le bandeau de mise à jour.
- Date en toutes lettres (« 28 mai 2026 ») affichée sous chaque champ date, sans
  changer la façon de la saisir.
- Squelettes de chargement (blocs qui miroitent) et micro-animations
  (compteurs, jauges, barres du graphique).
- Vérification de bout en bout intégrée (`npm run verifier`).

### v1.3

- Registre des achats : date du règlement, fournisseur, référence de la facture
  ou du justificatif, mode de paiement et montant, avec exports PDF, Excel et
  CSV. Les deux registres exigibles en cas de contrôle sont désormais couverts.
- Exécutable autonome : un fichier à télécharger et à lancer, sans installer
  Node.js, sans fenêtre de console ni installation.
- Mise à jour en un clic : l'application annonce les nouvelles versions
  publiées, les installe et redémarre. Vérification des MAJ désactivable.
- Activités mixtes : colonne Catégorie dans les recettes, chiffre d'affaires du
  mois et de l'année par activité, et un graphique par activité.
- Données rangées dans « Documents / Livre des recettes » : l'exécutable ne
  laisse plus rien à côté de lui, et les paramètres indiquent les chemins exacts
  du fichier de données et des sauvegardes.
- Sauvegardes déplacées hors du dossier de données, avec une copie de secours
  tenue à jour à chaque saisie : supprimer ce dossier ne fait plus rien perdre,
  l'application le détecte et propose de tout reconstituer.

### v1.2

- Exports ventilés pour les activités mixtes : colonne Catégorie et sous-totaux
  « dont ventes / dont prestations » sous chaque total.
- Sélection multiple dans les recettes : suppression et reclassement groupés
  (annulables), filtre « non catégorisées ».
- Vérification de la clé de contrôle des SIREN / SIRET (fautes de frappe
  détectées avant tout appel à l'annuaire).
- Suggestion du prochain numéro de facture, dans la série de l'utilisateur.
- Rappel de déclaration URSSAF sur le tableau de bord, selon la
  périodicité choisie.
- Première utilisation guidée : l'application s'ouvre sur les paramètres.
- Garde-fou avant d'abandonner un formulaire de recette.
- Sauvegardes conservées un an (quotidiennes 14 jours, puis hebdomadaires
  2 mois, puis mensuelles), verrou contre les doubles lancements.
- Chargement des recettes en une seule requête, affichage progressif au-delà
  de 200 lignes.

### v1.1

- Suivi des seuils sur le tableau de bord : plafond micro-entrepreneur et franchise en base de TVA,
  selon le type d'activité (ventes, prestations, mixte), à titre informatif.
- Distinction ventes / prestations par recette pour les activités mixtes :
  ventilation du bilan URSSAF et suivi des seuils propres à la part prestations.
- Graphique du chiffre d'affaires mensuel et tableau de bord consultable
  année par année.
- Vérification de la numérotation des factures : doublons et numéros manquants,
  quelle que soit la convention de numérotation.
- Modes de règlement personnalisables (ajout, renommage, suppression).
- Avertissement non bloquant en cas de recette très similaire à une autre pour éviter les doublons.
- Auto-complétion des libellés, saisie tolérante du montant, duplication d'une
  recette en un clic pour les paiements récurrents.
- Tri par colonne dans les recettes.
- Options d'interface activables ou désactivables dans les paramètres.
- Sauvegarde automatique avant chaque import CSV, gestion graphique des
  sauvegardes (liste, restauration), vérification d'intégrité au démarrage.
- Chiffre d'affaires et nombre de recettes affichés par client.

### v1.0

- Carnet de clients et recherche automatique par SIREN / SIRET (annuaire public).
- Tableau de bord, recherche et filtres, tri par date.
- Bilan URSSAF par mois, trimestre ou année.
- Exports PDF, Excel et CSV avec totaux mensuels et annuel.
- Import CSV avec correspondance des colonnes et détection des doublons.
- Thèmes sombre et clair, interface en icônes (Lucide).

## Prochaines versions (par ordre de priorité pressenti)

- [ ] **Gestion multi entreprises**
- [ ] **Un exécutable pour Mac Intel**
- [ ] **Rendre plus voyant resume-filtre dans recettes et achats pour avoir une meilleure vue sur le nombre de recettes et le total en prix (pas aussi gros que dans le tableau de bord mais juste plus voyant)** (une première tentative, un bandeau à deux blocs chiffrés, a été écartée : présentation trop lourde. À reprendre autrement.)
- [ ] **Possibilité de choisir dans les paramètres ce qu'on affiche dans le tableau de bord**

## À l'étude (pas engagé)

- Export d'une période libre (du JJ/MM au JJ/MM) ;
- Impression directe du registre depuis le navigateur (CSS d'impression) ;
- Chiffrement optionnel du fichier de données.

## Jamais (hors périmètre, voir CONTRIBUTING.md)

- Facturation, devis, comptabilité générale ;
- Télédéclaration ou connexion à l'URSSAF ;
- Version hébergée / SaaS, comptes utilisateurs ;
- Frameworks front ou étape de build.

---

Une idée ? Ouvrez une issue : la roadmap évolue avec les besoins réels des
utilisateurs.
