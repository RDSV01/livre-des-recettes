# Roadmap

La boussole du projet : **une seule mission** (le livre des recettes), une
application locale, légère et simple. Chaque évolution est jugée à cette aune.

## Déjà livré (v1)

- Saisie des recettes limitée aux six colonnes légales, avec validation.
- Carnet de clients et recherche automatique par SIRET (annuaire public).
- Tableau de bord, recherche et filtres, tri par date.
- Bilan URSSAF par mois, trimestre ou année.
- Exports PDF, Excel et CSV avec totaux mensuels et annuel.
- Import CSV avec correspondance des colonnes et détection des doublons.
- Thèmes sombre et clair, interface en icônes (Lucide).

## Prochaines versions (par ordre de priorité pressenti)

- [ ] **Distinction ventes / prestations de services** : catégorie facultative
  par recette et sous-totaux par catégorie dans le bilan URSSAF (utile aux
  activités mixtes, dont les plafonds et taux diffèrent).
- [ ] **Graphique du CA mensuel** sur le tableau de bord (12 derniers mois).
- [ ] **Tri par colonne** dans le tableau des recettes.
- [ ] **Exécutables autonomes** (Windows / macOS / Linux) pour installer sans
  Node.js (probablement via `node --experimental-sea` ou pkg).
- [ ] **Duplication d'une recette** (encaissements récurrents).
- [ ] **Intégration continue** GitHub Actions (tests sur Windows / macOS / Linux).

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
