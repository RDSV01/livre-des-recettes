/**
 * Vue « URSSAF » : bilan d'une période (mois, trimestre ou année) pour savoir
 * quel chiffre d'affaires déclarer, avant quelle date, ce que l'URSSAF
 * prélèvera et ce qu'il en restera. Simple calcul local, aucune connexion.
 *
 * L'écran répond d'abord en trois chiffres (à déclarer, prélevé, reste) ; le
 * calcul qui les justifie, base par base et taux par taux, se déplie à la
 * demande. Tout afficher d'emblée noyait la seule réponse attendue.
 */

import { api } from '../api.js';
import { etat, definirParametres } from '../etat.js';
import {
  echapperHtml, toast, copierDansPressePapiers, optionsAnnees, OPTIONS_MOIS
} from '../ui.js';
import { icone } from '../icones.js';
import { formaterMontant, formaterMontantEntier } from '/partage/montants.js';
import {
  formaterDate, dernierePeriodeEchue, dateEnFrancaisLong, aujourdHuiIso,
  idPeriode, periodeDepuisId, finPeriode, echeanceDeclaration, periodeDeclaree
} from '/partage/dates.js';
import { majusculeInitiale } from '/partage/texte.js';

/** « 12,3 » plutôt que « 12.3 ». */
const pourcentage = (taux) => `${String(taux).replace('.', ',')} %`;

/**
 * Place réservée en fin de ligne, de la largeur d'un bouton de copie : les
 * lignes qui n'en ont pas alignent ainsi leurs montants sur celles qui en ont.
 */
const ESPACE_COPIE = '<span class="espace-copie" aria-hidden="true"></span>';

/**
 * Bouton de copie d'un montant à reporter.
 *
 * Le geste réel de cette page est de recopier un nombre dans le formulaire de
 * l'URSSAF : ce qui part au presse-papiers est donc le nombre nu, sans symbole
 * de devise ni espace de milliers, prêt à être collé dans un champ qui
 * n'accepte rien d'autre.
 */
const boutonCopier = (montant, quoi, { compact = false } = {}) => `
  <button type="button" class="${compact ? 'btn-icone' : 'btn btn-secondaire'}"
    data-copier-montant="${montant}"
    title="Copier ${echapperHtml(quoi)}"
    aria-label="Copier ${echapperHtml(quoi)}, sans symbole de devise">
    ${icone('copier', { taille: 16 })}${compact ? '' : '<span>Copier</span>'}
  </button>`;

/**
 * Les trois chiffres de la page : ce qu'il faut déclarer, ce que l'URSSAF
 * prélèvera, ce qu'il en restera. Le montant à déclarer domine, les deux
 * autres le suivent.
 *
 * Sans type d'activité, rien ne peut être estimé : seul le premier chiffre
 * s'affiche, avec de quoi débloquer les deux autres.
 */
function chiffresCles(bilan, devise, estMixte) {
  const c = bilan.cotisations;
  const aDeclarer = `
    <div class="chiffre-cle">
      <span class="etiquette-chiffre">À déclarer${estMixte ? ' (total)' : ''}</span>
      <div class="ligne-declaration">
        <strong class="montant-declaration">${echapperHtml(formaterMontantEntier(bilan.aDeclarer, devise))}</strong>
        ${boutonCopier(bilan.aDeclarer, 'le montant à déclarer')}
      </div>
    </div>`;

  if (!c) {
    return `
      <div class="chiffres-cles">${aDeclarer}</div>
      <p class="precision-chiffre">
        <a href="#/parametres">Indiquez votre type d’activité</a> pour estimer ce que l’URSSAF
        prélèvera et ce qu’il vous restera.
      </p>`;
  }

  return `
    <div class="chiffres-cles">
      ${aDeclarer}
      <div class="chiffre-cle">
        <span class="etiquette-chiffre">Prélevé par l’URSSAF</span>
        <strong class="montant-chiffre">${echapperHtml(formaterMontantEntier(c.totalPreleve, devise))}</strong>
        <span class="precision-chiffre">estimation</span>
      </div>
      <div class="chiffre-cle">
        <span class="etiquette-chiffre">Il vous reste</span>
        <strong class="montant-chiffre reste">${echapperHtml(formaterMontant(c.reste, devise))}</strong>
        <span class="precision-chiffre">${c.versementLiberatoire ? 'impôt sur le revenu compris' : 'avant impôt sur le revenu'}</span>
      </div>
    </div>`;
}

/**
 * Le calcul qui mène de l'encaissé au reste, replié par défaut : l'encaissé,
 * chaque prélèvement retranché (avec sa base et son taux), puis le reste.
 * Un prélèvement calculé sur plusieurs bases (activité mixte, changement de
 * taux en cours de période) montre son total puis le détail en retrait.
 *
 * Tous les prélèvements sont en euros entiers, comme l'URSSAF les arrondit ;
 * seuls l'encaissé et le reste gardent leurs centimes.
 */
function detailCalcul(bilan, devise, formatDate) {
  const c = bilan.cotisations;
  if (!c) return '';
  const entier = (m) => echapperHtml(formaterMontantEntier(m, devise));
  const auCentime = (m) => echapperHtml(formaterMontant(m, devise));

  // Quand un taux a changé pendant la période, la même activité revient à deux
  // taux : préciser depuis quand lève l'ambiguïté. Inutile sinon.
  const plusieursPaliers = new Set(c.lignes.map((l) => l.duJour)).size > 1;
  const depuis = (l) => (plusieursPaliers
    ? ` <span class="palier-cotisation">à partir du ${echapperHtml(formaterDate(l.duJour, formatDate))}</span>`
    : '');
  const calcul = (l) => `${entier(l.base)} × ${pourcentage(l.taux)}`;

  const ligne = (classe, libelle, base, montant) => `
    <div class="ligne-cotisation ${classe}">
      <span>${libelle}</span>
      <span class="base-cotisation">${base}</span>
      <span class="montant-cotisation">${montant}</span>
      ${ESPACE_COPIE}
    </div>`;

  const prelevement = (titre, { lignes, total }) => (lignes.length <= 1
    ? ligne('', titre, lignes[0] ? calcul(lignes[0]) : '', `− ${entier(total)}`)
    : ligne('groupe-cotisation', titre, '', `− ${entier(total)}`) + lignes.map((l) =>
      ligne('sous-ligne', `${echapperHtml(l.libelle)}${depuis(l)}`, calcul(l), entier(l.montant))).join(''));

  const notes = [
    bilan.chiffreAffaires !== bilan.aDeclarer
      ? `La déclaration se fait en euros entiers : ${auCentime(bilan.chiffreAffaires)} encaissés se déclarent ${entier(bilan.aDeclarer)}.`
      : '',
    // Chiffre d'affaires qu'aucun taux ne couvre, hors recettes non classées
    // (déjà signalées plus haut) : encaissements antérieurs au premier taux connu.
    c.horsEstimation > 0 && bilan.nonCategorise.nombreEncaissements === 0
      ? `${auCentime(c.horsEstimation)} encaissés avant le plus ancien taux connu ne sont pas comptés : le reste est donc trop élevé.`
      : '',
    'Estimation hors taxe pour frais de chambre consulaire et hors ACRE ; le montant exact reste celui de l’URSSAF. Les frais de votre activité ne sont pas déduits.',
    c.versementLiberatoire
      ? ''
      : 'Vous avez opté pour le versement libératoire de l’impôt ? <a href="#/parametres">Indiquez-le dans les paramètres</a>.'
  ].filter(Boolean);

  return `
    <details class="details-graphique details-calcul">
      <summary>${icone('chevron-bas', { taille: 14 })}<span>Voir le détail du calcul</span></summary>
      <div class="corps-calcul">
        ${ligne('groupe-cotisation', 'Encaissé sur la période', '', auCentime(bilan.chiffreAffaires))}
        ${prelevement('Cotisations sociales', c)}
        ${prelevement('Formation professionnelle', c.formationPro)}
        ${c.versementLiberatoire ? prelevement('Versement libératoire de l’impôt', c.versementLiberatoire) : ''}
        <div class="ligne-reste">
          <span class="intitule-reste">Il vous reste</span>
          <strong class="montant-reste">${auCentime(c.reste)}</strong>
          ${ESPACE_COPIE}
        </div>
        ${notes.map((n) => `<p class="precision-reste">${n}</p>`).join('')}
      </div>
    </details>`;
}

/**
 * Où en est la déclaration de la période affichée : en cours, à faire avant
 * telle date, en retard, ou déjà faite. Une année entière n'est pas une
 * périodicité de déclaration : rien à dire dans ce cas.
 *
 * Le bouton « Marquer comme déclarée » fait ici ce que « C'est fait » fait sur
 * le tableau de bord. Il n'est proposé que pour la périodicité choisie dans
 * les paramètres : marquer un mois quand on déclare par trimestre
 * brouillerait le rappel.
 */
function blocEcheance(periode) {
  const id = idPeriode(periode.annee, periode.type, periode.valeur);
  if (!id) return '';
  const { periodiciteUrssaf, dernierePeriodeDeclaree } = etat.parametres;
  const echeance = dateEnFrancaisLong(echeanceDeclaration(periode.annee, periode.type, periode.valeur));
  const aujourdHui = aujourdHuiIso();

  const statut = (classe, nomIcone, texte, action = '') => `
    <div class="statut-declaration ${classe}" id="statut-declaration" tabindex="-1">
      ${icone(nomIcone, { taille: 16 })}
      <span>${texte}</span>
      ${action}
    </div>`;

  if (periodeDeclaree(id, dernierePeriodeDeclaree)) {
    return statut('faite', 'cercle-valide', 'Période marquée comme déclarée.');
  }
  if (aujourdHui <= finPeriode(periode.annee, periode.type, periode.valeur)) {
    return statut('', 'calendrier',
      `Période en cours : à déclarer une fois terminée, au plus tard le ${echapperHtml(echeance)}.`);
  }

  const enRetard = aujourdHui > echeanceDeclaration(periode.annee, periode.type, periode.valeur);
  const peutMarquer = periodiciteUrssaf === '' || periodiciteUrssaf === periode.type;
  return statut(
    enRetard ? 'en-retard' : '',
    enRetard ? 'cercle-alerte' : 'calendrier',
    enRetard
      ? `Échéance dépassée : à déclarer au plus tard le ${echapperHtml(echeance)}.`
      : `À déclarer au plus tard le ${echapperHtml(echeance)}.`,
    peutMarquer ? `
      <button type="button" class="btn btn-tertiaire" id="marquer-declaree" data-periode="${id}">
        ${icone('cercle-valide', { taille: 16 })}<span>Marquer comme déclarée</span>
      </button>` : ''
  );
}

export async function vueUrssaf(conteneur) {
  const { annees } = await api.listerAnnees();
  const anneeCourante = new Date().getFullYear();
  const anneesProposees = annees.length > 0 ? annees : [anneeCourante];


  // Le bilan se recalcule au moindre changement de période : aucun bouton
  // « Calculer », le résultat est toujours celui de la période affichée.
  conteneur.innerHTML = `
    <header class="entete-vue">
      <div>
        <h1>Déclaration URSSAF</h1>
        <p>Le chiffre d’affaires encaissé à déclarer, pour la période de votre choix.</p>
      </div>
    </header>

    <div class="carte">
      <div class="barre-outils">
        <div class="champ">
          <label for="urssaf-annee">Année</label>
          <select id="urssaf-annee">${optionsAnnees(anneesProposees)}</select>
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
  const echue = periodeDepuisId(dernierePeriodeEchue(etat.parametres.periodiciteUrssaf)?.id);

  function rafraichirValeurs() {
    if (refs.type.value === 'annee') {
      refs.conteneurValeur.hidden = true;
      return;
    }
    refs.conteneurValeur.hidden = false;
    const estMois = refs.type.value === 'mois';
    refs.valeur.innerHTML = estMois
      ? OPTIONS_MOIS
      : [1, 2, 3, 4]
        .map((t) => `<option value="${t}">${t}${t === 1 ? 'er' : 'e'} trimestre</option>`)
        .join('');
    // La période échue n'est proposée que pour la périodicité qui la produit :
    // passer de mensuel à trimestriel à la main doit rester libre.
    if (echue && echue.type === refs.type.value) {
      refs.valeur.value = String(echue.valeur);
    } else if (estMois) {
      refs.valeur.value = String(new Date().getMonth() + 1);
    }
  }
  if (echue) {
    refs.type.value = echue.type;
    // Une année encore absente du registre (janvier, période de décembre) ne
    // peut pas être sélectionnée : on garde alors la plus récente proposée.
    if (anneesProposees.includes(echue.annee)) refs.annee.value = String(echue.annee);
  }

  /** La période affichée, sous forme de nombres. */
  const periodeAffichee = () => ({
    annee: Number(refs.annee.value),
    type: refs.type.value,
    valeur: refs.type.value === 'annee' ? null : Number(refs.valeur.value)
  });

  // Le détail du calcul reste déplié d'une période à l'autre, si
  // l'utilisateur l'a ouvert : il compare alors les calculs.
  let detailOuvert = false;

  refs.resultat.addEventListener('toggle', (evenement) => {
    if (evenement.target.matches('.details-calcul')) detailOuvert = evenement.target.open;
  }, true);

  refs.resultat.addEventListener('click', async (evenement) => {
    // Copie d'un montant à reporter : le nombre nu, sans devise ni séparateur.
    const copie = evenement.target.closest('[data-copier-montant]');
    if (copie) {
      await copierDansPressePapiers(copie.dataset.copierMontant, 'montant');
      return;
    }

    // Déclaration faite : mémorisée comme par « C'est fait » sur le tableau de
    // bord, ce qui éteint aussi le rappel.
    const marquer = evenement.target.closest('#marquer-declaree');
    if (marquer) {
      marquer.disabled = true;
      try {
        const reponse = await api.enregistrerParametres({
          ...etat.parametres,
          dernierePeriodeDeclaree: marquer.dataset.periode
        });
        definirParametres(reponse.parametres);
        toast('Période marquée comme déclarée.');
        await calculer();
        // Le bouton a disparu avec le rendu : le focus va au nouveau statut.
        refs.resultat.querySelector('#statut-declaration')?.focus();
      } catch (erreur) {
        marquer.disabled = false;
        toast(erreur.message, 'erreur');
      }
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
      const periode = periodeAffichee();
      const bilan = await api.bilanUrssaf({
        annee: periode.annee,
        type: periode.type,
        valeur: periode.valeur ?? ''
      });
      const { devise, formatDate } = etat.parametres;
      const estMixte = etat.parametres.typeActivite === 'mixte';

      /** Une ligne de ventilation : intitulé, montant à reporter, copie. */
      const ligneVentilation = (etiquette, montant) => `
        <div class="ligne-ventilation">
          <span class="intitule-ventilation">${echapperHtml(etiquette)}</span>
          <strong class="montant-ventilation">${echapperHtml(formaterMontantEntier(montant, devise))}</strong>
          ${boutonCopier(montant, `le montant des ${etiquette.toLowerCase()}`, { compact: true })}
        </div>`;

      const nombre = bilan.nombreEncaissements;
      refs.resultat.innerHTML = `
        <div class="resultat-bilan">
          <p class="entete-bilan">
            <strong>${echapperHtml(majusculeInitiale(bilan.libellePeriode))}</strong>
            <span>${nombre} encaissement${nombre > 1 ? 's' : ''}</span>
          </p>

          ${chiffresCles(bilan, devise, estMixte)}

          ${blocEcheance(periode)}

          ${estMixte ? `
            ${/* En activité mixte, le formulaire de l'URSSAF réclame les deux
                  montants, chacun dans sa case : ils ont leur propre copie. */ ''}
            <section class="ventilation">
              <h3>À reporter case par case</h3>
              ${ligneVentilation('Ventes de marchandises', bilan.ventes.aDeclarer)}
              ${ligneVentilation('Prestations de services', bilan.prestations.aDeclarer)}
            </section>` : ''}

          ${estMixte && bilan.nonCategorise.nombreEncaissements > 0 ? `
            <p class="note-legale">
              ${icone('cercle-alerte', { taille: 16 })}
              <span>${bilan.nonCategorise.nombreEncaissements} recette${bilan.nonCategorise.nombreEncaissements > 1 ? 's' : ''}
              sans catégorie (${echapperHtml(formaterMontant(bilan.nonCategorise.chiffreAffaires, devise))}) :
              classez-les en vente ou en prestation pour une ventilation et une estimation exactes.</span>
            </p>` : ''}

          ${detailCalcul(bilan, devise, formatDate)}
        </div>`;

      if (detailOuvert) refs.resultat.querySelector('.details-calcul')?.setAttribute('open', '');
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
  }

  await calculer(); // premier affichage : dernière période échue
}
