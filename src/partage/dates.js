/**
 * Manipulation des dates du livre des recettes.
 *
 * Convention : une date d'encaissement est toujours stockée au format ISO
 * `AAAA-MM-JJ` (chaîne de caractères, sans heure ni fuseau). Le format choisi
 * par l'utilisateur ne sert qu'à l'affichage.
 *
 * Module partagé serveur / navigateur : aucune dépendance hors `partage/`.
 */

import { majusculeInitiale } from './texte.js';

export const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

/** Noms abrégés, distincts deux à deux (« juin » / « juil »), pour les graphiques. */
export const MOIS_ABREGES = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

/** Vérifie qu'une chaîne est une date ISO `AAAA-MM-JJ` réelle (30 février refusé). */
export function estDateIso(texte) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte);
  if (!m) return false;
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  return (
    date.getUTCFullYear() === annee &&
    date.getUTCMonth() === mois - 1 &&
    date.getUTCDate() === jour
  );
}

/** Formate une date ISO selon le format choisi dans les paramètres. */
export function formaterDate(iso, format = 'JJ/MM/AAAA') {
  if (!estDateIso(iso)) return iso ?? '';
  const [annee, mois, jour] = iso.split('-');
  switch (format) {
    case 'JJ-MM-AAAA': return `${jour}-${mois}-${annee}`;
    case 'AAAA-MM-JJ': return iso;
    case 'JJ/MM/AAAA':
    default: return `${jour}/${mois}/${annee}`;
  }
}

/**
 * Interprète une date saisie librement (import CSV) et la convertit en ISO.
 * Formats acceptés : `AAAA-MM-JJ`, `JJ/MM/AAAA`, `JJ-MM-AAAA`, `JJ.MM.AAAA`
 * (jour et mois sur 1 ou 2 chiffres ; année sur 2 chiffres interprétée 20xx).
 * Retourne `null` si la date est inintelligible ou invalide.
 */
export function analyserDateSouple(texte) {
  if (texte == null) return null;
  const brut = String(texte).trim();
  if (estDateIso(brut)) return brut;

  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(brut);
  if (!m) return null;
  const jour = m[1].padStart(2, '0');
  const mois = m[2].padStart(2, '0');
  const annee = m[3].length === 2 ? `20${m[3]}` : m[3];
  const iso = `${annee}-${mois}-${jour}`;
  return estDateIso(iso) ? iso : null;
}

/** Nom du mois (1 à 12) en français. */
export function nomMois(mois) {
  return NOMS_MOIS[mois - 1] ?? String(mois);
}

/**
 * Titre d'une période d'export : « Année 2026 » ou, si un mois est donné,
 * « Juillet 2026 ». Le mois peut venir d'un `<select>`, donc en texte.
 */
export function titrePeriode({ annee, mois }) {
  return mois ? `${majusculeInitiale(nomMois(Number(mois)))} ${annee}` : `Année ${annee}`;
}

/**
 * Date ISO en toutes lettres (« 28 mai 2026 »), pour confirmer sous un champ
 * ce que l'utilisateur vient de saisir. Chaîne vide si la date est incomplète.
 * Calcul purement textuel : aucun décalage de fuseau possible.
 */
export function dateEnFrancaisLong(iso) {
  if (!estDateIso(iso)) return '';
  const [annee, mois, jour] = iso.split('-');
  return `${Number(jour)} ${NOMS_MOIS[Number(mois) - 1]} ${annee}`;
}

/** Date du jour (heure locale) au format ISO. */
export function aujourdHuiIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Année (nombre) d'une date ISO. */
export function anneeDe(iso) {
  return Number(iso.slice(0, 4));
}

/** Mois (1 à 12) d'une date ISO. */
export function moisDe(iso) {
  return Number(iso.slice(5, 7));
}

/** Trimestre civil (1 à 4) d'un numéro de mois. */
export function trimestreDe(mois) {
  return Math.ceil(mois / 3);
}

/** « 2026-07-31 » : date ISO construite sans passer par un fuseau horaire. */
export const dateIso = (annee, mois, jour) =>
  `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;

/** Nombre de jours d'un mois (1 à 12). Le jour 0 du mois suivant est le dernier. */
export const joursDuMois = (annee, mois) => new Date(Date.UTC(annee, mois, 0)).getUTCDate();

/**
 * Identifiant d'une période de déclaration : « 2026-07 » pour un mois,
 * « 2026-T2 » pour un trimestre. C'est la forme mémorisée par le bouton
 * « C'est fait ». Retourne `null` pour une année entière, qui n'est pas une
 * périodicité de déclaration.
 */
export function idPeriode(annee, type, valeur) {
  if (type === 'mois') return `${annee}-${String(valeur).padStart(2, '0')}`;
  if (type === 'trimestre') return `${annee}-T${valeur}`;
  return null;
}

/** Inverse d'`idPeriode` : `{ annee, type, valeur }`, ou `null` si illisible. */
export function periodeDepuisId(id) {
  const m = /^(\d{4})-(?:T([1-4])|(0[1-9]|1[0-2]))$/.exec(String(id ?? ''));
  if (!m) return null;
  return m[2]
    ? { annee: Number(m[1]), type: 'trimestre', valeur: Number(m[2]) }
    : { annee: Number(m[1]), type: 'mois', valeur: Number(m[3]) };
}

/** Dernier mois (1 à 12) couvert par une période de déclaration. */
const dernierMois = (type, valeur) => (type === 'mois' ? valeur : valeur * 3);

/**
 * Dernier jour d'une période de déclaration (date ISO), ou `null` pour une
 * année entière.
 */
export function finPeriode(annee, type, valeur) {
  if (type !== 'mois' && type !== 'trimestre') return null;
  const mois = dernierMois(type, valeur);
  return dateIso(annee, mois, joursDuMois(annee, mois));
}

/**
 * Date limite de la déclaration URSSAF d'une période : le dernier jour du
 * mois qui suit sa fin. En mensuel, juillet se déclare au plus tard le
 * 31 août ; en trimestriel, cela donne les 30 avril, 31 juillet, 31 octobre
 * et 31 janvier. Retourne `null` pour une année entière.
 */
export function echeanceDeclaration(annee, type, valeur) {
  if (type !== 'mois' && type !== 'trimestre') return null;
  const suivant = dernierMois(type, valeur) + 1;
  const [a, m] = suivant === 13 ? [annee + 1, 1] : [annee, suivant];
  return dateIso(a, m, joursDuMois(a, m));
}

/**
 * Une période est-elle couverte par la dernière déclaration marquée comme
 * faite ? Les déclarations se suivent dans l'ordre : avoir déclaré le
 * 2e trimestre, c'est avoir déclaré le 1er. Deux identifiants de forme
 * différente (mois contre trimestre, après un changement de périodicité) ne
 * se comparent pas.
 */
export function periodeDeclaree(id, dernierePeriodeDeclaree) {
  const a = periodeDepuisId(id);
  const b = periodeDepuisId(dernierePeriodeDeclaree);
  if (!a || !b || a.type !== b.type) return false;
  return id <= dernierePeriodeDeclaree;
}

/**
 * Dernière période de déclaration URSSAF entièrement écoulée : le mois
 * précédent en déclaration mensuelle, le trimestre précédent en trimestrielle.
 * Retourne `{ id, libelle }` (id : « 2026-06 » ou « 2026-T2 »), ou `null`
 * si la périodicité n'est pas renseignée.
 */
export function dernierePeriodeEchue(periodicite, maintenant = new Date()) {
  const annee = maintenant.getFullYear();
  const mois = maintenant.getMonth() + 1;

  if (periodicite === 'mois') {
    const m = mois === 1 ? 12 : mois - 1;
    const a = mois === 1 ? annee - 1 : annee;
    return { id: `${a}-${String(m).padStart(2, '0')}`, libelle: `${nomMois(m)} ${a}` };
  }
  if (periodicite === 'trimestre') {
    const trimestreCourant = trimestreDe(mois);
    const t = trimestreCourant === 1 ? 4 : trimestreCourant - 1;
    const a = trimestreCourant === 1 ? annee - 1 : annee;
    return { id: `${a}-T${t}`, libelle: `${t}${t === 1 ? 'er' : 'e'} trimestre ${a}` };
  }
  return null;
}
