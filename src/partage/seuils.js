/**
 * Seuils du régime micro-entrepreneur et de la franchise en base de TVA :
 * lecture du barème et calculs de progression.
 *
 * LES MONTANTS NE SONT PAS ICI : ils vivent tous dans `bareme-seuils.js`,
 * qui est le seul fichier à toucher quand la loi les change. Ce module-ci
 * choisit le barème applicable à une année, associe chaque type d'activité
 * aux bons seuils, et mesure la progression vers eux.
 *
 * Le suivi est purement informatif : l'application ne gère ni TVA, ni
 * facturation, ni déclaration. En cas de doute sur sa situation, l'utilisateur
 * doit vérifier les valeurs en vigueur (economie.gouv.fr, URSSAF).
 *
 * Module partagé serveur / navigateur : aucune dépendance.
 */

import { enCentimes, enEuros } from './montants.js';
import { BAREMES } from './bareme-seuils.js';

/**
 * Nature de chaque type d'activité, indépendante des montants : comment on la
 * nomme, de quelle catégorie de bénéfices elle relève, sur quel jeu de seuils
 * elle s'appuie, et si elle comporte de l'achat pour revente.
 *
 *  - `seuils` : `marchandises` ou `services` dans le barème. Une activité
 *    mixte est plafonnée globalement comme les ventes, sa part « services »
 *    étant contrôlée à part (voir `bilanSeuils`) ;
 *  - `regime` : catégorie de bénéfices déclarée à l'impôt sur le revenu.
 *    `null` pour une activité mixte, qui n'en a pas une seule : ses ventes
 *    relèvent des BIC, ses prestations des BIC ou des BNC selon leur nature ;
 *  - `revente` : le registre des achats n'est exigible que dans ce cas ;
 *  - `categorie` : catégorie de toutes ses recettes (vente ou prestation).
 *    Absente pour une activité mixte, où chaque recette dit la sienne ;
 *  - `caseUrssaf` : intitulé exact de la case où la déclaration URSSAF fait
 *    saisir ce chiffre d'affaires. Les libellés en reprennent les mots, pour
 *    qu'on s'y retrouve d'un écran à l'autre ;
 *  - `enMixte` : la même activité, nommée dans une phrase sur l'activité
 *    mixte ; seules les prestations en ont une, ce sont les natures possibles
 *    de la part « prestations ».
 */
const ACTIVITES = {
  ventes: {
    libelle: 'Ventes de marchandises (BIC)',
    caseUrssaf: 'Chiffre d’affaires des ventes de marchandises',
    seuils: 'marchandises',
    regime: 'BIC',
    revente: true,
    categorie: 'ventes'
  },
  prestations: {
    libelle: 'Prestations de services commerciales ou artisanales (BIC)',
    enMixte: 'prestations de services commerciales ou artisanales (BIC)',
    caseUrssaf: 'Chiffre d’affaires des prestations de services commerciales ou artisanales',
    seuils: 'services',
    regime: 'BIC',
    revente: false,
    categorie: 'prestations'
  },
  // « Libérale » reste dans le libellé : c'est ainsi qu'on se désigne, et
  // « autres prestations de services », seul, ne parle à personne.
  liberal: {
    libelle: 'Autres prestations de services : activité libérale (BNC)',
    enMixte: 'autres prestations de services (BNC)',
    caseUrssaf: 'Chiffre d’affaires des autres prestations de services',
    seuils: 'services',
    regime: 'BNC',
    revente: false,
    categorie: 'prestations'
  },
  liberalCipav: {
    libelle: 'Profession libérale relevant de la Cipav (BNC)',
    enMixte: 'profession libérale relevant de la Cipav (BNC)',
    caseUrssaf: 'Recettes pour profession libérale relevant de la Cipav',
    seuils: 'services',
    regime: 'BNC',
    revente: false,
    categorie: 'prestations'
  },
  mixte: {
    libelle: 'Activité mixte : ventes et prestations de services',
    seuils: 'marchandises',
    regime: null,
    revente: true
  }
};

/**
 * Natures possibles de la part « prestations » d'une activité mixte. Les
 * plafonds sont les mêmes pour toutes (ceux des services), mais ni le régime
 * de bénéfices ni le taux de cotisations : une activité mixte doit donc dire
 * laquelle elle exerce.
 */
export const NATURES_PRESTATIONS = Object.entries(ACTIVITES)
  .filter(([, a]) => a.enMixte)
  .map(([code, a]) => ({ code, libelle: a.libelle }));

/** Nature retenue pour la part prestations, avec repli sur le cas courant. */
export function natureDesPrestations(naturePrestations) {
  return ACTIVITES[naturePrestations]?.enMixte ? naturePrestations : 'prestations';
}

/**
 * Intitulé complet de l'activité déclarée. Pour une activité mixte, la nature
 * choisie pour les prestations y figure : c'est elle qui décide du régime de
 * bénéfices et du taux de cotisations de cette part.
 */
export function libelleActivite({ typeActivite, naturePrestations } = {}) {
  const activite = ACTIVITES[typeActivite];
  if (!activite) return null;
  if (typeActivite !== 'mixte') return activite.libelle;
  return `Activité mixte : ventes de marchandises (BIC) et ${ACTIVITES[natureDesPrestations(naturePrestations)].enMixte}`;
}

/**
 * Case de la déclaration URSSAF où saisir le chiffre d'affaires d'une
 * activité à nature unique (`ventes`, `prestations`, `liberal`,
 * `liberalCipav`), mot pour mot ; `null` sinon.
 */
export function caseUrssaf(code) {
  return ACTIVITES[code]?.caseUrssaf ?? null;
}

/** Types d'activité proposés dans les paramètres. */
export const TYPES_ACTIVITE = [
  { code: '', libelle: 'Non renseigné' },
  ...Object.entries(ACTIVITES).map(([code, a]) => ({ code, libelle: a.libelle }))
];

/** Le plus récent barème enregistré. */
const dernierBareme = () => BAREMES.reduce((a, b) => (b.aPartirDe > a.aPartirDe ? b : a));

/**
 * Barème applicable à une année civile.
 *
 * Passé la période du dernier barème connu, celui-ci est reconduit plutôt que
 * de ne rien afficher : les seuils changent rarement, l'application reste ainsi
 * utilisable l'année où la loi évolue, en attendant la mise à jour qui apporte
 * le nouveau barème. La note de bas de carte annonce toujours la période du
 * barème appliqué, ce qui suffit à voir qu'il date. C'est le même parti que les
 * taux de cotisations, dont le dernier palier court « jusqu'à nouvel ordre ».
 *
 * Une année ANTÉRIEURE au plus ancien barème ne reçoit rien, elle : ses seuils
 * ont réellement existé et étaient différents : les remplacer par ceux
 * d'aujourd'hui serait faux à coup sûr, là où reconduire vers l'avenir n'est
 * qu'un pari raisonnable.
 *
 * @returns {object|null} le barème, ou `null` pour une année trop ancienne.
 */
export function baremePour(annee) {
  const exact = BAREMES.find((b) =>
    annee >= b.aPartirDe && (b.jusqua === null || annee <= b.jusqua));
  if (exact) return exact;
  const dernier = dernierBareme();
  return annee > dernier.jusqua ? dernier : null;
}

/**
 * Un barème couvre-t-il cette année ? Le tableau de bord se consulte année
 * par année : mesurer un exercice avec les seuils d'une autre période donnerait
 * un résultat faux, l'interface doit pouvoir le signaler.
 */
export function seuilsValentPour(annee) {
  return baremePour(annee) !== null;
}

/**
 * Période couverte par le barème d'une année (« 2026-2028 »), pour l'annoncer
 * à l'écran. Retourne `null` si aucun barème ne s'applique.
 */
export function periodeSeuils(annee) {
  const bareme = baremePour(annee);
  if (!bareme) return null;
  if (bareme.jusqua === null) return `à partir de ${bareme.aPartirDe}`;
  // Un barème d'une seule année s'annonce par cette année, pas « 2025-2025 ».
  if (bareme.jusqua === bareme.aPartirDe) return String(bareme.aPartirDe);
  return `${bareme.aPartirDe}-${bareme.jusqua}`;
}

/**
 * Seuils applicables à un type d'activité pour une année donnée
 * (`{ plafondMicro, franchiseTva, franchiseTvaMajore }`), ou `null` si le type
 * d'activité est inconnu ou l'année non couverte.
 */
export function seuilsDe(typeActivite, annee) {
  const activite = ACTIVITES[typeActivite];
  const bareme = baremePour(annee);
  if (!activite || !bareme) return null;
  return bareme[activite.seuils];
}

/**
 * Rappel du régime fiscal d'un type d'activité, pour l'afficher sous le
 * sélecteur des paramètres et en tête du rapport annuel.
 *
 * `regime` et `abattement` valent `null` pour une activité mixte : ses deux
 * parts relèvent de catégories et de taux différents, aucune valeur unique ne
 * la résume. Retourne `null` tant que le type d'activité n'est pas renseigné.
 */
export function regimeFiscal(typeActivite, annee = new Date().getFullYear()) {
  const activite = ACTIVITES[typeActivite];
  if (!activite) return null;
  const bareme = baremePour(annee);
  return {
    libelle: activite.libelle,
    regime: activite.regime,
    abattement: bareme?.abattements[typeActivite] ?? null
  };
}

/**
 * L'activité comporte-t-elle de l'achat pour revente ? Le registre des achats
 * n'est obligatoire que dans ce cas. Tant que le type d'activité n'est pas
 * renseigné, on suppose que oui : mieux vaut proposer un registre inutile que
 * d'en cacher un obligatoire.
 */
export function activiteAvecRevente(typeActivite) {
  return ACTIVITES[typeActivite]?.revente ?? true;
}

/**
 * Catégorie qu'une activité à nature unique impose à toutes ses recettes :
 * « prestations » pour une activité libérale, « ventes » pour l'achat /
 * revente. `null` pour une activité mixte (chaque recette est classée à la
 * saisie) ou non renseignée.
 */
export function categorieImposee(typeActivite) {
  return ACTIVITES[typeActivite]?.categorie ?? null;
}

/** Progression d'un chiffre d'affaires vers un seuil (calcul en centimes). */
function progression(chiffreAffaires, seuil) {
  const ca = enCentimes(chiffreAffaires);
  const plafond = enCentimes(seuil);
  return {
    seuil,
    restant: enEuros(Math.max(0, plafond - ca)),
    pourcentage: Math.round((ca / plafond) * 100)
  };
}

/**
 * Bilan des seuils pour un chiffre d'affaires annuel et un type d'activité.
 * Retourne `null` si le type d'activité n'est pas renseigné, ou si aucun
 * barème ne couvre l'année demandée.
 *
 * Pour une activité mixte, si le chiffre d'affaires de la part « prestations »
 * est fourni (recettes catégorisées), le bilan contient aussi la progression
 * de cette part vers les seuils des services : les deux conditions se cumulent,
 * dans le régime micro comme pour la franchise de TVA.
 *
 * @param {number} chiffreAffaires chiffre d'affaires encaissé de l'année.
 * @param {string} typeActivite code d'activité (voir `TYPES_ACTIVITE`).
 * @param {number|null} [caPrestations] part « prestations », activité mixte.
 * @param {number} [annee] année mesurée, qui détermine le barème.
 */
export function bilanSeuils(
  chiffreAffaires, typeActivite, caPrestations = null, annee = new Date().getFullYear()
) {
  const seuils = seuilsDe(typeActivite, annee);
  if (!seuils) return null;

  const bilan = {
    typeActivite,
    annee,
    // Règle de l'année mesurée : `jour` ou `mois` (voir le barème).
    finFranchiseMajore: baremePour(annee).finFranchiseMajore,
    plafondMicro: progression(chiffreAffaires, seuils.plafondMicro),
    franchiseTva: {
      ...progression(chiffreAffaires, seuils.franchiseTva),
      seuilMajore: seuils.franchiseTvaMajore
    },
    prestations: null
  };

  if (typeActivite === 'mixte' && caPrestations !== null) {
    const services = baremePour(annee).services;
    bilan.prestations = {
      chiffreAffaires: caPrestations,
      plafondMicro: progression(caPrestations, services.plafondMicro),
      franchiseTva: {
        ...progression(caPrestations, services.franchiseTva),
        seuilMajore: services.franchiseTvaMajore
      }
    };
  }
  return bilan;
}
