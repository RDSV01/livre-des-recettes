/**
 * Surlignage qui glisse d'une ligne à l'autre dans une liste (menus, liste
 * des années, suggestions de saisie, recherche) au lieu de clignoter sur
 * chacune : un seul fond, découpé à la place de la ligne visée, qui rejoint
 * la suivante. Quitté puis retrouvé, il repart d'où on l'a laissé.
 * D'après le composant « Glide Select » de React Bits (reactbits.dev).
 *
 * Le fond couvre toute la liste, défilement compris ; seule sa découpe bouge
 * (ni largeur ni hauteur animées), comme la surbrillance du menu.
 */

import { RESSORT_VIF } from './ressort.js';
import { mouvementReduit } from './ui.js';

/**
 * @param {HTMLElement} liste conteneur des lignes, positionné (relative,
 *   absolute ou fixed) : les lignes s'y mesurent.
 * @param {{ classe?: string }} [options] classe du fond (sa couleur).
 * @returns {{ placer: (ligne: HTMLElement|null, options?: { ton?: string }) => void, oublier: () => void }}
 *   `placer(null)` efface le fond, qui garde sa dernière place.
 */
export function surlignageGlissant(liste, { classe = '' } = {}) {
  liste.classList.add('avec-surlignage');
  let fond = null;
  /** La dernière découpe montrée : le fond y revient avant de glisser. */
  let derniere = null;
  /** Montré au dernier appel : une liste redessinée le retrouve sans fondu. */
  let montre = false;

  /** Le fond, recréé si la liste a été redessinée (une liste de suggestions l'est à chaque frappe). */
  const assurer = () => {
    if (fond?.parentElement === liste) return false;
    fond = document.createElement(liste.tagName === 'UL' ? 'li' : 'span');
    fond.className = `surlignage${classe ? ` ${classe}` : ''}`;
    fond.setAttribute('aria-hidden', 'true');
    if (liste.tagName === 'UL') fond.setAttribute('role', 'presentation');
    liste.prepend(fond);
    return true;
  };

  return {
    placer(ligne, { ton = '' } = {}) {
      const recree = assurer();
      if (!ligne) { fond.classList.remove('visible'); montre = false; return; }
      // Mesuré sans lui : sa hauteur précédente allongerait la liste.
      fond.style.height = '0';
      const hauteur = liste.scrollHeight;
      fond.style.height = `${hauteur}px`;
      const largeur = fond.offsetWidth;
      const decoupe = `inset(${ligne.offsetTop}px ${largeur - ligne.offsetLeft - ligne.offsetWidth}px `
        + `${hauteur - ligne.offsetTop - ligne.offsetHeight}px ${ligne.offsetLeft}px round var(--rayon-petit))`;
      fond.classList.toggle('danger', ton === 'danger');
      const visible = fond.classList.contains('visible');
      if (mouvementReduit() || !derniere) {
        // Première apparition : sur place, en fondu.
        fond.style.transition = mouvementReduit() ? 'none' : 'opacity 120ms ease';
        fond.style.clipPath = decoupe;
      } else {
        // Revenu (ou redessiné) : il réapparaît où on l'a laissé, puis glisse.
        if (!visible) {
          fond.style.transition = 'none';
          fond.style.clipPath = derniere;
          if (recree && montre) fond.classList.add('visible');
          void fond.offsetWidth;
        }
        fond.style.transition = `clip-path ${RESSORT_VIF.duree}ms ${RESSORT_VIF.easing}, opacity 120ms ease`;
        fond.style.clipPath = decoupe;
      }
      fond.classList.add('visible');
      derniere = decoupe;
      montre = true;
    },

    /** Oublie la dernière place : la prochaine apparition se fait sur place (liste refermée puis rouverte). */
    oublier() {
      derniere = null;
      montre = false;
      fond?.classList.remove('visible');
    }
  };
}
