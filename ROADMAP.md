# Roadmap

La boussole du projet : **une seule mission** (les registres obligatoires du
micro-entrepreneur), une application locale, légère et simple. Chaque évolution
est jugée à cette aune.

## Déjà livré

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
- Squelettes de chargement (blocs qui miroitent) et micro-animations discrètes
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

- Saisie des recettes limitée aux six colonnes légales, avec validation.
- Carnet de clients et recherche automatique par SIREN / SIRET (annuaire public).
- Tableau de bord, recherche et filtres, tri par date.
- Bilan URSSAF par mois, trimestre ou année.
- Exports PDF, Excel et CSV avec totaux mensuels et annuel.
- Import CSV avec correspondance des colonnes et détection des doublons.
- Thèmes sombre et clair, interface en icônes (Lucide).

## Prochaines versions (par ordre de priorité pressenti)

- [ ] **Gestion multi entreprises**
- [ ] **Un exécutable pour Mac Intel**
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
