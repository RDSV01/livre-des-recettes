/**
 * Vue « Recettes » : tableau principal du livre, recherche, filtres
 * (année, mois, mode de règlement) et formulaire d'ajout / modification.
 *
 * Choix du client dans le formulaire :
 *  - un vrai menu déroulant liste les clients déjà enregistrés ;
 *  - ou l'option « Nouveau client » où l'on saisit un SIRET (le nom exact est
 *    récupéré automatiquement) ou un nom libre. Un nouveau client absent du
 *    carnet y est ajouté à l'enregistrement de la recette.
 */

import { api } from '../api.js';
import { etat } from '../etat.js';
import {
  echapperHtml, toast, confirmer, differer,
  afficherErreursFormulaire, effacerErreursFormulaire
} from '../ui.js';
import { icone } from '../icones.js';
import { formaterMontant, sommeMontants } from '/partage/montants.js';
import { formaterDate, aujourdHuiIso, NOMS_MOIS } from '/partage/dates.js';
import { MODES_REGLEMENT, libelleMode } from '/partage/constantes.js';
import { normaliserTexte } from '/partage/texte.js';

const OPTION_NOUVEAU = '__nouveau__';

/** Un identifiant d'entreprise : SIREN (9 chiffres) ou SIRET (14 chiffres). */
const estIdentifiant = (valeur) => /^\d{9}$|^\d{14}$/.test(valeur);

export async function vueRecettes(conteneur, params) {
  const { devise, formatDate } = etat.parametres;
  const filtres = { q: '', annee: '', mois: '', mode: '' };
  let recettes = [];
  let clients = [];
  let enEdition = null;      // recette en cours de modification, ou null pour un ajout
  let siretResolu = null;    // { siret, nom } mémorisé après une recherche SIRET réussie

  conteneur.innerHTML = gabarit();

  const refs = {
    recherche: conteneur.querySelector('#filtre-recherche'),
    annee: conteneur.querySelector('#filtre-annee'),
    mois: conteneur.querySelector('#filtre-mois'),
    mode: conteneur.querySelector('#filtre-mode'),
    reinitialiser: conteneur.querySelector('#reinitialiser-filtres'),
    resume: conteneur.querySelector('#resume-filtre'),
    corps: conteneur.querySelector('#corps-recettes'),
    dialogue: conteneur.querySelector('#dialogue-recette'),
    formulaire: conteneur.querySelector('#formulaire-recette'),
    titreDialogue: conteneur.querySelector('#titre-dialogue-recette'),
    clientSelect: conteneur.querySelector('#recette-client-select'),
    blocNouveau: conteneur.querySelector('#bloc-nouveau-client'),
    clientNouveau: conteneur.querySelector('#recette-client-nouveau'),
    clientResolu: conteneur.querySelector('#recette-client-resolu')
  };

  // ---- Filtres ---------------------------------------------------------------
  refs.recherche.addEventListener('input', differer(() => {
    filtres.q = refs.recherche.value.trim();
    charger();
  }));
  for (const nom of ['annee', 'mois', 'mode']) {
    refs[nom].addEventListener('change', () => {
      filtres[nom] = refs[nom].value;
      charger();
    });
  }
  refs.reinitialiser.addEventListener('click', () => {
    Object.assign(filtres, { q: '', annee: '', mois: '', mode: '' });
    refs.recherche.value = '';
    refs.annee.value = '';
    refs.mois.value = '';
    refs.mode.value = '';
    charger();
  });

  // ---- Actions du tableau (délégation d'événements) ---------------------------
  refs.corps.addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('[data-action]');
    if (!bouton) return;
    const recette = recettes.find((r) => r.id === bouton.dataset.id);
    if (!recette) return;

    if (bouton.dataset.action === 'modifier') {
      ouvrirFormulaire(recette);
    } else if (bouton.dataset.action === 'supprimer') {
      const accord = await confirmer({
        titre: 'Supprimer cette recette ?',
        message: `${formaterDate(recette.dateEncaissement, formatDate)}, ${recette.client}, ` +
          `${formaterMontant(recette.montant, devise)}. Cette action est définitive.`
      });
      if (!accord) return;
      try {
        await api.supprimerRecette(recette.id);
        toast('Recette supprimée.');
        await Promise.all([charger(), chargerAnnees()]);
      } catch (erreur) {
        toast(erreur.message, 'erreur');
      }
    }
  });

  // ---- Choix du client --------------------------------------------------------
  refs.clientSelect.addEventListener('change', () => {
    const nouveau = refs.clientSelect.value === OPTION_NOUVEAU;
    refs.blocNouveau.hidden = !nouveau;
    if (nouveau) refs.clientNouveau.focus();
  });

  // Le champ SIRET/nom : dès qu'on saisit un SIREN ou un SIRET complet, on
  // récupère le nom exact de l'entreprise.
  refs.clientNouveau.addEventListener('input', () => {
    siretResolu = null;
    refs.clientResolu.hidden = true;
  });
  refs.clientNouveau.addEventListener('blur', () => {
    const chiffres = refs.clientNouveau.value.replace(/\s/g, '');
    if (estIdentifiant(chiffres)) resoudreIdentifiant(chiffres);
  });

  async function resoudreIdentifiant(identifiant) {
    refs.clientResolu.hidden = false;
    refs.clientResolu.innerHTML = '<span class="attenue">Recherche du nom…</span>';
    try {
      const { entreprise } = await api.rechercherSiret(identifiant);
      siretResolu = { requete: identifiant, siret: entreprise.siret || '', nom: entreprise.nom };
      refs.clientResolu.innerHTML =
        `${icone('cercle-valide', { taille: 18 })}<span class="nom-trouve">${echapperHtml(entreprise.nom)}</span>`;
    } catch (erreur) {
      siretResolu = null;
      refs.clientResolu.innerHTML =
        `${icone('cercle-alerte', { taille: 18 })}<span>${echapperHtml(erreur.message)}</span>`;
    }
  }

  /**
   * Détermine le nom du client à enregistrer, et l'ajoute au carnet s'il est
   * nouveau. Lève `{ champ, message }` si la saisie est incomplète.
   */
  async function resoudreClient() {
    if (refs.clientSelect.value !== OPTION_NOUVEAU) {
      return refs.clientSelect.value; // client existant choisi dans la liste
    }
    const saisie = refs.clientNouveau.value.trim();
    if (!saisie) throw { champ: 'client', message: 'Choisissez un client ou saisissez-en un nouveau.' };

    const chiffres = saisie.replace(/\s/g, '');
    let nom = saisie;
    let siret = '';
    if (estIdentifiant(chiffres)) {
      // Un SIREN ou SIRET a été saisi : on récupère le nom exact (via le cache si possible).
      const resolu = siretResolu?.requete === chiffres
        ? siretResolu
        : (await api.rechercherSiret(chiffres)).entreprise;
      nom = resolu.nom;
      siret = resolu.siret || (chiffres.length === 14 ? chiffres : '');
    }
    await ajouterAuCarnetSiAbsent(nom, siret);
    return nom;
  }

  /** Ajoute le client au carnet s'il n'y figure pas déjà (par nom ou SIRET). */
  async function ajouterAuCarnetSiAbsent(nom, siret) {
    const nomN = normaliserTexte(nom);
    const existe = clients.some((c) => normaliserTexte(c.nom) === nomN || (siret && c.siret === siret));
    if (existe) return;
    try {
      await api.creerClient({ nom, siret });
    } catch (erreur) {
      if (erreur.statut !== 409) throw erreur; // 409 = déjà présent : sans gravité
    }
  }

  // ---- Formulaire -------------------------------------------------------------
  conteneur.querySelector('#nouvelle-recette').addEventListener('click', () => ouvrirFormulaire());
  conteneur.querySelector('#annuler-recette').addEventListener('click', () => refs.dialogue.close());

  refs.formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    effacerErreursFormulaire(refs.formulaire);
    const f = refs.formulaire;
    let client;
    try {
      client = await resoudreClient();
    } catch (erreur) {
      if (erreur.champ) return afficherErreursFormulaire(f, { [erreur.champ]: erreur.message });
      return toast(erreur.message, 'erreur');
    }

    const payload = {
      dateEncaissement: f.dateEncaissement.value,
      client,
      libelle: f.libelle.value,
      numeroFacture: f.numeroFacture.value,
      montant: f.montant.value,
      modeReglement: f.modeReglement.value
    };
    try {
      if (enEdition) {
        await api.modifierRecette(enEdition.id, payload);
        toast('Recette modifiée.');
      } else {
        await api.creerRecette(payload);
        toast('Recette ajoutée au livre.');
      }
      refs.dialogue.close();
      await Promise.all([charger(), chargerAnnees(), chargerClients()]);
    } catch (erreur) {
      if (erreur.erreurs) {
        afficherErreursFormulaire(f, erreur.erreurs);
      } else {
        toast(erreur.message, 'erreur');
      }
    }
  });

  function ouvrirFormulaire(recette = null) {
    enEdition = recette;
    siretResolu = null;
    effacerErreursFormulaire(refs.formulaire);
    refs.titreDialogue.textContent = recette ? 'Modifier la recette' : 'Nouvelle recette';
    const f = refs.formulaire;
    f.dateEncaissement.value = recette?.dateEncaissement ?? aujourdHuiIso();
    f.montant.value = recette?.montant ?? '';
    f.modeReglement.value = recette?.modeReglement ?? 'virement';
    f.numeroFacture.value = recette?.numeroFacture ?? '';
    f.libelle.value = recette?.libelle ?? '';

    // Client : préselectionne l'existant si le nom correspond, sinon « Nouveau ».
    remplirSelectClients();
    refs.clientResolu.hidden = true;
    refs.clientNouveau.value = '';
    const existant = recette && clients.some((c) => normaliserTexte(c.nom) === normaliserTexte(recette.client));
    if (existant) {
      refs.clientSelect.value = recette.client;
      refs.blocNouveau.hidden = true;
    } else {
      refs.clientSelect.value = OPTION_NOUVEAU;
      refs.blocNouveau.hidden = false;
      if (recette) refs.clientNouveau.value = recette.client;
    }

    refs.dialogue.showModal();
    f.dateEncaissement.focus();
  }

  function remplirSelectClients() {
    const options = clients
      .map((c) => `<option value="${echapperHtml(c.nom)}">${echapperHtml(c.nom)}</option>`)
      .join('');
    refs.clientSelect.innerHTML =
      `<option value="${OPTION_NOUVEAU}">Nouveau client (SIRET ou nom)</option>` +
      (options ? `<optgroup label="Mes clients">${options}</optgroup>` : '');
  }

  // ---- Chargement des données ---------------------------------------------------
  async function charger() {
    const reponse = await api.listerRecettes(filtres);
    recettes = reponse.recettes;
    rendreTableau();
  }

  async function chargerAnnees() {
    const { annees } = await api.listerAnnees();
    const valeurActuelle = filtres.annee;
    refs.annee.innerHTML = '<option value="">Toutes</option>' +
      annees.map((a) => `<option value="${a}">${a}</option>`).join('');
    refs.annee.value = annees.includes(Number(valeurActuelle)) ? valeurActuelle : '';
  }

  async function chargerClients() {
    const reponse = await api.listerClients();
    clients = reponse.clients;
  }

  function rendreTableau() {
    const total = sommeMontants(recettes.map((r) => r.montant));
    refs.resume.textContent = recettes.length === 0
      ? 'Aucune recette ne correspond.'
      : `${recettes.length} recette${recettes.length > 1 ? 's' : ''} (${formaterMontant(total, devise)})`;

    if (recettes.length === 0) {
      refs.corps.innerHTML = `
        <tr class="ligne-vide"><td colspan="7">
          Aucune recette à afficher. Ajoutez-en une avec « Nouvelle recette ».
        </td></tr>`;
      return;
    }

    refs.corps.innerHTML = recettes.map((r) => `
      <tr>
        <td>${echapperHtml(formaterDate(r.dateEncaissement, formatDate))}</td>
        <td>${echapperHtml(r.client)}</td>
        <td>${r.libelle ? echapperHtml(r.libelle) : '<span class="attenue">-</span>'}</td>
        <td>${r.numeroFacture ? echapperHtml(r.numeroFacture) : '<span class="attenue">-</span>'}</td>
        <td><span class="badge">${echapperHtml(libelleMode(r.modeReglement))}</span></td>
        <td class="montant">${echapperHtml(formaterMontant(r.montant, devise))}</td>
        <td class="actions">
          <button type="button" class="btn-icone" data-action="modifier" data-id="${r.id}" title="Modifier" aria-label="Modifier">${icone('crayon', { taille: 16 })}</button>
          <button type="button" class="btn-icone danger" data-action="supprimer" data-id="${r.id}" title="Supprimer" aria-label="Supprimer">${icone('corbeille', { taille: 16 })}</button>
        </td>
      </tr>`).join('');
  }

  function gabarit() {
    return `
      <header class="entete-vue">
        <div>
          <h1>Recettes</h1>
          <p>Le registre chronologique de vos encaissements.</p>
        </div>
        <button type="button" class="btn btn-primaire" id="nouvelle-recette">${icone('plus', { taille: 16 })}<span>Nouvelle recette</span></button>
      </header>

      <div class="carte">
        <div class="barre-outils">
          <div class="champ recherche">
            <label for="filtre-recherche">Rechercher</label>
            <input type="search" id="filtre-recherche" placeholder="Client, libellé, facture, montant…">
          </div>
          <div class="champ">
            <label for="filtre-annee">Année</label>
            <select id="filtre-annee"><option value="">Toutes</option></select>
          </div>
          <div class="champ">
            <label for="filtre-mois">Mois</label>
            <select id="filtre-mois">
              <option value="">Tous</option>
              ${NOMS_MOIS.map((nom, i) => `<option value="${i + 1}">${nom}</option>`).join('')}
            </select>
          </div>
          <div class="champ">
            <label for="filtre-mode">Mode de règlement</label>
            <select id="filtre-mode">
              <option value="">Tous</option>
              ${MODES_REGLEMENT.map((m) => `<option value="${m.code}">${m.libelle}</option>`).join('')}
            </select>
          </div>
          <button type="button" class="btn btn-secondaire" id="reinitialiser-filtres">${icone('reinitialiser', { taille: 16 })}<span>Réinitialiser</span></button>
        </div>

        <p class="resume-filtre" id="resume-filtre"></p>

        <div class="conteneur-tableau">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Client</th><th>Libellé</th><th>Facture</th>
                <th>Paiement</th><th class="montant">Montant</th><th></th>
              </tr>
            </thead>
            <tbody id="corps-recettes"></tbody>
          </table>
        </div>
      </div>

      <dialog id="dialogue-recette">
        <form id="formulaire-recette" class="corps-dialogue" novalidate>
          <h2 id="titre-dialogue-recette">Nouvelle recette</h2>
          <div class="grille-formulaire">
            <div class="champ" data-champ="dateEncaissement">
              <label for="recette-date">Date d’encaissement *</label>
              <input type="date" id="recette-date" name="dateEncaissement" required>
              <span class="erreur-champ"></span>
            </div>
            <div class="champ" data-champ="montant">
              <label for="recette-montant">Montant encaissé *</label>
              <input type="number" id="recette-montant" name="montant" min="0.01" step="0.01"
                placeholder="0,00" required>
              <span class="erreur-champ"></span>
            </div>
            <div class="champ pleine-largeur" data-champ="client">
              <label for="recette-client-select">Client *</label>
              <select id="recette-client-select"></select>
              <div id="bloc-nouveau-client" class="bloc-nouveau-client">
                <input type="text" id="recette-client-nouveau" autocomplete="off"
                  placeholder="SIRET (14 chiffres) ou nom du client">
                <div class="resultat-siret" id="recette-client-resolu" hidden></div>
              </div>
              <span class="indication">Renseigner le SIRET met exactement le bon nom du client, pour un registre conforme.</span>
              <span class="erreur-champ"></span>
            </div>
            <div class="champ" data-champ="modeReglement">
              <label for="recette-mode">Mode de règlement *</label>
              <select id="recette-mode" name="modeReglement">
                ${MODES_REGLEMENT.map((m) => `<option value="${m.code}">${m.libelle}</option>`).join('')}
              </select>
              <span class="erreur-champ"></span>
            </div>
            <div class="champ" data-champ="numeroFacture">
              <label for="recette-facture">Numéro de facture</label>
              <input type="text" id="recette-facture" name="numeroFacture" placeholder="FAC-2026-001 (facultatif)">
              <span class="erreur-champ"></span>
            </div>
            <div class="champ pleine-largeur" data-champ="libelle">
              <label for="recette-libelle">Libellé / description</label>
              <input type="text" id="recette-libelle" name="libelle"
                placeholder="Prestation, vente… (recommandé pour le registre)">
              <span class="erreur-champ"></span>
            </div>
          </div>
          <div class="pied-dialogue">
            <button type="button" class="btn btn-secondaire" id="annuler-recette">Annuler</button>
            <button type="submit" class="btn btn-primaire">Enregistrer</button>
          </div>
        </form>
      </dialog>`;
  }

  await Promise.all([chargerAnnees(), chargerClients(), charger()]);

  // Arrivée depuis « Nouvelle recette » du tableau de bord.
  if (params?.get('nouvelle')) ouvrirFormulaire();
}
