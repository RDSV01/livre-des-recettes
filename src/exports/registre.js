/**
 * Construction du registre à exporter (PDF, Excel, CSV).
 *
 * Le registre légal est chronologique : les recettes sont triées par date
 * CROISSANTE (contrairement au tableau de l'application, affiché en ordre
 * décroissant). Un total est inséré après chaque mois, et un total annuel
 * clôt le registre lorsqu'on exporte une année complète.
 *
 * Colonnes du registre, dans l'ordre demandé par l'administration :
 * date de réception du paiement, client, montant, mode de règlement,
 * numéro de facture, libellé.
 */

import { filtrerParPeriode, totalRecettes, comparerParDateAsc } from '../totaux.js';
import { moisDe, nomMois } from '../partage/dates.js';

/** En-têtes légaux du registre, communs aux trois formats d'export. */
export const ENTETES_REGISTRE = [
  'Date de réception du paiement',
  'Client',
  'Montant',
  'Mode de règlement',
  'Numéro de facture',
  'Libellé'
];

/**
 * Construit les lignes du registre pour une année, éventuellement limitée
 * à un mois.
 *
 * @returns {{ titre: string, lignes: Array, nombre: number, total: number }}
 *   `lignes` mêle deux formes :
 *   - `{ type: 'recette', recette }`
 *   - `{ type: 'total', libelle, montant, final }` (final = total annuel)
 */
export function construireRegistre(recettes, { annee, mois }) {
  const selection = filtrerParPeriode(recettes, { annee, mois })
    .sort(comparerParDateAsc);

  const lignes = [];
  const moisPresents = [...new Set(selection.map((r) => moisDe(r.dateEncaissement)))]
    .sort((a, b) => a - b);

  for (const m of moisPresents) {
    const duMois = selection.filter((r) => moisDe(r.dateEncaissement) === m);
    for (const recette of duMois) {
      lignes.push({ type: 'recette', recette });
    }
    lignes.push({
      type: 'total',
      libelle: `Total ${nomMois(m)} ${annee}`,
      montant: totalRecettes(duMois),
      final: false
    });
  }

  if (!mois && selection.length > 0) {
    lignes.push({
      type: 'total',
      libelle: `Total année ${annee}`,
      montant: totalRecettes(selection),
      final: true
    });
  }

  return {
    titre: titrePeriode({ annee, mois }),
    lignes,
    nombre: selection.length,
    total: totalRecettes(selection)
  };
}

/** Titre humain d'une période : « Année 2026 » ou « Juillet 2026 ». */
export function titrePeriode({ annee, mois }) {
  if (!mois) return `Année ${annee}`;
  const nom = nomMois(mois);
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${annee}`;
}

/** Nom de fichier sans accent : `livre-recettes-2026` ou `livre-recettes-2026-07`. */
export function nomFichierExport({ annee, mois }) {
  return mois
    ? `livre-recettes-${annee}-${String(mois).padStart(2, '0')}`
    : `livre-recettes-${annee}`;
}
