/**
 * Analyse de la numérotation des factures : doublons et numéros manquants.
 *
 * Aucune convention n'est imposée : « F001 », « FAC2026-001 », « A-2026-0007 »,
 * « 2026-001 »… L'algorithme découpe chaque numéro en un préfixe libre et une
 * partie numérique finale, regroupe les numéros partageant le même préfixe en
 * « séries », puis cherche les trous à l'intérieur de chaque série.
 *
 * Garde-fous contre les faux positifs :
 *  - un numéro sans partie numérique finale (« CLIENT-X ») n'entre dans
 *    aucune série ;
 *  - deux préfixes différents ne sont jamais comparés entre eux ;
 *  - une série doit compter au moins deux numéros ;
 *  - un trou n'est signalé que s'il est petit (au plus `TROU_MAX` numéros
 *    consécutifs) : entre « F-1 » et « F-500 », rien n'est signalé.
 *
 * Module partagé serveur / navigateur : aucune dépendance.
 */

import { normaliserTexte } from './texte.js';

/** Découpe « préfixe + chiffres finaux ». */
const MOTIF_NUMERO = /^(.*?)(\d+)$/s;

/** Taille maximale d'un trou signalé (au-delà, ce n'est pas une omission plausible). */
const TROU_MAX = 3;

/**
 * Analyse les numéros de facture d'une liste de recettes.
 *
 * @returns {{
 *   doublons: Array<{ numero: string, occurrences: number }>,
 *   manquants: Array<{ serie: string, numeros: string[] }>
 * }}
 */
export function analyserNumerotation(recettes) {
  const numeros = recettes
    .map((r) => String(r.numeroFacture ?? '').trim())
    .filter((n) => n !== '');

  // ---- Doublons : même numéro (insensible à la casse et aux accents) -------
  const occurrences = new Map();
  for (const numero of numeros) {
    const cle = normaliserTexte(numero);
    const entree = occurrences.get(cle) ?? { numero, total: 0 };
    entree.total += 1;
    occurrences.set(cle, entree);
  }
  const doublons = [...occurrences.values()]
    .filter((e) => e.total > 1)
    .map((e) => ({ numero: e.numero, occurrences: e.total }));

  // ---- Numéros manquants, série par série -----------------------------------
  // Les doublons ne comptent qu'une fois : on travaille sur les numéros uniques.
  const series = new Map();
  for (const { numero } of occurrences.values()) {
    const decoupe = MOTIF_NUMERO.exec(numero);
    if (!decoupe) continue; // pas de partie numérique finale : hors série
    const [, prefixe, chiffres] = decoupe;
    const cle = normaliserTexte(prefixe);
    const serie = series.get(cle) ?? { prefixe, entrees: [] };
    serie.entrees.push({ valeur: Number.parseInt(chiffres, 10), longueur: chiffres.length });
    series.set(cle, serie);
  }

  const manquants = [];
  for (const { prefixe, entrees } of series.values()) {
    if (entrees.length < 2) continue;

    const valeurs = [...new Set(entrees.map((e) => e.valeur))].sort((a, b) => a - b);
    // Remplissage : si toute la série est numérotée sur la même longueur
    // (« 001 », « 002 »…), les numéros reconstruits la respectent.
    const longueurs = new Set(entrees.map((e) => e.longueur));
    const longueur = longueurs.size === 1 ? [...longueurs][0] : 0;

    const trous = [];
    for (let i = 1; i < valeurs.length; i += 1) {
      const taille = valeurs[i] - valeurs[i - 1] - 1;
      if (taille < 1 || taille > TROU_MAX) continue;
      for (let v = valeurs[i - 1] + 1; v < valeurs[i]; v += 1) {
        trous.push(`${prefixe}${String(v).padStart(longueur, '0')}`);
      }
    }
    if (trous.length > 0) {
      manquants.push({ serie: prefixe || '(sans préfixe)', numeros: trous });
    }
  }

  return { doublons, manquants };
}

/**
 * Suggère le prochain numéro de facture : reprend la série de la dernière
 * recette saisie (préfixe identique), incrémente le plus grand numéro de
 * cette série et respecte son remplissage par zéros.
 * Retourne `null` si aucune recette ne porte de numéro exploitable.
 */
export function suggererNumeroSuivant(recettes) {
  const numerotees = recettes.filter((r) => MOTIF_NUMERO.test(String(r.numeroFacture ?? '').trim()));
  if (numerotees.length === 0) return null;

  const derniere = numerotees.reduce((a, b) => (String(b.creeLe) > String(a.creeLe) ? b : a));
  const [, prefixe] = MOTIF_NUMERO.exec(derniere.numeroFacture.trim());
  const clePrefixe = normaliserTexte(prefixe);

  let maximum = 0;
  const longueurs = new Set();
  for (const recette of numerotees) {
    const [, autrePrefixe, chiffres] = MOTIF_NUMERO.exec(recette.numeroFacture.trim());
    if (normaliserTexte(autrePrefixe) !== clePrefixe) continue;
    maximum = Math.max(maximum, Number.parseInt(chiffres, 10));
    longueurs.add(chiffres.length);
  }
  const longueur = longueurs.size === 1 ? [...longueurs][0] : 0;
  return `${prefixe}${String(maximum + 1).padStart(longueur, '0')}`;
}
