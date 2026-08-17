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
      </div>
      ${/* Le bilan se recalcule au moindre changement de période. Le bouton
            « Calculer » était le plus proéminent de la page et ne faisait
            jamais rien de nouveau : le calcul était déjà à l'écran. */ ''}
      <p class="indication">Le montant à déclarer se met à jour dès que vous changez de période.</p>

      <div id="resultat-urssaf" aria-live="polite"></div>
    </div>`;

  const refs = {
    annee: conteneur.querySelector('#urssaf-annee'),
    type: conteneur.querySelector('#urssaf-type'),
    valeur: conteneur.querySelector('#urssaf-valeur'),
    conteneurValeur: conteneur.querySelector('#conteneur-urssaf-valeur'),
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
  // Copie d'un montant à reporter : le nombre nu, sans devise ni séparateur.
  refs.resultat.addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('[data-copier-montant]');
    if (!bouton) return;
    try {
      await navigator.clipboard.writeText(bouton.dataset.copierMontant);
      toast('Montant copié dans le presse-papiers.');
    } catch {
      toast('Copie impossible : sélectionnez le montant à la main.', 'erreur');
    }
  });

  refs.type.addEventListener('change', () => {
    rafraichirValeurs();
    calculer();
  });
  refs.annee.addEventListener('change', () => calculer());
  refs.valeur.addEventListener('change', () => calculer());
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
      /**
       * Bouton de copie d'un montant à reporter.
       *
       * Le geste réel de cette page est de recopier un nombre dans le
       * formulaire de l'URSSAF : ce qui part au presse-papiers est donc le
       * nombre nu, sans symbole de devise ni espace de milliers, prêt à être
       * collé dans un champ qui n'accepte rien d'autre.
       */
      const boutonCopier = (montant, quoi, { compact = false } = {}) => `
        <button type="button" class="${compact ? 'btn-icone' : 'btn btn-secondaire'}"
          data-copier-montant="${montant}"
          title="Copier ${echapperHtml(quoi)}"
          aria-label="Copier ${echapperHtml(quoi)}, sans symbole de devise">
          ${icone('copier', { taille: 16 })}${compact ? '' : '<span>Copier</span>'}
        </button>`;

      /** Une ligne de ventilation : intitulé, montant à reporter, copie. */
      const ligneVentilation = (etiquette, montant, exact) => `
        <div class="ligne-ventilation">
          <span class="intitule-ventilation">${echapperHtml(etiquette)}</span>
          ${exact !== montant ? `
            <span class="montant-exact">encaissé : ${echapperHtml(formaterMontant(exact, devise))}</span>` : ''}
          <strong class="montant-ventilation">${echapperHtml(formaterMontantEntier(montant, devise))}</strong>
          ${boutonCopier(montant, `le montant des ${etiquette}`, { compact: true })}
        </div>`;

      const { formatDate } = etat.parametres;

      refs.resultat.innerHTML = `
        <div class="resultat-bilan">
          ${/* La réponse à la question de la page, en toutes lettres et une
                seule fois : la période est nommée dans l'intitulé plutôt que
                glissée entre parenthèses, et le montant se lit sans concurrent. */ ''}
          <p class="etiquette-declaration">
            Chiffre d’affaires à déclarer${estMixte ? ' (total)' : ''}
            <span class="periode-declaration">${echapperHtml(bilan.libellePeriode)}</span>
          </p>
          <div class="ligne-declaration">
            <strong class="montant-declaration">${echapperHtml(formaterMontantEntier(bilan.aDeclarer, devise))}</strong>
            ${boutonCopier(bilan.aDeclarer, 'le montant à déclarer')}
          </div>
          ${bilan.chiffreAffaires !== bilan.aDeclarer ? `
            <p class="montant-exact">Encaissé exactement : ${echapperHtml(formaterMontant(bilan.chiffreAffaires, devise))}.
            La déclaration se fait en euros entiers.</p>` : ''}
          <p class="compte-encaissements">
            ${bilan.nombreEncaissements} encaissement${bilan.nombreEncaissements > 1 ? 's' : ''} sur la période.
          </p>

          ${estMixte ? `
            ${/* En activité mixte, ce ne sont pas ces deux lignes qui étayent le
                  total : ce sont elles que le formulaire de l'URSSAF réclame,
                  chacune dans sa case. Elles ont donc leur propre copie. */ ''}
            <section class="ventilation">
              <h3>À reporter case par case</h3>
              ${ligneVentilation('ventes de marchandises', bilan.ventes.aDeclarer, bilan.ventes.chiffreAffaires)}
              ${ligneVentilation('prestations de services', bilan.prestations.aDeclarer, bilan.prestations.chiffreAffaires)}
            </section>` : ''}

          ${estMixte && bilan.nonCategorise.nombreEncaissements > 0 ? `
            <p class="note-legale">
              ${icone('cercle-alerte', { taille: 16 })}
              <span>${bilan.nonCategorise.nombreEncaissements} recette${bilan.nonCategorise.nombreEncaissements > 1 ? 's' : ''}
              sans catégorie (${echapperHtml(formaterMontant(bilan.nonCategorise.chiffreAffaires, devise))}) :
              modifiez-les pour une ventilation exacte entre ventes et prestations.</span>
            </p>` : ''}

          ${blocCotisations(bilan.cotisations, devise, formatDate)}
        </div>`;
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
  }

  await calculer(); // premier affichage : dernière période échue
}
