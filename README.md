# Livre des recettes

> Le livre des recettes des micro-entrepreneurs français, sans tableur : une application
> **100 % locale**, légère, qui fait une seule chose et la fait bien.

![Licence MIT](https://img.shields.io/badge/licence-MIT-green)
![Node.js ≥ 18](https://img.shields.io/badge/node-%E2%89%A5%2018-brightgreen)
![100 % local](https://img.shields.io/badge/donn%C3%A9es-100%25%20locales-blue)

**[Télécharger l'application](https://github.com/RDSV01/livre-des-recettes/releases/latest)**

Un micro-entrepreneur doit tenir un livre des recettes, le registre chronologique de ses
encaissements, et, s'il vend des marchandises, un registre des achats. Cette application
tient les deux : saisie guidée, totaux automatiques, exports conformes, et vos données
restent sur votre ordinateur. Ce n'est ni un logiciel de comptabilité, ni de facturation,
ni de télédéclaration.

## Aperçu

![Tableau de bord](docs/captures/tableau-de-bord.png)

![Liste des recettes](docs/captures/recettes.png)

![Registre des achats](docs/captures/achats.png)

## Fonctionnalités

- **Livre des recettes** : les six colonnes du registre légal, lues mois par mois avec
  sous-totaux, recherche, filtres et tri. Saisie assistée (client retrouvé par son nom ou
  son SIRET, prochain numéro de facture suggéré, recette en double signalée) et facture PDF
  jointe à chaque ligne. La numérotation des factures est surveillée (doublons, numéros
  manquants), et toute suppression s'annule.
- **Registre des achats** : les cinq colonnes légales, avec les mêmes aides et les
  justificatifs en PDF.
- **Clients** : le nom exact d'un professionnel vient de l'annuaire public des entreprises ;
  chaque fiche montre le chiffre d'affaires et les encaissements du client.
- **Tableau de bord** : chiffre d'affaires de l'année et du mois, graphique mensuel,
  déclaration URSSAF à faire, suivi du plafond micro-entrepreneur et de la franchise de TVA.
- **Déclaration URSSAF** : le montant à déclarer pour chaque mois ou trimestre, la date
  limite, et l'estimation de ce qui sera prélevé (cotisations, formation professionnelle,
  versement libératoire, ACRE). Un calcul local, sans connexion à l'URSSAF.
- **Activité mixte** : ventes et prestations distinguées partout, jusque dans les exports.
- **Exports** des deux registres en PDF, Excel et CSV, avec en option les PDF joints dans une
  archive .zip. Une vérification passe en revue chaque export. Rapport annuel de gestion en
  PDF.
- **Import CSV** d'un historique tenu sous Excel, avec détection des doublons.
- **Accueil guidé** au premier lancement, et jeu de démonstration pour découvrir.

## Installation

**L'exécutable** : téléchargez celui de votre système sur la
[page des versions](https://github.com/RDSV01/livre-des-recettes/releases) et lancez-le.
L'application s'ouvre dans votre navigateur, sans rien installer. Le fichier n'est pas signé :
au premier lancement, cliquez sur « Informations complémentaires » puis « Exécuter quand
même » sous Windows, ou faites un clic droit puis « Ouvrir » sur Mac.

**Depuis les sources**, avec [Node.js](https://nodejs.org) 18 ou plus récent :

```bash
git clone https://github.com/RDSV01/livre-des-recettes.git
cd livre-des-recettes
npm install
npm start
```

L'application s'ouvre sur `http://localhost:3000`, accessible uniquement depuis votre
machine.

## Vos données

- **Un seul fichier lisible**, `Documents/Livre des recettes/livre-des-recettes.json`, et
  les PDF joints dans le dossier `pieces`, à côté. Rien n'est gardé dans le navigateur : vous
  pouvez en changer sans rien perdre. Chaque écriture est atomique : une coupure de courant
  n'abîme pas le fichier.
- **Des sauvegardes automatiques**, rangées ailleurs : une copie de secours à chaque saisie,
  puis des sauvegardes quotidiennes, hebdomadaires et mensuelles sur un an, vérifiées au
  démarrage. Un fichier supprimé ou abîmé se reconstitue en un clic.
- **Une copie sur clé USB ou disque externe**, si vous en choisissez un : elle se refait
  seule à chaque changement, quand le support est branché.
- **Des archives annuelles** : chaque année close est figée avec ses registres et ses PDF, et
  gardée 10 ans.
- **Changer d'ordinateur** : « Sauvegarder maintenant » sur l'ancien, puis « Reprendre une
  sauvegarde » sur le nouveau.

## Vie privée

L'application fonctionne hors ligne. Deux fonctions seulement contactent l'extérieur, sans
envoyer vos données : la recherche d'une entreprise par SIRET, quand vous la lancez
([recherche-entreprises.api.gouv.fr](https://recherche-entreprises.api.gouv.fr)), et la
recherche d'une nouvelle version sur GitHub, désactivable dans les paramètres. Une mise à
jour est vérifiée par son empreinte SHA-256 avant d'être installée.

## Configuration

| Variable d'environnement | Rôle                                               | Défaut                         |
| ------------------------ | -------------------------------------------------- | ------------------------------ |
| `PORT`                   | Premier port d'écoute local essayé                 | `3000`                         |
| `LDR_DATA_DIR`           | Dossier des données                                | `Documents/Livre des recettes` |
| `LDR_NO_OPEN`            | Si définie, n'ouvre pas le navigateur au démarrage | (aucun)                        |

`LDR_DATA_DIR` permet par exemple de ranger le livre dans un dossier synchronisé (Nextcloud,
Dropbox…) pour le retrouver sur un autre ordinateur.

## Cadre légal (en bref)

Le livre des recettes présente, dans l'ordre chronologique des encaissements, le montant et
l'origine de chaque recette, le mode de règlement et la référence de la facture. Le registre
des achats présente, dans l'ordre des règlements, la date, le fournisseur, la référence de
la pièce, le mode de paiement et le montant. Livres et justificatifs se conservent 10 ans.

> Cet outil vous aide à tenir votre livre des recettes. Ce n'est ni un conseil comptable ou
> juridique, ni un logiciel de caisse certifié. En cas de doute sur vos obligations ou sur
> les seuils en vigueur, adressez-vous à l'URSSAF ou à un expert-comptable.

## Développement

Node.js et Express côté serveur, JavaScript sans framework ni étape de build côté
navigateur, données en JSON. Trois dépendances : `express`, `exceljs`, `pdfkit`.
L'architecture est décrite dans [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
npm run essai          # l'application sur un livre vide et temporaire, sans toucher au vrai
npm test               # tests unitaires et de l'API
npm run verifier       # parcours de bout en bout de l'application assemblée
npm run construire:exe # exécutable autonome dans dist/
```

## Crédits

Icônes [Lucide](https://lucide.dev) (licence ISC), intégrées dans `public/js/icones.js`.
Police [Commissioner](https://github.com/kosbarts/Commissioner) (SIL Open Font License 1.1),
livrée dans `public/polices`.

## Contribuer, roadmap, licence

Les contributions sont bienvenues dans le périmètre du projet : lisez
[CONTRIBUTING.md](CONTRIBUTING.md) avant d'ouvrir une issue. Ce qui a été fait et ce qui est
envisagé : [ROADMAP.md](ROADMAP.md). Licence [MIT](LICENSE).
