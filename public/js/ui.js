/**
 * Composants d'interface communs aux vues : échappement HTML, toasts,
 * modales, formulaires, listes de suggestions et tableaux de registre.
 *
 * Les registres (recettes, achats) partagent ces briques : une correction
 * profite ainsi aux deux d'un coup.
 */

import { icone } from './icones.js';
import { analyserMontant, formaterMontant } from '/partage/montants.js';
import { dateEnFrancaisLong } from '/partage/dates.js';
import { normaliserTexte } from '/partage/texte.js';

/** Nombre de suggestions proposées sous un champ de saisie. */
const SUGGESTIONS_MAX = 6;

/** L'utilisateur préfère-t-il moins de mouvement ? */
const mouvementReduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Identifiants uniques pour relier deux éléments entre eux (`aria-labelledby`,
 * `aria-describedby`) quand le balisage est produit à la volée.
 */
let compteurIdentifiants = 0;
const identifiantUnique = (prefixe) => `${prefixe}-${(compteurIdentifiants += 1)}`;

/** Échappe un texte pour l'insérer sans risque dans du HTML. */
export function echapperHtml(texte) {
  return String(texte ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Squelette de chargement : des blocs gris à la forme de la page qui arrive, le
 * temps qu'une vue récupère ses données. La forme épouse celle du contenu réel
 * (un tableau plein pour une liste, des tuiles pour le tableau de bord) et
 * occupe tout l'écran : le passage au contenu ne provoque donc pas de saut.
 * Le miroitement se coupe sous `prefers-reduced-motion`.
 *
 * @param {'liste' | 'tableau-de-bord' | 'simple'} [forme] gabarit à imiter.
 */
export function chargeur(forme = 'liste') {
  const contenu = {
    'tableau-de-bord': `
      <div class="sq-grille">${'<div class="sq-carte"></div>'.repeat(4)}</div>
      <div class="sq-bloc"></div>`,
    liste: `
      <div class="sq-barre"></div>
      <div class="sq-tableau">${'<div class="sq-ligne"></div>'.repeat(12)}</div>`,
    simple: '<div class="sq-bloc"></div>'
  }[forme] ?? '<div class="sq-bloc"></div>';

  return `
    <div class="squelette" role="status" aria-label="Chargement…">
      <div class="sq-titre"></div>
      ${contenu}
    </div>`;
}

/**
 * Affiche une notification éphémère en bas à droite.
 *
 * Une action facultative (« Annuler la suppression ») s'affiche dans le toast.
 * Sans elle, la réparation promise par le message ne serait joignable qu'au
 * clavier, par un raccourci que rien ne montre. Sa présence allonge le délai
 * d'effacement, le temps de la lire puis de la viser.
 *
 * @param {string} message
 * @param {'succes' | 'erreur'} [type]
 * @param {{ action?: { libelle: string, executer: () => unknown } }} [options]
 */
export function toast(message, type = 'succes', { action } = {}) {
  const conteneur = document.getElementById('toasts');
  const element = document.createElement('div');
  const estErreur = type === 'erreur';
  element.className = `toast ${estErreur ? 'erreur' : 'succes'}`;
  // Une erreur interrompt l'annonce en cours du lecteur d'écran ; une réussite
  // attend son tour. Le conteneur seul, en `polite`, faisait passer les deux
  // pour de simples informations.
  element.setAttribute('role', estErreur ? 'alert' : 'status');
  element.innerHTML = icone(estErreur ? 'cercle-alerte' : 'cercle-valide') +
    `<span>${echapperHtml(message)}</span>`;

  if (action) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'btn btn-tertiaire action-toast';
    bouton.textContent = action.libelle;
    bouton.addEventListener('click', () => {
      element.remove();
      action.executer();
    });
    element.appendChild(bouton);
  }

  conteneur.appendChild(element);

  // Le survol suspend le compte à rebours : un toast qui porte une action ne
  // doit pas s'effacer sous le curseur qui la vise.
  let minuteur = setTimeout(() => element.remove(), action ? 9000 : 4000);
  element.addEventListener('pointerenter', () => clearTimeout(minuteur));
  element.addEventListener('pointerleave', () => {
    minuteur = setTimeout(() => element.remove(), 2000);
  });
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
    // Le titre nomme la boîte de dialogue : sans lien explicite, un lecteur
    // d'écran annonce « dialogue » et rien d'autre.
    const idTitre = identifiantUnique('titre-confirmation');
    dialogue.setAttribute('aria-labelledby', idTitre);
    dialogue.innerHTML = `
      <form method="dialog" class="corps-dialogue">
        <h2 id="${idTitre}">${echapperHtml(titre)}</h2>
        <p>${echapperHtml(message)}</p>
        <div class="pied-dialogue">
          <button type="button" class="btn btn-secondaire" data-role="annuler">Annuler</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primaire'}" data-role="ok">
            ${icone(iconeOk, { taille: 16 })}<span>${echapperHtml(boutonOk)}</span>
          </button>
        </div>
      </form>`;
    document.body.appendChild(dialogue);

    // Le focus revient d'où il venait : retirer la boîte le laisserait retomber
    // sur le document, et le clavier repartirait du haut de la page.
    const origine = document.activeElement;
    const terminer = (resultat) => {
      dialogue.close();
      dialogue.remove();
      if (origine instanceof HTMLElement && origine.isConnected) origine.focus();
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
  const idTitre = identifiantUnique('titre-attente');
  dialogue.setAttribute('aria-labelledby', idTitre);
  dialogue.innerHTML = `
    <div class="corps-dialogue">
      <h2 id="${idTitre}">${echapperHtml(titre)}</h2>
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
 * Ouvre une boîte de dialogue déjà présente dans la page, et rend le focus à
 * son déclencheur quand elle se referme.
 *
 * `showModal()` seul déplace bien le focus dans la boîte, mais ne le ramène
 * nulle part ensuite : après une annulation, le clavier repartait du haut du
 * document, loin de la ligne sur laquelle on travaillait.
 */
export function ouvrirModale(dialogue) {
  const origine = document.activeElement;
  dialogue.addEventListener('close', () => {
    if (origine instanceof HTMLElement && origine.isConnected) origine.focus();
  }, { once: true });
  dialogue.showModal();
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

  // Le champ et sa liste forment un `combobox` en bonne et due forme : sans ces
  // rôles, les flèches ne déplaçaient qu'une classe CSS, que rien n'annonçait.
  if (!liste.id) liste.id = identifiantUnique('liste-suggestions');
  liste.setAttribute('role', 'listbox');
  champ.setAttribute('role', 'combobox');
  champ.setAttribute('aria-autocomplete', 'list');
  champ.setAttribute('aria-controls', liste.id);
  champ.setAttribute('aria-expanded', 'false');

  const marquerActif = () => {
    [...liste.children].forEach((option, i) => option.classList.toggle('actif', i === indexActif));
    const actif = liste.children[indexActif];
    if (actif) champ.setAttribute('aria-activedescendant', actif.id);
    else champ.removeAttribute('aria-activedescendant');
  };

  const fermer = () => {
    liste.hidden = true;
    liste.innerHTML = '';
    visibles = [];
    indexActif = -1;
    champ.setAttribute('aria-expanded', 'false');
    champ.removeAttribute('aria-activedescendant');
  };

  const ouvrir = () => {
    const saisie = normaliserTexte(champ.value);
    visibles = saisie === '' ? [] : valeurs()
      .filter((v) => normaliserTexte(v).includes(saisie) && normaliserTexte(v) !== saisie)
      .slice(0, SUGGESTIONS_MAX);
    if (visibles.length === 0) return fermer();
    indexActif = -1;
    liste.innerHTML = visibles
      .map((v, i) => `<div role="option" id="${liste.id}-${i}" aria-selected="false" data-index="${i}">${echapperHtml(v)}</div>`)
      .join('');
    liste.hidden = false;
    champ.setAttribute('aria-expanded', 'true');
    champ.removeAttribute('aria-activedescendant');
  };

  champ.addEventListener('input', ouvrir);
  champ.addEventListener('keydown', (evenement) => {
    if (liste.hidden) return;
    if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      const pas = evenement.key === 'ArrowDown' ? 1 : -1;
      indexActif = (indexActif + pas + visibles.length) % visibles.length;
      [...liste.children].forEach((option, i) => option.setAttribute('aria-selected', String(i === indexActif)));
      marquerActif();
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

/**
 * Affiche sous un champ de type date la date saisie en toutes lettres
 * (« 28 mai 2026 »), sans changer la façon de la renseigner. L'aperçu est
 * ajouté après le champ et se met à jour à chaque changement.
 *
 * @returns {() => void} rafraîchit l'aperçu (à appeler après un remplissage
 *   programmatique, qui ne déclenche pas d'événement).
 */
export function installerApercuDate(champ) {
  const apercu = document.createElement('small');
  apercu.className = 'apercu-date';
  champ.insertAdjacentElement('afterend', apercu);
  const rafraichir = () => { apercu.textContent = dateEnFrancaisLong(champ.value); };
  champ.addEventListener('input', rafraichir);
  champ.addEventListener('change', rafraichir);
  rafraichir();
  return rafraichir;
}

/**
 * Bulle d'aide : un « i » posé à côté d'un titre, dont le texte apparaît au
 * survol, au focus clavier ou au clic.
 *
 * Le déclencheur porte `aria-describedby` vers la bulle : c'est ce lien qui
 * fait lire l'explication par un lecteur d'écran. Sans lui, le seul nom
 * annoncé était « En savoir plus sur… », et le contenu, souvent une précision
 * légale, restait inaudible.
 *
 * Réservée à ce qui éclaire sans rien demander. Un avertissement qui appelle
 * une action de l'utilisateur (des recettes à catégoriser, une sauvegarde qui
 * a échoué) doit rester visible : le cacher derrière un survol reviendrait à
 * ne pas le dire.
 *
 * @param {string} texte contenu de la bulle.
 * @param {string} [pour] ce que la bulle explique, pour les lecteurs d'écran.
 */
export function infobulle(texte, pour = 'ce réglage') {
  const idBulle = identifiantUnique('bulle');
  return `<span class="infobulle">
      <button type="button" class="declencheur-infobulle" aria-describedby="${idBulle}"
        aria-expanded="false" aria-label="En savoir plus sur ${echapperHtml(pour)}">
        ${icone('info', { taille: 15 })}
      </button>
      <span class="bulle" role="tooltip" id="${idBulle}">${echapperHtml(texte)}</span>
    </span>`;
}

/**
 * Fait apparaître les bulles d'aide au survol et au focus clavier, en les
 * plaçant elles-mêmes dans la fenêtre.
 *
 * Le placement ne peut pas être laissé au CSS seul : une bulle ancrée sous
 * son icône déborde dès que celle-ci est près du bord droit, et la carte qui
 * la contient la rogne. On la positionne donc en coordonnées de fenêtre, puis
 * on la ramène à l'intérieur si elle dépasse.
 *
 * Écouteurs délégués posés une fois pour toutes : les vues se redessinent
 * entièrement à chaque navigation, des écouteurs par élément seraient perdus.
 */
export function installerInfobulles() {
  const MARGE = 8;
  /** Bulle ouverte au clic : elle reste jusqu'au prochain clic ou à Échap. */
  let epinglee = null;

  const montrer = (declencheur) => {
    const bulle = declencheur.nextElementSibling;
    if (!bulle?.classList.contains('bulle')) return;
    // Mesurable même cachée : `visibility` conserve la mise en page.
    const ancre = declencheur.getBoundingClientRect();
    const taille = bulle.getBoundingClientRect();
    const gauche = Math.max(
      MARGE,
      Math.min(ancre.left, window.innerWidth - taille.width - MARGE)
    );
    bulle.style.left = `${gauche}px`;
    bulle.style.top = `${ancre.bottom + MARGE}px`;
    bulle.classList.add('visible');
    declencheur.setAttribute('aria-expanded', 'true');
  };

  const cacher = (declencheur) => {
    if (declencheur === epinglee) return; // ouverte au clic : elle reste
    declencheur.nextElementSibling?.classList.remove('visible');
    declencheur.setAttribute('aria-expanded', 'false');
  };

  const desepingler = () => {
    if (!epinglee) return;
    const ancienne = epinglee;
    epinglee = null;
    cacher(ancienne);
  };

  for (const [entree, sortie] of [['pointerover', 'pointerout'], ['focusin', 'focusout']]) {
    document.addEventListener(entree, (evenement) => {
      const declencheur = evenement.target.closest?.('.declencheur-infobulle');
      if (declencheur) montrer(declencheur);
    });
    document.addEventListener(sortie, (evenement) => {
      const declencheur = evenement.target.closest?.('.declencheur-infobulle');
      if (declencheur) cacher(declencheur);
    });
  }

  // Le clic épingle la bulle : le survol seul la rendait inatteignable dès que
  // le pointeur n'est pas le moyen de navigation.
  document.addEventListener('click', (evenement) => {
    const declencheur = evenement.target.closest?.('.declencheur-infobulle');
    if (!declencheur) return desepingler();
    if (declencheur === epinglee) return desepingler();
    desepingler();
    epinglee = declencheur;
    montrer(declencheur);
  });

  document.addEventListener('keydown', (evenement) => {
    if (evenement.key === 'Escape') desepingler();
  });

  // Une bulle placée en coordonnées de fenêtre suivrait mal un défilement :
  // autant la refermer. Le travail est reporté à la prochaine image, pour ne
  // pas interroger le document à chaque événement de défilement.
  let defilementPrevu = false;
  window.addEventListener('scroll', () => {
    if (defilementPrevu) return;
    defilementPrevu = true;
    requestAnimationFrame(() => {
      defilementPrevu = false;
      epinglee = null;
      document.querySelectorAll('.bulle.visible').forEach((b) => {
        b.classList.remove('visible');
        b.previousElementSibling?.setAttribute('aria-expanded', 'false');
      });
    });
  }, true);
}

/**
 * En-tête de colonne triable.
 *
 * Le libellé est un vrai bouton : posé sur le `th` seul, le tri d'un registre
 * de plusieurs centaines de lignes n'existait qu'à la souris.
 */
export function enteteTri(cleTri, libelle, classe = '') {
  return `<th class="triable ${classe}" data-tri="${cleTri}" aria-sort="none">
      <button type="button" class="entete-tri">${libelle}<span class="indicateur-tri"></span></button>
    </th>`;
}

/** Place la flèche de tri sur la colonne active du tableau, et l'annonce. */
export function majIndicateursTri(entetes, tri) {
  entetes.querySelectorAll('th.triable').forEach((th) => {
    const actif = th.dataset.tri === tri.colonne;
    th.setAttribute('aria-sort', actif ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none');
    th.querySelector('.indicateur-tri').innerHTML = actif
      ? icone(tri.sens === 'asc' ? 'chevron-haut' : 'chevron-bas', { taille: 13 })
      : '';
  });
}

/**
 * Puces des filtres actifs, chacune retirable d'un clic.
 *
 * Les filtres survivent au changement de vue : sans ce rappel, un sous-total
 * filtré se présentait comme le livre entier, juste avant l'export ou la
 * recopie d'un montant dans une déclaration.
 *
 * @param {{ cle: string, libelle: string }[]} actifs
 */
export function pucesFiltres(actifs) {
  return actifs.map((f) => `
    <button type="button" class="puce-filtre" data-filtre="${echapperHtml(f.cle)}"
      aria-label="Retirer le filtre ${echapperHtml(f.libelle)}">
      <span>${echapperHtml(f.libelle)}</span>${icone('croix', { taille: 13 })}
    </button>`).join('');
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

/**
 * Fait défiler les valeurs chiffrées jusqu'à leur montant : chaque élément
 * `[data-compteur]` monte de zéro à sa cible en une demi-seconde. Le texte
 * final déjà présent reste la référence exacte (aucune divergence de format).
 * Ne fait rien si l'utilisateur préfère moins de mouvement.
 *
 * @param {HTMLElement} racine conteneur où chercher les compteurs.
 * @param {string} devise code de devise, pour les compteurs de montant.
 */
export function animerCompteurs(racine, devise) {
  if (mouvementReduit()) return;
  const DUREE = 550;
  for (const element of racine.querySelectorAll('[data-compteur]')) {
    const cible = Number(element.dataset.compteur);
    if (!Number.isFinite(cible) || cible === 0) continue;
    const texteFinal = element.textContent;
    const formater = element.dataset.format === 'entier'
      ? (v) => String(Math.round(v))
      : (v) => formaterMontant(v, devise);
    const debut = performance.now();
    const avancer = (maintenant) => {
      const t = Math.min(1, (maintenant - debut) / DUREE);
      const progression = 1 - (1 - t) ** 3; // départ vif, fin douce
      element.textContent = t < 1 ? formater(cible * progression) : texteFinal;
      if (t < 1) requestAnimationFrame(avancer);
    };
    requestAnimationFrame(avancer);
  }
}

/**
 * Fait disparaître des lignes de tableau (fondu vers la gauche) avant leur
 * retrait réel, pour que la suppression se voie. Résout quand l'animation est
 * finie, ou immédiatement si l'utilisateur préfère moins de mouvement.
 *
 * @param {Iterable<HTMLElement>} lignes lignes `<tr>` à faire partir.
 */
export function animerDepartLignes(lignes) {
  const cibles = [...lignes].filter(Boolean);
  if (cibles.length === 0 || mouvementReduit()) return Promise.resolve();
  for (const tr of cibles) tr.classList.add('ligne-part');
  return new Promise((resoudre) => setTimeout(resoudre, 240));
}

/** Retarde l'appel d'une fonction (recherche au clavier). */
export function differer(fonction, delaiMs = 250) {
  let minuteur = null;
  return (...args) => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => fonction(...args), delaiMs);
  };
}
