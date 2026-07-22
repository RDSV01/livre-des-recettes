/**
 * Estimation des cotisations sociales dues sur un chiffre d'affaires encaissé.
 *
 * Le micro-entrepreneur cotise en pourcentage de ce qu'il encaisse, à un taux
 * qui dépend de la nature de son activité. Connaître d'avance la somme qui
 * sera prélevée évite la mauvaise surprise au moment de déclarer.
 *
 * Les taux changent à date fixe, parfois en cours d'année : chaque
 * encaissement est donc calculé au taux en vigueur LE JOUR OÙ IL A ÉTÉ
 * ENCAISSÉ, et non au taux de son année. Une période à déclarer qui enjambe un
 * changement produit alors deux lignes, chacune à son taux, et leur somme est
 * juste sans que personne ait à y penser.
 *
 * Ce n'est qu'une estimation : les taux ne couvrent que les cotisations
 * sociales (voir `partage/bareme-seuils.js`). L'application ne déclare rien et
 * ne prélève rien.
 */

import { enCentimes, enEuros } from './partage/montants.js';
import { PALIERS_COTISATIONS } from './partage/bareme-seuils.js';
import { regimeFiscal, natureDesPrestations } from './partage/seuils.js';

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
 * Cotisations estimées sur une liste d'encaissements.
 *
 * Les recettes sont regroupées par nature d'activité ET par palier de taux :
 * une même nature apparaît donc plusieurs fois si le taux a changé pendant la
 * période. Chaque ligne est arrondie à l'euro le plus proche, comme le veut la
 * règle, et le total est la somme de ces entiers : le détail affiché tombe
 * ainsi exactement sur le total annoncé.
 *
 * Le chiffre d'affaires qu'aucun taux ne peut atteindre (recette non
 * catégorisée en activité mixte, ou encaissement antérieur au premier palier
 * connu) est retourné à part plutôt que compté au hasard, à charge pour
 * l'interface de dire qu'il manque à l'estimation.
 *
 * @param {object[]} recettes encaissements de la période déclarée.
 * @param {object} parametres `{ typeActivite, naturePrestations }`.
 * @returns {{ total: number, lignes: object[], horsEstimation: number }|null}
 *   `null` si le type d'activité n'est pas renseigné.
 */
export function cotisationsUrssaf(recettes, { typeActivite, naturePrestations } = {}) {
  if (!regimeFiscal(typeActivite)) return null;

  const groupes = new Map();
  let horsEstimationCentimes = 0;

  for (const recette of recettes) {
    const nature = natureDe(recette, typeActivite, naturePrestations);
    const palier = palierPour(recette.dateEncaissement);
    // Sans nature ou sans palier, aucun taux ne s'applique : on le dit plutôt
    // que d'en choisir un.
    if (nature === null || palier === null) {
      horsEstimationCentimes += enCentimes(recette.montant);
      continue;
    }
    const cle = `${nature}|${palier.duJour}`;
    const groupe = groupes.get(cle) ?? {
      nature, taux: palier[nature], duJour: palier.duJour, centimes: 0
    };
    groupe.centimes += enCentimes(recette.montant);
    groupes.set(cle, groupe);
  }

  // Du plus récent au plus ancien palier, puis par montant décroissant : la
  // ligne la plus lourde de la période en cours se lit en premier.
  const lignes = [...groupes.values()]
    .sort((a, b) => b.duJour.localeCompare(a.duJour) || b.centimes - a.centimes)
    .map((g) => ({
      libelle: regimeFiscal(g.nature).libelle,
      base: enEuros(g.centimes),
      taux: g.taux,
      // Les cotisations s'arrondissent à l'euro le plus proche : 315,50 € est
      // dû pour 316 €.
      montant: Math.round((g.centimes * g.taux) / 10_000),
      duJour: g.duJour
    }));

  return {
    lignes,
    total: lignes.reduce((acc, l) => acc + l.montant, 0),
    horsEstimation: enEuros(horsEstimationCentimes)
  };
}
