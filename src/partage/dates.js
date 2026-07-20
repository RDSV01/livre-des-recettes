/**
 * Manipulation des dates du livre des recettes.
 *
 * Convention : une date d'encaissement est toujours stockée au format ISO
 * `AAAA-MM-JJ` (chaîne de caractères, sans heure ni fuseau). Le format choisi
 * par l'utilisateur ne sert qu'à l'affichage.
 *
 * Module partagé serveur / navigateur : aucune dépendance.
 */

export const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

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
