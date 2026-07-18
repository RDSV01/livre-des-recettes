/**
 * Export CSV d'un registre (recettes ou achats).
 *
 * Conventions choisies pour une ouverture directe dans un tableur français :
 *  - séparateur « ; » et décimales à virgule ;
 *  - encodage UTF-8 avec BOM (sinon Excel affiche mal les accents) ;
 *  - fins de ligne CRLF.
 */

const SEPARATEUR = ';';
const FIN_DE_LIGNE = '\r\n';

/**
 * Un tableur lit une cellule commençant par `=`, `+`, `-` ou `@` comme une
 * formule et l'exécute à l'ouverture : « = 1+1 » afficherait 2, et un libellé
 * aussi banal que « - Acompte » afficherait `#NOM?`, le texte étant perdu.
 * Un espace en tête suffit à forcer la lecture en texte.
 *
 * L'espace est préféré à l'apostrophe habituelle pour deux raisons : il ne se
 * voit presque pas dans le tableur, et il disparaît de lui-même si le fichier
 * est réimporté ici, la validation retirant les espaces de bordure. Une
 * apostrophe, elle, resterait collée au libellé.
 *
 * Le fichier Excel (.xlsx) type ses cellules et n'a pas besoin de tout ceci.
 */
const DEBUT_DE_FORMULE = /^[=+\-@\t\r]/;

/** Échappe un champ CSV si nécessaire (guillemets doublés). */
function champ(valeur) {
  const brut = String(valeur ?? '');
  const texte = DEBUT_DE_FORMULE.test(brut) ? ` ${brut}` : brut;
  return /[";\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

/** Montant au format tableur français : `1234,56` (sans séparateur de milliers). */
function montantCsv(montant) {
  return montant.toFixed(2).replace('.', ',');
}

/** Génère le contenu CSV complet (chaîne prête à envoyer ou écrire). */
export function genererCsv(registre, parametres) {
  const { colonnes } = registre;
  const indexMontant = colonnes.findIndex((c) => c.montant);
  const lignes = [colonnes.map((c) => champ(c.titre)).join(SEPARATEUR)];

  for (const ligne of registre.lignes) {
    const cellules = colonnes.map((colonne, i) => {
      if (ligne.type === 'element') {
        return colonne.montant
          ? montantCsv(ligne.element.montant)
          : champ(colonne.valeur(ligne.element, parametres));
      }
      // Total ou ventilation : libellé en première colonne, montant dans la sienne.
      if (i === 0) return champ(ligne.libelle);
      return i === indexMontant ? montantCsv(ligne.montant) : '';
    });
    lignes.push(cellules.join(SEPARATEUR));
  }

  // BOM UTF-8 pour Excel (U+FEFF).
  return '﻿' + lignes.join(FIN_DE_LIGNE) + FIN_DE_LIGNE;
}
