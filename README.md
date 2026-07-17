# Livre des recettes

> Le livre des recettes des micro-entrepreneurs français, sans tableur et sans prise de tête :
> une application **100 % locale**, ultra légère, qui fait une seule chose et la fait bien.

![Licence MIT](https://img.shields.io/badge/licence-MIT-green)
![Node.js ≥ 18](https://img.shields.io/badge/node-%E2%89%A5%2018-brightgreen)
![100 % local](https://img.shields.io/badge/donn%C3%A9es-100%25%20locales-blue)

En tant que micro-entrepreneur, vous devez tenir un **livre des recettes** : le registre
chronologique de tous vos encaissements, présentable en cas de contrôle. Beaucoup le
tiennent dans Excel, cette application fait la même chose, en plus simple et plus sûr :
saisie guidée, totaux automatiques, exports conformes, et vos données restent en local.

**Ce que ce projet n'est pas** : un logiciel de comptabilité, de facturation ou de
télédéclaration.

## Aperçu

![Tableau de bord](docs/captures/tableau-de-bord.png)

![Liste des recettes](docs/captures/recettes.png)

## Fonctionnalités

### Le livre des recettes

- **Saisie des recettes** : six colonnes du registre légal : date d'encaissement,
  client, libellé, numéro de facture, montant et mode de règlement (CB, virement, espèces,
  chèque, PayPal, Stripe, autre, et vos modes de paiement personnalisés). Ajout, modification,
  suppression.
- **Saisie assistée** : auto-complétion des libellés déjà utilisés, suggestion du prochain
  numéro de facture, duplication d'une recette en un clic pour les paiements récurrents,
  et avertissement non bloquant si une recette très similaire existe déjà pour éviter les doublons.
- **Carnet de clients** : créez vos clients une fois, puis choisissez-les à la saisie d'une
  recette pour éviter les fautes de frappe. Un client professionnel peut être retrouvé automatiquement par
  son **SIREN ou SIRET** grâce à l'annuaire public des entreprises connecté à ce projet (le nom exact est récupéré pour vous directement). Pour les clients de type particulier, un simple nom de client suffit. La liste affiche le nombre de recettes et le chiffre d'affaires par client.
- **Tableau principal** : tri par colonne, sélection multiple (suppression ou reclassement groupé), recherche libre (client, libellé, facture, montant), filtres par année, mois, mode de règlement et catégorie.
- **Numérotation des factures surveillée** : les doublons et les numéros manquants sont
  signalés, quelle que soit votre convention (« F001 », « FAC2026-001 »,
  « A-2026-0007 »…), sans jamais rien bloquer.

### Pilotage

- **Tableau de bord** : CA du mois, CA de l'année, nombre d'encaissements, moyenne par
  encaissement, **graphique du CA mensuel** et dernières recettes. Un sélecteur permet de sélectionner les années précédentes.
- **Suivi des seuils** : selon votre type d'activité (ventes, prestations ou mixte), le
  tableau de bord suit votre progression vers le **plafond micro-entrepreneur** et le
  **seuil de franchise en base de TVA** : montant restant, pourcentage atteint, et un
  avertissement à l'approche du seuil.
- **Activité mixte** : chaque recette est classée vente ou prestation, le suivi des seuils
  surveille aussi la part « prestations » (qui a ses propres plafonds), le bilan URSSAF
  ventile le chiffre d'affaires entre les deux, comme la déclaration le demande, et les
  exports distinguent aussi les deux (colonne Catégorie et sous-totaux « dont ventes /
  dont prestations »).
- **Déclaration URSSAF** : choisissez une année puis un mois, un trimestre ou l'année entière,
  l'application calcule le chiffre d'affaires encaissé et le nombre d'encaissements de la période.
  Un rappel s'affiche sur le tableau de bord quand une période à déclarer s'achève.
  _Aucune connexion à l'URSSAF : c'est un simple calcul local._

### Échanges et sécurité des données

- **Exports conformes** en **PDF**, **Excel (.xlsx)** et **CSV**, avec les colonnes du
  registre légal et les **totaux mensuels et annuel** ajoutés automatiquement.
- **Import CSV** : glissez-déposez votre historique Excel, correspondance des colonnes
  assistée, détection des doublons, rapport d'analyse avant tout import, et **sauvegarde automatique juste avant** pour pouvoir revenir en arrière.
- **Sauvegardes gérables** : liste des sauvegardes automatiques (quotidiennes, avant import,
  avant restauration) dans les paramètres, avec restauration en un clic. Au démarrage,
  l'intégrité du fichier de données est vérifiée, s'il est illisible, l'application propose
  de restaurer la dernière sauvegarde valide, sans jamais rien écraser.
- **Paramètres** : identité de l'entreprise (reprise en tête des exports), type d'activité,
  périodicité de déclaration, devise, format de date, modes de règlement personnalisés, et
  des options pour activer ou désactiver chaque aide à la saisie.

## Installation

**Prérequis** : [Node.js](https://nodejs.org) 18 ou plus récent (LTS recommandée).
C'est tout : aucune base de données, aucun compte, aucune compilation.

```bash
git clone https://github.com/RDSV01/livre-des-recettes.git
cd livre-des-recettes
npm install
npm start
```

L'application s'ouvre sur `http://localhost:3000` (uniquement accessible depuis
votre machine). Sous Windows, un double-clic sur `start.bat` fait tout ; sous
macOS / Linux, `./start.sh`.

> Pas de compte GitHub ? Téléchargez le ZIP du projet (bouton « Code » puis « Download ZIP »),
> décompressez-le, puis lancez `start.bat` (Windows) ou `./start.sh` (Linux, Mac).

## Vos données : rien ne se perd

C'est l'engagement central du projet :

- **Tout tient dans un seul fichier** lisible : `data/livre-des-recettes.json` (recettes,
  clients et paramètres). Pas de base de données cachée, pas de stockage dans le navigateur :
  vous pouvez changer de navigateur (Firefox, Chrome, Edge…) sans rien perdre.
- **Sauvegarde quotidienne automatique** dans `data/sauvegardes/` : tout est conservé
  14 jours, puis une sauvegarde par semaine pendant 2 mois, puis une par mois pendant 1 an.
  Écriture « atomique » : une coupure de courant ne corrompt jamais le fichier.
- **Une seule instance à la fois** : un verrou empêche deux lancements simultanés (deux
  fenêtres, ou deux ordinateurs partageant un dossier synchronisé) de s'écraser mutuellement.
- **Changer d'ordinateur** = copier le dossier `data/` sur le nouveau poste. C'est tout.
- **Dossier synchronisé** (Nextcloud, Drive, Dropbox…) : pointez la variable `LDR_DATA_DIR`
  vers votre dossier synchronisé (voir Configuration), et vos données vous suivent.
- **Copie manuelle à tout moment** : Paramètres puis « Télécharger une copie de mes
  données (JSON) ». Pour restaurer, remplacez `data/livre-des-recettes.json` par
  cette copie.

## Vie privée et connexion Internet

L'application fonctionne intégralement hors ligne. **Un seul** point contacte l'extérieur,
et seulement quand vous le déclenchez vous-même : la **recherche d'un client par SIRET**,
qui interroge l'API publique et gratuite [recherche-entreprises.api.gouv.fr](https://recherche-entreprises.api.gouv.fr)
pour récupérer le nom exact de l'entreprise. Aucune clé API, aucun compte, et vous pouvez
toujours saisir le nom d'un client manuellement sans jamais utiliser cette recherche (client particulier par exemple).

## Configuration

| Variable d'environnement | Rôle                                               | Défaut   |
| ------------------------ | -------------------------------------------------- | -------- |
| `PORT`                   | Port d'écoute local                                | `3000`   |
| `LDR_DATA_DIR`           | Dossier des données                                | `./data` |
| `LDR_NO_OPEN`            | Si définie, n'ouvre pas le navigateur au démarrage | (aucun)  |

## Cadre légal (en bref)

Les micro-entrepreneurs doivent tenir un livre des recettes présentant, dans l'ordre
chronologique des encaissements : le montant et l'origine des recettes (client), le mode
de règlement et les références des pièces justificatives (numéro des factures). Les exports de
l'application suivent ces colonnes. Conservez vos livres et justificatifs pendant 10 ans.

> Cet outil vous aide à **tenir** votre livre des recettes, il ne constitue ni un
> conseil comptable ou juridique, ni un logiciel de caisse certifié. En cas de doute
> sur vos obligations ou sur les seuils en vigueur, rapprochez-vous de l'URSSAF ou
> d'un expert-comptable.

## Développement

Stack volontairement minimale : **Node.js + Express** côté serveur, **HTML / CSS / JS
vanilla** côté navigateur (aucun framework, aucune étape de build), données en JSON.
Trois dépendances : `express`, `exceljs`, `pdfkit`.

```text
server.js              Point d'entrée (npm start)
src/
  app.js               Assemblage Express
  stockage.js          Persistance JSON (écriture atomique, sauvegardes, intégrité)
  validation.js        Validation des recettes, clients et paramètres
  totaux.js            Calculs (totaux, CA mensuel, tableau de bord, bilan URSSAF)
  entreprises.js       Recherche d'entreprise par SIREN / SIRET (API publique)
  verrou.js            Verrou d'instance (un seul lancement à la fois)
  partage/             Modules communs serveur + navigateur (servis sous /partage) :
                       constantes, dates, montants, texte, doublons, seuils, factures, filtres
  routes/              API REST (recettes, clients, exports, urssaf, sauvegardes, parametres)
  exports/             Générateurs PDF, Excel, CSV du registre
public/                Interface (index.html, css, js/vues, icônes, historique)
tests/                 Tests node:test (npm test)
```

```bash
npm test   # 109 tests : unités + API en conditions réelles
```

## Crédits

Icônes : [Lucide](https://lucide.dev), sous licence ISC, dont les tracés sont intégrés
directement dans `public/js/icones.js` (aucune ressource chargée depuis Internet).

## Contribuer

Les contributions sont bienvenues, dans le périmètre du projet : lisez
[CONTRIBUTING.md](CONTRIBUTING.md) avant d'ouvrir une issue ou une pull request.

## Roadmap

Les évolutions envisagées sont dans
[ROADMAP.md](ROADMAP.md).

## Licence

[MIT](LICENSE) : utilisez, copiez, modifiez librement.
