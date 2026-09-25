/**
 * BARÈME OFFICIEL : SEUILS ANNUELS ET TAUX DE COTISATIONS.
 *
 * ============================================================================
 *  SEUL FICHIER À MODIFIER quand la loi change ces montants.
 *  Il ne contient que des valeurs : aucun calcul, aucune mise en forme.
 * ============================================================================
 *
 * Deux listes, parce que ces montants ne changent pas au même rythme :
 *
 *  - `BAREMES` : les plafonds du régime micro, les seuils de franchise en base
 *    de TVA et les abattements. Ils s'apprécient sur une ANNÉE CIVILE entière
 *    (on compare un chiffre d'affaires annuel à un plafond annuel), d'où des
 *    bornes en années.
 *
 *  - `PALIERS_COTISATIONS` : les taux prélevés par l'URSSAF (cotisations
 *    sociales, formation professionnelle, versement libératoire). Ils changent à
 *    DATE FIXE, parfois en cours d'année (relèvement par paliers des taux BNC,
 *    par exemple). Chaque encaissement cotise au taux en vigueur le jour où il
 *    a été encaissé : les bornes sont donc des dates, au jour près.
 *
 * Une période à déclarer qui enjambe un changement de taux est calculée part
 * par part, sans que l'utilisateur ait à s'en occuper.
 *
 * Sources à vérifier en cas de doute : service-public.fr, urssaf.fr,
 * autoentrepreneur.urssaf.fr, economie.gouv.fr, et les règles publiées du
 * simulateur de l'URSSAF (dépôt betagouv/mon-entreprise, dossier
 * modele-social/règles), qui datent chaque changement de taux.
 *
 * Module partagé serveur / navigateur : aucune dépendance.
 */

/**
 * Seuils annuels.
 *
 * Pour ajouter une période :
 *   1. copiez le bloc du dessus, sans rien y retirer ;
 *   2. placez-le EN PREMIER dans la liste ;
 *   3. renseignez `aPartirDe` (première année d'application) et `jusqua`
 *      (dernière année couverte, ou `null` si elle n'est pas connue) ;
 *   4. ajustez les montants, en euros.
 *
 * Les périodes doivent se suivre sans trou ni chevauchement : un test le
 * vérifie. Les anciens barèmes restent en place, si bien que consulter un
 * exercice passé affiche les seuils qui valaient vraiment cette année-là.
 *
 * Passé la dernière période connue, le barème le plus récent est RECONDUIT et
 * l'écran le signale : l'application reste utilisable l'année où la loi change
 * sans que ce fichier ait été mis à jour. Une année ANTÉRIEURE au plus ancien
 * barème, en revanche, n'affiche rien : ses montants ont réellement existé et
 * différaient, les remplacer serait faux à coup sûr.
 *
 * Deux jeux de montants suffisent : la loi distingue la vente de marchandises
 * des prestations de services. Une activité libérale suit les seuils des
 * services ; une activité mixte est plafonnée globalement comme les ventes, sa
 * part « services » restant tenue par les seuils des services.
 */
export const BAREMES = [
  {
    aPartirDe: 2026,
    jusqua: 2028,

    /** Ventes de marchandises (achat / revente, et fourniture de logement). */
    marchandises: {
      plafondMicro: 203_100,
      franchiseTva: 85_000,
      franchiseTvaMajore: 93_500
    },

    /** Prestations de services, commerciales, artisanales ou libérales. */
    services: {
      plafondMicro: 83_600,
      franchiseTva: 37_500,
      franchiseTvaMajore: 41_250
    },

    /**
     * Au-delà du seuil majoré, la franchise de TVA cesse dès le jour du
     * dépassement (`jour`, depuis 2025) ou dès le premier jour du mois du
     * dépassement (`mois`, auparavant). Le seuil de base dépassé, elle court
     * dans les deux cas jusqu'au 31 décembre.
     */
    finFranchiseMajore: 'jour',

    /**
     * Abattements forfaitaires pour frais, en pourcentage du chiffre
     * d'affaires déclaré. Purement indicatifs : l'application ne calcule aucun
     * impôt, elle se contente de rappeler le taux applicable.
     */
    abattements: {
      ventes: 71,
      prestations: 50,
      liberal: 34,
      liberalCipav: 34
    }
  },

  {
    // Les plafonds micro sont revalorisés tous les trois ans : ceux de la
    // période 2023-2025 valent encore. Les seuils de TVA, eux, ont changé au
    // 1er janvier 2025, d'où une période à part.
    aPartirDe: 2025,
    jusqua: 2025,

    marchandises: {
      plafondMicro: 188_700,
      franchiseTva: 85_000,
      franchiseTvaMajore: 93_500
    },

    services: {
      plafondMicro: 77_700,
      franchiseTva: 37_500,
      franchiseTvaMajore: 41_250
    },

    finFranchiseMajore: 'jour',

    abattements: {
      ventes: 71,
      prestations: 50,
      liberal: 34,
      liberalCipav: 34
    }
  },

  {
    aPartirDe: 2023,
    jusqua: 2024,

    marchandises: {
      plafondMicro: 188_700,
      franchiseTva: 91_900,
      franchiseTvaMajore: 101_000
    },

    services: {
      plafondMicro: 77_700,
      franchiseTva: 36_800,
      franchiseTvaMajore: 39_100
    },

    // Avant la réforme de 2025, la TVA était due dès le 1er du mois du
    // dépassement du seuil majoré.
    finFranchiseMajore: 'mois',

    abattements: {
      ventes: 71,
      prestations: 50,
      liberal: 34,
      liberalCipav: 34
    }
  }
];

/**
 * Taux de cotisations sociales, en pourcentage du chiffre d'affaires encaissé.
 *
 * Pour ajouter un palier :
 *   1. copiez le bloc du dessus ;
 *   2. placez-le EN PREMIER dans la liste ;
 *   3. renseignez `duJour` (premier jour d'application, format `AAAA-MM-JJ`)
 *      et `auJour` (dernier jour couvert, ou `null` pour « jusqu'à nouvel
 *      ordre ») ;
 *   4. bornez le palier précédent au jour d'avant.
 *
 * Les paliers doivent se suivre sans trou ni chevauchement : un test le
 * vérifie. Un changement au 1er juillet se déclare donc ainsi, et rien d'autre
 * n'est à toucher :
 *
 *     { duJour: '2026-07-01', auJour: null,         liberal: 27.1, … },
 *     { duJour: '2026-01-01', auJour: '2026-06-30', liberal: 26.1, … },
 *
 * Chaque palier porte trois jeux de taux, prélevés ensemble par l'URSSAF sur
 * le même chiffre d'affaires déclaré :
 *
 *  - les cotisations sociales, à la racine du palier (`ventes`, `prestations`,
 *    `liberal`, `liberalCipav`) ;
 *  - `formationPro` : la contribution à la formation professionnelle (CFP),
 *    toujours due. Elle dépend de l'immatriculation plus que de l'activité :
 *    0,1 % pour une activité commerciale (ventes comme prestations BIC), 0,3 %
 *    pour une activité artisanale (clé `artisan`, sur tout le chiffre
 *    d'affaires BIC), 0,2 % pour une activité libérale, CIPAV comprise. Ce
 *    sont les taux que l'URSSAF prélève (règles de son simulateur) : l'article
 *    L6331-48 du code du travail vise 0,2 % pour toute prestation de services,
 *    mais l'application suit ce qui est réellement prélevé ;
 *  - `versementLiberatoire` : l'impôt sur le revenu payé avec les
 *    cotisations, pour qui a choisi cette option.
 *
 * S'y ajoute `plancherAcre` : le taux de cotisations sociales sous lequel
 * l'ACRE ne peut pas descendre (voir `FRACTIONS_ACRE`). Seule la CIPAV en a
 * un : l'ACRE n'y exonère ni la CSG-CRDS ni la retraite complémentaire.
 *
 * Sources de la CFP et du versement libératoire : service-public.gouv.fr
 * (fiche F23459), impots.gouv.fr, et les règles publiées du simulateur de
 * l'URSSAF (mon-entreprise.urssaf.fr). Ni l'une ni l'autre n'a changé sur la
 * période couverte : le taux libéral de la CFP était de 0,1 % hors CIPAV avant
 * 2022, donc avant le plus ancien palier.
 *
 * Restent hors estimation : la taxe pour frais de chambre consulaire (CCI ou
 * chambre de métiers, dont le taux varie selon la région) et, pour l'ACRE, la
 * limite de chiffre d'affaires au-delà de laquelle le taux normal revient (un
 * revenu égal au plafond annuel de la sécurité sociale, soit 72 818 € de
 * recettes BNC en 2026). Le montant affiché reste un ordre de grandeur, pas un
 * appel de cotisations.
 *
 * Une activité mixte n'a pas de taux propre : chacune de ses parts est
 * calculée au sien.
 */

/** CFP, identique sur toute la période couverte. */
const FORMATION_PRO = { ventes: 0.1, prestations: 0.1, liberal: 0.2, liberalCipav: 0.2, artisan: 0.3 };

/** Versement libératoire, identique sur toute la période couverte. */
const VERSEMENT_LIBERATOIRE = { ventes: 1, prestations: 1.7, liberal: 2.2, liberalCipav: 2.2 };

/**
 * ACRE (aide à la création ou à la reprise d'entreprise) : part du taux normal
 * de cotisations sociales payée pendant l'exonération, selon la date de
 * création ou de reprise, du plus récent au plus ancien (article D131-6-3 du
 * code de la sécurité sociale). Le taux réduit est arrondi au dixième de point
 * SUPÉRIEUR : 75 % de 12,3 % donnent 9,3 %, pas 9,2 %.
 *
 * L'exonération court du début d'activité à la fin du 3e trimestre civil qui
 * suit. Elle ne touche que les cotisations sociales : la formation
 * professionnelle et le versement libératoire restent dus en entier.
 *
 * Avant 2020, l'ACRE des micro-entrepreneurs suivait d'autres règles ; elle
 * s'achevait de toute façon avant le plus ancien palier ci-dessous.
 */
export const FRACTIONS_ACRE = [
  // Décret 2026-69 du 6 février 2026 : l'exonération passe de 50 % à 25 %.
  { creeDepuis: '2026-07-01', fraction: 75 },
  { creeDepuis: '2020-01-01', fraction: 50 }
];

export const PALIERS_COTISATIONS = [
  {
    duJour: '2026-01-01',
    auJour: null,
    ventes: 12.3,
    prestations: 21.2,
    // Dernière marche de la hausse des libérales : 26,1 % était prévu, ramené
    // à 25,6 % par le décret 2025-943 du 8 septembre 2025.
    liberal: 25.6,
    liberalCipav: 23.2,
    formationPro: FORMATION_PRO,
    versementLiberatoire: VERSEMENT_LIBERATOIRE,
    plancherAcre: { liberalCipav: 13.4 }
  },

  {
    duJour: '2025-01-01',
    auJour: '2025-12-31',
    ventes: 12.3,
    prestations: 21.2,
    // Deuxième marche de la hausse des libérales du régime général.
    liberal: 24.6,
    liberalCipav: 23.2,
    formationPro: FORMATION_PRO,
    versementLiberatoire: VERSEMENT_LIBERATOIRE,
    plancherAcre: { liberalCipav: 13.9 }
  },

  {
    // Décret 2024-484 du 30 mai 2024 : première marche, au 1er juillet 2024.
    // Les libérales du régime général passent de 21,1 % à 23,1 %, et la CIPAV
    // de 21,2 % à 23,2 %, taux auquel elle en reste depuis.
    duJour: '2024-07-01',
    auJour: '2024-12-31',
    ventes: 12.3,
    prestations: 21.2,
    liberal: 23.1,
    liberalCipav: 23.2,
    formationPro: FORMATION_PRO,
    versementLiberatoire: VERSEMENT_LIBERATOIRE,
    plancherAcre: { liberalCipav: 13.9 }
  },

  {
    // Taux antérieurs à la réforme. Ils valent en réalité depuis le 1er
    // octobre 2022 : reculer `duJour` suffirait à couvrir la fin de 2022, si
    // un barème annuel était ajouté pour cette année-là.
    duJour: '2023-01-01',
    auJour: '2024-06-30',
    ventes: 12.3,
    prestations: 21.2,
    liberal: 21.1,
    liberalCipav: 21.2,
    formationPro: FORMATION_PRO,
    versementLiberatoire: VERSEMENT_LIBERATOIRE,
    plancherAcre: { liberalCipav: 12.1 }
  }
];
