/**
 * Champ de date maison, à la place du sélecteur du navigateur : celui-ci
 * change d'aspect d'un navigateur à l'autre, ignore le thème sombre et ne
 * suit pas le format de date choisi dans les paramètres.
 *
 * La date se tape au clavier (« 24/09/2026 », « 24/9/26 », « 24/09 » pour
 * l'année en cours, « 24092026 ») ou se choisit dans un calendrier qui
 * s'ouvre dessous : semaine commençant le lundi, aujourd'hui repéré, flèches
 * du clavier pour se déplacer (Page préc. et Page suiv. changent de mois),
 * Entrée pour choisir, Échap pour refermer.
 *
 * La valeur ISO (AAAA-MM-JJ) vit dans un champ caché qui porte le nom du
 * formulaire : le reste du code la lit et l'écrit comme avant.
 */

import { icone } from './icones.js';
import { formaterDate, dateEnFrancaisLong, analyserDateSouple, aujourdHuiIso, estDateIso, NOMS_MOIS } from '/partage/dates.js';
import { majusculeInitiale } from '/partage/texte.js';

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

const pad = (n) => String(n).padStart(2, '0');
const versIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const depuisIso = (iso) => { const [a, m, j] = iso.split('-').map(Number); return new Date(a, m - 1, j); };
const decaler = (iso, jours) => { const d = depuisIso(iso); d.setDate(d.getDate() + jours); return versIso(d); };
/** Même jour, un autre mois ; le 31 devient le dernier jour d'un mois plus court. */
const decalerMois = (iso, mois) => {
  const d = depuisIso(iso);
  const cible = new Date(d.getFullYear(), d.getMonth() + mois, 1);
  const dernier = new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate();
  cible.setDate(Math.min(d.getDate(), dernier));
  return versIso(cible);
};
const jourSemaine = (iso) => JOURS[(depuisIso(iso).getDay() + 6) % 7];
/** « jeudi 24 septembre 2026 ». */
const enToutesLettres = (iso) => `${jourSemaine(iso)} ${dateEnFrancaisLong(iso)}`.replace(/^(\S+) 1 /, '$1 1er ');

/** Ce qu'on a tapé, en ISO, ou `null`. */
function lireSaisie(texte) {
  const brut = String(texte ?? '').trim();
  const iso = analyserDateSouple(brut);
  if (iso) return iso;
  const sansAnnee = /^(\d{1,2})[/.-](\d{1,2})$/.exec(brut);
  if (sansAnnee) return analyserDateSouple(`${sansAnnee[1]}/${sansAnnee[2]}/${new Date().getFullYear()}`);
  const collee = /^(\d{2})(\d{2})(\d{4})$/.exec(brut);
  if (collee) return analyserDateSouple(`${collee[1]}/${collee[2]}/${collee[3]}`);
  return null;
}

/**
 * Gabarit du champ, à brancher ensuite (`brancherChampDate`).
 *
 * @param {object} options
 * @param {string} options.id identifiant du champ visible (celui du `<label for>`).
 * @param {string} options.nom nom du champ caché qui porte la valeur ISO.
 * @param {string} [options.format] format d'affichage des paramètres.
 */
export const champDate = ({ id, nom, format = 'JJ/MM/AAAA' }) => `
  <div class="champ-date">
    <input class="champ-texte" type="text" id="${id}" inputmode="numeric" autocomplete="off" spellcheck="false"
      placeholder="${format}" role="combobox" aria-haspopup="dialog" aria-expanded="false"
      aria-controls="${id}-calendrier" aria-describedby="${id}-apercu">
    <button type="button" class="btn-icone champ-date-bouton" tabindex="-1" aria-label="Ouvrir le calendrier"
      title="Calendrier">${icone('calendrier', { taille: 16 })}</button>
    <input type="hidden" name="${nom}">
    <div class="calendrier" id="${id}-calendrier" role="dialog" aria-label="Choisir une date" hidden></div>
  </div>
  <small class="apercu-date" id="${id}-apercu"></small>`;

/**
 * Donne vie au champ. La valeur ISO initiale est celle du champ caché.
 *
 * @param {HTMLElement} racine l'élément `.champ-date`.
 * @param {{ format?: string, surChangement?: (iso: string) => void }} [options]
 *   `surChangement` est appelé quand la date est arrêtée (jour choisi dans le
 *   calendrier, ou sortie du champ après l'avoir tapée), si elle a changé.
 */
export function brancherChampDate(racine, { format = 'JJ/MM/AAAA', surChangement } = {}) {
  const saisie = racine.querySelector('.champ-texte');
  const cache = racine.querySelector('input[type="hidden"]');
  const calendrier = racine.querySelector('.calendrier');
  const apercu = document.getElementById(`${saisie.id}-apercu`);
  let focale = cache.value || aujourdHuiIso(); // jour qui a le focus dans la grille
  let arretee = null; // dernière date signalée à `surChangement`
  const signaler = () => {
    if (!surChangement || cache.value === arretee) return;
    arretee = cache.value;
    surChangement(cache.value);
  };

  const montrerApercu = (erreur = false) => {
    apercu.classList.toggle('erreur', erreur);
    apercu.textContent = erreur
      ? `Date non reconnue : saisissez-la sous la forme ${format}.`
      : cache.value ? majusculeInitiale(enToutesLettres(cache.value)) : '';
  };
  const afficher = () => {
    saisie.value = formaterDate(cache.value, format);
    montrerApercu();
  };

  function dessiner() {
    const [annee, mois] = focale.split('-').map(Number);
    const premier = new Date(annee, mois - 1, 1);
    const debut = new Date(annee, mois - 1, 1 - ((premier.getDay() + 6) % 7));
    const aujourdhui = aujourdHuiIso();
    const semaines = Array.from({ length: 6 }, (_, s) => Array.from({ length: 7 }, (__, j) => {
      const iso = versIso(new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + s * 7 + j));
      const classes = [
        Number(iso.slice(5, 7)) !== mois ? 'autre-mois' : '',
        iso === aujourdhui ? 'aujourdhui' : '',
        iso === cache.value ? 'choisi' : ''
      ].filter(Boolean).join(' ');
      return `<td role="gridcell" aria-selected="${iso === cache.value}"><button type="button" data-jour="${iso}"
        class="${classes}" tabindex="${iso === focale ? 0 : -1}"
        aria-label="${enToutesLettres(iso)}${iso === aujourdhui ? ', aujourd’hui' : ''}">${Number(iso.slice(8))}</button></td>`;
    }).join(''));
    const titre = `${majusculeInitiale(NOMS_MOIS[mois - 1])} ${annee}`;
    calendrier.innerHTML = `
      <div class="calendrier-tete">
        <button type="button" class="btn-icone" data-mois="-1" aria-label="Mois précédent">${icone('chevron-gauche', { taille: 16 })}</button>
        <span class="calendrier-titre" aria-live="polite">${titre}</span>
        <button type="button" class="btn-icone" data-mois="1" aria-label="Mois suivant">${icone('chevron-droite', { taille: 16 })}</button>
      </div>
      <table class="calendrier-grille" role="grid" aria-label="${titre}">
        <thead><tr>${JOURS.map((j) => `<th scope="col" abbr="${j}">${j.slice(0, 2)}</th>`).join('')}</tr></thead>
        <tbody>${semaines.map((s) => `<tr>${s}</tr>`).join('')}</tbody>
      </table>
      <div class="calendrier-pied">
        <button type="button" class="lien-bouton" data-jour="${aujourdhui}">Aujourd’hui</button>
      </div>`;
  }

  const dehors = (evenement) => { if (!racine.contains(evenement.target)) fermer(); };
  function ouvrir({ focusGrille = false } = {}) {
    focale = cache.value || aujourdHuiIso();
    dessiner();
    if (calendrier.hidden) {
      calendrier.hidden = false;
      saisie.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', dehors, true);
      calendrier.scrollIntoView({ block: 'nearest' });
    }
    if (focusGrille) calendrier.querySelector(`[data-jour="${focale}"]`)?.focus();
  }
  function fermer({ rendreFocus = false } = {}) {
    if (calendrier.hidden) return;
    calendrier.hidden = true;
    saisie.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', dehors, true);
    if (rendreFocus) saisie.focus();
  }
  function choisir(iso) {
    cache.value = iso;
    afficher();
    fermer({ rendreFocus: true });
    signaler();
  }
  /** Le focus passe à un autre jour ; la grille suit s'il change de mois. */
  function deplacer(iso) {
    const memeMois = iso.slice(0, 7) === focale.slice(0, 7);
    focale = iso;
    if (!memeMois) dessiner();
    else {
      calendrier.querySelectorAll('[data-jour]').forEach((b) => { b.tabIndex = b.dataset.jour === iso && b.closest('td') ? 0 : -1; });
    }
    calendrier.querySelector(`td [data-jour="${iso}"]`)?.focus();
  }

  // ---- Saisie au clavier
  saisie.addEventListener('click', () => ouvrir());
  racine.querySelector('.champ-date-bouton').addEventListener('click', () => {
    if (calendrier.hidden) ouvrir({ focusGrille: true }); else fermer({ rendreFocus: true });
  });
  saisie.addEventListener('input', () => {
    const iso = lireSaisie(saisie.value);
    cache.value = iso ?? '';
    montrerApercu();
    if (iso && !calendrier.hidden) { focale = iso; dessiner(); }
  });
  saisie.addEventListener('blur', () => {
    if (cache.value) afficher(); else montrerApercu(saisie.value.trim() !== '');
    // Une saisie illisible ne remplace pas la date arrêtée ; un champ vidé, si.
    if (cache.value || saisie.value.trim() === '') signaler();
  });
  saisie.addEventListener('keydown', (evenement) => {
    if (evenement.key === 'ArrowDown') {
      evenement.preventDefault();
      ouvrir({ focusGrille: true });
    } else if (evenement.key === 'Escape' && !calendrier.hidden) {
      // Échap referme le calendrier, pas le panneau qui le contient.
      evenement.preventDefault();
      evenement.stopPropagation();
      fermer();
    } else if (evenement.key === 'Tab') {
      fermer();
    }
  });

  // ---- Calendrier
  calendrier.addEventListener('click', (evenement) => {
    const jour = evenement.target.closest('[data-jour]');
    if (jour) { choisir(jour.dataset.jour); return; }
    const mois = evenement.target.closest('[data-mois]');
    if (mois) {
      focale = decalerMois(focale, Number(mois.dataset.mois));
      dessiner();
      // Le bouton vient d'être redessiné : son remplaçant reprend le focus.
      calendrier.querySelector(`[data-mois="${mois.dataset.mois}"]`).focus();
    }
  });
  calendrier.addEventListener('keydown', (evenement) => {
    const touches = {
      ArrowLeft: () => decaler(focale, -1),
      ArrowRight: () => decaler(focale, 1),
      ArrowUp: () => decaler(focale, -7),
      ArrowDown: () => decaler(focale, 7),
      PageUp: () => decalerMois(focale, evenement.shiftKey ? -12 : -1),
      PageDown: () => decalerMois(focale, evenement.shiftKey ? 12 : 1),
      Home: () => decaler(focale, -((depuisIso(focale).getDay() + 6) % 7)),
      End: () => decaler(focale, 6 - ((depuisIso(focale).getDay() + 6) % 7))
    };
    if (evenement.key === 'Escape') {
      evenement.preventDefault();
      evenement.stopPropagation();
      fermer({ rendreFocus: true });
      return;
    }
    if (evenement.key === 'Tab') {
      // Le calendrier se parcourt aux flèches ; Tab le quitte.
      fermer({ rendreFocus: true });
      return;
    }
    const jour = evenement.target.closest('[data-jour]');
    if (jour && (evenement.key === 'Enter' || evenement.key === ' ')) {
      evenement.preventDefault();
      choisir(jour.dataset.jour);
      return;
    }
    const cible = touches[evenement.key];
    if (!cible || !evenement.target.closest('td')) return;
    evenement.preventDefault();
    deplacer(cible());
  });

  if (!estDateIso(cache.value)) cache.value = '';
  arretee = cache.value;
  afficher();
}
