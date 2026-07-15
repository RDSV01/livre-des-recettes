/**
 * Vue « Exports » : téléchargement du registre (PDF, Excel, CSV) pour une
 * année complète ou un mois. Le registre respecte les colonnes légales et
 * ajoute les totaux mensuels et annuel.
 */

import { api, urlExport } from '../api.js';
import { icone } from '../icones.js';
import { NOMS_MOIS } from '/partage/dates.js';

export async function vueExports(conteneur) {
  const { annees } = await api.listerAnnees();
  const anneeCourante = new Date().getFullYear();
  const anneesProposees = annees.length > 0 ? annees : [anneeCourante];

  const optionsAnnees = anneesProposees.map((a) => `<option value="${a}">${a}</option>`).join('');
  const optionsMois = NOMS_MOIS.map((nom, i) => `<option value="${i + 1}">${nom}</option>`).join('');

  conteneur.innerHTML = `
    <header class="entete-vue">
      <div>
        <h1>Exports</h1>
        <p>Un registre conforme, prêt à présenter en cas de contrôle.</p>
      </div>
    </header>

    <div class="carte">
      <h2>Exporter le livre des recettes</h2>
      <p class="resume-filtre">
        Colonnes du registre légal : date de réception du paiement, client, montant,
        mode de règlement, numéro de facture, libellé. Totaux mensuels et annuel inclus.
      </p>
      <div class="barre-outils">
        <div class="champ">
          <label for="export-annee">Année</label>
          <select id="export-annee">${optionsAnnees}</select>
        </div>
        <div class="champ">
          <label for="export-mois">Mois</label>
          <select id="export-mois">
            <option value="">Année complète</option>
            ${optionsMois}
          </select>
        </div>
        <button type="button" class="btn btn-primaire" data-format="pdf">${icone('fichier-pdf', { taille: 16 })}<span>PDF</span></button>
        <button type="button" class="btn btn-secondaire" data-format="xlsx">${icone('fichier-tableur', { taille: 16 })}<span>Excel (.xlsx)</span></button>
        <button type="button" class="btn btn-secondaire" data-format="csv">${icone('tableau', { taille: 16 })}<span>CSV</span></button>
      </div>
      <p class="note-legale">
        ${icone('info', { taille: 16 })}
        <span>Besoin de savoir quel montant déclarer ? L’onglet « URSSAF » calcule le chiffre
        d’affaires encaissé par mois, trimestre ou année.</span>
      </p>
    </div>`;

  const selectAnnee = conteneur.querySelector('#export-annee');
  const selectMois = conteneur.querySelector('#export-mois');
  conteneur.querySelectorAll('[data-format]').forEach((bouton) => {
    bouton.addEventListener('click', () => {
      window.location.href = urlExport(bouton.dataset.format, {
        annee: selectAnnee.value,
        mois: selectMois.value
      });
    });
  });
}
