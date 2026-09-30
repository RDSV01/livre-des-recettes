/**
 * Liste des sauvegardes et leur restauration, partagées par les paramètres
 * et par l'écran de récupération affiché au démarrage (données illisibles ou
 * disparues).
 */

import { api } from './api.js';
import { echapperHtml, confirmer, poidsLisible, toast } from './ui.js';
import { patienter } from './retours.js';
import { icone } from './icones.js';

/** Ce qu'est une sauvegarde, d'après son nom de fichier. */
function nature(fichier) {
  if (fichier.endsWith('-copie-de-secours.json')) return ['Copie de secours', 'mise à jour à chaque saisie', 'bouclier'];
  if (fichier.endsWith('-avant-import.json')) return ['Avant un import CSV', '', 'historique'];
  if (fichier.endsWith('-avant-restauration.json')) return ['Avant une restauration', '', 'historique'];
  if (fichier.endsWith('-avant-remise-a-zero.json')) return ['Avant la remise à zéro', '', 'historique'];
  if (fichier.endsWith('-avant-reprise.json')) return ['Avant la reprise d’une sauvegarde', '', 'historique'];
  return ['Sauvegarde du jour', '', 'historique'];
}

/** Une ligne par sauvegarde : nature, date, poids et bouton « Restaurer ». */
export function listeSauvegardes(sauvegardes) {
  return sauvegardes.map((s) => {
    const [quoi, precision, nomIcone] = nature(s.fichier);
    const quand = new Date(s.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    return `<div class="ligne-gestion">
      ${icone(nomIcone, { taille: 17 })}
      <span class="quoi" title="${echapperHtml(s.fichier)}"><strong>${quoi}</strong> <span class="attenue">· ${precision || poidsLisible(s.taille)}</span></span>
      <span class="quand">${echapperHtml(quand)}</span>
      <button type="button" class="btn btn-petit" data-fichier="${echapperHtml(s.fichier)}">${icone('restaurer', { taille: 15 })}Restaurer</button>
    </div>`;
  }).join('');
}

/**
 * Branche les boutons « Restaurer » d'une zone, par délégation. Après
 * confirmation, la sauvegarde est restaurée puis la page rechargée,
 * l'application repartant alors des données restaurées.
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
      boutonOk: 'Restaurer',
      danger: false,
      iconeOk: 'restaurer'
    });
    if (!accord) return;
    const reprendre = patienter(bouton, 'Restauration…');
    try {
      await api.restaurerSauvegarde(fichier);
      window.location.reload();
    } catch (erreur) {
      reprendre();
      toast(erreur.message, 'erreur');
    }
  });
}
