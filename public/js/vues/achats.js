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
  echapperHtml, formaterChampMontant, installerChampMontant,
  optionsCodes, selecteur, accorder, initiales, finDuFondu
} from '../ui.js';
import { annoncer } from '../retours.js';
import { icone } from '../icones.js';
import { etatFiltres } from '../preferences-vues.js';
import { installerRegistre, cadrePanneau, suivreModeDuTiers, saisieEnSerie } from '../registre.js';
import { ouvrirPanneau } from '../panneau.js';
import { autocompletion, surligner } from '../autocompletion.js';
import { zoneDepot } from '../pieces.js';
import { champDate, brancherChampDate } from '../calendrier.js';
import { formaterMontant, enCentimes, symboleDevise } from '/partage/montants.js';
import { formaterDate, aujourdHuiIso } from '/partage/dates.js';
import { MODES_REGLEMENT, libelleMode } from '/partage/constantes.js';
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
  const modes = MODES_REGLEMENT.concat(modesPersonnalises);
  let fournisseurs = []; // fournisseurs connus, le plus récent d'abord

  conteneur.innerHTML = `
    <div class="page">
      <header class="entete-page">
        <div>
          <h1>Achats</h1>
          <p class="sous-titre">Le registre chronologique de vos achats, exigible si vous vendez des marchandises.</p>
        </div>
        <div class="actions">
          <a class="btn btn-fantome" id="lien-exporter" href="#/exports?registre=achats">${icone('telecharger', { taille: 16 })}Exporter</a>
          <button type="button" class="btn btn-principal" id="nouvel-achat" aria-haspopup="dialog">${icone('plus', { taille: 16 })}Nouvel achat</button>
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
      { cle: 'fournisseur', titre: 'Fournisseur', cellule: (a) => `<td class="client">${echapperHtml(a.fournisseur)}</td>` },
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
    apresChargement: (achats) => {
      // Un fournisseur par nom (sans casse ni accents), avec son dernier achat.
      const parNom = new Map();
      for (const a of [...achats].sort((x, y) => y.dateReglement.localeCompare(x.dateReglement))) {
        const cle = normaliserTexte(a.fournisseur);
        const entree = parNom.get(cle);
        if (entree) entree.nombre += 1;
        else parNom.set(cle, { nom: a.fournisseur, nombre: 1, dernier: a });
      }
      fournisseurs = [...parNom.values()];
    }
  });

  conteneur.querySelector('#nouvel-achat').addEventListener('click', () => ouvrirFormulaire());

  /**
   * Ouvre le panneau : vide (ajout), prérempli pour modification, ou prérempli
   * depuis un `modele` (duplication, datée d'aujourd'hui, sans référence ni PDF).
   */
  function ouvrirFormulaire(achat = null, modele = null) {
    const source = achat ?? modele;
    let piece = achat?.pieceJointe ?? null;

    const corps = `
      <div class="champ" data-champ="fournisseur" style="--i:0">
        <label for="f-fournisseur">Fournisseur</label>
        <input class="champ-texte" id="f-fournisseur" name="fournisseur" autocomplete="off"
          placeholder="Nom du fournisseur" aria-describedby="f-fournisseur-aide">
        <p class="aide-champ" id="f-fournisseur-aide"></p>
        <span class="erreur-champ message-erreur"></span>
      </div>
      <div class="champ" data-champ="montant" style="--i:1">
        <label for="f-montant">Montant payé</label>
        <div class="champ-montant">
          <input class="champ-texte" id="f-montant" name="montant" inputmode="decimal" autocomplete="off" placeholder="0,00">
          <span class="devise" aria-hidden="true">${echapperHtml(symboleDevise(devise))}</span>
        </div>
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
    installerChampMontant(f);

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
      apercu: () => ({
        url: urlPiece('achats', achat.id),
        details: [achat.fournisseur, formaterMontant(achat.montant, devise), formaterDate(achat.dateReglement, formatDate)].join(' · ')
      })
    });

    // Saisie en série : Ctrl+Entrée (ou le lien du pied) ajoute l'achat et
    // laisse le panneau ouvert, prêt pour le suivant, à la même date.
    const enSerieDemandee = saisieEnSerie(f, racine, !achat);

    /** Remet le panneau à zéro pour l'achat suivant ; la date et le paiement restent. */
    function recommencer() {
      for (const champ of [f.fournisseur, f.montant, f.referenceFacture]) champ.value = '';
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
      const enregistre = await registre.enregistrerSaisie(achat, {
        dateReglement: f.dateReglement.value,
        fournisseur: f.fournisseur.value,
        referenceFacture: f.referenceFacture.value,
        montant: f.montant.value,
        modeReglement: f.modeReglement.value
      }, { panneau, piece, enchainer: enSerie });
      if (enregistre && enSerie) recommencer();
    });

    panneau.memoriser();
    if (achat) {
      f.montant.focus();
      f.montant.select();
    }
    annoncer(achat ? 'Modification de l’achat' : 'Nouvel achat');
  }

  await registre.charger();

  // Arrivée depuis « Nouvel achat » du tableau de bord : après le fondu de page.
  if (params?.get('nouveau')) {
    const bouton = conteneur.querySelector('#nouvel-achat');
    finDuFondu().then(() => { if (bouton.isConnected) ouvrirFormulaire(); });
  }
  // Depuis la recherche dans tout le livre : l'achat, mis en avant.
  if (params?.get('voir')) finDuFondu().then(() => registre.montrer(params.get('voir')));
}
