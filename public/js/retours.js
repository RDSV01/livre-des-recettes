/**
 * Retours sur place : le geste répond là où il a été fait, pas dans un coin
 * de l'écran.
 *
 *  - `reussite(bouton, texte)` : le bouton se change un instant en coche
 *    (« Copié », « Exporté »), puis reprend son libellé ;
 *  - `patienter(bouton, texte)` : le bouton travaille, le temps d'une étape ;
 *  - `bandeauRetour(conteneur, texte, annuler)` : une ligne de retour posée en
 *    tête d'une carte, avec « Annuler », qui s'efface seule ;
 *  - `minuteur(duree)` : l'anneau qui se vide à côté d'un « Annuler »
 *    éphémère, pour voir le temps qu'il reste ;
 *  - `halo(element)` : l'onde verte d'une déclaration faite, d'un import réussi ;
 *  - `confettis(element)` : la pluie de confettis d'une recette ajoutée ;
 *  - `brancherSegmentes(racine)` : le curseur qui glisse d'une option à
 *    l'autre dans les groupes à bascule.
 *
 * Tout est aussi annoncé aux lecteurs d'écran par une zone discrète.
 */

import { icone } from './icones.js';
import { echapperHtml, mouvementReduit, deplierHauteur, replierPuisRetirer } from './ui.js';

/** Durée de vie d'une ligne de retour : le temps de lire, puis de viser « Annuler ». */
export const DUREE_RETOUR = 5000;

/**
 * Minuteur d'un « Annuler » éphémère : un petit anneau qui se vide au rythme
 * du temps restant, pour qu'on voie qu'il va disparaître. `debut` (le
 * `Date.now()` du départ) le fait reprendre au même point quand la ligne qui
 * le porte est redessinée (tri, filtre).
 *
 * @param {number} duree en millisecondes.
 * @param {number} [debut]
 */
export function minuteur(duree, debut = Date.now()) {
  const ecoule = Math.min(duree, Math.max(0, Date.now() - debut));
  return `<span class="minuteur" aria-hidden="true" style="--duree:${duree}ms;--ecoule:-${ecoule}ms"><svg viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="6"/><circle class="reste" cx="8" cy="8" r="6" pathLength="100"/></svg></span>`;
}

/** Message lu par les lecteurs d'écran, sans rien afficher. */
export function annoncer(texte) {
  let zone = document.getElementById('annonces');
  if (!zone) {
    zone = document.createElement('div');
    zone.id = 'annonces';
    zone.className = 'hors-ecran';
    zone.setAttribute('aria-live', 'polite');
    document.body.append(zone);
  }
  // Vidée puis remplie à l'image suivante : un même texte redit est relu.
  zone.textContent = '';
  requestAnimationFrame(() => { zone.textContent = texte; });
}

const enCours = new WeakMap();

/**
 * Le bouton affiche le résultat de son geste, à largeur constante pour que
 * rien ne bouge autour, puis reprend son libellé. `echec` le teinte de rouge
 * (« Échec », « Copie refusée »).
 */
export function reussite(bouton, texte, { duree = 1700, nomIcone = 'coche', echec = false } = {}) {
  if (!bouton?.isConnected) { annoncer(texte); return; }
  const precedent = enCours.get(bouton);
  if (precedent) clearTimeout(precedent.attente);
  const origine = precedent?.origine ?? { html: bouton.innerHTML, largeur: bouton.style.minWidth };
  const classe = echec ? 'echoue' : 'reussi';
  bouton.style.minWidth = `${bouton.offsetWidth}px`;
  bouton.classList.remove('reussi', 'echoue');
  bouton.classList.add(classe);
  // Le bouton attendait à l'instant (voir `patienter`) : sa roue se referme
  // en anneau et une coche (ou une croix) s'y trace. Sinon, seule la coche se
  // dessine : sur une icône de fichier, le tracé se hacherait.
  const angle = attentesFinies.get(bouton);
  attentesFinies.delete(bouton);
  const marque = angle !== undefined && !mouvementReduit()
    ? statut({ angle, fin: echec ? 'croix' : 'coche' })
    : icone(nomIcone, { taille: 16, classe: nomIcone === 'coche' ? 'trace-coche' : '' });
  bouton.innerHTML = `${marque}<span>${echapperHtml(texte)}</span>`;
  annoncer(texte);
  const attente = setTimeout(() => {
    enCours.delete(bouton);
    if (!bouton.isConnected) return;
    bouton.classList.remove(classe);
    bouton.classList.add('revient');
    bouton.innerHTML = origine.html;
    bouton.style.minWidth = origine.largeur;
    setTimeout(() => bouton.classList.remove('revient'), 300);
  }, duree);
  enCours.set(bouton, { attente, origine });
}

/**
 * Le bouton travaille (roue qui tourne) le temps d'une étape, sans changer de
 * largeur. Retourne de quoi lui rendre son libellé.
 */
export function patienter(bouton, texte) {
  bouton.style.minWidth = `${bouton.offsetWidth}px`;
  const html = bouton.innerHTML;
  bouton.disabled = true;
  bouton.innerHTML = `${statut()}<span>${echapperHtml(texte)}</span>`;
  return () => {
    // L'angle de la roue à cet instant : un résultat annoncé dans la foulée
    // (« Sauvegardé », même tâche) la reprend là où elle tournait (voir
    // `reussite`). Passé cette tâche, l'attente est oubliée.
    const anneau = bouton.querySelector('.statut .anneau');
    if (anneau) {
      attentesFinies.set(bouton, parseFloat(getComputedStyle(anneau).rotate) || 0);
      queueMicrotask(() => attentesFinies.delete(bouton));
    }
    bouton.disabled = false;
    bouton.innerHTML = html;
    bouton.style.minWidth = '';
  };
}

/** Les attentes qui viennent de finir : l'angle de leur roue, par bouton. */
const attentesFinies = new WeakMap();

/**
 * Marque d'état d'un bouton, d'après « Status Mark » de React Bits : une roue
 * qui tourne pendant l'attente ; à la fin (`fin`), elle se referme en anneau
 * en poursuivant sa course depuis `angle`, et une coche ou une croix s'y trace.
 */
function statut({ angle = 0, fin = null } = {}) {
  const trace = { coche: 'm8.5 12.2 2.4 2.4 4.6-4.9', croix: 'M9.5 9.5l5 5M14.5 9.5l-5 5' }[fin];
  return `<svg class="icone statut${fin ? ` statut-fin ${fin}` : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <circle class="anneau" cx="12" cy="12" r="9" pathLength="100" style="--angle:${angle.toFixed(1)}deg"/>
      ${trace ? `<path class="marque" d="${trace}" pathLength="1"/>` : ''}</svg>`;
}

/**
 * Copie un texte dans le presse-papiers ; le bouton lui-même confirme
 * « Copié ». En cas d'échec (droit refusé par le navigateur), il invite à le
 * sélectionner à la main.
 */
export async function copierDansPressePapiers(texte, bouton) {
  try {
    await navigator.clipboard.writeText(texte);
    reussite(bouton, 'Copié', { duree: 1400 });
  } catch {
    reussite(bouton, 'Copie refusée', { duree: 2200, nomIcone: 'cercle-alerte', echec: true });
    annoncer('Copie impossible : sélectionnez le texte à la main.');
  }
}

/**
 * Ligne de retour en tête d'un conteneur : « 2e trimestre déclaré · Annuler ».
 * Elle se déplie, reste le temps de réagir, puis se replie.
 *
 * @param {HTMLElement} conteneur
 * @param {string} texte
 * @param {(() => unknown)|null} [annuler] action du lien « Annuler ».
 * @param {{ duree?: number, erreur?: boolean }} [options]
 */
export function bandeauRetour(conteneur, texte, annuler = null, { duree = DUREE_RETOUR, erreur = false } = {}) {
  const ancien = conteneur.querySelector(':scope > .bandeau-retour');
  const element = document.createElement('div');
  element.className = `bandeau-retour${erreur ? ' erreur' : ''}`;
  element.setAttribute('role', erreur ? 'alert' : 'status');
  element.innerHTML = `${icone(erreur ? 'cercle-alerte' : 'cercle-valide', { taille: 16 })}<span>${echapperHtml(texte)}</span>`;
  const retirer = () => replierPuisRetirer(element);
  if (annuler) {
    const lien = document.createElement('button');
    lien.type = 'button';
    lien.className = 'lien-bouton';
    lien.innerHTML = `Annuler${minuteur(duree)}`;
    lien.addEventListener('click', () => { retirer(); annuler(); });
    element.append(lien);
  }
  // Il se déplie, et ce qui est dessous descend en douceur ; un retour qui en
  // remplace un autre prend sa place, en fondu, sans rien déplacer.
  if (ancien) {
    ancien.replaceWith(element);
    if (!mouvementReduit()) element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  } else {
    conteneur.prepend(element);
    deplierHauteur(element);
  }
  if (!erreur) annoncer(texte);
  setTimeout(() => { if (element.isConnected) retirer(); }, duree);
  return element;
}

/**
 * Deux ondes vertes s'élargissent autour de l'élément, puis s'effacent :
 * c'est fait (déclaration faite, import réussi). Sobre, et net.
 */
export function halo(element) {
  if (mouvementReduit() || !element?.isConnected) return;
  const r = element.getBoundingClientRect();
  const arrondi = getComputedStyle(element).borderRadius;
  for (const onde of ['', ' seconde']) {
    const cercle = document.createElement('span');
    cercle.className = `halo${onde}`;
    Object.assign(cercle.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: arrondi
    });
    cercle.addEventListener('animationend', () => cercle.remove());
    document.body.append(cercle);
  }
}

/** Couleurs des confettis : celles de l'application, lues dans le thème en cours. */
const COULEURS_CONFETTIS = ['--succes', '--accent', '--alerte', '--achat', '--rail-icone-active'];

/**
 * Pluie de confettis tirée depuis un élément : une recette ajoutée, de
 * l'argent qui rentre. Les confettis partent en éventail, freinés par l'air,
 * puis retombent en tournoyant et s'effacent. Ils vivent dans une couche au
 * premier plan : au-dessus d'un panneau ouvert, et encore là quand il se ferme.
 */
export function confettis(element, { nombre = 48 } = {}) {
  if (mouvementReduit() || !element?.isConnected) return;
  const r = element.getBoundingClientRect();
  const couche = document.createElement('div');
  couche.className = 'couche-confettis';
  couche.popover = 'manual';
  couche.setAttribute('aria-hidden', 'true');
  document.body.append(couche);
  couche.showPopover?.();

  const theme = getComputedStyle(document.documentElement);
  const couleurs = COULEURS_CONFETTIS.map((v) => theme.getPropertyValue(v).trim()).filter(Boolean);
  const depart = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const AIR = 3;          // freinage de l'air (par seconde)
  const CHUTE = 240;      // vitesse de chute une fois freiné (px/s)
  const fins = [];
  for (let i = 0; i < nombre; i += 1) {
    const rond = i % 6 === 0;
    const largeur = rond ? 7 : 6 + Math.random() * 3;
    const hauteur = rond ? 7 : 10 + Math.random() * 5;
    const piece = document.createElement('i');
    Object.assign(piece.style, {
      left: `${depart.x - largeur / 2}px`,
      top: `${depart.y - hauteur / 2}px`,
      width: `${largeur}px`,
      height: `${hauteur}px`,
      background: couleurs[i % couleurs.length],
      borderRadius: rond ? '50%' : '2px'
    });
    couche.append(piece);

    // Tir vers le haut, en éventail d'environ 120 degrés.
    const angle = ((-90 + (Math.random() - 0.5) * 120) * Math.PI) / 180;
    const vitesse = 500 + Math.random() * 450;
    const vx = Math.cos(angle) * vitesse;
    const vy = Math.sin(angle) * vitesse;
    const duree = 1600 + Math.random() * 700;
    const tours = (Math.random() - 0.5) * 1080;
    const battement = 4 + Math.random() * 6;
    const images = [];
    for (let k = 0; k <= 16; k += 1) {
      const t = ((k / 16) * duree) / 1000;
      const frein = 1 - Math.exp(-AIR * t);
      const x = (vx / AIR) * frein;
      const y = ((vy - CHUTE) / AIR) * frein + CHUTE * t;
      // Le confetti bascule sur lui-même : sa hauteur apparente oscille.
      const bascule = rond ? 1 : Math.cos(t * battement * Math.PI).toFixed(3);
      images.push({
        transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${((tours * k) / 16).toFixed(1)}deg) scaleY(${bascule})`,
        opacity: k < 11 ? 1 : 1 - (k - 11) / 5
      });
    }
    fins.push(piece.animate(images, { duration: duree, easing: 'linear', fill: 'forwards' }).finished);
  }
  Promise.allSettled(fins).then(() => couche.remove());
}

/**
 * Curseur glissant d'un groupe de boutons à bascule (`.segmente`) : il suit
 * l'option choisie (`aria-pressed`) au lieu de sauter d'une case à l'autre.
 */
function curseurSegmente(groupe) {
  if (groupe.querySelector(':scope > .curseur')) return;
  const curseur = document.createElement('span');
  curseur.className = 'curseur';
  curseur.setAttribute('aria-hidden', 'true');
  groupe.prepend(curseur);
  groupe.classList.add('avec-curseur');
  const placer = (anime) => {
    const actif = groupe.querySelector('button[aria-pressed="true"]');
    curseur.hidden = !actif;
    if (!actif) return;
    curseur.style.transition = anime ? '' : 'none';
    // Le curseur couvre tout le groupe ; une découpe n'en montre que l'option
    // choisie, et c'est elle qui glisse. Mesurée à l'écran depuis la place du
    // curseur (son retrait dans le groupe vient du style), sans arrondi : des
    // largeurs arrondies laissaient un pixel de jour d'un côté.
    const zone = curseur.getBoundingClientRect();
    const option = actif.getBoundingClientRect();
    const gauche = option.left - zone.left;
    const droite = zone.right - option.right;
    curseur.style.clipPath = `inset(0 ${droite.toFixed(2)}px 0 ${gauche.toFixed(2)}px round var(--rayon-petit))`;
  };
  requestAnimationFrame(() => placer(false));
  const suivi = new MutationObserver(() => placer(true));
  suivi.observe(groupe, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  const taille = new ResizeObserver(() => {
    if (!groupe.isConnected) { taille.disconnect(); suivi.disconnect(); return; }
    placer(false);
  });
  taille.observe(groupe);
}

/** Branche le curseur sur tous les groupes à bascule d'un conteneur. */
export const brancherSegmentes = (racine) => racine.querySelectorAll('.segmente').forEach(curseurSegmente);

/**
 * Réponse d'une case à un geste, posée une fois pour toutes (les vues se
 * redessinent, les écouteurs du document restent) : cochée, elle se gonfle
 * un instant et sa coche se trace (d'après le composant « Task List » de
 * Rare UI). Rien au premier affichage : une case déjà cochée ne rejoue rien.
 */
export function installerReponsesControles() {
  const rejouer = (element, classe) => {
    if (mouvementReduit()) return;
    element.classList.remove(classe);
    void element.offsetWidth;
    element.classList.add(classe);
  };
  document.addEventListener('change', (evenement) => {
    const caseACocher = evenement.target.closest?.('.case');
    if (caseACocher?.checked) rejouer(caseACocher, 'coche-anime');
  });
  document.addEventListener('animationend', (evenement) => {
    const element = evenement.target;
    if (element.classList?.contains('case') && evenement.animationName === 'gonfler-case') element.classList.remove('coche-anime');
  });
}
