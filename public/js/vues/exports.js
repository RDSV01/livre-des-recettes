/**
 * Vue « Exports ».
 *
 * Deux natures de documents s'y côtoient, à ne pas confondre :
 *  - les deux registres légaux (recettes, achats), aux colonnes imposées, en
 *    PDF, Excel et CSV : ce qu'on présente en cas de contrôle ;
 *  - le rapport annuel de gestion, en PDF, qui n'a aucune valeur légale et
 *    s'adresse au dirigeant qui veut lire son année.
 *
 * Chaque téléchargement passe d'abord par une vérification affichée à l'écran
 * (voir `controle-export.js`).
 */

import { api, urlExport, urlRapportAnnuel } from '../api.js';
import { registreAchatsUtile } from '../etat.js';
import { icone } from '../icones.js';
import { infobulle, toast, echapperHtml, optionsAnnees, OPTIONS_MOIS } from '../ui.js';
import { controlerAvantExport } from '../controle-export.js';
import { titrePeriode } from '/partage/dates.js';

/** Sélecteurs de période et boutons de format d'un registre légal. */
function carteRegistre({ id, titre, colonnes, annees }) {
  return `
    <div class="carte" id="carte-${id}">
      <h2>${titre}</h2>
      <p class="resume-filtre">${colonnes}</p>
      ${/* Trois formats, trois usages : le dire évite de lire la hiérarchie
            des boutons comme un jugement sur les deux autres. */ ''}
      <p class="indication-formats">Le PDF est le document à présenter en cas de contrôle.
      Excel et CSV servent à retravailler les mêmes lignes dans un tableur.</p>
      <div class="barre-outils">
        <div class="champ">
          <label for="${id}-annee">Année</label>
          <select id="${id}-annee">${optionsAnnees(annees)}</select>
        </div>
        <div class="champ">
          <label for="${id}-mois">Mois</label>
          <select id="${id}-mois">
            <option value="">Année complète</option>
            ${OPTIONS_MOIS}
          </select>
        </div>
        <button type="button" class="btn btn-primaire" data-registre="${id}" data-format="pdf">${icone('fichier-pdf', { taille: 16 })}<span>PDF</span></button>
        <button type="button" class="btn btn-secondaire" data-registre="${id}" data-format="xlsx">${icone('fichier-tableur', { taille: 16 })}<span>Excel (.xlsx)</span></button>
        <button type="button" class="btn btn-secondaire" data-registre="${id}" data-format="csv">${icone('tableau', { taille: 16 })}<span>CSV</span></button>
      </div>
    </div>`;
}

/**
 * Arrivée depuis le bouton « Exporter » d'un registre
 * (`#/exports?registre=achats&annee=2026&mois=7`) : la carte de ce registre
 * reprend la période filtrée à l'écran et vient sous les yeux. Une valeur
 * absente des listes est ignorée, la carte garde alors son choix par défaut.
 */
function preselectionner(conteneur, params) {
  const registre = params?.get('registre');
  const carte = registre ? conteneur.querySelector(`#carte-${registre}`) : null;
  if (!carte) return;
  const choisir = (select, valeur) => {
    if (valeur && [...select.options].some((o) => o.value === valeur)) select.value = valeur;
  };
  choisir(carte.querySelector(`#${registre}-annee`), params.get('annee'));
  choisir(carte.querySelector(`#${registre}-mois`), params.get('mois'));
  // Après la mise en place de la page, qui ramène le focus en haut.
  setTimeout(() => carte.scrollIntoView({ block: 'nearest' }), 0);
}

export async function vueExports(conteneur, params) {
  const anneeCourante = new Date().getFullYear();
  const avecAchats = registreAchatsUtile();
  const [recettes, achats] = await Promise.all([
    api.listerAnnees(),
    avecAchats ? api.listerAnneesAchats() : { annees: [] }
  ]);
  const anneesRecettes = recettes.annees.length > 0 ? recettes.annees : [anneeCourante];
  const anneesAchats = achats.annees.length > 0 ? achats.annees : [anneeCourante];

  conteneur.innerHTML = `
    <header class="entete-vue">
      <div>
        <h1>Exports${infobulle(
          'Besoin de savoir quel montant déclarer ? L’onglet « URSSAF » calcule le chiffre ' +
          'd’affaires encaissé par mois, trimestre ou année.',
          'les exports'
        )}</h1>
        <p>Des registres conformes, prêts à présenter en cas de contrôle.</p>
      </div>
    </header>

    ${carteRegistre({
      id: 'recettes',
      titre: 'Exporter le livre des recettes',
      colonnes: 'Colonnes du registre légal : date de réception du paiement, client, montant, ' +
        'mode de règlement, numéro de facture, libellé. Totaux mensuels et annuel inclus.',
      annees: anneesRecettes
    })}

    ${avecAchats ? carteRegistre({
      id: 'achats',
      titre: 'Exporter le registre des achats',
      colonnes: 'Colonnes du registre légal : date du règlement, fournisseur, référence de la ' +
        'facture ou du justificatif, mode de paiement, montant de l’achat. Totaux mensuels et annuel inclus.',
      annees: anneesAchats
    }) : ''}

    <div class="carte">
      <h2>Rapport annuel de gestion</h2>
      <p class="resume-filtre">
        Chiffre d’affaires et sa répartition, panier moyen,
        évolution mois par mois, moyens de paiement, meilleurs clients, puis le détail de chaque
        encaissement. Les deux registres ci-dessus restent les seuls documents légaux.
      </p>
      <div class="barre-outils">
        <div class="champ">
          <label for="rapport-annee">Année</label>
          <select id="rapport-annee">${optionsAnnees(anneesRecettes)}</select>
        </div>
        <button type="button" class="btn btn-primaire" id="telecharger-rapport">
          ${icone('fichier-pdf', { taille: 16 })}<span>Rapport annuel (PDF)</span>
        </button>
      </div>
    </div>

    ${/* Le téléchargement part dans le navigateur, hors de l'application : sans
          cette trace, la vérification se terminait sur un écran inchangé. */ ''}
    <p class="note-legale" id="dernier-export" hidden></p>`;

  preselectionner(conteneur, params);

  const trace = conteneur.querySelector('#dernier-export');

  /** Vérifie devant l'utilisateur, puis déclenche le téléchargement s'il confirme. */
  const telecharger = async ({ titre, periode, registre, url, format }) => {
    const confirme = await controlerAvantExport({
      titre,
      periodeLisible: titrePeriode(periode),
      periode,
      registre
    });
    if (!confirme) return;
    window.location.href = url;

    // Le fichier atterrit dans le dossier de téléchargements du navigateur :
    // l'application dit au moins ce qu'elle vient d'envoyer, et quand.
    const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const nom = `${titre} · ${titrePeriode(periode)}${format ? ` (${format.toUpperCase()})` : ''}`;
    trace.hidden = false;
    trace.innerHTML = `${icone('cercle-valide', { taille: 16 })}
      <span>Téléchargement lancé à ${heure} : <strong>${echapperHtml(nom)}</strong>.
      Le fichier arrive dans le dossier de téléchargements de votre navigateur.</span>`;
    toast('Téléchargement lancé.');
  };

  conteneur.querySelectorAll('[data-format]').forEach((bouton) => {
    bouton.addEventListener('click', () => {
      const id = bouton.dataset.registre;
      const registre = id === 'achats' ? '/achats' : '';
      const periode = {
        annee: conteneur.querySelector(`#${id}-annee`).value,
        mois: conteneur.querySelector(`#${id}-mois`).value
      };
      telecharger({
        titre: id === 'achats' ? 'Registre des achats' : 'Livre des recettes',
        periode,
        registre,
        format: bouton.dataset.format,
        url: urlExport(bouton.dataset.format, periode, registre)
      });
    });
  });

  conteneur.querySelector('#telecharger-rapport').addEventListener('click', () => {
    // Le rapport est bâti sur les recettes de l'année : c'est ce registre que
    // le contrôle passe en revue.
    const annee = conteneur.querySelector('#rapport-annee').value;
    telecharger({
      titre: 'Rapport annuel de gestion',
      periode: { annee },
      registre: '',
      format: 'pdf',
      url: urlRapportAnnuel(annee)
    });
  });
}
