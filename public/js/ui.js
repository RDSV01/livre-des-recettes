/**
 * Composants d'interface communs aux vues : échappement HTML, toasts,
 * modales, formulaires, listes de suggestions et tableaux de registre.
 *
 * Les registres (recettes, achats) partagent ces briques : une correction
 * profite ainsi aux deux d'un coup.
 */

import { icone } from './icones.js';
import { analyserMontant } from '/partage/montants.js';
import { normaliserTexte } from '/partage/texte.js';

/** Nombre de suggestions proposées sous un champ de saisie. */
const SUGGESTIONS_MAX = 6;

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
 *
 * Par défaut l'action est présentée comme destructrice (bouton rouge et
 * corbeille) ; `danger: false` et `iconeOk` conviennent aux actions qui ne
 * suppriment rien, comme installer une mise à jour.
 *
 * @returns {Promise<boolean>} vrai si l'utilisateur confirme.
 */
export function confirmer({
  titre = 'Confirmer', message, boutonOk = 'Supprimer',
  danger = true, iconeOk = 'corbeille'
}) {
  return new Promise((resoudre) => {
    const dialogue = document.createElement('dialog');
    dialogue.innerHTML = `
      <form method="dialog" class="corps-dialogue">
        <h2>${echapperHtml(titre)}</h2>
        <p>${echapperHtml(message)}</p>
        <div class="pied-dialogue">
          <button type="button" class="btn btn-secondaire" data-role="annuler">Annuler</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primaire'}" data-role="ok">
            ${icone(iconeOk, { taille: 16 })}<span>${echapperHtml(boutonOk)}</span>
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

/**
 * Ouvre une modale d'attente, sans bouton : l'utilisateur ne peut ni la
 * fermer ni cliquer ailleurs pendant une opération qu'il ne faut pas
 * interrompre (l'installation d'une mise à jour, par exemple).
 *
 * @returns {{ etat: (message: string) => void, fermer: () => void }}
 */
export function dialogueAttente({ titre, message }) {
  const dialogue = document.createElement('dialog');
  dialogue.className = 'dialogue-attente';
  dialogue.innerHTML = `
    <div class="corps-dialogue">
      <h2>${echapperHtml(titre)}</h2>
      <p class="etat-attente" aria-live="polite">${echapperHtml(message)}</p>
      <div class="barre-attente"><span></span></div>
    </div>`;
  document.body.appendChild(dialogue);
  // Échap ne doit pas interrompre l'opération en cours.
  dialogue.addEventListener('cancel', (evenement) => evenement.preventDefault());
  dialogue.showModal();

  return {
    etat(nouveauMessage) {
      dialogue.querySelector('.etat-attente').textContent = nouveauMessage;
    },
    fermer() {
      dialogue.close();
      dialogue.remove();
    }
  };
}

/**
 * Applique les erreurs de validation `{ champ: message }` à un formulaire,
 * puis amène le premier champ fautif sous les yeux de l'utilisateur : un
 * message d'erreur hors de l'écran, dans un long formulaire, donne
 * l'impression que rien ne s'est passé.
 */
export function afficherErreursFormulaire(formulaire, erreurs) {
  effacerErreursFormulaire(formulaire);
  for (const [champ, message] of Object.entries(erreurs ?? {})) {
    const conteneur = formulaire.querySelector(`[data-champ="${champ}"]`);
    if (!conteneur) continue;
    conteneur.classList.add('invalide');
    const zone = conteneur.querySelector('.erreur-champ');
    if (zone) zone.textContent = message;
  }

  // Le premier dans l'ordre de la page, pas dans celui des erreurs reçues.
  const premier = formulaire.querySelector('.champ.invalide');
  if (!premier) return;
  const anime = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  premier.scrollIntoView({ behavior: anime ? 'smooth' : 'auto', block: 'center' });
  // Le défilement est déjà fait : le focus ne doit pas en déclencher un autre.
  premier.querySelector('input, select, textarea')?.focus({ preventScroll: true });
}

/** Efface toutes les erreurs affichées dans un formulaire. */
export function effacerErreursFormulaire(formulaire) {
  formulaire.querySelectorAll('.champ.invalide').forEach((c) => c.classList.remove('invalide'));
  formulaire.querySelectorAll('.erreur-champ').forEach((z) => { z.textContent = ''; });
}

/** « 12,5 » devient « 12,50 » ; une saisie inintelligible est laissée telle quelle. */
export function formaterChampMontant(valeur) {
  const montant = analyserMontant(valeur);
  return montant === null ? String(valeur ?? '') : montant.toFixed(2).replace('.', ',');
}

/**
 * Liste de suggestions sous un champ de saisie, reprenant les valeurs déjà
 * enregistrées (libellés d'une recette, fournisseurs d'un achat).
 *
 * Composant maison plutôt qu'un `datalist` du navigateur : celui-ci s'affiche
 * différemment d'un navigateur à l'autre et ne se laisse pas mettre au style
 * du reste de l'application.
 *
 * @param {object} options
 * @param {HTMLInputElement} options.champ champ de saisie surveillé.
 * @param {HTMLElement} options.liste conteneur des suggestions.
 * @param {() => string[]} options.valeurs valeurs connues, relues à chaque
 *   frappe (la liste se recharge après chaque enregistrement).
 * @returns {() => void} ferme la liste (à appeler en ouvrant un formulaire).
 */
export function installerSuggestions({ champ, liste, valeurs }) {
  let visibles = [];
  let indexActif = -1;

  const fermer = () => {
    liste.hidden = true;
    liste.innerHTML = '';
    visibles = [];
    indexActif = -1;
  };

  const ouvrir = () => {
    const saisie = normaliserTexte(champ.value);
    visibles = saisie === '' ? [] : valeurs()
      .filter((v) => normaliserTexte(v).includes(saisie) && normaliserTexte(v) !== saisie)
      .slice(0, SUGGESTIONS_MAX);
    if (visibles.length === 0) return fermer();
    indexActif = -1;
    liste.innerHTML = visibles
      .map((v, i) => `<div role="option" data-index="${i}">${echapperHtml(v)}</div>`)
      .join('');
    liste.hidden = false;
  };

  champ.addEventListener('input', ouvrir);
  champ.addEventListener('keydown', (evenement) => {
    if (liste.hidden) return;
    if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      const pas = evenement.key === 'ArrowDown' ? 1 : -1;
      indexActif = (indexActif + pas + visibles.length) % visibles.length;
      [...liste.children].forEach((option, i) => option.classList.toggle('actif', i === indexActif));
    } else if (evenement.key === 'Enter') {
      // Une suggestion surlignée est choisie ; sinon Enter garde son rôle.
      if (indexActif >= 0) {
        evenement.preventDefault();
        champ.value = visibles[indexActif];
      }
      fermer();
    } else if (evenement.key === 'Escape') {
      // Ne ferme que la liste, pas la boîte de dialogue.
      evenement.preventDefault();
      fermer();
    }
  });
  // `pointerdown` précède le `blur` du champ : le clic choisit la suggestion.
  liste.addEventListener('pointerdown', (evenement) => {
    const option = evenement.target.closest('[role="option"]');
    if (!option) return;
    evenement.preventDefault();
    champ.value = visibles[Number(option.dataset.index)];
    fermer();
  });
  champ.addEventListener('blur', () => setTimeout(fermer, 120));
  return fermer;
}

/** Place la flèche de tri sur la colonne active du tableau. */
export function majIndicateursTri(entetes, tri) {
  entetes.querySelectorAll('th.triable').forEach((th) => {
    th.querySelector('.indicateur-tri').innerHTML = th.dataset.tri === tri.colonne
      ? icone(tri.sens === 'asc' ? 'chevron-haut' : 'chevron-bas', { taille: 13 })
      : '';
  });
}

/**
 * Met à jour la barre d'actions groupées : elle n'apparaît que si quelque
 * chose est coché, et la case d'en-tête ne l'est que si toutes les lignes
 * affichées le sont.
 *
 * @param {(nombre: number) => string} libelle décompte à afficher, accordé
 *   selon le registre (« 3 recettes sélectionnées », « 3 achats… »).
 */
export function majBarreSelection({ barre, compte, toutSelectionner }, selection, idsVisibles, libelle) {
  barre.hidden = selection.size === 0;
  compte.textContent = libelle(selection.size);
  toutSelectionner.checked = idsVisibles.length > 0 && idsVisibles.every((id) => selection.has(id));
}

/** Retarde l'appel d'une fonction (recherche au clavier). */
export function differer(fonction, delaiMs = 250) {
  let minuteur = null;
  return (...args) => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => fonction(...args), delaiMs);
  };
}
