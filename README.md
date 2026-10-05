# Livre des recettes

Le livre des recettes et le registre des achats des micro-entrepreneurs français, tenus sur
votre ordinateur en local, sans tableur.

![Licence non commerciale](https://img.shields.io/badge/licence-PolyForm%20Noncommercial-orange)
![Node.js ≥ 22.12](https://img.shields.io/badge/node-%E2%89%A5%2022.12-brightgreen)
![100 % local](https://img.shields.io/badge/donn%C3%A9es-100%25%20locales-blue)

**[Télécharger l'application](https://github.com/RDSV01/livre-des-recettes/releases/latest)**

Saisie guidée, totaux automatiques, exports conformes, et vos données restent chez vous.

![Tableau de bord](docs/captures/tableau-de-bord.png)

![Liste des recettes](docs/captures/recettes.png)

![Registre des achats](docs/captures/achats.png)

## Fonctionnalités

- Livre des recettes aux six colonnes légales, lu mois par mois avec sous-totaux, recherche,
  filtres et tri. À la saisie : client retrouvé par son nom ou son SIRET, mode de règlement
  repris, numéro de facture suivant proposé, doublon signalé, saisie en série, facture PDF
  jointe. La numérotation des factures est surveillée.
- Registre des achats aux cinq colonnes légales, avec les justificatifs en PDF.
- Fiche de chaque client, avec son chiffre d'affaires et ses encaissements.
- Tableau de bord : chiffre d'affaires de l'année et du mois, graphique comparé à l'année
  précédente, déclaration URSSAF à faire, plafond micro-entrepreneur et franchise de TVA,
  recettes mensuelles à renouveler.
- Déclaration URSSAF : montant à déclarer par mois ou par trimestre, échéance, estimation des
  prélèvements (cotisations, formation professionnelle, versement libératoire, ACRE).
- Activité mixte : ventes et prestations distinguées partout, exports compris.
- Exports des registres en PDF, Excel et CSV, contrôlés avant téléchargement, avec en option
  les PDF joints dans un .zip. Rapport annuel de gestion en PDF.
- Import d'un historique en CSV, doublons détectés.
- Recherche dans tout le livre (Ctrl+K) et raccourcis clavier (N, A, /, ?).
- Accueil guidé au premier lancement, jeu de démonstration sur deux années.

## Installation

Téléchargez l'exécutable de votre système sur la
[page des versions](https://github.com/RDSV01/livre-des-recettes/releases) et lancez-le :
l'application s'ouvre dans votre navigateur. Le fichier n'est pas signé (le certificat est payant).

- Windows : « Informations complémentaires », puis « Exécuter quand même ».
- macOS et Linux : rendez le fichier exécutable (`chmod +x`). Sur Mac, autorisez-le ensuite
  dans Réglages Système, Confidentialité et sécurité, « Ouvrir quand même ».

Depuis les sources, avec [Node.js](https://nodejs.org) 22.12 ou plus :

```bash
git clone https://github.com/RDSV01/livre-des-recettes.git
cd livre-des-recettes
npm install
npm start
```

L'application s'ouvre sur `http://localhost:3000` (ou le port libre suivant), accessible
seulement depuis votre machine.

## Vos données

- Un seul fichier lisible, `Documents/Livre des recettes/livre-des-recettes.json`, et les PDF
  joints dans le dossier `pieces`, à côté. Chaque écriture est atomique : une coupure de
  courant n'abîme pas le fichier. Le navigateur ne garde que le choix du thème.
- Des sauvegardes automatiques rangées ailleurs et vérifiées au démarrage : une copie de
  secours à chaque saisie, puis une sauvegarde par jour pendant 14 jours, par semaine pendant
  2 mois, par mois pendant un an. Un fichier abîmé ou supprimé se restaure en un clic.
- Une copie sur clé USB ou disque externe si vous en choisissez un, refaite à chaque
  changement quand le support est branché.
- Une archive de chaque année close, avec ses registres et ses PDF, jamais effacée (la loi
  demande 10 ans).
- Pour changer d'ordinateur : « Sauvegarder maintenant » sur l'ancien, « Reprendre une
  sauvegarde » sur le nouveau.

Tout fonctionne hors ligne. Deux fonctions seulement contactent l'extérieur : la recherche
d'une entreprise par SIRET quand vous la lancez (seul le numéro cherché est envoyé, à
[recherche-entreprises.api.gouv.fr](https://recherche-entreprises.api.gouv.fr)), et la
vérification des nouvelles versions sur GitHub, désactivable. Une mise à jour est contrôlée
par son empreinte SHA-256 avant d'être installée.

| Variable d'environnement | Rôle                                               | Défaut                         |
| ------------------------ | -------------------------------------------------- | ------------------------------ |
| `PORT`                   | Premier port d'écoute essayé                       | `3000`                         |
| `LDR_DATA_DIR`           | Dossier des données (un dossier synchronisé, etc.) | `Documents/Livre des recettes` |
| `LDR_NO_OPEN`            | Si elle existe, le navigateur ne s'ouvre pas       | (aucun)                        |

## Cadre légal

Le livre des recettes liste, dans l'ordre des encaissements, le montant et l'origine de chaque
recette, son mode de règlement et la référence de la facture. Le registre des achats liste,
dans l'ordre des règlements, la date, le fournisseur, la référence de la pièce, le mode de
paiement et le montant. Registres et justificatifs se conservent 10 ans.

> Ce n'est ni un logiciel de comptabilité, de facturation ou de télédéclaration, ni un conseil
> comptable ou juridique, ni un logiciel de caisse certifié. En cas de doute sur vos
> obligations ou les seuils en vigueur, adressez-vous à l'URSSAF ou à un expert-comptable.

## Développement

Node.js et Express côté serveur, JavaScript sans framework ni étape de build dans le
navigateur, données en JSON, trois dépendances (`express`, `exceljs`, `pdfkit`). `npm test`
vérifie tout. Architecture, tests et conventions : [CONTRIBUTING.md](CONTRIBUTING.md).
Ce qui est fait et prévu : [ROADMAP.md](ROADMAP.md).

## Crédits

Icônes [Lucide](https://lucide.dev) (licence ISC), police
[Commissioner](https://github.com/kosbarts/Commissioner) (SIL Open Font License 1.1), coches
animées de [Rare UI](https://rareui.com) (© Swami Malode, reprises avec son accord), d'autres
animations inspirées de [React Bits](https://reactbits.dev). L'exécutable embarque Node.js et
des modules npm, chacun sous sa licence : leurs textes y sont joints (adresse `/licences.txt`).

## Licence

L'application est gratuite et son code est ouvert. Elle est distribuée sous la licence
[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0), avec
une permission en plus pour les entrepreneurs. En clair :

- vous pouvez l'utiliser, y compris pour tenir les registres de votre propre activité ;
- vous pouvez la modifier, la partager gratuitement et contribuer au projet ;
- vous ne pouvez pas la vendre, la louer, la proposer à d'autres comme service, ni reprendre
  son code dans un produit ou un service commercial.

Le texte de [LICENSE](LICENSE) fait foi. Si l'application vous rend service, vous pouvez
[offrir un café à son auteur](https://buymeacoffee.com/rdsv01).
