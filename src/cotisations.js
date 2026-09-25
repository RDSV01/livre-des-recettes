/**
 * Estimation de ce que l'URSSAF prélèvera sur un chiffre d'affaires encaissé,
 * et de ce qu'il en restera.
 *
 * Le micro-entrepreneur cotise en pourcentage de ce qu'il encaisse, à un taux
 * qui dépend de la nature de son activité. Connaître d'avance la somme qui
 * sera prélevée évite la mauvaise surprise au moment de déclarer.
 *
 * Trois prélèvements partent ensemble, sur la même base déclarée :
 *  - les cotisations sociales, à taux réduit pendant l'ACRE ;
 *  - la contribution à la formation professionnelle (CFP), toujours due ;
 *  - le versement libératoire de l'impôt sur le revenu, pour qui l'a choisi.
 *
 * Les taux changent à date fixe, parfois en cours d'année : chaque
 * encaissement est donc calculé au taux en vigueur LE JOUR OÙ IL A ÉTÉ
 * ENCAISSÉ, et non au taux de son année. Une période à déclarer qui enjambe un
 * changement produit alors deux lignes, chacune à son taux, et leur somme est
 * juste sans que personne ait à y penser.
 *
 * Ce n'est qu'une estimation (voir `partage/bareme-seuils.js` pour ce qui n'y
 * figure pas). L'application ne déclare rien et ne prélève rien.
 */

import { enCentimes, enEuros, arrondiDeclaration } from './partage/montants.js';
import { PALIERS_COTISATIONS } from './partage/bareme-seuils.js';
import { regimeFiscal, natureDesPrestations } from './partage/seuils.js';
import { periodeAcre, sousAcre, tauxAcre } from './partage/acre.js';

/**
 * Palier de taux en vigueur à une date donnée (`AAAA-MM-JJ`), ou `null` si
 * aucun ne la couvre. Les dates ISO se comparent lexicographiquement.
 */
export function palierPour(date) {
  return PALIERS_COTISATIONS.find((p) =>
    date >= p.duJour && (p.auJour === null || date <= p.auJour)) ?? null;
}

/**
 * Nature à retenir pour une recette : le type d'activité la donne, sauf en
 * activité mixte où c'est la catégorie de la recette qui tranche. Retourne
 * `null` quand elle ne peut pas être déterminée (mixte non catégorisé).
 */
function natureDe(recette, typeActivite, naturePrestations) {
  if (typeActivite !== 'mixte') return typeActivite;
  if (recette.categorie === 'ventes') return 'ventes';
  if (recette.categorie === 'prestations') return natureDesPrestations(naturePrestations);
  return null;
}

/**
 * Taux de CFP d'une nature d'activité. Il suit l'immatriculation : un artisan
 * paie le taux artisanal sur tout son chiffre d'affaires commercial (BIC),
 * ventes comme prestations. Une activité libérale n'est jamais artisanale.
 */
function tauxFormationPro(palier, nature, artisanale) {
  const bic = nature === 'ventes' || nature === 'prestations';
  return artisanale && bic ? palier.formationPro.artisan : palier.formationPro[nature];
}

/**
 * Applique un taux (en pourcentage) à une base entière et arrondit le
 * résultat à l'euro le plus proche, la fraction de 0,50 € comptant pour 1.
 *
 * C'est la règle de l'article L133-10 du Code de la sécurité sociale pour les
 * cotisations, et de l'article 1724 du Code général des impôts pour le
 * versement libératoire. L'URSSAF l'applique aussi à la formation
 * professionnelle : 2,22 € calculés sont prélevés 2 €.
 *
 * Le calcul passe par des entiers (taux en centièmes de point) : un résultat
 * qui tombe pile sur un demi-euro est ainsi toujours arrondi vers le haut,
 * sans dépendre de l'imprécision des nombres à virgule.
 */
function appliquerTaux(base, taux) {
  return Math.round((base * Math.round(taux * 100)) / 10_000);
}

/** Une contribution, ligne par ligne, sur les mêmes bases que les cotisations. */
function contribution(groupes, tauxDe) {
  const lignes = groupes.map((g) => {
    const taux = tauxDe(g);
    return { libelle: g.libelle, base: g.base, taux, montant: appliquerTaux(g.base, taux), duJour: g.duJour, acre: g.acre };
  });
  return { lignes, total: lignes.reduce((acc, l) => acc + l.montant, 0) };
}

/**
 * Prélèvements estimés sur une liste d'encaissements.
 *
 * Les recettes sont regroupées par nature d'activité, par palier de taux et
 * selon qu'elles tombent ou non dans la période d'ACRE : une même nature
 * apparaît donc plusieurs fois si le taux a changé pendant la période. La base
 * de chaque groupe est arrondie à l'euro, comme le veut la déclaration.
 *
 * Chaque prélèvement (cotisations sociales dans `lignes` et `total`, CFP,
 * versement libératoire) est arrondi à l'euro ligne par ligne, et son total
 * est la somme de ces entiers : le détail affiché tombe ainsi exactement sur
 * le total annoncé.
 *
 * Le chiffre d'affaires qu'aucun taux ne peut atteindre (recette non
 * catégorisée en activité mixte, ou encaissement antérieur au premier palier
 * connu) est retourné à part plutôt que compté au hasard, à charge pour
 * l'interface de dire qu'il manque à l'estimation. Il reste compté dans le
 * chiffre d'affaires encaissé, donc dans `reste`, qui est alors surestimé.
 *
 * @param {object[]} recettes encaissements de la période déclarée.
 * @param {object} parametres `{ typeActivite, naturePrestations,
 *   versementLiberatoire, activiteArtisanale, acre, debutActivite }`.
 * @returns {{
 *   lignes: object[], total: number,
 *   formationPro: { lignes: object[], total: number },
 *   versementLiberatoire: { lignes: object[], total: number }|null,
 *   totalPreleve: number, reste: number, horsEstimation: number
 * }|null} `null` si le type d'activité n'est pas renseigné.
 */
export function cotisationsUrssaf(recettes, {
  typeActivite, naturePrestations, versementLiberatoire = false, activiteArtisanale = false,
  acre = false, debutActivite = ''
} = {}) {
  if (!regimeFiscal(typeActivite)) return null;

  const periode = periodeAcre({ acre, debutActivite });
  const groupes = new Map();
  let horsEstimationCentimes = 0;
  let encaisseCentimes = 0;

  for (const recette of recettes) {
    encaisseCentimes += enCentimes(recette.montant);
    const nature = natureDe(recette, typeActivite, naturePrestations);
    const palier = palierPour(recette.dateEncaissement);
    // Sans nature ou sans palier, aucun taux ne s'applique : on le dit plutôt
    // que d'en choisir un.
    if (nature === null || palier === null) {
      horsEstimationCentimes += enCentimes(recette.montant);
      continue;
    }
    const reduit = sousAcre(recette.dateEncaissement, periode);
    const cle = `${nature}|${palier.duJour}|${reduit}`;
    const groupe = groupes.get(cle) ?? { nature, palier, duJour: palier.duJour, acre: reduit, centimes: 0 };
    groupe.centimes += enCentimes(recette.montant);
    groupes.set(cle, groupe);
  }

  // Du plus récent au plus ancien palier, puis par montant décroissant : la
  // ligne la plus lourde de la période en cours se lit en premier.
  //
  // Le taux s'applique sur la base DÉJÀ arrondie à l'euro, celle que la
  // déclaration fait saisir, et non sur les centimes encaissés : sur
  // 1 111,49 € au taux de 25,6 %, les centimes donneraient 285 € là où
  // l'URSSAF en réclame 284.
  const baser = (liste) => [...liste]
    .sort((a, b) => b.duJour.localeCompare(a.duJour) || b.centimes - a.centimes)
    .map((g) => ({
      ...g,
      libelle: `${regimeFiscal(g.nature).libelle}${g.acre ? ', taux ACRE' : ''}`,
      base: arrondiDeclaration(g.centimes)
    }));

  // Seules les cotisations sociales distinguent la période d'ACRE : la
  // formation professionnelle et le versement libératoire se calculent sur
  // une base par activité et par palier, ACRE ou non.
  const sansAcre = new Map();
  for (const g of groupes.values()) {
    const cle = `${g.nature}|${g.duJour}`;
    const fusion = sansAcre.get(cle) ?? { ...g, acre: false, centimes: 0 };
    fusion.centimes += g.centimes;
    sansAcre.set(cle, fusion);
  }
  const sociales = baser(groupes.values());
  const autres = baser(sansAcre.values());

  const { lignes, total } = contribution(sociales, (g) => (g.acre
    ? tauxAcre(g.palier[g.nature], periode.fraction, g.palier.plancherAcre?.[g.nature])
    : g.palier[g.nature]));
  const formationPro = contribution(autres, (g) => tauxFormationPro(g.palier, g.nature, activiteArtisanale));
  const liberatoire = versementLiberatoire
    ? contribution(autres, (g) => g.palier.versementLiberatoire[g.nature])
    : null;

  // Tous les prélèvements sont des euros entiers ; seul l'encaissé garde ses
  // centimes, et le reste avec lui.
  const totalPreleve = total + formationPro.total + (liberatoire?.total ?? 0);

  return {
    lignes,
    total,
    formationPro,
    versementLiberatoire: liberatoire,
    totalPreleve,
    reste: enEuros(encaisseCentimes - totalPreleve * 100),
    horsEstimation: enEuros(horsEstimationCentimes)
  };
}
