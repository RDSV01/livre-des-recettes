/**
 * Construction d'un registre à exporter (PDF, Excel, CSV).
 *
 * Deux registres légaux partagent ce moteur : le livre des recettes et le
 * registre des achats. Chacun décrit ses colonnes ici, et les trois
 * générateurs se contentent de les dérouler.
 *
 * Un registre légal est chronologique : les lignes sont triées par date
 * CROISSANTE (contrairement aux tableaux de l'application, affichés en ordre
 * décroissant). Un total est inséré après chaque mois, et un total annuel
 * clôt le registre lorsqu'on exporte une année complète.
 *
 * Pour une activité mixte, le livre des recettes est « ventilé » : une
 * colonne Catégorie s'ajoute avant le libellé, et chaque total est suivi de
 * lignes « dont ventes / dont prestations » (la déclaration URSSAF distingue
 * les deux chiffres d'affaires).
 */

import { filtrerParPeriode, totalMontants, parDateAsc } from '../totaux.js';
import { moisDe, nomMois, formaterDate } from '../partage/dates.js';
import { libelleMode, libelleCategorieCourt } from '../partage/constantes.js';

/**
 * Colonnes du livre des recettes, dans l'ordre demandé par l'administration.
 * Les largeurs PDF totalisent 760 pt (A4 paysage moins les marges).
 */
function colonnesRecettes(ventiler) {
  return [
    {
      titre: 'Date de réception du paiement',
      titrePdf: 'Date',
      largeurPdf: 70,
      largeurXlsx: 24,
      valeur: (r, p) => formaterDate(r.dateEncaissement, p.formatDate)
    },
    {
      titre: 'Client',
      largeurPdf: ventiler ? 125 : 145,
      largeurXlsx: 30,
      valeur: (r) => r.client
    },
    {
      titre: 'Montant',
      largeurPdf: ventiler ? 80 : 85,
      largeurXlsx: 14,
      montant: true
    },
    {
      titre: 'Mode de règlement',
      largeurPdf: ventiler ? 95 : 105,
      largeurXlsx: 20,
      valeur: (r, p) => libelleMode(r.modeReglement, p.modesPersonnalises)
    },
    {
      titre: 'Numéro de facture',
      titrePdf: 'N° de facture',
      largeurPdf: ventiler ? 90 : 100,
      largeurXlsx: 20,
      valeur: (r) => r.numeroFacture
    },
    ...(ventiler ? [{
      titre: 'Catégorie',
      largeurPdf: 75,
      largeurXlsx: 14,
      valeur: (r) => libelleCategorieCourt(r.categorie)
    }] : []),
    {
      titre: 'Libellé',
      largeurPdf: ventiler ? 225 : 255,
      largeurXlsx: 45,
      valeur: (r) => r.libelle
    }
  ];
}

/**
 * Colonnes du registre des achats : les cinq mentions exigées, dans l'ordre
 * chronologique du règlement.
 */
function colonnesAchats() {
  return [
    {
      titre: 'Date du règlement',
      titrePdf: 'Date',
      largeurPdf: 80,
      largeurXlsx: 24,
      valeur: (a, p) => formaterDate(a.dateReglement, p.formatDate)
    },
    {
      titre: 'Fournisseur',
      largeurPdf: 240,
      largeurXlsx: 34,
      valeur: (a) => a.fournisseur
    },
    {
      titre: 'Référence de la facture ou du justificatif',
      titrePdf: 'Référence',
      largeurPdf: 180,
      largeurXlsx: 30,
      valeur: (a) => a.referenceFacture
    },
    {
      titre: 'Mode de paiement',
      largeurPdf: 130,
      largeurXlsx: 22,
      valeur: (a, p) => libelleMode(a.modeReglement, p.modesPersonnalises)
    },
    {
      titre: 'Montant de l’achat',
      titrePdf: 'Montant',
      largeurPdf: 130,
      largeurXlsx: 16,
      montant: true
    }
  ];
}

/** Lignes « dont … » insérées sous un total quand le registre est ventilé. */
function ventilation(recettes) {
  const total = (filtre) => totalMontants(recettes.filter(filtre));
  const lignes = [
    { type: 'ventilation', libelle: 'dont ventes de marchandises', montant: total((r) => r.categorie === 'ventes') },
    { type: 'ventilation', libelle: 'dont prestations de services', montant: total((r) => r.categorie === 'prestations') }
  ];
  const nonCategorise = total((r) => !r.categorie);
  if (nonCategorise > 0) {
    lignes.push({ type: 'ventilation', libelle: 'dont non catégorisé', montant: nonCategorise });
  }
  return lignes;
}

/**
 * Construit un registre pour une année, éventuellement limitée à un mois.
 *
 * @returns {object} le registre prêt à exporter :
 *   - `colonnes` : description des colonnes (titres, largeurs, valeurs) ;
 *   - `lignes` : `{ type: 'element', element }`,
 *     `{ type: 'total', libelle, montant }` ou
 *     `{ type: 'ventilation', libelle, montant }` ;
 *   - `titreDocument`, `titrePeriode`, `nomFichier`, `resume`, `messageVide` ;
 *   - `nombre` et `total` de la période.
 */
function construireRegistre(elements, { annee, mois }, modele) {
  const { cleDate, ventiler = false } = modele;
  const selection = filtrerParPeriode(elements, { annee, mois }, cleDate)
    .sort(parDateAsc(cleDate));

  const lignes = [];
  const moisPresents = [...new Set(selection.map((e) => moisDe(e[cleDate])))]
    .sort((a, b) => a - b);

  for (const m of moisPresents) {
    const duMois = selection.filter((e) => moisDe(e[cleDate]) === m);
    for (const element of duMois) {
      lignes.push({ type: 'element', element });
    }
    lignes.push({ type: 'total', libelle: `Total ${nomMois(m)} ${annee}`, montant: totalMontants(duMois) });
    if (ventiler) lignes.push(...ventilation(duMois));
  }

  if (!mois && selection.length > 0) {
    lignes.push({ type: 'total', libelle: `Total année ${annee}`, montant: totalMontants(selection) });
    if (ventiler) lignes.push(...ventilation(selection));
  }

  const nombre = selection.length;
  return {
    titreDocument: modele.titreDocument,
    titrePeriode: titrePeriode({ annee, mois }),
    nomFichier: nomFichierExport(modele.prefixeFichier, { annee, mois }),
    colonnes: modele.colonnes,
    messageVide: modele.messageVide,
    resume: `${nombre} ${modele.nomLigne}${nombre > 1 ? 's' : ''}`,
    lignes,
    nombre,
    total: totalMontants(selection)
  };
}

/** Registre du livre des recettes ; `ventiler` pour une activité mixte. */
export function registreRecettes(recettes, periode, { ventiler = false } = {}) {
  return construireRegistre(recettes, periode, {
    cleDate: 'dateEncaissement',
    ventiler,
    colonnes: colonnesRecettes(ventiler),
    titreDocument: 'Livre des recettes',
    prefixeFichier: 'livre-recettes',
    nomLigne: 'encaissement',
    messageVide: 'Aucune recette sur la période.'
  });
}

/** Registre des achats (obligatoire pour les activités d'achat / revente). */
export function registreAchats(achats, periode) {
  return construireRegistre(achats, periode, {
    cleDate: 'dateReglement',
    colonnes: colonnesAchats(),
    titreDocument: 'Registre des achats',
    prefixeFichier: 'registre-achats',
    nomLigne: 'achat',
    messageVide: 'Aucun achat sur la période.'
  });
}

/** Titre humain d'une période : « Année 2026 » ou « Juillet 2026 ». */
function titrePeriode({ annee, mois }) {
  if (!mois) return `Année ${annee}`;
  const nom = nomMois(mois);
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${annee}`;
}

/** Nom de fichier sans accent : `livre-recettes-2026` ou `registre-achats-2026-07`. */
function nomFichierExport(prefixe, { annee, mois }) {
  return mois ? `${prefixe}-${annee}-${String(mois).padStart(2, '0')}` : `${prefixe}-${annee}`;
}
