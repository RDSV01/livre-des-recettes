/**
 * Vue « Exports ».
 *
 * Deux natures de documents s'y côtoient, à ne pas confondre :
 *  - les deux registres légaux (recettes, achats), aux colonnes imposées, en
 *    PDF, Excel et CSV : ce qu'on présente en cas de contrôle. Avec l'option
 *    « PDF joints », le registre part dans une archive ZIP avec les factures
 *    ou justificatifs de la période ;
 *  - le rapport annuel de gestion, en PDF, qui n'a aucune valeur légale et
 *    s'adresse au dirigeant qui veut lire son année.
 *
 * Chaque téléchargement d'un registre passe d'abord par une vérification,
 * affichée point par point à la place de l'aperçu : la carte ne change pas de
 * taille. Le contrôle éclaire, il n'interdit jamais l'export.
 */

import { api, urlExport, urlRapportAnnuel, telechargerFichier } from '../api.js';
import { registreAchatsUtile } from '../etat.js';
import { icone } from '../icones.js';
import {
  infobulle, echapperHtml, selecteur, OPTIONS_MOIS, accorder, mouvementReduit, choixAnnee, brancherChoixAnnee
} from '../ui.js';
import { reussite, patienter, annoncer } from '../retours.js';
import { titrePeriode, anneeDe, moisDe } from '/partage/dates.js';

/** Temps entre deux points du contrôle, assez long pour suivre des yeux. */
const DELAI_POINT = 140;

const pause = (ms) => new Promise((suite) => setTimeout(suite, ms));

/** Icône de chaque état d'un point de contrôle. */
const ICONES_POINT = { ok: 'cercle-valide', attention: 'triangle-alerte', erreur: 'cercle-alerte', info: 'trombone' };

/** Phrase de conclusion, selon ce que le contrôle a trouvé. */
function conclusion(points, nombre) {
  if (nombre === 0) return { etat: 'attention', texte: 'Aucune ligne sur cette période : le document sera vide.' };
  const erreurs = points.filter((p) => p.etat === 'erreur').length;
  const attentions = points.filter((p) => p.etat === 'attention').length;
  if (erreurs > 0) {
    return { etat: 'erreur', texte: `${accorder(erreurs, 'mention obligatoire manque', 'mentions obligatoires manquent')} : corrigez avant de présenter ce registre.` };
  }
  if (attentions > 0) return { etat: 'attention', texte: `${accorder(attentions, 'point', 'points')} à vérifier. Rien n’empêche l’export.` };
  return { etat: 'ok', texte: 'Tout est en ordre : le registre est complet et cohérent.' };
}

/** Aperçu dessiné du document, avec la place du contrôle par-dessus. */
function apercu(id) {
  const lignes = id === 'rapport'
    ? '<div class="l titre"></div><div class="l courte"></div><div class="barres-mini"><i style="height:40%"></i><i style="height:62%"></i><i style="height:48%"></i><i style="height:80%"></i><i style="height:55%"></i><i style="height:92%"></i></div><div class="l"></div><div class="l courte"></div>'
    : `<div class="l titre"></div><div class="l accent"></div>${Array.from({ length: 8 }, (_, i) => `<div class="l${i % 3 === 2 ? ' courte' : ''}"></div>`).join('')}`;
  return `<div class="apercu">
      <div class="pages" aria-hidden="true">
        <div class="page-miniature arriere"></div>
        <div class="page-miniature">${lignes}</div>
      </div>
      ${id === 'rapport' ? '' : '<div class="controle-apercu" aria-live="polite"></div>'}
    </div>`;
}

export async function vueExports(conteneur, params) {
  const anneeCourante = new Date().getFullYear();
  const avecAchats = registreAchatsUtile();
  const [{ annees: anneesR }, { annees: anneesA }, { recettes }, { achats }] = await Promise.all([
    api.listerAnnees(),
    avecAchats ? api.listerAnneesAchats() : { annees: [] },
    api.listerRecettes(),
    avecAchats ? api.listerAchats() : { achats: [] }
  ]);
  const anneesRecettes = anneesR.length > 0 ? anneesR : [anneeCourante];
  const anneesAchats = anneesA.length > 0 ? anneesA : [anneeCourante];

  const REGISTRES = {
    recettes: {
      titre: 'Livre des recettes', icone: 'recettes', teinte: 'recette', annees: anneesRecettes, lignes: recettes,
      cleDate: 'dateEncaissement', chemin: '', quoi: 'factures',
      texte: 'Date de réception du paiement, client, montant, mode de règlement, numéro de facture, libellé. Totaux mensuels et annuel inclus.'
    },
    ...(avecAchats ? {
      achats: {
        titre: 'Registre des achats', icone: 'achats', teinte: 'achat', annees: anneesAchats, lignes: achats,
        cleDate: 'dateReglement', chemin: '/achats', quoi: 'justificatifs',
        texte: 'Date du règlement, fournisseur, référence du justificatif, mode de paiement, montant. Totaux mensuels et annuel inclus.'
      }
    } : {})
  };

  const carteRegistre = (id, r) => `
    <article class="carte document ${r.teinte}" id="carte-${id}" aria-labelledby="titre-${id}">
      ${apercu(id)}
      <div class="document-corps">
        <div class="document-titre"><span class="tuile ${r.teinte}">${icone(r.icone, { taille: 17 })}</span><h2 id="titre-${id}">${r.titre}</h2></div>
        <p>${r.texte}</p>
        <div class="document-reglages">
          <div class="document-periode">
            ${choixAnnee({ id: `${id}-annee`, etiquette: 'Année' })}
            ${selecteur({ id: `${id}-mois`, etiquette: 'Mois', options: `<option value="">Année complète</option>${OPTIONS_MOIS}` })}
          </div>
          <label class="option-pieces"><input type="checkbox" class="case" id="${id}-pieces">
            <span id="${id}-pieces-texte"></span></label>
          <div class="formats">
            <button type="button" class="btn btn-principal" data-registre="${id}" data-format="pdf">${icone('fichier-texte', { taille: 16 })}PDF</button>
            <button type="button" class="btn" data-registre="${id}" data-format="xlsx">${icone('fichier-tableur', { taille: 16 })}Excel</button>
            <button type="button" class="btn" data-registre="${id}" data-format="csv">${icone('tableau', { taille: 16 })}CSV</button>
          </div>
        </div>
      </div>
    </article>`;

  conteneur.innerHTML = `
    <div class="page">
      <header class="entete-page">
        <div>
          <h1>Exports${infobulle(
            'Besoin de savoir quel montant déclarer ? L’écran « URSSAF » calcule le chiffre ' +
            'd’affaires encaissé par mois, trimestre ou année.',
            'les exports'
          )}</h1>
          <p class="sous-titre">Le PDF se présente en cas de contrôle. Excel et CSV servent à retravailler les mêmes lignes dans un tableur.</p>
        </div>
      </header>
      <div class="documents${avecAchats ? '' : ' deux'}">
        ${Object.entries(REGISTRES).map(([id, r]) => carteRegistre(id, r)).join('')}
        <article class="carte document analyse" id="carte-rapport" aria-labelledby="titre-rapport">
          ${apercu('rapport')}
          <div class="document-corps">
            <div class="document-titre"><span class="tuile analyse">${icone('fichier-texte', { taille: 17 })}</span><h2 id="titre-rapport">Rapport annuel de gestion</h2></div>
            <p>Chiffre d’affaires et sa répartition, panier moyen, évolution mois par mois, moyens de paiement, meilleurs clients. Document de gestion sans valeur légale : seuls les registres font foi.</p>
            <div class="document-reglages">
              <div class="document-periode">${choixAnnee({ id: 'rapport-annee', etiquette: 'Année' })}</div>
              <p class="option-pieces attenue">Une page de synthèse, puis le détail des encaissements.</p>
              <div class="formats">
                <button type="button" class="btn btn-principal pleine" id="telecharger-rapport">${icone('fichier-texte', { taille: 16 })}Rapport annuel (PDF)</button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>`;

  const page = conteneur.querySelector('.page');
  // Arrivée depuis le bouton « Exporter » d'un registre : la carte reprend la
  // période filtrée à l'écran et s'éclaire.
  const demande = params?.get('registre');
  const carteDemandee = demande && REGISTRES[demande] ? page.querySelector(`#carte-${demande}`) : null;

  /** L'année choisie de chaque carte (registres et rapport), d'abord la plus récente. */
  const annees = {};
  const brancherAnnee = (id, liste, surChoix = () => {}) => {
    const voulue = id === demande ? Number(params.get('annee')) : NaN;
    annees[id] = liste.includes(voulue) ? voulue : liste[0];
    brancherChoixAnnee(page.querySelector(`#${id}-annee`), {
      annees: liste,
      choisie: annees[id],
      surChoix: (annee) => { annees[id] = annee; surChoix(); }
    });
  };
  const periodeDe = (id) => ({
    annee: String(annees[id]),
    mois: page.querySelector(`#${id}-mois`).value
  });

  /** Lignes de la période choisie, pour compter leurs PDF joints. */
  const lignesDe = (id) => {
    const { annee, mois } = periodeDe(id);
    const r = REGISTRES[id];
    return r.lignes.filter((l) => anneeDe(l[r.cleDate]) === Number(annee) && (!mois || moisDe(l[r.cleDate]) === Number(mois)));
  };

  /** L'option « avec les PDF joints » dit combien la période en compte. */
  function majOptionPieces(id) {
    const avecPdf = lignesDe(id).filter((l) => l.pieceJointe).length;
    const caseOption = page.querySelector(`#${id}-pieces`);
    caseOption.disabled = avecPdf === 0;
    if (avecPdf === 0) caseOption.checked = false;
    page.querySelector(`#${id}-pieces-texte`).innerHTML = avecPdf === 0
      ? `<span class="attenue">Aucun PDF joint sur cette période</span>`
      : `Avec ${accorder(avecPdf, `PDF joint`, 'PDF joints')} <span class="attenue">(archive .zip)</span>`;
  }

  for (const [id, r] of Object.entries(REGISTRES)) {
    brancherAnnee(id, r.annees, () => majOptionPieces(id));
    page.querySelector(`#${id}-mois`).addEventListener('change', () => majOptionPieces(id));
  }
  brancherAnnee('rapport', anneesRecettes);

  if (carteDemandee) {
    const mois = page.querySelector(`#${demande}-mois`);
    const voulu = params.get('mois');
    if (voulu && [...mois.options].some((o) => o.value === voulu)) mois.value = voulu;
    carteDemandee.classList.add('mise-en-avant');
  }
  for (const id of Object.keys(REGISTRES)) majOptionPieces(id);

  /**
   * Contrôle puis téléchargement d'un registre : les points s'affichent l'un
   * après l'autre à la place de l'aperçu, puis le fichier part.
   */
  async function exporter(bouton) {
    const id = bouton.dataset.registre;
    const r = REGISTRES[id];
    const carte = page.querySelector(`#carte-${id}`);
    const cadre = carte.querySelector('.apercu');
    const zone = carte.querySelector('.controle-apercu');
    const boutons = [...carte.querySelectorAll('[data-format]')];
    const periode = periodeDe(id);
    const avecPieces = carte.querySelector(`#${id}-pieces`).checked;

    boutons.forEach((b) => { b.disabled = true; });
    const reprendre = patienter(bouton, 'Contrôle…');
    zone.innerHTML = `<div class="controle-tete"><strong>Contrôle avant export · ${echapperHtml(titrePeriode(periode))}</strong>
        <button type="button" class="btn-icone" data-fermer-controle aria-label="Revenir à l’aperçu" title="Revenir à l’aperçu">${icone('croix', { taille: 15 })}</button></div>
      <ul class="points"></ul><p class="conclusion-controle" hidden></p>`;
    cadre.classList.add('en-controle');
    const liste = zone.querySelector('.points');

    let rapport;
    try {
      rapport = await api.controlerExport(periode, r.chemin);
    } catch (erreur) {
      // Le contrôle n'est qu'une aide : s'il échoue, l'export reste possible.
      rapport = { nombre: 1, points: [{ etat: 'attention', libelle: 'Contrôle indisponible', detail: erreur.message }] };
    }
    const points = [...rapport.points];
    if (avecPieces) {
      const lignes = lignesDe(id);
      const sans = lignes.filter((l) => !l.pieceJointe).length;
      points.push({
        etat: 'info',
        libelle: `PDF joints (${r.quoi})`,
        detail: sans ? `${lignes.length - sans} joints, ${sans} sans PDF` : 'un PDF pour chaque ligne'
      });
    }
    for (const point of points) {
      if (!zone.isConnected) return;
      liste.insertAdjacentHTML('beforeend', `<li class="${point.etat}">${icone(ICONES_POINT[point.etat] ?? 'cercle-alerte', { taille: 15 })}
        <strong>${echapperHtml(point.libelle)}</strong><span title="${echapperHtml(point.detail)}">${echapperHtml(point.detail)}</span></li>`);
      const li = liste.lastElementChild;
      requestAnimationFrame(() => li.classList.add('vu'));
      if (!mouvementReduit()) await pause(DELAI_POINT);
    }
    const fin = conclusion(rapport.points, rapport.nombre);
    const zoneConclusion = zone.querySelector('.conclusion-controle');
    zoneConclusion.className = `conclusion-controle ${fin.etat}`;
    zoneConclusion.textContent = fin.texte;
    zoneConclusion.hidden = false;

    try {
      await telechargerFichier(urlExport(bouton.dataset.format, periode, r.chemin, { avecPieces }));
      reprendre();
      reussite(bouton, avecPieces ? 'Exporté (.zip)' : 'Exporté', { duree: 2200, nomIcone: 'fichier-valide' });
      annoncer(`${r.titre} exporté. ${fin.texte}`);
    } catch (erreur) {
      reprendre();
      reussite(bouton, 'Échec', { duree: 2600, nomIcone: 'cercle-alerte', echec: true });
      zoneConclusion.className = 'conclusion-controle erreur';
      zoneConclusion.textContent = `Export impossible : ${erreur.message}`;
    } finally {
      boutons.forEach((b) => { b.disabled = false; });
    }
  }

  page.addEventListener('click', async (evenement) => {
    const fermer = evenement.target.closest('[data-fermer-controle]');
    if (fermer) {
      fermer.closest('.apercu').classList.remove('en-controle');
      return;
    }
    const format = evenement.target.closest('[data-format]');
    if (format && !format.disabled) {
      exporter(format);
      return;
    }
    const rapport = evenement.target.closest('#telecharger-rapport');
    if (rapport && !rapport.disabled) {
      // Le rapport « sort de l'imprimante » : la page remonte, puis redescend.
      const cadre = page.querySelector('#carte-rapport .apercu');
      const reprendre = patienter(rapport, 'Préparation…');
      cadre.classList.remove('imprime');
      void cadre.offsetWidth;
      cadre.classList.add('imprime');
      try {
        await telechargerFichier(urlRapportAnnuel(String(annees.rapport)));
        reprendre();
        reussite(rapport, 'Rapport prêt', { duree: 2200, nomIcone: 'fichier-valide' });
      } catch (erreur) {
        reprendre();
        reussite(rapport, 'Échec', { duree: 2600, nomIcone: 'cercle-alerte', echec: true });
        annoncer(`Rapport impossible : ${erreur.message}`);
      }
    }
  });
}
