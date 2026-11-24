/**
 * Vue « Recettes » : le livre des recettes et son panneau de saisie.
 *
 * Le tableau (filtres, tri, sélection, pièces jointes, suppression annulable)
 * est celui de `registre.js`, partagé avec les achats. Cette vue apporte ses
 * colonnes et ses aides à la saisie :
 *  - client en autocomplétion : clients connus d'abord (les plus récemment
 *    encaissés), recherche d'un SIRET dans l'annuaire, nouveau client ajouté
 *    au carnet ;
 *  - libellé en autocomplétion : ceux du client d'abord ; en choisir un
 *    propose son montant et sa catégorie ;
 *  - suggestion du prochain numéro de facture (série reconnue) ;
 *  - montant toléré sous toutes ses écritures (« 12,5 » devient 12,50) ;
 *  - avertissement non bloquant si une recette très similaire existe déjà ;
 *  - duplication d'une recette (paiements récurrents), datée d'aujourd'hui ;
 *  - catégorie vente / prestation demandée quand l'activité est mixte, avec
 *    reclassement groupé via la sélection multiple ;
 *  - facture en PDF, déposée dans le panneau ou sur la ligne ;
 *  - signalement des anomalies de numérotation des factures, un numéro
 *    normal (facture annulée) pouvant être ignoré.
 */

import { api, urlPiece } from '../api.js';
import { etat, modifierParametres } from '../etat.js';
import {
  echapperHtml, toast, formaterChampMontant, effacerErreursFormulaire, afficherErreursFormulaire,
  installerChampMontant, champMontant, optionsCodes, selecteur, accorder, monogramme,
  siretLisible, resultatSiret, finDuFondu, deplierHauteur, replierPuisRetirer, listeEntreprises, entrepriseEnLigne, annuaireInjoignable
} from '../ui.js';
import { annoncer, bandeauRetour, brancherSegmentes } from '../retours.js';
import { icone } from '../icones.js';
import { etatFiltres } from '../preferences-vues.js';
import { enregistrerAction } from '../historique.js';
import { installerRegistre, cadrePanneau, suivreModeDuTiers, saisieEnSerie, bandeSerie, enregistrerHorsRegistre } from '../registre.js';
import { ouvrirPanneau } from '../panneau.js';
import { autocompletion, surligner, eclairer } from '../autocompletion.js';
import { zoneDepot } from '../pieces.js';
import { champDate, brancherChampDate } from '../calendrier.js';
import { formaterMontant, analyserMontant, enCentimes } from '/partage/montants.js';
import { formaterDate, aujourdHuiIso } from '/partage/dates.js';
import { modesDansLOrdre, CATEGORIES_RECETTE, libelleMode, libelleCategorieCourt } from '/partage/constantes.js';
import { normaliserTexte } from '/partage/texte.js';
import { chercherSimilaire } from '/partage/doublons.js';
import { analyserNumerotation, suggererNumeroSuivant, MOTIF_NUMERO } from '/partage/factures.js';
import { filtrerRecettes } from '/partage/filtres.js';

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

/** De quoi enregistrer une recette hors du registre (voir `enregistrerHorsRegistre`). */
const REGISTRE_RECETTES = {
  id: 'recettes',
  cle: 'recette',
  ajoutee: 'Ajoutée',
  creer: async (champs) => (await api.creerRecette(champs)).recette,
  supprimer: (ids) => api.supprimerRecettes(ids),
  restaurer: (lignes) => api.restaurerRecettes(lignes)
};

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

/** Détail des anomalies de numérotation déplié, d'une visite à l'autre (en mémoire seulement). */
let avisOuvert = false;

/** Pastille de catégorie d'une recette (activité mixte). */
const pastilleCategorie = (code) => (code
  ? `<span class="categorie ${code === 'ventes' ? 'vente' : ''}"><i></i>${echapperHtml(libelleCategorieCourt(code))}</span>`
  : '<span class="attenue">Non catégorisée</span>');

export async function vueRecettes(conteneur, params) {
  const { devise, formatDate, modesPersonnalises } = etat.parametres;
  const estMixte = etat.parametres.typeActivite === 'mixte';
  // Le panneau de saisie et ses aides, branchés sur le registre de la page.
  const saisie = preparerSaisie({
    toutes: () => registre.toutes(),
    enregistrerSaisie: (...args) => registre.enregistrerSaisie(...args)
  });
  const { ouvrirFormulaire } = saisie;

  conteneur.innerHTML = `
    <div class="page">
      <header class="entete-page">
        <div>
          <h1>Recettes</h1>
          <p class="sous-titre">Le registre chronologique de vos encaissements.</p>
        </div>
        <div class="actions">
          <a class="btn btn-fantome" href="#/import">${icone('import', { taille: 16 })}Importer</a>
          <a class="btn btn-fantome" id="lien-exporter" href="#/exports?registre=recettes">${icone('telecharger', { taille: 16 })}Exporter</a>
          <button type="button" class="btn btn-principal" id="nouvelle-recette" aria-haspopup="dialog" data-touche="n" aria-keyshortcuts="N">${icone('plus', { taille: 16 })}Nouvelle recette<kbd aria-hidden="true">N</kbd></button>
        </div>
      </header>
      <section class="carte" id="registre" aria-label="Livre des recettes"></section>
    </div>`;

  const registre = installerRegistre(conteneur.querySelector('#registre'), {
    id: 'recettes',
    nom: { singulier: 'recette', pluriel: 'recettes', feminin: true, nouveau: 'Nouvelle recette', cle: 'recette' },
    etat: etatFiltres('recettes'),
    cleDate: 'dateEncaissement',
    cleTiers: 'client',
    colonneRetour: 'libelle',
    quoiPiece: 'la facture',
    placeholder: 'Client, libellé, facture, montant…',
    titreDupliquer: 'Dupliquer (paiement récurrent)',
    avecCategorie: estMixte,
    lienExporter: conteneur.querySelector('#lien-exporter'),
    filtrer: filtrerRecettes,
    clesTri: CLES_TRI,
    colonnes: [
      { cle: 'date', titre: 'Encaissé le', cellule: (r) => `<td class="date">${echapperHtml(formaterDate(r.dateEncaissement, formatDate))}</td>` },
      { cle: 'client', titre: 'Client', cellule: (r) => `<td class="client"><span class="nom-tiers">${echapperHtml(r.client)}</span></td>` },
      { cle: 'libelle', titre: 'Libellé', cellule: (r) => `<td class="libelle">${r.libelle
        ? `<span class="texte-libelle" title="${echapperHtml(r.libelle)}">${echapperHtml(r.libelle)}</span>`
        : '<span class="attenue">Sans libellé</span>'}</td>` },
      { cle: 'facture', titre: 'Facture', avecPiece: true, cellule: (r) => `<td class="col-piece-hote">${r.numeroFacture ? `<span class="ref">${echapperHtml(r.numeroFacture)}</span>` : '<span class="attenue">Sans facture</span>'}</td>` },
      { cle: 'mode', titre: 'Paiement', cellule: (r) => `<td class="mode">${echapperHtml(libelleMode(r.modeReglement, modesPersonnalises))}</td>` },
      ...(estMixte ? [{ cle: 'categorie', titre: 'Catégorie', cellule: (r) => `<td>${pastilleCategorie(r.categorie)}</td>` }] : []),
      { cle: 'montant', titre: 'Montant', classe: 'montant', cellule: (r) => `<td class="montant">${echapperHtml(formaterMontant(r.montant, devise))}</td>` }
    ],
    lister: async () => (await api.listerRecettes()).recettes,
    creer: async (champs) => (await api.creerRecette(champs)).recette,
    modifier: async (id, champs) => (await api.modifierRecette(id, champs)).recette,
    supprimer: async (ids) => (await api.supprimerRecettes(ids)).recettes,
    restaurer: (lignes) => api.restaurerRecettes(lignes),
    champs: champsRecette,
    ouvrirFormulaire,
    actionsLot: estMixte ? [
      { code: 'prestations', libelle: 'Classer en prestations' },
      { code: 'ventes', libelle: 'Classer en ventes' }
    ] : [],
    appliquerLot: reclasser,
    // L'aperçu d'un client au survol mène à sa fiche, s'il est au carnet.
    lienTiers: (nomClient) => {
      const cle = normaliserTexte(nomClient);
      const client = saisie.clients().find((c) => normaliserTexte(c.nom) === cle);
      return client ? `#/clients?client=${encodeURIComponent(client.id)}` : null;
    },
    apresChargement: (recettes) => {
      saisie.apresChargement(recettes);
      rendreAnomalies(recettes);
    }
  });

  // ---- Reclassement groupé (activité mixte) : vente ou prestation -----------------
  async function reclasser(categorie, lignes) {
    const cibles = lignes.filter((r) => r.categorie !== categorie);
    const nomCategorie = categorie === 'ventes' ? 'ventes' : 'prestations';
    if (cibles.length === 0) return { texte: `Déjà classées en ${nomCategorie}` };
    // Un seul aller-retour et une seule écriture pour tout le lot.
    const avant = cibles.map((r) => ({ id: r.id, ...champsRecette(r) }));
    const apres = avant.map((r) => ({ ...r, categorie }));
    await api.modifierRecettes(apres);
    const action = enregistrerAction({
      annuler: () => api.modifierRecettes(avant),
      retablir: () => api.modifierRecettes(apres)
    });
    return { texte: `${accorder(cibles.length, 'recette classée', 'recettes classées')} en ${nomCategorie}`, action };
  }

  // ---- Anomalies de numérotation -----------------------------------------------
  /**
   * Les anomalies se signalent par une pastille au bout de la barre d'outils
   * (« Numérotation : 1 numéro manquant ») ; le détail se déplie dessous à la
   * demande, et le registre glisse au lieu de sauter. `forcer` passe outre un
   * retour encore affiché (celui qu'on annule, et qui se replie).
   */
  function rendreAnomalies(recettes, { forcer = false } = {}) {
    const zone = registre.zoneAvis;
    const avis = avisAnomalies(recettes);
    majSignal(avis);
    // Un retour « ne sera plus signalé » en cours d'affichage garde sa place.
    if (!forcer && zone.querySelector(':scope > .bandeau-retour')) return;
    const ancien = zone.querySelector(':scope > .avis');
    if (!avis || !avisOuvert) {
      replierPuisRetirer(ancien);
    } else if (ancien) {
      ancien.outerHTML = avis.html;
    } else {
      zone.insertAdjacentHTML('beforeend', avis.html);
      deplierHauteur(zone.lastElementChild);
    }
  }

  /** La pastille de la barre d'outils, ou rien quand tout est en ordre. */
  function majSignal(avis) {
    registre.zoneSignal.innerHTML = avis
      ? `<button type="button" class="pastille-signal" data-basculer-avis aria-expanded="${avisOuvert}" aria-controls="avis-numerotation">
          ${icone('cercle-alerte', { taille: 15 })}<span>Numérotation : ${avis.resume}</span>${icone('chevron-bas', { taille: 14, classe: 'chevron' })}</button>`
      : '';
  }

  registre.zoneSignal.addEventListener('click', (evenement) => {
    if (!evenement.target.closest('[data-basculer-avis]')) return;
    avisOuvert = !avisOuvert;
    rendreAnomalies(registre.toutes(), { forcer: true });
  });

  /** L'avis des anomalies de numérotation (`{ resume, html }`), ou `null` s'il n'y a rien à signaler. */
  function avisAnomalies(recettes) {
    if (!etat.parametres.alertesNumerotation) return null;
    const { doublons, manquants } = analyserNumerotation(recettes, {
      ignores: etat.parametres.numerosIgnores ?? []
    });
    if (doublons.length === 0 && manquants.length === 0) return null;
    // Chaque numéro signalé porte son « ne plus signaler », entre parenthèses.
    const ignorer = (numero) => `(<button type="button" class="lien-bouton" data-ignorer="${echapperHtml(numero)}"
      aria-label="Ne plus signaler ${echapperHtml(numero)}">ne plus signaler</button>)`;
    const signale = (numero) => `<span class="numero-signale">« ${echapperHtml(numero)} » ${ignorer(numero)}</span>`;
    const nbManquants = manquants.reduce((n, g) => n + g.numeros.length, 0);
    const resume = [
      doublons.length > 0 ? accorder(doublons.length, 'numéro en double', 'numéros en double') : '',
      nbManquants > 0 ? accorder(nbManquants, 'numéro manquant', 'numéros manquants') : ''
    ].filter(Boolean).join(', ');
    // Peu de numéros manquants : chacun se montre dans sa suite, avec ses deux
    // réponses (saisir la recette, ou dire que la facture a été annulée).
    const tousManquants = manquants.flatMap((g) => g.numeros);
    const enSuite = tousManquants.length <= 3 ? tousManquants : [];
    // Des phrases, pas une liste : un seul signalement tient sur la ligne du titre.
    const phrases = [
      ...doublons.map((d) => `« ${echapperHtml(d.numero)} » est utilisé par ${d.occurrences} recettes ${ignorer(d.numero)}.`),
      ...(enSuite.length ? [] : manquants.map((g) => {
        const affiches = g.numeros.slice(0, 8).map(signale).join(', ');
        const reste = g.numeros.length > 8 ? ` et ${g.numeros.length - 8} autres` : '';
        return `Il semble manquer ${affiches}${reste}.`;
      }))
    ];
    const titre = '<strong>Numérotation des factures :</strong>';
    const suites = enSuite.map((numero) => suiteNumero(numero, recettes)).join('');

    return {
      resume,
      html: `
      <div class="avis avis-numerotation" id="avis-numerotation" role="status">
        ${icone('cercle-alerte', { taille: 17 })}
        <div>
          ${phrases.length === 0
            ? `<p>${titre} ${enSuite.length > 1 ? `il manque ${enSuite.length} numéros dans la suite de vos factures.` : 'il manque un numéro dans la suite de vos factures.'}</p>`
            : phrases.length === 1 && !suites
              ? `<p>${titre} ${phrases[0].replace(/^Il/, 'il')}</p>`
              : `<p>${titre} ${resume}.</p>${phrases.map((p) => `<p>${p}</p>`).join('')}`}
          ${suites}
          ${phrases.length ? '<p class="aide-avis">Facture annulée, ou réglée en plusieurs fois ? « Ne plus signaler » retire l’alerte, ici comme dans le contrôle avant export.</p>' : ''}
        </div>
      </div>`
    };
  }

  /**
   * Un numéro manquant dans sa suite : les numéros voisins en frise, le trou
   * en pointillés à sa place, les recettes qui l'encadrent, et deux réponses.
   */
  function suiteNumero(numero, recettes) {
    const decoupe = MOTIF_NUMERO.exec(numero);
    if (!decoupe) return '';
    const [, prefixe, chiffres] = decoupe;
    const valeur = Number.parseInt(chiffres, 10);
    const cle = normaliserTexte(prefixe);
    const serie = new Map();
    for (const r of recettes) {
      const d = MOTIF_NUMERO.exec(String(r.numeroFacture ?? '').trim());
      if (!d || normaliserTexte(d[1]) !== cle) continue;
      const v = Number.parseInt(d[2], 10);
      if (!serie.has(v)) serie.set(v, { valeur: v, chiffres: d[2], numero: r.numeroFacture.trim(), date: r.dateEncaissement });
    }
    const avant = [...serie.values()].filter((x) => x.valeur < valeur).sort((a, b) => b.valeur - a.valeur);
    const apres = [...serie.values()].filter((x) => x.valeur > valeur).sort((a, b) => a.valeur - b.valeur);
    const frise = [...avant.slice(0, 2).reverse().map((x) => ({ texte: x.chiffres })), { texte: chiffres, trou: true },
      ...apres.slice(0, 2).map((x) => ({ texte: x.chiffres }))];
    const date = (x) => formaterDate(x.date, formatDate);
    const entre = avant[0] && apres[0]
      ? `entre la recette du ${date(avant[0])} (${echapperHtml(avant[0].numero)}) et celle du ${date(apres[0])} (${echapperHtml(apres[0].numero)})`
      : '';
    return `<div class="suite-manquante">
        <div class="suite-numeros" aria-hidden="true">${frise.map((n) => `<span class="suite-numero${n.trou ? ' trou' : ''}">${echapperHtml(n.texte)}</span>`).join('<i class="suite-trait"></i>')}</div>
        <p>La facture <strong>${echapperHtml(numero)}</strong> devrait se trouver ${entre || 'dans cette suite'}.</p>
        <div class="actions-suite">
          <button type="button" class="btn btn-petit" data-saisir-numero="${echapperHtml(numero)}">${icone('plus', { taille: 15 })}Saisir la recette ${echapperHtml(numero)}</button>
          <button type="button" class="btn btn-petit btn-fantome" data-ignorer="${echapperHtml(numero)}"
            aria-label="La facture ${echapperHtml(numero)} a été annulée : ne plus la signaler">La facture a été annulée</button>
        </div>
      </div>`;
  }

  // Un numéro signalé à tort est déclaré normal d'un clic ; le retour posé
  // à sa place permet de revenir sur ce choix, les paramètres aussi.
  registre.zoneAvis.addEventListener('click', async (evenement) => {
    const saisir = evenement.target.closest('[data-saisir-numero]');
    if (saisir) {
      ouvrirFormulaire(null, null, { numero: saisir.dataset.saisirNumero });
      return;
    }
    const bouton = evenement.target.closest('[data-ignorer]');
    if (!bouton) return;
    const numero = bouton.dataset.ignorer;
    const avant = etat.parametres.numerosIgnores ?? [];
    bouton.disabled = true;
    try {
      await enregistrerNumerosIgnores([...avant, numero]);
      majSignal(avisAnomalies(registre.toutes()));
      const zone = registre.zoneAvis;
      // L'avis se replie pendant que le retour se déplie à sa place.
      replierPuisRetirer(zone.querySelector(':scope > .avis'));
      bandeauRetour(zone, `« ${numero} » ne sera plus signalé`, async () => {
        try {
          await enregistrerNumerosIgnores(avant);
          rendreAnomalies(registre.toutes(), { forcer: true });
        } catch (erreur) {
          toast(erreur.message, 'erreur');
        }
      });
      // Le reste des anomalies revient une fois le retour lu.
      setTimeout(() => { if (!zone.querySelector('.bandeau-retour')) rendreAnomalies(registre.toutes()); }, 7400);
    } catch (erreur) {
      bouton.disabled = false;
      toast(erreur.message, 'erreur');
    }
  });

  function enregistrerNumerosIgnores(numeros) {
    return modifierParametres({ numerosIgnores: numeros });
  }

  conteneur.querySelector('#nouvelle-recette').addEventListener('click', () => ouvrirFormulaire());
  await Promise.all([saisie.chargerClients(), registre.charger()]);

  // Arrivée depuis « Nouvelle recette » du tableau de bord : le panneau
  // s'ouvre une fois la page arrivée, son voile gagne alors aussi le menu.
  // Depuis une recette qui revient chaque mois : le panneau part de la
  // dernière, datée d'aujourd'hui.
  const modele = params?.get('modele') && registre.toutes().find((r) => r.id === params.get('modele'));
  if (params?.get('nouvelle') || modele) {
    const bouton = conteneur.querySelector('#nouvelle-recette');
    // Depuis la fiche d'un client : la saisie part de son nom.
    const client = params?.get('client') ?? '';
    finDuFondu().then(() => { if (bouton.isConnected) ouvrirFormulaire(null, modele || null, { client }); });
  }
  // Depuis la recherche dans tout le livre, ou ajoutée sur une autre page : la
  // recette, mise en avant dès le premier dessin (attendre la fin du fondu
  // faisait apparaître la page puis, un temps après, la ligne et son retour).
  if (params?.get('voir')) registre.montrer(params.get('voir'));
}

// ---- Panneau de saisie ----------------------------------------------------------------

/**
 * Le panneau de saisie d'une recette et ses aides (client, libellé, montant,
 * numéro suivant, doublon, série), branché sur une source : le registre de la
 * page Recettes, ou le livre lu à part quand la saisie s'ouvre depuis une
 * autre page (voir `ouvrirNouvelleRecette`).
 *
 * @param {{ toutes: () => object[], enregistrerSaisie: Function }} livre
 */
function preparerSaisie(livre) {
  const { devise, formatDate, modesPersonnalises } = etat.parametres;
  const modes = modesDansLOrdre(modesPersonnalises, etat.parametres.ordreModes);
  const estMixte = etat.parametres.typeActivite === 'mixte';
  let clients = [];            // carnet de clients
  let proposes = [];           // clients proposés à la saisie, les plus récents d'abord
  let recettesRecentes = [];   // recettes de la plus récente à la plus ancienne

  // ---- Sources d'autocomplétion ---------------------------------------------------
  /**
   * Clients proposés : ceux du carnet et ceux déjà présents dans le livre, les
   * plus récemment encaissés d'abord, chacun avec son SIRET et son nombre
   * d'encaissements. Calculé une fois par chargement, pas à chaque frappe.
   */
  function calculerProposes() {
    const parNom = new Map();
    for (const r of recettesRecentes) {
      const cle = normaliserTexte(r.client);
      const entree = parNom.get(cle);
      if (entree) entree.nombre += 1;
      else parNom.set(cle, { nom: r.client, siret: '', nombre: 1, derniere: r });
    }
    for (const c of clients) {
      const cle = normaliserTexte(c.nom);
      const entree = parNom.get(cle);
      if (entree) Object.assign(entree, { nom: c.nom, siret: c.siret ?? '' });
      else parNom.set(cle, { nom: c.nom, siret: c.siret ?? '', nombre: 0, derniere: null });
    }
    proposes = [...parNom.values()].sort((a, b) =>
      (b.derniere?.dateEncaissement ?? '').localeCompare(a.derniere?.dateEncaissement ?? '') ||
      a.nom.localeCompare(b.nom, 'fr'));
  }

  /** Libellés déjà utilisés, le plus récent de chacun ; ceux du client saisi passent devant. */
  function libellesProposes(client) {
    const cleClient = normaliserTexte(client);
    const vus = new Map();
    for (const r of recettesRecentes) {
      if (!r.libelle) continue;
      const cle = normaliserTexte(r.libelle);
      const duClient = cleClient !== '' && normaliserTexte(r.client) === cleClient;
      const connu = vus.get(cle);
      if (!connu || (duClient && !connu.duClient)) vus.set(cle, { recette: r, duClient });
    }
    return [...vus.values()].sort((a, b) => Number(b.duClient) - Number(a.duClient));
  }

  async function chargerClients() {
    clients = (await api.listerClients()).clients;
    calculerProposes();
  }

  // ---- Panneau de saisie ------------------------------------------------------------

  /** Catégorie proposée à une nouvelle recette : celle de la dernière saisie, sinon la première. */
  const categorieParDefaut = () => [...livre.toutes()]
    .filter((r) => r.categorie)
    .sort((a, b) => String(b.creeLe ?? '').localeCompare(String(a.creeLe ?? '')))[0]?.categorie ??
    CATEGORIES_RECETTE[0].code;

  /**
   * Ouvre le panneau : vide (ajout), prérempli pour modification, ou prérempli
   * depuis un `modele` (duplication, datée d'aujourd'hui, sans facture ni PDF).
   */
  function ouvrirFormulaire(recette = null, modele = null, { numero = '', client: clientPropose = '' } = {}) {
    const source = recette ?? modele;
    // En activité mixte, une nouvelle recette part d'une catégorie déjà
    // choisie (celle de la dernière saisie), ce qui montre d'emblée que le
    // choix existe. Tant que l'utilisateur n'y a pas touché, un libellé
    // suggéré peut encore la changer.
    let categorie = source?.categorie ?? (estMixte ? categorieParDefaut() : '');
    let categorieChoisie = Boolean(source?.categorie);
    let piece = recette?.pieceJointe ?? null;
    let siretResolu = null;    // { nom, siret } trouvé dans l'annuaire pour la saisie en cours
    let saisieAvertie = '';    // saisie pour laquelle « recette similaire » a été montré

    // Le montant ouvre le panneau : c'est l'information qui compte le plus, et
    // la plus risquée à mal taper. Il est relu en clair dessous.
    const corps = `
      ${champMontant('Montant encaissé', devise)}
      <div class="champ" data-champ="client" style="--i:1">
        <label for="f-client">Client</label>
        <input class="champ-texte" id="f-client" name="client" autocomplete="off"
          placeholder="Nom du client, ou SIRET pour un nouveau" aria-describedby="f-client-aide">
        <p class="aide-champ" id="f-client-aide"></p>
        <div id="f-client-annuaire" aria-live="polite" hidden></div>
        <span class="erreur-champ message-erreur"></span>
      </div>
      <div class="champ" data-champ="libelle" style="--i:2">
        <label for="f-libelle">Libellé <span class="facultatif">(recommandé pour le registre)</span></label>
        <input class="champ-texte" id="f-libelle" name="libelle" autocomplete="off" placeholder="Prestation, vente…">
        <span class="erreur-champ message-erreur"></span>
      </div>
      <div class="deux-champs" style="--i:3">
        <div class="champ" data-champ="dateEncaissement">
          <label for="f-date">Encaissé le</label>
          ${champDate({ id: 'f-date', nom: 'dateEncaissement', format: formatDate })}
          <span class="erreur-champ message-erreur"></span>
        </div>
        <div class="champ" data-champ="modeReglement">
          <label for="f-mode">Paiement</label>
          ${selecteur({ id: 'f-mode', nom: 'modeReglement', options: optionsCodes(modes) })}
          <span class="erreur-champ message-erreur"></span>
        </div>
      </div>
      ${estMixte ? `
      <div class="champ" data-champ="categorie" style="--i:4">
        <span class="etiquette" id="f-categorie-etiquette">Catégorie</span>
        <div class="segmente" role="group" aria-labelledby="f-categorie-etiquette">
          ${CATEGORIES_RECETTE.map((c) => `<button type="button" data-categorie="${c.code}" aria-pressed="false">
            <i class="${c.code === 'ventes' ? 'seg-vente' : 'seg-prestation'}"></i>${echapperHtml(c.libelle)}</button>`).join('')}
        </div>
        <span class="erreur-champ message-erreur"></span>
      </div>` : ''}
      <div class="champ" data-champ="numeroFacture" style="--i:5">
        <label for="f-facture">N° de facture</label>
        <input class="champ-texte" id="f-facture" name="numeroFacture" autocomplete="off" placeholder="FAC-2026-001">
        <button type="button" class="suggestion" id="f-suggestion-facture" hidden></button>
        <span class="erreur-champ message-erreur"></span>
      </div>
      <div class="champ" style="--i:6">
        <span class="etiquette">Facture en PDF <span class="facultatif">(facultatif)</span></span>
        <div class="zone-piece" id="f-piece"></div>
      </div>
      <div class="avertissement" id="f-similaire" role="status" hidden></div>`;

    let panneau = null;
    const lireEtat = () => {
      const f = panneau?.element.querySelector('form');
      if (!f) return '';
      return JSON.stringify([f.client.value, f.libelle.value, f.montant.value, f.dateEncaissement.value,
        f.modeReglement.value, f.numeroFacture.value, categorie, piece?.name ?? piece?.id ?? '']);
    };
    panneau = ouvrirPanneau(cadrePanneau({
      titre: recette ? 'Modifier la recette' : 'Nouvelle recette',
      sousTitre: modele ? 'Copie d’un paiement récurrent, datée d’aujourd’hui.'
        : numero ? `La recette de la facture ${numero}, qui manquait dans la suite.` : 'Un encaissement reçu, à sa date de réception.',
      corps,
      libelleBouton: recette ? 'Enregistrer' : 'Ajouter la recette',
      enchainer: recette ? '' : 'Ajouter et en saisir une autre'
    }), { idTitre: 'titre-panneau', lireEtat });

    const racine = panneau.element;
    const f = racine.querySelector('form');
    const aide = racine.querySelector('#f-client-aide');
    const suggestionFacture = racine.querySelector('#f-suggestion-facture');
    const avertissement = racine.querySelector('#f-similaire');
    // Le libellé du bouton se cherche à chaque fois : « Ajoutée » (une recette
    // enchaînée) remplace son contenu le temps de la confirmer.
    const libelleParDefaut = recette ? 'Enregistrer' : 'Ajouter la recette';
    const libellerBouton = (texte) => { const s = f.querySelector('[type="submit"] span'); if (s) s.textContent = texte; };

    // ---- Remplissage
    f.client.value = source?.client ?? clientPropose;
    f.libelle.value = source?.libelle ?? '';
    f.montant.value = source ? formaterChampMontant(source.montant) : '';
    f.dateEncaissement.value = recette?.dateEncaissement ?? aujourdHuiIso();
    f.modeReglement.value = source?.modeReglement ?? 'virement';
    // Depuis un numéro manquant de la suite : la recette qui lui manquait.
    f.numeroFacture.value = recette?.numeroFacture ?? numero;
    brancherChampDate(racine.querySelector('.champ-date'), { format: formatDate });
    installerChampMontant(f, { devise, verbe: 'encaissés' });
    brancherSegmentes(racine);

    const choisirCategorie = (code) => {
      categorie = code;
      racine.querySelectorAll('[data-categorie]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.categorie === code)));
    };
    if (estMixte) {
      choisirCategorie(categorie);
      const champCategorie = f.querySelector('[data-champ="categorie"]');
      racine.querySelectorAll('[data-categorie]').forEach((b) => b.addEventListener('click', () => {
        categorieChoisie = true;
        choisirCategorie(b.dataset.categorie);
        champCategorie.classList.remove('invalide');
        champCategorie.querySelector('.erreur-champ').textContent = '';
      }));
    }

    // Prochain numéro de facture, pour une nouvelle recette : un clic le reprend.
    let suggestion = recette ? null : suggererNumeroSuivant(livre.toutes());
    const majSuggestion = () => {
      suggestionFacture.hidden = !suggestion || f.numeroFacture.value.trim() !== '';
      if (suggestion) suggestionFacture.textContent = `Utiliser ${suggestion}, le numéro suivant`;
    };
    majSuggestion();
    suggestionFacture.addEventListener('click', () => {
      f.numeroFacture.value = suggestion;
      eclairer(f.numeroFacture);
      majSuggestion();
    });
    f.numeroFacture.addEventListener('input', majSuggestion);

    /** Remplit un champ vide avec une valeur proposée, et le fait savoir d'un éclat. */
    const proposer = (champ, valeur) => {
      if (champ.value.trim()) return;
      champ.value = valeur;
      // Prévient les écouteurs du champ (le montant relu en clair, par exemple).
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      eclairer(champ);
    };

    // ---- Mode de paiement : celui que le client emploie d'habitude, tant que
    // l'utilisateur ne l'a pas changé lui-même.
    const modePaiement = suivreModeDuTiers(f.modeReglement, {
      modes,
      deja: Boolean(source),
      modeDe: (nom) => proposes.find((c) => normaliserTexte(c.nom) === normaliserTexte(nom))?.derniere?.modeReglement
    });

    // ---- Autocomplétion du client
    const dire = (html, type = '') => { aide.className = `aide-champ ${type}`.trim(); aide.innerHTML = html; };
    const zoneAnnuaire = racine.querySelector('#f-client-annuaire');
    const fermerAnnuaire = () => { zoneAnnuaire.hidden = true; zoneAnnuaire.innerHTML = ''; };
    f.client.addEventListener('input', (evenement) => {
      if (!evenement.isTrusted) return;
      siretResolu = null;
      dire('');
      fermerAnnuaire();
    });
    // Un client tapé en entier, sans passer par la liste, compte aussi.
    f.client.addEventListener('change', () => modePaiement.proposer(f.client.value));
    // Un client proposé (depuis sa fiche) : son paiement habituel suit.
    if (clientPropose && !source) modePaiement.proposer(clientPropose);
    autocompletion(f.client, {
      source: () => proposes,
      texte: (c) => c.nom,
      // Rangées en deux groupes : vos clients, puis ce qu'on peut ajouter. Chaque
      // client dit son dernier encaissement, et le paiement qui sera repris.
      groupes: { trouves: 'Vos clients', extra: 'Ajouter' },
      rendu: (c, saisie) => `${monogramme(c.nom, { petit: true })}
        <span class="sugg-texte"><strong>${surligner(c.nom, saisie)}</strong>
          <span>${c.nombre > 0
            ? `${accorder(c.nombre, 'encaissement')}, le dernier le ${echapperHtml(formaterDate(c.derniere.dateEncaissement, formatDate))}`
            : c.siret ? `SIRET ${siretLisible(c.siret)}, aucun encaissement` : 'aucun encaissement'}</span></span>
        ${c.derniere ? `<span class="sugg-meta discret" title="Paiement repris à la saisie">${echapperHtml(libelleMode(c.derniere.modeReglement, modesPersonnalises))}</span>` : ''}`,
      extra: (saisie, trouves) => {
        const chiffres = saisie.replace(/\s/g, '');
        if (estIdentifiant(chiffres)) {
          return {
            extra: true,
            rendu: `<span class="tuile petit">${icone('recherche', { taille: 15 })}</span><span class="sugg-texte">
              <strong>Rechercher le ${chiffres.length === 14 ? 'SIRET' : 'SIREN'} ${siretLisible(chiffres)}</strong><span>dans l’annuaire public des entreprises</span></span>`,
            action: () => chercherSiret(chiffres)
          };
        }
        const exact = trouves.some((c) => normaliserTexte(c.nom) === normaliserTexte(saisie));
        if (!saisie.trim() || exact) return null;
        const nouveau = {
          extra: true,
          rendu: `<span class="tuile petit">${icone('client-plus', { taille: 15 })}</span><span class="sugg-texte">
            <strong>Nouveau client « ${echapperHtml(saisie.trim())} »</strong><span>sera ajouté à vos clients</span></span>`,
          action: () => {
            dire(`${icone('client-plus', { taille: 14 })}<span>Nouveau client : sera ajouté à vos clients</span>`, 'ok');
            f.libelle.focus();
          }
        };
        // Une entreprise : son nom exact, son SIRET et son adresse viennent de l'annuaire.
        if (saisie.trim().length < 3) return nouveau;
        return [nouveau, {
          extra: true,
          rendu: `<span class="tuile petit">${icone('recherche', { taille: 15 })}</span><span class="sugg-texte">
            <strong>Rechercher « ${echapperHtml(saisie.trim())} » dans l’annuaire</strong><span>nom exact, SIRET et adresse de l’entreprise</span></span>`,
          action: () => chercherNom(saisie.trim())
        }];
      },
      surChoix: (c) => {
        if (c.derniere) {
          dire(`${icone('historique', { taille: 14 })}<span>Dernier encaissement le ${echapperHtml(formaterDate(c.derniere.dateEncaissement, formatDate))}${c.derniere.libelle ? ` : ${echapperHtml(c.derniere.libelle)}` : ''}</span>`);
        }
        modePaiement.proposer(c.nom);
        f.libelle.focus();
      }
    });

    /**
     * Une entreprise choisie dans l'annuaire devient le client de la recette :
     * son nom exact, son SIRET, et son adresse rappelée pour vérifier.
     */
    function retenirEntreprise(entreprise, chiffres = '') {
      siretResolu = { nom: entreprise.nom, siret: entreprise.siret || (chiffres.length === 14 ? chiffres : '') };
      f.client.value = entreprise.nom;
      eclairer(f.client);
      modePaiement.proposer(entreprise.nom);
      const connu = proposes.some((c) => normaliserTexte(c.nom) === normaliserTexte(entreprise.nom));
      resultatSiret(aide, { nom: entreprise.nom, texte: `${entrepriseEnLigne(entreprise)} : ${connu ? 'déjà dans vos clients' : 'sera ajouté à vos clients'}` });
      f.libelle.focus();
    }

    /** Un SIREN ou un SIRET : le nom exact vient de l'annuaire des entreprises. */
    async function chercherSiret(chiffres) {
      fermerAnnuaire();
      resultatSiret(aide);
      try {
        const { entreprise } = await api.rechercherSiret(chiffres);
        retenirEntreprise(entreprise, chiffres);
      } catch (erreur) {
        siretResolu = null;
        resultatSiret(aide, { erreur: erreur.message });
      }
    }

    /** Un nom : les entreprises qui le portent, à vérifier (SIRET, adresse) avant d'en choisir une. */
    async function chercherNom(nom) {
      fermerAnnuaire();
      resultatSiret(aide);
      try {
        const resultat = await api.rechercherEntreprises(nom);
        dire('');
        listeEntreprises(zoneAnnuaire, resultat, (entreprise) => {
          fermerAnnuaire();
          retenirEntreprise(entreprise);
        });
      } catch (erreur) {
        // Service injoignable : une fiche le dit, avec quoi faire en attendant.
        if (erreur.statut === 502) {
          dire('');
          annuaireInjoignable(zoneAnnuaire, nom, () => chercherNom(nom));
          return;
        }
        resultatSiret(aide, { erreur: erreur.message });
      }
    }

    // ---- Autocomplétion du libellé : son montant et sa catégorie suivent
    autocompletion(f.libelle, {
      source: () => libellesProposes(f.client.value),
      texte: (l) => l.recette.libelle,
      rendu: (l, saisie) => `<span class="sugg-texte"><strong>${surligner(l.recette.libelle, saisie)}</strong>
          <span>${l.duClient ? 'Déjà facturé à ce client' : echapperHtml(l.recette.client)}</span></span>
        <span class="sugg-meta">${echapperHtml(formaterMontant(l.recette.montant, devise))}${estMixte && l.recette.categorie ? `<small>${echapperHtml(libelleCategorieCourt(l.recette.categorie))}</small>` : ''}</span>`,
      surChoix: (l) => {
        proposer(f.montant, formaterChampMontant(l.recette.montant));
        if (estMixte && l.recette.categorie && !categorieChoisie) choisirCategorie(l.recette.categorie);
        f.montant.focus();
        f.montant.select();
      }
    });

    // ---- Pièce jointe
    const depot = zoneDepot(racine.querySelector('#f-piece'), piece, (p) => { piece = p; }, {
      quoi: 'la facture',
      // Tout le panneau reçoit le PDF déposé.
      surface: racine,
      apercu: () => ({
        url: urlPiece('recettes', recette.id),
        details: [recette.client, formaterMontant(recette.montant, devise), formaterDate(recette.dateEncaissement, formatDate)].join(', ')
      })
    });

    // ---- Enregistrement
    /**
     * Détermine le client à enregistrer : son nom exact, son SIRET, s'il est
     * déjà au carnet (`dansCarnet`) et s'il était déjà connu du livre
     * (`connu`). Lève `{ champ, message }` si la saisie est incomplète.
     */
    async function resoudreClient() {
      const saisie = f.client.value.trim();
      if (!saisie) throw { champ: 'client', message: 'Indiquez le client.' };
      const meme = (a, b) => normaliserTexte(a) === normaliserTexte(b);
      const decrireClient = (nom, siret) => {
        const connu = proposes.find((c) => meme(c.nom, nom) || (siret && c.siret === siret));
        const nomFinal = connu?.nom ?? nom;
        return {
          nom: nomFinal,
          siret: connu?.siret || siret,
          connu: Boolean(connu),
          dansCarnet: clients.some((c) => meme(c.nom, nomFinal) || (siret && c.siret === siret))
        };
      };

      const chiffres = saisie.replace(/\s/g, '');
      if (!estIdentifiant(chiffres)) {
        return decrireClient(saisie, siretResolu && meme(siretResolu.nom, saisie) ? siretResolu.siret : '');
      }
      // Un SIREN ou SIRET saisi sans passer par la suggestion : on récupère le nom exact.
      let entreprise;
      try {
        entreprise = (await api.rechercherSiret(chiffres)).entreprise;
      } catch (erreur) {
        // Sans réseau, ou sur un nom fait de chiffres, la recherche échoue :
        // l'enregistrement doit rester possible, pas s'arrêter net.
        throw {
          champ: 'client',
          message: `Nom introuvable pour « ${saisie} » (${erreur.message}). Vérifiez le numéro, ou saisissez le nom du client en toutes lettres.`
        };
      }
      return decrireClient(entreprise.nom, entreprise.siret || (chiffres.length === 14 ? chiffres : ''));
    }

    /** Ajoute le client au carnet ; un doublon (409) est sans gravité. */
    async function ajouterAuCarnet({ nom, siret }) {
      try {
        await api.creerClient({ nom, siret });
      } catch (erreur) {
        if (erreur.statut !== 409) toast(`Recette enregistrée, mais le client n’a pas rejoint le carnet : ${erreur.message}`, 'erreur');
      }
    }

    // ---- Saisie en série : Ctrl+Entrée (ou le lien du pied) ajoute la recette
    // et laisse le panneau ouvert, prêt pour la suivante, à la même date.
    const enSerieDemandee = saisieEnSerie(f, racine, !recette);
    // La série en cours, comptée au pied du panneau.
    const serie = recette ? null : bandeSerie(racine, { nom: { singulier: 'recette', pluriel: 'recettes' }, devise });

    /** Remet le panneau à zéro pour la recette suivante ; la date, le paiement et la catégorie restent. */
    function recommencer() {
      for (const champ of [f.client, f.libelle, f.montant, f.numeroFacture]) champ.value = '';
      f.montant.dispatchEvent(new Event('input', { bubbles: true }));
      effacerErreursFormulaire(f);
      dire('');
      fermerAnnuaire();
      siretResolu = null;
      saisieAvertie = '';
      avertissement.hidden = true;
      libellerBouton(libelleParDefaut);
      categorieChoisie = false;
      modePaiement.oublier();
      depot.vider();
      suggestion = suggererNumeroSuivant(livre.toutes());
      majSuggestion();
      panneau.memoriser();
      racine.querySelector('.panneau-corps').scrollTop = 0;
      f.client.focus();
      annoncer('Recette suivante');
    }

    f.addEventListener('submit', async (evenement) => {
      evenement.preventDefault();
      const enSerie = enSerieDemandee();
      effacerErreursFormulaire(f);

      // Activité mixte : la catégorie est exigée à la saisie.
      if (estMixte && !categorie) {
        afficherErreursFormulaire(f, { categorie: 'Précisez s’il s’agit d’une vente ou d’une prestation.' });
        return;
      }

      let client;
      try {
        client = await resoudreClient();
      } catch (erreur) {
        if (erreur.champ) return afficherErreursFormulaire(f, { [erreur.champ]: erreur.message });
        throw erreur;
      }

      const saisie = {
        dateEncaissement: f.dateEncaissement.value,
        client: client.nom,
        libelle: f.libelle.value,
        numeroFacture: f.numeroFacture.value,
        montant: f.montant.value,
        modeReglement: f.modeReglement.value,
        // Hors activité mixte, la catégorie n'est pas demandée : celle de la
        // ligne d'origine est conservée telle quelle.
        categorie
      };

      // Avertissement non bloquant : une recette très similaire existe déjà.
      // L'accord porte sur la saisie exacte qui a été avertie : changer le
      // montant ou la date rouvre la question, au lieu de passer en silence.
      const signature = JSON.stringify(saisie);
      if (!recette && saisieAvertie !== signature && etat.parametres.alerteRecetteSimilaire) {
        const montant = analyserMontant(saisie.montant);
        const similaire = montant === null ? null : chercherSimilaire({ ...saisie, montant }, livre.toutes());
        if (similaire) {
          saisieAvertie = signature;
          avertissement.hidden = false;
          // Les deux recettes côte à côte : ce qui diffère se voit d'un coup d'œil.
          const valeur = (v) => (v ? echapperHtml(v) : '<span class="attenue">-</span>');
          const lignes = [
            ['Client', saisie.client, similaire.client],
            ['Montant', formaterMontant(montant, devise), formaterMontant(similaire.montant, devise)],
            ['Encaissé le', formaterDate(saisie.dateEncaissement, formatDate), formaterDate(similaire.dateEncaissement, formatDate)],
            ['Libellé', saisie.libelle.trim(), similaire.libelle],
            ['N° de facture', saisie.numeroFacture.trim(), similaire.numeroFacture]
          ];
          avertissement.innerHTML = `
            <p class="doublon-titre">${icone('cercle-alerte', { taille: 16 })}<span>Une recette très similaire existe déjà${similaire.numeroFacture ? `, facture ${echapperHtml(similaire.numeroFacture)}` : ''}.</span></p>
            <table class="doublon-table">
              <thead><tr><th></th><th>Cette saisie</th><th>Déjà au livre</th></tr></thead>
              <tbody>${lignes.map(([libelle, a, b]) => {
                const differe = normaliserTexte(String(a ?? '')) !== normaliserTexte(String(b ?? ''));
                return `<tr class="${differe ? 'differe' : ''}"><th scope="row">${libelle}</th><td>${valeur(a)}</td><td>${valeur(b)}</td></tr>`;
              }).join('')}</tbody>
            </table>
            <p class="doublon-aide">S’il s’agit bien d’un autre encaissement, enregistrez-le quand même.</p>`;
          libellerBouton('Enregistrer quand même');
          avertissement.scrollIntoView({ block: 'nearest' });
          return;
        }
      }

      // L'enregistrement part : « Enregistrer quand même » a servi, le bouton
      // reprend son libellé (celui que « Ajoutée » lui rendra ensuite).
      libellerBouton(libelleParDefaut);
      const enregistree = await livre.enregistrerSaisie(recette, saisie, {
        panneau,
        piece,
        texteRetour: client.connu ? undefined : 'Ajoutée, nouveau client',
        // De l'argent qui rentre : une création se fête.
        celebrer: true,
        enchainer: enSerie,
        apres: async () => {
          if (!client.dansCarnet) await ajouterAuCarnet(client);
          await chargerClients();
        }
      });
      if (enregistree && enSerie) {
        serie?.ajouter(client.nom, analyserMontant(saisie.montant));
        recommencer();
      }
    });

    panneau.memoriser();
    // En modification, on va droit au montant ; une nouvelle saisie laisse le
    // panneau prendre le focus, pour que les suggestions n'arrivent qu'au clic.
    if (recette) {
      f.montant.focus();
      f.montant.select();
    }
    annoncer(recette ? 'Modification de la recette' : 'Nouvelle recette');
  }

  return {
    ouvrirFormulaire,
    chargerClients,
    clients: () => clients,
    /** Le livre vient d'être lu : les propositions de la saisie suivent. */
    apresChargement(recettes) {
      recettesRecentes = [...recettes].sort((a, b) => b.dateEncaissement.localeCompare(a.dateEncaissement));
      calculerProposes();
    }
  };
}

/**
 * « Nouvelle recette » depuis une autre page que les Recettes (tableau de
 * bord, fiche d'un client, recherche…) : le panneau s'ouvre sur place, sans
 * changer de page. Une fois la recette ajoutée, on arrive sur le registre,
 * la nouvelle ligne mise en avant. En série (Ctrl+Entrée), le panneau reste
 * ouvert et la page en cours se met à jour.
 *
 * @param {{ modele?: string|null, client?: string }} [options] `modele` :
 *   identifiant d'une recette à dupliquer ; `client` : nom proposé.
 */
export async function ouvrirNouvelleRecette({ modele = null, client = '' } = {}) {
  let liste = [];
  const saisie = preparerSaisie({
    toutes: () => liste,
    enregistrerSaisie: (recette, champs, options) => enregistrerHorsRegistre(REGISTRE_RECETTES, champs, options, (ligne) => {
      liste = [...liste, ligne];
      saisie.apresChargement(liste);
    })
  });
  // Les recettes et le carnet de clients arrivent ensemble.
  const [{ recettes }] = await Promise.all([api.listerRecettes(), saisie.chargerClients()]);
  liste = recettes;
  saisie.apresChargement(liste);
  saisie.ouvrirFormulaire(null, liste.find((r) => r.id === modele) ?? null, { client });
}
