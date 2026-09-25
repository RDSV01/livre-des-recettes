/**
 * Mécanique commune aux deux registres affichés (recettes, achats) : filtres,
 * tri par colonne, affichage progressif, sélection multiple et barre d'actions
 * groupées, pièces jointes, suppression annulable et enregistrement d'une
 * saisie.
 *
 * Les retours se font là où l'on agit : la ligne ajoutée ou modifiée porte
 * « Ajoutée · Annuler », la ligne supprimée laisse sa place « Supprimée ·
 * Annuler », un lot se confirme sur la barre de sélection. Chaque geste entre
 * aussi dans l'historique (Ctrl+Z / Ctrl+Y).
 *
 * Chaque vue ne garde que ce qui lui est propre : ses colonnes, son panneau
 * de saisie et ses aides à la saisie. Une correction faite ici vaut pour les
 * deux registres d'un coup.
 */

import { api, urlPiece } from './api.js';
import { etat } from './etat.js';
import {
  echapperHtml, toast, differer, selecteur, marquerFiltre, lienExport, accorder,
  poidsLisible, optionsCodes, OPTIONS_MOIS, afficherErreursFormulaire,
  mouvementReduit, choixAnnee, brancherChoixAnnee, preparerFlip, surlignerRecherche,
  deplierHauteur, replierPuisRetirer
} from './ui.js';
import { annoncer, bandeauRetour, menuContextuel, reussite, confettis, minuteur, DUREE_RETOUR } from './retours.js';
import { icone } from './icones.js';
import { enregistrerAction, annulerAction } from './historique.js';
import { apercuPiece, choisirPdf, verifierPdf, glisseDesFichiers } from './pieces.js';
import { formaterMontant, sommeMontants } from '/partage/montants.js';
import { formaterDate, anneeDe, nomMois } from '/partage/dates.js';
import { MODES_REGLEMENT } from '/partage/constantes.js';
import { majusculeInitiale } from '/partage/texte.js';

/** Au-delà, l'affichage est progressif (« Afficher les … restantes »). */
const LIMITE_AFFICHAGE = 200;

/**
 * Cadre du panneau de saisie d'une ligne : en-tête, corps (les champs de la
 * vue) et pied. Les champs arrivent l'un après l'autre (`--i`).
 *
 * @param {object} options
 * @param {string} options.titre
 * @param {string} options.sousTitre
 * @param {string} options.corps balisage des champs.
 * @param {string} options.libelleBouton « Ajouter la recette », « Enregistrer »…
 */
export function cadrePanneau({ titre, sousTitre, corps, libelleBouton }) {
  return `
    <form class="formulaire-panneau" novalidate>
      <div class="panneau-tete">
        <div>
          <h2 id="titre-panneau">${echapperHtml(titre)}</h2>
          <p>${echapperHtml(sousTitre)}</p>
        </div>
        <button type="button" class="btn-icone" data-fermer aria-label="Fermer">${icone('croix', { taille: 18 })}</button>
      </div>
      <div class="panneau-corps">
        ${corps}
        <p class="erreur-panneau" data-erreur-panneau role="alert"></p>
      </div>
      <div class="panneau-pied">
        <span class="aide"><kbd>Échap</kbd> pour fermer</span>
        <div class="actions">
          <button type="button" class="btn btn-fantome" data-fermer>Annuler</button>
          <button type="submit" class="btn btn-principal">${icone('coche', { taille: 16 })}<span>${echapperHtml(libelleBouton)}</span></button>
        </div>
      </div>
    </form>`;
}

/**
 * Branche le registre dans sa carte : barre de filtres, résumé, tableau.
 *
 * @param {HTMLElement} carte section qui reçoit le registre.
 * @param {object} registre
 * @param {'recettes'|'achats'} registre.id
 * @param {{ singulier: string, pluriel: string, feminin: boolean, nouveau: string, cle: string }} registre.nom
 *   de quoi accorder les messages (« recette », « recettes », vrai,
 *   « Nouvelle recette », « recette » : clé des réponses du serveur).
 * @param {{ filtres: object, tri: object }} registre.etat filtres et tri conservés.
 * @param {string} registre.cleDate date qui fait foi.
 * @param {string} registre.cleTiers client ou fournisseur.
 * @param {string} registre.colonneRetour colonne qui porte le retour d'une ligne.
 * @param {string} registre.quoiPiece « la facture », « le justificatif ».
 * @param {string} registre.placeholder texte d'exemple de la recherche.
 * @param {string} registre.titreDupliquer
 * @param {boolean} [registre.avecCategorie] filtre par catégorie (activité mixte).
 * @param {{ cle: string, titre?: string, classe?: string, tri?: boolean, cellule?: (ligne: object) => string }[]} registre.colonnes
 *   dans l'ordre d'affichage ; `{ cle: 'piece' }` place la colonne du PDF, la
 *   dernière colonne doit être le montant.
 * @param {(lignes: object[], filtres: object) => object[]} registre.filtrer
 * @param {Object<string, Function>} registre.clesTri valeur de tri par colonne.
 * @param {() => Promise<object[]>} registre.lister
 * @param {(champs: object) => Promise<object>} registre.creer retourne la ligne créée.
 * @param {(id: string, champs: object) => Promise<object>} registre.modifier retourne la ligne modifiée.
 * @param {(ids: string[]) => Promise<object[]>} registre.supprimer retourne les lignes supprimées.
 * @param {(lignes: object[]) => Promise<unknown>} registre.restaurer
 * @param {(ligne: object) => object} registre.champs champs métier d'une ligne (historique).
 * @param {(ligne: object|null, modele?: object) => void} registre.ouvrirFormulaire
 * @param {HTMLAnchorElement} [registre.lienExporter] bouton « Exporter » de la page.
 * @param {{ code: string, libelle: string }[]} [registre.actionsLot] actions groupées en plus.
 * @param {(code: string, lignes: object[]) => Promise<{ texte: string, action?: object }>} [registre.appliquerLot]
 * @param {(lignes: object[]) => void} [registre.apresChargement]
 */
export function installerRegistre(carte, registre) {
  const { filtres, tri } = registre.etat;
  const { modesPersonnalises, devise, formatDate } = etat.parametres;
  const modes = MODES_REGLEMENT.concat(modesPersonnalises);
  const nom = registre.nom;
  const e = nom.feminin ? 'e' : '';
  const Nom = majusculeInitiale(nom.singulier);
  const colonnes = registre.colonnes;
  const nbColonnes = colonnes.length + 2; // case à cocher et actions en plus
  const barre = document.getElementById('barre-selection');

  const selection = new Set();  // identifiants des lignes cochées
  let toutes = [];              // liste complète, source de tout le reste
  let affichees = [];           // lignes filtrées et triées
  let idsVisibles = [];         // lignes réellement dessinées
  let montrerTout = false;      // affichage au-delà de LIMITE_AFFICHAGE
  let idNouveau = null;         // ligne à mettre en avant au prochain rendu
  /** Retour posé sur une ligne : id → { texte, action, apresAnnulation, erreur }. */
  const retours = new Map();
  /** Places laissées par les suppressions d'une ligne : { cle, rang, texte, action }. */
  let places = [];
  let minuteurLot = null;

  carte.innerHTML = gabarit();
  const $ = (selecteurCss) => carte.querySelector(selecteurCss);
  const refs = {
    recherche: $('#filtre-q'),
    zoneRetours: $('.zone-retours'),
    zoneAvis: $('.zone-avis'),
    resume: $('.resume-registre'),
    entetes: $('thead'),
    corps: $('tbody'),
    pied: $('tfoot'),
    toutSelectionner: $('#tout-selectionner')
  };

  // Sur une longue année, les titres de colonnes restent en haut de l'écran et
  // le total en bas ; collés, ils prennent une ombre qui les détache des lignes.
  const surveillerCollage = (element, bord) => {
    const observateur = new IntersectionObserver(([entree]) => {
      if (!element.isConnected) { observateur.disconnect(); return; }
      // Avec un seuil de 1, \`isIntersecting\` tombe dès qu'un pixel dépasse :
      // c'est la part visible qui dit si l'élément est à l'écran.
      const r = entree.boundingClientRect;
      element.classList.toggle('colle', entree.intersectionRatio > 0 &&
        (bord === 'haut' ? r.top <= 1 : r.bottom >= innerHeight - 1));
    }, { threshold: [1], rootMargin: bord === 'haut' ? '-1px 0px 0px 0px' : '0px 0px -1px 0px' });
    observateur.observe(element);
  };
  surveillerCollage(refs.entetes, 'haut');
  surveillerCollage(refs.pied, 'bas');

  function gabarit() {
    const filtre = (cle, etiquette, options) => `<div class="champ-filtre">
        <label class="etiquette-champ" for="filtre-${cle}">${etiquette}</label>${selecteur({ id: `filtre-${cle}`, options })}</div>`;
    const entete = (col) => {
      if (col.cle === 'piece') {
        return '<th class="col-piece" title="PDF joint">PDF</th>';
      }
      if (col.tri === false) return `<th class="${col.classe ?? ''}">${col.titre}</th>`;
      return `<th class="${col.classe ?? ''}" data-tri="${col.cle}" aria-sort="none">
        <button type="button" class="tri">${col.titre}<span class="indicateur-tri"></span></button></th>`;
    };
    // La recherche et l'année restent à portée de main ; les autres filtres
    // attendent derrière « Filtres », et ceux qui agissent s'affichent en
    // pastilles qu'une croix retire.
    return `
      <div class="outils">
        <label class="recherche">
          <span class="hors-ecran">Rechercher</span>
          ${icone('recherche', { taille: 16 })}
          <input type="search" id="filtre-q" placeholder="${echapperHtml(registre.placeholder)}" autocomplete="off">
        </label>
        ${choixAnnee({ id: `annee-${registre.id}`, etiquette: 'Année' })}
        <button type="button" class="btn btn-filtres" popovertarget="filtres-${registre.id}" aria-expanded="false">
          ${icone('filtre', { taille: 16 })}Filtres<span class="compte-filtres" hidden></span></button>
        <div class="filtres-actifs"></div>
        <div class="panneau-filtres" id="filtres-${registre.id}" popover role="dialog" aria-label="Filtres">
          ${filtre('mois', 'Mois', `<option value="">Tous les mois</option>${OPTIONS_MOIS}`)}
          ${registre.avecCategorie ? filtre('categorie', 'Catégorie', '<option value="">Toutes catégories</option><option value="prestations">Prestations</option><option value="ventes">Ventes</option><option value="aucune">Non catégorisées</option>') : ''}
          ${filtre('mode', 'Paiement', `<option value="">Tous les paiements</option>${optionsCodes(modes)}`)}
          ${filtre('piece', 'PDF joint', '<option value="">Tous</option><option value="avec">Avec PDF joint</option><option value="sans">Sans PDF joint</option>')}
          <button type="button" class="lien-bouton" data-vider-panneau hidden>Retirer ces filtres</button>
        </div>
      </div>
      <div class="zone-avis"></div>
      <div class="zone-retours"></div>
      <div class="resume-registre" aria-live="polite"></div>
      <table class="tableau registre">
        <thead><tr>
          <th class="col-case"><input type="checkbox" class="case" id="tout-selectionner" aria-label="Sélectionner les lignes affichées"></th>
          ${colonnes.map(entete).join('')}
          <th class="col-actions"><span class="hors-ecran">Actions</span></th>
        </tr></thead>
        <tbody></tbody>
        <tfoot></tfoot>
      </table>`;
  }

  // ---- Filtres -------------------------------------------------------------------------
  // Un champ par filtre conservé ; un filtre sans champ (la catégorie hors
  // activité mixte) est remis à zéro, pour ne rien cacher sans le montrer.
  // L'année a son propre sélecteur, « ‹ 2026 › », branché au chargement.
  const champs = Object.fromEntries(Object.keys(filtres).filter((cle) => cle !== 'annee')
    .map((cle) => [cle, $(`#filtre-${cle}`)]));
  for (const [cle, champ] of Object.entries(champs)) {
    if (!champ) { filtres[cle] = ''; continue; }
    champ.value = filtres[cle];
    if (champ.tagName === 'SELECT') marquerFiltre(champ);
  }
  /** Filtres rangés derrière le bouton « Filtres » (ni la recherche, ni l'année). */
  const clesPanneau = Object.keys(champs).filter((cle) => cle !== 'q' && champs[cle]);
  let choixAnneeRegistre = null;

  /** Le bouton compte les filtres du panneau qui agissent ; chacun s'affiche en pastille. */
  function majFiltresActifs() {
    const actifs = clesPanneau.filter((cle) => filtres[cle]);
    const compte = $('.compte-filtres');
    compte.hidden = actifs.length === 0;
    compte.textContent = actifs.length;
    $('.btn-filtres').classList.toggle('actif', actifs.length > 0);
    $('[data-vider-panneau]').hidden = actifs.length === 0;
    $('.filtres-actifs').innerHTML = actifs.map((cle) => {
      const texte = champs[cle].selectedOptions[0]?.text ?? filtres[cle];
      return `<button type="button" class="pastille-filtre" data-retirer-filtre="${cle}" aria-label="Retirer le filtre ${echapperHtml(texte)}">
        ${echapperHtml(texte)}${icone('croix', { taille: 13 })}</button>`;
    }).join('');
    $('.choix-annee').classList.toggle('actif', filtres.annee !== '');
  }

  const changerFiltres = () => {
    montrerTout = false;
    selection.clear();
    places = [];
    majFiltresActifs();
    rendre({ anime: true });
  };
  refs.recherche.addEventListener('input', differer(() => {
    filtres.q = refs.recherche.value.trim();
    changerFiltres();
  }, 200));
  for (const cle of clesPanneau) {
    champs[cle].addEventListener('change', () => {
      filtres[cle] = champs[cle].value;
      marquerFiltre(champs[cle]);
      changerFiltres();
    });
  }
  const appliquerFiltre = (cle, valeur) => {
    filtres[cle] = valeur;
    if (cle === 'annee') { choixAnneeRegistre?.definir(valeur); return; }
    if (!champs[cle]) return;
    champs[cle].value = valeur;
    if (champs[cle].tagName === 'SELECT') marquerFiltre(champs[cle]);
  };
  const filtreActif = () => Object.values(filtres).some(Boolean);

  // Le panneau s'ouvre sous son bouton, et se referme si la page défile.
  const boutonFiltres = $('.btn-filtres');
  const panneauFiltres = $('.panneau-filtres');
  // Page quittée panneau ouvert : l'écouteur se retire de lui-même.
  const fermerPanneau = () => {
    if (panneauFiltres.isConnected) panneauFiltres.hidePopover();
    else window.removeEventListener('scroll', fermerPanneau, true);
  };
  panneauFiltres.addEventListener('toggle', (evenement) => {
    const ouvert = evenement.newState === 'open';
    boutonFiltres.setAttribute('aria-expanded', String(ouvert));
    if (!ouvert) { window.removeEventListener('scroll', fermerPanneau, true); return; }
    const r = boutonFiltres.getBoundingClientRect();
    panneauFiltres.style.top = `${r.bottom + 6}px`;
    panneauFiltres.style.left = `${Math.max(16, Math.min(r.left, innerWidth - panneauFiltres.offsetWidth - 16))}px`;
    window.addEventListener('scroll', fermerPanneau, { capture: true, passive: true });
    champs[clesPanneau[0]]?.focus({ preventScroll: true });
  });
  majFiltresActifs();

  // ---- Tri par colonne ---------------------------------------------------------------------
  const trier = (lignes) => {
    const cle = registre.clesTri[tri.colonne] ?? registre.clesTri.date;
    const facteur = tri.sens === 'asc' ? 1 : -1;
    return lignes.sort((a, b) => {
      const va = cle(a, modesPersonnalises);
      const vb = cle(b, modesPersonnalises);
      const ordre = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr');
      // À égalité, la plus récente d'abord : l'ordre reste stable d'un rendu à l'autre.
      return (ordre || String(a[registre.cleDate]).localeCompare(String(b[registre.cleDate])) ||
        String(a.creeLe).localeCompare(String(b.creeLe))) * facteur;
    });
  };
  const majEntetes = () => refs.entetes.querySelectorAll('th[data-tri]').forEach((th) => {
    const actif = th.dataset.tri === tri.colonne;
    th.setAttribute('aria-sort', actif ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none');
    th.querySelector('.indicateur-tri').innerHTML = actif
      ? icone('chevron-bas', { taille: 13, classe: tri.sens === 'asc' ? 'monte' : '' })
      : icone('tri', { taille: 13 });
  });

  // ---- Rendu -------------------------------------------------------------------------------
  const decrire = (l) => `de ${formaterMontant(l.montant, devise)} (${l[registre.cleTiers]})`;

  const pastilleRetour = (l) => {
    const retour = retours.get(l.id);
    if (!retour) return '';
    return `<span class="cadre-retour${retour.montre ? '' : ' nouveau'}"><span class="retour-ligne${retour.erreur ? ' erreur' : ''}" title="${echapperHtml(retour.texte)}">${icone(retour.erreur ? 'cercle-alerte' : 'cercle-valide', { taille: 14 })}<span class="texte-retour">${echapperHtml(retour.texte)}</span>
      ${retour.action ? `<button type="button" class="lien-bouton" data-annuler-retour="${l.id}">Annuler${minuteur(DUREE_RETOUR, retour.debut)}</button>` : ''}</span></span>`;
  };

  const cellulePiece = (l) => (l.pieceJointe
    ? `<td class="col-piece"><button type="button" class="btn-icone piece-oui" data-action="voir-piece"
        aria-label="Voir ${registre.quoiPiece} (PDF ${echapperHtml(l.pieceJointe.nom)})" title="${echapperHtml(l.pieceJointe.nom)}">${icone('trombone', { taille: 16 })}</button></td>`
    : `<td class="col-piece"><button type="button" class="btn-icone piece-non" data-action="joindre"
        aria-label="Joindre ${registre.quoiPiece} en PDF" title="Joindre un PDF, ou déposez-le sur la ligne">${icone('fichier-depot', { taille: 16 })}</button></td>`);

  const ligneHtml = (l) => `<tr data-id="${l.id}" class="${l.id === idNouveau ? 'nouvelle' : ''}${selection.has(l.id) ? ' choisie' : ''}">
      <td class="col-case"><input type="checkbox" class="case" data-cocher="${l.id}" ${selection.has(l.id) ? 'checked' : ''}
        aria-label="Sélectionner ${echapperHtml(`${nom.singulier} ${decrire(l)}`)}"></td>
      ${colonnes.map((col) => {
        if (col.cle === 'piece') return cellulePiece(l);
        const cellule = col.cellule(l);
        return col.cle === registre.colonneRetour ? cellule.replace(/<\/td>\s*$/, `${pastilleRetour(l)}</td>`) : cellule;
      }).join('')}
      <td class="col-actions"><button type="button" class="btn-icone bouton-menu" data-action="menu"
        aria-label="Actions sur ${echapperHtml(`${nom.singulier} ${decrire(l)}`)}" aria-haspopup="menu" aria-expanded="false">${icone('points', { taille: 18 })}</button></td>
    </tr>`;

  const placeHtml = (p) => `<tr class="place-retiree" data-place="${p.cle}"><td colspan="${nbColonnes}">
      <span>${icone('corbeille', { taille: 15 })}${echapperHtml(p.texte)}</span>
      <button type="button" class="lien-bouton" data-restaurer-place="${p.cle}">Annuler${minuteur(DUREE_RETOUR, p.debut)}</button></td></tr>`;

  const ligneVide = (contenu) => `<tr class="ligne-vide"><td colspan="${nbColonnes}" class="vide">${contenu}</td></tr>`;

  /** Séparateur d'un mois, avec son nombre de lignes et son sous-total (lignes filtrées). */
  const separateurHtml = (cleMois, { nombre, total }) => `<tr class="separateur-mois" data-mois="${cleMois}">
      <td colspan="${colonnes.length}"><span class="mois">${majusculeInitiale(nomMois(Number(cleMois.slice(5))))} ${cleMois.slice(0, 4)}</span>
        <span class="compte">${accorder(nombre, nom.singulier, nom.pluriel)}</span></td>
      <td class="montant">${echapperHtml(formaterMontant(total, devise))}</td><td></td></tr>`;

  /**
   * @param {{ anime?: boolean }} [options] `anime` : les lignes glissent de
   *   leur ancienne place à la nouvelle (tri, filtre, recherche).
   */
  function rendre({ anime = false } = {}) {
    const jouer = anime
      ? preparerFlip(refs.corps, 'tr[data-id], tr[data-mois], tr[data-place]',
        (tr) => tr.dataset.id ?? (tr.dataset.mois ? `mois-${tr.dataset.mois}` : `place-${tr.dataset.place}`))
      : () => {};
    affichees = trier(registre.filtrer(toutes, filtres));
    const total = sommeMontants(affichees.map((l) => l.montant));
    const filtre = filtreActif();
    const sansPiece = toutes.filter((l) => !l.pieceJointe).length;

    if (registre.lienExporter) registre.lienExporter.href = lienExport(registre.id, filtres);
    majEntetes();

    // Un sous-total filtré doit dire qu'il est partiel : c'est ce chiffre que
    // l'on recopie dans une déclaration.
    refs.resume.innerHTML = toutes.length === 0 ? '' : `
      <span><strong>${accorder(affichees.length, nom.singulier, nom.pluriel)}</strong>${filtre ? ` sur ${toutes.length}` : ''}</span>
      <span><strong>${echapperHtml(formaterMontant(total, devise))}</strong></span>
      ${!filtre && sansPiece > 0 ? `<button type="button" class="lien-discret" data-voir-sans-piece>${icone('trombone', { taille: 14 })}${accorder(sansPiece, `${nom.singulier} sans PDF`, `${nom.pluriel} sans PDF`)}</button>` : ''}
      ${filtre ? '<button type="button" class="lien-bouton" data-effacer-filtres>Effacer les filtres</button>' : ''}`;

    if (affichees.length === 0) {
      idsVisibles = [];
      refs.corps.innerHTML = places.map(placeHtml).join('') + (toutes.length === 0 && !filtre
        ? ligneVide(`${icone(registre.id, { taille: 22 })}Aucun${e} ${nom.singulier} pour l’instant.<br>
            <button type="button" class="btn btn-principal" data-nouveau>${icone('plus', { taille: 16 })}${nom.nouveau}</button>`)
        : ligneVide(`${icone('recherche', { taille: 22 })}Aucune ligne ne correspond à ces filtres.<br>
            <button type="button" class="lien-bouton" data-effacer-filtres>Effacer les filtres</button>`));
      refs.pied.innerHTML = '';
      majSelection();
      return;
    }

    const visibles = montrerTout ? affichees : affichees.slice(0, LIMITE_AFFICHAGE);
    idsVisibles = visibles.map((l) => l.id);
    const restantes = affichees.length - visibles.length;
    const rangs = visibles.map((l) => ({ ligne: l, html: ligneHtml(l) }));
    [...places].sort((a, b) => a.rang - b.rang)
      .forEach((p) => rangs.splice(Math.min(Math.max(p.rang, 0), rangs.length), 0, { html: placeHtml(p) }));

    // Triées par date, les lignes se lisent mois par mois, comme dans le
    // registre exporté : un séparateur ouvre chaque mois, avec son sous-total.
    if (tri.colonne === 'date') {
      const mois = new Map();
      for (const l of affichees) {
        const cle = String(l[registre.cleDate]).slice(0, 7);
        const m = mois.get(cle) ?? { nombre: 0, montants: [] };
        m.nombre += 1;
        m.montants.push(l.montant);
        mois.set(cle, m);
      }
      let precedent = null;
      for (let i = 0; i < rangs.length; i += 1) {
        if (!rangs[i].ligne) continue;
        const cle = String(rangs[i].ligne[registre.cleDate]).slice(0, 7);
        if (cle === precedent) continue;
        precedent = cle;
        const m = mois.get(cle);
        rangs.splice(i, 0, { html: separateurHtml(cle, { nombre: m.nombre, total: sommeMontants(m.montants) }) });
        i += 1;
      }
    }

    refs.corps.innerHTML = rangs.map((r) => r.html).join('') + (restantes > 0 ? ligneVide(`
      <button type="button" class="btn" data-action="afficher-plus">
        Afficher ${restantes > 1 ? `les ${restantes} ${nom.pluriel} restant${e}s` : `${nom.feminin ? 'la dernière' : 'le dernier'} ${nom.singulier}`}
      </button>`) : '');
    refs.pied.innerHTML = `<tr><td></td><td colspan="${colonnes.length - 1}">${filtre ? 'Total des lignes filtrées' : 'Total'}
      <span class="attenue">· ${accorder(affichees.length, nom.singulier, nom.pluriel)}</span></td>
      <td class="montant">${echapperHtml(formaterMontant(total, devise))}</td><td></td></tr>`;
    surlignerRecherche(refs.corps, 'td.client, td.libelle, .ref', filtres.q);
    // Un retour tout juste posé se déplie une fois ; redessiné ensuite (tri,
    // filtre), il reste tel quel. Avant le glissement, qui mesure les lignes.
    for (const cadre of refs.corps.querySelectorAll('.cadre-retour.nouveau')) {
      const retour = retours.get(cadre.closest('tr').dataset.id);
      if (retour) retour.montre = true;
      deplierHauteur(cadre);
    }
    jouer();

    // Le surlignage d'ajout n'a lieu qu'une fois, au rendu qui suit l'enregistrement.
    idNouveau = null;
    majSelection();
  }

  /**
   * Sélecteur d'année, reconstruit avec les années présentes dans le
   * registre : « Toutes », puis de la plus récente à la plus ancienne. Les
   * flèches vont d'une année à l'autre ; « › » depuis l'année la plus récente
   * revient à toutes.
   */
  function rendreAnnees() {
    const annees = [...new Set(toutes.map((l) => anneeDe(l[registre.cleDate])))].sort((a, b) => b - a).map(String);
    if (!annees.includes(filtres.annee)) filtres.annee = '';
    $('.choix-annee').outerHTML = choixAnnee({ id: `annee-${registre.id}`, etiquette: 'Année' });
    choixAnneeRegistre = brancherChoixAnnee($('.choix-annee'), {
      annees: ['', ...annees],
      choisie: filtres.annee,
      libelle: (a) => (a === '' ? 'Toutes' : a),
      nom: (a) => (a === '' ? 'toutes les années' : a),
      surChoix: (annee) => {
        filtres.annee = annee;
        changerFiltres();
      }
    });
    majFiltresActifs();
  }

  /**
   * Recharge la liste complète depuis le serveur, puis redessine. Après un
   * geste (`anime`), les lignes glissent à leur nouvelle place, et celles qui
   * ont disparu (un ajout annulé) s'en vont d'abord, comme une suppression.
   */
  async function charger({ anime = false } = {}) {
    const avant = toutes.map((l) => l.id);
    toutes = await registre.lister();
    registre.apresChargement?.(toutes);
    if (anime) {
      const restantes = new Set(toutes.map((l) => l.id));
      await animerDepart(avant.filter((id) => !restantes.has(id)));
    }
    rendreAnnees();
    rendre({ anime });
  }

  // ---- Retours sur place --------------------------------------------------------------
  /**
   * Pose un retour sur une ligne (« Ajoutée · Annuler »), qui s'efface au bout
   * de quelques secondes. Une ligne n'en porte qu'un : le dernier geste.
   */
  function poserRetour(id, texte, action = null, { erreur = false, apresAnnulation = 'Annulé', remplace = false } = {}) {
    // `remplace` : il prend la place d'un retour affiché, sans se déplier de nouveau.
    const retour = { texte, action, erreur, apresAnnulation, debut: Date.now(), montre: remplace };
    retours.set(id, retour);
    annoncer(texte);
    // Il se replie à l'échéance ; une annulation en cours le retient un peu.
    const expirer = () => {
      if (retours.get(id) !== retour) return;
      if (retour.enCours) { setTimeout(expirer, 400); return; }
      retours.delete(id);
      replierPuisRetirer(refs.corps.querySelector(`tr[data-id="${id}"] .cadre-retour`));
    };
    setTimeout(expirer, DUREE_RETOUR);
  }

  /**
   * Défait une action depuis son retour. Rien d'autre à faire si elle a déjà
   * été annulée au clavier entre-temps.
   */
  async function annulerDepuisRetour(action, apres) {
    try {
      const fait = await annulerAction(action);
      if (!fait) {
        toast('Cette action n’est plus dans l’historique : elle a déjà été annulée.', 'erreur');
        return;
      }
      await charger({ anime: true });
      apres?.();
    } catch (erreur) {
      toast(erreur.message, 'erreur');
      await charger().catch(() => {});
    }
  }

  function retirerPlace(place) {
    if (!places.includes(place)) return;
    places = places.filter((p) => p !== place);
    const tr = refs.corps.querySelector(`[data-place="${place.cle}"]`);
    if (!tr || mouvementReduit()) { rendre(); return; }
    // La place s'efface, puis les lignes dessous remontent en glissant.
    tr.classList.add('part');
    setTimeout(() => rendre({ anime: true }), 240);
  }

  /** Amène une ligne sous les yeux ; si les filtres la cachent, le retour passe en tête de carte. */
  function montrerLigne(id, texte, action) {
    const tr = refs.corps.querySelector(`tr[data-id="${id}"]`);
    if (tr) {
      tr.scrollIntoView({ block: 'nearest', behavior: mouvementReduit() ? 'auto' : 'smooth' });
      return;
    }
    bandeauRetour(refs.zoneRetours, `${texte}, hors des filtres affichés`,
      action ? () => annulerDepuisRetour(action) : null);
  }

  // ---- Sélection et barre d'actions groupées -------------------------------------------
  const selectionnees = () => toutes.filter((l) => selection.has(l.id));

  function majSelection() {
    refs.toutSelectionner.checked = idsVisibles.length > 0 && idsVisibles.every((id) => selection.has(id));
    refs.toutSelectionner.indeterminate = !refs.toutSelectionner.checked && idsVisibles.some((id) => selection.has(id));
    if (barre.classList.contains('resultat')) return;
    const choisies = selectionnees();
    if (choisies.length === 0) { barre.hidden = true; return; }
    const total = sommeMontants(choisies.map((l) => l.montant));
    // « Tout sélectionner » ne coche que les lignes affichées : la barre le
    // dit quand d'autres restent hors du lot, juste avant « Supprimer ».
    const horsLot = affichees.length - idsVisibles.length;
    barre.hidden = false;
    barre.innerHTML = `<span class="compte">${accorder(choisies.length, `${nom.singulier} sélectionné${e}`, `${nom.pluriel} sélectionné${e}s`)} · ${echapperHtml(formaterMontant(total, devise))}</span>
      ${horsLot > 0 && refs.toutSelectionner.checked ? `<span class="note-selection">${horsLot} autres non affiché${e}s, hors du lot</span>` : ''}
      ${(registre.actionsLot ?? []).map((a) => `<button type="button" class="btn" data-lot="${a.code}">${echapperHtml(a.libelle)}</button>`).join('')}
      <button type="button" class="btn danger" data-lot="supprimer">${icone('corbeille', { taille: 15 })}Supprimer</button>
      <button type="button" class="btn-icone" data-lot="fermer" aria-label="Tout désélectionner" title="Tout désélectionner">${icone('croix', { taille: 17 })}</button>`;
    barre.onclick = async (evenement) => {
      const bouton = evenement.target.closest('[data-lot]');
      if (!bouton) return;
      const lot = bouton.dataset.lot;
      if (lot === 'fermer') {
        selection.clear();
        rendre();
        return;
      }
      if (lot === 'supprimer') {
        await supprimer(choisies);
        return;
      }
      bouton.disabled = true;
      try {
        const resultat = await registre.appliquerLot(lot, choisies);
        choisies.forEach((l) => retours.delete(l.id)); // ces lignes ont un nouveau dernier geste
        selection.clear();
        await charger({ anime: true });
        if (resultat.action) resultatSurBarre(resultat.texte, resultat.action);
        else annoncer(resultat.texte);
      } catch (erreur) {
        bouton.disabled = false;
        toast(erreur.message, 'erreur');
      }
    };
  }

  /** La barre de sélection annonce le résultat du lot, avec « Annuler ». */
  function resultatSurBarre(texte, action) {
    clearTimeout(minuteurLot);
    barre.hidden = false;
    barre.classList.add('resultat');
    barre.innerHTML = `<span class="compte">${icone('cercle-valide', { taille: 16 })}${echapperHtml(texte)}</span>
      <button type="button" class="btn" data-lot="annuler">${icone('annuler', { taille: 15 })}Annuler${minuteur(DUREE_RETOUR)}</button>`;
    annoncer(texte);
    const finir = () => {
      clearTimeout(minuteurLot);
      barre.classList.remove('resultat');
      if (carte.isConnected) majSelection(); else barre.hidden = true;
    };
    barre.onclick = async (evenement) => {
      if (!evenement.target.closest('[data-lot="annuler"]')) return;
      finir();
      await annulerDepuisRetour(action);
    };
    minuteurLot = setTimeout(finir, DUREE_RETOUR);
  }

  // ---- Suppression annulable -----------------------------------------------------------
  /**
   * Supprime des lignes en une seule écriture, en tout ou rien. Les lignes
   * retirées reviennent complètes du serveur, et l'annulation les remet telles
   * quelles (identifiant, date de création et PDF joint compris). La ligne ne
   * s'efface de l'écran qu'une fois la suppression acquise.
   */
  async function supprimer(lignes) {
    const ids = lignes.map((l) => l.id);
    const rangs = new Map(affichees.map((l, i) => [l.id, i]));
    let supprimees;
    try {
      supprimees = await registre.supprimer(ids);
    } catch (erreur) {
      toast(erreur.message, 'erreur');
      return;
    }
    ids.forEach((id) => { selection.delete(id); retours.delete(id); });
    if (supprimees.length > 0) {
      const action = enregistrerAction({
        annuler: () => registre.restaurer(supprimees),
        retablir: () => registre.supprimer(supprimees.map((l) => l.id))
      });
      await animerDepart(ids);
      if (supprimees.length === 1) {
        const [ligne] = supprimees;
        const place = { cle: ligne.id, rang: rangs.get(ligne.id) ?? 0, texte: `${Nom} ${decrire(ligne)} supprimé${e}`, action, debut: Date.now() };
        places.push(place);
        annoncer(place.texte);
        setTimeout(() => retirerPlace(place), DUREE_RETOUR);
      } else {
        resultatSurBarre(`${supprimees.length} ${nom.pluriel} supprimé${e}s`, action);
      }
    }
    await charger({ anime: true });
  }

  /** Les lignes partent vers la droite avant leur retrait réel. */
  function animerDepart(ids) {
    // Une ligne déjà partie (suppression) ne repart pas au rechargement.
    const lignes = ids.map((id) => refs.corps.querySelector(`tr[data-id="${id}"]:not(.depart)`)).filter(Boolean);
    if (lignes.length === 0 || mouvementReduit()) return Promise.resolve();
    lignes.forEach((tr) => tr.classList.add('depart'));
    return new Promise((resoudre) => setTimeout(resoudre, 220));
  }

  // ---- Pièces jointes -------------------------------------------------------------------
  const ligneDe = (reponse) => reponse[nom.cle];

  /** Remet la pièce d'une ligne dans l'état voulu (annuler, rétablir). */
  async function remettrePiece(id, actuelle, voulue) {
    if ((actuelle?.id ?? null) === (voulue?.id ?? null)) return;
    if (voulue) await api.rattacherPiece(registre.id, id, voulue);
    else await api.retirerPiece(registre.id, id);
  }

  /** Joint un PDF à une ligne déjà enregistrée (bouton, menu ou dépôt sur la ligne). */
  async function joindre(ligne, fichier) {
    const probleme = verifierPdf(fichier);
    if (probleme) {
      poserRetour(ligne.id, probleme, null, { erreur: true });
      rendre();
      return;
    }
    const avant = ligne.pieceJointe ?? null;
    try {
      const apres = ligneDe(await api.joindrePiece(registre.id, ligne.id, fichier)).pieceJointe;
      const action = enregistrerAction({
        annuler: () => remettrePiece(ligne.id, apres, avant),
        retablir: () => remettrePiece(ligne.id, avant, apres)
      });
      poserRetour(ligne.id, avant ? 'PDF remplacé' : 'PDF joint', action,
        { apresAnnulation: avant ? 'Ancien PDF remis' : 'PDF retiré' });
    } catch (erreur) {
      poserRetour(ligne.id, `PDF non joint : ${erreur.message}`, null, { erreur: true });
    }
    await charger({ anime: true });
    refs.corps.querySelector(`tr[data-id="${ligne.id}"] .piece-oui`)?.classList.add('pop');
  }

  async function retirerPiece(ligne) {
    try {
      const { piece } = await api.retirerPiece(registre.id, ligne.id);
      const action = enregistrerAction({
        annuler: () => api.rattacherPiece(registre.id, ligne.id, piece),
        retablir: () => api.retirerPiece(registre.id, ligne.id)
      });
      poserRetour(ligne.id, 'PDF retiré', action, { apresAnnulation: 'PDF remis' });
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
    await charger({ anime: true });
  }

  function voirPiece(ligne) {
    const p = ligne.pieceJointe;
    apercuPiece({
      nom: p.nom,
      details: [ligne[registre.cleTiers], formaterMontant(ligne.montant, devise),
        formaterDate(ligne[registre.cleDate], formatDate), p.taille ? poidsLisible(p.taille) : ''].filter(Boolean).join(' · '),
      url: urlPiece(registre.id, ligne.id),
      remplacer: (fichier) => joindre(ligne, fichier),
      retirer: () => retirerPiece(ligne)
    });
  }

  /**
   * Applique à une ligne tout juste enregistrée le PDF choisi dans le
   * panneau : un nouveau fichier est envoyé, une pièce retirée est détachée.
   * L'échec de l'envoi ne défait pas la saisie : il est signalé sur la ligne.
   *
   * @param {object} ligne ligne enregistrée.
   * @param {object|null} avant pièce de la ligne avant la saisie.
   * @param {File|object|null} piece pièce voulue.
   * @returns {Promise<{ ligne: object, erreur: string }>}
   */
  async function appliquerPiece(ligne, avant, piece) {
    try {
      if (piece instanceof File) {
        return { ligne: ligneDe(await api.joindrePiece(registre.id, ligne.id, piece)), erreur: '' };
      }
      if (!piece && avant) {
        return { ligne: ligneDe(await api.retirerPiece(registre.id, ligne.id)), erreur: '' };
      }
    } catch (erreur) {
      return { ligne, erreur: erreur.message };
    }
    return { ligne, erreur: '' };
  }

  // ---- Enregistrement d'une saisie -------------------------------------------------------
  /**
   * Enregistre la saisie du panneau, création ou modification, avec son PDF,
   * et la rend annulable : défaire une création supprime la ligne, la
   * rétablir la remet telle quelle (même identifiant, même PDF).
   *
   * Le bouton se ferme pendant l'écriture : sans cela, un double clic sur un
   * enregistrement lent créait deux fois la même ligne. Les erreurs de
   * validation s'affichent champ par champ, les autres dans le panneau.
   *
   * @param {object|null} enEdition ligne modifiée, ou `null` pour une création.
   * @param {object} champsSaisis valeurs saisies.
   * @param {object} options
   * @param {{ element: HTMLElement, fermer: (sansGarde: boolean) => Promise<boolean> }} options.panneau
   * @param {File|object|null} options.piece PDF voulu pour la ligne.
   * @param {string} [options.texteRetour] retour d'une création (« Ajoutée, nouveau client »).
   * @param {() => Promise<unknown>} [options.apres] rechargement en plus (le carnet de clients).
   * @param {boolean} [options.celebrer] une création se fête : le bouton dit
   *   « Ajoutée », des confettis en partent, puis le panneau se ferme.
   */
  async function enregistrerSaisie(enEdition, champsSaisis, { panneau, piece, texteRetour, apres, celebrer = false }) {
    const formulaire = panneau.element.querySelector('form');
    const bouton = formulaire.querySelector('[type="submit"]');
    const zoneErreur = formulaire.querySelector('[data-erreur-panneau]');
    zoneErreur.innerHTML = '';
    bouton.disabled = true;
    try {
      let ligne;
      let action;
      let texte;
      if (enEdition) {
        const { id } = enEdition;
        const avant = registre.champs(enEdition);
        const pieceAvant = enEdition.pieceJointe ?? null;
        const modifiee = await registre.modifier(id, champsSaisis);
        const { ligne: finale, erreur: erreurPiece } = await appliquerPiece(modifiee, pieceAvant, piece);
        ligne = finale;
        const pieceApres = ligne.pieceJointe ?? null;
        const apresModification = registre.champs(ligne);
        action = enregistrerAction({
          annuler: async () => { await registre.modifier(id, avant); await remettrePiece(id, pieceApres, pieceAvant); },
          retablir: async () => { await registre.modifier(id, apresModification); await remettrePiece(id, pieceAvant, pieceApres); }
        });
        texte = erreurPiece ? `Modifié${e}, mais PDF non joint : ${erreurPiece}` : `Modifié${e}`;
        poserRetour(id, texte, action, { erreur: Boolean(erreurPiece), apresAnnulation: 'Modification annulée' });
      } else {
        const creee = await registre.creer(champsSaisis);
        const resultat = await appliquerPiece(creee, null, piece);
        ligne = resultat.ligne;
        action = enregistrerAction({
          annuler: () => registre.supprimer([ligne.id]),
          retablir: () => registre.restaurer([ligne])
        });
        texte = resultat.erreur
          ? `Ajouté${e}, mais PDF non joint : ${resultat.erreur}`
          : texteRetour ?? `Ajouté${e}`;
        poserRetour(ligne.id, texte, resultat.erreur ? null : action, { erreur: Boolean(resultat.erreur) });
        if (celebrer && !resultat.erreur && !mouvementReduit()) {
          reussite(bouton, `Ajouté${e}`, { duree: 2000 });
          confettis(bouton);
          await new Promise((fin) => { setTimeout(fin, 750); });
        }
      }
      await panneau.fermer(true);
      idNouveau = ligne.id;
      await Promise.all([charger({ anime: true }), apres?.()]);
      montrerLigne(ligne.id, `${Nom} ${texte.charAt(0).toLowerCase()}${texte.slice(1)}`, action);
    } catch (erreur) {
      if (erreur.erreurs) {
        afficherErreursFormulaire(formulaire, erreur.erreurs);
      } else {
        zoneErreur.innerHTML = `${icone('cercle-alerte', { taille: 16 })}<span>${echapperHtml(erreur.message)}</span>`;
      }
    } finally {
      bouton.disabled = false;
    }
  }

  // ---- Événements --------------------------------------------------------------------------
  carte.addEventListener('click', async (evenement) => {
    const cible = evenement.target;
    if (cible.closest('[data-effacer-filtres]')) {
      Object.keys(filtres).forEach((cle) => appliquerFiltre(cle, ''));
      refs.recherche.value = '';
      changerFiltres();
      return;
    }
    const pastille = cible.closest('[data-retirer-filtre]');
    if (pastille) {
      appliquerFiltre(pastille.dataset.retirerFiltre, '');
      changerFiltres();
      // Le focus ne se perd pas avec la pastille : il revient au bouton « Filtres ».
      boutonFiltres.focus({ preventScroll: true });
      return;
    }
    if (cible.closest('[data-vider-panneau]')) {
      clesPanneau.forEach((cle) => appliquerFiltre(cle, ''));
      changerFiltres();
      fermerPanneau();
      boutonFiltres.focus({ preventScroll: true });
      return;
    }
    if (cible.closest('[data-voir-sans-piece]')) {
      appliquerFiltre('piece', 'sans');
      changerFiltres();
      return;
    }
    if (cible.closest('[data-nouveau]')) {
      registre.ouvrirFormulaire(null);
      return;
    }
    const entete = cible.closest('th[data-tri]');
    if (entete) {
      const colonne = entete.dataset.tri;
      if (tri.colonne === colonne) {
        tri.sens = tri.sens === 'asc' ? 'desc' : 'asc';
      } else {
        tri.colonne = colonne;
        // Dates et montants se lisent d'abord du plus récent, du plus gros.
        tri.sens = colonne === 'date' || colonne === 'montant' ? 'desc' : 'asc';
      }
      places = [];
      rendre({ anime: true });
    }
  });

  refs.corps.addEventListener('click', async (evenement) => {
    const cible = evenement.target;
    const annuler = cible.closest('[data-annuler-retour]');
    if (annuler) {
      const id = annuler.dataset.annulerRetour;
      const retour = retours.get(id);
      if (!retour?.action || retour.enCours) return;
      // Le retour reste affiché pendant l'annulation, puis change de texte sur
      // place : la ligne ne se replie pas pour se déplier aussitôt.
      retour.enCours = true;
      await annulerDepuisRetour(retour.action, () => {
        if (toutes.some((l) => l.id === id)) {
          poserRetour(id, retour.apresAnnulation, null, { remplace: true });
          // Animé lui aussi : il reprend les glissements en cours là où ils en sont.
          rendre({ anime: true });
        } else {
          retours.delete(id);
          annoncer(retour.apresAnnulation);
        }
      });
      retour.enCours = false;
      return;
    }
    const restaurer = cible.closest('[data-restaurer-place]');
    if (restaurer) {
      const place = places.find((p) => p.cle === restaurer.dataset.restaurerPlace);
      places = places.filter((p) => p !== place);
      if (place) {
        await annulerDepuisRetour(place.action, () => {
          idNouveau = place.cle;
          poserRetour(place.cle, `Restauré${e}`);
          rendre({ anime: true });
        });
      }
      return;
    }
    const bouton = cible.closest('[data-action]');
    if (bouton?.dataset.action === 'afficher-plus') {
      montrerTout = true;
      rendre();
      return;
    }
    const tr = cible.closest('tr[data-id]');
    const ligne = tr && toutes.find((l) => l.id === tr.dataset.id);
    if (!ligne) return;
    if (!bouton) {
      // Un clic sur la ligne l'ouvre ; le reste passe par le menu « … ».
      if (!cible.closest('button, input, a, label')) registre.ouvrirFormulaire(ligne);
      return;
    }
    switch (bouton.dataset.action) {
      case 'menu':
        menuContextuel(bouton, [
          { libelle: 'Modifier', icone: 'crayon', action: () => registre.ouvrirFormulaire(ligne) },
          { libelle: registre.titreDupliquer, icone: 'copier', action: () => registre.ouvrirFormulaire(null, ligne) },
          ligne.pieceJointe
            ? { libelle: `Voir ${registre.quoiPiece} (PDF)`, icone: 'oeil', action: () => voirPiece(ligne) }
            : {
              libelle: `Joindre ${registre.quoiPiece} (PDF)`,
              icone: 'fichier-depot',
              action: async () => { const f = await choisirPdf(); if (f) joindre(ligne, f); }
            },
          'separateur',
          { libelle: 'Supprimer', icone: 'corbeille', danger: true, action: () => supprimer([ligne]) }
        ]);
        break;
      case 'voir-piece':
        voirPiece(ligne);
        break;
      case 'joindre': {
        const fichier = await choisirPdf();
        if (fichier) joindre(ligne, fichier);
        break;
      }
      default:
    }
  });

  refs.corps.addEventListener('change', (evenement) => {
    const caseLigne = evenement.target.closest('[data-cocher]');
    if (!caseLigne) return;
    if (caseLigne.checked) selection.add(caseLigne.dataset.cocher);
    else selection.delete(caseLigne.dataset.cocher);
    caseLigne.closest('tr').classList.toggle('choisie', caseLigne.checked);
    majSelection();
  });
  refs.toutSelectionner.addEventListener('change', () => {
    const cocher = refs.toutSelectionner.checked;
    idsVisibles.forEach((id) => (cocher ? selection.add(id) : selection.delete(id)));
    rendre();
  });

  // Un PDF déposé sur une ligne s'y attache.
  refs.corps.addEventListener('dragover', (evenement) => {
    const tr = evenement.target.closest('tr[data-id]');
    if (!tr || !glisseDesFichiers(evenement)) return;
    evenement.preventDefault();
    refs.corps.querySelectorAll('.cible-depot').forEach((x) => { if (x !== tr) x.classList.remove('cible-depot'); });
    tr.classList.add('cible-depot');
  });
  refs.corps.addEventListener('dragleave', (evenement) => {
    const tr = evenement.target.closest('tr[data-id]');
    if (tr && !tr.contains(evenement.relatedTarget)) tr.classList.remove('cible-depot');
  });
  refs.corps.addEventListener('drop', (evenement) => {
    const tr = evenement.target.closest('tr[data-id]');
    if (!tr) return;
    evenement.preventDefault();
    tr.classList.remove('cible-depot');
    const ligne = toutes.find((l) => l.id === tr.dataset.id);
    const fichier = evenement.dataTransfer.files?.[0];
    if (ligne && fichier) joindre(ligne, fichier);
  });

  return {
    charger,
    enregistrerSaisie,
    /** Liste complète, telle que chargée. */
    toutes: () => toutes,
    /** Emplacement des avis propres au registre (numérotation des factures). */
    zoneAvis: refs.zoneAvis
  };
}
