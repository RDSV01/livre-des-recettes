/**
 * Vue « Clients » : carnet de clients servant à fiabiliser la saisie des
 * recettes. Une fiche ne contient que le nom et, facultativement, le SIRET.
 *
 * Deux façons d'ajouter un client :
 *  - par recherche SIRET (le nom exact est récupéré via l'API publique) ;
 *  - par saisie manuelle du nom.
 */

import { api } from '../api.js';
import {
  echapperHtml, toast, confirmer,
  afficherErreursFormulaire, effacerErreursFormulaire
} from '../ui.js';
import { icone } from '../icones.js';

export async function vueClients(conteneur) {
  let clients = [];
  let enEdition = null;

  conteneur.innerHTML = gabarit();

  const refs = {
    corps: conteneur.querySelector('#corps-clients'),
    resume: conteneur.querySelector('#resume-clients'),
    dialogue: conteneur.querySelector('#dialogue-client'),
    formulaire: conteneur.querySelector('#formulaire-client'),
    titreDialogue: conteneur.querySelector('#titre-dialogue-client'),
    siret: conteneur.querySelector('#recherche-siret'),
    boutonSiret: conteneur.querySelector('#bouton-siret'),
    resultatSiret: conteneur.querySelector('#resultat-siret')
  };

  conteneur.querySelector('#nouveau-client').addEventListener('click', () => ouvrirFormulaire());
  conteneur.querySelector('#annuler-client').addEventListener('click', () => refs.dialogue.close());

  // ---- Recherche SIRET dans le formulaire -------------------------------------
  refs.boutonSiret.addEventListener('click', async () => {
    const siret = refs.siret.value.replace(/\s/g, '');
    if (!siret) return;
    refs.boutonSiret.disabled = true;
    refs.resultatSiret.hidden = false;
    refs.resultatSiret.innerHTML = '<span class="attenue">Recherche en cours…</span>';
    try {
      const { entreprise } = await api.rechercherSiret(siret);
      refs.formulaire.nom.value = entreprise.nom;
      if (entreprise.siret) refs.formulaire.siret.value = entreprise.siret;
      refs.resultatSiret.innerHTML =
        `${icone('cercle-valide', { taille: 18 })}<span class="nom-trouve">${echapperHtml(entreprise.nom)}</span>`;
    } catch (erreur) {
      refs.resultatSiret.innerHTML =
        `${icone('cercle-alerte', { taille: 18 })}<span>${echapperHtml(erreur.message)}</span>`;
    } finally {
      refs.boutonSiret.disabled = false;
    }
  });

  // ---- Actions du tableau -----------------------------------------------------
  refs.corps.addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('[data-action]');
    if (!bouton) return;
    const client = clients.find((c) => c.id === bouton.dataset.id);
    if (!client) return;

    if (bouton.dataset.action === 'modifier') {
      ouvrirFormulaire(client);
    } else if (bouton.dataset.action === 'supprimer') {
      const accord = await confirmer({
        titre: 'Supprimer ce client ?',
        message: `« ${client.nom} » sera retiré du carnet. Les recettes déjà enregistrées ` +
          `ne sont pas modifiées. Cette action est définitive.`
      });
      if (!accord) return;
      try {
        await api.supprimerClient(client.id);
        toast('Client supprimé.');
        await charger();
      } catch (erreur) {
        toast(erreur.message, 'erreur');
      }
    }
  });

  // ---- Enregistrement ---------------------------------------------------------
  refs.formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    const donnees = Object.fromEntries(new FormData(refs.formulaire).entries());
    try {
      if (enEdition) {
        await api.modifierClient(enEdition.id, donnees);
        toast('Client modifié.');
      } else {
        await api.creerClient(donnees);
        toast('Client ajouté au carnet.');
      }
      refs.dialogue.close();
      await charger();
    } catch (erreur) {
      if (erreur.erreurs) {
        afficherErreursFormulaire(refs.formulaire, erreur.erreurs);
      } else {
        toast(erreur.message, 'erreur');
      }
    }
  });

  function ouvrirFormulaire(client = null) {
    enEdition = client;
    effacerErreursFormulaire(refs.formulaire);
    refs.titreDialogue.textContent = client ? 'Modifier le client' : 'Nouveau client';
    refs.resultatSiret.innerHTML = '';
    refs.resultatSiret.hidden = true;
    refs.siret.value = '';
    refs.formulaire.nom.value = client?.nom ?? '';
    refs.formulaire.siret.value = client?.siret ?? '';
    refs.dialogue.showModal();
    refs.siret.focus();
  }

  async function charger() {
    const reponse = await api.listerClients();
    clients = reponse.clients;
    rendreTableau();
  }

  function rendreTableau() {
    refs.resume.textContent = clients.length === 0
      ? 'Aucun client pour l’instant.'
      : `${clients.length} client${clients.length > 1 ? 's' : ''}`;

    if (clients.length === 0) {
      refs.corps.innerHTML = `
        <tr class="ligne-vide"><td colspan="3">
          Votre carnet est vide. Ajoutez un client pour le retrouver ensuite à la saisie d’une recette.
        </td></tr>`;
      return;
    }

    refs.corps.innerHTML = clients.map((c) => `
      <tr>
        <td>${echapperHtml(c.nom)}</td>
        <td>${c.siret ? echapperHtml(c.siret) : '<span class="attenue">-</span>'}</td>
        <td class="actions">
          <button type="button" class="btn-icone" data-action="modifier" data-id="${c.id}" title="Modifier" aria-label="Modifier">${icone('crayon', { taille: 16 })}</button>
          <button type="button" class="btn-icone danger" data-action="supprimer" data-id="${c.id}" title="Supprimer" aria-label="Supprimer">${icone('corbeille', { taille: 16 })}</button>
        </td>
      </tr>`).join('');
  }

  function gabarit() {
    return `
      <header class="entete-vue">
        <div>
          <h1>Clients</h1>
          <p>Votre carnet de clients, pour saisir vos recettes sans faute de frappe.</p>
        </div>
        <button type="button" class="btn btn-primaire" id="nouveau-client">${icone('plus', { taille: 16 })}<span>Nouveau client</span></button>
      </header>

      <div class="carte">
        <p class="resume-filtre" id="resume-clients"></p>
        <div class="conteneur-tableau">
          <table>
            <thead>
              <tr><th>Nom</th><th>SIRET</th><th></th></tr>
            </thead>
            <tbody id="corps-clients"></tbody>
          </table>
        </div>
      </div>

      <dialog id="dialogue-client">
        <form id="formulaire-client" class="corps-dialogue" novalidate>
          <h2 id="titre-dialogue-client">Nouveau client</h2>

          <div class="champ" style="margin-bottom:16px">
            <label for="recherche-siret">Rechercher par SIRET (facultatif)</label>
            <div class="ligne-siret">
              <div class="champ">
                <input type="text" id="recherche-siret" inputmode="numeric"
                  placeholder="14 chiffres" autocomplete="off">
              </div>
              <button type="button" class="btn btn-secondaire" id="bouton-siret">${icone('recherche', { taille: 16 })}<span>Trouver le nom</span></button>
            </div>
            <span class="indication">Le nom exact de l’entreprise est récupéré depuis l’annuaire public des entreprises.</span>
            <div class="resultat-siret" id="resultat-siret" hidden></div>
          </div>

          <div class="champ" data-champ="nom" style="margin-bottom:14px">
            <label for="client-nom">Nom du client *</label>
            <input type="text" id="client-nom" name="nom" placeholder="Nom du client" required>
            <span class="erreur-champ"></span>
          </div>

          <div class="champ" data-champ="siret">
            <label for="client-siret">SIRET</label>
            <input type="text" id="client-siret" name="siret" inputmode="numeric"
              placeholder="14 chiffres (facultatif)">
            <span class="erreur-champ"></span>
          </div>

          <div class="pied-dialogue">
            <button type="button" class="btn btn-secondaire" id="annuler-client">Annuler</button>
            <button type="submit" class="btn btn-primaire">Enregistrer</button>
          </div>
        </form>
      </dialog>`;
  }

  await charger();
}
