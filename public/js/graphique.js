/**
 * Chiffre d'affaires mois par mois : barres (empilées en activité mixte,
 * prestations en pied, ventes au-dessus), SVG écrit à la main. Barres de
 * 24 px au plus, arrondi de 4 px en tête seulement, 2 px de papier entre deux
 * segments, grille en filets, le total écrit au-dessus de chaque colonne (le
 * meilleur mois appuyé), le détail au survol et au clavier, et le tableau des
 * chiffres pour qui préfère lire. L'année précédente, quand le livre la
 * connaît, se dessine en retrait derrière chaque colonne, en gris ; un clic
 * sur un mois ouvre ses recettes.
 *
 * Le graphique occupe toute la place que lui laisse sa carte : il est
 * redessiné à la taille réelle de sa zone (texte net, jamais étiré) chaque
 * fois qu'elle change.
 */

import { echapperHtml, accorder } from './ui.js';
import { formaterMontant, formaterMontantEntier, sommeMontants } from '/partage/montants.js';
import { MOIS_ABREGES, nomMois } from '/partage/dates.js';
import { majusculeInitiale } from '/partage/texte.js';

const MARGE = { haut: 30, droite: 6, bas: 30, gauche: 56 };
const BARRE = 24;
const ECART = 2;
/** Barre de l'année d'avant : sa largeur (part de celle de l'année) et son écart. */
const PART_AVANT = 0.45;
const ECART_AVANT = 3;

/** Séries possibles ; la vue choisit lesquelles empiler, du pied vers le haut. */
const SERIES = {
  prestations: { libelle: 'Prestations', classe: 'seg-prestation' },
  ventes: { libelle: 'Ventes', classe: 'seg-vente' },
  nonCategorise: { libelle: 'Non catégorisé', classe: 'seg-neutre' },
  total: { libelle: 'Chiffre d’affaires', classe: 'seg-total' }
};

/** Pas de graduation lisible (1, 2, 2,5 ou 5 fois une puissance de dix) : quatre étages environ. */
function pasLisible(max) {
  const brut = max / 4;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  return [1, 2, 2.5, 5, 10].map((f) => f * puissance).find((p) => p >= brut);
}

/** Chemin d'un segment ; `tete` arrondit les deux coins du haut. */
function segment(x, y, l, h, tete) {
  const f = (n) => n.toFixed(1);
  if (!tete) return `M${f(x)} ${f(y + h)}V${f(y)}H${f(x + l)}V${f(y + h)}Z`;
  const r = Math.min(4, h);
  return `M${f(x)} ${f(y + h)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}H${f(x + l - r)}Q${f(x + l)} ${f(y)} ${f(x + l)} ${f(y + r)}V${f(y + h)}Z`;
}

/**
 * @typedef {object} Mois
 * @property {number} mois 1 à 12
 * @property {number} total
 * @property {number} nombre encaissements du mois
 * @property {Object<string, number>} valeurs montant de chaque série
 */

/**
 * Le SVG aux dimensions exactes de sa zone ; `anime` fait monter les barres,
 * `depuis` (hauteur de chaque colonne au dessin précédent, en pixels) les
 * fait grandir ou rétrécir depuis leur ancienne taille. `precedente` (douze
 * montants) ajoute l'année d'avant en barres étroites ; `cliquable` fait de chaque
 * mois écoulé un bouton.
 */
function dessiner(mois, series, { largeur, hauteur, anime, depuis = null, annee, moisCourant, devise, precedente = null, cliquable = false }) {
  const compact = new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: devise, notation: 'compact', maximumFractionDigits: 1
  });
  const max = Math.max(...mois.map((m) => m.total), ...(precedente ?? []), 1);
  const pas = pasLisible(max);
  const haut = Math.ceil(max / pas) * pas;
  const hauteurUtile = hauteur - MARGE.haut - MARGE.bas;
  const largeurUtile = largeur - MARGE.gauche - MARGE.droite;
  const creneau = largeurUtile / 12;
  const base = hauteur - MARGE.bas;
  const y = (v) => (v / haut) * hauteurUtile;
  const meilleur = mois.reduce((a, b) => (b.total > a.total ? b : a));

  let grille = '';
  for (let v = 0; v <= haut + pas / 1000; v += pas) {
    const ligne = (base - y(v)).toFixed(1);
    grille += `<line class="grille" x1="${MARGE.gauche}" x2="${largeur - MARGE.droite}" y1="${ligne}" y2="${ligne}"/>
      <text class="axe" x="${MARGE.gauche - 10}" y="${Number(ligne) + 4}" text-anchor="end">${v === 0 ? '0' : echapperHtml(compact.format(v))}</text>`;
  }

  // L'année d'avant, quand elle est là : une barre étroite à gauche de celle de
  // l'année, le couple centré sur le mois.
  const dispo = creneau - 10;
  const l = precedente ? Math.min(BARRE, (dispo - ECART_AVANT) / (1 + PART_AVANT)) : Math.min(BARRE, dispo);
  const lAvant = precedente ? l * PART_AVANT : 0;
  const decalage = precedente ? (lAvant + ECART_AVANT) / 2 : 0;

  const colonnes = mois.map((m, i) => {
    const cx = MARGE.gauche + creneau * i + creneau / 2;
    const cxBarre = cx + decalage;
    const x = cxBarre - l / 2;
    const presentes = series.filter((s) => m.valeurs[s] > 0);
    let sommet = base;
    const barres = presentes.map((s, rang) => {
      const h = Math.max(2, y(m.valeurs[s]) - (rang > 0 ? ECART : 0));
      const yh = sommet - (rang > 0 ? ECART : 0) - h;
      sommet = yh;
      return `<path class="${SERIES[s].classe}" d="${segment(x, yh, l, h, rang === presentes.length - 1)}"/>`;
    }).join('');
    const avenir = moisCourant !== null && m.mois > moisCourant;
    // Changement d'année : la colonne part de sa hauteur précédente, et son
    // total la suit.
    const hauteurColonne = base - sommet;
    const morph = depuis && hauteurColonne > 0
      ? { classe: ' morph', style: `--depuis:${((depuis[m.mois] ?? 0) / hauteurColonne).toFixed(3)};--decalage:${(hauteurColonne - (depuis[m.mois] ?? 0)).toFixed(1)}px` }
      : { classe: '', style: '' };
    // L'année d'avant : sa barre étroite, en retrait. Elle apparaît en fondu
    // au premier dessin comme au changement d'année.
    const avant = precedente?.[i] ?? 0;
    const hAvant = avant > 0 ? Math.max(2, y(avant)) : 0;
    const barreAvant = hAvant
      ? `<path class="barre-precedente${anime ? ' anime' : depuis ? ' fondu' : ''}" style="--rang:${i}" d="${segment(x - ECART_AVANT - lAvant, base - hAvant, lAvant, hAvant, true)}"/>`
      : '';
    // Le total au-dessus de chaque colonne ; en abrégé quand la colonne est
    // trop étroite. Un liseré couleur de carte le détache de la barre de
    // l'année d'avant quand il passe dessus.
    const valeur = creneau >= 58 ? formaterMontantEntier(m.total, devise) : compact.format(m.total);
    const etiquette = m.total > 0
      ? `<text class="etiquette-valeur${m.mois === meilleur.mois ? ' meilleur' : ''}${anime ? ' anime' : ''}${morph.classe}" style="--rang:${i};${morph.style}" x="${cxBarre.toFixed(1)}" y="${(sommet - 8).toFixed(1)}" text-anchor="middle">${echapperHtml(valeur)}</text>`
      : '';
    const nom = nomMois(m.mois);
    const rappel = precedente ? `, ${annee - 1} : ${formaterMontant(avant, devise)}` : '';
    const description = avenir
      ? `${nom} : à venir${rappel}`
      : `${nom} ${annee} : ${formaterMontant(m.total, devise)} encaissés${series.length > 1
        ? `, dont ${series.map((s) => `${formaterMontant(m.valeurs[s] ?? 0, devise)} ${SERIES[s].libelle.toLowerCase()}`).join(', ')}`
        : ''}${rappel}${cliquable ? '. Voir ses recettes' : ''}`;
    const role = cliquable && !avenir ? 'button' : 'img';
    return `<g class="colonne${avenir ? ' avenir' : ''}" data-mois="${m.mois}" ${avenir ? '' : 'tabindex="0"'} role="${role}" aria-label="${echapperHtml(description)}">
        <rect class="zone" x="${(cx - creneau / 2 + 3).toFixed(1)}" y="${MARGE.haut - 10}" width="${(creneau - 6).toFixed(1)}" height="${hauteurUtile + 10}" rx="6"/>
        ${barreAvant}
        ${barres ? `<g class="barres${anime ? ' anime' : ''}${morph.classe}" style="--rang:${i};${morph.style}">${barres}</g>` : ''}
        ${etiquette}
        <text class="axe${m.mois === moisCourant ? ' axe-courant' : ''}" x="${cx.toFixed(1)}" y="${hauteur - 8}" text-anchor="middle">${MOIS_ABREGES[m.mois - 1]}</text>
      </g>`;
  }).join('');

  return `<svg class="${cliquable ? 'cliquable' : ''}" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}" role="group" aria-label="Encaissements par mois en ${annee}">
      ${grille}
      <line class="grille base" x1="${MARGE.gauche}" x2="${largeur - MARGE.droite}" y1="${base}" y2="${base}"/>
      ${colonnes}
    </svg>`;
}

/** L'emplacement du graphique ; le dessin vient au branchement, à la bonne taille. */
export const graphiqueMensuel = () => `<div class="graphique">
    <div class="graphique-zone"></div>
    <div class="bulle-graphique" aria-hidden="true"></div>
  </div>`;

/** Les mêmes chiffres en tableau, mois écoulés seulement ; l'année d'avant en dernière colonne. */
export function tableauMensuel(mois, series, { moisCourant, devise, annee, precedente = null }) {
  const faits = mois.filter((m) => moisCourant === null || m.mois <= moisCourant);
  const plusieurs = series.length > 1;
  const somme = (cle) => formaterMontant(sommeMontants(faits.map((m) => (cle ? m.valeurs[cle] ?? 0 : m.total))), devise);
  const sommeAvant = () => formaterMontant(sommeMontants(faits.map((m) => precedente[m.mois - 1] ?? 0)), devise);
  return `<table class="tableau">
      <thead><tr><th>Mois</th>${plusieurs ? series.map((s) => `<th class="montant">${SERIES[s].libelle}</th>`).join('') : ''}<th class="montant">Total</th>
        ${precedente ? `<th class="montant attenue">${annee - 1}</th>` : ''}</tr></thead>
      <tbody>${faits.map((m) => `<tr><td>${majusculeInitiale(nomMois(m.mois))}</td>
        ${plusieurs ? series.map((s) => `<td class="montant">${formaterMontant(m.valeurs[s] ?? 0, devise)}</td>`).join('') : ''}
        <td class="montant">${formaterMontant(m.total, devise)}</td>
        ${precedente ? `<td class="montant attenue">${formaterMontant(precedente[m.mois - 1] ?? 0, devise)}</td>` : ''}</tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td>${plusieurs ? series.map((s) => `<td class="montant">${somme(s)}</td>`).join('') : ''}<td class="montant">${somme(null)}</td>
        ${precedente ? `<td class="montant attenue">${sommeAvant()}</td>` : ''}</tr></tfoot>
    </table>`;
}

/**
 * Dessine le graphique à la taille de sa zone, le redessine quand elle
 * change (sans rejouer l'animation), et branche la bulle de détail qui suit
 * la colonne survolée ou qui a le focus.
 *
 * @param {HTMLElement} racine carte qui contient `graphiqueMensuel()`.
 * @param {Mois[]} mois
 * @param {object} options
 * @param {string[]} options.series clés de `SERIES`, du pied vers le haut.
 * @param {number} options.annee
 * @param {number|null} options.moisCourant dernier mois écoulé ; `null` pour une année passée.
 * @param {string} options.devise
 * @param {boolean} [options.anime]
 * @param {Object<string, number>|null} [options.depuis] hauteurs du dessin
 *   précédent (voir `hauteursBarres`), pour une transition d'une année à l'autre.
 * @param {number[]|null} [options.precedente] l'année d'avant, douze montants.
 * @param {((mois: number) => void)|null} [options.surClic] un mois écoulé choisi
 *   (clic, Entrée ou Espace).
 */
export function brancherGraphique(racine, mois, {
  series, annee, moisCourant, devise, anime = false, depuis = null, precedente = null, surClic = null
}) {
  const cadre = racine.querySelector('.graphique');
  const zone = cadre.querySelector('.graphique-zone');
  const bulle = cadre.querySelector('.bulle-graphique');
  let taille = '';
  const redessiner = () => {
    const largeur = Math.floor(zone.clientWidth);
    const hauteur = Math.floor(zone.clientHeight);
    if (!largeur || !hauteur || `${largeur}x${hauteur}` === taille) return;
    zone.innerHTML = dessiner(mois, series, {
      largeur, hauteur, anime: anime && !taille, depuis: taille ? null : depuis, annee, moisCourant, devise,
      precedente, cliquable: Boolean(surClic)
    });
    taille = `${largeur}x${hauteur}`;
  };
  // Premier dessin tout de suite, si la zone a déjà sa taille : attendre
  // l'observateur laissait la carte vide une image, un éclair à chaque
  // changement d'année.
  redessiner();
  const observateur = new ResizeObserver(() => {
    if (!zone.isConnected) { observateur.disconnect(); return; }
    redessiner();
  });
  observateur.observe(zone);

  const montrer = (colonne) => {
    const m = mois[Number(colonne.dataset.mois) - 1];
    const avenir = moisCourant !== null && m.mois > moisCourant;
    const avant = precedente ? `<div class="ligne precedente"><span><i class="seg-precedente"></i>En ${annee - 1}</span>
      <span>${formaterMontant(precedente[m.mois - 1] ?? 0, devise)}</span></div>` : '';
    // Un mois à venir ne dit rien de lui-même ; l'année d'avant, si elle est là, se lit quand même.
    if (avenir && !precedente) return;
    const lignes = series.length > 1
      ? series.map((s) => `<div class="ligne"><span><i class="${SERIES[s].classe}"></i>${SERIES[s].libelle}</span><span>${formaterMontant(m.valeurs[s] ?? 0, devise)}</span></div>`).join('')
      : '';
    bulle.innerHTML = avenir
      ? `<strong>${majusculeInitiale(nomMois(m.mois))} ${annee}</strong><p class="note-bulle">À venir</p>${avant}`
      : `<strong>${majusculeInitiale(nomMois(m.mois))} ${annee}</strong>${lignes}
      <div class="ligne total"><span>${accorder(m.nombre, 'encaissement')}</span><span>${formaterMontant(m.total, devise)}</span></div>${avant}`;
    // La bulle se pose au-dessus de ce qui est le plus haut : la barre, ou l'année d'avant.
    const hauts = [...colonne.querySelectorAll('.barres, .barre-precedente')]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.top);
    const boite = cadre.getBoundingClientRect();
    const creneau = colonne.querySelector('.zone').getBoundingClientRect();
    const sommet = hauts.length ? Math.min(...hauts) : creneau.bottom - 30;
    const centre = creneau.left + creneau.width / 2;
    bulle.style.left = `${Math.min(Math.max(centre - boite.left, 100), boite.width - 100)}px`;
    bulle.style.top = `${sommet - boite.top}px`;
    bulle.classList.add('visible');
  };
  const cacher = () => bulle.classList.remove('visible');
  // Délégation : les colonnes sont recréées à chaque redessin.
  zone.addEventListener('pointerover', (e) => {
    const colonne = e.target.closest('.colonne');
    if (colonne) montrer(colonne); else cacher();
  });
  zone.addEventListener('pointerleave', cacher);
  zone.addEventListener('focusin', (e) => {
    const colonne = e.target.closest('.colonne');
    if (colonne) montrer(colonne);
  });
  zone.addEventListener('focusout', cacher);
  // Un clic ne donne pas le focus à la colonne : le survol suffit à la
  // souris, le focus reste réservé au clavier.
  zone.addEventListener('mousedown', (e) => {
    if (e.target.closest('.colonne')) e.preventDefault();
  });
  if (!surClic) return;
  // Un mois écoulé mène à ses recettes : clic, Entrée ou Espace.
  const choisir = (colonne) => {
    const numero = Number(colonne?.dataset.mois);
    if (!numero || colonne.classList.contains('avenir')) return;
    surClic(numero);
  };
  zone.addEventListener('click', (e) => choisir(e.target.closest('.colonne')));
  zone.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const colonne = e.target.closest('.colonne');
    if (!colonne) return;
    e.preventDefault();
    choisir(colonne);
  });
}

/**
 * Hauteur de chaque colonne telle qu'elle est montrée, en pixels, mois par
 * mois : le point de départ de la transition vers une autre année. Mesurée à
 * l'écran (animation comprise) : une barre encore en train de grandir repart
 * de sa hauteur du moment, pas de sa cible.
 */
export function hauteursBarres(racine) {
  return Object.fromEntries([...racine.querySelectorAll('.graphique .colonne')].map((colonne) => {
    const barres = colonne.querySelector('.barres');
    return [colonne.dataset.mois, barres ? barres.getBoundingClientRect().height : 0];
  }));
}
