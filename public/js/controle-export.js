/**
 * Contrôle animé qui précède un export.
 *
 * Avant de télécharger un registre, l'application repasse devant l'utilisateur
 * les points qu'un contrôleur regarderait : mentions obligatoires, continuité
 * de la numérotation, doublons. Les points s'affichent l'un après l'autre,
 * assez lentement pour être lus : c'est le rôle de cet écran, rassurer avant
 * d'imprimer un document qui engage.
 *
 * Le contrôle n'interdit jamais l'export. Il éclaire, l'utilisateur décide.
 */

import { api } from './api.js';
import { icone } from './icones.js';
import { echapperHtml, dialogueTemporaire, mouvementReduit } from './ui.js';

/** Temps entre deux points, assez long pour suivre des yeux. */
const DELAI_POINT = 260;

const pause = (ms) => new Promise((suite) => setTimeout(suite, ms));

/** Icône et couleur d'un état de contrôle. */
const APPARENCE = {
  ok: { icone: 'cercle-valide', classe: 'ok' },
  attention: { icone: 'cercle-alerte', classe: 'attention' },
  erreur: { icone: 'cercle-alerte', classe: 'erreur' }
};

/** Phrase de conclusion, selon ce que le contrôle a trouvé. */
function conclusion(points, nombre) {
  if (nombre === 0) {
    return { classe: 'attention', texte: 'Aucune ligne sur cette période : le document sera vide.' };
  }
  const erreurs = points.filter((p) => p.etat === 'erreur').length;
  const attentions = points.filter((p) => p.etat === 'attention').length;
  if (erreurs > 0) {
    return {
      classe: 'erreur',
      texte: `${erreurs} mention${erreurs > 1 ? 's' : ''} obligatoire${erreurs > 1 ? 's' : ''} manque${erreurs > 1 ? 'nt' : ''}. Corrigez avant de présenter ce registre.`
    };
  }
  if (attentions > 0) {
    return {
      classe: 'attention',
      texte: `${attentions} point${attentions > 1 ? 's' : ''} à regarder. Rien n’empêche l’export.`
    };
  }
  return { classe: 'ok', texte: 'Tout est en ordre : le registre est complet et cohérent.' };
}

/**
 * Ouvre le contrôle, joue les points un par un, puis laisse l'utilisateur
 * lancer ou annuler le téléchargement.
 *
 * @param {object} options
 * @param {string} options.titre nom du document contrôlé.
 * @param {string} options.periodeLisible « Année 2026 », « Mars 2026 »…
 * @param {object} options.periode `{ annee, mois }` transmise à l'API.
 * @param {string} [options.registre] `''` pour les recettes, `'/achats'`.
 * @returns {Promise<boolean>} vrai si l'utilisateur confirme le téléchargement.
 */
export function controlerAvantExport({ titre, periodeLisible, periode, registre = '' }) {
  // Le focus retourne au bouton de format d'où le contrôle est parti.
  const { dialogue, reponse } = dialogueTemporaire((idTitre) => `
    <div class="corps-dialogue">
      <h2 id="${idTitre}">Vérification avant export</h2>
      <p class="sous-titre-controle">${echapperHtml(titre)} · ${echapperHtml(periodeLisible)}</p>
      <ul class="liste-controle" aria-live="polite"></ul>
      <p class="conclusion-controle" hidden></p>
      <div class="pied-dialogue">
        <button type="button" class="btn btn-secondaire" data-role="annuler">Annuler</button>
        <button type="button" class="btn btn-primaire" data-role="ok" disabled>
          ${icone('telecharger', { taille: 16 })}<span>Télécharger</span>
        </button>
      </div>
    </div>`, 'dialogue-controle');

  const liste = dialogue.querySelector('.liste-controle');
  const zoneConclusion = dialogue.querySelector('.conclusion-controle');
  const boutonOk = dialogue.querySelector('[data-role="ok"]');

  /** Ajoute un point à la liste ; `anime` déclenche son apparition. */
  const ajouterPoint = (point, anime) => {
    const apparence = APPARENCE[point.etat] ?? APPARENCE.attention;
    const element = document.createElement('li');
    element.className = `point-controle ${apparence.classe}${anime ? ' apparait' : ''}`;
    element.innerHTML =
      `<span class="marque-controle">${icone(apparence.icone, { taille: 18 })}</span>` +
      `<span class="texte-controle"><strong>${echapperHtml(point.libelle)}</strong>` +
      `<span>${echapperHtml(point.detail)}</span></span>`;
    liste.appendChild(element);
  };

  const afficherConclusion = ({ classe, texte }) => {
    zoneConclusion.className = `conclusion-controle ${classe}`;
    zoneConclusion.textContent = texte;
    zoneConclusion.hidden = false;
    boutonOk.disabled = false;
    boutonOk.focus();
  };

  (async () => {
    liste.innerHTML = '<li class="point-controle en-cours">Analyse du registre…</li>';
    let rapport;
    try {
      rapport = await api.controlerExport(periode, registre);
    } catch (erreur) {
      // Le contrôle n'est qu'une aide : s'il échoue, l'export reste possible.
      liste.innerHTML = '';
      ajouterPoint({
        etat: 'attention',
        libelle: 'Contrôle indisponible',
        detail: `${erreur.message}. Le téléchargement reste possible.`
      }, false);
      afficherConclusion({ classe: 'attention', texte: 'La vérification n’a pas pu être menée.' });
      return;
    }

    liste.innerHTML = '';
    const anime = !mouvementReduit();
    for (const point of rapport.points) {
      ajouterPoint(point, anime);
      if (anime) await pause(DELAI_POINT);
      // La modale a pu être fermée pendant l'animation.
      if (!dialogue.isConnected) return;
    }
    afficherConclusion(conclusion(rapport.points, rapport.nombre));
  })();

  return reponse;
}
