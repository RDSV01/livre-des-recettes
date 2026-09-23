/**
 * Liste des sauvegardes et leur restauration, partagées par les paramètres
 * et par l'écran de récupération affiché au démarrage (données illisibles ou
 * disparues).
 */

import { api } from './api.js';
import { echapperHtml, toast, confirmer } from './ui.js';
import { icone } from './icones.js';

/** Une ligne par sauvegarde : nom, date, taille et bouton « Restaurer ». */
export function listeSauvegardes(sauvegardes) {
  return sauvegardes.map((s) => `
    <div class="ligne-gestion">
      <span class="libelle-gestion">${echapperHtml(s.fichier)}</span>
      <span class="details-gestion">${echapperHtml(new Date(s.date).toLocaleString('fr-FR'))} (${Math.max(1, Math.round(s.taille / 1024))} Ko)</span>
      <button type="button" class="btn btn-secondaire" data-fichier="${echapperHtml(s.fichier)}">
        ${icone('reinitialiser', { taille: 16 })}<span>Restaurer</span>
      </button>
    </div>`).join('');
}

/**
 * Branche les boutons « Restaurer » d'une zone, par délégation : la liste
 * peut être redessinée sans rien rebrancher. Après confirmation, la
 * sauvegarde est restaurée puis la page rechargée, l'application repartant
 * alors des données restaurées.
 */
export function brancherRestauration(zone) {
  zone.addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('[data-fichier]');
    if (!bouton) return;
    const fichier = bouton.dataset.fichier;
    const accord = await confirmer({
      titre: 'Restaurer cette sauvegarde ?',
      message: `Les données reviendront à l’état de « ${fichier} ». ` +
        'Le fichier actuel est d’abord mis de côté : rien n’est effacé.',
      boutonOk: 'Restaurer'
    });
    if (!accord) return;
    try {
      await api.restaurerSauvegarde(fichier);
      window.location.reload();
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
  });
}
