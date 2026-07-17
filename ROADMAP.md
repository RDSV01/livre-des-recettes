# Roadmap

La boussole du projet : **une seule mission** (le livre des recettes), une
application locale, légère et simple. Chaque évolution est jugée à cette aune.

## Déjà livré

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

- [ ] **Registre des achats** (obligatoire pour les activités d'achat / vente de
      marchandises) : de façon chronologique, la date du règlement, le fournisseur,
      la référence de la facture ou du justificatif, le mode de paiement et le
      montant de l'achat. Avec le livre des recettes, les deux registres exigibles
      en cas de contrôle seraient ainsi couverts.
- [ ] **Exécutables autonomes** (Windows / macOS / Linux) pour installer sans
      Node.js (probablement via `node --experimental-sea` ou pkg).

## À l'étude (pas engagé)

- Export d'une période libre (du JJ/MM au JJ/MM) ;
- Impression directe du registre depuis le navigateur (CSS d'impression) ;
- Chiffrement optionnel du fichier de données.

## Jamais (hors périmètre, voir CONTRIBUTING.md)

- Facturation, devis, comptabilité générale, registre des achats ;
- Télédéclaration ou connexion à l'URSSAF ;
- Version hébergée / SaaS, comptes utilisateurs ;
- Frameworks front ou étape de build.

---

Une idée ? Ouvrez une issue : la roadmap évolue avec les besoins réels des
utilisateurs.
