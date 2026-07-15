/**
 * Vue « URSSAF » : bilan d'une période (mois, trimestre ou année) pour savoir
 * quel chiffre d'affaires déclarer. Simple calcul local, aucune connexion.
 */

import { api } from '../api.js';
import { etat } from '../etat.js';
import { echapperHtml, toast } from '../ui.js';
import { icone } from '../icones.js';
import { formaterMontant } from '/partage/montants.js';
import { NOMS_MOIS } from '/partage/dates.js';

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
      <h2>Choisir la période</h2>
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

      <p class="note-legale">
        ${icone('info', { taille: 16 })}
        <span>Ces montants vous aident à remplir votre déclaration sur autoentrepreneur.urssaf.fr.
        Aucune donnée n’est transmise.</span>
      </p>
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
      refs.resultat.innerHTML = `
        <div class="resultat-bilan">
          <div class="carte-stat principale">
            <div class="pastille">${icone('billet', { taille: 22 })}</div>
            <div>
              <div class="etiquette">CA encaissé (${echapperHtml(bilan.libellePeriode)})</div>
              <div class="valeur">${echapperHtml(formaterMontant(bilan.chiffreAffaires, etat.parametres.devise))}</div>
            </div>
          </div>
          <div class="carte-stat">
            <div class="pastille">${icone('diese', { taille: 22 })}</div>
            <div>
              <div class="etiquette">Encaissements</div>
              <div class="valeur">${bilan.nombreEncaissements}</div>
            </div>
          </div>
        </div>`;
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
  }

  refs.bouton.addEventListener('click', calculer);
  calculer(); // premier affichage : mois courant
}
