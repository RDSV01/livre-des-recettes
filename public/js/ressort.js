/**
 * Ressorts : le mouvement d'un élément qui rejoint sa place comme tiré par un
 * ressort, avec ou sans léger dépassement.
 *
 * Un ressort se règle comme dans la bibliothèque Motion (celle des
 * composants de Rare UI et de React Bits) : une durée visuelle et un rebond,
 * de 0 (aucun dépassement) à 1. La raideur et l'amortissement s'en déduisent
 * de la même façon, si bien que leurs réglages se reprennent tels quels. Le
 * mouvement est calculé une fois, puis servi :
 *  - en courbe CSS `linear()`, pour une transition ou `element.animate()` ;
 *  - en fonction `position(t)`, pour une animation menée image par image.
 */

/** Une courbe `linear()` comprise par le navigateur ? Sinon, une courbe classique. */
const LINEAIRE = typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0, 1)');
const REPLI = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * @param {{ duree?: number, rebond?: number }} [reglage] durée visuelle en
 *   secondes, rebond de 0 à 1.
 * @returns {{ easing: string, duree: number, position: (t: number) => number }}
 *   `duree` : temps réel jusqu'à l'arrêt, en millisecondes ; `position(t)` :
 *   avancée (0 au départ, 1 à l'arrivée, un peu plus en cas de dépassement)
 *   au temps `t`, en millisecondes.
 */
export function ressort({ duree = 0.4, rebond = 0 } = {}) {
  // Mêmes formules que Motion pour `visualDuration` et `bounce` (masse 1).
  const racine = (2 * Math.PI) / (duree * 1.2);
  const raideur = racine * racine;
  const amortissement = 2 * Math.min(1, Math.max(0.05, 1 - rebond)) * racine;

  // Simulation à la milliseconde, jusqu'à l'arrêt.
  const valeurs = [0];
  let x = 0;
  let v = 0;
  for (let ms = 1; ms < 4000; ms += 1) {
    v += (-raideur * (x - 1) - amortissement * v) / 1000;
    x += v / 1000;
    valeurs.push(x);
    // Arrêt dès que l'écart ne se voit plus (moins d'un demi-pixel sur un grand chiffre).
    if (ms > duree * 500 && Math.abs(1 - x) < 0.003 && Math.abs(v) < 0.05) break;
  }
  valeurs[valeurs.length - 1] = 1;
  const total = valeurs.length - 1;

  const POINTS = 48;
  const points = Array.from({ length: POINTS + 1 }, (_, i) => Number(valeurs[Math.round((i / POINTS) * total)].toFixed(4)));
  return {
    easing: LINEAIRE ? `linear(${points.join(', ')})` : REPLI,
    duree: total,
    position: (t) => (t <= 0 ? 0 : t >= total ? 1 : valeurs[Math.round(t)])
  };
}

/** Les surbrillances qui rejoignent l'élément choisi : un léger dépassement. */
export const RESSORT_SURBRILLANCE = ressort({ duree: 0.42, rebond: 0.25 });
/** Les déplacements vifs, sans dépassement (glissements dans une liste). */
export const RESSORT_VIF = ressort({ duree: 0.3, rebond: 0 });
