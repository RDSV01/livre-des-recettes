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

/** « 9 h 02 » ; « jeudi 19, 14 h 10 » cette semaine ; « 12/10/2026 » au-delà. */
function quandLisible(date, groupe) {
  const heure = date.toLocaleTimeString('fr-FR', { hour: 'numeric', minute: '2-digit' }).replace(':', ' h ');
  if (groupe === 'jour') return heure;
  if (groupe === 'semaine') return `${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })}, ${heure}`;
  return date.toLocaleDateString('fr-FR', { dateStyle: 'short' });
}

/** Le groupe d'une sauvegarde dans la frise : aujourd'hui, cette semaine, ce mois-ci, plus ancien. */
function groupeDe(date, maintenant = new Date()) {
  const minuit = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  // Arrondi : un changement d'heure entre les deux dates décale l'écart d'une heure.
  const jours = Math.round((minuit - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 864e5);
  if (jours <= 0) return 'jour';
  if (jours < 7) return 'semaine';
  if (jours < 31) return 'mois';
  return 'ancien';
}
const TITRES_GROUPES = { jour: 'Aujourd’hui', semaine: 'Cette semaine', mois: 'Ce mois-ci', ancien: 'Plus anciennes' };

/**
 * Les sauvegardes rangées dans le temps, sur une frise : aujourd'hui, cette
 * semaine, ce mois-ci, puis les plus anciennes, repliées. Chacune dit ce qui
 * l'a déclenchée ; « Restaurer » se montre au survol.
 */
export function listeSauvegardes(sauvegardes) {
  const groupes = new Map();
  for (const s of sauvegardes) {
    const date = new Date(s.date);
    const groupe = groupeDe(date);
    if (!groupes.has(groupe)) groupes.set(groupe, []);
    groupes.get(groupe).push({ ...s, dateLue: date });
  }
  const ligne = (s, groupe) => {
    const [quoi, precision, nomIcone] = nature(s.fichier);
    return `<li class="ligne-gestion">
      <span class="point-frise" aria-hidden="true">${icone(nomIcone, { taille: 13 })}</span>
      <span class="quoi" title="${echapperHtml(s.fichier)}"><strong>${quoi}</strong><span class="attenue">, ${precision || poidsLisible(s.taille)}</span></span>
      <span class="quand">${echapperHtml(quandLisible(s.dateLue, groupe))}</span>
      <button type="button" class="btn btn-petit" data-fichier="${echapperHtml(s.fichier)}">${icone('restaurer', { taille: 15 })}Restaurer</button>
    </li>`;
  };
  return `<div class="frise-sauvegardes">${['jour', 'semaine', 'mois', 'ancien'].filter((g) => groupes.has(g)).map((g) => {
    const liste = `<ol class="liste-frise">${groupes.get(g).map((s) => ligne(s, g)).join('')}</ol>`;
    return g === 'ancien'
      ? `<details class="sauvegardes-anciennes"><summary>${icone('chevron-bas', { taille: 15 })}${TITRES_GROUPES[g]} <span class="attenue">(${groupes.get(g).length})</span></summary>${liste}</details>`
      : `<p class="groupe-sauvegardes">${TITRES_GROUPES[g]}</p>${liste}`;
  }).join('')}</div>`;
}

/** Ce qui est gardé, d'un regard : chaque jour 14 jours, chaque semaine 2 mois, chaque mois 1 an. */
export const barreConservation = () => `<div class="barre-conservation" aria-label="Ce qui est gardé : chaque jour pendant 14 jours, chaque semaine pendant 2 mois, chaque mois pendant 1 an" role="img">
    <span class="seg-jours"><strong>14 jours</strong>chaque jour</span>
    <span class="seg-semaines"><strong>2 mois</strong>chaque semaine</span>
    <span class="seg-mois"><strong>1 an</strong>chaque mois</span>
  </div>`;

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
      suites: [
        { garde: `Les données reviennent à l’état de « ${fichier} »` },
        { garde: 'Le livre actuel est d’abord mis de côté : rien n’est effacé' }
      ],
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
