/**
 * Vue « Achats » : le registre des achats, obligatoire dès que l'activité
 * comporte de la vente de marchandises.
 *
 * Cinq colonnes légales, dans l'ordre chronologique des règlements : date du
 * règlement, fournisseur, référence de la facture ou du justificatif, mode de
 * paiement et montant de l'achat.
 *
 * Le tableau (filtres, tri, sélection, suppression annulable) est celui de
 * `registre.js`, partagé avec les recettes ; cette vue n'apporte que ses
 * colonnes et son formulaire, avec l'auto-complétion des fournisseurs.
 */

import { api } from '../api.js';
import { etat } from '../etat.js';
import {
  echapperHtml, formaterChampMontant, effacerErreursFormulaire, installerSuggestions,
  installerApercuDate, installerChampMontant, installerGardeFormulaire, ouvrirModale,
  enteteTri, optionsCodes
} from '../ui.js';
import { icone } from '../icones.js';
import { etatFiltres } from '../preferences-vues.js';
import { installerRegistre, barreFiltres, barreSelection, tableauRegistre } from '../registre.js';
import { formaterMontant, enCentimes } from '/partage/montants.js';
import { formaterDate, aujourdHuiIso } from '/partage/dates.js';
import { MODES_REGLEMENT, libelleMode } from '/partage/constantes.js';
import { normaliserTexte } from '/partage/texte.js';
import { filtrerAchats, valeursFrequentes } from '/partage/filtres.js';

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
  const modes = optionsCodes(MODES_REGLEMENT.concat(modesPersonnalises));
  let fournisseurs = []; // fournisseurs existants, pour les suggestions
  let enEdition = null;  // achat en cours de modification, ou null

  conteneur.innerHTML = gabarit();

  const refs = {
    suggestions: conteneur.querySelector('#suggestions-fournisseur'),
    dialogue: conteneur.querySelector('#dialogue-achat'),
    formulaire: conteneur.querySelector('#formulaire-achat'),
    titreDialogue: conteneur.querySelector('#titre-dialogue-achat'),
    enregistrer: conteneur.querySelector('#enregistrer-achat')
  };

  const registre = installerRegistre(conteneur, {
    id: 'achats',
    nom: { singulier: 'achat', feminin: false, ce: 'cet', nouveau: 'Nouvel achat', registre: 'registre' },
    etat: etatFiltres('achats'),
    cleDate: 'dateReglement',
    filtrer: filtrerAchats,
    clesTri: CLES_TRI,
    lister: async () => (await api.listerAchats()).achats,
    creer: async (champs) => (await api.creerAchat(champs)).achat,
    modifier: async (id, champs) => (await api.modifierAchat(id, champs)).achat,
    supprimer: async (ids) => (await api.supprimerAchats(ids)).achats,
    restaurer: (lignes) => api.restaurerAchats(lignes),
    champs: champsAchat,
    formulaire: refs,
    decrire: (a) => `${formaterDate(a.dateReglement, formatDate)}, ${a.fournisseur}, ${formaterMontant(a.montant, devise)}`,
    titreDupliquer: 'Dupliquer (achat récurrent)',
    ouvrirFormulaire,
    apresChargement: (achats) => { fournisseurs = valeursFrequentes(achats, 'fournisseur'); },
    cellules: (a) => `
      <td class="col-date" data-label="Réglé le">${echapperHtml(formaterDate(a.dateReglement, formatDate))}</td>
      <td data-label="Fournisseur">${echapperHtml(a.fournisseur)}</td>
      <td data-label="Référence">${a.referenceFacture ? echapperHtml(a.referenceFacture) : '<span class="attenue">-</span>'}</td>
      <td data-label="Paiement"><span class="badge">${echapperHtml(libelleMode(a.modeReglement, modesPersonnalises))}</span></td>
      <td class="montant" data-label="Montant">${echapperHtml(formaterMontant(a.montant, devise))}</td>`
  });

  // ---- Formulaire -------------------------------------------------------------
  const rafraichirApercuDate = installerApercuDate(refs.formulaire.dateReglement);
  installerChampMontant(refs.formulaire);
  const memoriserEtatInitial = installerGardeFormulaire({
    dialogue: refs.dialogue,
    boutonAnnuler: conteneur.querySelector('#annuler-achat'),
    lireEtat: () => {
      const f = refs.formulaire;
      return JSON.stringify([
        f.dateReglement.value, f.fournisseur.value, f.montant.value,
        f.modeReglement.value, f.referenceFacture.value
      ]);
    }
  });
  const fermerSuggestions = installerSuggestions({
    champ: refs.formulaire.fournisseur,
    liste: refs.suggestions,
    valeurs: () => fournisseurs
  });
  conteneur.querySelector('#nouvel-achat').addEventListener('click', () => ouvrirFormulaire());

  refs.formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    effacerErreursFormulaire(refs.formulaire);
    const f = refs.formulaire;
    registre.enregistrerSaisie(enEdition, {
      dateReglement: f.dateReglement.value,
      fournisseur: f.fournisseur.value,
      referenceFacture: f.referenceFacture.value,
      montant: f.montant.value,
      modeReglement: f.modeReglement.value
    });
  });

  /**
   * Ouvre le formulaire : vide (ajout), prérempli pour modification, ou
   * prérempli depuis un `modele` (duplication, avec la date du jour).
   */
  function ouvrirFormulaire(achat = null, modele = null) {
    enEdition = achat;
    fermerSuggestions();
    effacerErreursFormulaire(refs.formulaire);
    refs.titreDialogue.textContent = achat ? 'Modifier l’achat' : 'Nouvel achat';

    const source = achat ?? modele;
    const f = refs.formulaire;
    f.dateReglement.value = achat?.dateReglement ?? aujourdHuiIso();
    rafraichirApercuDate();
    f.fournisseur.value = source?.fournisseur ?? '';
    f.montant.value = source ? formaterChampMontant(source.montant) : '';
    f.modeReglement.value = source?.modeReglement ?? 'virement';
    f.referenceFacture.value = achat?.referenceFacture ?? '';

    memoriserEtatInitial();
    ouvrirModale(refs.dialogue);
    f.dateReglement.focus();
  }

  function gabarit() {
    return `
      <header class="entete-vue">
        <div class="titre-registre">
          <span class="puce-registre registre-achats">${icone('achats', { taille: 20 })}</span>
          <div>
            <h1>Achats</h1>
            <p>Le registre chronologique de vos achats, exigible si vous vendez des marchandises.</p>
          </div>
        </div>
        <div class="actions-vue">
          <a class="btn btn-tertiaire" id="lien-exporter" href="#/exports?registre=achats">${icone('exports', { taille: 16 })}<span>Exporter</span></a>
          <button type="button" class="btn btn-primaire" id="nouvel-achat">${icone('plus', { taille: 16 })}<span>Nouvel achat</span></button>
        </div>
      </header>

      <div class="carte">
        ${barreFiltres({
          placeholder: 'Fournisseur, référence, montant…',
          libelleMode: 'Mode de paiement',
          optionsModes: modes
        })}
        ${barreSelection()}
        ${tableauRegistre(['13%', '27%', '20%', '14%', '12%'], `
          ${enteteTri('date', 'Réglé le')}
          ${enteteTri('fournisseur', 'Fournisseur')}
          ${enteteTri('reference', 'Référence')}
          ${enteteTri('mode', 'Paiement')}
          ${enteteTri('montant', 'Montant', 'montant')}`)}
      </div>

      <dialog id="dialogue-achat" aria-labelledby="titre-dialogue-achat">
        <form id="formulaire-achat" class="corps-dialogue" novalidate>
          <h2 id="titre-dialogue-achat">Nouvel achat</h2>
          <div class="grille-formulaire">
            <div class="champ" data-champ="dateReglement">
              <label for="achat-date">Date du règlement *</label>
              <input type="date" id="achat-date" name="dateReglement" required>
              <span class="erreur-champ"></span>
            </div>
            <div class="champ" data-champ="montant">
              <label for="achat-montant">Montant de l’achat *</label>
              <input type="text" id="achat-montant" name="montant" inputmode="decimal"
                placeholder="0,00" autocomplete="off" required>
              <span class="erreur-champ"></span>
            </div>
            <div class="champ pleine-largeur" data-champ="fournisseur">
              <label for="achat-fournisseur">Fournisseur *</label>
              <div class="porte-suggestions">
                <input type="text" id="achat-fournisseur" name="fournisseur"
                  autocomplete="off" placeholder="Nom du fournisseur">
                <div class="liste-suggestions" id="suggestions-fournisseur" hidden></div>
              </div>
              <span class="erreur-champ"></span>
            </div>
            <div class="champ" data-champ="modeReglement">
              <label for="achat-mode">Mode de paiement *</label>
              <select id="achat-mode" name="modeReglement">
                ${modes}
              </select>
              <span class="erreur-champ"></span>
            </div>
            <div class="champ" data-champ="referenceFacture">
              <label for="achat-reference">Référence du justificatif</label>
              <input type="text" id="achat-reference" name="referenceFacture"
                placeholder="Numéro de facture ou de ticket (facultatif)">
              <span class="indication">Conservez la pièce : elle est exigible pendant 10 ans.</span>
              <span class="erreur-champ"></span>
            </div>
          </div>
          <div class="pied-dialogue">
            <button type="button" class="btn btn-secondaire" id="annuler-achat">Annuler</button>
            <button type="submit" class="btn btn-primaire" id="enregistrer-achat"><span>Enregistrer</span></button>
          </div>
        </form>
      </dialog>`;
  }

  await registre.charger();

  // Arrivée depuis « Nouvel achat » du tableau de bord.
  if (params?.get('nouveau')) ouvrirFormulaire();
}
