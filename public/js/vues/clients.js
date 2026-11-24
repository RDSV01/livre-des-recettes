/**
 * Vue « Clients » : le carnet à gauche, classé par chiffre d'affaires, la
 * fiche du client choisi à droite (ses encaissements, ses factures jointes).
 * Une fiche ne contient que le nom et, facultativement, le SIRET : le carnet
 * sert à fiabiliser la saisie des recettes.
 *
 * Deux façons d'ajouter un client : par une recherche dans l'annuaire public
 * des entreprises, par nom, SIREN ou SIRET (nom exact, SIRET et adresse à
 * vérifier avant de choisir), ou par le nom seul.
 */

import { api, urlPiece } from '../api.js';
import { etat } from '../etat.js';
import {
  echapperHtml, toast, accorder, monogramme, siretLisible, resultatSiret, poidsLisible,
  afficherErreursFormulaire, effacerErreursFormulaire, montantDetaille, preparerFlip, confirmer,
  listeEntreprises, entrepriseEnLigne, ecouterPourLaPage
} from '../ui.js';
import { bandeauRetour, brancherSegmentes } from '../retours.js';
import { icone } from '../icones.js';
import { apercuPiece } from '../pieces.js';
import { formaterMontant, formaterMontantEntier, sommeMontants } from '/partage/montants.js';
import { formaterDate, nomMois, aujourdHuiIso } from '/partage/dates.js';
import { joursEntre } from '/partage/declarations.js';
import { libelleMode } from '/partage/constantes.js';
import { normaliserTexte } from '/partage/texte.js';

/** Client affiché, retenu d'une visite à l'autre. */
let choisi = null;

/** Ordre du carnet, retenu d'une visite à l'autre : chiffre d'affaires, nom, ou dernier encaissement. */
let ordre = 'ca';
const ORDRES = [['ca', 'Chiffre d’affaires'], ['nom', 'Nom'], ['recent', 'Récents']];

/** « aujourd’hui », « il y a 5 jours », « il y a 2 mois », « il y a plus d’un an ». */
function depuisQuand(iso) {
  const jours = joursEntre(iso, aujourdHuiIso());
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'hier';
  if (jours < 45) return `il y a ${jours} jours`;
  if (jours < 365) return `il y a ${Math.round(jours / 30)} mois`;
  return jours < 730 ? 'il y a plus d’un an' : `il y a ${Math.floor(jours / 365)} ans`;
}

export async function vueClients(conteneur, params) {
  const { devise, formatDate, modesPersonnalises = [] } = etat.parametres;
  /** Année montrée dans la fiche : « tout » (au départ), ou une de ses années. */
  let anneeFiche = 'tout';
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

  // Les recettes de chaque client, par nom normalisé : rangées une fois par chargement.
  let rangees = null;
  let parClient = new Map();
  const recettesDe = (client) => {
    if (rangees !== recettes) {
      rangees = recettes;
      parClient = new Map();
      for (const r of recettes) {
        const cle = normaliserTexte(r.client);
        if (!parClient.has(cle)) parClient.set(cle, []);
        parClient.get(cle).push(r);
      }
    }
    return [...(parClient.get(normaliserTexte(client.nom)) ?? [])];
  };
  const clientChoisi = () => clients.find((c) => c.id === choisi);

  // ---- Rendu -----------------------------------------------------------------------------
  function rendreResume() {
    const avecSiret = clients.filter((c) => c.siret).length;
    page.querySelector('#resume-clients').innerHTML = clients.length === 0
      ? 'Votre carnet de clients.'
      : `${accorder(clients.length, 'client')}${avecSiret ? `, dont ${avecSiret} avec SIRET` : ''}`;
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
    // Part de chaque client dans le chiffre d'affaires de tout le carnet ; la
    // barre, elle, se mesure au plus gros client : le classement se lit sans lire.
    const totalCarnet = clients.reduce((somme, c) => somme + c.totalRecettes, 0);
    const plusGros = Math.max(0, ...clients.map((c) => c.totalRecettes));
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
        ${monogramme(c.nom)}
        <span class="corps-client"${part > 0 ? ` title="${String(part).replace('.', ',')} % du chiffre d’affaires"` : ''}>
          ${part > 0 ? `<span class="barre-client" aria-hidden="true" style="width:${Math.max(4, (c.totalRecettes / plusGros) * 100)}%"></span>` : ''}
          <span class="nom">${echapperHtml(c.nom)}</span>${c.siret ? `<span class="details">SIRET ${siretLisible(c.siret)}</span>` : ''}
          ${part > 0 ? `<span class="hors-ecran">, ${String(part).replace('.', ',')} % du chiffre d’affaires</span>` : ''}</span>
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
    const toutes = recettesDe(client).sort((a, b) => b.dateEncaissement.localeCompare(a.dateEncaissement));
    const total = client.totalRecettes;
    // Ses années, de la plus récente ; « Tout » quand il y en a plusieurs.
    const anneesClient = [...new Set(toutes.map((r) => r.dateEncaissement.slice(0, 4)))];
    // Toute son histoire d'abord ; une année se choisit au-dessus du tableau.
    if (!anneesClient.includes(anneeFiche)) anneeFiche = 'tout';
    const lignes = anneeFiche === 'tout' ? toutes : toutes.filter((r) => r.dateEncaissement.startsWith(anneeFiche));
    const totalAffiche = sommeMontants(lignes.map((r) => r.montant));
    // Un profil en une phrase : depuis quand, comment il paie, ses factures.
    const premiere = toutes.at(-1);
    const modes = new Map();
    toutes.forEach((r) => modes.set(r.modeReglement, (modes.get(r.modeReglement) ?? 0) + 1));
    const modeHabituel = [...modes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const sansPdf = toutes.filter((r) => !r.pieceJointe).length;
    const profil = toutes.length ? [
      `Client depuis ${nomMois(Number(premiere.dateEncaissement.slice(5, 7)))} ${premiere.dateEncaissement.slice(0, 4)}`,
      modeHabituel ? `paie le plus souvent par ${libelleMode(modeHabituel, modesPersonnalises).toLowerCase()}` : '',
      sansPdf === 0 ? 'toutes ses factures sont jointes' : `${accorder(sansPdf, 'recette')} sans facture PDF`
    ].filter(Boolean).join(', ') : '';
    const derniere = toutes[0];
    zoneFiche.innerHTML = `
      <div class="fiche-tete">
        ${monogramme(client.nom)}
        <div class="fiche-titre">
          <h2 id="titre-fiche">${echapperHtml(client.nom)}</h2>
          ${client.siret ? `<p class="sous-titre">SIRET ${siretLisible(client.siret)}</p>` : ''}
        </div>
        <div class="actions">
          <a class="btn btn-petit" href="#/recettes?nouvelle=1&client=${encodeURIComponent(client.nom)}">${icone('plus', { taille: 15 })}Nouvelle recette</a>
          <button type="button" class="btn-icone" id="modifier-client" aria-label="Modifier le client" title="Modifier">${icone('crayon', { taille: 17 })}</button>
          <button type="button" class="btn-icone danger" id="supprimer-client" aria-label="Retirer le client du carnet" title="Retirer du carnet">${icone('corbeille', { taille: 17 })}</button>
        </div>
        ${profil ? `<p class="profil-client">${echapperHtml(profil)}.</p>` : ''}
      </div>
      <div class="fiche-chiffres">
        <div><span>Total encaissé</span><strong>${montantDetaille(total, devise)}</strong></div>
        <div><span>Encaissements</span><strong>${toutes.length}</strong></div>
        <div><span>Panier moyen</span><strong>${toutes.length ? echapperHtml(formaterMontantEntier(total / toutes.length, devise)) : '-'}</strong></div>
        <div><span>Dernier</span><strong>${derniere ? echapperHtml(formaterDate(derniere.dateEncaissement, formatDate)) : 'Aucun'}</strong>
          ${derniere ? `<small>${depuisQuand(derniere.dateEncaissement)}</small>` : ''}</div>
      </div>
      ${anneesClient.length > 1 ? `<div class="fiche-annees">
        <div class="segmente compact" role="group" aria-label="Année affichée">
          ${[...anneesClient, 'tout'].map((a) => `<button type="button" data-annee-fiche="${a}" aria-pressed="${a === anneeFiche}">${a === 'tout' ? 'Tout' : a}</button>`).join('')}
        </div>
        <span class="attenue">${accorder(lignes.length, 'recette')}, ${echapperHtml(formaterMontant(totalAffiche, devise))}</span>
      </div>` : ''}
      ${lignes.length ? `<div class="fiche-lignes"><table class="tableau">
        <thead><tr><th>Encaissé le</th><th>Libellé</th><th>Facture</th><th class="montant">Montant</th></tr></thead>
        <tbody>${lignes.map((r) => `<tr data-voir="${r.id}"><td class="date"><a class="lien-ligne" href="#/recettes?voir=${encodeURIComponent(r.id)}">${echapperHtml(formaterDate(r.dateEncaissement, formatDate))}</a></td>
          <td class="libelle">${r.libelle
            ? `<span class="texte-libelle" title="${echapperHtml(r.libelle)}">${echapperHtml(r.libelle)}</span>`
            : '<span class="attenue">Sans libellé</span>'}</td>
          <td class="col-piece-hote">${r.pieceJointe
            ? `<button type="button" class="btn-icone piece-oui" data-piece="${r.id}" aria-label="Voir la facture ${echapperHtml(r.pieceJointe.nom)}" title="${echapperHtml(r.pieceJointe.nom)}">${icone('trombone', { taille: 15 })}</button>`
            : '<span class="place-piece" aria-hidden="true"></span>'}${r.numeroFacture ? `<span class="ref">${echapperHtml(r.numeroFacture)}</span>` : '<span class="hors-ecran">Sans facture</span>'}</td>
          <td class="montant">${echapperHtml(formaterMontant(r.montant, devise))}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">${accorder(lignes.length, 'encaissement')}</td><td class="montant">${echapperHtml(formaterMontant(totalAffiche, devise))}</td></tr></tfoot>
      </table></div>` : '<p class="vide">Aucun encaissement enregistré pour ce client.</p>'}`;
    brancherSegmentes(zoneFiche);
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
          <label for="c-recherche">Rechercher dans l’annuaire des entreprises</label>
          <div class="ligne-siret">
            <input class="champ-texte" id="c-recherche" autocomplete="off" placeholder="Nom, SIREN ou SIRET">
            <button type="button" class="btn" id="c-chercher">${icone('recherche', { taille: 16 })}Rechercher</button>
          </div>
          <p class="aide-champ" id="c-resultat" aria-live="polite"></p>
          <div id="c-entreprises" aria-live="polite" hidden></div>
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
    const zoneEntreprises = form.querySelector('#c-entreprises');
    /** Une entreprise retenue remplit le nom et le SIRET ; son adresse est rappelée pour vérifier. */
    const retenir = (entreprise) => {
      zoneEntreprises.hidden = true;
      zoneEntreprises.innerHTML = '';
      form.nom.value = entreprise.nom;
      form.siret.value = entreprise.siret;
      resultatSiret(form.querySelector('#c-resultat'), { nom: entreprise.nom, texte: `Trouvé : ${entrepriseEnLigne(entreprise)}` });
    };
    const chercher = async () => {
      const saisie = champRecherche.value.trim();
      const resultat = form.querySelector('#c-resultat');
      zoneEntreprises.hidden = true;
      const chiffres = saisie.replace(/\s/g, '');
      if (/^\d+$/.test(chiffres) && !/^\d{9}$|^\d{14}$/.test(chiffres)) {
        resultatSiret(resultat, { erreur: 'Un SIRET compte 14 chiffres (un SIREN, 9).' });
        return;
      }
      if (saisie.length < 3) {
        resultatSiret(resultat, { erreur: 'Tapez au moins 3 lettres du nom, ou un SIREN ou un SIRET.' });
        return;
      }
      const bouton = form.querySelector('#c-chercher');
      bouton.disabled = true;
      resultatSiret(resultat);
      try {
        const trouves = await api.rechercherEntreprises(saisie);
        // Un numéro désigne une seule entreprise : elle est reprise d'emblée.
        if (/^\d+$/.test(chiffres) && trouves.entreprises.length === 1) {
          retenir(trouves.entreprises[0]);
        } else {
          resultat.hidden = true;
          listeEntreprises(zoneEntreprises, trouves, retenir);
        }
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
    anneeFiche = 'tout';
    zoneListe.querySelectorAll('[data-client]').forEach((x) => x.setAttribute('aria-pressed', String(x === bouton)));
    rendreFiche();
    animerFiche();
  });

  zoneFiche.addEventListener('click', async (evenement) => {
    // Ses recettes d'une année, ou de toutes.
    const annee = evenement.target.closest('[data-annee-fiche]');
    if (annee) {
      if (annee.dataset.anneeFiche === anneeFiche) return;
      anneeFiche = annee.dataset.anneeFiche;
      rendreFiche();
      zoneFiche.querySelector(`[data-annee-fiche="${anneeFiche}"]`)?.focus({ preventScroll: true });
      return;
    }
    const piece = evenement.target.closest('[data-piece]');
    if (piece) {
      const recette = recettes.find((r) => r.id === piece.dataset.piece);
      apercuPiece({
        nom: recette.pieceJointe.nom,
        details: [recette.client, formaterMontant(recette.montant, devise), formaterDate(recette.dateEncaissement, formatDate),
          recette.pieceJointe.taille ? poidsLisible(recette.pieceJointe.taille) : ''].filter(Boolean).join(', '),
        url: urlPiece('recettes', recette.id)
      });
      return;
    }
    // Une recette s'ouvre dans le registre, mise en avant, comme depuis le tableau de bord.
    const ligneRecette = evenement.target.closest('tr[data-voir]');
    if (ligneRecette && !evenement.target.closest('a, button')) {
      location.hash = `#/recettes?voir=${encodeURIComponent(ligneRecette.dataset.voir)}`;
      return;
    }
    if (evenement.target.closest('#modifier-client')) {
      ouvrirFormulaire(clientChoisi());
      return;
    }
    const supprimer = evenement.target.closest('#supprimer-client');
    if (supprimer) {
      const retire = clientChoisi();
      const nombre = recettesDe(retire).length;
      const accord = await confirmer({
        titre: `Retirer ${retire.nom} du carnet ?`,
        suites: [
          nombre
            ? { garde: `${nombre === 1 ? 'Sa recette reste' : `Ses ${nombre} recettes restent`} dans le livre, à son nom` }
            : { garde: 'Aucune recette n’est enregistrée à son nom' },
          { garde: '« Annuler », juste après, le remet dans le carnet' },
          { perd: 'Il ne sera plus proposé à la saisie' }
        ],
        tuile: { icone: 'clients', ton: 'framboise' },
        boutonOk: 'Retirer du carnet'
      });
      if (!accord) return;
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
  // Recettes saisies en série depuis la fiche (panneau ouvert sur place) : la fiche suit.
  ecouterPourLaPage('ligne-ajoutee', () => {
    if (page.isConnected) charger({ anime: true }).catch((erreur) => toast(erreur.message, 'erreur'));
  });
}
