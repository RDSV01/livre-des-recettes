/**
 * Autocomplétion maison, à la place de la liste du navigateur : suggestions
 * sous le champ, partie tapée soulignée, flèches pour choisir, Entrée pour
 * valider, Échap pour fermer. Chaque suggestion peut porter du contexte
 * (SIRET, nombre d'encaissements) et remplir d'autres champs une fois choisie.
 *
 * Suit le motif « combobox » de l'ARIA : le focus reste dans le champ, la
 * suggestion active est annoncée par `aria-activedescendant`.
 */

import { echapperHtml, identifiantUnique } from './ui.js';
import { surlignageGlissant } from './glisseur.js';
import { normaliserTexte } from '/partage/texte.js';

/** Minuscules sans accents, à longueur égale : les positions restent celles du texte d'origine. */
const pourSurligner = (texte) => String(texte ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Entoure de `<mark>` la partie du texte qui correspond à la saisie. */
export function surligner(texte, saisie) {
  const t = pourSurligner(texte);
  const s = pourSurligner(saisie.trim());
  const i = s && t.length === texte.length ? t.indexOf(s) : -1;
  if (i < 0) return echapperHtml(texte);
  return `${echapperHtml(texte.slice(0, i))}<mark>${echapperHtml(texte.slice(i, i + s.length))}</mark>${echapperHtml(texte.slice(i + s.length))}`;
}

/** Le champ rempli pour l'utilisateur s'éclaire brièvement. */
export function eclairer(champ) {
  champ.classList.remove('rempli');
  void champ.offsetWidth;
  champ.classList.add('rempli');
}

/**
 * @param {HTMLInputElement} champ
 * @param {object} options
 * @param {() => object[]} options.source éléments proposables, déjà triés par pertinence
 * @param {(e: object) => string} options.texte texte cherché et inscrit dans le champ
 * @param {(e: object, saisie: string) => string} options.rendu contenu HTML d'une suggestion
 * @param {(e: object) => void} [options.surChoix]
 * @param {(saisie: string, trouves: object[]) => object|null} [options.extra]
 *   suggestion ajoutée en fin de liste (`{ extra: true, rendu, action }` :
 *   créer, rechercher).
 * @param {number} [options.max]
 * @returns {{ fermer: () => void }}
 */
export function autocompletion(champ, { source, texte, rendu, surChoix, extra, max = 6 }) {
  const idListe = identifiantUnique('suggestions');
  const liste = document.createElement('ul');
  liste.className = 'suggestions';
  liste.id = idListe;
  liste.setAttribute('role', 'listbox');
  liste.hidden = true;
  champ.parentElement.classList.add('avec-suggestions');
  champ.after(liste);
  // Un seul surlignage, qui glisse d'une suggestion à l'autre.
  const surlignage = surlignageGlissant(liste, { classe: 'choix' });
  const placerSurlignage = () => { if (!liste.hidden) surlignage.placer(liste.querySelector('[aria-selected="true"]')); };
  champ.setAttribute('role', 'combobox');
  champ.setAttribute('aria-autocomplete', 'list');
  champ.setAttribute('aria-controls', idListe);
  champ.setAttribute('aria-expanded', 'false');
  champ.setAttribute('autocomplete', 'off');

  let elements = [];
  let actif = -1;

  function calculer() {
    const saisie = champ.value;
    const s = normaliserTexte(saisie);
    const tous = source();
    const debut = [];
    const dedans = [];
    for (const e of tous) {
      const t = normaliserTexte(texte(e));
      if (t.startsWith(s)) debut.push(e);
      else if (t.includes(s)) dedans.push(e);
      if (debut.length >= max) break;
    }
    elements = [...debut, ...dedans].slice(0, max);
    const ajout = extra?.(saisie, elements);
    if (ajout) elements.push(ajout);
  }

  function dessiner() {
    const saisie = champ.value;
    liste.innerHTML = elements.map((e, i) => `<li role="option" id="${idListe}-${i}" data-i="${i}"
        class="sugg${e.extra ? ' extra' : ''}" aria-selected="${i === actif}">${e.extra ? e.rendu : rendu(e, saisie)}</li>`).join('');
    if (actif >= 0) champ.setAttribute('aria-activedescendant', `${idListe}-${actif}`);
    else champ.removeAttribute('aria-activedescendant');
    placerSurlignage();
  }

  function ouvrir() {
    calculer();
    if (!elements.length) { fermer(); return; }
    actif = champ.value.trim() && !elements[0].extra ? 0 : -1;
    dessiner();
    if (liste.hidden) {
      // La liste se place juste sous le champ, quoi qu'il y ait autour.
      liste.style.top = `${champ.offsetTop + champ.offsetHeight + 6}px`;
      liste.hidden = false;
      liste.classList.remove('entre');
      void liste.offsetWidth;
      liste.classList.add('entre');
      placerSurlignage();
    }
    champ.setAttribute('aria-expanded', 'true');
  }

  function fermer() {
    liste.hidden = true;
    actif = -1;
    surlignage.oublier();
    champ.setAttribute('aria-expanded', 'false');
    champ.removeAttribute('aria-activedescendant');
  }

  function choisir(i) {
    const e = elements[i];
    if (!e) return;
    fermer();
    if (e.extra) { e.action(); return; }
    champ.value = texte(e);
    // Prévient les écouteurs du champ, sans rouvrir la liste (voir plus bas).
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    eclairer(champ);
    surChoix?.(e);
  }

  champ.addEventListener('focus', ouvrir);
  champ.addEventListener('input', (evenement) => { if (evenement.isTrusted) ouvrir(); });
  champ.addEventListener('blur', () => setTimeout(fermer, 120));
  champ.addEventListener('keydown', (evenement) => {
    if (liste.hidden) {
      if (evenement.key === 'ArrowDown') { evenement.preventDefault(); ouvrir(); }
      return;
    }
    if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      const pas = evenement.key === 'ArrowDown' ? 1 : -1;
      actif = (actif + pas + elements.length) % elements.length;
      dessiner();
      liste.querySelector(`[data-i="${actif}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (evenement.key === 'Enter' && (evenement.ctrlKey || evenement.metaKey)) {
      // Ctrl+Entrée enregistre la saisie telle qu'elle est tapée.
      fermer();
    } else if (evenement.key === 'Enter' && actif >= 0) {
      evenement.preventDefault();
      choisir(actif);
    } else if (evenement.key === 'Escape') {
      // Ne ferme que la liste, pas le panneau de saisie.
      evenement.preventDefault();
      evenement.stopPropagation();
      fermer();
    } else if (evenement.key === 'Tab') {
      fermer();
    }
  });
  // `mousedown` plutôt que `click` : le choix passe avant que le champ perde le focus.
  liste.addEventListener('mousedown', (evenement) => {
    const li = evenement.target.closest('[data-i]');
    if (!li) return;
    evenement.preventDefault();
    choisir(Number(li.dataset.i));
  });
  liste.addEventListener('mousemove', (evenement) => {
    const li = evenement.target.closest('[data-i]');
    if (!li || Number(li.dataset.i) === actif) return;
    actif = Number(li.dataset.i);
    liste.querySelectorAll('[aria-selected]').forEach((x) => x.setAttribute('aria-selected', String(x === li)));
    champ.setAttribute('aria-activedescendant', li.id);
    placerSurlignage();
  });

  return { fermer };
}
