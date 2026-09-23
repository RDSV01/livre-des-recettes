/**
 * Vue « Recettes » : le livre des recettes et son formulaire de saisie.
 *
 * Le tableau (filtres, tri, affichage progressif, sélection, suppression
 * annulable) est celui de `registre.js`, partagé avec les achats. Cette vue
 * apporte ses colonnes et ses aides à la saisie :
 *  - choix du client dans un menu (ou nouveau client par SIRET / nom) ;
 *  - auto-complétion des libellés déjà utilisés ;
 *  - suggestion du prochain numéro de facture (série reconnue) ;
 *  - montant toléré sous toutes ses écritures (« 12,5 » devient 12,50) ;
 *  - avertissement non bloquant si une recette très similaire existe déjà ;
 *  - duplication d'une recette en un clic (paiements récurrents), la date
 *    étant remise à aujourd'hui ;
 *  - catégorie vente / prestation demandée quand l'activité est mixte, avec
 *    reclassement groupé via la sélection multiple ;
 *  - garde-fou avant d'abandonner un formulaire modifié ;
 *  - signalement des anomalies de numérotation des factures, détail visible,
 *    un numéro normal (facture annulée) pouvant être ignoré.
 */

import { api } from '../api.js';
import { etat, definirParametres } from '../etat.js';
import {
  echapperHtml, toast, formaterChampMontant, afficherErreursFormulaire,
  effacerErreursFormulaire, installerSuggestions, installerApercuDate, installerChampMontant,
  installerGardeFormulaire, ouvrirModale, enteteTri, optionsCodes, resultatSiret
} from '../ui.js';
import { icone } from '../icones.js';
import { etatFiltres } from '../preferences-vues.js';
import { enregistrerAction } from '../historique.js';
import { installerRegistre, barreFiltres, barreSelection, tableauRegistre } from '../registre.js';
import { formaterMontant, analyserMontant, enCentimes } from '/partage/montants.js';
import { formaterDate, aujourdHuiIso } from '/partage/dates.js';
import {
  MODES_REGLEMENT, CATEGORIES_RECETTE, libelleMode, libelleCategorieCourt
} from '/partage/constantes.js';
import { normaliserTexte } from '/partage/texte.js';
import { chercherSimilaire } from '/partage/doublons.js';
import { analyserNumerotation, suggererNumeroSuivant } from '/partage/factures.js';
import { filtrerRecettes, valeursFrequentes } from '/partage/filtres.js';

const OPTION_NOUVEAU = '__nouveau__';

/** Un identifiant d'entreprise : SIREN (9 chiffres) ou SIRET (14 chiffres). */
const estIdentifiant = (valeur) => /^\d{9}$|^\d{14}$/.test(valeur);

/** Les champs d'une recette (pour l'historique Annuler / Rétablir). */
const champsRecette = (r) => ({
  dateEncaissement: r.dateEncaissement,
  client: r.client,
  libelle: r.libelle,
  numeroFacture: r.numeroFacture,
  montant: r.montant,
  modeReglement: r.modeReglement,
  categorie: r.categorie ?? ''
});

/** Clés de tri par colonne du tableau. */
const CLES_TRI = {
  date: (r) => r.dateEncaissement,
  client: (r) => normaliserTexte(r.client),
  libelle: (r) => normaliserTexte(r.libelle),
  facture: (r) => normaliserTexte(r.numeroFacture),
  mode: (r, modes) => normaliserTexte(libelleMode(r.modeReglement, modes)),
  categorie: (r) => libelleCategorieCourt(r.categorie),
  montant: (r) => enCentimes(r.montant)
};

/** Cellule d'un texte facultatif : un tiret discret quand il est vide. */
const texteOuTiret = (texte) => (texte ? echapperHtml(texte) : '<span class="attenue">-</span>');

/** Badge de catégorie d'une recette (activité mixte). */
const badgeCategorie = (r) => (r.categorie
  ? `<span class="badge categorie-${r.categorie}">${echapperHtml(libelleCategorieCourt(r.categorie))}</span>`
  : '<span class="attenue">-</span>');

export async function vueRecettes(conteneur, params) {
  const { devise, formatDate, modesPersonnalises } = etat.parametres;
  const modes = optionsCodes(MODES_REGLEMENT.concat(modesPersonnalises));
  const categories = optionsCodes(CATEGORIES_RECETTE);
  const estMixte = etat.parametres.typeActivite === 'mixte';
  let clients = [];            // carnet de clients, pour le menu du formulaire
  let libelles = [];           // libellés existants, pour les suggestions
  let enEdition = null;        // recette en cours de modification, ou null
  let siretResolu = null;      // { requete, siret, nom } après une recherche réussie
  let saisieAvertie = '';      // saisie pour laquelle « recette similaire » a été montré
  let categorieSource = '';    // catégorie conservée quand le champ n'est pas affiché

  conteneur.innerHTML = gabarit();

  const refs = {
    anomalies: conteneur.querySelector('#zone-anomalies'),
    suggestions: conteneur.querySelector('#suggestions-libelle'),
    suggestionFacture: conteneur.querySelector('#suggestion-facture'),
    dialogue: conteneur.querySelector('#dialogue-recette'),
    formulaire: conteneur.querySelector('#formulaire-recette'),
    titreDialogue: conteneur.querySelector('#titre-dialogue-recette'),
    clientSelect: conteneur.querySelector('#recette-client-select'),
    blocNouveau: conteneur.querySelector('#bloc-nouveau-client'),
    clientNouveau: conteneur.querySelector('#recette-client-nouveau'),
    clientResolu: conteneur.querySelector('#recette-client-resolu'),
    avertissement: conteneur.querySelector('#avertissement-similaire'),
    enregistrer: conteneur.querySelector('#enregistrer-recette')
  };

  const registre = installerRegistre(conteneur, {
    id: 'recettes',
    nom: { singulier: 'recette', feminin: true, ce: 'cette', nouveau: 'Nouvelle recette', registre: 'livre' },
    etat: etatFiltres('recettes'),
    cleDate: 'dateEncaissement',
    filtrer: filtrerRecettes,
    clesTri: CLES_TRI,
    libellesFiltres: {
      categorie: (code) => (code === 'aucune'
        ? 'Non catégorisées'
        : CATEGORIES_RECETTE.find((c) => c.code === code)?.libelle ?? code)
    },
    lister: async () => (await api.listerRecettes()).recettes,
    creer: async (champs) => (await api.creerRecette(champs)).recette,
    modifier: async (id, champs) => (await api.modifierRecette(id, champs)).recette,
    supprimer: async (ids) => (await api.supprimerRecettes(ids)).recettes,
    restaurer: (lignes) => api.restaurerRecettes(lignes),
    champs: champsRecette,
    formulaire: refs,
    decrire: (r) => `${formaterDate(r.dateEncaissement, formatDate)}, ${r.client}, ${formaterMontant(r.montant, devise)}`,
    titreDupliquer: 'Dupliquer (paiement récurrent)',
    ouvrirFormulaire,
    apresChargement: (recettes) => {
      libelles = valeursFrequentes(recettes, 'libelle');
      rendreAnomalies(recettes);
    },
    cellules: (r) => `
      <td class="col-date" data-label="Encaissé le">${echapperHtml(formaterDate(r.dateEncaissement, formatDate))}</td>
      <td data-label="Client">${echapperHtml(r.client)}</td>
      <td data-label="Libellé">${texteOuTiret(r.libelle)}</td>
      <td data-label="Facture">${texteOuTiret(r.numeroFacture)}</td>
      <td data-label="Paiement"><span class="badge">${echapperHtml(libelleMode(r.modeReglement, modesPersonnalises))}</span></td>
      ${estMixte ? `<td data-label="Catégorie">${badgeCategorie(r)}</td>` : ''}
      <td class="montant" data-label="Montant">${echapperHtml(formaterMontant(r.montant, devise))}</td>`
  });

  // ---- Reclassement groupé (activité mixte) : vente ou prestation -----------------
  conteneur.querySelectorAll('[data-classer]').forEach((bouton) => {
    bouton.addEventListener('click', async () => {
      const categorie = bouton.dataset.classer;
      const cibles = registre.selectionnees().filter((r) => r.categorie !== categorie);
      if (cibles.length === 0) {
        toast('Les recettes sélectionnées sont déjà dans cette catégorie.');
        return;
      }
      try {
        // Un seul aller-retour et une seule écriture pour tout le lot.
        const avant = cibles.map((r) => ({ id: r.id, ...champsRecette(r) }));
        const apres = avant.map((r) => ({ ...r, categorie }));
        await api.modifierRecettes(apres);
        enregistrerAction({
          annuler: () => api.modifierRecettes(avant),
          retablir: () => api.modifierRecettes(apres)
        });
        toast(`${cibles.length} recette${cibles.length > 1 ? 's' : ''} reclassée${cibles.length > 1 ? 's' : ''}.`);
        registre.viderSelection();
        await registre.charger();
      } catch (erreur) {
        toast(erreur.message, 'erreur');
      }
    });
  });

  // ---- Anomalies de numérotation -----------------------------------------------
  function rendreAnomalies(recettes) {
    if (!etat.parametres.alertesNumerotation) {
      refs.anomalies.innerHTML = '';
      return;
    }
    const { doublons, manquants } = analyserNumerotation(recettes, {
      ignores: etat.parametres.numerosIgnores ?? []
    });
    if (doublons.length === 0 && manquants.length === 0) {
      refs.anomalies.innerHTML = '';
      return;
    }
    const ignorer = (numero) => `<button type="button" class="lien-ignorer" data-ignorer="${echapperHtml(numero)}"
      aria-label="Ne plus signaler ${echapperHtml(numero)}">ignorer</button>`;
    const nbManquants = manquants.reduce((n, s) => n + s.numeros.length, 0);
    const resume = [
      doublons.length > 0 ? `${doublons.length} numéro${doublons.length > 1 ? 's' : ''} en double` : '',
      nbManquants > 0 ? `${nbManquants} numéro${nbManquants > 1 ? 's' : ''} manquant${nbManquants > 1 ? 's' : ''}` : ''
    ].filter(Boolean).join(', ');

    // Déplié d'emblée : savoir qu'il manque un numéro sans savoir lequel
    // n'avance à rien, et l'utilisateur ne pensait pas toujours à cliquer.
    // Le repli reste possible une fois l'anomalie lue.
    refs.anomalies.innerHTML = `
      <details class="anomalies" open>
        <summary>${icone('cercle-alerte', { taille: 16 })}<span>Numérotation des factures : ${resume}.</span></summary>
        <ul>
          ${doublons.map((d) =>
            `<li>« ${echapperHtml(d.numero)} » est utilisé par ${d.occurrences} recettes. ${ignorer(d.numero)}</li>`
          ).join('')}
          ${manquants.map((s) => {
            const affiches = s.numeros.slice(0, 8)
              .map((n) => `<span class="numero-signale">« ${echapperHtml(n)} » ${ignorer(n)}</span>`)
              .join(', ');
            const reste = s.numeros.length > 8 ? ` et ${s.numeros.length - 8} autres` : '';
            return `<li>Il semble manquer ${affiches}${reste}.</li>`;
          }).join('')}
        </ul>
        <p class="aide-anomalies">Un numéro est normal (facture annulée, facture réglée en
        plusieurs fois) ? « ignorer » cesse de le signaler, ici comme dans le contrôle avant export.</p>
      </details>`;
  }

  // Un numéro signalé à tort est déclaré normal d'un clic. Le choix se défait
  // depuis la notification, et plus tard depuis les paramètres.
  refs.anomalies.addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('[data-ignorer]');
    if (!bouton) return;
    const numero = bouton.dataset.ignorer;
    const avant = etat.parametres.numerosIgnores ?? [];
    bouton.disabled = true;
    try {
      await enregistrerNumerosIgnores([...avant, numero]);
      toast(`« ${numero} » ne sera plus signalé.`, 'succes', {
        action: {
          libelle: 'Annuler',
          executer: () => enregistrerNumerosIgnores(avant).catch((erreur) => toast(erreur.message, 'erreur'))
        }
      });
      // Le bouton cliqué a disparu avec la ligne : le focus reste dans le bloc.
      refs.anomalies.querySelector('summary')?.focus();
    } catch (erreur) {
      bouton.disabled = false;
      toast(erreur.message, 'erreur');
    }
  });

  async function enregistrerNumerosIgnores(numeros) {
    const reponse = await api.enregistrerParametres({ ...etat.parametres, numerosIgnores: numeros });
    definirParametres(reponse.parametres);
    rendreAnomalies(registre.toutes());
  }

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
  refs.clientNouveau.addEventListener('blur', async () => {
    const chiffres = refs.clientNouveau.value.replace(/\s/g, '');
    if (!estIdentifiant(chiffres)) return;
    resultatSiret(refs.clientResolu, {});
    try {
      const { entreprise } = await api.rechercherSiret(chiffres);
      siretResolu = { requete: chiffres, siret: entreprise.siret || '', nom: entreprise.nom };
      resultatSiret(refs.clientResolu, { nom: entreprise.nom });
    } catch (erreur) {
      siretResolu = null;
      resultatSiret(refs.clientResolu, { erreur: erreur.message });
    }
  });

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
      let resolu = siretResolu?.requete === chiffres ? siretResolu : null;
      if (!resolu) {
        try {
          resolu = (await api.rechercherSiret(chiffres)).entreprise;
        } catch (erreur) {
          // Sans réseau, ou sur un nom fait de chiffres, la recherche échoue :
          // l'enregistrement doit rester possible, pas s'arrêter net.
          throw {
            champ: 'client',
            message: `Nom introuvable pour « ${saisie} » (${erreur.message}). ` +
              'Vérifiez le numéro, ou saisissez le nom du client en toutes lettres.'
          };
        }
      }
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

  async function chargerClients() {
    clients = (await api.listerClients()).clients;
  }

  // ---- Formulaire -------------------------------------------------------------
  const rafraichirApercuDate = installerApercuDate(refs.formulaire.dateEncaissement);
  installerChampMontant(refs.formulaire);
  const memoriserEtatInitial = installerGardeFormulaire({
    dialogue: refs.dialogue,
    boutonAnnuler: conteneur.querySelector('#annuler-recette'),
    lireEtat: () => {
      const f = refs.formulaire;
      return JSON.stringify([
        f.dateEncaissement.value, refs.clientSelect.value, refs.clientNouveau.value,
        f.montant.value, f.modeReglement.value, f.numeroFacture.value, f.libelle.value,
        estMixte ? f.categorie.value : ''
      ]);
    }
  });
  const fermerSuggestions = installerSuggestions({
    champ: refs.formulaire.libelle,
    liste: refs.suggestions,
    valeurs: () => libelles
  });
  conteneur.querySelector('#nouvelle-recette').addEventListener('click', () => ouvrirFormulaire());

  // Suggestion du prochain numéro de facture : un clic la reprend.
  refs.suggestionFacture.addEventListener('click', () => {
    refs.formulaire.numeroFacture.value = refs.suggestionFacture.dataset.valeur;
    refs.suggestionFacture.hidden = true;
  });
  refs.formulaire.numeroFacture.addEventListener('input', () => {
    refs.suggestionFacture.hidden = true;
  });

  refs.formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    effacerErreursFormulaire(refs.formulaire);
    const f = refs.formulaire;

    // Activité mixte : la catégorie est exigée à la saisie.
    if (estMixte && !f.categorie.value) {
      return afficherErreursFormulaire(f, {
        categorie: 'Précisez s’il s’agit d’une vente ou d’une prestation.'
      });
    }

    let client;
    try {
      client = await resoudreClient();
    } catch (erreur) {
      if (erreur.champ) return afficherErreursFormulaire(f, { [erreur.champ]: erreur.message });
      return toast(erreur.message, 'erreur');
    }

    const saisie = {
      dateEncaissement: f.dateEncaissement.value,
      client,
      libelle: f.libelle.value,
      numeroFacture: f.numeroFacture.value,
      montant: f.montant.value,
      modeReglement: f.modeReglement.value,
      // Hors activité mixte, le champ n'est pas affiché : la catégorie
      // existante est conservée telle quelle.
      categorie: estMixte ? f.categorie.value : categorieSource
    };

    // Avertissement non bloquant : une recette très similaire existe déjà.
    // L'accord porte sur la saisie exacte qui a été avertie : changer le montant
    // ou la date rouvre la question, au lieu de passer en silence.
    const signature = JSON.stringify(saisie);
    if (!enEdition && saisieAvertie !== signature && etat.parametres.alerteRecetteSimilaire) {
      const montant = analyserMontant(saisie.montant);
      const similaire = montant === null ? null : chercherSimilaire({ ...saisie, montant }, registre.toutes());
      if (similaire) {
        saisieAvertie = signature;
        refs.avertissement.hidden = false;
        refs.avertissement.innerHTML = `${icone('cercle-alerte', { taille: 18 })}
          <span>Une recette très similaire existe déjà :
          ${echapperHtml(formaterDate(similaire.dateEncaissement, formatDate))},
          ${echapperHtml(similaire.client)},
          ${echapperHtml(formaterMontant(similaire.montant, devise))}${similaire.numeroFacture ? `, facture ${echapperHtml(similaire.numeroFacture)}` : ''}.</span>`;
        refs.enregistrer.querySelector('span').textContent = 'Enregistrer quand même';
        return;
      }
    }

    // Un nouveau client a pu rejoindre le carnet : il est rechargé aussi.
    await registre.enregistrerSaisie(enEdition, saisie, { apres: chargerClients });
  });

  /**
   * Ouvre le formulaire : vide (ajout), prérempli pour modification, ou
   * prérempli depuis un `modele` (duplication, avec la date du jour).
   */
  function ouvrirFormulaire(recette = null, modele = null) {
    enEdition = recette;
    siretResolu = null;
    saisieAvertie = '';
    fermerSuggestions();
    effacerErreursFormulaire(refs.formulaire);
    refs.avertissement.hidden = true;
    refs.enregistrer.querySelector('span').textContent = 'Enregistrer';
    refs.titreDialogue.textContent = recette ? 'Modifier la recette' : 'Nouvelle recette';

    const source = recette ?? modele;
    const f = refs.formulaire;
    f.dateEncaissement.value = recette?.dateEncaissement ?? aujourdHuiIso();
    rafraichirApercuDate();
    f.montant.value = source ? formaterChampMontant(source.montant) : '';
    f.modeReglement.value = source?.modeReglement ?? 'virement';
    f.numeroFacture.value = recette?.numeroFacture ?? '';
    f.libelle.value = source?.libelle ?? '';
    categorieSource = source?.categorie ?? '';
    if (estMixte) f.categorie.value = categorieSource;

    // Suggestion du prochain numéro de facture, pour une nouvelle recette.
    const suggestion = recette ? null : suggererNumeroSuivant(registre.toutes());
    refs.suggestionFacture.hidden = !suggestion;
    if (suggestion) {
      refs.suggestionFacture.dataset.valeur = suggestion;
      refs.suggestionFacture.textContent = `Suggestion : ${suggestion}`;
    }

    // Client : préselectionne l'existant si le nom correspond, sinon « Nouveau ».
    remplirSelectClients();
    refs.clientResolu.hidden = true;
    refs.clientNouveau.value = '';
    const existant = source && clients.some((c) => normaliserTexte(c.nom) === normaliserTexte(source.client));
    if (existant) {
      refs.clientSelect.value = source.client;
      refs.blocNouveau.hidden = true;
    } else {
      refs.clientSelect.value = OPTION_NOUVEAU;
      refs.blocNouveau.hidden = false;
      if (source) refs.clientNouveau.value = source.client;
    }

    memoriserEtatInitial();
    ouvrirModale(refs.dialogue);
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

  function gabarit() {
    return `
      <header class="entete-vue">
        <div class="titre-registre">
          <span class="puce-registre registre-recettes">${icone('recettes', { taille: 20 })}</span>
          <div>
            <h1>Recettes</h1>
            <p>Le registre chronologique de vos encaissements.</p>
          </div>
        </div>
        <div class="actions-vue">
          <a class="btn btn-tertiaire" id="lien-exporter" href="#/exports?registre=recettes">${icone('exports', { taille: 16 })}<span>Exporter</span></a>
          <button type="button" class="btn btn-primaire" id="nouvelle-recette">${icone('plus', { taille: 16 })}<span>Nouvelle recette</span></button>
        </div>
      </header>

      <div class="carte">
        ${barreFiltres({
          placeholder: 'Client, libellé, facture, montant…',
          libelleMode: 'Mode de règlement',
          optionsModes: modes,
          supplementaires: estMixte ? `
            <div class="champ">
              <label for="filtre-categorie">Catégorie</label>
              <select id="filtre-categorie">
                <option value="">Toutes</option>
                ${categories}
                <option value="aucune">Non catégorisées</option>
              </select>
            </div>` : ''
        })}

        <div id="zone-anomalies"></div>

        ${barreSelection(estMixte ? `
          <button type="button" class="btn btn-secondaire" data-classer="ventes">Classer en ventes</button>
          <button type="button" class="btn btn-secondaire" data-classer="prestations">Classer en prestations</button>` : '')}

        ${tableauRegistre(
          estMixte ? ['10%', '15%', '19%', '12%', '11%', '9%', '11%'] : ['11%', '16%', '22%', '13%', '12%', '11%'],
          `${enteteTri('date', 'Encaissé le')}
          ${enteteTri('client', 'Client')}
          ${enteteTri('libelle', 'Libellé')}
          ${enteteTri('facture', 'Facture')}
          ${enteteTri('mode', 'Paiement')}
          ${estMixte ? enteteTri('categorie', 'Catégorie') : ''}
          ${enteteTri('montant', 'Montant', 'montant')}`
        )}
      </div>

      <dialog id="dialogue-recette" aria-labelledby="titre-dialogue-recette">
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
              <input type="text" id="recette-montant" name="montant" inputmode="decimal"
                placeholder="0,00" autocomplete="off" required>
              <span class="erreur-champ"></span>
            </div>
            <div class="champ pleine-largeur" data-champ="client">
              <label for="recette-client-select">Client *</label>
              <select id="recette-client-select"></select>
              <div id="bloc-nouveau-client" class="bloc-nouveau-client">
                <input type="text" id="recette-client-nouveau" autocomplete="off"
                  aria-label="SIRET ou nom du nouveau client"
                  placeholder="SIRET (14 chiffres) ou nom du client">
                <div class="resultat-siret" id="recette-client-resolu" hidden></div>
              </div>
              <span class="indication">Renseigner le SIRET met exactement le bon nom du client, pour un registre conforme.</span>
              <span class="erreur-champ"></span>
            </div>
            <div class="champ" data-champ="modeReglement">
              <label for="recette-mode">Mode de règlement *</label>
              <select id="recette-mode" name="modeReglement">
                ${modes}
              </select>
              <span class="erreur-champ"></span>
            </div>
            <div class="champ" data-champ="numeroFacture">
              <label for="recette-facture">Numéro de facture</label>
              <input type="text" id="recette-facture" name="numeroFacture" placeholder="FAC-2026-001 (facultatif)">
              <button type="button" class="lien-suggestion" id="suggestion-facture" hidden></button>
              <span class="erreur-champ"></span>
            </div>
            ${estMixte ? `
            <div class="champ pleine-largeur" data-champ="categorie">
              <label for="recette-categorie">Catégorie *</label>
              <select id="recette-categorie" name="categorie">
                <option value="">Choisir…</option>
                ${categories}
              </select>
              <span class="indication">Activité mixte : la part « prestations » a ses propres plafonds, et la déclaration URSSAF distingue les deux.</span>
              <span class="erreur-champ"></span>
            </div>` : ''}
            <div class="champ pleine-largeur" data-champ="libelle">
              <label for="recette-libelle">Libellé / description</label>
              <div class="porte-suggestions">
                <input type="text" id="recette-libelle" name="libelle"
                  autocomplete="off" placeholder="Prestation, vente… (recommandé pour le registre)">
                <div class="liste-suggestions" id="suggestions-libelle" hidden></div>
              </div>
              <span class="erreur-champ"></span>
            </div>
          </div>
          <div class="avertissement-formulaire" id="avertissement-similaire" hidden></div>
          <div class="pied-dialogue">
            <button type="button" class="btn btn-secondaire" id="annuler-recette">Annuler</button>
            <button type="submit" class="btn btn-primaire" id="enregistrer-recette"><span>Enregistrer</span></button>
          </div>
        </form>
      </dialog>`;
  }

  await Promise.all([registre.charger(), chargerClients()]);

  // Arrivée depuis « Nouvelle recette » du tableau de bord.
  if (params?.get('nouvelle')) ouvrirFormulaire();
}
