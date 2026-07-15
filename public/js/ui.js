/**
 * Petits composants d'interface : échappement HTML, toasts, confirmation.
 */

import { icone } from './icones.js';

/** Échappe un texte pour l'insérer sans risque dans du HTML. */
export function echapperHtml(texte) {
  return String(texte ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Affiche une notification éphémère en bas à droite. */
export function toast(message, type = 'succes') {
  const conteneur = document.getElementById('toasts');
  const element = document.createElement('div');
  const estErreur = type === 'erreur';
  element.className = `toast ${estErreur ? 'erreur' : 'succes'}`;
  element.innerHTML = icone(estErreur ? 'cercle-alerte' : 'cercle-valide') +
    `<span>${echapperHtml(message)}</span>`;
  conteneur.appendChild(element);
  setTimeout(() => element.remove(), 4000);
}

/**
 * Demande confirmation via une boîte de dialogue modale.
 * @returns {Promise<boolean>} vrai si l'utilisateur confirme.
 */
export function confirmer({ titre = 'Confirmer', message, boutonOk = 'Supprimer' }) {
  return new Promise((resoudre) => {
    const dialogue = document.createElement('dialog');
    dialogue.innerHTML = `
      <form method="dialog" class="corps-dialogue">
        <h2>${echapperHtml(titre)}</h2>
        <p>${echapperHtml(message)}</p>
        <div class="pied-dialogue">
          <button type="button" class="btn btn-secondaire" data-role="annuler">Annuler</button>
          <button type="button" class="btn btn-danger" data-role="ok">
            ${icone('corbeille', { taille: 16 })}<span>${echapperHtml(boutonOk)}</span>
          </button>
        </div>
      </form>`;
    document.body.appendChild(dialogue);

    const terminer = (resultat) => {
      dialogue.close();
      dialogue.remove();
      resoudre(resultat);
    };
    dialogue.querySelector('[data-role="ok"]').addEventListener('click', () => terminer(true));
    dialogue.querySelector('[data-role="annuler"]').addEventListener('click', () => terminer(false));
    dialogue.addEventListener('cancel', (evenement) => {
      evenement.preventDefault();
      terminer(false);
    });
    dialogue.showModal();
  });
}

/** Applique les erreurs de validation `{ champ: message }` à un formulaire. */
export function afficherErreursFormulaire(formulaire, erreurs) {
  effacerErreursFormulaire(formulaire);
  for (const [champ, message] of Object.entries(erreurs ?? {})) {
    const conteneur = formulaire.querySelector(`[data-champ="${champ}"]`);
    if (!conteneur) continue;
    conteneur.classList.add('invalide');
    const zone = conteneur.querySelector('.erreur-champ');
    if (zone) zone.textContent = message;
  }
}

/** Efface toutes les erreurs affichées dans un formulaire. */
export function effacerErreursFormulaire(formulaire) {
  formulaire.querySelectorAll('.champ.invalide').forEach((c) => c.classList.remove('invalide'));
  formulaire.querySelectorAll('.erreur-champ').forEach((z) => { z.textContent = ''; });
}

/** Retarde l'appel d'une fonction (recherche au clavier). */
export function differer(fonction, delaiMs = 250) {
  let minuteur = null;
  return (...args) => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => fonction(...args), delaiMs);
  };
}
