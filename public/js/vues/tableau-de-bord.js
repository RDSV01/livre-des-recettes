/**
 * Vue « Tableau de bord » : chiffres clés de l'année en cours et
 * dernières recettes saisies.
 */

import { api } from '../api.js';
import { etat } from '../etat.js';
import { echapperHtml } from '../ui.js';
import { icone } from '../icones.js';
import { formaterMontant } from '/partage/montants.js';
import { formaterDate, nomMois } from '/partage/dates.js';

export async function vueTableauDeBord(conteneur) {
  const stats = await api.tableauDeBord();
  const { devise, formatDate } = etat.parametres;

  const cartes = [
    { etiquette: `CA de ${nomMois(stats.mois)} ${stats.annee}`, valeur: formaterMontant(stats.caMois, devise), icone: 'billet', principale: true },
    { etiquette: `CA de l’année ${stats.annee}`, valeur: formaterMontant(stats.caAnnee, devise), icone: 'calendrier', principale: true },
    { etiquette: `Encaissements en ${stats.annee}`, valeur: String(stats.nombreEncaissements), icone: 'diese' },
    { etiquette: 'Moyenne par encaissement', valeur: formaterMontant(stats.moyenneEncaissement, devise), icone: 'tendance' }
  ];

  conteneur.innerHTML = `
    <header class="entete-vue">
      <div>
        <h1>Tableau de bord</h1>
        <p>Votre activité en un coup d’œil.</p>
      </div>
      <div class="actions-vue">
        <a class="btn btn-discret" href="#/exports">${icone('exports', { taille: 16 })}<span>Exporter le livre des recettes</span></a>
        <a class="btn btn-primaire" href="#/recettes?nouvelle=1">${icone('plus', { taille: 16 })}<span>Nouvelle recette</span></a>
      </div>
    </header>

    <section class="grille-stats">
      ${cartes.map((carte) => `
        <div class="carte-stat ${carte.principale ? 'principale' : ''}">
          <div class="pastille">${icone(carte.icone, { taille: 22 })}</div>
          <div>
            <div class="etiquette">${echapperHtml(carte.etiquette)}</div>
            <div class="valeur">${echapperHtml(carte.valeur)}</div>
          </div>
        </div>`).join('')}
    </section>

    <section class="carte">
      <h2>Dernières recettes</h2>
      ${stats.dernieresRecettes.length === 0 ? `
        <div class="etat-vide">
          <div class="grande-icone">${icone('recettes', { taille: 40 })}</div>
          Votre livre des recettes est vide pour l’instant.<br>
          <a class="btn btn-primaire" href="#/recettes?nouvelle=1">${icone('plus', { taille: 16 })}<span>Ajouter ma première recette</span></a>
        </div>` : `
        <div class="conteneur-tableau">
          <table>
            <thead>
              <tr><th>Date</th><th>Client</th><th>Libellé</th><th class="montant">Montant</th></tr>
            </thead>
            <tbody>
              ${stats.dernieresRecettes.map((r) => `
                <tr>
                  <td>${echapperHtml(formaterDate(r.dateEncaissement, formatDate))}</td>
                  <td>${echapperHtml(r.client)}</td>
                  <td>${r.libelle ? echapperHtml(r.libelle) : '<span class="attenue">-</span>'}</td>
                  <td class="montant">${echapperHtml(formaterMontant(r.montant, devise))}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="resume-filtre" style="margin-top:12px;margin-bottom:0">
          <a href="#/recettes">Voir toutes les recettes</a>
        </p>`}
    </section>`;
}
