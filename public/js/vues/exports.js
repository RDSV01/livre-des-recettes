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
import { infobulle } from '../ui.js';
import { controlerAvantExport } from '../controle-export.js';
import { NOMS_MOIS } from '/partage/dates.js';

const OPTIONS_MOIS = NOMS_MOIS.map((nom, i) => `<option value="${i + 1}">${nom}</option>`).join('');

/** Liste d'options d'années, la plus récente en premier. */
const optionsAnnees = (annees) => annees.map((a) => `<option value="${a}">${a}</option>`).join('');

/** Sélecteurs de période et boutons de format d'un registre légal. */
function carteRegistre({ id, titre, colonnes, annees }) {
  return `
    <div class="carte">
      <h2>${titre}</h2>
      <p class="resume-filtre">${colonnes}</p>
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

export async function vueExports(conteneur) {
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

    `;

  /** Nomme la période choisie : « Année 2026 » ou « Mars 2026 ». */
  const periodeLisible = ({ annee, mois }) => {
    if (!mois) return `Année ${annee}`;
    const nom = NOMS_MOIS[Number(mois) - 1];
    return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${annee}`;
  };

  /** Vérifie devant l'utilisateur, puis déclenche le téléchargement s'il confirme. */
  const telecharger = async ({ titre, periode, registre, url }) => {
    const confirme = await controlerAvantExport({
      titre,
      periodeLisible: periodeLisible(periode),
      periode,
      registre
    });
    if (confirme) window.location.href = url;
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
      url: urlRapportAnnuel(annee)
    });
  });
}
