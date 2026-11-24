/**
 * Vue « Achats » : le registre des achats, obligatoire dès que l'activité
 * comporte de la vente de marchandises.
 *
 * Cinq colonnes légales, dans l'ordre chronologique des règlements : date du
 * règlement, fournisseur, référence de la facture ou du justificatif, mode de
 * paiement et montant de l'achat. Le justificatif lui-même peut être joint en
 * PDF.
 *
 * Le tableau (filtres, tri, sélection, pièces jointes, suppression annulable)
 * est celui de `registre.js`, partagé avec les recettes ; cette vue n'apporte
 * que ses colonnes et son panneau, avec l'autocomplétion des fournisseurs.
 */

import { api, urlPiece } from '../api.js';
import { etat } from '../etat.js';
import {
  echapperHtml, formaterChampMontant, installerChampMontant, champMontant,
  optionsCodes, selecteur, accorder, initiales, finDuFondu
} from '../ui.js';
import { annoncer } from '../retours.js';
import { icone } from '../icones.js';
import { etatFiltres } from '../preferences-vues.js';
import { installerRegistre, cadrePanneau, suivreModeDuTiers, saisieEnSerie, bandeSerie, enregistrerHorsRegistre } from '../registre.js';
import { ouvrirPanneau } from '../panneau.js';
import { autocompletion, surligner } from '../autocompletion.js';
import { zoneDepot } from '../pieces.js';
import { champDate, brancherChampDate } from '../calendrier.js';
import { formaterMontant, enCentimes, analyserMontant } from '/partage/montants.js';
import { formaterDate, aujourdHuiIso } from '/partage/dates.js';
import { modesDansLOrdre, libelleMode } from '/partage/constantes.js';
import { normaliserTexte } from '/partage/texte.js';
import { filtrerAchats } from '/partage/filtres.js';

/** Les champs d'un achat (pour l'historique Annuler / Rétablir). */
const champsAchat = (a) => ({
  dateReglement: a.dateReglement,
  fournisseur: a.fournisseur,
  referenceFacture: a.referenceFacture,
  montant: a.montant,
  modeReglement: a.modeReglement
});

/** Clés de tri par colonne du tableau. */
const CLES_TRI = {
  date: (a) => a.dateReglement,
  fournisseur: (a) => normaliserTexte(a.fournisseur),
  reference: (a) => normaliserTexte(a.referenceFacture),
  mode: (a, modes) => normaliserTexte(libelleMode(a.modeReglement, modes)),
  montant: (a) => enCentimes(a.montant)
};

export async function vueAchats(conteneur, params) {
  const { devise, formatDate, modesPersonnalises } = etat.parametres;
  // Le panneau de saisie et ses aides, branchés sur le registre de la page.
  const saisie = preparerSaisieAchat({ enregistrerSaisie: (...args) => registre.enregistrerSaisie(...args) });
  const { ouvrirFormulaire } = saisie;

  conteneur.innerHTML = `
    <div class="page">
      <header class="entete-page">
        <div>
          <h1>Achats</h1>
          <p class="sous-titre">Le registre chronologique de vos achats, exigible si vous vendez des marchandises.</p>
        </div>
        <div class="actions">
          <a class="btn btn-fantome" id="lien-exporter" href="#/exports?registre=achats">${icone('telecharger', { taille: 16 })}Exporter</a>
          <button type="button" class="btn btn-principal" id="nouvel-achat" aria-haspopup="dialog" data-touche="a" aria-keyshortcuts="A">${icone('plus', { taille: 16 })}Nouvel achat<kbd aria-hidden="true">A</kbd></button>
        </div>
      </header>
      <section class="carte" id="registre" aria-label="Registre des achats"></section>
    </div>`;

  const registre = installerRegistre(conteneur.querySelector('#registre'), {
    id: 'achats',
    nom: { singulier: 'achat', pluriel: 'achats', feminin: false, nouveau: 'Nouvel achat', cle: 'achat' },
    etat: etatFiltres('achats'),
    cleDate: 'dateReglement',
    cleTiers: 'fournisseur',
    colonneRetour: 'fournisseur',
    quoiPiece: 'le justificatif',
    placeholder: 'Fournisseur, référence, montant…',
    titreDupliquer: 'Dupliquer (achat récurrent)',
    lienExporter: conteneur.querySelector('#lien-exporter'),
    filtrer: filtrerAchats,
    clesTri: CLES_TRI,
    colonnes: [
      { cle: 'date', titre: 'Réglé le', cellule: (a) => `<td class="date">${echapperHtml(formaterDate(a.dateReglement, formatDate))}</td>` },
      { cle: 'fournisseur', titre: 'Fournisseur', cellule: (a) => `<td class="client"><span class="nom-tiers">${echapperHtml(a.fournisseur)}</span></td>` },
      { cle: 'reference', titre: 'Justificatif', avecPiece: true, cellule: (a) => `<td class="col-piece-hote">${a.referenceFacture ? `<span class="ref">${echapperHtml(a.referenceFacture)}</span>` : '<span class="attenue">Sans référence</span>'}</td>` },
      { cle: 'mode', titre: 'Paiement', cellule: (a) => `<td class="mode">${echapperHtml(libelleMode(a.modeReglement, modesPersonnalises))}</td>` },
      { cle: 'montant', titre: 'Montant', classe: 'montant', cellule: (a) => `<td class="montant">${echapperHtml(formaterMontant(a.montant, devise))}</td>` }
    ],
    lister: async () => (await api.listerAchats()).achats,
    creer: async (champs) => (await api.creerAchat(champs)).achat,
    modifier: async (id, champs) => (await api.modifierAchat(id, champs)).achat,
    supprimer: async (ids) => (await api.supprimerAchats(ids)).achats,
    restaurer: (lignes) => api.restaurerAchats(lignes),
    champs: champsAchat,
    ouvrirFormulaire,
    apresChargement: (achats) => saisie.apresChargement(achats)
  });

  conteneur.querySelector('#nouvel-achat').addEventListener('click', () => ouvrirFormulaire());

  await registre.charger();

  // Arrivée depuis « Nouvel achat » du tableau de bord : après le fondu de page.
  if (params?.get('nouveau')) {
    const bouton = conteneur.querySelector('#nouvel-achat');
    finDuFondu().then(() => { if (bouton.isConnected) ouvrirFormulaire(); });
  }
  // Depuis la recherche dans tout le livre, ou ajouté sur une autre page :
  // l'achat, mis en avant dès le premier dessin.
  if (params?.get('voir')) registre.montrer(params.get('voir'));
}

// ---- Panneau de saisie ----------------------------------------------------------------

/** De quoi enregistrer un achat hors du registre (voir `enregistrerHorsRegistre`). */
const REGISTRE_ACHATS = {
  id: 'achats',
  cle: 'achat',
  ajoutee: 'Ajouté',
  creer: async (champs) => (await api.creerAchat(champs)).achat,
  supprimer: (ids) => api.supprimerAchats(ids),
  restaurer: (lignes) => api.restaurerAchats(lignes)
};

/**
 * Le panneau de saisie d'un achat et ses aides (fournisseur, paiement repris,
 * série), branché sur une source : le registre de la page Achats, ou le
 * registre lu à part quand la saisie s'ouvre depuis une autre page.
 *
 * @param {{ enregistrerSaisie: Function }} livre
 */
function preparerSaisieAchat(livre) {
  const { devise, formatDate, modesPersonnalises } = etat.parametres;
  const modes = modesDansLOrdre(modesPersonnalises, etat.parametres.ordreModes);
  let fournisseurs = []; // fournisseurs connus, le plus récent d'abord

  /**
   * Ouvre le panneau : vide (ajout), prérempli pour modification, ou prérempli
   * depuis un `modele` (duplication, datée d'aujourd'hui, sans référence ni PDF).
   */
  function ouvrirFormulaire(achat = null, modele = null) {
    const source = achat ?? modele;
    let piece = achat?.pieceJointe ?? null;

    // Le montant ouvre le panneau, relu en clair dessous (voir la saisie d'une recette).
    const corps = `
      ${champMontant('Montant payé', devise)}
      <div class="champ" data-champ="fournisseur" style="--i:1">
        <label for="f-fournisseur">Fournisseur</label>
        <input class="champ-texte" id="f-fournisseur" name="fournisseur" autocomplete="off"
          placeholder="Nom du fournisseur" aria-describedby="f-fournisseur-aide">
        <p class="aide-champ" id="f-fournisseur-aide"></p>
        <span class="erreur-champ message-erreur"></span>
      </div>
      <div class="deux-champs" style="--i:2">
        <div class="champ" data-champ="dateReglement">
          <label for="f-date">Réglé le</label>
          ${champDate({ id: 'f-date', nom: 'dateReglement', format: formatDate })}
          <span class="erreur-champ message-erreur"></span>
        </div>
        <div class="champ" data-champ="modeReglement">
          <label for="f-mode">Paiement</label>
          ${selecteur({ id: 'f-mode', nom: 'modeReglement', options: optionsCodes(modes) })}
          <span class="erreur-champ message-erreur"></span>
        </div>
      </div>
      <div class="champ" data-champ="referenceFacture" style="--i:3">
        <label for="f-reference">Référence du justificatif <span class="facultatif">(facultatif)</span></label>
        <input class="champ-texte" id="f-reference" name="referenceFacture" autocomplete="off" placeholder="Numéro de la facture ou du ticket">
        <span class="erreur-champ message-erreur"></span>
      </div>
      <div class="champ" style="--i:4">
        <span class="etiquette">Justificatif en PDF <span class="facultatif">(facultatif)</span></span>
        <div class="zone-piece" id="f-piece"></div>
        <p class="aide-champ">Conservez la pièce : elle est exigible pendant 10 ans.</p>
      </div>`;

    let panneau = null;
    const lireEtat = () => {
      const f = panneau?.element.querySelector('form');
      if (!f) return '';
      return JSON.stringify([f.fournisseur.value, f.montant.value, f.dateReglement.value,
        f.modeReglement.value, f.referenceFacture.value, piece?.name ?? piece?.id ?? '']);
    };
    panneau = ouvrirPanneau(cadrePanneau({
      titre: achat ? 'Modifier l’achat' : 'Nouvel achat',
      sousTitre: modele ? 'Copie d’un achat récurrent, datée d’aujourd’hui.' : 'Un achat payé, avec son justificatif.',
      corps,
      libelleBouton: achat ? 'Enregistrer' : 'Ajouter l’achat',
      enchainer: achat ? '' : 'Ajouter et en saisir un autre'
    }), { idTitre: 'titre-panneau', lireEtat });

    const racine = panneau.element;
    const f = racine.querySelector('form');
    const aide = racine.querySelector('#f-fournisseur-aide');

    f.fournisseur.value = source?.fournisseur ?? '';
    f.montant.value = source ? formaterChampMontant(source.montant) : '';
    f.dateReglement.value = achat?.dateReglement ?? aujourdHuiIso();
    f.modeReglement.value = source?.modeReglement ?? 'virement';
    f.referenceFacture.value = achat?.referenceFacture ?? '';
    brancherChampDate(racine.querySelector('.champ-date'), { format: formatDate });
    installerChampMontant(f, { devise, verbe: 'payés' });

    // Le mode de paiement suit le fournisseur choisi (son dernier mode) tant
    // que l'utilisateur ne l'a pas changé lui-même.
    const modePaiement = suivreModeDuTiers(f.modeReglement, {
      modes,
      deja: Boolean(source),
      modeDe: (nom) => fournisseurs.find((x) => normaliserTexte(x.nom) === normaliserTexte(nom))?.dernier.modeReglement
    });

    const dire = (html, type = '') => { aide.className = `aide-champ ${type}`.trim(); aide.innerHTML = html; };
    f.fournisseur.addEventListener('input', (evenement) => { if (evenement.isTrusted) dire(''); });
    f.fournisseur.addEventListener('change', () => modePaiement.proposer(f.fournisseur.value));
    autocompletion(f.fournisseur, {
      source: () => fournisseurs,
      texte: (x) => x.nom,
      groupes: { trouves: 'Vos fournisseurs', extra: 'Ajouter' },
      rendu: (x, saisie) => `<span class="monogramme petit achat" aria-hidden="true">${echapperHtml(initiales(x.nom))}</span>
        <span class="sugg-texte"><strong>${surligner(x.nom, saisie)}</strong>
          <span>${accorder(x.nombre, 'achat')}, le dernier le ${echapperHtml(formaterDate(x.dernier.dateReglement, formatDate))}</span></span>`,
      extra: (saisie, trouves) => (!saisie.trim() || trouves.some((x) => normaliserTexte(x.nom) === normaliserTexte(saisie)) ? null : {
        extra: true,
        rendu: `<span class="tuile petit">${icone('plus', { taille: 15 })}</span><span class="sugg-texte">
          <strong>Nouveau fournisseur « ${echapperHtml(saisie.trim())} »</strong><span>premier achat chez lui</span></span>`,
        action: () => {
          dire(`${icone('plus', { taille: 14 })}<span>Nouveau fournisseur</span>`, 'ok');
          f.montant.focus();
        }
      }),
      surChoix: (x) => {
        dire(`${icone('historique', { taille: 14 })}<span>Dernier achat le ${echapperHtml(formaterDate(x.dernier.dateReglement, formatDate))} : ${echapperHtml(formaterMontant(x.dernier.montant, devise))}</span>`);
        modePaiement.proposer(x.nom);
        f.montant.focus();
      }
    });

    const depot = zoneDepot(racine.querySelector('#f-piece'), piece, (p) => { piece = p; }, {
      quoi: 'le justificatif',
      // Tout le panneau reçoit le PDF déposé.
      surface: racine,
      apercu: () => ({
        url: urlPiece('achats', achat.id),
        details: [achat.fournisseur, formaterMontant(achat.montant, devise), formaterDate(achat.dateReglement, formatDate)].join(', ')
      })
    });

    // Saisie en série : Ctrl+Entrée (ou le lien du pied) ajoute l'achat et
    // laisse le panneau ouvert, prêt pour le suivant, à la même date.
    const enSerieDemandee = saisieEnSerie(f, racine, !achat);
    // La série en cours, comptée au pied du panneau.
    const serie = achat ? null : bandeSerie(racine, { nom: { singulier: 'achat', pluriel: 'achats' }, devise, achat: true });

    /** Remet le panneau à zéro pour l'achat suivant ; la date et le paiement restent. */
    function recommencer() {
      for (const champ of [f.fournisseur, f.montant, f.referenceFacture]) champ.value = '';
      f.montant.dispatchEvent(new Event('input', { bubbles: true }));
      dire('');
      modePaiement.oublier();
      depot.vider();
      panneau.memoriser();
      racine.querySelector('.panneau-corps').scrollTop = 0;
      f.fournisseur.focus();
      annoncer('Achat suivant');
    }

    f.addEventListener('submit', async (evenement) => {
      evenement.preventDefault();
      const enSerie = enSerieDemandee();
      const fournisseur = f.fournisseur.value.trim();
      const montantSaisi = f.montant.value;
      const enregistre = await livre.enregistrerSaisie(achat, {
        dateReglement: f.dateReglement.value,
        fournisseur: f.fournisseur.value,
        referenceFacture: f.referenceFacture.value,
        montant: f.montant.value,
        modeReglement: f.modeReglement.value
      }, { panneau, piece, enchainer: enSerie });
      if (enregistre && enSerie) {
        serie?.ajouter(fournisseur, analyserMontant(montantSaisi));
        recommencer();
      }
    });

    panneau.memoriser();
    if (achat) {
      f.montant.focus();
      f.montant.select();
    }
    annoncer(achat ? 'Modification de l’achat' : 'Nouvel achat');
  }

  return {
    ouvrirFormulaire,
    /** Le registre vient d'être lu : un fournisseur par nom (sans casse ni accents), avec son dernier achat. */
    apresChargement(achats) {
      const parNom = new Map();
      for (const a of [...achats].sort((x, y) => y.dateReglement.localeCompare(x.dateReglement))) {
        const cle = normaliserTexte(a.fournisseur);
        const entree = parNom.get(cle);
        if (entree) entree.nombre += 1;
        else parNom.set(cle, { nom: a.fournisseur, nombre: 1, dernier: a });
      }
      fournisseurs = [...parNom.values()];
    }
  };
}

/**
 * « Nouvel achat » depuis une autre page que les Achats (touche A, bouton du
 * tableau de bord) : le panneau s'ouvre sur place. Une fois l'achat ajouté,
 * on arrive sur le registre des achats, la nouvelle ligne mise en avant.
 */
export async function ouvrirNouvelAchat() {
  let liste = (await api.listerAchats()).achats;
  const saisie = preparerSaisieAchat({
    enregistrerSaisie: (achat, champs, options) => enregistrerHorsRegistre(REGISTRE_ACHATS, champs, options, (ligne) => {
      liste = [...liste, ligne];
      saisie.apresChargement(liste);
    })
  });
  saisie.apresChargement(liste);
  saisie.ouvrirFormulaire();
}
