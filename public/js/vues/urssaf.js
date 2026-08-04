/**
 * Vue « URSSAF » : bilan d'une période (mois, trimestre ou année) pour savoir
 * quel chiffre d'affaires déclarer. Simple calcul local, aucune connexion.
 */

import { api } from '../api.js';
import { etat } from '../etat.js';
import { echapperHtml, toast, infobulle } from '../ui.js';
import { icone } from '../icones.js';
import { formaterMontant, formaterMontantEntier } from '/partage/montants.js';
import { NOMS_MOIS, formaterDate, dernierePeriodeEchue } from '/partage/dates.js';

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

  // Base comme montant dû sont des euros entiers : c'est sur la base arrondie
  // que l'URSSAF applique le taux, et le calcul affiché doit tomber juste.
  const lignes = cotisations.lignes.map((l) => `
    <div class="ligne-cotisation">
      <span>${echapperHtml(l.libelle)}${depuis(l)}</span>
      <span class="base-cotisation">${echapperHtml(formaterMontantEntier(l.base, devise))} × ${pourcentage(l.taux)}</span>
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

  /**
   * Période proposée au premier affichage : la dernière échue, celle que
   * l'utilisateur a justement à déclarer. Proposer le mois en cours n'aurait
   * pas de sens, il n'est pas terminé.
   */
  const echue = dernierePeriodeEchue(etat.parametres.periodiciteUrssaf);
  const parDefaut = echue
    // L'identifiant vaut « 2026-07 » ou « 2026-T2 » : l'année en préfixe, le
    // mois ou le trimestre après le tiret.
    ? {
      annee: echue.id.slice(0, 4),
      type: echue.id.includes('T') ? 'trimestre' : 'mois',
      valeur: echue.id.slice(echue.id.includes('T') ? 6 : 5).replace(/^0/, '')
    }
    : null;

  function rafraichirValeurs() {
    if (refs.type.value === 'annee') {
      refs.conteneurValeur.hidden = true;
      return;
    }
    refs.conteneurValeur.hidden = false;
    const estMois = refs.type.value === 'mois';
    refs.valeur.innerHTML = estMois
      ? optionsMois
      : [1, 2, 3, 4]
        .map((t) => `<option value="${t}">${t}${t === 1 ? 'er' : 'e'} trimestre</option>`)
        .join('');
    // La période échue n'est proposée que pour la périodicité qui la produit :
    // passer de mensuel à trimestriel à la main doit rester libre.
    if (parDefaut && parDefaut.type === refs.type.value) {
      refs.valeur.value = parDefaut.valeur;
    } else if (estMois) {
      refs.valeur.value = String(new Date().getMonth() + 1);
    }
  }
  if (parDefaut) {
    refs.type.value = parDefaut.type;
    // Une année encore absente du registre (janvier, période de décembre) ne
    // peut pas être sélectionnée : on garde alors la plus récente proposée.
    if (anneesProposees.includes(Number(parDefaut.annee))) refs.annee.value = parDefaut.annee;
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
      //
      // Les montants affichés sont ceux à reporter sur la déclaration, donc en
      // euros entiers. Le chiffre d'affaires exact, centimes compris, reste
      // rappelé dessous quand l'arrondi le fait différer : le registre, lui, ne
      // s'arrondit jamais.
      const carte = (etiquette, montant, exact, principale = false) => `
        <div class="carte-stat ${principale ? 'principale' : ''}">
          <div class="pastille">${icone('billet', { taille: 22 })}</div>
          <div>
            <div class="etiquette">${echapperHtml(etiquette)}</div>
            <div class="valeur">${echapperHtml(formaterMontantEntier(montant, devise))}</div>
            ${exact !== montant ? `
              <div class="montant-exact">encaissé : ${echapperHtml(formaterMontant(exact, devise))}</div>` : ''}
          </div>
        </div>`;

      const { formatDate } = etat.parametres;

      refs.resultat.innerHTML = `
        <div class="resultat-bilan">
          ${carte(`CA à déclarer (${bilan.libellePeriode})`, bilan.aDeclarer, bilan.chiffreAffaires, true)}
          <div class="carte-stat">
            <div class="pastille">${icone('diese', { taille: 22 })}</div>
            <div>
              <div class="etiquette">Encaissements</div>
              <div class="valeur">${bilan.nombreEncaissements}</div>
            </div>
          </div>
          ${estMixte ? `
            ${carte('dont ventes de marchandises', bilan.ventes.aDeclarer, bilan.ventes.chiffreAffaires)}
            ${carte('dont prestations de services', bilan.prestations.aDeclarer, bilan.prestations.chiffreAffaires)}` : ''}
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
