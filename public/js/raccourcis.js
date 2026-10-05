/**
 * Raccourcis clavier de toute l'application, et leur liste, affichée dans les
 * paramètres (section « Raccourcis clavier »).
 *
 * Les touches seules (N, A, /, ?) n'agissent pas pendant une saisie : dans un
 * champ, elles s'écrivent. Ctrl+K, lui, marche partout, sauf dans une boîte
 * de dialogue ouverte.
 */

import { registreAchatsUtile } from './etat.js';
import { echapperHtml, fermerMenu, allerA } from './ui.js';

/**
 * Les raccourcis, par contexte. Chaque touche est une suite de `<kbd>` ; « ou »
 * sépare deux possibilités.
 */
const RACCOURCIS = () => [
  {
    titre: 'Partout',
    lignes: [
      [['Ctrl', 'K'], 'Rechercher dans tout le livre : pages, clients, recettes, achats'],
      [['N'], 'Nouvelle recette'],
      ...(registreAchatsUtile() ? [[['A'], 'Nouvel achat']] : []),
      [['/'], 'Aller à la recherche de la page'],
      [['?'], 'Afficher cette liste'],
      [['Ctrl', 'Z'], 'Annuler la dernière action'],
      [['Ctrl', 'Y'], 'Rétablir l’action annulée']
    ]
  },
  {
    titre: 'Dans un panneau de saisie',
    lignes: [
      [['Entrée'], 'Ajouter, ou enregistrer la modification'],
      [['Ctrl', 'Entrée'], 'Ajouter et en saisir une autre, à la même date'],
      [['Échap'], 'Fermer le panneau']
    ]
  },
  {
    titre: 'Dans un champ de date',
    lignes: [
      [['+'], 'Jour suivant'],
      [['−'], 'Jour précédent'],
      [['A'], 'Aujourd’hui'],
      [['↓'], 'Ouvrir le calendrier, puis choisir aux flèches']
    ]
  }
];

/** La liste en HTML, pour les paramètres. */
export const listeRaccourcis = () => RACCOURCIS().map((groupe) => `
  <div class="groupe-raccourcis">
    <h3>${groupe.titre}</h3>
    <dl>${groupe.lignes.map(([touches, effet]) => `<div class="raccourci">
        <dt>${touches.map((t) => `<kbd>${echapperHtml(t)}</kbd>`).join('<span class="plus" aria-hidden="true">+</span>')}</dt>
        <dd>${echapperHtml(effet)}</dd></div>`).join('')}</dl>
  </div>`).join('');

/** Vrai quand la touche s'écrit dans un champ plutôt que de déclencher un raccourci. */
const enSaisie = (cible) => cible instanceof Element &&
  Boolean(cible.closest('input, textarea, select, [contenteditable="true"]'));

/**
 * Pose les raccourcis, une fois pour toutes.
 *
 * @param {object} options
 * @param {() => boolean} options.disponibles faux pendant l'accueil guidé ou
 *   l'écran de récupération : rien ne doit alors mener ailleurs.
 * @param {() => void} options.rechercher ouvre la recherche dans tout le livre.
 */
export function installerRaccourcis({ disponibles, rechercher }) {
  window.addEventListener('keydown', (evenement) => {
    if (evenement.defaultPrevented || evenement.repeat || !disponibles()) return;
    if (document.querySelector('dialog[open]')) return;
    const touche = evenement.key;

    if ((evenement.ctrlKey || evenement.metaKey) && !evenement.altKey && touche.toLowerCase() === 'k') {
      evenement.preventDefault();
      fermerMenu();
      rechercher();
      return;
    }
    if (evenement.ctrlKey || evenement.metaKey || evenement.altKey || enSaisie(evenement.target)) return;

    const page = window.location.hash.replace(/^#\/?/, '').split('?')[0];
    /** Ouvre un panneau de saisie : sur place si sa page est affichée, sinon en y allant. */
    const nouvelle = (route, bouton, parametre) => {
      const ici = page === route && document.getElementById(bouton);
      if (ici) ici.click();
      else allerA(`#/${route}?${parametre}=1`);
    };
    const agir = (action) => {
      evenement.preventDefault();
      // Un menu ouvert (« … », liste des années) se referme d'abord.
      fermerMenu();
      action();
    };

    if (touche === 'n' || touche === 'N') {
      agir(() => nouvelle('recettes', 'nouvelle-recette', 'nouvelle'));
    } else if ((touche === 'a' || touche === 'A') && registreAchatsUtile()) {
      agir(() => nouvelle('achats', 'nouvel-achat', 'nouveau'));
    } else if (touche === '/') {
      agir(() => {
        const champ = document.querySelector('#vue input[type="search"]');
        if (champ) { champ.focus(); champ.select(); } else rechercher();
      });
    } else if (touche === '?') {
      agir(() => allerA('#/parametres?section=raccourcis'));
    }
  });
}
