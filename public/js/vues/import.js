/**
 * Vue « Import CSV » en trois étapes :
 *  1. choix du fichier (clic ou glisser-déposer) ;
 *  2. correspondance des colonnes du fichier avec les champs du livre ;
 *  3. analyse (simulation côté serveur : validation + doublons) puis import.
 */

import { api } from '../api.js';
import { etat } from '../etat.js';
import { echapperHtml, toast } from '../ui.js';
import { icone } from '../icones.js';
import { analyserCsv, lireFichierCsv } from '../csv.js';
import { analyserDateSouple } from '/partage/dates.js';
import { normaliserTexte } from '/partage/texte.js';

/**
 * Champs du livre pouvant être alimentés par le fichier.
 * `indices` sert à deviner la colonne à partir de son en-tête.
 * La cible « catégorie » n'est proposée qu'aux activités mixtes.
 */
const CIBLES = [
  { cle: 'dateEncaissement', libelle: 'Date d’encaissement *', indices: ['date', 'encaissement'] },
  { cle: 'client', libelle: 'Client *', indices: ['client', 'nom'] },
  { cle: 'montant', libelle: 'Montant *', indices: ['montant', 'prix', 'somme', 'total', 'ttc'] },
  { cle: 'libelle', libelle: 'Libellé', indices: ['libelle', 'description', 'objet', 'designation'] },
  { cle: 'modeReglement', libelle: 'Mode de règlement', indices: ['mode', 'paiement', 'reglement'] },
  { cle: 'numeroFacture', libelle: 'Numéro de facture', indices: ['facture', 'reference'] },
  { cle: 'categorie', libelle: 'Catégorie (vente / prestation)', indices: ['categorie'] }
];
const CIBLES_OBLIGATOIRES = ['dateEncaissement', 'client', 'montant'];

/** Convertit une catégorie en texte libre vers un code du livre. */
function devinerCategorie(texte) {
  const t = normaliserTexte(texte);
  if (t.includes('vente') || t.includes('march')) return 'ventes';
  if (t.includes('prest') || t.includes('service')) return 'prestations';
  return '';
}

/**
 * Convertit un mode de règlement en texte libre vers un code du livre.
 * Un libellé identique à un mode personnalisé de l'utilisateur est reconnu,
 * puis les modes par défaut sont devinés par mots-clés.
 */
function devinerMode(texte, modesPersonnalises) {
  const t = normaliserTexte(texte);
  if (!t) return 'autre';
  const perso = modesPersonnalises.find((m) => normaliserTexte(m.libelle) === t);
  if (perso) return perso.code;
  if (t.includes('vir')) return 'virement';
  if (t.includes('carte') || t === 'cb' || t.includes('bancaire')) return 'carte';
  if (t.includes('esp') || t.includes('cash') || t.includes('liquide')) return 'especes';
  if (t.includes('cheq') || t.includes('chq')) return 'cheque';
  if (t.includes('paypal')) return 'paypal';
  if (t.includes('stripe')) return 'stripe';
  return 'autre';
}

export async function vueImport(conteneur) {
  const estMixte = etat.parametres.typeActivite === 'mixte';
  const cibles = CIBLES.filter((c) => c.cle !== 'categorie' || estMixte);
  let donneesCsv = null; // { entetes, lignes }
  let nomFichier = '';

  conteneur.innerHTML = `
    <header class="entete-vue">
      <div>
        <h1>Import CSV</h1>
        <p>Reprenez l’historique tenu dans un tableur : rien n’est importé sans votre confirmation.</p>
      </div>
    </header>

    <div class="carte" id="etape-fichier">
      <h2>1. Choisir le fichier</h2>
      <div class="zone-fichier" id="zone-fichier" role="button" tabindex="0">
        <div>${icone('import', { taille: 30 })}</div>
        <strong>Cliquez ici</strong> ou déposez un fichier CSV.<br>
        <span class="indication">Séparateur « ; » ou « , ». La première ligne doit contenir les en-têtes.</span>
      </div>
      <input type="file" id="champ-fichier" accept=".csv,text/csv" hidden>
    </div>

    <div class="carte" id="etape-correspondance" hidden>
      <h2>2. Faire correspondre les colonnes</h2>
      <p class="resume-filtre" id="resume-fichier"></p>
      <div class="grille-correspondance" id="grille-correspondance"></div>
      <div class="pied-dialogue" style="justify-content: flex-start;">
        <button type="button" class="btn btn-primaire" id="bouton-analyser">${icone('liste', { taille: 16 })}<span>Analyser le fichier</span></button>
      </div>
    </div>

    <div class="carte rapport-import" id="etape-rapport" hidden></div>`;

  const refs = {
    zone: conteneur.querySelector('#zone-fichier'),
    champFichier: conteneur.querySelector('#champ-fichier'),
    etapeCorrespondance: conteneur.querySelector('#etape-correspondance'),
    resumeFichier: conteneur.querySelector('#resume-fichier'),
    grille: conteneur.querySelector('#grille-correspondance'),
    boutonAnalyser: conteneur.querySelector('#bouton-analyser'),
    etapeRapport: conteneur.querySelector('#etape-rapport')
  };

  // ---- Étape 1 : fichier -------------------------------------------------------
  refs.zone.addEventListener('click', () => refs.champFichier.click());
  refs.zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') refs.champFichier.click();
  });
  refs.zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    refs.zone.classList.add('survol');
  });
  refs.zone.addEventListener('dragleave', () => refs.zone.classList.remove('survol'));
  refs.zone.addEventListener('drop', (e) => {
    e.preventDefault();
    refs.zone.classList.remove('survol');
    const fichier = e.dataTransfer.files?.[0];
    if (fichier) chargerFichier(fichier);
  });
  refs.champFichier.addEventListener('change', () => {
    const fichier = refs.champFichier.files?.[0];
    if (fichier) chargerFichier(fichier);
  });

  async function chargerFichier(fichier) {
    try {
      const texte = await lireFichierCsv(fichier);
      donneesCsv = analyserCsv(texte);
      nomFichier = fichier.name;
      if (donneesCsv.entetes.length < 2 || donneesCsv.lignes.length === 0) {
        toast('Fichier vide ou illisible : vérifiez qu’il s’agit bien d’un CSV avec en-têtes.', 'erreur');
        return;
      }
      afficherCorrespondance();
    } catch (erreur) {
      toast(`Lecture impossible : ${erreur.message}`, 'erreur');
    }
  }

  // ---- Étape 2 : correspondance ---------------------------------------------------
  function afficherCorrespondance() {
    refs.etapeRapport.hidden = true;
    refs.etapeCorrespondance.hidden = false;
    refs.resumeFichier.textContent =
      `${nomFichier} : ${donneesCsv.lignes.length} ligne${donneesCsv.lignes.length > 1 ? 's' : ''}, ` +
      `${donneesCsv.entetes.length} colonnes détectées.`;

    refs.grille.innerHTML = cibles.map((cible) => `
      <div class="champ">
        <label for="correspondance-${cible.cle}">${echapperHtml(cible.libelle)}</label>
        <select id="correspondance-${cible.cle}" data-cible="${cible.cle}">
          <option value="">(ignorer cette colonne)</option>
          ${donneesCsv.entetes.map((entete, i) =>
            `<option value="${i}" ${devinerColonne(cible) === i ? 'selected' : ''}>${echapperHtml(entete)}</option>`
          ).join('')}
        </select>
      </div>` ).join('') + (estMixte ? `
      <div class="champ">
        <label for="categorie-defaut">Catégorie par défaut (lignes sans catégorie)</label>
        <select id="categorie-defaut">
          <option value="prestations">Prestation de services</option>
          <option value="ventes">Vente de marchandises</option>
        </select>
      </div>` : '');
  }

  /** Devine l'index de colonne correspondant à une cible d'après les en-têtes. */
  function devinerColonne(cible) {
    const entetes = donneesCsv.entetes.map(normaliserTexte);
    for (const indice of cible.indices) {
      const index = entetes.findIndex((e) => e.includes(indice));
      if (index !== -1) return index;
    }
    return -1;
  }

  /** Construit les lignes à envoyer au serveur d'après la correspondance choisie. */
  function construireLignes() {
    const correspondance = {};
    refs.grille.querySelectorAll('select[data-cible]').forEach((select) => {
      if (select.value !== '') correspondance[select.dataset.cible] = Number(select.value);
    });

    const manquantes = CIBLES_OBLIGATOIRES.filter((cle) => correspondance[cle] === undefined);
    if (manquantes.length > 0) {
      toast('Colonnes obligatoires non associées : date, client et montant.', 'erreur');
      return null;
    }

    const valeur = (rangee, cle) =>
      correspondance[cle] === undefined ? '' : (rangee[correspondance[cle]] ?? '').trim();
    const categorieDefaut = estMixte
      ? refs.grille.querySelector('#categorie-defaut').value
      : '';

    return donneesCsv.lignes.map((rangee) => ({
      // Date convertie en ISO si possible ; sinon on transmet la valeur brute,
      // le serveur signalera l'erreur sur la bonne ligne.
      dateEncaissement: analyserDateSouple(valeur(rangee, 'dateEncaissement')) ?? valeur(rangee, 'dateEncaissement'),
      client: valeur(rangee, 'client'),
      montant: valeur(rangee, 'montant'),
      libelle: valeur(rangee, 'libelle'),
      modeReglement: devinerMode(valeur(rangee, 'modeReglement'), etat.parametres.modesPersonnalises),
      numeroFacture: valeur(rangee, 'numeroFacture'),
      categorie: estMixte
        ? (devinerCategorie(valeur(rangee, 'categorie')) || categorieDefaut)
        : ''
    }));
  }

  // ---- Étape 3 : analyse puis import ------------------------------------------------
  refs.boutonAnalyser.addEventListener('click', async () => {
    const lignes = construireLignes();
    if (!lignes) return;
    refs.boutonAnalyser.disabled = true;
    try {
      const rapport = await api.importerRecettes({ lignes, simulation: true });
      afficherRapport(rapport, lignes);
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    } finally {
      refs.boutonAnalyser.disabled = false;
    }
  });

  function afficherRapport(rapport, lignes) {
    refs.etapeRapport.hidden = false;
    refs.etapeRapport.innerHTML = `
      <h2>3. Vérifier puis importer</h2>
      <div class="compteurs-import">
        <div class="compteur ok"><strong>${rapport.valides}</strong> recettes prêtes à importer</div>
        <div class="compteur attention"><strong>${rapport.doublons.length}</strong> doublons détectés</div>
        <div class="compteur erreur"><strong>${rapport.erreurs.length}</strong> lignes en erreur</div>
      </div>

      ${rapport.doublons.length > 0 ? `
        <p><strong>Doublons</strong> (même date, même client, même montant qu’une recette existante) :</p>
        <ul>
          ${rapport.doublons.slice(0, 15).map((d) =>
            `<li>Ligne ${d.ligne} : ${echapperHtml(d.dateEncaissement)}, ${echapperHtml(d.client)}, ${d.montant}</li>`
          ).join('')}
          ${rapport.doublons.length > 15 ? `<li>… et ${rapport.doublons.length - 15} autres.</li>` : ''}
        </ul>
        <div class="champ" style="margin-top: 10px;">
          <label><input type="checkbox" id="importer-doublons"> Importer aussi les doublons</label>
        </div>` : ''}

      ${rapport.erreurs.length > 0 ? `
        <p><strong>Lignes en erreur</strong> (elles ne seront pas importées) :</p>
        <ul>
          ${rapport.erreurs.slice(0, 15).map((e) =>
            `<li>Ligne ${e.ligne} : ${echapperHtml(Object.values(e.erreurs).join(' '))}</li>`
          ).join('')}
          ${rapport.erreurs.length > 15 ? `<li>… et ${rapport.erreurs.length - 15} autres.</li>` : ''}
        </ul>` : ''}

      <p class="note-legale">
        ${icone('info', { taille: 16 })}
        <span>Une sauvegarde de vos données est créée automatiquement juste avant l’import :
        en cas de problème, restaurez-la depuis les paramètres.</span>
      </p>

      <div class="pied-dialogue" style="justify-content: flex-start;">
        <button type="button" class="btn btn-primaire" id="bouton-importer"
          ${rapport.valides + rapport.doublons.length === 0 ? 'disabled' : ''}>
          ${icone('import', { taille: 16 })}<span>Importer maintenant</span>
        </button>
      </div>`;

    refs.etapeRapport.querySelector('#bouton-importer')?.addEventListener('click', async (evenement) => {
      const bouton = evenement.currentTarget;
      bouton.disabled = true;
      const importerDoublons = refs.etapeRapport.querySelector('#importer-doublons')?.checked ?? false;
      // Tant que l'import est en cours, une fermeture de l'onglet demande confirmation.
      const gardeFermeture = (e) => { e.preventDefault(); };
      window.addEventListener('beforeunload', gardeFermeture);
      try {
        const resultat = await api.importerRecettes({ lignes, importerDoublons });
        toast(`${resultat.importees} recette${resultat.importees > 1 ? 's' : ''} importée${resultat.importees > 1 ? 's' : ''}.`);
        refs.etapeRapport.innerHTML = `
          <h2>Import terminé</h2>
          <p>${resultat.importees} recette${resultat.importees > 1 ? 's' : ''} ajoutée${resultat.importees > 1 ? 's' : ''} au livre.
          ${resultat.erreurs.length > 0 ? `${resultat.erreurs.length} ligne${resultat.erreurs.length > 1 ? 's' : ''} en erreur ignorée${resultat.erreurs.length > 1 ? 's' : ''}.` : ''}
          ${resultat.sauvegarde ? 'Une sauvegarde des données précédentes a été créée (voir les paramètres).' : ''}</p>
          <p><a class="btn btn-secondaire" href="#/recettes">${icone('recettes', { taille: 16 })}<span>Voir les recettes</span></a></p>`;
      } catch (erreur) {
        toast(erreur.message, 'erreur');
        bouton.disabled = false;
      } finally {
        window.removeEventListener('beforeunload', gardeFermeture);
      }
    });
  }
}
