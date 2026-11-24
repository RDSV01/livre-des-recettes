/**
 * Vue « Rétrospective » : chaque année du livre en affiche, la plus récente en
 * grand, avec de quoi lancer son récit animé (voir `retrospective.js`).
 *
 * Hors du menu : on y arrive par Ctrl+K. Le récit d'une année se lance aussi
 * depuis la carte de fin d'année du tableau de bord et depuis le rapport
 * annuel, dans les exports.
 */

import { api } from '../api.js';
import { etat } from '../etat.js';
import { echapperHtml, accorder, toast } from '../ui.js';
import { icone } from '../icones.js';
import { ouvrirRetrospective } from '../retrospective.js';
import { formaterMontantEntier, sommeMontants } from '/partage/montants.js';
import { MOIS_ABREGES, anneeDe, moisDe } from '/partage/dates.js';
import { normaliserTexte } from '/partage/texte.js';

/** Les chiffres d'une affiche : total, nombre, clients, et les douze mois. */
function resumer(annee, recettes) {
  const montantsParMois = Array.from({ length: 12 }, () => []);
  for (const r of recettes) montantsParMois[moisDe(r.dateEncaissement) - 1].push(r.montant);
  return {
    annee,
    total: sommeMontants(recettes.map((r) => r.montant)),
    nombre: recettes.length,
    // Chaque nom normalisé une seule fois.
    clients: new Set([...new Set(recettes.map((r) => r.client))].map(normaliserTexte)).size,
    parMois: montantsParMois.map(sommeMontants)
  };
}

/** Les douze mois en barres, le meilleur en or. */
function barres(parMois, classe) {
  const max = Math.max(...parMois);
  const meilleur = parMois.indexOf(max);
  return `<div class="${classe}" aria-hidden="true">${parMois.map((v, i) => `
      <span class="${i === meilleur ? 'meilleur' : ''}"><i style="height:${max > 0 ? Math.max(v > 0 ? 4 : 1.5, (v / max) * 100) : 1.5}%;--i:${i}"></i><small>${MOIS_ABREGES[i].slice(0, 1).toUpperCase()}</small></span>`).join('')}
    </div>`;
}

export async function vueRetrospective(conteneur) {
  const { recettes } = await api.listerRecettes();
  const { devise } = etat.parametres;
  const anneeCourante = new Date().getFullYear();
  const parAnnee = new Map();
  for (const r of recettes) {
    const annee = anneeDe(r.dateEncaissement);
    if (!parAnnee.has(annee)) parAnnee.set(annee, []);
    parAnnee.get(annee).push(r);
  }
  const annees = [...parAnnee.keys()].sort((a, b) => b - a).map((a) => resumer(a, parAnnee.get(a)));
  const euros = (v) => echapperHtml(formaterMontantEntier(v, devise));
  const resume = (a) => `${euros(a.total)} encaissés, ${accorder(a.nombre, 'encaissement')}, ${accorder(a.clients, 'client')}`;

  const [premiere, ...autres] = annees;
  conteneur.innerHTML = `
    <div class="page">
      <header class="entete-page">
        <div>
          <h1>Rétrospective</h1>
          <p class="sous-titre">Chaque année du livre, racontée en quelques scènes animées.</p>
        </div>
      </header>
      ${premiere ? `
      <section class="affiche-retro" aria-labelledby="titre-affiche">
        <div class="affiche-texte">
          <p class="affiche-sur">${premiere.annee === anneeCourante ? 'Année en cours' : 'Votre dernière année'}</p>
          <h2 class="affiche-annee" id="titre-affiche">${premiere.annee}</h2>
          <p class="affiche-resume">${resume(premiere)}.</p>
          <div class="affiche-actions">
            <button type="button" class="btn affiche-lancer" data-lancer="${premiere.annee}">${icone('lecture', { taille: 16 })}Lancer la rétrospective</button>
            ${premiere.annee === anneeCourante ? '<span class="affiche-note">Elle se complète à chaque encaissement, jusqu’au 31 décembre.</span>' : ''}
          </div>
        </div>
        ${barres(premiere.parMois, 'affiche-mois')}
      </section>` : `
      <section class="carte vide-carte affiche-vide">
        <p>Votre première rétrospective apparaîtra ici avec vos premières recettes.</p>
        <a class="btn" href="#/recettes?nouvelle=1">${icone('plus', { taille: 16 })}Ajouter une recette</a>
      </section>`}
      ${autres.length ? `
      <h2 class="titre-annees">Les années précédentes</h2>
      <div class="affiches-annees">
        ${autres.map((a) => `
        <article class="carte affiche-annee-passee" aria-labelledby="titre-affiche-${a.annee}">
          <div class="passee-tete">
            <h3 id="titre-affiche-${a.annee}">${a.annee}</h3>
            <button type="button" class="btn btn-petit" data-lancer="${a.annee}" aria-label="Revoir la rétrospective ${a.annee}">${icone('lecture', { taille: 14 })}Revoir</button>
          </div>
          <p>${resume(a)}.</p>
          ${barres(a.parMois, 'passee-mois')}
        </article>`).join('')}
      </div>` : ''}
    </div>`;

  conteneur.querySelector('.page').addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('[data-lancer]');
    if (bouton) ouvrirRetrospective(Number(bouton.dataset.lancer)).catch((erreur) => toast(erreur.message, 'erreur'));
  });
}
