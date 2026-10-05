# Roadmap

Une seule mission : les registres obligatoires du micro-entrepreneur, dans une application
locale, légère et simple.

## Déjà livré

### v2.2

- Recherche dans tout le livre (Ctrl+K) : clients, recettes, achats et pages. Raccourcis
  clavier (N, A, /, ?), listés dans les paramètres.
- Saisie plus rapide : mode de règlement repris du client ou du fournisseur, saisie en série
  avec Ctrl+Entrée, date au clavier (+, −, A pour aujourd'hui).
- Les recettes qui reviennent chaque mois se proposent d'un clic sur le tableau de bord.
- Tableau de bord : comparaison avec l'année précédente, un mois du graphique ou une
  dernière recette ouvre le registre, année choisie d'une flèche ou dans une liste. Chaque
  aide se désactive dans les paramètres.
- Ctrl+Z annule aussi sur place : registres, totaux et tableau de bord se mettent à jour.
- Jeu de démonstration complet : deux années d'activité, factures PDF jointes, déclarations
  à jour.
- Chaque écran vérifié dans un vrai navigateur avant chaque version, avec et sans
  animations : saisies, annulations, exports, imports, sauvegardes et récupération.
- Interface affinée : filtres en boutons, plafonds plus lisibles, montants URSSAF en euros
  entiers, paramètres regroupés, heure du dernier enregistrement en bas du menu, animations
  discrètes.
- Nouvelle licence (PolyForm Noncommercial) : l'application reste gratuite et son code
  ouvert, sans usage commercial.

### v2.1

- Copie automatique sur une clé USB ou un disque externe, choisi dans les paramètres.
- « Sauvegarder maintenant » : tout le livre et ses PDF dans un seul fichier, à ranger où
  l'on veut. « Reprendre une sauvegarde » remet tout en place, sur cet ordinateur ou sur un
  autre, dès l'accueil du premier lancement.
- Archives annuelles : chaque année close est figée avec ses registres et ses PDF, et gardée
  10 ans, la durée de conservation légale.
- Section « Sécurité de vos données » dans les paramètres : où en est chaque protection et sauvegarde.
- Garde-fous : sauvegardes relues au démarrage, livre resté dans iCloud ou OneDrive jamais
  pris pour perdu, écriture réessayée quand Windows retient un instant le fichier, livre
  abîmé jamais recopié sur la clé.
- Une mise à jour qui ne démarre pas laisse d'elle-même la place à l'ancienne version.

### v2.0

- Nouvelle interface : menu bleu nuit, cartes plus nettes, police Commissioner livrée avec
  l'application, thème sombre revu.
- Registres lus mois par mois, avec le nombre de lignes et le sous-total de chaque mois ;
  recherche surlignée, filtres en pastilles, titres et total visibles pendant le défilement.
- Factures et justificatifs en PDF, joints d'un glisser-déposer, ouverts dans un aperçu et
  ajoutés aux exports sur demande.
- Saisie dans un panneau latéral, la liste restant visible, avec autocomplétion du client
  et du libellé.
- Retours sur place (« Ajoutée · Annuler », « Enregistré ») plutôt que des notifications.
- Champ de date maison : saisie au clavier, ou calendrier aux couleurs de l'application.
- Tableau de bord refait : chiffre d'affaires en tête, graphique mensuel, carte de la
  déclaration URSSAF à faire.
- Écran URSSAF en onglets (mois ou trimestres), intitulés repris de la déclaration, ACRE
  prise en compte.
- Accueil guidé au premier lancement, et clients en deux volets : le carnet et la fiche.
- Correctifs, dont la règle de TVA de 2023 et 2024 appliquée à ces années-là.

### v1.9

- Déclaration URSSAF en trois chiffres : à déclarer, prélevé, restant. Le calcul se déplie
  à la demande.
- Estimation complète : cotisations sociales, formation professionnelle et versement
  libératoire, chacun arrondi à l'euro comme le fait l'URSSAF.
- Date limite de chaque déclaration, rappel sur le tableau de bord, période marquée
  déclarée.
- Numéros de facture signalés à tort ignorables d'un clic.
- Protection contre le « DNS rebinding », et chaque écriture vidée sur le disque.

### v1.8

- Application utilisable entièrement au clavier et au lecteur d'écran.
- Graphique du chiffre d'affaires doublé d'un tableau, contrastes revus pour la lisibilité.
- Suppression annulable, suppression groupée fiabilisée, filtres actifs en pastilles.
- Écran URSSAF recentré sur le montant à déclarer, copiable d'un clic.

### v1.7

- Montants arrondis à l'euro selon la règle de l'URSSAF, cotisations estimées sur cette
  base.
- Écran URSSAF ouvert sur la dernière période échue.

### v1.6

- Activité mixte : ventes et prestations empilées dans une seule barre par mois.
- Couleurs unifiées : bleu pour une vente, vert pour une prestation.
- Seuil majoré de la franchise de TVA visible sur les jauges.

### v1.5

- Rapport annuel de gestion en PDF.
- Vérification avant chaque export des points qu'un contrôleur regarderait.
- Suivi des seuils en deux blocs, micro et TVA, qui se franchissent indépendamment.
- Estimation des cotisations sociales, et montants légaux réunis dans un barème daté.

### v1.4

- Import CSV du registre des achats.
- Jeu de démonstration.
- Mises à jour vérifiées par empreinte SHA-256.

### v1.3

- Registre des achats, avec ses exports PDF, Excel et CSV.
- Exécutable autonome, sans Node.js à installer, et mise à jour en un clic.
- Données rangées dans « Documents / Livre des recettes », sauvegardes hors de ce dossier.

### v1.2

- Exports ventilés pour les activités mixtes.
- Sélection multiple : suppression et reclassement groupés.
- Contrôle des SIREN et SIRET, suggestion du prochain numéro de facture.
- Sauvegardes conservées un an, verrou contre les doubles lancements.

### v1.1

- Suivi du plafond micro-entrepreneur et de la franchise de TVA.
- Distinction ventes et prestations, graphique du chiffre d'affaires mensuel.
- Contrôle de la numérotation des factures, modes de règlement personnalisables.

### v1.0

- Livre des recettes et carnet de clients, avec recherche par SIREN ou SIRET.
- Tableau de bord, recherche et filtres, bilan URSSAF.
- Exports PDF, Excel et CSV, import CSV, thèmes clair et sombre.

## Prochaines versions

### v2.3 : plusieurs entreprises

- [ ] Un livre par entreprise, qu'on bascule de l'un à l'autre, chacun avec ses sauvegardes
      et sa copie externe.
- [ ] Un exécutable pour Mac Intel.

### v2.4 : pilotage

- [ ] Tableau de bord personnalisable.
- [ ] Projection de fin d'année : « à ce rythme, 41 200 €, soit 49 % du plafond ».
- [ ] Protection des périodes déjà déclarées : l'application prévient avant de modifier une
      recette d'une période déclarée à l'URSSAF, et indique le montant à rectifier.

### v2.5 : exports et déclarations

- [ ] Export d'une période libre.
- [ ] Impression directe du registre.
- [ ] Montants à reporter sur la déclaration de revenus (formulaire 2042-C-PRO), comme pour
      l'URSSAF.
- [ ] Chiffrement optionnel de la copie externe.

## À l'étude (pas engagé)

- Tenir le même livre depuis plusieurs ordinateurs, si la demande existe.

## Jamais (hors périmètre, voir CONTRIBUTING.md)

- Facturation, devis, comptabilité générale ;
- Télédéclaration ou connexion à l'URSSAF ;
- Version hébergée, comptes utilisateurs ;
- Frameworks front ou étape de build.

Une idée ? Ouvrez une issue : la roadmap évolue avec les besoins réels.
