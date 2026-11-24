/**
 * Le relevé d'un mois, ouvert sur place depuis le graphique du tableau de
 * bord : son total, sa répartition, l'écart avec le même mois de l'an passé,
 * ses recettes et celles qui attendent leur facture PDF. Les flèches (du
 * panneau ou du clavier) passent d'un mois à l'autre sans fermer ; deux
 * boutons mènent plus loin (le registre filtré, l'export du mois).
 */

import { api } from './api.js';
import { etat } from './etat.js';
import { echapperHtml, accorder, montantDetaille, monogramme, lienExport, allerA } from './ui.js';
import { icone } from './icones.js';
import { ouvrirPanneau } from './panneau.js';
import { etatFiltres } from './preferences-vues.js';
import { libelleMode } from '/partage/constantes.js';
import { formaterMontant, formaterMontantEntier, sommeMontants } from '/partage/montants.js';
import { formaterDate, nomMois } from '/partage/dates.js';
import { majusculeInitiale } from '/partage/texte.js';

/**
 * @param {object} options
 * @param {number} options.annee
 * @param {number} options.mois de 1 à 12.
 * @param {number} options.dernierMois dernier mois consultable (le mois en cours, ou 12).
 * @param {number[]|null} options.precedente douze montants de l'année d'avant.
 */
export async function ouvrirReleveMois({ annee, mois, dernierMois, precedente }) {
  const { devise, formatDate, modesPersonnalises = [] } = etat.parametres;
  const estMixte = etat.parametres.typeActivite === 'mixte';
  const { recettes } = await api.listerRecettes();
  let courant = mois;

  const idTitre = 'titre-releve-mois';
  const panneau = ouvrirPanneau(`
    <div class="panneau-tete releve-mois-tete">
      <button type="button" class="btn-icone" data-pas="-1" aria-label="Mois précédent">${icone('chevron-gauche', { taille: 18 })}</button>
      <div><h2 id="${idTitre}"></h2><p>Relevé du mois</p></div>
      <button type="button" class="btn-icone" data-pas="1" aria-label="Mois suivant">${icone('chevron-droite', { taille: 18 })}</button>
      <button type="button" class="btn-icone" data-fermer aria-label="Fermer le relevé">${icone('croix', { taille: 18 })}</button>
    </div>
    <div class="panneau-corps releve-mois" aria-live="polite"></div>
    <div class="panneau-pied">
      <a class="btn" data-registre href="#/recettes">${icone('recettes', { taille: 16 })}Voir dans le registre</a>
      <a class="btn" data-export href="#/exports">${icone('telecharger', { taille: 16 })}Exporter ce mois</a>
    </div>`, { classe: 'panneau-releve', idTitre });
  const racine = panneau.element;
  const corps = racine.querySelector('.releve-mois');

  function dessiner() {
    const prefixe = `${annee}-${String(courant).padStart(2, '0')}`;
    const lignes = recettes.filter((r) => r.dateEncaissement.startsWith(prefixe));
    const total = sommeMontants(lignes.map((r) => r.montant));
    const avant = precedente?.[courant - 1] ?? 0;
    const ecart = total - avant;
    const sansPdf = lignes.filter((r) => !r.pieceJointe).length;
    const parts = [['prestations', 'Prestations'], ['ventes', 'Ventes']]
      .map(([cle, libelle]) => [cle, sommeMontants(lignes.filter((r) => r.categorie === cle).map((r) => r.montant)), libelle])
      .filter(([, m]) => m > 0);
    const nom = majusculeInitiale(nomMois(courant));

    racine.querySelector(`#${idTitre}`).textContent = `${nom} ${annee}`;
    racine.querySelector('[data-pas="-1"]').disabled = courant <= 1;
    racine.querySelector('[data-pas="1"]').disabled = courant >= dernierMois;
    racine.querySelector('[data-export]').href = lienExport('recettes', { annee, mois: courant });

    corps.innerHTML = `
      <div class="releve-mois-total">
        <p class="releve-mois-montant">${montantDetaille(total, devise)}</p>
        <p class="releve-mois-sous">${accorder(lignes.length, 'encaissement')}${precedente
          ? `, ${Math.round(Math.abs(ecart)) === 0 ? 'autant qu’en ' : `${ecart > 0 ? '+' : '−'}${echapperHtml(formaterMontantEntier(Math.abs(ecart), devise))} par rapport à `}${nomMois(courant)} ${annee - 1}` : ''}</p>
      </div>
      ${estMixte && total > 0 ? `<div class="releve-mois-parts">
        <div class="repartition">${parts.map(([cle, m]) => `<span class="${cle}" style="width:${(m / total) * 100}%"></span>`).join('')}</div>
        <div class="legende">${parts.map(([cle, m, libelle]) =>
          `<span class="cle cle-${cle}"><i></i>${libelle} <strong>${echapperHtml(formaterMontant(m, devise))}</strong></span>`).join('')}</div>
      </div>` : ''}
      ${lignes.length === 0 ? `<p class="releve-mois-vide">Aucun encaissement en ${nomMois(courant)} ${annee}.</p>` : `
        <ol class="releve-mois-liste">${lignes.sort((a, b) => b.dateEncaissement.localeCompare(a.dateEncaissement)).map((r) => `
          <li><a href="#/recettes?voir=${encodeURIComponent(r.id)}">
            ${monogramme(r.client, { petit: true })}
            <span class="releve-qui"><strong>${echapperHtml(r.client)}</strong><span>${echapperHtml(formaterDate(r.dateEncaissement, formatDate))}, ${echapperHtml(r.libelle || libelleMode(r.modeReglement, modesPersonnalises))}</span></span>
            <span class="releve-mois-combien">${echapperHtml(formaterMontant(r.montant, devise))}${r.pieceJointe ? '' : `<span class="sans-pdf" title="Sans facture PDF">${icone('trombone', { taille: 13 })}</span>`}</span>
          </a></li>`).join('')}</ol>`}
      ${sansPdf > 0 ? `<p class="releve-mois-alerte">${icone('trombone', { taille: 15 })}<span>${accorder(sansPdf, 'recette')} sans facture PDF ce mois-ci</span></p>` : ''}`;
    // Le contenu est neuf à chaque dessin : son animation d'entrée repart d'elle-même.
    corps.classList.add('frais');
  }

  const aller = (pas) => {
    const suivant = courant + pas;
    if (suivant < 1 || suivant > dernierMois) return;
    courant = suivant;
    dessiner();
  };
  racine.querySelectorAll('[data-pas]').forEach((b) => b.addEventListener('click', () => aller(Number(b.dataset.pas))));
  racine.addEventListener('keydown', (evenement) => {
    if (evenement.target.closest('input, textarea, select')) return;
    if (evenement.key === 'ArrowLeft') { evenement.preventDefault(); aller(-1); }
    if (evenement.key === 'ArrowRight') { evenement.preventDefault(); aller(1); }
  });
  // « Voir dans le registre » : le mois affiché, filtres remis à zéro.
  racine.querySelector('[data-registre]').addEventListener('click', (evenement) => {
    evenement.preventDefault();
    const { filtres } = etatFiltres('recettes');
    Object.keys(filtres).forEach((cle) => { filtres[cle] = ''; });
    Object.assign(filtres, { annee: String(annee), mois: String(courant) });
    panneau.fermer(true);
    allerA('#/recettes');
  });
  dessiner();
}
