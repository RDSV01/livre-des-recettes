/**
 * Panneau latéral : il glisse depuis la droite, la liste reste visible
 * derrière. Sert aux saisies (recette, achat) et à l'aperçu d'un PDF joint.
 *
 * C'est un `<dialog>` modal : le navigateur y garde le focus, rend le reste de
 * la page inerte et ferme à la touche Échap. Le panneau prend lui-même le
 * focus à l'ouverture, pas son premier champ : les suggestions d'un champ ne
 * s'ouvrent ainsi qu'au premier clic.
 */

import { confirmer, mouvementReduit } from './ui.js';

/**
 * Ouvre un panneau.
 *
 * @param {string} contenu balisage du panneau (en-tête, corps, pied). Tout
 *   bouton `[data-fermer]` le referme.
 * @param {object} [options]
 * @param {string} [options.classe] classe en plus (`large` pour un aperçu).
 * @param {string} [options.idTitre] identifiant du titre, qui nomme le panneau.
 * @param {() => string} [options.lireEtat] instantané des champs : s'il a
 *   changé depuis l'ouverture, abandonner la saisie demande confirmation.
 * @returns {{ element: HTMLDialogElement, fermer: (sansGarde?: boolean) => Promise<boolean>, memoriser: () => void }}
 */
export function ouvrirPanneau(contenu, { classe = '', idTitre = '', lireEtat = null } = {}) {
  document.querySelector('dialog.panneau[open]')?.close();
  const element = document.createElement('dialog');
  element.className = `panneau ${classe}`.trim();
  element.tabIndex = -1;
  element.autofocus = true;
  if (idTitre) element.setAttribute('aria-labelledby', idTitre);
  element.innerHTML = contenu;
  document.body.append(element);

  const origine = document.activeElement;
  let etatInitial = lireEtat?.() ?? '';
  let enFermeture = false;

  /** Referme le panneau ; faux si l'utilisateur a préféré garder sa saisie. */
  async function fermer(sansGarde = false) {
    if (enFermeture) return true;
    if (!sansGarde && lireEtat && lireEtat() !== etatInitial) {
      const accord = await confirmer({
        titre: 'Abandonner cette saisie ?',
        message: 'Les informations du formulaire seront perdues.',
        boutonOk: 'Abandonner'
      });
      if (!accord) return false;
    }
    enFermeture = true;
    const retirer = () => {
      element.close();
      element.remove();
      if (origine instanceof HTMLElement && origine.isConnected) origine.focus({ preventScroll: true });
    };
    if (mouvementReduit()) {
      retirer();
    } else {
      element.classList.add('ferme');
      setTimeout(retirer, 200);
    }
    return true;
  }

  element.addEventListener('cancel', (evenement) => {
    evenement.preventDefault();
    fermer();
  });
  element.addEventListener('click', (evenement) => {
    if (evenement.target.closest('[data-fermer]')) fermer();
  });
  // Un clic sur le voile (hors du panneau) vaut « fermer ».
  element.addEventListener('mousedown', (evenement) => {
    if (evenement.target !== element) return;
    const r = element.getBoundingClientRect();
    const dehors = evenement.clientX < r.left || evenement.clientX > r.right ||
      evenement.clientY < r.top || evenement.clientY > r.bottom;
    if (dehors) fermer();
  });

  element.showModal();
  // Filet pour les navigateurs qui donnent le focus au premier bouton malgré
  // `autofocus` : le panneau le reprend.
  element.focus({ preventScroll: true });
  return {
    element,
    fermer,
    /** Prend l'état actuel des champs comme référence (après remplissage). */
    memoriser: () => { etatInitial = lireEtat?.() ?? ''; }
  };
}

/** Referme sans rien demander le panneau éventuellement ouvert (changement de page). */
export function fermerPanneauOuvert() {
  const ouvert = document.querySelector('dialog.panneau');
  if (!ouvert) return;
  if (ouvert.open) ouvert.close();
  ouvert.remove();
}
