/**
 * Vue « Clients » : le carnet à gauche, classé par chiffre d'affaires, la
 * fiche du client choisi à droite (ses encaissements, ses factures jointes).
 * Une fiche ne contient que le nom et, facultativement, le SIRET : le carnet
 * sert à fiabiliser la saisie des recettes.
 *
 * Deux façons d'ajouter un client : par recherche SIRET (le nom exact vient
 * de l'annuaire public des entreprises), ou par le nom seul.
 */

import { api, urlPiece } from '../api.js';
import { etat } from '../etat.js';
import {
  echapperHtml, toast, accorder, initiales, teinteDe, siretLisible, resultatSiret, poidsLisible,
  afficherErreursFormulaire, effacerErreursFormulaire, montantDetaille, preparerFlip
} from '../ui.js';
import { bandeauRetour, brancherSegmentes } from '../retours.js';
import { icone } from '../icones.js';
import { apercuPiece } from '../pieces.js';
import { formaterMontant, formaterMontantEntier } from '/partage/montants.js';
import { formaterDate } from '/partage/dates.js';
import { normaliserTexte } from '/partage/texte.js';

/** Client affiché, retenu d'une visite à l'autre. */
let choisi = null;

/** Ordre du carnet, retenu d'une visite à l'autre : chiffre d'affaires, nom, ou dernier encaissement. */
let ordre = 'ca';
const ORDRES = [['ca', 'Chiffre d’affaires'], ['nom', 'Nom'], ['recent', 'Récents']];

export async function vueClients(conteneur, params) {
  const { devise, formatDate } = etat.parametres;
  // Arrivée depuis la recherche dans tout le livre : la fiche de ce client.
  if (params?.get('client')) choisi = params.get('client');
  let clients = [];
  let recettes = [];
  let recherche = '';

  conteneur.innerHTML = `
    <div class="page">
      <header class="entete-page">
        <div>
          <h1>Clients</h1>
          <p class="sous-titre" id="resume-clients"></p>
        </div>
        <div class="actions"><button type="button" class="btn btn-principal" id="nouveau-client">${icone('plus', { taille: 16 })}Nouveau client</button></div>
      </header>
      <div class="deux-panneaux">
        <section class="carte" aria-label="Carnet de clients">
          <div class="outils">
            <label class="recherche large">
              <span class="hors-ecran">Rechercher un client</span>${icone('recherche', { taille: 16 })}
              <input type="search" id="c-filtre" placeholder="Nom ou SIRET" autocomplete="off">
            </label>
            <div class="segmente compact" role="group" aria-label="Trier le carnet">
              ${ORDRES.map(([code, libelle]) => `<button type="button" data-ordre="${code}" aria-pressed="${code === ordre}">${libelle}</button>`).join('')}
            </div>
          </div>
          <div id="liste-clients"></div>
        </section>
        <section class="carte fiche-client" id="fiche" aria-labelledby="titre-fiche"></section>
      </div>
    </div>`;

  const page = conteneur.querySelector('.page');
  const zoneListe = page.querySelector('#liste-clients');
  const zoneFiche = page.querySelector('#fiche');

  const recettesDe = (client) => {
    const cle = normaliserTexte(client.nom);
    return recettes.filter((r) => normaliserTexte(r.client) === cle);
  };
  const clientChoisi = () => clients.find((c) => c.id === choisi);

  // ---- Rendu -----------------------------------------------------------------------------
  function rendreResume() {
    const avecSiret = clients.filter((c) => c.siret).length;
    page.querySelector('#resume-clients').innerHTML = clients.length === 0
      ? 'Votre carnet de clients.'
      : `${accorder(clients.length, 'client')}${avecSiret ? `<span class="point">·</span>${avecSiret} avec SIRET` : ''}`;
  }

  /** Dernier encaissement de chaque client (date ISO), pour l'ordre « Récents ». */
  const derniers = () => {
    const parNom = new Map();
    for (const r of recettes) {
      const cle = normaliserTexte(r.client);
      if ((parNom.get(cle) ?? '') < r.dateEncaissement) parNom.set(cle, r.dateEncaissement);
    }
    return parNom;
  };

  /** Le carnet dans l'ordre choisi ; à égalité, par nom. */
  function ordonner(liste) {
    const parNom = (a, b) => a.nom.localeCompare(b.nom, 'fr');
    if (ordre === 'nom') return [...liste].sort(parNom);
    if (ordre === 'recent') {
      const dates = derniers();
      const date = (c) => dates.get(normaliserTexte(c.nom)) ?? '';
      return [...liste].sort((a, b) => date(b).localeCompare(date(a)) || parNom(a, b));
    }
    return [...liste].sort((a, b) => b.totalRecettes - a.totalRecettes || parNom(a, b));
  }

  /**
   * @param {{ anime?: boolean }} [options] `anime` : les clients glissent
   *   jusqu'à leur nouvelle place (tri, recherche).
   */
  function rendreListe({ anime = false } = {}) {
    const jouer = anime ? preparerFlip(zoneListe, '.client-ligne', (b) => b.dataset.client) : () => {};
    const mot = normaliserTexte(recherche);
    const visibles = ordonner(clients.filter((c) => !mot || normaliserTexte(`${c.nom} ${c.siret}`).includes(mot)));
    // Part de chaque client dans le chiffre d'affaires de tout le carnet.
    const totalCarnet = clients.reduce((somme, c) => somme + c.totalRecettes, 0);
    if (clients.length === 0) {
      zoneListe.innerHTML = `<p class="vide">${icone('clients', { taille: 22 })}Votre carnet est vide. Ajoutez un client pour le retrouver ensuite à la saisie d’une recette.</p>`;
      return;
    }
    if (visibles.length === 0) {
      zoneListe.innerHTML = `<p class="vide">${icone('recherche', { taille: 22 })}Aucun client ne correspond.</p>`;
      return;
    }
    zoneListe.innerHTML = `<ul class="liste-clients">${visibles.map((c) => {
      const part = totalCarnet > 0 ? Math.round((c.totalRecettes / totalCarnet) * 1000) / 10 : 0;
      return `<li>
      <button type="button" class="client-ligne" data-client="${c.id}" aria-pressed="${c.id === choisi}">
        <span class="monogramme" data-teinte="${teinteDe(c.nom)}" aria-hidden="true">${echapperHtml(initiales(c.nom))}</span>
        <span><span class="nom">${echapperHtml(c.nom)}</span>${c.siret ? `<span class="details">SIRET ${siretLisible(c.siret)}</span>` : ''}
          ${part > 0 ? `<span class="part-ca" title="${String(part).replace('.', ',')} % du chiffre d’affaires"><i style="width:${part}%"></i></span>
          <span class="hors-ecran">, ${String(part).replace('.', ',')} % du chiffre d’affaires</span>` : ''}</span>
        <span class="ca">${c.nombreRecettes > 0 ? echapperHtml(formaterMontantEntier(c.totalRecettes, devise)) : '<span class="attenue">-</span>'}
          <small>${c.nombreRecettes > 0 ? accorder(c.nombreRecettes, 'encaissement') : 'aucun encaissement'}</small></span>
      </button></li>`;
    }).join('')}</ul>`;
    jouer();
  }

  function rendreFiche() {
    const client = clientChoisi();
    if (!client) {
      zoneFiche.innerHTML = `<div class="vide-carte fiche-vide">
        ${icone('clients', { taille: 28 })}
        <p>${clients.length ? 'Choisissez un client dans la liste pour voir ses encaissements.' : 'Le premier client ajouté s’affichera ici, avec ses encaissements.'}</p>
      </div>`;
      return;
    }
    const lignes = recettesDe(client).sort((a, b) => b.dateEncaissement.localeCompare(a.dateEncaissement));
    const total = client.totalRecettes;
    zoneFiche.innerHTML = `
      <div class="fiche-tete">
        <span class="monogramme" data-teinte="${teinteDe(client.nom)}" aria-hidden="true">${echapperHtml(initiales(client.nom))}</span>
        <div class="fiche-titre">
          <h2 id="titre-fiche">${echapperHtml(client.nom)}</h2>
          ${client.siret ? `<p class="sous-titre">SIRET ${siretLisible(client.siret)}</p>` : ''}
        </div>
        <div class="actions">
          <button type="button" class="btn-icone" id="modifier-client" aria-label="Modifier le client" title="Modifier">${icone('crayon', { taille: 17 })}</button>
          <button type="button" class="btn-icone danger" id="supprimer-client" aria-label="Retirer le client du carnet" title="Retirer du carnet">${icone('corbeille', { taille: 17 })}</button>
        </div>
      </div>
      <div class="fiche-chiffres">
        <div><span>Encaissé au total</span><strong>${montantDetaille(total, devise)}</strong></div>
        <div><span>Dernier encaissement</span><strong>${lignes[0] ? echapperHtml(formaterDate(lignes[0].dateEncaissement, formatDate)) : 'Aucun'}</strong></div>
      </div>
      ${lignes.length ? `<div class="fiche-lignes"><table class="tableau">
        <thead><tr><th>Encaissé le</th><th>Libellé</th><th>Facture</th><th class="montant">Montant</th></tr></thead>
        <tbody>${lignes.map((r) => `<tr><td class="date">${echapperHtml(formaterDate(r.dateEncaissement, formatDate))}</td>
          <td class="libelle">${r.libelle
            ? `<span class="texte-libelle" title="${echapperHtml(r.libelle)}">${echapperHtml(r.libelle)}</span>`
            : '<span class="attenue">Sans libellé</span>'}</td>
          <td class="col-piece-hote">${r.pieceJointe
            ? `<button type="button" class="btn-icone piece-oui" data-piece="${r.id}" aria-label="Voir la facture ${echapperHtml(r.pieceJointe.nom)}" title="${echapperHtml(r.pieceJointe.nom)}">${icone('trombone', { taille: 15 })}</button>`
            : '<span class="place-piece" aria-hidden="true"></span>'}${r.numeroFacture ? `<span class="ref">${echapperHtml(r.numeroFacture)}</span>` : '<span class="hors-ecran">Sans facture</span>'}</td>
          <td class="montant">${echapperHtml(formaterMontant(r.montant, devise))}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">${accorder(lignes.length, 'encaissement')}</td><td class="montant">${echapperHtml(formaterMontant(total, devise))}</td></tr></tfoot>
      </table></div>` : '<p class="vide">Aucun encaissement enregistré pour ce client.</p>'}`;
  }

  function animerFiche() {
    zoneFiche.classList.remove('arrive');
    void zoneFiche.offsetWidth;
    zoneFiche.classList.add('arrive');
  }

  /** Recharge le carnet ; après un geste (`anime`), la liste glisse au lieu de sauter. */
  async function charger({ anime = false } = {}) {
    const [reponseClients, reponseRecettes] = await Promise.all([api.listerClients(), api.listerRecettes()]);
    // Le premier client montré est le plus gros ; la liste suit l'ordre choisi.
    clients = reponseClients.clients.sort((a, b) => b.totalRecettes - a.totalRecettes || a.nom.localeCompare(b.nom, 'fr'));
    recettes = reponseRecettes.recettes;
    if (!clientChoisi()) choisi = clients[0]?.id ?? null;
    rendreResume();
    rendreListe({ anime });
    rendreFiche();
  }

  // ---- Formulaire (dans le volet de la fiche) ----------------------------------------------
  function ouvrirFormulaire(client = null) {
    zoneFiche.innerHTML = `<form id="form-client" novalidate>
      <div class="fiche-tete">
        <span class="monogramme" aria-hidden="true">${icone(client ? 'crayon' : 'client-plus', { taille: 20 })}</span>
        <h2 id="titre-fiche">${client ? 'Modifier le client' : 'Nouveau client'}</h2>
      </div>
      <div class="formulaire-fiche">
        ${client ? '' : `<div class="champ">
          <label for="c-recherche">Rechercher par SIRET</label>
          <div class="ligne-siret">
            <input class="champ-texte" id="c-recherche" inputmode="numeric" autocomplete="off" placeholder="14 chiffres">
            <button type="button" class="btn" id="c-chercher">${icone('recherche', { taille: 16 })}Rechercher</button>
          </div>
          <p class="aide-champ" id="c-resultat" aria-live="polite"></p>
        </div>
        <p class="sous-titre">Ou saisissez directement le nom :</p>`}
        <div class="grille-champs">
          <div class="champ" data-champ="nom">
            <label for="c-nom">Nom du client</label>
            <input class="champ-texte" id="c-nom" name="nom" autocomplete="off">
            <span class="erreur-champ message-erreur"></span>
          </div>
          <div class="champ" data-champ="siret">
            <label for="c-siret">SIRET <span class="facultatif">(facultatif)</span></label>
            <input class="champ-texte" id="c-siret" name="siret" inputmode="numeric" autocomplete="off">
            <span class="erreur-champ message-erreur"></span>
          </div>
        </div>
        ${client ? '<p class="aide-champ">Un nouveau nom se reporte aussi sur les recettes de ce client.</p>' : ''}
        <p class="erreur-panneau" data-erreur-panneau role="alert"></p>
      </div>
      <div class="carte-pied">
        <span class="attenue">Le nom apparaîtra tel quel dans le livre des recettes.</span>
        <div class="actions">
          <button type="button" class="btn btn-fantome" id="c-annuler">Annuler</button>
          <button type="submit" class="btn btn-principal">${icone('coche', { taille: 16 })}<span>Enregistrer</span></button>
        </div>
      </div>
    </form>`;
    animerFiche();
    const form = zoneFiche.querySelector('form');
    form.nom.value = client?.nom ?? '';
    form.siret.value = client?.siret ?? '';
    (form.querySelector('#c-recherche') ?? form.nom).focus();

    form.querySelector('#c-annuler').addEventListener('click', () => { rendreFiche(); animerFiche(); });
    const champRecherche = form.querySelector('#c-recherche');
    const chercher = async () => {
      const siret = champRecherche.value.replace(/\s/g, '');
      const resultat = form.querySelector('#c-resultat');
      if (!/^\d{9}$|^\d{14}$/.test(siret)) {
        resultatSiret(resultat, { erreur: 'Un SIRET compte 14 chiffres (un SIREN, 9).' });
        return;
      }
      const bouton = form.querySelector('#c-chercher');
      bouton.disabled = true;
      resultatSiret(resultat);
      try {
        const { entreprise } = await api.rechercherSiret(siret);
        form.nom.value = entreprise.nom;
        form.siret.value = entreprise.siret || (siret.length === 14 ? siret : '');
        resultatSiret(resultat, { nom: entreprise.nom });
      } catch (erreur) {
        resultatSiret(resultat, { erreur: erreur.message });
      } finally {
        bouton.disabled = false;
      }
    };
    form.querySelector('#c-chercher')?.addEventListener('click', chercher);
    champRecherche?.addEventListener('keydown', (evenement) => {
      if (evenement.key === 'Enter') { evenement.preventDefault(); chercher(); }
    });

    form.addEventListener('submit', async (evenement) => {
      evenement.preventDefault();
      effacerErreursFormulaire(form);
      form.querySelector('[data-erreur-panneau]').innerHTML = '';
      const donnees = { nom: form.nom.value, siret: form.siret.value.replace(/\s/g, '') };
      // Fermé pendant l'écriture : un double clic tentait de créer deux fois le même client.
      const bouton = form.querySelector('[type="submit"]');
      bouton.disabled = true;
      try {
        let retour = 'Client ajouté au carnet';
        if (client) {
          const { recettesRenommees } = await api.modifierClient(client.id, donnees);
          choisi = client.id;
          retour = recettesRenommees
            ? `Client modifié, ${accorder(recettesRenommees, 'recette renommée', 'recettes renommées')}`
            : 'Client modifié';
        } else {
          choisi = (await api.creerClient(donnees)).client.id;
        }
        await charger({ anime: true });
        // Le retour s'affiche dans la fiche, et la ligne du client s'allume dans la liste.
        bandeauRetour(zoneFiche, retour, null, { duree: 3500 });
        zoneListe.querySelector('[aria-pressed="true"]')?.classList.add('nouvelle');
      } catch (erreur) {
        bouton.disabled = false;
        if (erreur.erreurs) afficherErreursFormulaire(form, erreur.erreurs);
        else if (erreur.statut === 409) afficherErreursFormulaire(form, { nom: erreur.message });
        else form.querySelector('[data-erreur-panneau]').innerHTML = `${icone('cercle-alerte', { taille: 16 })}<span>${echapperHtml(erreur.message)}</span>`;
      }
    });
  }

  // ---- Événements ---------------------------------------------------------------------------
  page.querySelector('#nouveau-client').addEventListener('click', () => ouvrirFormulaire(null));
  page.querySelector('#c-filtre').addEventListener('input', (evenement) => {
    recherche = evenement.target.value;
    rendreListe({ anime: true });
  });
  brancherSegmentes(page);
  page.querySelector('[aria-label="Trier le carnet"]').addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('[data-ordre]');
    if (!bouton || bouton.dataset.ordre === ordre) return;
    ordre = bouton.dataset.ordre;
    bouton.parentElement.querySelectorAll('[data-ordre]').forEach((b) => b.setAttribute('aria-pressed', String(b === bouton)));
    rendreListe({ anime: true });
  });
  zoneListe.addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('[data-client]');
    if (!bouton) return;
    choisi = bouton.dataset.client;
    zoneListe.querySelectorAll('[data-client]').forEach((x) => x.setAttribute('aria-pressed', String(x === bouton)));
    rendreFiche();
    animerFiche();
  });

  zoneFiche.addEventListener('click', async (evenement) => {
    const piece = evenement.target.closest('[data-piece]');
    if (piece) {
      const recette = recettes.find((r) => r.id === piece.dataset.piece);
      apercuPiece({
        nom: recette.pieceJointe.nom,
        details: [recette.client, formaterMontant(recette.montant, devise), formaterDate(recette.dateEncaissement, formatDate),
          recette.pieceJointe.taille ? poidsLisible(recette.pieceJointe.taille) : ''].filter(Boolean).join(' · '),
        url: urlPiece('recettes', recette.id)
      });
      return;
    }
    if (evenement.target.closest('#modifier-client')) {
      ouvrirFormulaire(clientChoisi());
      return;
    }
    const supprimer = evenement.target.closest('#supprimer-client');
    if (supprimer) {
      const retire = clientChoisi();
      supprimer.disabled = true;
      try {
        await api.supprimerClient(retire.id);
      } catch (erreur) {
        supprimer.disabled = false;
        toast(erreur.message, 'erreur');
        return;
      }
      choisi = null;
      await charger({ anime: true });
      // Rien n'est perdu : les recettes gardent le nom, et « Annuler » remet la fiche.
      bandeauRetour(zoneListe, `${retire.nom} retiré du carnet, ses recettes sont conservées`, async () => {
        try {
          choisi = (await api.creerClient({ nom: retire.nom, siret: retire.siret ?? '' })).client.id;
          await charger({ anime: true });
          bandeauRetour(zoneFiche, 'Client remis dans le carnet', null, { duree: 3500 });
        } catch (erreur) {
          toast(erreur.message, 'erreur');
        }
      });
    }
  });

  await charger();
  if (params?.get('client')) zoneListe.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
}
