/**
 * Thème clair ou sombre.
 *
 * Le choix est retenu dans le navigateur (`ldr-theme`, « light » ou
 * « dark », la même clé depuis la v1) ; sans choix, l'application suit le
 * système. Le thème est posé dès l'en-tête de la page (voir `index.html`),
 * avant le premier rendu : aucun éclair clair au démarrage en sombre.
 *
 * Le nouveau thème se révèle en cercle depuis le bouton qui l'a demandé.
 */

import { mouvementReduit } from './ui.js';

const CLE_THEME = 'ldr-theme';

/** Thème courant : « light » ou « dark ». */
export const themeCourant = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

/** Le thème que l'utilisateur a explicitement choisi, ou `null` s'il suit le système. */
export const themeChoisi = () => {
  try { return localStorage.getItem(CLE_THEME); } catch { return null; }
};

const themeSysteme = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/**
 * Applique un thème sans le retenir : l'accueil guidé s'affiche toujours en
 * clair, sans imposer ce choix pour la suite.
 */
export function appliquerThemeEphemere(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  window.dispatchEvent(new Event('theme-modifie'));
}

/** Revient au thème choisi par l'utilisateur, ou à défaut à celui du système. */
export function revenirAuThemeParDefaut() {
  appliquerThemeEphemere(themeChoisi() ?? themeSysteme());
}

/** Applique un thème, le retient, et prévient l'interface (bouton du menu). */
function appliquerTheme(theme) {
  const valide = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = valide;
  try { localStorage.setItem(CLE_THEME, valide); } catch { /* stockage indisponible : sans gravité */ }
  window.dispatchEvent(new Event('theme-modifie'));
}

/**
 * Passe à l'autre thème, révélé en cercle à partir de `origine` (le bouton
 * cliqué) quand le navigateur sait animer une transition de page.
 */
export function basculerTheme(origine) {
  const suivant = themeCourant() === 'dark' ? 'light' : 'dark';
  const racine = document.documentElement;
  if (!document.startViewTransition || mouvementReduit() || !origine) {
    appliquerTheme(suivant);
    return;
  }
  const r = origine.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const rayon = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  racine.classList.add('bascule-theme-en-cours');
  const transition = document.startViewTransition(() => appliquerTheme(suivant));
  transition.ready.then(() => racine.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rayon}px at ${x}px ${y}px)`] },
    { duration: 560, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' }
  )).catch(() => { /* transition interrompue : le thème est tout de même appliqué */ });
  transition.finished.finally(() => racine.classList.remove('bascule-theme-en-cours'));
}
