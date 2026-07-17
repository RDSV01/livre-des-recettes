/**
 * Export CSV du registre.
 *
 * Conventions choisies pour une ouverture directe dans un tableur français :
 *  - séparateur « ; » et décimales à virgule ;
 *  - encodage UTF-8 avec BOM (sinon Excel affiche mal les accents) ;
 *  - fins de ligne CRLF.
 */

import { entetesRegistre, libelleCategorieCourt } from './registre.js';
import { formaterDate } from '../partage/dates.js';
import { libelleMode } from '../partage/constantes.js';

const SEPARATEUR = ';';
const FIN_DE_LIGNE = '\r\n';

/** Échappe un champ CSV si nécessaire (guillemets doublés). */
function champ(valeur) {
  const texte = String(valeur ?? '');
  return /[";\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

/** Montant au format tableur français : `1234,56` (sans séparateur de milliers). */
function montantCsv(montant) {
  return montant.toFixed(2).replace('.', ',');
}

/** Génère le contenu CSV complet (chaîne prête à envoyer ou écrire). */
export function genererCsv(registre, parametres) {
  const entetes = entetesRegistre(registre.ventiler);
  const vides = entetes.length - 3; // colonnes après « Montant »
  const lignes = [entetes.map(champ).join(SEPARATEUR)];

  for (const ligne of registre.lignes) {
    if (ligne.type === 'recette') {
      const r = ligne.recette;
      lignes.push([
        champ(formaterDate(r.dateEncaissement, parametres.formatDate)),
        champ(r.client),
        montantCsv(r.montant),
        champ(libelleMode(r.modeReglement, parametres.modesPersonnalises)),
        champ(r.numeroFacture),
        ...(registre.ventiler ? [champ(libelleCategorieCourt(r.categorie))] : []),
        champ(r.libelle)
      ].join(SEPARATEUR));
    } else {
      // Total ou ventilation : libellé en première colonne, montant en troisième.
      lignes.push([champ(ligne.libelle), '', montantCsv(ligne.montant), ...Array(vides).fill('')]
        .join(SEPARATEUR));
    }
  }

  // BOM UTF-8 pour Excel (U+FEFF).
  return '﻿' + lignes.join(FIN_DE_LIGNE) + FIN_DE_LIGNE;
}
