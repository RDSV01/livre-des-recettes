/**
 * Mécanique commune aux deux registres affichés (recettes, achats) : filtres
 * et puces, tri par colonne, affichage progressif, sélection multiple,
 * suppression annulable, résumé et lien d'export.
 *
 * Chaque vue ne garde que ce qui lui est propre : ses colonnes, son
 * formulaire et ses aides à la saisie. Elle dessine son gabarit avec
 * `barreFiltres`, `barreSelection` et `tableauRegistre`, puis confie le reste
 * à `installerRegistre`. Une correction faite ici vaut pour les deux
 * registres d'un coup.
 */

import { etat } from './etat.js';
import {
  echapperHtml, toast, confirmer, differer, majIndicateursTri, majBarreSelection,
  animerDepartLignes, pucesFiltres, lienExport, optionsAnnees, OPTIONS_MOIS,
  afficherErreursFormulaire
} from './ui.js';
import { icone } from './icones.js';
import { enregistrerAction, annulerSi } from './historique.js';
import { formaterMontant, sommeMontants } from '/partage/montants.js';
import { formaterDate, anneeDe, NOMS_MOIS } from '/partage/dates.js';
import { MODES_REGLEMENT } from '/partage/constantes.js';
import { majusculeInitiale } from '/partage/texte.js';

/** Au-delà, l'affichage est progressif (« Afficher les … restantes »). */
const LIMITE_AFFICHAGE = 200;

/**
 * Barre de filtres : recherche, année, mois, mode de règlement, puis les
 * champs propres au registre et le bouton de réinitialisation.
 *
 * @param {object} options
 * @param {string} options.placeholder texte d'exemple de la recherche.
 * @param {string} options.libelleMode « Mode de règlement » ou « Mode de paiement ».
 * @param {string} options.optionsModes options du sélecteur de mode.
 * @param {string} [options.supplementaires] champs en plus (catégorie…).
 */
export function barreFiltres({ placeholder, libelleMode, optionsModes, supplementaires = '' }) {
  return `
    <div class="barre-outils">
      <div class="champ recherche">
        <label for="filtre-q">Rechercher</label>
        <input type="search" id="filtre-q" placeholder="${echapperHtml(placeholder)}">
      </div>
      <div class="champ">
        <label for="filtre-annee">Année</label>
        <select id="filtre-annee"><option value="">Toutes</option></select>
      </div>
      <div class="champ">
        <label for="filtre-mois">Mois</label>
        <select id="filtre-mois">
          <option value="">Tous</option>
          ${OPTIONS_MOIS}
        </select>
      </div>
      <div class="champ">
        <label for="filtre-mode">${echapperHtml(libelleMode)}</label>
        <select id="filtre-mode">
          <option value="">Tous</option>
          ${optionsModes}
        </select>
      </div>
      ${supplementaires}
      <button type="button" class="btn btn-secondaire" id="reinitialiser-filtres">${icone('reinitialiser', { taille: 16 })}<span>Réinitialiser</span></button>
    </div>
    <div class="puces-filtres" id="puces-filtres"></div>`;
}

/** Barre des actions groupées, affichée dès qu'une ligne est cochée. */
export function barreSelection(actionsSupplementaires = '') {
  return `
    <div class="barre-selection" id="barre-selection" hidden>
      <div class="info-selection">
        <span id="compte-selection"></span>
        <span class="note-selection" id="note-selection" hidden></span>
      </div>
      ${actionsSupplementaires}
      <button type="button" class="btn btn-danger" id="supprimer-selection">${icone('corbeille', { taille: 16 })}<span>Supprimer</span></button>
      <button type="button" class="btn btn-tertiaire" id="deselectionner">Tout désélectionner</button>
    </div>`;
}

/**
 * Résumé puis tableau du registre. `largeurs` donne les colonnes de données
 * en pourcentages ; la case à cocher (4 %) et la colonne des actions (fixée
 * en pixels : elle porte trois boutons de taille constante, qu'un
 * pourcentage laissait déborder) sont ajoutées ici.
 *
 * @param {string[]} largeurs pourcentages des colonnes de données.
 * @param {string} entetes cellules d'en-tête des colonnes de données.
 */
export function tableauRegistre(largeurs, entetes) {
  return `
    <p class="resume-filtre resume-registre" id="resume-filtre" aria-live="polite"></p>
    <table class="table-registre" id="table-registre">
      <colgroup>
        <col style="width: 4%">
        ${largeurs.map((l) => `<col style="width: ${l}">`).join('')}
        <col style="width: 108px">
      </colgroup>
      <thead>
        <tr>
          <th class="col-case"><input type="checkbox" id="tout-selectionner" aria-label="Sélectionner les lignes affichées"></th>
          ${entetes}
          <th><span class="hors-ecran">Actions</span></th>
        </tr>
      </thead>
      <tbody id="corps-registre"></tbody>
    </table>`;
}

/**
 * Branche la mécanique commune sur une vue de registre déjà dessinée.
 *
 * @param {HTMLElement} conteneur
 * @param {object} registre
 * @param {'recettes'|'achats'} registre.id
 * @param {{ singulier: string, feminin: boolean, ce: string, nouveau: string, registre: string }} registre.nom
 *   de quoi accorder les messages (« recette », vrai, « cette », « Nouvelle
 *   recette », « livre »).
 * @param {{ filtres: object, tri: object }} registre.etat filtres et tri conservés.
 * @param {string} registre.cleDate date qui fait foi.
 * @param {(lignes: object[], filtres: object) => object[]} registre.filtrer
 * @param {Object<string, Function>} registre.clesTri valeur de tri par colonne.
 * @param {Object<string, (valeur: string) => string>} [registre.libellesFiltres]
 *   nom en clair des filtres propres au registre, pour leurs puces.
 * @param {() => Promise<object[]>} registre.lister
 * @param {(champs: object) => Promise<object>} registre.creer retourne la ligne créée.
 * @param {(id: string, champs: object) => Promise<object>} registre.modifier retourne la ligne modifiée.
 * @param {(ids: string[]) => Promise<object[]>} registre.supprimer retourne les lignes supprimées.
 * @param {(lignes: object[]) => Promise<unknown>} registre.restaurer
 * @param {(ligne: object) => object} registre.champs champs métier d'une ligne (historique).
 * @param {{ formulaire: HTMLFormElement, dialogue: HTMLDialogElement, enregistrer: HTMLButtonElement }} registre.formulaire
 * @param {(ligne: object) => string} registre.cellules cellules de données d'une ligne.
 * @param {(ligne: object) => string} registre.decrire résumé d'une ligne, pour la confirmation.
 * @param {string} registre.titreDupliquer infobulle du bouton de duplication.
 * @param {(ligne: object|null, modele?: object) => void} registre.ouvrirFormulaire
 * @param {(lignes: object[]) => void} [registre.apresChargement]
 */
export function installerRegistre(conteneur, registre) {
  const { filtres, tri } = registre.etat;
  const { modesPersonnalises, devise, formatDate } = etat.parametres;
  const modes = MODES_REGLEMENT.concat(modesPersonnalises);
  const nom = registre.nom;
  const e = nom.feminin ? 'e' : '';
  const pluriel = (n, mot) => `${mot}${n > 1 ? 's' : ''}`;

  const selection = new Set(); // identifiants des lignes cochées
  let toutes = [];             // liste complète, source de tout le reste
  let idsVisibles = [];        // identifiants des lignes réellement affichées
  let montrerTout = false;     // affichage au-delà de LIMITE_AFFICHAGE
  let idsNouveaux = new Set(); // lignes à mettre en avant au prochain rendu

  const $ = (selecteur) => conteneur.querySelector(selecteur);
  const refs = {
    reinitialiser: $('#reinitialiser-filtres'),
    puces: $('#puces-filtres'),
    resume: $('#resume-filtre'),
    exporter: $('#lien-exporter'),
    barre: $('#barre-selection'),
    compte: $('#compte-selection'),
    note: $('#note-selection'),
    toutSelectionner: $('#tout-selectionner'),
    entetes: $('#table-registre thead'),
    corps: $('#corps-registre')
  };

  // ---- Filtres ---------------------------------------------------------------
  // Un champ par filtre conservé (`#filtre-q`, `#filtre-annee`…) ; un filtre
  // sans champ (la catégorie hors activité mixte) est simplement ignoré.
  const champs = Object.fromEntries(Object.keys(filtres).map((cle) => [cle, $(`#filtre-${cle}`)]));
  for (const [cle, champ] of Object.entries(champs)) {
    if (!champ || cle === 'annee') continue; // l'année dépend des données chargées
    champ.value = filtres[cle];
  }

  const changerFiltres = () => {
    montrerTout = false;
    selection.clear();
    rendre();
  };
  champs.q.addEventListener('input', differer(() => {
    filtres.q = champs.q.value.trim();
    changerFiltres();
  }));
  for (const [cle, champ] of Object.entries(champs)) {
    if (!champ || cle === 'q') continue;
    champ.addEventListener('change', () => {
      filtres[cle] = champ.value;
      changerFiltres();
    });
  }
  const remettreAZero = (cle) => {
    filtres[cle] = '';
    if (champs[cle]) champs[cle].value = '';
  };
  refs.reinitialiser.addEventListener('click', () => {
    Object.keys(filtres).forEach(remettreAZero);
    changerFiltres();
  });
  // Une puce retirée remet son filtre à zéro : c'est la façon la plus directe
  // de défaire ce que l'on voit.
  refs.puces.addEventListener('click', (evenement) => {
    const puce = evenement.target.closest('[data-filtre]');
    if (!puce) return;
    remettreAZero(puce.dataset.filtre);
    changerFiltres();
  });

  /** Les filtres qui restreignent la liste, nommés en clair. */
  const nommer = {
    q: (v) => `Recherche : ${v}`,
    annee: (v) => `Année ${v}`,
    mois: (v) => NOMS_MOIS[Number(v) - 1],
    mode: (v) => modes.find((m) => m.code === v)?.libelle ?? v,
    ...registre.libellesFiltres
  };
  const filtresActifs = () => Object.entries(filtres)
    .filter(([cle, valeur]) => valeur && nommer[cle])
    .map(([cle, valeur]) => ({ cle, libelle: nommer[cle](valeur) }));

  // ---- Tri par colonne ---------------------------------------------------------
  refs.entetes.addEventListener('click', (evenement) => {
    const th = evenement.target.closest('th.triable');
    if (!th) return;
    const colonne = th.dataset.tri;
    if (tri.colonne === colonne) {
      tri.sens = tri.sens === 'asc' ? 'desc' : 'asc';
    } else {
      tri.colonne = colonne;
      // Dates et montants se lisent d'abord du plus récent, du plus gros.
      tri.sens = colonne === 'date' || colonne === 'montant' ? 'desc' : 'asc';
    }
    rendre();
  });

  const trier = (lignes) => {
    const cle = registre.clesTri[tri.colonne];
    const facteur = tri.sens === 'asc' ? 1 : -1;
    return lignes.sort((a, b) => {
      const va = cle(a, modesPersonnalises);
      const vb = cle(b, modesPersonnalises);
      const ordre = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr');
      return ordre * facteur;
    });
  };

  // ---- Sélection multiple --------------------------------------------------------
  const selectionnees = () => toutes.filter((l) => selection.has(l.id));
  const cocherSelon = () => refs.corps.querySelectorAll('input[data-selection]').forEach((c) => {
    c.checked = selection.has(c.dataset.selection);
  });

  const majSelection = () => {
    // Total des lignes cochées : pratique pour recouper un montant déclaré.
    const total = sommeMontants(selectionnees().map((l) => l.montant));
    majBarreSelection(
      { barre: refs.barre, compte: refs.compte, toutSelectionner: refs.toutSelectionner },
      selection, idsVisibles,
      (n) => `${n} ${pluriel(n, nom.singulier)} ${pluriel(n, `sélectionné${e}`)} · ${formaterMontant(total, devise)}`
    );
  };

  refs.corps.addEventListener('change', (evenement) => {
    const caseCochee = evenement.target.closest('input[data-selection]');
    if (!caseCochee) return;
    if (caseCochee.checked) selection.add(caseCochee.dataset.selection);
    else selection.delete(caseCochee.dataset.selection);
    majSelection();
  });
  refs.toutSelectionner.addEventListener('change', () => {
    idsVisibles.forEach((id) => (refs.toutSelectionner.checked ? selection.add(id) : selection.delete(id)));
    cocherSelon();
    majSelection();
  });
  $('#deselectionner').addEventListener('click', () => {
    selection.clear();
    cocherSelon();
    majSelection();
  });

  // ---- Suppression annulable -----------------------------------------------------
  /**
   * Supprime des lignes en une seule écriture, en tout ou rien : le registre
   * n'est jamais laissé à moitié supprimé. Les lignes retirées reviennent
   * complètes du serveur, et l'annulation les remet telles quelles, avec leur
   * identifiant et leur date de création d'origine. La ligne ne s'efface de
   * l'écran qu'une fois la suppression acquise.
   */
  async function supprimer(lignes) {
    const lignesTableau = lignes.map((l) =>
      refs.corps.querySelector(`input[data-selection="${l.id}"]`)?.closest('tr'));
    let supprimees;
    try {
      supprimees = await registre.supprimer(lignes.map((l) => l.id));
    } catch (erreur) {
      toast(erreur.message, 'erreur');
      return;
    }
    selection.clear();
    if (supprimees.length > 0) {
      const action = enregistrerAction({
        annuler: () => registre.restaurer(supprimees),
        retablir: () => registre.supprimer(supprimees.map((l) => l.id))
      });
      await animerDepartLignes(lignesTableau);
      const n = supprimees.length;
      toast(`${n} ${pluriel(n, nom.singulier)} ${pluriel(n, `supprimé${e}`)}.`, 'succes', {
        action: { libelle: 'Annuler la suppression', executer: () => annulerSuppression(action) }
      });
    }
    await charger();
  }

  /**
   * Défait une suppression depuis le bouton du toast. L'annulation ne joue que
   * si rien d'autre n'a été fait entre-temps : elle doit défaire la suppression
   * qu'elle annonce, pas celle qui l'a suivie.
   */
  async function annulerSuppression(action) {
    try {
      const fait = await annulerSi(action);
      toast(fait
        ? 'Suppression annulée.'
        : 'Une autre action a eu lieu depuis : utilisez Ctrl+Z pour revenir en arrière pas à pas.',
      fait ? 'succes' : 'erreur');
      await charger();
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
  }

  $('#supprimer-selection').addEventListener('click', async () => {
    const cibles = selectionnees();
    if (cibles.length === 0) return;
    const total = sommeMontants(cibles.map((l) => l.montant));
    const dates = cibles.map((l) => l[registre.cleDate]).sort();
    const periode = dates[0] === dates.at(-1)
      ? formaterDate(dates[0], formatDate)
      : `du ${formaterDate(dates[0], formatDate)} au ${formaterDate(dates.at(-1), formatDate)}`;
    const accord = await confirmer({
      titre: `Supprimer ${cibles.length} ${pluriel(cibles.length, nom.singulier)} ?`,
      message: `${periode}, total ${formaterMontant(total, devise)}. ` +
        'La suppression reste annulable tant que vous ne quittez pas l’application.'
    });
    if (accord) await supprimer(cibles);
  });

  // ---- Actions par ligne (délégation d'événements) -----------------------------
  refs.corps.addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('[data-action]');
    if (!bouton) return;
    if (bouton.dataset.action === 'afficher-plus') {
      montrerTout = true;
      rendre();
      return;
    }
    const ligne = toutes.find((l) => l.id === bouton.dataset.id);
    if (!ligne) return;

    if (bouton.dataset.action === 'modifier') {
      registre.ouvrirFormulaire(ligne);
    } else if (bouton.dataset.action === 'dupliquer') {
      // Opération récurrente : mêmes champs, date remise à aujourd'hui.
      registre.ouvrirFormulaire(null, ligne);
    } else if (bouton.dataset.action === 'supprimer') {
      const accord = await confirmer({
        titre: `Supprimer ${nom.ce} ${nom.singulier} ?`,
        message: `${registre.decrire(ligne)}. ` +
          'La suppression reste annulable tant que vous ne quittez pas l’application.'
      });
      if (accord) await supprimer([ligne]);
    }
  });

  // ---- Rendu ---------------------------------------------------------------------
  /** Années présentes dans le registre, la plus récente d'abord. */
  function rendreAnnees() {
    const annees = [...new Set(toutes.map((l) => anneeDe(l[registre.cleDate])))].sort((a, b) => b - a);
    champs.annee.innerHTML = `<option value="">Toutes</option>${optionsAnnees(annees)}`;
    champs.annee.value = annees.includes(Number(filtres.annee)) ? filtres.annee : '';
    filtres.annee = champs.annee.value;
  }

  function rendre() {
    const affichees = trier(registre.filtrer(toutes, filtres));
    const total = sommeMontants(affichees.map((l) => l.montant));
    const actifs = filtresActifs();
    const aucun = `Aucun${e} ${nom.singulier}`;

    refs.puces.innerHTML = pucesFiltres(actifs);
    refs.reinitialiser.disabled = actifs.length === 0;
    refs.exporter.href = lienExport(registre.id, filtres);
    // Un sous-total filtré doit dire qu'il est partiel : c'est ce chiffre que
    // l'on recopie dans une déclaration.
    refs.resume.innerHTML = affichees.length === 0
      ? `${aucun} ne correspond aux filtres actifs.`
      : `<span class="resume-nombre">${affichees.length} ${pluriel(affichees.length, nom.singulier)}</span>` +
        (affichees.length !== toutes.length ? `<span class="resume-portee">sur ${toutes.length} au total, liste filtrée</span>` : '') +
        `<span class="resume-total">${echapperHtml(formaterMontant(total, devise))}</span>`;
    majIndicateursTri(refs.entetes, tri);

    const colonnes = refs.entetes.querySelectorAll('th').length;
    const ligneVide = (contenu) => `<tr class="ligne-vide"><td colspan="${colonnes}">${contenu}</td></tr>`;

    if (affichees.length === 0) {
      idsVisibles = [];
      refs.note.hidden = true;
      refs.corps.innerHTML = ligneVide(actifs.length > 0
        ? `${aucun} ne correspond aux filtres actifs. Retirez une puce ci-dessus pour élargir la liste.`
        : `${aucun} à afficher. Ajoutez-en un${e} avec « ${nom.nouveau} ».`);
      majSelection();
      return;
    }

    const visibles = montrerTout ? affichees : affichees.slice(0, LIMITE_AFFICHAGE);
    idsVisibles = visibles.map((l) => l.id);
    const restantes = affichees.length - visibles.length;
    // « Tout sélectionner » ne coche que les lignes affichées : sur un registre
    // long, la barre annonçait 200 lignes sans dire que les autres restaient
    // hors du lot, juste avant un bouton « Supprimer ».
    refs.note.textContent = restantes > 0
      ? `Portée : les ${visibles.length} lignes affichées ; ${restantes} autres ne sont pas concernées.`
      : '';
    refs.note.hidden = restantes === 0;

    refs.corps.innerHTML = visibles.map((l) => `
      <tr${idsNouveaux.has(l.id) ? ' class="ligne-nouvelle"' : ''}>
        <td class="col-case"><input type="checkbox" data-selection="${l.id}"
          ${selection.has(l.id) ? 'checked' : ''} aria-label="Sélectionner"></td>
        ${registre.cellules(l)}
        <td class="actions">
          <button type="button" class="btn-icone" data-action="dupliquer" data-id="${l.id}" title="${echapperHtml(registre.titreDupliquer)}" aria-label="Dupliquer">${icone('copier', { taille: 16 })}</button>
          <button type="button" class="btn-icone" data-action="modifier" data-id="${l.id}" title="Modifier" aria-label="Modifier">${icone('crayon', { taille: 16 })}</button>
          <button type="button" class="btn-icone danger" data-action="supprimer" data-id="${l.id}" title="Supprimer" aria-label="Supprimer">${icone('corbeille', { taille: 16 })}</button>
        </td>
      </tr>`).join('') + (restantes > 0 ? ligneVide(`
        <button type="button" class="btn btn-tertiaire" data-action="afficher-plus">
          Afficher les ${restantes} ${pluriel(restantes, nom.singulier)} ${pluriel(restantes, `restant${e}`)}
        </button>`) : '');

    // Le surlignage d'ajout n'a lieu qu'une fois, au rendu qui suit la création.
    idsNouveaux.clear();
    majSelection();
  }

  /** Recharge la liste complète depuis le serveur, puis redessine. */
  async function charger() {
    toutes = await registre.lister();
    registre.apresChargement?.(toutes);
    rendreAnnees();
    rendre();
  }

  // ---- Enregistrement du formulaire ---------------------------------------------
  /**
   * Enregistre la saisie du formulaire, création ou modification, et la rend
   * annulable : défaire une création supprime la ligne, la rétablir la remet
   * telle quelle (même identifiant) au lieu d'en créer une copie.
   *
   * Le bouton se ferme pendant l'écriture : sans cela, un double clic sur un
   * enregistrement lent créait deux fois la même ligne. Les erreurs de
   * validation s'affichent champ par champ, les autres en notification.
   *
   * @param {object|null} enEdition ligne modifiée, ou `null` pour une création.
   * @param {object} champs valeurs saisies.
   * @param {{ apres?: () => Promise<unknown> }} [options] rechargement en plus
   *   (le carnet de clients, qu'une recette a pu compléter).
   */
  async function enregistrerSaisie(enEdition, champs, { apres } = {}) {
    const { formulaire, dialogue, enregistrer } = registre.formulaire;
    const Nom = majusculeInitiale(nom.singulier);
    enregistrer.disabled = true;
    try {
      if (enEdition) {
        const { id } = enEdition;
        const avant = registre.champs(enEdition);
        const apresModification = registre.champs(await registre.modifier(id, champs));
        enregistrerAction({
          annuler: () => registre.modifier(id, avant),
          retablir: () => registre.modifier(id, apresModification)
        });
        toast(`${Nom} modifié${e}.`);
      } else {
        const creee = await registre.creer(champs);
        idsNouveaux = new Set([creee.id]); // surlignée au rendu qui suit
        enregistrerAction({
          annuler: () => registre.supprimer([creee.id]),
          retablir: () => registre.restaurer([creee])
        });
        toast(`${Nom} ajouté${e} au ${nom.registre}.`);
      }
      dialogue.close();
      await Promise.all([charger(), apres?.()]);
    } catch (erreur) {
      if (erreur.erreurs) afficherErreursFormulaire(formulaire, erreur.erreurs);
      else toast(erreur.message, 'erreur');
    } finally {
      enregistrer.disabled = false;
    }
  }

  return {
    charger,
    enregistrerSaisie,
    /** Liste complète, telle que chargée. */
    toutes: () => toutes,
    selectionnees,
    viderSelection: () => selection.clear()
  };
}
