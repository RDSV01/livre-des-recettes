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
 *  - `PALIERS_COTISATIONS` : les taux de cotisations sociales. Ils changent à
 *    DATE FIXE, parfois en cours d'année (relèvement par paliers des taux BNC,
 *    par exemple). Chaque encaissement cotise au taux en vigueur le jour où il
 *    a été encaissé : les bornes sont donc des dates, au jour près.
 *
 * Une période à déclarer qui enjambe un changement de taux est calculée part
 * par part, sans que l'utilisateur ait à s'en occuper.
 *
 * Sources à vérifier en cas de doute : service-public.fr, urssaf.fr,
 * autoentrepreneur.urssaf.fr, economie.gouv.fr.
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
 * exercice passé affiche les seuils qui valaient vraiment cette année-là. Une
 * année couverte par aucun barème est signalée à l'écran plutôt que mesurée
 * avec de faux montants.
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

    /** Achat / revente de marchandises (et fourniture de logement). */
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
 * Ces taux ne comprennent ni la contribution à la formation professionnelle,
 * ni le versement libératoire de l'impôt sur le revenu, qui s'ajoutent quand
 * ils s'appliquent : le montant affiché est un ordre de grandeur, pas un appel
 * de cotisations.
 *
 * Une activité mixte n'a pas de taux propre : chacune de ses parts est
 * calculée au sien.
 */
export const PALIERS_COTISATIONS = [
  {
    duJour: '2026-01-01',
    auJour: null,
    ventes: 12.3,
    prestations: 21.2,
    // Dernière marche de la hausse des libérales : 26,1 % était prévu, ramené
    // à 25,6 % par le décret 2025-943 du 8 septembre 2025.
    liberal: 25.6,
    liberalCipav: 23.2
  },

  {
    duJour: '2025-01-01',
    auJour: '2025-12-31',
    ventes: 12.3,
    prestations: 21.2,
    // Deuxième marche de la hausse des libérales du régime général.
    liberal: 24.6,
    liberalCipav: 23.2
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
    liberalCipav: 23.2
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
    liberalCipav: 21.2
  }
];
