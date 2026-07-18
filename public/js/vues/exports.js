/**
 * Vue « Exports » : téléchargement des deux registres légaux (PDF, Excel,
 * CSV) pour une année complète ou un mois. Chaque registre respecte ses
 * colonnes officielles et ajoute les totaux mensuels et annuel.
 */

import { api, urlExport } from '../api.js';
import { registreAchatsUtile } from '../etat.js';
import { icone } from '../icones.js';
import { NOMS_MOIS } from '/partage/dates.js';

const OPTIONS_MOIS = NOMS_MOIS.map((nom, i) => `<option value="${i + 1}">${nom}</option>`).join('');

/** Sélecteurs de période et boutons de format d'un registre. */
function carteExport({ id, titre, colonnes, annees }) {
  const optionsAnnees = annees.map((a) => `<option value="${a}">${a}</option>`).join('');
  return `
    <div class="carte">
      <h2>${titre}</h2>
      <p class="resume-filtre">${colonnes}</p>
      <div class="barre-outils">
        <div class="champ">
          <label for="${id}-annee">Année</label>
          <select id="${id}-annee">${optionsAnnees}</select>
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
        <h1>Exports</h1>
        <p>Des registres conformes, prêts à présenter en cas de contrôle.</p>
      </div>
    </header>

    ${carteExport({
      id: 'recettes',
      titre: 'Exporter le livre des recettes',
      colonnes: 'Colonnes du registre légal : date de réception du paiement, client, montant, ' +
        'mode de règlement, numéro de facture, libellé. Totaux mensuels et annuel inclus.',
      annees: anneesRecettes
    })}

    ${avecAchats ? carteExport({
      id: 'achats',
      titre: 'Exporter le registre des achats',
      colonnes: 'Colonnes du registre légal : date du règlement, fournisseur, référence de la ' +
        'facture ou du justificatif, mode de paiement, montant de l’achat. Totaux mensuels et annuel inclus.',
      annees: anneesAchats
    }) : ''}

    <p class="note-legale">
      ${icone('info', { taille: 16 })}
      <span>Besoin de savoir quel montant déclarer ? L’onglet « URSSAF » calcule le chiffre
      d’affaires encaissé par mois, trimestre ou année.</span>
    </p>`;

  conteneur.querySelectorAll('[data-format]').forEach((bouton) => {
    bouton.addEventListener('click', () => {
      const id = bouton.dataset.registre;
      window.location.href = urlExport(bouton.dataset.format, {
        annee: conteneur.querySelector(`#${id}-annee`).value,
        mois: conteneur.querySelector(`#${id}-mois`).value
      }, id === 'achats' ? '/achats' : '');
    });
  });
}
