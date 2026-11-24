# Roadmap

Une seule mission : les registres obligatoires du micro-entrepreneur, dans une application
locale, légère et simple.

## Déjà livré

### v2.4

- Tableau de bord plus lisible : cartes chiffrées, dernières recettes présentées comme un
  relevé, le détail d'un mois en un clic, « Bien démarrer » pour
  un nouvel utilisateur.
- Plafonds estimés au 31 décembre, au rythme de l'année, explications rangées dans des
  bulles « i ».
- Rétrospective de l'année : le total, le meilleur mois, les clients, les habitudes,
  racontés en scènes animées. Mise en avant de mi-décembre à fin janvier, ouverte à tout
  moment depuis le rapport annuel.
- Registres plus confortables : ouverts sur l'année en cours, mois collés en haut, mode
  compact, filtres qui disent combien ils trouvent, navigation au clavier, bilan d'un
  client au survol, numéro de facture manquant signalé dans sa suite.
- Saisie plus sûre : montant en tête, facture PDF déposée n'importe où, série comptée,
  doublons comparés côte à côte. Une recette ajoutée depuis le tableau de bord s'annule
  elle aussi. Une suppression se confirme d'abord, et reste annulable.
- URSSAF : l'année des déclarations en frise, au rythme choisi dans les paramètres, calcul
  dessiné (chaque prélèvement avec son montant exact avant l'arrondi à l'euro), cases à
  reporter comme sur le formulaire, y compris en activité mixte.
- Clients : annuaire en fiches, et pour chacun une fiche plus complète, dont les recettes
  s'ouvrent d'un clic dans le registre.
- Rapport annuel : une année en cours se compare à la même période de l'année d'avant.
- Menu rangé et repliable, recherche (Ctrl+K) avec aperçu, en-tête compact, nouveautés
  présentées à la mise à jour.
- Paramètres : ordre des modes de règlement au choix, sauvegardes en frise, import en
  étapes, accueil en cartes.
- Registres plus rapides à l'ouverture, modules mis à jour.
- Pour les contributeurs : `npm run essai` a son banc d'essai, qui provoque d'un clic une
  autre date du jour, un seuil dépassé, une déclaration en retard, une panne…

### v2.3

- Annuaire des entreprises par nom : un nouveau client se cherche par son nom, son SIREN
  ou son SIRET, depuis la saisie d'une recette comme depuis le carnet de clients. Chaque
  entreprise trouvée montre son SIRET, son adresse et sa date de création, et dit si elle
  est fermée : on choisit la bonne en connaissance de cause.
- URSSAF : une période sans chiffre d'affaires se dit en mots plutôt qu'en « 0 € », et
  rappelle que la déclaration à zéro reste obligatoire.
- Les « Annuler » éphémères comptent les secondes qui restent (5, 4, 3, 2, 1).
- Après « Ajouter la recette », le panneau s'efface pendant que les confettis retombent.
- Retirer un client du carnet demande confirmation.
- Importer et Exports, gestes rares, passent en bas du menu.
- Messages d'erreur plus simples, sans détail technique.
- v2.3.1 : correction design.

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
- v2.2.1 : en thème sombre, la carte du chiffre d'affaires de l'année garde son bleu nuit
  au lieu de passer au noir. Les colonnes du registre ne bougent plus quand le total défile
  après un ajout, ni quand la barre de défilement apparaît. Animations réduites : tout
  s'affiche d'un coup. « Livre des recettes » dans le Gestionnaire des tâches de Windows.
  Modules mis à jour, dont Express (correctif de sécurité).

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
- Retours sur place (« Ajoutée » avec « Annuler », « Enregistré ») plutôt que des notifications.
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

### v2.5 : pilotage

- [ ] Tableau de bord personnalisable.
- [ ] Protection des périodes déjà déclarées : l'application prévient avant de modifier ou
      de supprimer une recette d'une période déclarée à l'URSSAF, et indique le montant à
      rectifier.
- [ ] Un exécutable pour Mac Intel.

### v2.6 : exports et déclarations

- [ ] Export d'une période libre.
- [ ] Impression directe du registre.
- [ ] Montants à reporter sur la déclaration de revenus (formulaire 2042-C-PRO), comme pour
      l'URSSAF.
- [ ] Chiffrement optionnel de la copie externe.

## À l'étude (pas engagé)

- Plusieurs entreprises : un livre par entreprise, qu'on bascule de l'un à l'autre.
- Tenir le même livre depuis plusieurs ordinateurs, si la demande existe.

## Jamais (hors périmètre, voir CONTRIBUTING.md)

- Facturation, devis, comptabilité générale ;
- Télédéclaration ou connexion à l'URSSAF ;
- Version hébergée, comptes utilisateurs ;
- Frameworks front ou étape de build.

Une idée ? Ouvrez une issue : la roadmap évolue avec les besoins réels.
