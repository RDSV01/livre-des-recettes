/**
 * Vue « Achats » : le registre des achats, obligatoire dès que l'activité
 * comporte de la vente de marchandises.
 *
 * Cinq colonnes légales, dans l'ordre chronologique des règlements : date du
 * règlement, fournisseur, référence de la facture ou du justificatif, mode de
 * paiement et montant de l'achat.
 *
 * Même fonctionnement que le livre des recettes : liste chargée une seule
 * fois puis filtrée en mémoire (`partage/filtres.js`), affichage progressif
 * au-delà de 200 lignes, tri par colonne, sélection multiple, duplication,
 * garde-fou avant d'abandonner une saisie, et chaque action annulable
 * (Ctrl+Z).
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
import { formaterMontant, sommeMontants, enCentimes } from '/partage/montants.js';
import { formaterDate, aujourdHuiIso, anneeDe, NOMS_MOIS } from '/partage/dates.js';
import { MODES_REGLEMENT, libelleMode } from '/partage/constantes.js';
import { normaliserTexte } from '/partage/texte.js';
import { filtrerAchats, valeursFrequentes } from '/partage/filtres.js';

const LIMITE_AFFICHAGE = 200;

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
  // Filtres et tri conservés le temps de la session (voir preferences-vues.js).
  const { filtres, tri } = etatFiltres('achats');
  const selection = new Set(); // identifiants des achats cochés
  let tous = [];               // liste complète, source de tout le reste
  let affiches = [];           // liste filtrée et triée (avant pagination)
  let idsVisibles = [];        // identifiants des lignes réellement affichées
  let fournisseurs = [];       // fournisseurs existants, pour les suggestions
  let montrerTout = false;     // affichage au-delà de LIMITE_AFFICHAGE
  let enEdition = null;        // achat en cours de modification, ou null
  let idsNouveaux = new Set(); // achats à mettre en avant au prochain rendu (ajout)
  let instantaneInitial = '';  // état du formulaire à l'ouverture (garde-fou)

  conteneur.innerHTML = gabarit();

  const refs = {
    recherche: conteneur.querySelector('#filtre-recherche'),
    annee: conteneur.querySelector('#filtre-annee'),
    mois: conteneur.querySelector('#filtre-mois'),
    mode: conteneur.querySelector('#filtre-mode'),
    reinitialiser: conteneur.querySelector('#reinitialiser-filtres'),
    resume: conteneur.querySelector('#resume-filtre'),
    barreSelection: conteneur.querySelector('#barre-selection'),
    compteSelection: conteneur.querySelector('#compte-selection'),
    toutSelectionner: conteneur.querySelector('#tout-selectionner'),
    entetes: conteneur.querySelector('#table-achats thead'),
    corps: conteneur.querySelector('#corps-achats'),
    suggestions: conteneur.querySelector('#suggestions-fournisseur'),
    dialogue: conteneur.querySelector('#dialogue-achat'),
    formulaire: conteneur.querySelector('#formulaire-achat'),
    titreDialogue: conteneur.querySelector('#titre-dialogue-achat')
  };

  // Reflète dans les contrôles les filtres restaurés (l'année est gérée par
  // rendreAnnees, qui dépend des données chargées).
  refs.recherche.value = filtres.q;
  refs.mois.value = filtres.mois;
  refs.mode.value = filtres.mode;

  // Aperçu « 28 mai 2026 » sous le champ date du formulaire.
  const rafraichirApercuDate = installerApercuDate(refs.formulaire.dateReglement);

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
  for (const nom of ['annee', 'mois', 'mode']) {
    refs[nom].addEventListener('change', () => {
      filtres[nom] = refs[nom].value;
      changerFiltres();
    });
  }
  refs.reinitialiser.addEventListener('click', () => {
    Object.assign(filtres, { q: '', annee: '', mois: '', mode: '' });
    refs.recherche.value = '';
    refs.annee.value = '';
    refs.mois.value = '';
    refs.mode.value = '';
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

  const achatsSelectionnes = () => tous.filter((a) => selection.has(a.id));

  const majSelection = () => {
    // Total des achats cochés, comme pour les recettes.
    const total = sommeMontants(achatsSelectionnes().map((a) => a.montant));
    majBarreSelection(
      { barre: refs.barreSelection, compte: refs.compteSelection, toutSelectionner: refs.toutSelectionner },
      selection, idsVisibles,
      (n) => `${n} achat${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''} · ${formaterMontant(total, devise)}`
    );
  };

  conteneur.querySelector('#deselectionner').addEventListener('click', () => {
    selection.clear();
    refs.corps.querySelectorAll('input[data-selection]').forEach((c) => { c.checked = false; });
    majSelection();
  });

  conteneur.querySelector('#supprimer-selection').addEventListener('click', async () => {
    const cibles = achatsSelectionnes();
    if (cibles.length === 0) return;
    const total = sommeMontants(cibles.map((a) => a.montant));
    const accord = await confirmer({
      titre: `Supprimer ${cibles.length} achat${cibles.length > 1 ? 's' : ''} ?`,
      message: `Total : ${formaterMontant(total, devise)}. Ctrl+Z permet d'annuler.`
    });
    if (!accord) return;
    try {
      const lignes = cibles.map((a) => refs.corps.querySelector(`input[data-selection="${a.id}"]`)?.closest('tr'));
      await animerDepartLignes(lignes);
      for (const achat of cibles) await api.supprimerAchat(achat.id);
      const donnees = cibles.map(champsAchat);
      let ids = cibles.map((a) => a.id);
      enregistrerAction({
        annuler: async () => {
          ids = [];
          for (const d of donnees) ids.push((await api.creerAchat(d)).achat.id);
        },
        retablir: async () => { for (const id of ids) await api.supprimerAchat(id); }
      });
      toast(`${cibles.length} achat${cibles.length > 1 ? 's' : ''} supprimé${cibles.length > 1 ? 's' : ''}.`);
      selection.clear();
      await chargerAchats();
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
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

    const achat = tous.find((a) => a.id === bouton.dataset.id);
    if (!achat) return;

    if (bouton.dataset.action === 'modifier') {
      ouvrirFormulaire(achat);
    } else if (bouton.dataset.action === 'dupliquer') {
      // Achat récurrent : mêmes champs, date remise à aujourd'hui.
      ouvrirFormulaire(null, achat);
    } else if (bouton.dataset.action === 'supprimer') {
      const accord = await confirmer({
        titre: 'Supprimer cet achat ?',
        message: `${formaterDate(achat.dateReglement, formatDate)}, ${achat.fournisseur}, ` +
          `${formaterMontant(achat.montant, devise)}.`
      });
      if (!accord) return;
      try {
        await animerDepartLignes([bouton.closest('tr')]);
        await api.supprimerAchat(achat.id);
        const donnees = champsAchat(achat);
        let id = achat.id;
        enregistrerAction({
          annuler: async () => { id = (await api.creerAchat(donnees)).achat.id; },
          retablir: () => api.supprimerAchat(id)
        });
        toast('Achat supprimé (Ctrl+Z pour annuler).');
        await chargerAchats();
      } catch (erreur) {
        toast(erreur.message, 'erreur');
      }
    }
  });

  // ---- Formulaire -------------------------------------------------------------
  conteneur.querySelector('#nouvel-achat').addEventListener('click', () => ouvrirFormulaire());

  // Garde-fou : abandonner un formulaire modifié demande confirmation.
  const lireInstantane = () => {
    const f = refs.formulaire;
    return JSON.stringify([
      f.dateReglement.value, f.fournisseur.value, f.montant.value,
      f.modeReglement.value, f.referenceFacture.value
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
  conteneur.querySelector('#annuler-achat').addEventListener('click', fermerFormulaire);
  refs.dialogue.addEventListener('cancel', (evenement) => {
    evenement.preventDefault();
    fermerFormulaire();
  });

  // « 12,5 » devient « 12,50 » dès que l'on quitte le champ montant.
  refs.formulaire.montant.addEventListener('blur', () => {
    const brut = refs.formulaire.montant.value.trim();
    if (brut) refs.formulaire.montant.value = formaterChampMontant(brut);
  });

  // ---- Suggestions de fournisseur (liste maison, sans composant natif) ----------
  const fermerSuggestions = installerSuggestions({
    champ: refs.formulaire.fournisseur,
    liste: refs.suggestions,
    valeurs: () => fournisseurs
  });

  // ---- Enregistrement -----------------------------------------------------------
  refs.formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    effacerErreursFormulaire(refs.formulaire);
    const f = refs.formulaire;

    const payload = {
      dateReglement: f.dateReglement.value,
      fournisseur: f.fournisseur.value,
      referenceFacture: f.referenceFacture.value,
      montant: f.montant.value,
      modeReglement: f.modeReglement.value
    };

    try {
      if (enEdition) {
        const avant = champsAchat(enEdition);
        const idFixe = enEdition.id;
        const { achat } = await api.modifierAchat(idFixe, payload);
        const apres = champsAchat(achat);
        enregistrerAction({
          annuler: () => api.modifierAchat(idFixe, avant),
          retablir: () => api.modifierAchat(idFixe, apres)
        });
        toast('Achat modifié.');
      } else {
        const { achat } = await api.creerAchat(payload);
        const donnees = champsAchat(achat);
        let id = achat.id;
        idsNouveaux = new Set([achat.id]); // surligné au rendu qui suit
        enregistrerAction({
          annuler: () => api.supprimerAchat(id),
          retablir: async () => { id = (await api.creerAchat(donnees)).achat.id; }
        });
        toast('Achat ajouté au registre.');
      }
      refs.dialogue.close();
      await chargerAchats();
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

    instantaneInitial = lireInstantane();
    refs.dialogue.showModal();
    f.dateReglement.focus();
  }

  // ---- Chargement des données ---------------------------------------------------
  async function chargerAchats() {
    const reponse = await api.listerAchats();
    tous = reponse.achats;
    fournisseurs = valeursFrequentes(tous, 'fournisseur');
    rendreAnnees();
    rendreTableau();
  }

  function rendreAnnees() {
    const annees = [...new Set(tous.map((a) => anneeDe(a.dateReglement)))].sort((a, b) => b - a);
    refs.annee.innerHTML = '<option value="">Toutes</option>' +
      annees.map((a) => `<option value="${a}">${a}</option>`).join('');
    refs.annee.value = annees.includes(Number(filtres.annee)) ? filtres.annee : '';
    filtres.annee = refs.annee.value;
  }

  function rendreTableau() {
    const cle = CLES_TRI[tri.colonne];
    const facteur = tri.sens === 'asc' ? 1 : -1;
    affiches = filtrerAchats(tous, filtres).sort((a, b) => {
      const va = cle(a, modesPersonnalises);
      const vb = cle(b, modesPersonnalises);
      const ordre = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr');
      return ordre * facteur;
    });

    const total = sommeMontants(affiches.map((a) => a.montant));
    refs.resume.textContent = affiches.length === 0
      ? 'Aucun achat ne correspond.'
      : `${affiches.length} achat${affiches.length > 1 ? 's' : ''} (${formaterMontant(total, devise)})`;

    majIndicateursTri(refs.entetes, tri);

    if (affiches.length === 0) {
      idsVisibles = [];
      refs.corps.innerHTML = `
        <tr class="ligne-vide"><td colspan="7">
          Aucun achat à afficher. Ajoutez-en un avec « Nouvel achat ».
        </td></tr>`;
      majSelection();
      return;
    }

    const visibles = montrerTout ? affiches : affiches.slice(0, LIMITE_AFFICHAGE);
    idsVisibles = visibles.map((a) => a.id);
    const restants = affiches.length - visibles.length;

    refs.corps.innerHTML = visibles.map((a) => `
      <tr${idsNouveaux.has(a.id) ? ' class="ligne-nouvelle"' : ''}>
        <td class="col-case"><input type="checkbox" data-selection="${a.id}"
          ${selection.has(a.id) ? 'checked' : ''} aria-label="Sélectionner"></td>
        <td class="col-date">${echapperHtml(formaterDate(a.dateReglement, formatDate))}</td>
        <td>${echapperHtml(a.fournisseur)}</td>
        <td>${a.referenceFacture ? echapperHtml(a.referenceFacture) : '<span class="attenue">-</span>'}</td>
        <td><span class="badge">${echapperHtml(libelleMode(a.modeReglement, modesPersonnalises))}</span></td>
        <td class="montant">${echapperHtml(formaterMontant(a.montant, devise))}</td>
        <td class="actions">
          <button type="button" class="btn-icone" data-action="dupliquer" data-id="${a.id}" title="Dupliquer (achat récurrent)" aria-label="Dupliquer">${icone('copier', { taille: 16 })}</button>
          <button type="button" class="btn-icone" data-action="modifier" data-id="${a.id}" title="Modifier" aria-label="Modifier">${icone('crayon', { taille: 16 })}</button>
          <button type="button" class="btn-icone danger" data-action="supprimer" data-id="${a.id}" title="Supprimer" aria-label="Supprimer">${icone('corbeille', { taille: 16 })}</button>
        </td>
      </tr>`).join('') + (restants > 0 ? `
      <tr class="ligne-vide"><td colspan="7">
        <button type="button" class="btn btn-tertiaire" data-action="afficher-plus">
          Afficher les ${restants} achat${restants > 1 ? 's' : ''} restant${restants > 1 ? 's' : ''}
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
    const enTete = (cleTri, libelle, classe = '') =>
      `<th class="triable ${classe}" data-tri="${cleTri}">${libelle}<span class="indicateur-tri"></span></th>`;

    return `
      <header class="entete-vue">
        <div>
          <h1>Achats</h1>
          <p>Le registre chronologique de vos achats, exigible si vous vendez des marchandises.</p>
        </div>
        <button type="button" class="btn btn-primaire" id="nouvel-achat">${icone('plus', { taille: 16 })}<span>Nouvel achat</span></button>
      </header>

      <div class="carte">
        <div class="barre-outils">
          <div class="champ recherche">
            <label for="filtre-recherche">Rechercher</label>
            <input type="search" id="filtre-recherche" placeholder="Fournisseur, référence, montant…">
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
            <label for="filtre-mode">Mode de paiement</label>
            <select id="filtre-mode">
              <option value="">Tous</option>
              ${optionsModes}
            </select>
          </div>
          <button type="button" class="btn btn-secondaire" id="reinitialiser-filtres">${icone('reinitialiser', { taille: 16 })}<span>Réinitialiser</span></button>
        </div>

        <div class="barre-selection" id="barre-selection" hidden>
          <span id="compte-selection"></span>
          <button type="button" class="btn btn-danger" id="supprimer-selection">${icone('corbeille', { taille: 16 })}<span>Supprimer</span></button>
          <button type="button" class="btn btn-tertiaire" id="deselectionner">Tout désélectionner</button>
        </div>

        <p class="resume-filtre" id="resume-filtre"></p>

        <table id="table-achats">
          <colgroup>
            ${/* La colonne des actions est fixée en pixels : elle porte trois
                  boutons de taille constante, qu'un pourcentage laissait
                  déborder de leur cellule dès que la fenêtre rétrécissait. */ ''}
            <col style="width: 4%"><col style="width: 13%"><col style="width: 27%">
            <col style="width: 20%"><col style="width: 14%"><col style="width: 12%">
            <col style="width: 108px">
          </colgroup>
          <thead>
            <tr>
              <th class="col-case"><input type="checkbox" id="tout-selectionner" aria-label="Tout sélectionner"></th>
              ${enTete('date', 'Réglé le')}
              ${enTete('fournisseur', 'Fournisseur')}
              ${enTete('reference', 'Référence')}
              ${enTete('mode', 'Paiement')}
              ${enTete('montant', 'Montant', 'montant')}
              <th></th>
            </tr>
          </thead>
          <tbody id="corps-achats"></tbody>
        </table>
      </div>

      <dialog id="dialogue-achat">
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
                ${optionsModes}
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
            <button type="submit" class="btn btn-primaire"><span>Enregistrer</span></button>
          </div>
        </form>
      </dialog>`;
  }

  await chargerAchats();

  // Arrivée depuis « Nouvel achat » du tableau de bord.
  if (params?.get('nouveau')) ouvrirFormulaire();
}
