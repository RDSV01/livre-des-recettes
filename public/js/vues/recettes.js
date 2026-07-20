/**
 * Vue « Recettes » : tableau principal du livre, recherche, filtres, tri par
 * colonne, sélection multiple et formulaire d'ajout / modification.
 *
 * La liste complète est chargée une seule fois puis filtrée en mémoire
 * (`partage/filtres.js`) : aucune requête au serveur à chaque frappe.
 * Au-delà de 200 lignes, l'affichage est progressif (« Afficher plus »).
 *
 * Aides à la saisie :
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
 *  - signalement discret des anomalies de numérotation des factures ;
 *  - chaque action (y compris groupée) est annulable (Ctrl+Z).
 */

import { api } from '../api.js';
import { etat } from '../etat.js';
import {
  echapperHtml, toast, confirmer, differer, formaterChampMontant,
  afficherErreursFormulaire, effacerErreursFormulaire,
  installerSuggestions, installerApercuDate, majIndicateursTri, majBarreSelection,
  animerDepartLignes
} from '../ui.js';
import { icone } from '../icones.js';
import { etatFiltres } from '../preferences-vues.js';
import { enregistrerAction } from '../historique.js';
import { formaterMontant, sommeMontants, analyserMontant, enCentimes } from '/partage/montants.js';
import { formaterDate, aujourdHuiIso, anneeDe, NOMS_MOIS } from '/partage/dates.js';
import {
  MODES_REGLEMENT, CATEGORIES_RECETTE, libelleMode, libelleCategorieCourt
} from '/partage/constantes.js';
import { normaliserTexte } from '/partage/texte.js';
import { chercherSimilaire } from '/partage/doublons.js';
import { analyserNumerotation, suggererNumeroSuivant } from '/partage/factures.js';
import { filtrerRecettes, valeursFrequentes } from '/partage/filtres.js';

const OPTION_NOUVEAU = '__nouveau__';
const LIMITE_AFFICHAGE = 200;

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

export async function vueRecettes(conteneur, params) {
  const { devise, formatDate, modesPersonnalises } = etat.parametres;
  const modes = MODES_REGLEMENT.concat(modesPersonnalises);
  const estMixte = etat.parametres.typeActivite === 'mixte';
  // Filtres et tri conservés le temps de la session (voir preferences-vues.js).
  const { filtres, tri } = etatFiltres('recettes');
  const selection = new Set(); // identifiants des recettes cochées
  let toutes = [];             // liste complète, source de tout le reste
  let affichees = [];          // liste filtrée et triée (avant pagination)
  let idsVisibles = [];        // identifiants des lignes réellement affichées
  let libelles = [];           // libellés existants, pour les suggestions
  let montrerTout = false;     // affichage au-delà de LIMITE_AFFICHAGE
  let enEdition = null;        // recette en cours de modification, ou null
  let idsNouveaux = new Set(); // recettes à mettre en avant au prochain rendu (ajout)
  let siretResolu = null;      // { requete, siret, nom } après une recherche réussie
  let dejaAverti = false;      // avertissement « recette similaire » déjà montré
  let categorieSource = '';    // catégorie conservée quand le champ n'est pas affiché
  let instantaneInitial = '';  // état du formulaire à l'ouverture (garde-fou)

  conteneur.innerHTML = gabarit();

  const refs = {
    recherche: conteneur.querySelector('#filtre-recherche'),
    annee: conteneur.querySelector('#filtre-annee'),
    mois: conteneur.querySelector('#filtre-mois'),
    mode: conteneur.querySelector('#filtre-mode'),
    categorie: conteneur.querySelector('#filtre-categorie'),
    reinitialiser: conteneur.querySelector('#reinitialiser-filtres'),
    resume: conteneur.querySelector('#resume-filtre'),
    anomalies: conteneur.querySelector('#zone-anomalies'),
    barreSelection: conteneur.querySelector('#barre-selection'),
    compteSelection: conteneur.querySelector('#compte-selection'),
    toutSelectionner: conteneur.querySelector('#tout-selectionner'),
    entetes: conteneur.querySelector('#table-recettes thead'),
    corps: conteneur.querySelector('#corps-recettes'),
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
  let clients = [];

  // Reflète dans les contrôles les filtres restaurés (l'année est gérée par
  // rendreAnnees, qui dépend des données chargées).
  refs.recherche.value = filtres.q;
  refs.mois.value = filtres.mois;
  refs.mode.value = filtres.mode;
  if (refs.categorie) refs.categorie.value = filtres.categorie;

  // Aperçu « 28 mai 2026 » sous le champ date du formulaire.
  const rafraichirApercuDate = installerApercuDate(refs.formulaire.dateEncaissement);

  // ---- Filtres ---------------------------------------------------------------
  const changerFiltres = () => {
    montrerTout = false;
    selection.clear();
    rendreTableau();
  };
  refs.recherche.addEventListener('input', differer(() => {
    filtres.q = refs.recherche.value.trim();
    changerFiltres();
  }));
  for (const nom of ['annee', 'mois', 'mode', 'categorie']) {
    refs[nom]?.addEventListener('change', () => {
      filtres[nom] = refs[nom].value;
      changerFiltres();
    });
  }
  refs.reinitialiser.addEventListener('click', () => {
    Object.assign(filtres, { q: '', annee: '', mois: '', mode: '', categorie: '' });
    refs.recherche.value = '';
    refs.annee.value = '';
    refs.mois.value = '';
    refs.mode.value = '';
    if (refs.categorie) refs.categorie.value = '';
    changerFiltres();
  });

  // ---- Tri par colonne ---------------------------------------------------------
  refs.entetes.addEventListener('click', (evenement) => {
    const th = evenement.target.closest('th.triable');
    if (!th) return;
    const colonne = th.dataset.tri;
    if (tri.colonne === colonne) {
      tri.sens = tri.sens === 'asc' ? 'desc' : 'asc';
    } else {
      tri.colonne = colonne;
      tri.sens = colonne === 'date' || colonne === 'montant' ? 'desc' : 'asc';
    }
    rendreTableau();
  });


  // ---- Sélection multiple --------------------------------------------------------
  refs.corps.addEventListener('change', (evenement) => {
    const case_ = evenement.target.closest('input[data-selection]');
    if (!case_) return;
    if (case_.checked) selection.add(case_.dataset.selection);
    else selection.delete(case_.dataset.selection);
    majSelection();
  });

  refs.toutSelectionner.addEventListener('change', () => {
    if (refs.toutSelectionner.checked) {
      idsVisibles.forEach((id) => selection.add(id));
    } else {
      idsVisibles.forEach((id) => selection.delete(id));
    }
    refs.corps.querySelectorAll('input[data-selection]').forEach((c) => {
      c.checked = selection.has(c.dataset.selection);
    });
    majSelection();
  });

  const recettesSelectionnees = () => toutes.filter((r) => selection.has(r.id));

  const majSelection = () => {
    // Total des recettes cochées : pratique pour recouper un montant déclaré.
    const total = sommeMontants(recettesSelectionnees().map((r) => r.montant));
    majBarreSelection(
      { barre: refs.barreSelection, compte: refs.compteSelection, toutSelectionner: refs.toutSelectionner },
      selection, idsVisibles,
      (n) => `${n} recette${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''} · ${formaterMontant(total, devise)}`
    );
  };

  conteneur.querySelector('#deselectionner').addEventListener('click', () => {
    selection.clear();
    refs.corps.querySelectorAll('input[data-selection]').forEach((c) => { c.checked = false; });
    majSelection();
  });

  conteneur.querySelector('#supprimer-selection').addEventListener('click', async () => {
    const cibles = recettesSelectionnees();
    if (cibles.length === 0) return;
    const total = sommeMontants(cibles.map((r) => r.montant));
    const accord = await confirmer({
      titre: `Supprimer ${cibles.length} recette${cibles.length > 1 ? 's' : ''} ?`,
      message: `Total : ${formaterMontant(total, devise)}. Ctrl+Z permet d'annuler.`
    });
    if (!accord) return;
    try {
      const lignes = cibles.map((r) => refs.corps.querySelector(`input[data-selection="${r.id}"]`)?.closest('tr'));
      await animerDepartLignes(lignes);
      for (const recette of cibles) await api.supprimerRecette(recette.id);
      const donnees = cibles.map(champsRecette);
      let ids = cibles.map((r) => r.id);
      enregistrerAction({
        annuler: async () => {
          ids = [];
          for (const d of donnees) ids.push((await api.creerRecette(d)).recette.id);
        },
        retablir: async () => { for (const id of ids) await api.supprimerRecette(id); }
      });
      toast(`${cibles.length} recette${cibles.length > 1 ? 's' : ''} supprimée${cibles.length > 1 ? 's' : ''}.`);
      selection.clear();
      await rafraichir();
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
  });

  // Reclassement groupé (activité mixte) : vente ou prestation.
  conteneur.querySelectorAll('[data-classer]').forEach((bouton) => {
    bouton.addEventListener('click', async () => {
      const categorie = bouton.dataset.classer;
      const cibles = recettesSelectionnees().filter((r) => r.categorie !== categorie);
      if (cibles.length === 0) {
        toast('Les recettes sélectionnées sont déjà dans cette catégorie.');
        return;
      }
      try {
        const changements = cibles.map((r) => ({
          id: r.id,
          avant: champsRecette(r),
          apres: { ...champsRecette(r), categorie }
        }));
        for (const c of changements) await api.modifierRecette(c.id, c.apres);
        enregistrerAction({
          annuler: async () => { for (const c of changements) await api.modifierRecette(c.id, c.avant); },
          retablir: async () => { for (const c of changements) await api.modifierRecette(c.id, c.apres); }
        });
        toast(`${cibles.length} recette${cibles.length > 1 ? 's' : ''} reclassée${cibles.length > 1 ? 's' : ''}.`);
        selection.clear();
        await rafraichir();
      } catch (erreur) {
        toast(erreur.message, 'erreur');
      }
    });
  });

  // ---- Actions par ligne (délégation d'événements) -----------------------------
  refs.corps.addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('[data-action]');
    if (!bouton) return;

    if (bouton.dataset.action === 'afficher-plus') {
      montrerTout = true;
      rendreTableau();
      return;
    }

    const recette = toutes.find((r) => r.id === bouton.dataset.id);
    if (!recette) return;

    if (bouton.dataset.action === 'modifier') {
      ouvrirFormulaire(recette);
    } else if (bouton.dataset.action === 'dupliquer') {
      // Paiement récurrent : mêmes champs, date remise à aujourd'hui.
      ouvrirFormulaire(null, recette);
    } else if (bouton.dataset.action === 'supprimer') {
      const accord = await confirmer({
        titre: 'Supprimer cette recette ?',
        message: `${formaterDate(recette.dateEncaissement, formatDate)}, ${recette.client}, ` +
          `${formaterMontant(recette.montant, devise)}.`
      });
      if (!accord) return;
      try {
        await animerDepartLignes([bouton.closest('tr')]);
        await api.supprimerRecette(recette.id);
        const donnees = champsRecette(recette);
        let id = recette.id;
        enregistrerAction({
          annuler: async () => { id = (await api.creerRecette(donnees)).recette.id; },
          retablir: () => api.supprimerRecette(id)
        });
        toast('Recette supprimée (Ctrl+Z pour annuler).');
        await rafraichir();
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

  // Garde-fou : abandonner un formulaire modifié demande confirmation.
  const lireInstantane = () => {
    const f = refs.formulaire;
    return JSON.stringify([
      f.dateEncaissement.value, refs.clientSelect.value, refs.clientNouveau.value,
      f.montant.value, f.modeReglement.value, f.numeroFacture.value, f.libelle.value,
      estMixte ? f.categorie.value : ''
    ]);
  };
  async function fermerFormulaire() {
    if (lireInstantane() !== instantaneInitial) {
      const accord = await confirmer({
        titre: 'Abandonner cette saisie ?',
        message: 'Les informations du formulaire seront perdues.',
        boutonOk: 'Abandonner'
      });
      if (!accord) return;
    }
    refs.dialogue.close();
  }
  conteneur.querySelector('#annuler-recette').addEventListener('click', fermerFormulaire);
  refs.dialogue.addEventListener('cancel', (evenement) => {
    evenement.preventDefault();
    fermerFormulaire();
  });

  // « 12,5 » devient « 12,50 » dès que l'on quitte le champ montant.
  refs.formulaire.montant.addEventListener('blur', () => {
    const brut = refs.formulaire.montant.value.trim();
    if (brut) refs.formulaire.montant.value = formaterChampMontant(brut);
  });

  // Suggestion du prochain numéro de facture : un clic la reprend.
  refs.suggestionFacture.addEventListener('click', () => {
    refs.formulaire.numeroFacture.value = refs.suggestionFacture.dataset.valeur;
    refs.suggestionFacture.hidden = true;
  });
  refs.formulaire.numeroFacture.addEventListener('input', () => {
    refs.suggestionFacture.hidden = true;
  });

  // ---- Suggestions de libellé (liste maison, sans composant natif) --------------
  const fermerSuggestions = installerSuggestions({
    champ: refs.formulaire.libelle,
    liste: refs.suggestions,
    valeurs: () => libelles
  });

  // ---- Enregistrement -----------------------------------------------------------
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

    const payload = {
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
    if (!enEdition && !dejaAverti && etat.parametres.alerteRecetteSimilaire) {
      const montant = analyserMontant(payload.montant);
      const similaire = montant === null ? null :
        chercherSimilaire({ ...payload, montant }, toutes);
      if (similaire) {
        dejaAverti = true;
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

    try {
      if (enEdition) {
        const avant = champsRecette(enEdition);
        const idFixe = enEdition.id;
        const { recette } = await api.modifierRecette(idFixe, payload);
        const apres = champsRecette(recette);
        enregistrerAction({
          annuler: () => api.modifierRecette(idFixe, avant),
          retablir: () => api.modifierRecette(idFixe, apres)
        });
        toast('Recette modifiée.');
      } else {
        const { recette } = await api.creerRecette(payload);
        const donnees = champsRecette(recette);
        let id = recette.id;
        idsNouveaux = new Set([recette.id]); // surlignée au rendu qui suit
        enregistrerAction({
          annuler: () => api.supprimerRecette(id),
          retablir: async () => { id = (await api.creerRecette(donnees)).recette.id; }
        });
        toast('Recette ajoutée au livre.');
      }
      refs.dialogue.close();
      await rafraichir();
    } catch (erreur) {
      if (erreur.erreurs) {
        afficherErreursFormulaire(f, erreur.erreurs);
      } else {
        toast(erreur.message, 'erreur');
      }
    }
  });

  /**
   * Ouvre le formulaire : vide (ajout), prérempli pour modification, ou
   * prérempli depuis un `modele` (duplication, avec la date du jour).
   */
  function ouvrirFormulaire(recette = null, modele = null) {
    enEdition = recette;
    siretResolu = null;
    dejaAverti = false;
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
    const suggestion = recette ? null : suggererNumeroSuivant(toutes);
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

    instantaneInitial = lireInstantane();
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
  async function chargerRecettes() {
    const reponse = await api.listerRecettes();
    toutes = reponse.recettes;
    libelles = valeursFrequentes(toutes, 'libelle');
    rendreAnnees();
    rendreAnomalies();
    rendreTableau();
  }

  async function chargerClients() {
    const reponse = await api.listerClients();
    clients = reponse.clients;
  }

  /** Tout recharger après une écriture (création, modification, suppression). */
  function rafraichir() {
    return Promise.all([chargerRecettes(), chargerClients()]);
  }

  function rendreAnnees() {
    const annees = [...new Set(toutes.map((r) => anneeDe(r.dateEncaissement)))].sort((a, b) => b - a);
    refs.annee.innerHTML = '<option value="">Toutes</option>' +
      annees.map((a) => `<option value="${a}">${a}</option>`).join('');
    refs.annee.value = annees.includes(Number(filtres.annee)) ? filtres.annee : '';
    filtres.annee = refs.annee.value;
  }

  function rendreAnomalies() {
    if (!etat.parametres.alertesNumerotation) {
      refs.anomalies.innerHTML = '';
      return;
    }
    const { doublons, manquants } = analyserNumerotation(toutes);
    if (doublons.length === 0 && manquants.length === 0) {
      refs.anomalies.innerHTML = '';
      return;
    }
    const nbManquants = manquants.reduce((n, s) => n + s.numeros.length, 0);
    const resume = [
      doublons.length > 0 ? `${doublons.length} numéro${doublons.length > 1 ? 's' : ''} en double` : '',
      nbManquants > 0 ? `${nbManquants} numéro${nbManquants > 1 ? 's' : ''} manquant${nbManquants > 1 ? 's' : ''}` : ''
    ].filter(Boolean).join(', ');

    refs.anomalies.innerHTML = `
      <details class="anomalies">
        <summary>${icone('cercle-alerte', { taille: 16 })}<span>Numérotation des factures : ${resume}.</span></summary>
        <ul>
          ${doublons.map((d) =>
            `<li>« ${echapperHtml(d.numero)} » est utilisé par ${d.occurrences} recettes.</li>`
          ).join('')}
          ${manquants.map((s) => {
            const affiches = s.numeros.slice(0, 8).map((n) => `« ${echapperHtml(n)} »`).join(', ');
            const reste = s.numeros.length > 8 ? ` et ${s.numeros.length - 8} autres` : '';
            return `<li>Il semble manquer ${affiches}${reste}.</li>`;
          }).join('')}
        </ul>
      </details>`;
  }

  function rendreTableau() {
    const cle = CLES_TRI[tri.colonne];
    const facteur = tri.sens === 'asc' ? 1 : -1;
    affichees = filtrerRecettes(toutes, filtres).sort((a, b) => {
      const va = cle(a, modesPersonnalises);
      const vb = cle(b, modesPersonnalises);
      const ordre = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr');
      return ordre * facteur;
    });

    const total = sommeMontants(affichees.map((r) => r.montant));
    refs.resume.textContent = affichees.length === 0
      ? 'Aucune recette ne correspond.'
      : `${affichees.length} recette${affichees.length > 1 ? 's' : ''} (${formaterMontant(total, devise)})`;

    majIndicateursTri(refs.entetes, tri);

    if (affichees.length === 0) {
      idsVisibles = [];
      refs.corps.innerHTML = `
        <tr class="ligne-vide"><td colspan="${estMixte ? 9 : 8}">
          Aucune recette à afficher. Ajoutez-en une avec « Nouvelle recette ».
        </td></tr>`;
      majSelection();
      return;
    }

    const visibles = montrerTout ? affichees : affichees.slice(0, LIMITE_AFFICHAGE);
    idsVisibles = visibles.map((r) => r.id);
    const restantes = affichees.length - visibles.length;

    refs.corps.innerHTML = visibles.map((r) => `
      <tr${idsNouveaux.has(r.id) ? ' class="ligne-nouvelle"' : ''}>
        <td class="col-case"><input type="checkbox" data-selection="${r.id}"
          ${selection.has(r.id) ? 'checked' : ''} aria-label="Sélectionner"></td>
        <td>${echapperHtml(formaterDate(r.dateEncaissement, formatDate))}</td>
        <td>${echapperHtml(r.client)}</td>
        <td>${r.libelle ? echapperHtml(r.libelle) : '<span class="attenue">-</span>'}</td>
        <td>${r.numeroFacture ? echapperHtml(r.numeroFacture) : '<span class="attenue">-</span>'}</td>
        <td><span class="badge">${echapperHtml(libelleMode(r.modeReglement, modesPersonnalises))}</span></td>
        ${estMixte ? `<td>${r.categorie
          ? `<span class="badge categorie-${r.categorie}">${echapperHtml(libelleCategorieCourt(r.categorie))}</span>`
          : '<span class="attenue">-</span>'}</td>` : ''}
        <td class="montant">${echapperHtml(formaterMontant(r.montant, devise))}</td>
        <td class="actions">
          <button type="button" class="btn-icone" data-action="dupliquer" data-id="${r.id}" title="Dupliquer (paiement récurrent)" aria-label="Dupliquer">${icone('copier', { taille: 16 })}</button>
          <button type="button" class="btn-icone" data-action="modifier" data-id="${r.id}" title="Modifier" aria-label="Modifier">${icone('crayon', { taille: 16 })}</button>
          <button type="button" class="btn-icone danger" data-action="supprimer" data-id="${r.id}" title="Supprimer" aria-label="Supprimer">${icone('corbeille', { taille: 16 })}</button>
        </td>
      </tr>`).join('') + (restantes > 0 ? `
      <tr class="ligne-vide"><td colspan="${estMixte ? 9 : 8}">
        <button type="button" class="btn btn-discret" data-action="afficher-plus">
          Afficher les ${restantes} recette${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''}
        </button>
      </td></tr>` : '');

    // Le surlignage d'ajout n'a lieu qu'une fois, au rendu qui suit la création.
    idsNouveaux.clear();
    majSelection();
  }

  function gabarit() {
    const optionsModes = modes
      .map((m) => `<option value="${echapperHtml(m.code)}">${echapperHtml(m.libelle)}</option>`)
      .join('');
    const optionsCategories = CATEGORIES_RECETTE
      .map((c) => `<option value="${c.code}">${c.libelle}</option>`)
      .join('');
    const enTete = (cleTri, libelle, classe = '') =>
      `<th class="triable ${classe}" data-tri="${cleTri}">${libelle}<span class="indicateur-tri"></span></th>`;

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
              ${optionsModes}
            </select>
          </div>
          ${estMixte ? `
          <div class="champ">
            <label for="filtre-categorie">Catégorie</label>
            <select id="filtre-categorie">
              <option value="">Toutes</option>
              ${optionsCategories}
              <option value="aucune">Non catégorisées</option>
            </select>
          </div>` : ''}
          <button type="button" class="btn btn-secondaire" id="reinitialiser-filtres">${icone('reinitialiser', { taille: 16 })}<span>Réinitialiser</span></button>
        </div>

        <div id="zone-anomalies"></div>

        <div class="barre-selection" id="barre-selection" hidden>
          <span id="compte-selection"></span>
          ${estMixte ? `
            <button type="button" class="btn btn-secondaire" data-classer="ventes">Classer en ventes</button>
            <button type="button" class="btn btn-secondaire" data-classer="prestations">Classer en prestations</button>` : ''}
          <button type="button" class="btn btn-danger" id="supprimer-selection">${icone('corbeille', { taille: 16 })}<span>Supprimer</span></button>
          <button type="button" class="btn btn-discret" id="deselectionner">Tout désélectionner</button>
        </div>

        <p class="resume-filtre" id="resume-filtre"></p>

        <table id="table-recettes">
          <colgroup>
            ${estMixte ? `
              <col style="width: 4%"><col style="width: 10%"><col style="width: 15%">
              <col style="width: 19%"><col style="width: 12%"><col style="width: 11%">
              <col style="width: 9%"><col style="width: 11%"><col style="width: 9%">`
            : `
              <col style="width: 4%"><col style="width: 11%"><col style="width: 16%">
              <col style="width: 22%"><col style="width: 13%"><col style="width: 12%">
              <col style="width: 11%"><col style="width: 11%">`}
          </colgroup>
          <thead>
            <tr>
              <th class="col-case"><input type="checkbox" id="tout-selectionner" aria-label="Tout sélectionner"></th>
              ${enTete('date', 'Encaissé le')}
              ${enTete('client', 'Client')}
              ${enTete('libelle', 'Libellé')}
              ${enTete('facture', 'Facture')}
              ${enTete('mode', 'Paiement')}
              ${estMixte ? enTete('categorie', 'Catégorie') : ''}
              ${enTete('montant', 'Montant', 'montant')}
              <th></th>
            </tr>
          </thead>
          <tbody id="corps-recettes"></tbody>
        </table>
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
                ${optionsModes}
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
                ${optionsCategories}
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

  await Promise.all([chargerRecettes(), chargerClients()]);

  // Arrivée depuis « Nouvelle recette » du tableau de bord.
  if (params?.get('nouvelle')) ouvrirFormulaire();
}
