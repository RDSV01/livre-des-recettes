/**
 * Composants d'interface communs aux vues : échappement HTML, listes
 * déroulantes habillées, notifications, boîtes de dialogue, champs de
 * formulaire, bulles d'aide et compteurs animés.
 *
 * Les retours posés sur place (bouton qui confirme, ligne « Annuler »,
 * onde de réussite) vivent dans `retours.js`.
 */

import { icone } from './icones.js';
import { analyserMontant, formaterMontant } from '/partage/montants.js';
import { NOMS_MOIS } from '/partage/dates.js';
import { majusculeInitiale, normaliserTexte } from '/partage/texte.js';

/** L'utilisateur préfère-t-il moins de mouvement ? */
export const mouvementReduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let finDuFonduEnCours = Promise.resolve();

/**
 * Fondu enchaîné de tout l'écran autour d'une mise à jour (changement de
 * page, période déclarée) : l'image d'avant s'efface pendant que celle d'après
 * apparaît, sans rien déplacer. Les deux images s'additionnent, donc ce qui ne
 * change pas (le menu) reste net. Sans prise en charge par le navigateur, ou
 * en mouvement réduit, la mise à jour se fait simplement.
 *
 * @param {() => unknown} miseAJour
 * @returns {Promise<void>} une fois la mise à jour faite ; le fondu, lui, continue.
 */
export async function enFondu(miseAJour) {
  if (!document.startViewTransition || mouvementReduit()) {
    await miseAJour();
    return;
  }
  const racine = document.documentElement;
  racine.classList.add('fondu-en-cours');
  const transition = document.startViewTransition(miseAJour);
  // Un fondu interrompu par le suivant (clics rapides) : sans gravité.
  transition.ready.catch(() => {});
  const fin = transition.finished.catch(() => {}).then(() => {
    if (finDuFonduEnCours === fin) racine.classList.remove('fondu-en-cours');
  });
  finDuFonduEnCours = fin;
  await transition.updateCallbackDone;
}

/** Fin du fondu en cours : ce qui doit s'ouvrir après (un panneau) l'attend. */
export const finDuFondu = () => finDuFonduEnCours;

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
 * Identifiants uniques pour relier deux éléments entre eux (`aria-labelledby`,
 * `aria-describedby`) quand le balisage est produit à la volée.
 */
let compteurIdentifiants = 0;
export const identifiantUnique = (prefixe) => `${prefixe}-${(compteurIdentifiants += 1)}`;

/** « 3 recettes » : le nombre et le mot accordé. */
export const accorder = (n, mot, pluriel = `${mot}s`) => `${n} ${n > 1 ? pluriel : mot}`;

/** Monogramme d'un client : les initiales de ses deux premiers mots utiles. */
export const initiales = (nom) => String(nom ?? '').replace(/^(Mme|M\.|SARL|SAS|SASU|EURL|SCI)\s+/i, '')
  .split(/\s+/).filter((m) => m.length > 2 || /^\p{Lu}/u.test(m)).slice(0, 2)
  .map((m) => m[0].toUpperCase()).join('') || '?';

/**
 * Teinte stable d'un nom (0 à 3), la même à chaque affichage : les initiales
 * d'un client gardent leur couleur d'un écran à l'autre (voir `.monogramme`).
 */
export const teinteDe = (nom) => [...String(nom ?? '').toLowerCase()]
  .reduce((somme, c) => (somme * 31 + c.codePointAt(0)) % 9973, 7) % 4;

/** SIRET groupé comme sur un avis de situation : 123 456 782 00010. */
export const siretLisible = (s) => (s ? String(s).replace(/^(\d{3})(\d{3})(\d{3})(\d*)$/, '$1 $2 $3 $4').trim() : '');

/** « 184 ko », « 1,2 Mo » : le poids d'un fichier. */
export const poidsLisible = (octets) => (octets < 1024 * 1024
  ? `${Math.max(1, Math.round(octets / 1024))} ko`
  : `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);

// ---- Listes déroulantes --------------------------------------------------------

/** Options d'un sélecteur d'années, dans l'ordre reçu. */
export const optionsAnnees = (annees, choisie = null) => annees
  .map((a) => `<option value="${a}"${String(a) === String(choisie) ? ' selected' : ''}>${a}</option>`).join('');

/** Interrupteur marche / arrêt ; la vue qui l'emploie bascule `aria-checked` au clic. */
export const interrupteur = (id, actif, libelle) =>
  `<button type="button" class="interrupteur" role="switch" id="${id}" aria-checked="${Boolean(actif)}" aria-label="${echapperHtml(libelle)}"></button>`;

// ---- Choix de l'année --------------------------------------------------------

/**
 * Choix de l'année par flèches, « ‹ 2026 › », dans le style des groupes à
 * bascule qui l'entourent : pas de liste déroulante du système, qui détonne
 * avec le thème. Le contenu vient au branchement (`brancherChoixAnnee`), qui
 * accepte aussi une valeur hors année (« Toutes », dans les registres) avec
 * `libelle` et `nom`.
 */
export const choixAnnee = ({ id, etiquette = 'Année' }) => `<div class="choix-annee" role="group" id="${id}" aria-label="${echapperHtml(etiquette)}">
    <button type="button" data-pas="-1">${icone('chevron-gauche', { taille: 16 })}</button>
    <span class="annee-choisie" aria-live="polite"></span>
    <button type="button" data-pas="1">${icone('chevron-droite', { taille: 16 })}</button>
  </div>`;

/**
 * Branche le choix de l'année. Les flèches mènent à l'année voisine de la
 * liste (qui peut sauter une année vide) et s'éteignent aux bornes, sans
 * perdre le focus du clavier.
 *
 * @param {HTMLElement} groupe
 * @param {object} options
 * @param {number[]} options.annees de la plus récente à la plus ancienne.
 * @param {number} options.choisie
 * @param {(annee: number, pas: string) => void} options.surChoix
 */
export function brancherChoixAnnee(groupe, { annees, choisie, surChoix, libelle = String, nom = String }) {
  let annee = choisie;
  const majAffichage = () => {
    const i = annees.indexOf(annee);
    groupe.querySelector('.annee-choisie').textContent = libelle(annee);
    for (const [pas, cible] of [['-1', annees[i + 1]], ['1', annees[i - 1]]]) {
      const bouton = groupe.querySelector(`[data-pas="${pas}"]`);
      bouton.setAttribute('aria-disabled', String(cible === undefined));
      bouton.setAttribute('aria-label', cible === undefined
        ? `Aucune année ${pas === '-1' ? 'plus ancienne' : 'plus récente'}`
        : `Afficher ${nom(cible)}`);
    }
  };
  majAffichage();
  groupe.addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('[data-pas]');
    if (!bouton || bouton.getAttribute('aria-disabled') === 'true') return;
    annee = annees[annees.indexOf(annee) - Number(bouton.dataset.pas)];
    majAffichage();
    surChoix(annee, bouton.dataset.pas);
  });
  /** Pour changer l'année de l'extérieur (filtres effacés), sans rappeler `surChoix`. */
  return { definir: (nouvelle) => { annee = nouvelle; majAffichage(); } };
}

/** Options des douze mois, de valeur 1 à 12, avec une majuscule. */
export const OPTIONS_MOIS = NOMS_MOIS
  .map((nom, i) => `<option value="${i + 1}">${majusculeInitiale(nom)}</option>`).join('');

/** Options d'un sélecteur de codes (`{ code, libelle }` : modes, catégories). */
export const optionsCodes = (entrees, choisi = null) => entrees
  .map((e) => `<option value="${echapperHtml(e.code)}"${e.code === choisi ? ' selected' : ''}>${echapperHtml(e.libelle)}</option>`)
  .join('');

/**
 * Liste déroulante habillée : la flèche est dessinée, la liste reste celle du
 * système (clavier et lecteurs d'écran compris).
 *
 * @param {object} options
 * @param {string} options.id
 * @param {string} options.options balisage des `<option>`.
 * @param {string} [options.etiquette] nom lu par les lecteurs d'écran, quand
 *   aucun `<label>` visible ne le porte (filtres d'une barre d'outils).
 * @param {string} [options.nom] attribut `name`, dans un formulaire.
 * @param {string} [options.classe]
 */
export function selecteur({ id, options, etiquette = '', nom = '', classe = '' }) {
  const liste = `<select id="${id}"${nom ? ` name="${nom}"` : ''}>${options}</select>${icone('chevron-bas', { taille: 16 })}`;
  return etiquette
    ? `<label class="selecteur ${classe}"><span class="hors-ecran">${echapperHtml(etiquette)}</span>${liste}</label>`
    : `<div class="selecteur ${classe}">${liste}</div>`;
}

/**
 * Pose la marque « filtre actif » sur une liste déroulante habillée : un
 * filtre qui restreint la liste se voit d'un coup d'œil.
 */
export const marquerFiltre = (select) => select.closest('.selecteur')?.classList.toggle('actif', select.value !== '');

// ---- Notifications ------------------------------------------------------------------

/**
 * Notification éphémère en bas à droite, pour ce qui n'a pas de place où
 * s'afficher : une erreur imprévue, une annulation au clavier. Les gestes
 * ordinaires répondent sur place (voir `retours.js`).
 *
 * La zone passe au premier plan (`popover`) : sans cela, une erreur survenue
 * pendant une saisie restait cachée derrière le panneau ouvert.
 *
 * @param {string} message
 * @param {'succes' | 'erreur'} [type]
 */
export function toast(message, type = 'succes') {
  const conteneur = document.getElementById('toasts');
  const element = document.createElement('div');
  const estErreur = type === 'erreur';
  element.className = `toast ${estErreur ? 'erreur' : 'succes'}`;
  // Une erreur interrompt l'annonce en cours du lecteur d'écran ; une réussite
  // attend son tour.
  element.setAttribute('role', estErreur ? 'alert' : 'status');
  element.innerHTML = icone(estErreur ? 'cercle-alerte' : 'cercle-valide', { taille: 18 }) +
    `<span>${echapperHtml(message)}</span>`;

  conteneur.appendChild(element);
  if (conteneur.showPopover) {
    // Ré-ouverte à chaque ajout : elle repasse ainsi devant une boîte ouverte après elle.
    if (conteneur.matches(':popover-open')) conteneur.hidePopover();
    conteneur.showPopover();
  }

  // Le survol suspend le compte à rebours : le temps de lire jusqu'au bout.
  const retirer = () => {
    element.remove();
    if (conteneur.childElementCount === 0 && conteneur.hidePopover && conteneur.matches(':popover-open')) {
      conteneur.hidePopover();
    }
  };
  let minuteur = setTimeout(retirer, 4000);
  element.addEventListener('pointerenter', () => clearTimeout(minuteur));
  element.addEventListener('pointerleave', () => { minuteur = setTimeout(retirer, 2000); });
}

// ---- Boîtes de dialogue -------------------------------------------------------------

/**
 * Boîte de dialogue créée pour une seule question, puis retirée : elle
 * s'ouvre aussitôt, et se referme au clic sur un bouton `data-role="ok"` ou
 * `data-role="annuler"`, ou à la touche Échap (qui vaut « annuler »).
 *
 * Le focus revient d'où il venait : retirer la boîte le laisserait retomber
 * sur le document, et le clavier repartirait du haut de la page.
 *
 * @param {(idTitre: string) => string} contenu balisage de la boîte ; son
 *   titre doit porter l'identifiant reçu, qui la nomme pour les lecteurs
 *   d'écran.
 * @param {string} [classe] classe de la boîte.
 * @returns {{ dialogue: HTMLDialogElement, reponse: Promise<boolean> }}
 */
function dialogueTemporaire(contenu, classe = '') {
  const dialogue = document.createElement('dialog');
  dialogue.className = `boite ${classe}`.trim();
  const idTitre = identifiantUnique('titre-dialogue');
  dialogue.setAttribute('aria-labelledby', idTitre);
  dialogue.innerHTML = contenu(idTitre);
  document.body.appendChild(dialogue);

  const origine = document.activeElement;
  const reponse = new Promise((resoudre) => {
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
  });
  dialogue.showModal();
  return { dialogue, reponse };
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
  return dialogueTemporaire((idTitre) => `
    <form method="dialog" class="boite-corps">
      <h2 id="${idTitre}">${echapperHtml(titre)}</h2>
      <p>${echapperHtml(message)}</p>
      <div class="boite-pied">
        <button type="button" class="btn btn-fantome" data-role="annuler">Annuler</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-principal'}" data-role="ok">
          ${icone(iconeOk, { taille: 16 })}<span>${echapperHtml(boutonOk)}</span>
        </button>
      </div>
    </form>`).reponse;
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
  dialogue.className = 'boite boite-attente';
  const idTitre = identifiantUnique('titre-attente');
  dialogue.setAttribute('aria-labelledby', idTitre);
  dialogue.innerHTML = `
    <div class="boite-corps">
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

// ---- Chargement ----------------------------------------------------------------------

/**
 * Squelette de chargement : des blocs à la forme de la page qui arrive, le
 * temps qu'une vue récupère ses données. N'apparaît qu'au-delà d'un court
 * délai (voir `app.js`) : en local, une vue s'affiche presque toujours avant.
 *
 * @param {'liste' | 'tableau-de-bord' | 'simple'} [forme] gabarit à imiter.
 */
export function chargeur(forme = 'liste') {
  const contenu = {
    'tableau-de-bord': `
      <div class="sq-grille">${'<div class="sq-carte"></div>'.repeat(4)}</div>
      <div class="sq-bloc"></div>`,
    liste: `<div class="sq-tableau">${'<div class="sq-ligne"></div>'.repeat(10)}</div>`,
    simple: '<div class="sq-bloc"></div>'
  }[forme] ?? '<div class="sq-bloc"></div>';

  return `
    <div class="page squelette" role="status" aria-label="Chargement…">
      <div class="sq-titre"></div>
      ${contenu}
    </div>`;
}

// ---- Formulaires ------------------------------------------------------------------------

/** Le champ refusé secoue la tête : l'œil va droit à lui. */
function secouer(element) {
  element.classList.remove('secoue');
  void element.offsetWidth;
  element.classList.add('secoue');
}

/**
 * Applique les erreurs de validation `{ champ: message }` à un formulaire,
 * puis amène le premier champ fautif sous les yeux de l'utilisateur : un
 * message d'erreur hors de l'écran donne l'impression que rien ne s'est passé.
 */
export function afficherErreursFormulaire(formulaire, erreurs) {
  effacerErreursFormulaire(formulaire);
  for (const [champ, message] of Object.entries(erreurs ?? {})) {
    const conteneur = formulaire.querySelector(`[data-champ="${champ}"]`);
    if (!conteneur) continue;
    conteneur.classList.add('invalide');
    conteneur.querySelectorAll('input, select, textarea').forEach((c) => c.setAttribute('aria-invalid', 'true'));
    const zone = conteneur.querySelector('.erreur-champ');
    if (zone) zone.innerHTML = `${icone('cercle-alerte', { taille: 14 })}<span>${echapperHtml(message)}</span>`;
  }

  // Le premier dans l'ordre de la page, pas dans celui des erreurs reçues.
  const premier = formulaire.querySelector('.champ.invalide');
  if (!premier) return;
  premier.scrollIntoView({ behavior: mouvementReduit() ? 'auto' : 'smooth', block: 'center' });
  const saisie = premier.querySelector('input, select, textarea, button');
  // Le défilement est déjà fait : le focus ne doit pas en déclencher un autre.
  saisie?.focus({ preventScroll: true });
  if (saisie) secouer(saisie);
}

/** Efface toutes les erreurs affichées dans un formulaire. */
export function effacerErreursFormulaire(formulaire) {
  formulaire.querySelectorAll('.champ.invalide').forEach((c) => c.classList.remove('invalide'));
  formulaire.querySelectorAll('[aria-invalid="true"]').forEach((c) => c.removeAttribute('aria-invalid'));
  formulaire.querySelectorAll('.erreur-champ').forEach((z) => { z.textContent = ''; });
}

/** « 12,5 » devient « 12,50 » ; une saisie inintelligible est laissée telle quelle. */
export function formaterChampMontant(valeur) {
  const montant = analyserMontant(valeur);
  return montant === null ? String(valeur ?? '') : montant.toFixed(2).replace('.', ',');
}

/**
 * Champ montant d'un formulaire : « 12,5 » devient « 12,50 » dès qu'on le
 * quitte, et une saisie que l'application ne sait pas lire est signalée tout
 * de suite. Attendre l'enregistrement laissait croire le montant accepté.
 *
 * Le message est posé sur place, sans déplacer le focus : le faire revenir
 * dans le champ que l'on vient de quitter empêcherait d'en sortir.
 *
 * @param {HTMLFormElement} formulaire formulaire portant un champ `montant`.
 */
export function installerChampMontant(formulaire) {
  const champ = formulaire.montant;
  const conteneur = formulaire.querySelector('[data-champ="montant"]');
  const signaler = (message) => {
    conteneur.classList.toggle('invalide', Boolean(message));
    if (message) champ.setAttribute('aria-invalid', 'true');
    else champ.removeAttribute('aria-invalid');
    conteneur.querySelector('.erreur-champ').innerHTML = message
      ? `${icone('cercle-alerte', { taille: 14 })}<span>${echapperHtml(message)}</span>`
      : '';
  };
  champ.addEventListener('input', () => signaler(''));
  champ.addEventListener('blur', () => {
    const brut = champ.value.trim();
    if (!brut) return;
    if (analyserMontant(brut) === null) {
      signaler('Montant non reconnu. Format attendu : 1234,56 (virgule ou point décimal).');
      return;
    }
    champ.value = formaterChampMontant(brut);
  });
}

/**
 * Résultat d'une recherche d'entreprise par SIRET, sous le champ saisi :
 * recherche en cours (ni nom ni erreur), nom trouvé, ou message d'échec.
 *
 * @param {HTMLElement} zone
 * @param {{ nom?: string, erreur?: string, texte?: string }} [resultat]
 */
export function resultatSiret(zone, { nom, erreur, texte } = {}) {
  zone.hidden = false;
  zone.className = `aide-champ${erreur ? ' erreur' : nom ? ' ok' : ''}`;
  if (erreur) {
    zone.innerHTML = `${icone('cercle-alerte', { taille: 14 })}<span>${echapperHtml(erreur)}</span>`;
  } else if (nom) {
    zone.innerHTML = `${icone('cercle-valide', { taille: 14 })}<span>${echapperHtml(texte ?? `Trouvé : ${nom}`)}</span>`;
  } else {
    zone.innerHTML = `${icone('chargement', { taille: 14, classe: 'tourne' })}<span>Recherche dans l’annuaire des entreprises…</span>`;
  }
}

// ---- Bulles d'aide ----------------------------------------------------------------------

/**
 * Bulle d'aide : un « i » posé à côté d'un titre, dont le texte apparaît au
 * survol, au focus clavier ou au clic.
 *
 * Le déclencheur porte `aria-describedby` vers la bulle : c'est ce lien qui
 * fait lire l'explication par un lecteur d'écran.
 *
 * Réservée à ce qui éclaire sans rien demander. Un avertissement qui appelle
 * une action de l'utilisateur doit rester visible.
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
      <span class="bulle-aide" role="tooltip" id="${idBulle}">${echapperHtml(texte)}</span>
    </span>`;
}

/**
 * Fait apparaître les bulles d'aide au survol et au focus clavier, en les
 * plaçant elles-mêmes dans la fenêtre : une bulle ancrée sous son icône
 * déborde dès que celle-ci est près du bord droit.
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
    if (!bulle?.classList.contains('bulle-aide')) return;
    // Mesurable même cachée : `visibility` conserve la mise en page.
    const ancre = declencheur.getBoundingClientRect();
    const taille = bulle.getBoundingClientRect();
    const gauche = Math.max(MARGE, Math.min(ancre.left, window.innerWidth - taille.width - MARGE));
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
  // autant la refermer, à l'image suivante.
  let defilementPrevu = false;
  window.addEventListener('scroll', () => {
    if (defilementPrevu) return;
    defilementPrevu = true;
    requestAnimationFrame(() => {
      defilementPrevu = false;
      epinglee = null;
      document.querySelectorAll('.bulle-aide.visible').forEach((b) => {
        b.classList.remove('visible');
        b.previousElementSibling?.setAttribute('aria-expanded', 'false');
      });
    });
  }, true);
}

// ---- Divers --------------------------------------------------------------------------------

/**
 * Adresse du bouton « Exporter » d'un registre : la page Exports, sur la carte
 * de ce registre, avec l'année et le mois filtrés à l'écran s'il y en a. Ce
 * qu'on regarde est ainsi ce qu'on s'apprête à exporter.
 *
 * @param {'recettes'|'achats'} registre
 * @param {{ annee?: string, mois?: string }} [filtres]
 */
export function lienExport(registre, { annee, mois } = {}) {
  const params = new URLSearchParams({ registre });
  if (annee) params.set('annee', annee);
  if (mois) params.set('mois', mois);
  return `#/exports?${params}`;
}

/**
 * Fait défiler les valeurs chiffrées jusqu'à leur montant : chaque élément
 * `[data-compteur]` monte de zéro à sa cible. Le texte final déjà présent
 * reste la référence exacte (aucune divergence de format). Ne fait rien si
 * l'utilisateur préfère moins de mouvement.
 *
 * @param {HTMLElement} racine conteneur où chercher les compteurs.
 * @param {string} devise code de devise, pour les compteurs de montant.
 */
export function animerCompteurs(racine, devise, depuis = null) {
  if (mouvementReduit()) return;
  const DUREE = depuis ? 700 : 900;
  for (const element of racine.querySelectorAll('[data-compteur]')) {
    const cible = Number(element.dataset.compteur);
    // Au changement d'année, chaque compteur part de sa valeur précédente.
    const origine = depuis ? Number(depuis[element.dataset.cle] ?? 0) : 0;
    if (!Number.isFinite(cible) || !Number.isFinite(origine) || cible === origine) continue;
    const final = element.innerHTML;
    const debut = performance.now();
    const avancer = (maintenant) => {
      const t = Math.min(1, (maintenant - debut) / DUREE);
      const progression = 1 - (1 - t) ** 4; // départ vif, fin douce
      element.innerHTML = t < 1 ? montantDetaille(origine + (cible - origine) * progression, devise) : final;
      if (t < 1) requestAnimationFrame(avancer);
    };
    requestAnimationFrame(avancer);
  }
}

/** Valeurs des compteurs affichés, par clé (`data-cle`) : le point de départ du prochain défilement. */
export const valeursCompteurs = (racine) => Object.fromEntries(
  [...racine.querySelectorAll('[data-compteur][data-cle]')].map((e) => [e.dataset.cle, Number(e.dataset.compteur)])
);

/**
 * Montant en HTML pour les grands chiffres : « 2 705 » se lit d'abord,
 * « ,00 € » suit en retrait, plus petit. Un format sans décimales reste tel
 * quel.
 */
export function montantDetaille(valeur, devise) {
  const texte = formaterMontant(valeur, devise);
  const morceaux = /^(.*\d)(,\d+)(.*)$/.exec(texte);
  if (!morceaux) return echapperHtml(texte);
  return `<span class="montant-detaille">${echapperHtml(morceaux[1])}<span class="centimes">${echapperHtml(morceaux[2] + morceaux[3])}</span></span>`;
}

/**
 * Réordonnancement animé (technique « FLIP ») : la place de chaque élément est
 * relevée avant la mise à jour, puis chacun glisse de l'ancienne à la
 * nouvelle ; les nouveaux venus apparaissent en fondu. Seuls les éléments à
 * l'écran bougent. Sans effet en mouvement réduit.
 *
 * @param {HTMLElement} racine
 * @param {string} selecteur éléments suivis.
 * @param {(e: HTMLElement) => string} cle identité d'un élément d'un rendu à l'autre.
 * @returns {() => void} à appeler une fois le contenu remplacé.
 */
export function preparerFlip(racine, selecteur, cle) {
  if (mouvementReduit()) return () => {};
  const avant = new Map([...racine.querySelectorAll(selecteur)].map((e) => [cle(e), e.getBoundingClientRect().top]));
  return () => {
    const visible = (y) => y > -120 && y < innerHeight + 120;
    for (const element of racine.querySelectorAll(selecteur)) {
      const haut = avant.get(cle(element));
      const apres = element.getBoundingClientRect().top;
      if (!visible(apres) && (haut === undefined || !visible(haut))) continue;
      if (haut === undefined) {
        element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
      } else if (Math.abs(haut - apres) >= 1) {
        element.animate([{ transform: `translateY(${haut - apres}px)` }, { transform: 'none' }],
          { duration: 340, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      }
    }
  };
}

/** Hauteur occupée par un élément, marges comprises : l'état déplié. */
function encombrement(element) {
  const style = getComputedStyle(element);
  return {
    height: `${element.offsetHeight}px`,
    paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom,
    marginTop: style.marginTop,
    marginBottom: style.marginBottom,
    opacity: 1
  };
}

const REPLIE = { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', opacity: 0 };

/**
 * Même durée et même courbe pour déplier et replier : quand un élément en
 * remplace un autre (un avis écarté, son retour à la place), la hauteur totale
 * varie toujours dans le même sens, sans rebond.
 */
const PLIAGE = { duration: 320, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' };

/**
 * Un élément qui vient d'apparaître se déplie depuis une hauteur nulle, puis
 * son contenu se montre en fondu : ce qui est dessous descend en douceur au
 * lieu de sauter. Sans effet en mouvement réduit.
 */
export function deplierHauteur(element) {
  if (mouvementReduit() || !element?.isConnected) return;
  const plein = encombrement(element);
  const debordement = element.style.overflow;
  element.style.overflow = 'hidden';
  element.animate([REPLIE, { opacity: 0, offset: 0.35 }, plein], PLIAGE)
    .finished.catch(() => {}).then(() => { element.style.overflow = debordement; });
}

/**
 * L'inverse : le contenu s'efface, puis l'élément se replie jusqu'à une
 * hauteur nulle avant d'être retiré ; ce qui est dessous remonte en douceur.
 * La promesse est tenue une fois l'élément retiré.
 */
export function replierPuisRetirer(element) {
  if (!element?.isConnected) return Promise.resolve();
  if (mouvementReduit()) { element.remove(); return Promise.resolve(); }
  const plein = encombrement(element);
  element.style.overflow = 'hidden';
  element.style.pointerEvents = 'none';
  return element.animate([plein, { opacity: 0, offset: 0.45 }, REPLIE], { ...PLIAGE, fill: 'forwards' })
    .finished.catch(() => {}).then(() => element.remove());
}

/**
 * Surligne, dans les cellules visées, les passages qui répondent à la
 * recherche, sans tenir compte de la casse ni des accents, comme la recherche
 * elle-même (« dupre » trouve et surligne « Dupré »).
 */
export function surlignerRecherche(racine, selecteur, recherche) {
  const aiguille = normaliserTexte(recherche);
  if (!aiguille) return;
  for (const cellule of racine.querySelectorAll(selecteur)) {
    const marcheur = document.createTreeWalker(cellule, NodeFilter.SHOW_TEXT);
    const noeuds = [];
    while (marcheur.nextNode()) {
      // Ni le retour posé sur la ligne, ni les mentions « Sans libellé ».
      if (!marcheur.currentNode.parentElement.closest('.cadre-retour, .attenue')) noeuds.push(marcheur.currentNode);
    }
    noeuds.forEach((noeud) => surlignerNoeud(noeud, aiguille));
  }
}

/** Remplace un nœud de texte par ses morceaux, les passages trouvés dans des `<mark>`. */
function surlignerNoeud(noeud, aiguille) {
  const texte = noeud.nodeValue;
  // Le texte mis à plat comme la recherche, avec la position d'origine de chaque caractère.
  let plat = '';
  const origine = [];
  for (let i = 0; i < texte.length; i += 1) {
    const c = /\s/.test(texte[i]) ? ' ' : texte[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (c === ' ' && plat.endsWith(' ')) continue;
    for (const lettre of c) { plat += lettre; origine.push(i); }
  }
  let position = plat.indexOf(aiguille);
  if (position < 0) return;
  const fragment = document.createDocumentFragment();
  let dernier = 0;
  while (position >= 0) {
    const debut = origine[position];
    const fin = origine[position + aiguille.length - 1] + 1;
    fragment.append(texte.slice(dernier, debut));
    const marque = document.createElement('mark');
    marque.textContent = texte.slice(debut, fin);
    fragment.append(marque);
    dernier = fin;
    position = plat.indexOf(aiguille, position + aiguille.length);
  }
  fragment.append(texte.slice(dernier));
  noeud.replaceWith(fragment);
}

/** Retarde l'appel d'une fonction (recherche au clavier). */
export function differer(fonction, delaiMs = 250) {
  let minuteur = null;
  return (...args) => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => fonction(...args), delaiMs);
  };
}
