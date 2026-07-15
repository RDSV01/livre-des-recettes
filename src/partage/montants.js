/**
 * Manipulation des montants.
 *
 * Convention : un montant est stocké en euros (nombre à deux décimales au
 * plus). Toute somme de montants passe par les centimes (entiers) afin
 * d'éviter les erreurs d'arrondi des nombres flottants (0.1 + 0.2 ≠ 0.3).
 *
 * Module partagé serveur / navigateur : aucune dépendance.
 */

/** Convertit un montant en euros vers un entier de centimes. */
export function enCentimes(montant) {
  return Math.round(Number(montant) * 100);
}

/** Convertit un entier de centimes vers un montant en euros. */
export function enEuros(centimes) {
  return centimes / 100;
}

/** Somme une liste de montants en euros, calculée en centimes. */
export function sommeMontants(montants) {
  const total = montants.reduce((acc, m) => acc + enCentimes(m), 0);
  return enEuros(total);
}

/** Formate un montant pour l'affichage : `1 234,56 €`. */
export function formaterMontant(montant, devise = 'EUR') {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise })
    .format(Number(montant) || 0);
}

/** Symbole d'une devise (`EUR` donne `€`), avec repli sur le code lui-même. */
export function symboleDevise(devise = 'EUR') {
  try {
    const parts = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise })
      .formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? devise;
  } catch {
    return devise;
  }
}

/**
 * Interprète un montant saisi librement (formulaire, import CSV).
 * Accepte : `1234.56`, `1234,56`, `1 234,56 €`, `1.234,56`, `1,234.56`…
 * Retourne un nombre, ou `null` si la valeur est inintelligible.
 * (La validation métier, qui exige un montant strictement positif, se fait ailleurs.)
 */
export function analyserMontant(valeur) {
  if (typeof valeur === 'number') {
    return Number.isFinite(valeur) ? valeur : null;
  }
  if (valeur == null) return null;

  // Espaces (y compris insécables U+00A0 et fines U+202F) et devises retirés.
  let texte = String(valeur)
    .replace(/[\s  ]/g, '')
    .replace(/(€|\$|£|EUR|CHF|USD|GBP|CAD)/gi, '')
    .trim();
  if (!texte) return null;

  const posVirgule = texte.lastIndexOf(',');
  const posPoint = texte.lastIndexOf('.');

  if (posVirgule !== -1 && posPoint !== -1) {
    // Les deux séparateurs sont présents : le dernier est le séparateur décimal.
    const decimal = posVirgule > posPoint ? ',' : '.';
    const milliers = decimal === ',' ? '.' : ',';
    texte = texte.split(milliers).join('').replace(decimal, '.');
  } else if (posVirgule !== -1 || posPoint !== -1) {
    const sep = posVirgule !== -1 ? ',' : '.';
    const occurrences = texte.split(sep).length - 1;
    const decimales = texte.length - texte.lastIndexOf(sep) - 1;
    if (occurrences > 1 || decimales === 3) {
      // Plusieurs séparateurs, ou exactement 3 chiffres derrière :
      // séparateur de milliers (« 1.234 » vaut 1234). Les montants monétaires
      // ont au plus 2 décimales.
      texte = texte.split(sep).join('');
    } else {
      texte = texte.replace(sep, '.');
    }
  }

  const nombre = Number(texte);
  return Number.isFinite(nombre) ? nombre : null;
}
