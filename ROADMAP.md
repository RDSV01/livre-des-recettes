# Roadmap

Une seule mission : les registres obligatoires du micro-entrepreneur, dans une application
locale, légère et simple. Chaque évolution est jugée à cette aune.

## Déjà livré

### v2.0

- Nouvelle interface, dans la continuité de la v1 : menu bleu nuit dont l'indicateur glisse
  d'une page à l'autre, cartes plus nettes, police Commissioner livrée avec l'application,
  thème sombre revu qui s'ouvre en cercle depuis son bouton.
- Registres en forme de livre : lecture mois par mois, chaque mois ouvert par son nombre de
  lignes et son sous-total. La recherche et l'année (« ‹ 2026 › », comme au tableau de bord)
  restent à portée de main ; les autres filtres passent derrière « Filtres » et s'affichent
  en pastilles qu'une croix retire. Titres de colonnes et total restent visibles pendant le
  défilement, les mots cherchés sont surlignés, et les lignes glissent jusqu'à leur nouvelle
  place au tri et au filtrage.
- Clients : la part de chacun dans le chiffre d'affaires, et le carnet trié par chiffre
  d'affaires, par nom ou par dernier encaissement.
- Tableau de bord : en changeant d'année, les barres du graphique et les montants passent de
  l'ancienne valeur à la nouvelle ; dans les grands montants, les centimes passent en
  retrait.
- Factures et justificatifs en PDF : un PDF se joint à une recette ou à un achat en le
  déposant dans le panneau de saisie ou sur sa ligne. Il s'ouvre dans un aperçu
  (télécharger, remplacer, retirer), et un filtre retrouve les lignes sans PDF. Les fichiers
  sont rangés dans le dossier `pieces`, à côté du livre, et doublés dans le dossier des
  sauvegardes ; un PDF n'est effacé que lorsque ni le livre ni aucune sauvegarde ne le cite.
  Annuler une suppression rend la ligne avec son PDF.
- Exports : option « avec les PDF joints », qui livre dans une archive .zip le registre et
  les factures ou justificatifs de la période. Le contrôle avant export s'affiche point par
  point à la place de l'aperçu, puis le téléchargement part de lui-même. Copie complète des
  données (livre et PDF) téléchargeable depuis les paramètres.
- Saisie dans un panneau latéral, la liste restant visible, avec une vraie autocomplétion :
  pour le client (récents d'abord, recherche d'un SIRET dans l'annuaire, nouveau client
  ajouté au carnet) et pour le libellé (ceux du client d'abord, avec leur montant et leur
  catégorie). À l'ouverture, aucun champ n'a le focus : les suggestions n'arrivent qu'au
  premier clic.
- Retours là où l'on agit, au lieu de notifications : « Ajoutée · Annuler » sur la ligne,
  « Supprimée · Annuler » à sa place, le résultat d'un lot sur la barre de sélection,
  « Copié », « Exporté » ou « Enregistré » sur le bouton ou le réglage lui-même. Ces retours
  se déplient et se replient en douceur, et chaque « Annuler » porte un petit anneau qui se
  vide pendant ses 5 secondes de vie. Menu « … » sur chaque ligne ; un clic sur la ligne
  l'ouvre.
- Champ de date maison, au lieu du sélecteur du navigateur : saisie au clavier
  (« 24/09/2026 », « 24/9 ») au format choisi dans les paramètres, ou calendrier aux
  couleurs de l'application, clair ou sombre, au clavier comme à la souris.
- Tableau de bord : chiffre d'affaires de l'année en tête, graphique mensuel avec le total de
  chaque colonne et sa version en tableau, carte de la déclaration URSSAF à faire (montant,
  échéance, ce qu'il restera, « C'est fait » annulable), dernières recettes ajustées à la
  hauteur de la carte des plafonds. Le menu signale une déclaration à faire ou en retard.
- Accueil guidé au premier lancement : prénom, entreprise (retrouvée par son SIRET),
  activité et rythme de déclaration, chaque étape enregistrée en passant à la suivante. Le
  tableau de bord salue ensuite selon le moment de la journée, avec le prénom s'il est
  connu.
- Écran URSSAF en onglets : les douze mois ou les quatre trimestres de l'année, chacun avec
  son état et son montant, ou l'année entière.
- ACRE : avec l'option et la date de début d'activité (dans les paramètres), les cotisations
  sociales estimées sont réduites jusqu'à la fin du 3e trimestre civil qui suit : moitié du
  taux pour une création avant le 1er juillet 2026, trois quarts ensuite, arrondis au
  dixième supérieur, avec un plancher propre à la CIPAV. Formation professionnelle et
  versement libératoire restent dus en entier.
- Intitulés d'activité repris des cases de la déclaration URSSAF (« Ventes de
  marchandises », « Autres prestations de services : activité libérale », « Profession
  libérale relevant de la Cipav »…), et l'écran URSSAF nomme la case où reporter chaque
  montant.
- Clients en deux volets : le carnet classé par chiffre d'affaires, et la fiche du client
  choisi avec ses encaissements et ses factures jointes. Un client retiré du carnet se remet
  d'un clic.
- Import CSV en trois étapes, avec la première valeur de chaque colonne pour la reconnaître,
  et la réussite annoncée dans la carte.
- Paramètres avec sommaire ; chaque réglage s'enregistre dès qu'on le change.
- Renommer un client dans le carnet renomme aussi ses recettes, en une seule écriture : sa
  fiche garde ses encaissements.
- Site de présentation retiré : le README et la page des versions suffisent.
- Correctifs :
  - un mode de règlement personnalisé utilisé par un seul achat ne peut plus être supprimé
    (seules les recettes étaient vérifiées, et l'achat aurait affiché un code illisible) ;
  - le graphique du rapport annuel distingue juin et juillet (« juin », « juil » au lieu de
    deux « jui ») ;
  - les fichiers de l'interface sont revalidés à chaque chargement : une mise à jour ne
    laisse plus d'anciens fichiers en cache ;
  - hors activité mixte, chaque recette prend d'office la catégorie de l'activité
    (prestation de services pour une activité libérale), et le rapport annuel n'annonce plus
    de recettes « non catégorisées » à qui n'exerce qu'une activité ;
  - la carte des seuils applique à 2023 et 2024 la règle de TVA de l'époque : au-delà du
    seuil majoré, TVA due dès le 1er du mois du dépassement, et non dès le jour.

### v1.9

- Écran de déclaration URSSAF réduit à trois chiffres : ce qu'il faut déclarer, ce que
  l'URSSAF prélèvera, ce qu'il vous restera. Le calcul qui mène de l'encaissé au reste (base
  et taux de chaque prélèvement) se déplie à la demande.
- L'estimation compte tout ce que l'URSSAF prélève sur le chiffre d'affaires : cotisations
  sociales, contribution à la formation professionnelle (0,1 % pour une activité
  commerciale, 0,3 % pour un artisan, 0,2 % pour une activité libérale) et, pour qui l'a
  choisi, versement libératoire de l'impôt sur le revenu. Chaque prélèvement est arrondi à
  l'euro le plus proche, comme le fait l'URSSAF. Deux cases des paramètres indiquent
  l'option pour le versement libératoire et l'activité artisanale.
- Bouton « Exporter » dans les deux registres : il ouvre la page des exports sur le bon
  registre, à l'année et au mois filtrés à l'écran.
- Date limite de déclaration pour chaque période : en cours, à faire avant telle date, en
  retard ou déjà faite. Une période se marque déclarée depuis l'écran URSSAF, et le rappel
  du tableau de bord donne le montant à déclarer et la date limite, sur un autre ton une
  fois l'échéance passée.
- Numéros de facture signalés à tort (facture annulée, réglée en plusieurs fois) ignorables
  d'un clic : ils ne reviennent ni dans le registre ni dans le contrôle avant export. La
  liste reste consultable, et réversible, dans les paramètres.
- Tableau de bord allégé en activité mixte : la répartition ventes / prestations passe sous
  les deux tuiles du chiffre d'affaires, soit quatre tuiles au lieu de huit qui se
  répétaient. Libellés des tuiles en casse normale.
- Paramètres : les options s'appliquent dès qu'on les coche, sans le bouton « Enregistrer »
  du bas de la page.
- Sécurité : l'application refuse toute requête adressée à un autre nom que la machine
  elle-même. Un site malveillant qui ferait pointer son domaine vers votre ordinateur
  (« DNS rebinding ») ne peut plus lire le livre.
- Données : chaque écriture est vidée sur le disque avant de remplacer le fichier, contre la
  perte en cas de coupure de courant. Les sauvegardes et la date d'édition des exports
  suivent l'heure locale : entre minuit et 2 h, elles portaient la date de la veille.
- Suppressions et reclassements groupés en une seule écriture, en tout ou rien. Annuler une
  suppression rend la ligne telle qu'elle était, identifiant et date de création compris,
  au lieu d'en créer une copie.
- Code allégé : les deux registres partagent une seule mécanique de tableau (filtres, tri,
  sélection, suppression annulable), les exports une seule base, et le stockage une seule
  implémentation par opération. Au passage, le graphique ventilé du tableau de bord s'anime
  comme le graphique simple, et l'ajout d'un client résiste au double clic.

### v1.8

- Interface entièrement utilisable au clavier et au lecteur d'écran : le tri des colonnes
  s'active à la touche et annonce son sens, chaque boîte de dialogue porte son titre, le
  focus revient à son bouton d'origine à la fermeture, l'auto-complétion annonce la
  suggestion surlignée, et les bulles d'aide, jusque-là réservées au survol, se lisent au
  clic comme au lecteur d'écran.
- Graphique du chiffre d'affaires doublé d'un tableau de chiffres repliable : les montants
  mensuels n'étaient lisibles qu'au survol des barres.
- Couleurs revues pour la lisibilité : les teintes vives restent aux jauges et aux
  graphiques, une variante plus soutenue porte le texte. Les avertissements, les anomalies
  de numérotation et les conclusions de contrôle, précisément ce qu'il faut lire, passaient
  sous le seuil de contraste, tout comme le libellé du bouton principal en thème sombre.
- Suppression vraiment annulable : la notification porte un bouton « Annuler la
  suppression », là où seul Ctrl+Z, invisible et perdu au moindre rechargement, était
  proposé.
- Suppression groupée fiabilisée : si une ligne résiste, ce qui a déjà été supprimé reste
  récupérable, et le message dit combien de lignes sur combien sont parties. La barre de
  sélection rappelle qu'elle ne porte que sur les lignes affichées.
- Filtres actifs affichés en puces retirables au-dessus des registres, et résumé
  « 12 recettes sur 340 » quand la liste est filtrée : un sous-total ne se présente plus
  comme le livre entier.
- Résumé des registres plus lisible : le nombre de lignes et le total prennent le poids du
  texte courant.
- Écran de déclaration URSSAF repensé autour de son geste réel : le montant à déclarer
  domine, un bouton le copie sans symbole ni espace, prêt à coller sur le site de l'URSSAF,
  et une activité mixte obtient ses deux montants à reporter case par case. Le bilan se
  recalcule à chaque changement de période ; le bouton « Calculer », devenu inutile, a
  disparu.
- Mise en page assainie : plus aucune boîte encadrée dans une carte, les groupes se
  séparent par l'espace et un filet. Les espacements suivent une échelle déclarée au lieu
  de vingt-six valeurs improvisées.
- Menus déroulants dessinés dans le style de l'application, au lieu du chevron du système.
- Thème : au premier lancement, l'application suit le réglage clair ou sombre de la
  machine, et la barre du navigateur s'accorde au thème.
- Détails : un seul bandeau global à la fois, qui ne repousse plus le titre de la page ;
  page d'erreur munie d'un bouton pour recharger ; bouton d'enregistrement verrouillé
  pendant l'écriture, contre les doublons créés au double clic ; montant illisible signalé
  dès la sortie du champ ; identifiant d'entreprise introuvable hors connexion signalé sur le
  champ au lieu d'interrompre l'enregistrement ; « CA d'août » au lieu de « CA de août ».

### v1.7

- Montants arrondis à l'euro, selon la règle de l'URSSAF : en dessous de 0,50 € les
  centimes s'effacent, à partir de 0,50 € ils passent à l'euro suivant. L'écran de
  déclaration annonce le chiffre d'affaires entier à reporter, et rappelle en dessous le
  montant réellement encaissé.
- Cotisations estimées sur cette base arrondie, et non plus sur les centimes, dans l'ordre
  de l'URSSAF : la base d'abord, puis le taux, puis l'arrondi du résultat. Sur 1 111,49 € au
  taux de 25,6 %, l'estimation annonçait 285 € là où 284 € sont dus.
- L'écran URSSAF s'ouvre sur la dernière période échue, celle qu'il faut justement
  déclarer, au lieu du mois en cours qui n'est pas terminé. La périodicité choisie dans les
  paramètres décide, et l'année suit quand la période appartient à l'exercice précédent.
- Site de présentation du projet, publié sur GitHub Pages : ce que fait l'application,
  comment la télécharger, les obligations couvertes par les deux registres, et les questions
  les plus fréquentes.

### v1.6

- Graphique du chiffre d'affaires mensuel ventilé : en activité mixte, une seule barre par
  mois empile ventes et prestations (et le non catégorisé s'il y en a), au lieu de trois
  graphiques qui se partageaient l'écran. La composition d'un mois se lit d'un coup d'œil,
  détail au survol.
- Couleurs unifiées : le bleu désigne toujours une vente, le vert une prestation, des badges
  du tableau aux jauges, au graphique et au rapport annuel.
- Seuil majoré de la franchise de TVA rendu visible : les jauges se graduent jusqu'à lui, un
  repère marque le seuil de base, et la zone de tolérance entre les deux se voit au lieu
  d'être seulement décrite.
- Registres distingués d'un coup d'œil : une pastille colorée devant chaque titre, bleue pour
  les recettes, violette pour les achats.
- Écrans étroits : sous une certaine largeur, les deux registres passent en cartes empilées,
  une par ligne, plutôt qu'en colonnes illisibles.
- Lecture : le montant ressort davantage dans les tableaux, et les tuiles à zéro s'effacent
  derrière les chiffres qui comptent.
- Barème des seuils reconduit au-delà de sa dernière période connue : l'application reste
  utilisable l'année où la loi change, en attendant la mise à jour qui apporte le nouveau
  barème, plutôt que d'afficher un écran vide.
- Vérification avant export accélérée : sur un registre de plusieurs milliers de lignes, la
  recherche de doublons ne fige plus l'écran.

### v1.5

- Rapport annuel de gestion en PDF pour le dirigeant : chiffre d'affaires et répartition,
  panier moyen, évolution mois par mois en graphique, moyens de paiement, clients de l'année
  et meilleurs d'entre eux, comparaison avec l'année précédente, puis le détail de chaque
  encaissement. Les deux registres légaux ne changent pas.
- Vérification avant chaque export des points qu'un contrôleur regarderait (mentions
  obligatoires, continuité de la numérotation, doublons). Elle informe, sans bloquer le
  téléchargement.
- Intitulés plus précis : le type d'activité distingue l'activité libérale (BNC) des
  prestations commerciales ou artisanales (BIC), et rappelle la catégorie fiscale et
  l'abattement forfaitaire qui s'y attachent.
- Suivi des seuils réorganisé en deux blocs, qui disent chacun sur quel montant ils portent.
  Les deux réglementations se franchissent indépendamment : on peut rester en micro tout en
  devenant redevable de la TVA, et l'écran le dit. Le dépassement du seuil de base de TVA se
  distingue de celui du seuil majoré, aux conséquences différentes.
- Estimation des cotisations sociales sur l'écran URSSAF : à côté du chiffre d'affaires à
  déclarer, ce qui sera prélevé au taux de l'activité, avec la base et le taux dans le
  détail. Une activité mixte calcule chaque part au sien ; ce qui n'est pas catégorisé est
  signalé plutôt que compté au hasard.
- Les professions libérales affiliées à la CIPAV se distinguent des autres, leurs taux de
  cotisations différant. Une activité mixte précise aussi la nature de ses prestations
  (commerciales ou artisanales, libérales, libérales CIPAV) : les plafonds sont les mêmes,
  pas la catégorie fiscale ni le taux de cotisations.
- Montants légaux sortis du code et regroupés dans un barème daté
  (`src/partage/bareme-seuils.js`) : après une loi de finances, mettre les seuils à jour ne
  demande plus que d'y ajouter un bloc. Les exercices passés gardent les seuils de leur
  époque, et une année sans barème connu est signalée plutôt que mesurée avec de faux
  montants.
- Taux de cotisations bornés au jour près, et non à l'année : un relèvement au 1er juillet
  se déclare tel quel. Chaque encaissement cotise au taux en vigueur le jour où il a été
  encaissé, si bien qu'une période qui enjambe un changement se répartit toute seule, une
  ligne par taux, avec sa date d'entrée en vigueur.

### v1.4

- Import CSV du registre des achats, sur le modèle de celui des recettes (correspondance des
  colonnes, détection des doublons, rapport avant import).
- Total des achats de l'année sur le tableau de bord, à côté du chiffre d'affaires.
- Jeu de démonstration : un livre fictif à charger en un clic pour découvrir l'application,
  effaçable d'un clic, jamais mêlé aux vraies données.
- Mises à jour vérifiées par empreinte SHA-256 : le fichier téléchargé est contrôlé
  localement, sans service tiers, avant de remplacer l'application.
- Total de la sélection multiple affiché dans les deux registres.
- Filtres et tri conservés le temps de la session (en mémoire, rien n'est écrit dans le
  navigateur).
- Chemins des données et des sauvegardes copiables d'un clic, et avertissement quand une
  sauvegarde n'a pas pu être écrite.
- Lien vers les nouveautés dans le bandeau de mise à jour.
- Date en toutes lettres (« 28 mai 2026 ») sous chaque champ date, sans changer la saisie.
- Squelettes de chargement (blocs qui miroitent) et micro-animations (compteurs, jauges,
  barres du graphique).
- Vérification de bout en bout intégrée (`npm run verifier`).

### v1.3

- Registre des achats : date du règlement, fournisseur, référence de la facture ou du
  justificatif, mode de paiement et montant, avec exports PDF, Excel et CSV. Les deux
  registres exigibles en cas de contrôle sont désormais couverts.
- Exécutable autonome : un fichier à télécharger et à lancer, sans Node.js, sans
  installation ni fenêtre de console.
- Mise à jour en un clic : l'application annonce les nouvelles versions publiées, les
  installe et redémarre. Vérification désactivable.
- Activités mixtes : colonne Catégorie dans les recettes, chiffre d'affaires du mois et de
  l'année par activité, et un graphique par activité.
- Données rangées dans « Documents / Livre des recettes » : l'exécutable ne laisse plus rien
  à côté de lui, et les paramètres indiquent les chemins exacts du fichier de données et des
  sauvegardes.
- Sauvegardes déplacées hors du dossier de données, avec une copie de secours tenue à jour à
  chaque saisie : supprimer ce dossier ne fait plus rien perdre, l'application le détecte et
  propose de tout reconstituer.

### v1.2

- Exports ventilés pour les activités mixtes : colonne Catégorie et sous-totaux « dont
  ventes / dont prestations » sous chaque total.
- Sélection multiple dans les recettes : suppression et reclassement groupés (annulables),
  filtre « non catégorisées ».
- Vérification de la clé de contrôle des SIREN et SIRET : les fautes de frappe sont
  détectées avant tout appel à l'annuaire.
- Suggestion du prochain numéro de facture, dans la série de l'utilisateur.
- Rappel de déclaration URSSAF sur le tableau de bord, selon la périodicité choisie.
- Première utilisation guidée : l'application s'ouvre sur les paramètres.
- Garde-fou avant d'abandonner un formulaire de recette.
- Sauvegardes conservées un an (quotidiennes 14 jours, puis hebdomadaires 2 mois, puis
  mensuelles), et verrou contre les doubles lancements.
- Recettes chargées en une seule requête, affichage progressif au-delà de 200 lignes.

### v1.1

- Suivi des seuils sur le tableau de bord (plafond micro-entrepreneur et franchise en base
  de TVA), selon le type d'activité (ventes, prestations, mixte), à titre informatif.
- Distinction ventes / prestations par recette pour les activités mixtes : bilan URSSAF
  ventilé et seuils propres à la part prestations.
- Graphique du chiffre d'affaires mensuel, et tableau de bord consultable année par année.
- Vérification de la numérotation des factures : doublons et numéros manquants, quelle que
  soit la convention de numérotation.
- Modes de règlement personnalisables (ajout, renommage, suppression).
- Avertissement non bloquant quand une recette ressemble beaucoup à une autre, pour éviter
  les doublons.
- Auto-complétion des libellés, saisie tolérante du montant, duplication d'une recette en un
  clic pour les paiements récurrents.
- Tri par colonne dans les recettes.
- Options d'interface activables ou désactivables dans les paramètres.
- Sauvegarde automatique avant chaque import CSV, gestion des sauvegardes (liste,
  restauration), vérification d'intégrité au démarrage.
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
- [ ] **Possibilité de choisir dans les paramètres ce qu'on affiche dans le tableau de bord**
- [ ] **Signaler une période déjà déclarée** : rien ne distingue aujourd'hui une recette
      d'un trimestre déclaré à l'URSSAF d'une autre, ni ne prévient avant de la modifier.
- [ ] **Projection de fin d'année** : « à ce rythme, vous finissez l'année à X, soit Y % de
      votre plafond », à partir des chiffres déjà calculés.

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

Une idée ? Ouvrez une issue : la roadmap évolue avec les besoins réels des utilisateurs.
