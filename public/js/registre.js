/**
 * Mécanique commune aux deux registres affichés (recettes, achats) : filtres,
 * tri par colonne, affichage progressif, sélection multiple et barre d'actions
 * groupées, pièces jointes, suppression annulable et enregistrement d'une
 * saisie.
 *
 * Les retours se font là où l'on agit : la ligne ajoutée ou modifiée porte
 * « Ajoutée, Annuler », la ligne supprimée laisse sa place « Supprimée,
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
  echapperHtml, toast, confirmer, differer, selecteur, marquerFiltre, lienExport, accorder,
  poidsLisible, optionsCodes, OPTIONS_MOIS, afficherErreursFormulaire,
  mouvementReduit, choixAnnee, brancherChoixAnnee, preparerFlip, surlignerRecherche,
  deplierHauteur, replierPuisRetirer, menuContextuel, ecouterPourLaPage,
  largeursTextes, chiffreLePlusLarge, lirePreference, ecrirePreference, initiales, teinteDe
} from './ui.js';
import { annoncer, bandeauRetour, reussite, confettis, minuteur, brancherSegmentes, DUREE_RETOUR } from './retours.js';
import { icone } from './icones.js';
import { eclairer } from './autocompletion.js';
import { enregistrerAction, annulerAction, estAnnulable } from './historique.js';
import { apercuPiece, choisirPdf, verifierPdf, glisseDesFichiers } from './pieces.js';
import { formaterMontant, formaterMontantEntier, sommeMontants } from '/partage/montants.js';
import { formaterDate, anneeDe, nomMois } from '/partage/dates.js';
import { modesDansLOrdre } from '/partage/constantes.js';
import { majusculeInitiale, normaliserTexte } from '/partage/texte.js';

/** Au-delà, l'affichage est progressif (« Afficher les … restantes »). */
const LIMITE_AFFICHAGE = 200;

/** Densité des lignes, commune aux deux registres : « aeree » (par défaut) ou « serree ». */
const CLE_DENSITE = 'ldr-densite-registres';

/** Navigation au clavier dans le registre : la ligne d'avant, celle d'après. */
const PAS_CLAVIER = { ArrowDown: 1, ArrowUp: -1, j: 1, J: 1, k: -1, K: -1 };

let apercuTiersPartage = null;

/**
 * La bulle d'aperçu d'un tiers, une seule pour toute l'application : elle
 * se ferme au défilement, à Échap, ou quand on la quitte. `survol(cible,
 * ouvrir)` l'ouvre après un instant (aussitôt si une autre vient de se fermer).
 */
function apercuTiers() {
  if (apercuTiersPartage) return apercuTiersPartage;
  const bulle = document.createElement('div');
  bulle.className = 'apercu-tiers';
  bulle.setAttribute('role', 'tooltip');
  bulle.hidden = true;
  document.body.append(bulle);
  let minuterie = null;
  let fermee = 0;
  let cible = null;
  const fermer = () => {
    clearTimeout(minuterie);
    if (!bulle.hidden) fermee = Date.now();
    bulle.hidden = true;
    cible = null;
  };
  const survol = (element, ouvrir) => {
    if (cible === element) return;
    clearTimeout(minuterie);
    cible = element;
    // Un aperçu déjà ouvert (ou tout juste fermé) : le suivant vient aussitôt.
    const chaud = !bulle.hidden || Date.now() - fermee < 600;
    minuterie = setTimeout(() => { if (cible === element && element.isConnected) ouvrir(element); }, chaud ? 0 : 450);
  };
  /**
   * Le pointeur quitte `element` : l'aperçu se ferme un instant après, sauf
   * s'il est passé sur la bulle, ou déjà sur un autre nom (dont l'ouverture
   * ne doit pas être annulée).
   */
  const quitter = (element) => {
    setTimeout(() => { if (cible === element && !bulle.matches(':hover')) fermer(); }, 80);
  };
  bulle.addEventListener('pointerleave', fermer);
  window.addEventListener('scroll', () => { if (!bulle.hidden) fermer(); }, { capture: true, passive: true });
  window.addEventListener('hashchange', fermer);
  document.addEventListener('keydown', (evenement) => { if (evenement.key === 'Escape') fermer(); });
  apercuTiersPartage = { bulle, fermer, survol, quitter };
  return apercuTiersPartage;
}

/** Durée du défilement du total, d'une valeur à l'autre (ms). */
const DUREE_DEFILEMENT = 520;

/**
 * Cadre du panneau de saisie d'une ligne : en-tête, corps (les champs de la
 * vue) et pied. Les champs arrivent l'un après l'autre (`--i`).
 *
 * @param {object} options
 * @param {string} options.titre
 * @param {string} options.sousTitre
 * @param {string} options.corps balisage des champs.
 * @param {string} options.libelleBouton « Ajouter la recette », « Enregistrer »…
 * @param {string} [options.enchainer] pour une création : « Ajouter et en
 *   saisir une autre » (Ctrl+Entrée), qui garde le panneau ouvert.
 */
export function cadrePanneau({ titre, sousTitre, corps, libelleBouton, enchainer = '' }) {
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
        ${enchainer
          ? `<button type="button" class="aide lien-enchainer" data-enchainer aria-keyshortcuts="Control+Enter">${echapperHtml(enchainer)}<span class="touches"><kbd>Ctrl</kbd><kbd>Entrée</kbd></span></button>`
          : '<span class="aide"><kbd>Échap</kbd> pour fermer</span>'}
        <div class="actions">
          <button type="button" class="btn btn-fantome" data-fermer>Annuler</button>
          <button type="submit" class="btn btn-principal">${icone('coche', { taille: 16 })}<span>${echapperHtml(libelleBouton)}</span></button>
        </div>
      </div>
    </form>`;
}

/**
 * Le mode de paiement suit le tiers choisi (client ou fournisseur) : son
 * dernier mode connu est proposé tant que l'utilisateur n'a pas choisi
 * lui-même. `oublier()` reprend la proposition pour une nouvelle saisie.
 *
 * @param {HTMLSelectElement} champ
 * @param {object} options
 * @param {(nom: string) => string|undefined} options.modeDe dernier mode du tiers nommé.
 * @param {{ code: string }[]} options.modes modes proposés dans la liste.
 * @param {boolean} [options.deja] un mode est déjà choisi (modification, duplication).
 */
export function suivreModeDuTiers(champ, { modeDe, modes, deja = false }) {
  let choisi = deja;
  champ.addEventListener('change', () => { choisi = true; });
  return {
    proposer(nom) {
      if (choisi) return;
      const mode = modeDe(nom);
      if (!mode || mode === champ.value || !modes.some((m) => m.code === mode)) return;
      champ.value = mode;
      eclairer(champ);
    },
    oublier() { choisi = false; }
  };
}

/**
 * Saisie en série : Ctrl+Entrée (ou le lien du pied du panneau) envoie le
 * formulaire en gardant le panneau ouvert, prêt pour la suivante. Retourne
 * de quoi lire, une fois par envoi, si celui-ci a été demandé en série.
 *
 * @param {HTMLFormElement} formulaire
 * @param {HTMLElement} racine le panneau, qui porte le lien `[data-enchainer]`.
 * @param {boolean} possible seulement pour une création.
 */
export function saisieEnSerie(formulaire, racine, possible) {
  let demandee = false;
  const envoyer = () => {
    demandee = possible;
    formulaire.requestSubmit();
  };
  formulaire.addEventListener('keydown', (evenement) => {
    if (evenement.key !== 'Enter' || !(evenement.ctrlKey || evenement.metaKey)) return;
    evenement.preventDefault();
    envoyer();
  });
  racine.querySelector('[data-enchainer]')?.addEventListener('click', envoyer);
  return () => {
    const enSerie = demandee;
    demandee = false;
    return enSerie;
  };
}

/**
 * Saisie en série : une bande au pied du panneau compte la série en cours
 * (« 3 recettes dans cette série, 755,00 € ») et aligne les monogrammes des
 * tiers déjà saisis, le détail de chacun au survol.
 *
 * @param {HTMLElement} racine le panneau.
 * @param {{ nom: { singulier: string, pluriel: string }, devise: string, achat?: boolean }} options
 */
export function bandeSerie(racine, { nom, devise, achat = false }) {
  const bande = document.createElement('div');
  bande.className = 'bande-serie';
  bande.hidden = true;
  bande.setAttribute('aria-live', 'polite');
  racine.querySelector('.panneau-pied').before(bande);
  const lignes = [];
  return {
    ajouter(tiers, montant) {
      lignes.push({ tiers, montant: Number(montant) || 0 });
      const total = sommeMontants(lignes.map((l) => l.montant));
      bande.hidden = false;
      bande.innerHTML = `<span class="pile-serie" aria-hidden="true">${lignes.slice(-6).map((l) => `<span class="monogramme${achat ? ' achat' : ''}"
          ${achat ? '' : `data-teinte="${teinteDe(l.tiers)}"`} title="${echapperHtml(`${l.tiers}, ${formaterMontant(l.montant, devise)}`)}">${echapperHtml(initiales(l.tiers))}</span>`).join('')}</span>
        <span class="texte-serie frais"><strong>${accorder(lignes.length, nom.singulier, nom.pluriel)}</strong> dans cette série, <strong>${echapperHtml(formaterMontant(total, devise))}</strong></span>`;
    }
  };
}

/**
 * Le retour d'une ligne ajoutée hors de son registre, que le registre affiche
 * en arrivant (voir `montrer`) : `{ registre, id, texte, action, erreur }`.
 */
let retourEnAttente = null;

/**
 * Enregistre une ligne saisie hors de son registre, dans un panneau ouvert
 * sur une autre page (tableau de bord, fiche d'un client…) : création, PDF,
 * geste annulable (Ctrl+Z), puis le registre avec la nouvelle ligne mise en
 * avant et le même retour qu'un ajout fait sur place (« Ajoutée », et
 * « Annuler » avec son compte à rebours) ; en série (Ctrl+Entrée), le panneau
 * reste ouvert et la page en cours est prévenue (`ligne-ajoutee`). Les
 * erreurs s'affichent dans le panneau.
 *
 * @param {object} registre
 * @param {'recettes'|'achats'} registre.id
 * @param {string} registre.cle « recette », « achat » : clé des réponses du serveur.
 * @param {string} registre.ajoutee « Ajoutée », « Ajouté ».
 * @param {(champs: object) => Promise<object>} registre.creer retourne la ligne créée.
 * @param {(ids: string[]) => Promise<unknown>} registre.supprimer
 * @param {(lignes: object[]) => Promise<unknown>} registre.restaurer
 * @param {object} champs valeurs saisies.
 * @param {object} options celles de `enregistrerSaisie` (panneau, piece, texteRetour, apres, celebrer, enchainer).
 * @param {(ligne: object) => void} [surAjout] la ligne créée, pour les aides de la saisie suivante.
 * @returns {Promise<boolean>} vrai si la ligne est enregistrée.
 */
export async function enregistrerHorsRegistre(registre, champs, { panneau, piece, texteRetour, apres, celebrer = false, enchainer = false }, surAjout) {
  const formulaire = panneau.element.querySelector('form');
  const bouton = formulaire.querySelector('[type="submit"]');
  const zoneErreur = formulaire.querySelector('[data-erreur-panneau]');
  zoneErreur.innerHTML = '';
  bouton.disabled = true;
  try {
    let ligne = await registre.creer(champs);
    let erreurPiece = '';
    if (piece instanceof File) {
      try {
        ligne = (await api.joindrePiece(registre.id, ligne.id, piece))[registre.cle];
      } catch (erreur) {
        erreurPiece = erreur.message;
      }
    }
    const action = enregistrerAction({
      annuler: () => registre.supprimer([ligne.id]),
      retablir: () => registre.restaurer([ligne])
    });
    surAjout?.(ligne);
    // En série, la page reste celle-ci : l'échec du PDF se dit tout de suite.
    // Sinon, il s'affiche sur la ligne, à l'arrivée dans le registre.
    if (erreurPiece && enchainer) {
      toast(`${registre.ajoutee}, mais PDF non joint : ${erreurPiece}`, 'erreur');
    } else if (!erreurPiece && celebrer && !mouvementReduit()) {
      reussite(bouton, registre.ajoutee, { duree: enchainer ? 1400 : 2000 });
      confettis(bouton);
      if (!enchainer) await new Promise((fin) => { setTimeout(fin, 200); });
    }
    await apres?.();
    if (enchainer) {
      // La page en cours (tableau de bord, fiche client…) se met à jour derrière le panneau.
      window.dispatchEvent(new CustomEvent('ligne-ajoutee', { detail: { registre: registre.id } }));
    } else {
      await panneau.fermer(true);
      retourEnAttente = {
        registre: registre.id,
        id: ligne.id,
        texte: erreurPiece ? `${registre.ajoutee}, mais PDF non joint : ${erreurPiece}` : texteRetour ?? registre.ajoutee,
        action: erreurPiece ? null : action,
        erreur: Boolean(erreurPiece)
      };
      window.location.hash = `#/${registre.id}?voir=${encodeURIComponent(ligne.id)}`;
    }
    return true;
  } catch (erreur) {
    if (erreur.erreurs) afficherErreursFormulaire(formulaire, erreur.erreurs);
    else zoneErreur.innerHTML = `${icone('cercle-alerte', { taille: 16 })}<span>${echapperHtml(erreur.message)}</span>`;
    return false;
  } finally {
    bouton.disabled = false;
  }
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
 * @param {{ cle: string, titre?: string, classe?: string, tri?: boolean, avecPiece?: boolean, cellule?: (ligne: object) => string }[]} registre.colonnes
 *   dans l'ordre d'affichage ; `avecPiece` glisse le bouton du PDF joint en
 *   tête de la cellule (facture, référence) ; la dernière colonne est le montant.
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
 * @param {(nom: string) => string|null} [registre.lienTiers] adresse de la
 *   fiche d'un tiers (le client du carnet), proposée dans son aperçu au survol.
 */
export function installerRegistre(carte, registre) {
  const { filtres, tri } = registre.etat;
  const { modesPersonnalises, devise, formatDate } = etat.parametres;
  // Dans l'ordre choisi dans les paramètres.
  const modes = modesDansLOrdre(modesPersonnalises, etat.parametres.ordreModes);
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
  let ligneActive = null;       // ligne parcourue au clavier, qui garde le focus d'un rendu à l'autre
  let focusLigne = false;       // le prochain rendu rend le focus à `ligneActive`
  let totalAffiche = null;      // total montré, point de départ du prochain défilement
  let defilement = null;        // défilement du total en cours : { depuis, vers, debut }
  /** Retour posé sur une ligne : id → { texte, action, apresAnnulation, erreur }. */
  const retours = new Map();
  /** Places laissées par les suppressions d'une ligne : { cle, rang, texte, action }. */
  let places = [];
  let minuteurLot = null;

  carte.innerHTML = gabarit();
  brancherSegmentes(carte);
  const $ = (selecteurCss) => carte.querySelector(selecteurCss);
  const refs = {
    table: $('table.registre'),
    recherche: $('#filtre-q'),
    zoneRetours: $('.zone-retours'),
    zoneAvis: $('.zone-avis'),
    resume: $('.resume-registre'),
    entetes: $('thead'),
    corps: $('tbody'),
    pied: $('tfoot'),
    toutSelectionner: $('#tout-selectionner')
  };

  // Sur une longue année, les titres de colonnes restent en haut de l'écran
  // (sous l'en-tête compact quand il s'affiche), le mois en cours juste
  // dessous, et le total en bas ; collés, titres et total prennent une ombre
  // qui les détache des lignes. Mesuré au défilement, une fois par image.
  let mesureEnAttente = false;
  function mesurerCollage() {
    mesureEnAttente = false;
    if (!carte.isConnected) {
      window.removeEventListener('scroll', demanderMesure, true);
      window.removeEventListener('resize', demanderMesure);
      return;
    }
    // Toutes les lectures, puis les écritures : une seule mise en page.
    const hauteurEntetes = refs.entetes.offsetHeight;
    const hauteurMois = refs.corps.querySelector('.separateur-mois')?.offsetHeight ?? 0;
    const haut = Number.parseFloat(getComputedStyle(refs.entetes).top) || 0;
    const table = refs.table.getBoundingClientRect();
    const entetes = refs.entetes.getBoundingClientRect();
    const pied = refs.pied.getBoundingClientRect();
    carte.style.setProperty('--haut-entetes', `${hauteurEntetes}px`);
    carte.style.setProperty('--haut-mois', `${hauteurMois}px`);
    carte.style.setProperty('--haut-pied', `${pied.height}px`);
    refs.entetes.classList.toggle('colle', table.top < haut - 1 && entetes.bottom < table.bottom - 1);
    refs.pied.classList.toggle('colle', pied.height > 0 && table.bottom > innerHeight + 1 && pied.top > entetes.bottom);
  }
  function demanderMesure() {
    if (mesureEnAttente) return;
    mesureEnAttente = true;
    requestAnimationFrame(mesurerCollage);
  }
  window.addEventListener('scroll', demanderMesure, { capture: true, passive: true });
  window.addEventListener('resize', demanderMesure, { passive: true });

  function gabarit() {
    const filtre = (cle, etiquette, options) => `<div class="champ-filtre">
        <label class="etiquette-champ" for="filtre-${cle}">${etiquette}</label>${selecteur({ id: `filtre-${cle}`, options })}</div>`;
    // Peu de valeurs : des boutons à bascule, un clic au lieu de deux. `texte`
    // est celui de la pastille du filtre actif.
    // Chaque valeur dit combien de lignes elle montrerait (voir `majFacettes`).
    const bascule = (cle, etiquette, valeurs) => `<div class="champ-filtre">
        <span class="etiquette-champ" id="etiquette-filtre-${cle}">${etiquette}</span>
        <div class="segmente compact filtre-segmente" role="group" id="filtre-${cle}" aria-labelledby="etiquette-filtre-${cle}">
          ${valeurs.map(([valeur, libelle, texte = libelle]) => `<button type="button" data-valeur="${valeur}" data-texte="${echapperHtml(texte)}"
            aria-pressed="false">${libelle}<span class="compte-facette"></span></button>`).join('')}
        </div></div>`;
    const densite = lirePreference(CLE_DENSITE) === 'serree' ? 'serree' : 'aeree';
    const entete = (col) => {
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
          <input type="search" id="filtre-q" placeholder="${echapperHtml(registre.placeholder)}" autocomplete="off" aria-keyshortcuts="/">
          <kbd class="touche-champ" aria-hidden="true">/</kbd>
        </label>
        ${choixAnnee({ id: `annee-${registre.id}`, etiquette: 'Année' })}
        <button type="button" class="btn btn-filtres" popovertarget="filtres-${registre.id}" aria-expanded="false">
          ${icone('filtre', { taille: 16 })}Filtres<span class="compte-filtres" hidden></span></button>
        <div class="filtres-actifs"></div>
        <div class="panneau-filtres" id="filtres-${registre.id}" popover role="dialog" aria-label="Filtres">
          ${filtre('mois', 'Mois', `<option value="">Tous les mois</option>${OPTIONS_MOIS}`)}
          ${registre.avecCategorie ? bascule('categorie', 'Catégorie', [
            ['', 'Toutes'], ['prestations', 'Prestations'], ['ventes', 'Ventes'], ['aucune', 'Aucune', 'Non catégorisées']
          ]) : ''}
          ${filtre('mode', 'Paiement', `<option value="">Tous les paiements</option>${optionsCodes(modes)}`)}
          ${bascule('piece', 'PDF joint', [['', 'Tous'], ['avec', 'Avec', 'Avec PDF joint'], ['sans', 'Sans', 'Sans PDF joint']])}
          <div class="pied-filtres">
            <button type="button" class="lien-bouton" data-vider-panneau hidden>Retirer ces filtres</button>
            <button type="button" class="btn btn-principal" data-voir-resultat></button>
          </div>
        </div>
        <div class="signal-registre"></div>
        <div class="segmente compact densite" role="group" aria-label="Densité des lignes">
          <button type="button" data-densite="aeree" aria-pressed="${densite === 'aeree'}" title="Lignes confortables">${icone('lignes-aerees', { taille: 16 })}<span class="hors-ecran">Lignes confortables</span></button>
          <button type="button" data-densite="serree" aria-pressed="${densite === 'serree'}" title="Lignes compactes">${icone('lignes-serrees', { taille: 16 })}<span class="hors-ecran">Lignes compactes</span></button>
        </div>
      </div>
      <div class="zone-avis"></div>
      <div class="zone-retours"></div>
      <div class="resume-registre" aria-live="polite"></div>
      <table class="tableau registre${densite === 'serree' ? ' serree' : ''}">
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
  // Un filtre est une liste, un champ de recherche, ou un groupe de boutons à bascule.
  const estGroupe = (champ) => champ.classList.contains('segmente');
  const ecrireChamp = (champ, valeur) => {
    if (!estGroupe(champ)) { champ.value = valeur; return; }
    champ.querySelectorAll('[data-valeur]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.valeur === valeur)));
  };
  // Le texte d'une option, sans le compte qu'y ajoutent les facettes.
  const texteChamp = (champ, valeur) => (estGroupe(champ)
    ? champ.querySelector(`[data-valeur="${valeur}"]`)?.dataset.texte
    : champ.selectedOptions?.[0]?.dataset.texte ?? champ.selectedOptions?.[0]?.text) ?? valeur;
  for (const [cle, champ] of Object.entries(champs)) {
    if (!champ) { filtres[cle] = ''; continue; }
    ecrireChamp(champ, filtres[cle]);
    if (champ.tagName === 'SELECT') marquerFiltre(champ);
  }
  /** Filtres rangés derrière le bouton « Filtres » (ni la recherche, ni l'année). */
  const clesPanneau = Object.keys(champs).filter((cle) => cle !== 'q' && champs[cle]);
  let choixAnneeRegistre = null;
  /** L'année sur laquelle le registre s'ouvre (voir `rendreAnnees`). */
  let anneeParDefaut = '';

  /** Le bouton compte les filtres du panneau qui agissent ; chacun s'affiche en pastille. */
  function majFiltresActifs() {
    const actifs = clesPanneau.filter((cle) => filtres[cle]);
    const compte = $('.compte-filtres');
    compte.hidden = actifs.length === 0;
    compte.textContent = actifs.length;
    $('.btn-filtres').classList.toggle('actif', actifs.length > 0);
    $('[data-vider-panneau]').hidden = actifs.length === 0;
    $('.filtres-actifs').innerHTML = actifs.map((cle) => {
      const texte = texteChamp(champs[cle], filtres[cle]);
      return `<button type="button" class="pastille-filtre" data-retirer-filtre="${cle}" aria-label="Retirer le filtre ${echapperHtml(texte)}">
        ${echapperHtml(texte)}${icone('croix', { taille: 13 })}</button>`;
    }).join('');
    // L'année ne se marque comme filtre qu'écartée de celle par défaut.
    $('.choix-annee').classList.toggle('actif', filtres.annee !== '' && filtres.annee !== anneeParDefaut);
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
    const champ = champs[cle];
    if (estGroupe(champ)) {
      champ.addEventListener('click', (evenement) => {
        const bouton = evenement.target.closest('[data-valeur]');
        if (!bouton || bouton.dataset.valeur === filtres[cle]) return;
        filtres[cle] = bouton.dataset.valeur;
        ecrireChamp(champ, filtres[cle]);
        changerFiltres();
      });
      continue;
    }
    champ.addEventListener('change', () => {
      filtres[cle] = champ.value;
      marquerFiltre(champ);
      changerFiltres();
    });
  }
  const appliquerFiltre = (cle, valeur) => {
    filtres[cle] = valeur;
    if (cle === 'annee') { choixAnneeRegistre?.definir(valeur); return; }
    if (!champs[cle]) return;
    ecrireChamp(champs[cle], valeur);
    if (champs[cle].tagName === 'SELECT') marquerFiltre(champs[cle]);
  };
  /**
   * Le registre est-il filtré, c'est-à-dire écarté de sa vue par défaut (une
   * autre année que celle par défaut, ou un autre filtre) ? « Toutes les
   * années » ne restreint rien : ce n'en est pas un.
   */
  const autreFiltre = () => Object.entries(filtres).some(([cle, v]) => cle !== 'annee' && Boolean(v));
  const filtreActif = () => autreFiltre() || (Boolean(filtres.annee) && filtres.annee !== anneeParDefaut);
  /**
   * Les lignes de chaque année, rangées à chaque chargement (voir
   * `rendreAnnees`) ; celles de chaque tiers, par nom normalisé, au premier
   * survol qui suit (voir `brancherApercuTiers`).
   */
  let lignesParAnnee = new Map();
  let lignesParTiers = null;
  /** Les lignes de l'année affichée (toutes, sur « Toutes les années ») : la base des comptes. */
  const lignesDeLAnnee = () => (filtres.annee ? lignesParAnnee.get(filtres.annee) ?? [] : toutes);

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
    majFacettes();
    champs[clesPanneau[0]]?.focus({ preventScroll: true });
  });
  // « Voir 12 recettes » : les filtres agissent déjà ; le bouton referme le panneau.
  $('[data-voir-resultat]').addEventListener('click', () => {
    fermerPanneau();
    boutonFiltres.focus({ preventScroll: true });
  });
  majFiltresActifs();

  /**
   * Facettes : chaque valeur des filtres du panneau dit combien de lignes elle
   * montrerait, les autres filtres restant tels quels, et une valeur qui ne
   * montrerait rien se grise. Le bouton du pied annonce le résultat : on ne
   * tombe plus sur un registre vide.
   */
  function majFacettes() {
    if (!panneauFiltres.matches(':popover-open')) return;
    // Les filtres se cumulent : recherche et année, communes à toutes les
    // facettes, s'appliquent une fois ; chaque valeur se compte sur le reste.
    const base = registre.filtrer(toutes, { q: filtres.q, annee: filtres.annee });
    for (const cle of clesPanneau) {
      const champ = champs[cle];
      const sansCeFiltre = registre.filtrer(base, { ...filtres, q: '', annee: '', [cle]: '' });
      const compter = (valeur) => (valeur ? registre.filtrer(sansCeFiltre, { [cle]: valeur }) : sansCeFiltre).length;
      if (estGroupe(champ)) {
        champ.querySelectorAll('[data-valeur]').forEach((b) => {
          const n = compter(b.dataset.valeur);
          b.querySelector('.compte-facette').textContent = n;
          b.disabled = n === 0 && b.dataset.valeur !== filtres[cle];
        });
        continue;
      }
      for (const option of champ.options) {
        option.dataset.texte ??= option.text;
        const n = compter(option.value);
        option.text = `${option.dataset.texte} (${n})`;
        option.disabled = n === 0 && option.value !== filtres[cle];
      }
    }
    const n = affichees.length;
    $('[data-voir-resultat]').textContent = n === 0 ? 'Aucune ligne ne correspond' : `Voir ${accorder(n, nom.singulier, nom.pluriel)}`;
  }

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

  // Le PDF joint se lit avec la facture (ou la référence) : son bouton se
  // colle devant, dans la même cellule. Un trombone quand un PDF est là, une
  // icône de dépôt (discrète, révélée au survol) pour en joindre un.
  const boutonPiece = (l) => (l.pieceJointe
    ? `<button type="button" class="btn-icone piece-oui" data-action="voir-piece"
        aria-label="Voir ${registre.quoiPiece} (PDF ${echapperHtml(l.pieceJointe.nom)})" title="${echapperHtml(l.pieceJointe.nom)}">${icone('trombone', { taille: 16 })}</button>`
    : `<button type="button" class="btn-icone piece-non" data-action="joindre"
        aria-label="Joindre ${registre.quoiPiece} en PDF" title="Joindre un PDF, ou déposez-le sur la ligne">${icone('fichier-depot', { taille: 16 })}</button>`);

  // Chaque ligne se parcourt au clavier (voir `brancherClavier`) : une seule
  // prend le focus à la tabulation, la dernière visitée.
  const ligneHtml = (l) => `<tr data-id="${l.id}" tabindex="${l.id === ligneActive ? 0 : -1}"
      aria-label="${echapperHtml(`${Nom} ${decrire(l)}, ${formaterDate(l[registre.cleDate], formatDate)}`)}"
      class="${l.id === idNouveau ? 'nouvelle' : ''}${selection.has(l.id) ? ' choisie' : ''}">
      <td class="col-case"><input type="checkbox" class="case" data-cocher="${l.id}" ${selection.has(l.id) ? 'checked' : ''}
        aria-label="Sélectionner ${echapperHtml(`${nom.singulier} ${decrire(l)}`)}"></td>
      ${colonnes.map((col) => {
        let cellule = col.cellule(l);
        // Le bouton du PDF joint se glisse en tête de sa cellule hôte (facture, référence).
        if (col.avecPiece) cellule = cellule.replace(/^(\s*<td[^>]*>)/, `$1${boutonPiece(l)}`);
        if (col.cle === registre.colonneRetour) cellule = cellule.replace(/<\/td>\s*$/, `${pastilleRetour(l)}</td>`);
        return cellule;
      }).join('')}
      <td class="col-actions"><span class="actions-ligne">
        <button type="button" class="btn-icone action-survol" data-action="dupliquer" tabindex="-1"
          title="${echapperHtml(registre.titreDupliquer)} (D)" aria-label="Dupliquer ${echapperHtml(`${nom.singulier} ${decrire(l)}`)}">${icone('copier', { taille: 16 })}</button>
        <button type="button" class="btn-icone bouton-menu" data-action="menu"
        aria-label="Actions sur ${echapperHtml(`${nom.singulier} ${decrire(l)}`)}" aria-haspopup="menu" aria-expanded="false">${icone('points', { taille: 18 })}</button></span></td>
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
    const totalPrecedent = totalAffiche;
    totalAffiche = total;
    const filtre = filtreActif();
    const autres = autreFiltre();
    const base = lignesDeLAnnee();
    // Ce que montrera « … sans PDF » : celles de l'année affichée.
    const sansPiece = base.filter((l) => !l.pieceJointe).length;

    if (registre.lienExporter) registre.lienExporter.href = lienExport(registre.id, filtres);
    majEntetes();

    // Un sous-total filtré doit dire qu'il est partiel : c'est ce chiffre que
    // l'on recopie dans une déclaration.
    refs.resume.innerHTML = toutes.length === 0 ? '' : `
      <span><strong>${accorder(affichees.length, nom.singulier, nom.pluriel)}</strong>${autres ? ` sur ${base.length}` : ''}</span>
      <span><strong data-total>${echapperHtml(formaterMontant(total, devise))}</strong></span>
      ${!autres && sansPiece > 0 ? `<button type="button" class="lien-discret" data-voir-sans-piece>${icone('trombone', { taille: 14 })}${accorder(sansPiece, `${nom.singulier} sans PDF`, `${nom.pluriel} sans PDF`)}</button>` : ''}
      ${filtre ? '<button type="button" class="lien-bouton" data-effacer-filtres>Effacer les filtres</button>' : ''}`;

    if (affichees.length === 0) {
      idsVisibles = [];
      refs.corps.innerHTML = places.map(placeHtml).join('') + (toutes.length === 0 && !filtre
        ? ligneVide(`${icone(registre.id, { taille: 22 })}Aucun${e} ${nom.singulier} pour l’instant.<br>
            <button type="button" class="btn btn-principal" data-nouveau>${icone('plus', { taille: 16 })}${nom.nouveau}</button>`)
        : ligneVide(`${icone('recherche', { taille: 22 })}Aucune ligne ne correspond à ces filtres.<br>
            <button type="button" class="lien-bouton" data-effacer-filtres>Effacer les filtres</button>`));
      refs.pied.innerHTML = '';
      reserverTotal(total);
      suivreTotal(totalPrecedent, total, anime);
      majSelection();
      finirRendu();
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
    refs.pied.innerHTML = `<tr><td></td><td colspan="${colonnes.length - 1}">${autres ? 'Total des lignes filtrées' : filtres.annee ? `Total ${filtres.annee}` : 'Total'}
      <span class="attenue">(${accorder(affichees.length, nom.singulier, nom.pluriel)})</span></td>
      <td class="montant"><span data-total>${echapperHtml(formaterMontant(total, devise))}</span></td><td></td></tr>`;
    reserverTotal(total);
    suivreTotal(totalPrecedent, total, anime);
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
    finirRendu();
  }

  /**
   * Après chaque rendu : une ligne reçoit la tabulation (la dernière parcourue,
   * sinon la première), et le focus clavier retrouve sa ligne redessinée.
   */
  function finirRendu() {
    const lignesVisibles = refs.corps.querySelectorAll('tr[data-id]');
    if (lignesVisibles.length && !refs.corps.querySelector('tr[data-id][tabindex="0"]')) lignesVisibles[0].tabIndex = 0;
    if (focusLigne && ligneActive) {
      refs.corps.querySelector(`tr[data-id="${ligneActive}"]`)?.focus({ preventScroll: true });
    }
    focusLigne = false;
    demanderMesure();
    majFacettes();
  }

  /** Le total montré (résumé et pied du tableau), tels qu'ils sont dans la page. */
  const ecrireTotal = (valeur) => {
    const texte = formaterMontant(valeur, devise);
    carte.querySelectorAll('[data-total]').forEach((c) => { c.textContent = texte; });
  };

  /**
   * Les chiffres de la police n'ont pas tous la même chasse : un total qui
   * défile changerait de largeur à chaque image, et le tableau recalculerait
   * ses colonnes (Facture, Paiement, Catégorie tremblaient). Chaque total
   * réserve donc la largeur de son nombre écrit avec le chiffre le plus large ;
   * elle ne change qu'avec le nombre de chiffres.
   * @param {...number} valeurs les montants que le total va montrer.
   */
  function reserverTotal(...valeurs) {
    const plusLong = valeurs.map((v) => formaterMontant(v, devise)).reduce((a, b) => (b.length > a.length ? b : a));
    const elements = [...carte.querySelectorAll('[data-total]')];
    // Tous les totaux mesurés d'un coup, avant d'écrire leur largeur.
    const largeurs = largeursTextes(elements.map((element) => [element, plusLong.replace(/\d/g, chiffreLePlusLarge(element))]));
    elements.forEach((element, i) => { element.style.minWidth = `${Math.ceil(largeurs[i])}px`; });
  }

  /** Où en est le défilement en cours, à l'instant `maintenant`. */
  const etapeDefilement = (maintenant) => {
    const { depuis, vers, debut } = defilement;
    // L'heure de l'image peut précéder `debut` : jamais en deçà du départ.
    const t = Math.min(1, Math.max(0, (maintenant - debut) / DUREE_DEFILEMENT));
    return { fini: t === 1, valeur: t < 1 ? Math.round((depuis + (vers - depuis) * (1 - (1 - t) ** 3)) * 100) / 100 : vers };
  };

  /**
   * Après un geste ou un filtre, le total (résumé et pied du tableau) passe de
   * l'ancienne valeur à la nouvelle, sur place, comme les montants du tableau
   * de bord. Un rendu qui survient en route (une annulation recharge la liste,
   * puis la redessine) ne l'interrompt pas : le défilement continue sur les
   * éléments redessinés, ou repart de la valeur affichée vers le nouveau total.
   * Le résumé, annoncé aux lecteurs d'écran, ne l'est qu'une fois le total
   * arrivé. Sans effet en mouvement réduit.
   *
   * @param {number|null} depuis total montré avant ce rendu.
   * @param {number} vers total à montrer.
   * @param {boolean} anime le rendu suit un geste ou un filtre.
   */
  function suivreTotal(depuis, vers, anime) {
    if (mouvementReduit()) return;
    if (defilement) {
      const { valeur } = etapeDefilement(performance.now());
      if (defilement.vers !== vers) defilement = { depuis: valeur, vers, debut: performance.now() };
      reserverTotal(valeur, vers);
      ecrireTotal(valeur);
      return;
    }
    if (!anime || depuis === null || depuis === vers) return;
    defilement = { depuis, vers, debut: performance.now() };
    reserverTotal(depuis, vers);
    refs.resume.setAttribute('aria-busy', 'true');
    // L'ancienne valeur, tout de suite : le nouveau total ne s'affiche pas une image avant de défiler.
    ecrireTotal(depuis);
    const avancer = (maintenant) => {
      if (!defilement || !carte.isConnected) return;
      const { fini, valeur } = etapeDefilement(maintenant);
      ecrireTotal(valeur);
      if (!fini) { requestAnimationFrame(avancer); return; }
      defilement = null;
      refs.resume.removeAttribute('aria-busy');
    };
    requestAnimationFrame(avancer);
  }

  /**
   * Sélecteur d'année, reconstruit avec les années présentes dans le
   * registre : « Toutes », puis de la plus récente à la plus ancienne. Les
   * flèches vont d'une année à l'autre ; « › » depuis l'année la plus récente
   * revient à toutes.
   */
  function rendreAnnees() {
    lignesParTiers = null;
    lignesParAnnee = new Map();
    for (const l of toutes) {
      const a = String(anneeDe(l[registre.cleDate]));
      if (!lignesParAnnee.has(a)) lignesParAnnee.set(a, []);
      lignesParAnnee.get(a).push(l);
    }
    const annees = [...lignesParAnnee.keys()].sort((a, b) => b - a);
    const totaux = new Map(annees.map((a) => [a, sommeMontants(lignesParAnnee.get(a).map((l) => l.montant))]));
    const plusGrosse = Math.max(...totaux.values());
    // Par défaut, l'année en cours ; si elle n'a encore aucune ligne (début
    // janvier), la plus récente du registre.
    const courante = String(new Date().getFullYear());
    anneeParDefaut = annees.includes(courante) ? courante : (annees[0] ?? '');
    if (filtres.annee === null) filtres.annee = anneeParDefaut;
    if (!annees.includes(filtres.annee)) filtres.annee = '';
    $('.choix-annee').outerHTML = choixAnnee({ id: `annee-${registre.id}`, etiquette: 'Année' });
    choixAnneeRegistre = brancherChoixAnnee($('.choix-annee'), {
      annees: ['', ...annees],
      choisie: filtres.annee,
      libelle: (a) => (a === '' ? 'Toutes' : a),
      nom: (a) => (a === '' ? 'toutes les années' : a),
      // Chaque année dit son total et son nombre de lignes, une barre compare.
      resume: (a) => {
        const lignes = a === '' ? toutes : lignesParAnnee.get(a);
        const total = a === '' ? sommeMontants(toutes.map((l) => l.montant)) : totaux.get(a);
        return {
          montant: formaterMontantEntier(total, devise),
          sous: accorder(lignes.length, nom.singulier, nom.pluriel),
          part: a === '' ? 1 : (plusGrosse ? total / plusGrosse : 0)
        };
      },
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
   * Pose un retour sur une ligne (« Ajoutée, Annuler »), qui s'efface au bout
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
    barre.innerHTML = `<span class="compte">${accorder(choisies.length, `${nom.singulier} sélectionné${e}`, `${nom.pluriel} sélectionné${e}s`)} (${echapperHtml(formaterMontant(total, devise))})</span>
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

  /** Action dont la barre annonce le résultat (« Annuler »), ou `null`. */
  let actionBarre = null;

  /** La barre quitte le résultat du lot et redevient celle de la sélection. */
  function finirResultat() {
    clearTimeout(minuteurLot);
    actionBarre = null;
    barre.classList.remove('resultat');
    if (carte.isConnected) majSelection(); else barre.hidden = true;
  }

  /** La barre de sélection annonce le résultat du lot, avec « Annuler ». */
  function resultatSurBarre(texte, action) {
    clearTimeout(minuteurLot);
    actionBarre = action;
    barre.hidden = false;
    barre.classList.add('resultat');
    barre.innerHTML = `<span class="compte">${icone('cercle-valide', { taille: 16 })}${echapperHtml(texte)}</span>
      <button type="button" class="btn" data-lot="annuler">${icone('annuler', { taille: 15 })}Annuler${minuteur(DUREE_RETOUR)}</button>`;
    annoncer(texte);
    barre.onclick = async (evenement) => {
      if (!evenement.target.closest('[data-lot="annuler"]')) return;
      finirResultat();
      await annulerDepuisRetour(action);
    };
    minuteurLot = setTimeout(finirResultat, DUREE_RETOUR);
  }

  // ---- Suppression confirmée, puis annulable --------------------------------------------
  /**
   * Demande confirmation avant de supprimer : même annulable juste après, une
   * suppression ne part pas d'un clic ou d'une touche de trop.
   */
  function confirmerSuppression(lignes) {
    const une = lignes.length === 1;
    const avecPdf = lignes.filter((l) => l.pieceJointe).length;
    const pieceFeminin = registre.quoiPiece.startsWith('la ');
    const [l] = lignes;
    return confirmer({
      titre: une ? `Supprimer ${nom.feminin ? 'cette' : 'cet'} ${nom.singulier} ?` : `Supprimer ${accorder(lignes.length, nom.singulier, nom.pluriel)} ?`,
      suites: [
        { perd: une
          ? `${Nom} ${decrire(l)}, du ${formaterDate(l[registre.cleDate], formatDate)}`
          : `${majusculeInitiale(accorder(lignes.length, nom.singulier, nom.pluriel))}, ${formaterMontant(sommeMontants(lignes.map((x) => x.montant)), devise)} au total` },
        ...(avecPdf === 0 ? []
          : une ? [{ perd: `${majusculeInitiale(registre.quoiPiece)} PDF joint${pieceFeminin ? 'e' : ''}` }]
            : [{ perd: accorder(avecPdf, 'PDF joint', 'PDF joints') }])
      ],
      boutonOk: 'Supprimer'
    });
  }

  /**
   * Supprime des lignes en une seule écriture, en tout ou rien, une fois la
   * suppression confirmée. Les lignes retirées reviennent complètes du
   * serveur, et l'annulation les remet telles quelles (identifiant, date de
   * création et PDF joint compris). La ligne ne s'efface de l'écran qu'une
   * fois la suppression acquise.
   */
  async function supprimer(lignes, { apresAccord } = {}) {
    if (!(await confirmerSuppression(lignes))) return;
    apresAccord?.();
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
        formaterDate(ligne[registre.cleDate], formatDate), p.taille ? poidsLisible(p.taille) : ''].filter(Boolean).join(', '),
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
   * @param {boolean} [options.enchainer] une création qui en appelle une
   *   autre : le panneau reste ouvert, la vue le remet à zéro.
   * @returns {Promise<boolean>} vrai si la saisie est enregistrée.
   */
  async function enregistrerSaisie(enEdition, champsSaisis, { panneau, piece, texteRetour, apres, celebrer = false, enchainer = false }) {
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
          reussite(bouton, `Ajouté${e}`, { duree: enchainer ? 1400 : 2000 });
          confettis(bouton);
          // Le panneau s'efface juste après le départ des confettis, qui
          // retombent par-dessus le registre (leur couche survit au panneau).
          // En série, la saisie suivante n'attend pas du tout.
          if (!enchainer) await new Promise((fin) => { setTimeout(fin, 200); });
        }
      }
      if (!(enchainer && !enEdition)) await panneau.fermer(true);
      idNouveau = ligne.id;
      await Promise.all([charger({ anime: true }), apres?.()]);
      montrerLigne(ligne.id, `${Nom} ${texte.charAt(0).toLowerCase()}${texte.slice(1)}`, action);
      return true;
    } catch (erreur) {
      if (erreur.erreurs) {
        afficherErreursFormulaire(formulaire, erreur.erreurs);
      } else {
        zoneErreur.innerHTML = `${icone('cercle-alerte', { taille: 16 })}<span>${echapperHtml(erreur.message)}</span>`;
      }
      return false;
    } finally {
      bouton.disabled = false;
    }
  }

  // ---- Événements --------------------------------------------------------------------------
  carte.addEventListener('click', async (evenement) => {
    const cible = evenement.target;
    if (cible.closest('[data-effacer-filtres]')) {
      // Retour à la vue par défaut : l'année en cours, sans autre filtre.
      Object.keys(filtres).forEach((cle) => appliquerFiltre(cle, cle === 'annee' ? anneeParDefaut : ''));
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
        // Le menu rappelle la ligne visée, et la touche de chaque action (voir
        // la navigation au clavier du registre).
        menuContextuel(bouton, [
          { libelle: 'Modifier', icone: 'crayon', touche: 'Entrée', action: () => registre.ouvrirFormulaire(ligne) },
          { libelle: registre.titreDupliquer, icone: 'copier', touche: 'D', action: () => registre.ouvrirFormulaire(null, ligne) },
          ligne.pieceJointe
            ? { libelle: `Voir ${registre.quoiPiece} (PDF)`, icone: 'oeil', touche: 'Espace', action: () => voirPiece(ligne) }
            : {
              libelle: `Joindre ${registre.quoiPiece} (PDF)`,
              icone: 'fichier-depot',
              action: async () => { const f = await choisirPdf(); if (f) joindre(ligne, f); }
            },
          'separateur',
          { libelle: 'Supprimer', icone: 'corbeille', danger: true, touche: 'Suppr', action: () => supprimer([ligne]) }
        ], { tete: { titre: ligne[registre.cleTiers], detail: [ligne.libelle || ligne.referenceFacture, formaterMontant(ligne.montant, devise)].filter(Boolean).join(', ') } });
        break;
      case 'dupliquer':
        registre.ouvrirFormulaire(null, ligne);
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

  // ---- Au clavier ---------------------------------------------------------------------------
  /**
   * Une ligne du registre a le focus : les flèches (ou J et K) passent d'une
   * ligne à l'autre, Début et Fin vont aux extrêmes, Entrée l'ouvre, Espace
   * montre son PDF (ou en fait joindre un), D la duplique, X la coche, Suppr
   * la supprime (annulable). Les mêmes touches figurent dans son menu « … ».
   */
  refs.corps.addEventListener('keydown', async (evenement) => {
    const tr = evenement.target;
    if (!(tr instanceof HTMLTableRowElement) || !tr.dataset.id || evenement.ctrlKey || evenement.metaKey || evenement.altKey) return;
    const ligne = toutes.find((l) => l.id === tr.dataset.id);
    if (!ligne) return;
    const lignesVisibles = [...refs.corps.querySelectorAll('tr[data-id]')];
    const rang = lignesVisibles.indexOf(tr);
    const aller = (cible) => {
      if (!cible) return;
      evenement.preventDefault();
      // Une seule ligne est atteignable par Tab : elle passe la main à la cible.
      tr.tabIndex = -1;
      cible.tabIndex = 0;
      ligneActive = cible.dataset.id;
      cible.focus();
    };
    const touche = evenement.key;
    if (touche in PAS_CLAVIER) { aller(lignesVisibles[rang + PAS_CLAVIER[touche]]); return; }
    if (touche === 'Home') { aller(lignesVisibles[0]); return; }
    if (touche === 'End') { aller(lignesVisibles.at(-1)); return; }
    const gestes = {
      Enter: () => registre.ouvrirFormulaire(ligne),
      ' ': async () => {
        if (ligne.pieceJointe) { voirPiece(ligne); return; }
        const fichier = await choisirPdf();
        if (fichier) joindre(ligne, fichier);
      },
      d: () => registre.ouvrirFormulaire(null, ligne),
      x: () => {
        const caseLigne = tr.querySelector('[data-cocher]');
        caseLigne.checked = !caseLigne.checked;
        caseLigne.dispatchEvent(new Event('change', { bubbles: true }));
      },
      // Confirmée, la ligne part et le focus passe à la suivante (ou à la précédente).
      Delete: () => supprimer([ligne], {
        apresAccord: () => {
          ligneActive = (lignesVisibles[rang + 1] ?? lignesVisibles[rang - 1])?.dataset.id ?? null;
          focusLigne = true;
        }
      })
    };
    const geste = gestes[touche.length === 1 ? touche.toLowerCase() : touche];
    if (!geste) return;
    evenement.preventDefault();
    ligneActive = ligne.id;
    await geste();
  });
  // Un clic sur une ligne en fait la ligne parcourue : le clavier reprend de là.
  refs.corps.addEventListener('focusin', (evenement) => {
    const tr = evenement.target.closest('tr[data-id]');
    if (!tr) return;
    ligneActive = tr.dataset.id;
    refs.corps.querySelectorAll('tr[data-id][tabindex="0"]').forEach((x) => { if (x !== tr) x.tabIndex = -1; });
    tr.tabIndex = 0;
  });

  // ---- Densité -------------------------------------------------------------------------------
  $('.densite').addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('[data-densite]');
    if (!bouton) return;
    const serree = bouton.dataset.densite === 'serree';
    ecrirePreference(CLE_DENSITE, bouton.dataset.densite);
    $('.densite').querySelectorAll('[data-densite]').forEach((b) => b.setAttribute('aria-pressed', String(b === bouton)));
    refs.table.classList.toggle('serree', serree);
    demanderMesure();
  });

  // ---- Aperçu d'un tiers au survol -----------------------------------------------------------
  brancherApercuTiers();

  /**
   * Le nom d'un client (ou d'un fournisseur) se survole : une petite fiche
   * donne son total, son nombre de lignes, la date de la dernière et ses
   * années côte à côte, avec le lien vers sa fiche. Comme les bulles d'aide,
   * la première attend un instant, les suivantes s'ouvrent aussitôt.
   */
  function brancherApercuTiers() {
    const { bulle, survol, quitter } = apercuTiers();
    const ouvrir = (cellule) => {
      if (!carte.isConnected) return;
      const nomTiers = cellule.textContent.trim();
      if (!lignesParTiers) {
        lignesParTiers = new Map();
        for (const l of toutes) {
          const cle = normaliserTexte(l[registre.cleTiers]);
          if (!lignesParTiers.has(cle)) lignesParTiers.set(cle, []);
          lignesParTiers.get(cle).push(l);
        }
      }
      const siennes = lignesParTiers.get(normaliserTexte(nomTiers)) ?? [];
      if (siennes.length === 0) return;
      const r = cellule.getBoundingClientRect(); // lu avant d'écrire la bulle : une mise en page de moins
      const total = sommeMontants(siennes.map((l) => l.montant));
      const derniere = siennes.reduce((a, b) => (b[registre.cleDate] > a[registre.cleDate] ? b : a));
      const premiere = siennes.reduce((a, b) => (b[registre.cleDate] < a[registre.cleDate] ? b : a));
      const parAnnee = new Map();
      siennes.forEach((l) => {
        const a = anneeDe(l[registre.cleDate]);
        parAnnee.set(a, (parAnnee.get(a) ?? 0) + l.montant);
      });
      const annees = [...parAnnee.entries()].sort((a, b) => b[0] - a[0]).slice(0, 3);
      const max = Math.max(...annees.map(([, v]) => v));
      const lien = registre.lienTiers?.(nomTiers);
      bulle.innerHTML = `
        <div class="apercu-tete"><span class="monogramme${registre.id === 'achats' ? ' achat' : ''}" ${registre.id === 'achats' ? '' : `data-teinte="${teinteDe(nomTiers)}"`} aria-hidden="true">${echapperHtml(initiales(nomTiers))}</span>
          <div><strong>${echapperHtml(nomTiers)}</strong><span>${registre.id === 'achats' ? 'Fournisseur' : 'Client'} depuis ${anneeDe(premiere[registre.cleDate])}</span></div></div>
        <dl class="apercu-details">
          <div><dt>${registre.id === 'achats' ? 'Réglé' : 'Encaissé'}</dt><dd>${echapperHtml(formaterMontantEntier(total, devise))}</dd></div>
          <div><dt>${majusculeInitiale(nom.pluriel)}</dt><dd>${siennes.length}</dd></div>
          <div><dt>${nom.feminin ? 'Dernière' : 'Dernier'}</dt><dd>${echapperHtml(formaterDate(derniere[registre.cleDate], formatDate))}</dd></div>
        </dl>
        ${annees.length > 1 ? `<div class="apercu-annees">${annees.map(([a, v]) => `<div><span>${a}</span><i><b style="width:${(v / max) * 100}%"></b></i><span>${echapperHtml(formaterMontantEntier(v, devise))}</span></div>`).join('')}</div>` : ''}
        ${lien ? `<a class="apercu-lien" href="${lien}">Ouvrir la fiche${icone('fleche-droite', { taille: 14 })}</a>` : ''}`;
      bulle.classList.toggle('achats', registre.id === 'achats');
      bulle.hidden = false;
      const hauteur = bulle.offsetHeight;
      const enDessous = r.bottom + 8 + hauteur < innerHeight - 8;
      bulle.style.left = `${Math.max(8, Math.min(r.left - 8, innerWidth - bulle.offsetWidth - 8))}px`;
      bulle.style.top = `${enDessous ? r.bottom + 6 : r.top - hauteur - 6}px`;
      bulle.classList.remove('visible');
      void bulle.offsetWidth;
      bulle.classList.add('visible');
    };
    // Le nom seul déclenche l'aperçu (pas la cellule entière) ; la bulle elle-même
    // se survole pour atteindre son lien.
    refs.corps.addEventListener('pointerover', (evenement) => {
      const nomCellule = evenement.target.closest('.nom-tiers');
      if (nomCellule) survol(nomCellule, ouvrir);
    });
    refs.corps.addEventListener('pointerout', (evenement) => {
      const nomCellule = evenement.target.closest('.nom-tiers');
      if (!nomCellule || nomCellule.contains(evenement.relatedTarget) || bulle.contains(evenement.relatedTarget)) return;
      quitter(nomCellule);
    });
  }
  refs.toutSelectionner.addEventListener('change', () => {
    const cocher = refs.toutSelectionner.checked;
    idsVisibles.forEach((id) => (cocher ? selection.add(id) : selection.delete(id)));
    rendre();
  });

  // Ctrl+Z / Ctrl+Y : la liste se recharge sur place (lignes et total animés)
  // au lieu que toute la page soit redessinée. Une page quittée se désabonne
  // au premier événement qui suit.
  const surHistorique = (evenement) => {
    if (!carte.isConnected) { window.removeEventListener('historique-applique', surHistorique); return; }
    evenement.preventDefault();
    // Les « Annuler » posés sur place pour une action qui ne s'annule plus
    // (celle que le clavier vient de défaire) disparaissent : sans cela, une
    // ligne restaurée côtoierait encore sa place « Supprimée, Annuler ».
    places = places.filter((p) => estAnnulable(p.action));
    for (const [id, retour] of retours) {
      if (retour.action && !estAnnulable(retour.action)) retours.delete(id);
    }
    if (actionBarre && !estAnnulable(actionBarre)) finirResultat();
    charger({ anime: true }).catch((erreur) => toast(erreur.message, 'erreur'));
  };
  // Un seul registre à la fois : l'écouteur du précédent laisse sa place.
  ecouterPourLaPage('historique-applique', surHistorique);

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

  /**
   * Amène une ligne sous les yeux, mise en avant (arrivée depuis la recherche
   * dans tout le livre, ou après un ajout fait sur une autre page) : les
   * filtres qui la cacheraient sont retirés, et l'année affichée devient la
   * sienne. Ajoutée ailleurs, elle porte le même retour qu'un ajout fait ici.
   */
  function montrer(id) {
    const ligne = toutes.find((l) => l.id === id);
    if (!ligne) return;
    if (retourEnAttente?.registre === registre.id && retourEnAttente.id === id) {
      const { texte, action, erreur } = retourEnAttente;
      poserRetour(id, texte, action, { erreur });
    }
    retourEnAttente = null;
    Object.keys(filtres).forEach((cle) => appliquerFiltre(cle, ''));
    refs.recherche.value = '';
    appliquerFiltre('annee', String(anneeDe(ligne[registre.cleDate])));
    majFiltresActifs();
    montrerTout = true;
    places = [];
    idNouveau = id;
    rendre();
    // À l'image suivante : la page qui arrive est d'abord remise en haut
    // (voir `dessiner` dans app.js), ce qui annulerait un défilement lancé ici.
    requestAnimationFrame(() => refs.corps.querySelector(`tr[data-id="${id}"]`)
      ?.scrollIntoView({ block: 'center', behavior: mouvementReduit() ? 'auto' : 'smooth' }));
  }

  return {
    charger,
    enregistrerSaisie,
    montrer,
    /** Liste complète, telle que chargée. */
    toutes: () => toutes,
    /** Emplacement des avis propres au registre (numérotation des factures). */
    zoneAvis: refs.zoneAvis,
    /** Bout de la barre d'outils, où un avis se signale replié. */
    zoneSignal: $('.signal-registre')
  };
}
