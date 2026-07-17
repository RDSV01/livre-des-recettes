/**
 * Vue « Tableau de bord » : chiffres clés de l'année choisie, graphique du
 * chiffre d'affaires mensuel, suivi des seuils (plafond micro et franchise
 * de TVA) et dernières recettes.
 *
 * Un sélecteur permet de revoir une année passée ; il ne propose que les
 * années réellement présentes dans le livre.
 */

import { api } from '../api.js';
import { etat, definirParametres } from '../etat.js';
import { echapperHtml, toast } from '../ui.js';
import { icone } from '../icones.js';
import { formaterMontant } from '/partage/montants.js';
import { formaterDate, nomMois, dernierePeriodeEchue } from '/partage/dates.js';
import { bilanSeuils, ANNEE_SEUILS } from '/partage/seuils.js';

/** Abréviations françaises des mois, pour l'axe du graphique. */
const MOIS_ABREGES = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

/**
 * Graphique à barres du CA mensuel (une seule série, teinte accent).
 * SVG généré à la main : barres fines aux coins supérieurs arrondis ancrées
 * sur la ligne de base, grille discrète, info-bulle native par colonne.
 */
function graphiqueCaMensuel(points, devise) {
  const largeur = 720;
  const hauteur = 210;
  const margeGauche = 56;
  const margeHaut = 10;
  const margeBas = 26;
  const zoneHauteur = hauteur - margeHaut - margeBas;
  const zoneLargeur = largeur - margeGauche - 8;

  const maxBrut = Math.max(...points.map((p) => p.total));
  // Plafond « rond » de l'axe : multiple lisible juste au-dessus du maximum.
  const etage = 10 ** Math.floor(Math.log10(maxBrut));
  const plafond = Math.ceil(maxBrut / (etage / 2)) * (etage / 2);

  const compact = new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: devise, maximumFractionDigits: 0
  });

  const pasX = zoneLargeur / points.length;
  const largeurBarre = Math.min(38, Math.max(8, pasX - 10));
  const ligneBase = margeHaut + zoneHauteur;

  // Grille : ligne de base, moitié, plafond.
  const grille = [0, 0.5, 1].map((part) => {
    const y = (ligneBase - part * zoneHauteur).toFixed(1);
    return `
      <line class="grille" x1="${margeGauche}" y1="${y}" x2="${largeur - 4}" y2="${y}"/>
      <text x="${margeGauche - 8}" y="${Number(y) + 4}" text-anchor="end">${echapperHtml(compact.format(part * plafond))}</text>`;
  }).join('');

  const colonnes = points.map((p, i) => {
    const x = margeGauche + i * pasX + (pasX - largeurBarre) / 2;
    const h = (p.total / plafond) * zoneHauteur;
    const y = ligneBase - h;
    const r = Math.min(4, largeurBarre / 2, h);
    const barre = h <= 0 ? '' : `
      <path class="barre" d="M ${x.toFixed(1)} ${ligneBase}
        L ${x.toFixed(1)} ${(y + r).toFixed(1)}
        Q ${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)}
        L ${(x + largeurBarre - r).toFixed(1)} ${y.toFixed(1)}
        Q ${(x + largeurBarre).toFixed(1)} ${y.toFixed(1)} ${(x + largeurBarre).toFixed(1)} ${(y + r).toFixed(1)}
        L ${(x + largeurBarre).toFixed(1)} ${ligneBase} Z"/>`;
    // L'année est portée par le titre de la carte : l'axe n'affiche que les mois.
    const etiquette = MOIS_ABREGES[p.mois - 1];
    // La zone de survol couvre toute la colonne : cible plus large que la barre.
    // Le montant exact est porté par `data-info` et affiché par l'info-bulle
    // maison, instantanée (l'info-bulle native a un délai imposé par le système).
    return `
      <g class="colonne" data-info="${echapperHtml(`${nomMois(p.mois)} ${p.annee} : ${formaterMontant(p.total, devise)}`)}">
        <rect x="${(margeGauche + i * pasX).toFixed(1)}" y="${margeHaut}" width="${pasX.toFixed(1)}" height="${zoneHauteur + margeBas}" fill="transparent"/>
        ${barre}
        <text x="${(x + largeurBarre / 2).toFixed(1)}" y="${hauteur - 8}" text-anchor="middle">${echapperHtml(etiquette)}</text>
      </g>`;
  }).join('');

  return `
    <svg class="graphique-ca" viewBox="0 0 ${largeur} ${hauteur}" role="img"
      aria-label="Chiffre d’affaires mensuel">
      ${grille}
      ${colonnes}
    </svg>`;
}

/**
 * Info-bulle instantanée du graphique : elle suit le pointeur et affiche le
 * chiffre d'affaires exact du mois survolé, sans le délai de l'info-bulle
 * native du navigateur.
 */
function installerInfobulle(conteneur) {
  const svg = conteneur.querySelector('.graphique-ca');
  if (!svg) return;

  const bulle = document.createElement('div');
  bulle.className = 'infobulle-graphique';
  bulle.hidden = true;
  conteneur.appendChild(bulle);

  svg.addEventListener('pointermove', (evenement) => {
    const colonne = evenement.target.closest('.colonne');
    if (!colonne) {
      bulle.hidden = true;
      return;
    }
    bulle.textContent = colonne.dataset.info;
    bulle.hidden = false;
    const x = Math.min(evenement.clientX + 14, window.innerWidth - bulle.offsetWidth - 8);
    bulle.style.left = `${x}px`;
    bulle.style.top = `${evenement.clientY - 34}px`;
  });
  svg.addEventListener('pointerleave', () => { bulle.hidden = true; });
}

/** Une jauge de progression vers un seuil, avec son message d'état. */
function jauge({ titre, ca, progression, devise, messageAttention, messageDepasse }) {
  const pourcentage = progression.pourcentage;
  const etatJauge = pourcentage >= 100 ? 'depasse' : pourcentage >= 80 ? 'attention' : '';

  let detail;
  if (etatJauge === 'depasse') {
    detail = messageDepasse;
  } else if (etatJauge === 'attention') {
    detail = messageAttention.replace('{p}', pourcentage);
  } else {
    detail = `Il reste ${formaterMontant(progression.restant, devise)} (${pourcentage} % atteints).`;
  }

  return `
    <div class="ligne-jauge">
      <div class="entete-jauge">
        <span>${echapperHtml(titre)}</span>
        <span class="valeur-jauge"><strong>${echapperHtml(formaterMontant(ca, devise))}</strong> / ${echapperHtml(formaterMontant(progression.seuil, devise))}</span>
      </div>
      <div class="jauge ${etatJauge}"><span style="width: ${Math.min(100, pourcentage)}%"></span></div>
      <div class="detail-jauge ${etatJauge}">
        ${etatJauge ? icone('cercle-alerte', { taille: 15 }) : ''}
        <span>${echapperHtml(detail)}</span>
      </div>
    </div>`;
}

/** Carte de suivi des seuils, selon le type d'activité choisi. */
function carteSeuils(stats, devise) {
  const bilan = bilanSeuils(stats.caAnnee, etat.parametres.typeActivite, stats.caAnneePrestations);
  if (!bilan) {
    return `
      <h2>Plafond et franchise de TVA</h2>
      <div class="etat-vide">
        <div class="grande-icone">${icone('tendance', { taille: 32 })}</div>
        Indiquez votre type d’activité pour suivre votre plafond micro-entrepreneur
        et votre éligibilité à la franchise de TVA.<br>
        <a class="btn btn-secondaire" href="#/parametres">${icone('parametres', { taille: 16 })}<span>Choisir mon activité</span></a>
      </div>`;
  }

  const estMixte = bilan.typeActivite === 'mixte';
  return `
    <h2>Plafond et franchise de TVA (${stats.annee})</h2>
    ${jauge({
      titre: estMixte ? 'Plafond micro-entrepreneur (global)' : 'Plafond micro-entrepreneur',
      ca: stats.caAnnee,
      progression: bilan.plafondMicro,
      devise,
      messageAttention: '{p} % du plafond annuel atteint.',
      messageDepasse: 'Plafond annuel atteint : renseignez-vous sur le régime réel.'
    })}
    ${jauge({
      titre: estMixte ? 'Franchise en base de TVA (global)' : 'Franchise en base de TVA',
      ca: stats.caAnnee,
      progression: bilan.franchiseTva,
      devise,
      messageAttention: 'Vous approchez du seuil de franchise de TVA ({p} %).',
      messageDepasse: `Seuil dépassé. Tolérance jusqu’au seuil majoré : ${formaterMontant(bilan.franchiseTva.seuilMajore, devise)}.`
    })}
    ${bilan.prestations ? `
    ${jauge({
      titre: 'Part prestations : plafond micro',
      ca: bilan.prestations.chiffreAffaires,
      progression: bilan.prestations.plafondMicro,
      devise,
      messageAttention: '{p} % du plafond des prestations atteint.',
      messageDepasse: 'Plafond des prestations atteint : renseignez-vous sur le régime réel.'
    })}
    ${jauge({
      titre: 'Part prestations : franchise de TVA',
      ca: bilan.prestations.chiffreAffaires,
      progression: bilan.prestations.franchiseTva,
      devise,
      messageAttention: 'La part prestations approche de son seuil de TVA ({p} %).',
      messageDepasse: `Seuil dépassé. Tolérance jusqu’au seuil majoré : ${formaterMontant(bilan.prestations.franchiseTva.seuilMajore, devise)}.`
    })}` : ''}
    ${estMixte && stats.nombreNonCategorisees > 0 ? `
      <p class="note-legale">
        ${icone('cercle-alerte', { taille: 16 })}
        <span>${stats.nombreNonCategorisees} recette${stats.nombreNonCategorisees > 1 ? 's' : ''} de ${stats.annee}
        sans catégorie : modifiez-les (vente ou prestation) pour un suivi fiable de la part prestations.</span>
      </p>` : ''}
    <p class="note-legale">
      ${icone('info', { taille: 16 })}
      <span>Suivi purement informatif, basé sur les seuils ${ANNEE_SEUILS}. En cas de doute,
      vérifiez les valeurs en vigueur (economie.gouv.fr).</span>
    </p>`;
}

/**
 * Rappel discret de déclaration URSSAF : affiché quand une période est
 * entièrement écoulée et n'a pas été marquée « déclarée » via le bouton
 * « C'est fait » (mémorisé dans les paramètres).
 */
function bandeauRappelUrssaf() {
  const p = etat.parametres;
  const periode = dernierePeriodeEchue(p.periodiciteUrssaf);
  if (!periode || periode.id === p.dernierePeriodeDeclaree) return '';
  return `
    <div class="bandeau-rappel">
      ${icone('urssaf', { taille: 18 })}
      <span>Déclaration URSSAF de ${echapperHtml(periode.libelle)} : pensez à la faire si ce n’est pas déjà fait.</span>
      <a class="btn btn-discret" href="#/urssaf">Voir le montant</a>
      <button type="button" class="btn btn-discret" id="declaration-faite" data-periode="${periode.id}">
        ${icone('cercle-valide', { taille: 16 })}<span>C’est fait</span>
      </button>
    </div>`;
}

export async function vueTableauDeBord(conteneur) {
  const { annees } = await api.listerAnnees();
  const anneesDisponibles = annees.length > 0 ? annees : [new Date().getFullYear()];
  let anneeChoisie = anneesDisponibles[0]; // la plus récente avec des données

  async function rendre() {
    const stats = await api.tableauDeBord({ annee: anneeChoisie });
    const { devise, formatDate, suiviSeuils } = etat.parametres;

    const cartes = [
      { etiquette: `CA de ${nomMois(stats.mois)} ${stats.annee}`, valeur: formaterMontant(stats.caMois, devise), icone: 'billet', principale: true },
      { etiquette: `CA de l’année ${stats.annee}`, valeur: formaterMontant(stats.caAnnee, devise), icone: 'calendrier', principale: true },
      { etiquette: `Encaissements en ${stats.annee}`, valeur: String(stats.nombreEncaissements), icone: 'diese' },
      { etiquette: 'Moyenne par encaissement', valeur: formaterMontant(stats.moyenneEncaissement, devise), icone: 'tendance' }
    ];

    const aDesDonnees = stats.caParMois.some((p) => p.total > 0);
    const carteGraphique = `
      <div class="carte">
        <h2>Chiffre d’affaires mensuel (${stats.annee})</h2>
        ${aDesDonnees ? graphiqueCaMensuel(stats.caParMois, devise) : `
          <div class="etat-vide">
            <div class="grande-icone">${icone('tendance', { taille: 32 })}</div>
            Le graphique apparaîtra dès vos premiers encaissements.
          </div>`}
      </div>`;

    conteneur.innerHTML = `
      <header class="entete-vue">
        <div>
          <h1>Tableau de bord</h1>
          <p>Votre activité en un coup d’œil.</p>
        </div>
        <div class="actions-vue">
          ${anneesDisponibles.length > 1 ? `
            <select id="annee-tableau" aria-label="Année affichée" class="selecteur-annee">
              ${anneesDisponibles.map((a) => `<option value="${a}" ${a === anneeChoisie ? 'selected' : ''}>${a}</option>`).join('')}
            </select>` : ''}
          <a class="btn btn-discret" href="#/exports">${icone('exports', { taille: 16 })}<span>Exporter le livre des recettes</span></a>
          <a class="btn btn-primaire" href="#/recettes?nouvelle=1">${icone('plus', { taille: 16 })}<span>Nouvelle recette</span></a>
        </div>
      </header>

      ${bandeauRappelUrssaf()}

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

      ${suiviSeuils ? `
      <section class="grille-deux">
        ${carteGraphique}
        <div class="carte">
          ${carteSeuils(stats, devise)}
        </div>
      </section>` : `
      <section>
        ${carteGraphique}
      </section>`}

      <section class="carte">
        <h2>Dernières recettes${stats.annee === new Date().getFullYear() ? '' : ` de ${stats.annee}`}</h2>
        ${stats.dernieresRecettes.length === 0 ? `
          <div class="etat-vide">
            <div class="grande-icone">${icone('recettes', { taille: 40 })}</div>
            Votre livre des recettes est vide pour l’instant.<br>
            <a class="btn btn-primaire" href="#/recettes?nouvelle=1">${icone('plus', { taille: 16 })}<span>Ajouter ma première recette</span></a>
          </div>` : `
          <div class="conteneur-tableau">
            <table>
              <thead>
                <tr><th>Encaissé le</th><th>Client</th><th>Libellé</th><th class="montant">Montant</th></tr>
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

    installerInfobulle(conteneur);
    conteneur.querySelector('#annee-tableau')?.addEventListener('change', (evenement) => {
      anneeChoisie = Number(evenement.target.value);
      rendre();
    });

    // « C'est fait » : mémorise la période déclarée, le rappel disparaît.
    conteneur.querySelector('#declaration-faite')?.addEventListener('click', async (evenement) => {
      try {
        const reponse = await api.enregistrerParametres({
          ...etat.parametres,
          dernierePeriodeDeclaree: evenement.currentTarget.dataset.periode
        });
        definirParametres(reponse.parametres);
        toast('Déclaration marquée comme faite.');
        rendre();
      } catch (erreur) {
        toast(erreur.message, 'erreur');
      }
    });
  }

  await rendre();
}
