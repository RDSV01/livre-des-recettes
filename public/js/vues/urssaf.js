/**
 * Vue « URSSAF » : bilan d'une période (mois, trimestre ou année) pour savoir
 * quel chiffre d'affaires déclarer. Simple calcul local, aucune connexion.
 */

import { api } from '../api.js';
import { etat } from '../etat.js';
import { echapperHtml, toast, infobulle } from '../ui.js';
import { icone } from '../icones.js';
import { formaterMontant, formaterMontantEntier } from '/partage/montants.js';
import { NOMS_MOIS, formaterDate } from '/partage/dates.js';

/** « 12,3 » plutôt que « 12.3 ». */
const pourcentage = (taux) => `${String(taux).replace('.', ',')} %`;

/**
 * Estimation des cotisations sociales à côté du montant à déclarer. Le détail
 * par taux est affiché : l'utilisateur voit sur quelle base et à quel taux
 * chaque part est calculée, plutôt qu'un total tombé du ciel.
 */
function blocCotisations(cotisations, devise, formatDate) {
  if (!cotisations) return '';

  // Quand un taux a changé pendant la période, la même activité revient à deux
  // taux : préciser depuis quand lève l'ambiguïté. Inutile sinon.
  const plusieursPaliers = new Set(cotisations.lignes.map((l) => l.duJour)).size > 1;
  const depuis = (l) => (plusieursPaliers
    ? ` <span class="palier-cotisation">à partir du ${echapperHtml(formaterDate(l.duJour, formatDate))}</span>`
    : '');

  // Les montants dus sont des euros entiers (arrondi légal) ; la base, elle,
  // garde ses centimes puisqu'elle vient du chiffre d'affaires encaissé.
  const lignes = cotisations.lignes.map((l) => `
    <div class="ligne-cotisation">
      <span>${echapperHtml(l.libelle)}${depuis(l)}</span>
      <span class="base-cotisation">${echapperHtml(formaterMontant(l.base, devise))} × ${pourcentage(l.taux)}</span>
      <span class="montant-cotisation">${echapperHtml(formaterMontantEntier(l.montant, devise))}</span>
    </div>`).join('');

  return `
    <section class="bloc-cotisations">
      <div class="entete-cotisations">
        <h3>Cotisations URSSAF que vous paierez :</h3>
        <strong>${echapperHtml(formaterMontantEntier(cotisations.total, devise))}</strong>
        ${infobulle(
          'Estimation des seules cotisations sociales. La contribution à la formation ' +
          'professionnelle et, si vous l’avez choisi, le versement libératoire de l’impôt sur ' +
          'le revenu s’y ajoutent. Le montant exact reste celui calculé par l’URSSAF.',
          'l’estimation des cotisations'
        )}
      </div>
      ${lignes}
      ${cotisations.horsEstimation > 0 ? `
        <p class="note-legale">
          ${icone('cercle-alerte', { taille: 16 })}
          <span>${echapperHtml(formaterMontant(cotisations.horsEstimation, devise))} ne sont pas
          comptés, faute de taux applicable : recettes sans catégorie, ou encaissées avant le
          plus ancien taux connu. Classez ces recettes en vente ou en prestation pour une
          estimation complète.</span>
        </p>` : ''}
    </section>`;
}

export async function vueUrssaf(conteneur) {
  const { annees } = await api.listerAnnees();
  const anneeCourante = new Date().getFullYear();
  const anneesProposees = annees.length > 0 ? annees : [anneeCourante];

  const optionsAnnees = anneesProposees.map((a) => `<option value="${a}">${a}</option>`).join('');
  const optionsMois = NOMS_MOIS.map((nom, i) => `<option value="${i + 1}">${nom}</option>`).join('');

  conteneur.innerHTML = `
    <header class="entete-vue">
      <div>
        <h1>Déclaration URSSAF</h1>
        <p>Le chiffre d’affaires encaissé à déclarer, pour la période de votre choix.</p>
      </div>
    </header>

    <div class="carte">
      <h2>Choisir la période à déclarer</h2>
      <div class="barre-outils">
        <div class="champ">
          <label for="urssaf-annee">Année</label>
          <select id="urssaf-annee">${optionsAnnees}</select>
        </div>
        <div class="champ">
          <label for="urssaf-type">Périodicité</label>
          <select id="urssaf-type">
            <option value="mois">Mensuelle</option>
            <option value="trimestre">Trimestrielle</option>
            <option value="annee">Annuelle</option>
          </select>
        </div>
        <div class="champ" id="conteneur-urssaf-valeur">
          <label for="urssaf-valeur">Période</label>
          <select id="urssaf-valeur"></select>
        </div>
        <button type="button" class="btn btn-primaire" id="bouton-urssaf">${icone('urssaf', { taille: 16 })}<span>Calculer</span></button>
      </div>

      <div id="resultat-urssaf"></div>
    </div>`;

  const refs = {
    annee: conteneur.querySelector('#urssaf-annee'),
    type: conteneur.querySelector('#urssaf-type'),
    valeur: conteneur.querySelector('#urssaf-valeur'),
    conteneurValeur: conteneur.querySelector('#conteneur-urssaf-valeur'),
    bouton: conteneur.querySelector('#bouton-urssaf'),
    resultat: conteneur.querySelector('#resultat-urssaf')
  };

  function rafraichirValeurs() {
    if (refs.type.value === 'annee') {
      refs.conteneurValeur.hidden = true;
      return;
    }
    refs.conteneurValeur.hidden = false;
    if (refs.type.value === 'mois') {
      refs.valeur.innerHTML = optionsMois;
      refs.valeur.value = String(new Date().getMonth() + 1);
    } else {
      refs.valeur.innerHTML = [1, 2, 3, 4]
        .map((t) => `<option value="${t}">${t}${t === 1 ? 'er' : 'e'} trimestre</option>`)
        .join('');
    }
  }
  refs.type.addEventListener('change', rafraichirValeurs);
  rafraichirValeurs();

  async function calculer() {
    try {
      const bilan = await api.bilanUrssaf({
        annee: refs.annee.value,
        type: refs.type.value,
        valeur: refs.type.value === 'annee' ? '' : refs.valeur.value
      });
      const devise = etat.parametres.devise;
      const estMixte = etat.parametres.typeActivite === 'mixte';

      // Pour une activité mixte, la déclaration distingue les ventes des
      // prestations : la ventilation est affichée en plus du total.
      const carte = (etiquette, montant, principale = false) => `
        <div class="carte-stat ${principale ? 'principale' : ''}">
          <div class="pastille">${icone('billet', { taille: 22 })}</div>
          <div>
            <div class="etiquette">${echapperHtml(etiquette)}</div>
            <div class="valeur">${echapperHtml(formaterMontant(montant, devise))}</div>
          </div>
        </div>`;

      const { formatDate } = etat.parametres;

      refs.resultat.innerHTML = `
        <div class="resultat-bilan">
          ${carte(`CA encaissé (${bilan.libellePeriode})`, bilan.chiffreAffaires, true)}
          <div class="carte-stat">
            <div class="pastille">${icone('diese', { taille: 22 })}</div>
            <div>
              <div class="etiquette">Encaissements</div>
              <div class="valeur">${bilan.nombreEncaissements}</div>
            </div>
          </div>
          ${estMixte ? `
            ${carte('dont ventes de marchandises', bilan.ventes.chiffreAffaires)}
            ${carte('dont prestations de services', bilan.prestations.chiffreAffaires)}` : ''}
        </div>
        ${estMixte && bilan.nonCategorise.nombreEncaissements > 0 ? `
          <p class="note-legale">
            ${icone('cercle-alerte', { taille: 16 })}
            <span>${bilan.nonCategorise.nombreEncaissements} recette${bilan.nonCategorise.nombreEncaissements > 1 ? 's' : ''}
            sans catégorie (${echapperHtml(formaterMontant(bilan.nonCategorise.chiffreAffaires, devise))}) :
            modifiez-les pour une ventilation exacte entre ventes et prestations.</span>
          </p>` : ''}
        ${blocCotisations(bilan.cotisations, devise, formatDate)}`;
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
  }

  refs.bouton.addEventListener('click', calculer);
  calculer(); // premier affichage : mois courant
}
