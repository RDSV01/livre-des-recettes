/**
 * La rétrospective d'une année : le livre raconté en scènes animées, en plein
 * écran, à la manière d'un récapitulatif de fin d'année. Chaque scène dit une
 * chose (le total, le meilleur mois, le premier client…) et ne vient que si
 * le livre a de quoi la remplir. La dernière résume l'année sur une carte.
 *
 * Les scènes se suivent seules, au rythme de la barre de progression du haut.
 * Un clic avance (à gauche, il recule), un appui long met en pause, comme les
 * flèches et la barre d'espace. Une scène en recouvre une autre en cercle,
 * depuis l'endroit du clic.
 *
 * Mouvement réduit : ni défilement automatique ni mouvement. Les chiffres
 * s'affichent d'emblée et les scènes se succèdent en fondu.
 *
 * Tout est calculé ici, à partir des recettes : rien ne quitte le poste.
 */

import { api } from './api.js';
import { etat } from './etat.js';
import { echapperHtml, accorder, initiales, lienExport, mouvementReduit, lirePreference } from './ui.js';
import { icone } from './icones.js';
import { libelleMode } from '/partage/constantes.js';
import { formaterMontant, formaterMontantEntier, sommeMontants } from '/partage/montants.js';
import { nomMois, MOIS_ABREGES, formaterDate, moisDe, dateIso, jourDeLAnnee, jourEtMois } from '/partage/dates.js';
import { majusculeInitiale, normaliserTexte } from '/partage/texte.js';
import { bilanSeuils } from '/partage/seuils.js';

// ---- Saison ------------------------------------------------------------------------------

/** Clé du « Masquer » de la carte du tableau de bord, par année. */
export const cleRetrospectiveMasquee = (annee) => `ldr-bilan-masque-${annee}`;

/**
 * La saison de la rétrospective : l'année qui s'achève (à partir du
 * 15 décembre) ou qui vient de s'achever (jusqu'au 31 janvier), `null` le
 * reste de l'année. Elle a alors sa place dans le menu, et sa carte sur le
 * tableau de bord.
 *
 * @returns {number | null}
 */
export function anneeDeSaison(maintenant = new Date()) {
  const mois = maintenant.getMonth() + 1;
  if (mois === 12 && maintenant.getDate() >= 15) return maintenant.getFullYear();
  return mois === 1 ? maintenant.getFullYear() - 1 : null;
}

/**
 * L'année dont la rétrospective se propose aujourd'hui sur le tableau de
 * bord (voir `anneeDeSaison`). Rien si le livre ne la connaît pas, ou si la
 * carte a été masquée.
 *
 * @param {number[]} annees les années présentes dans le livre.
 * @returns {number | null}
 */
export function retrospectiveDeSaison(annees, maintenant = new Date()) {
  const annee = anneeDeSaison(maintenant);
  return annee === null || !annees.includes(annee) || lirePreference(cleRetrospectiveMasquee(annee)) ? null : annee;
}

// ---- Les chiffres de l'année -----------------------------------------------------------------

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const JOURS_COURTS = JOURS.map((j) => j.slice(0, 3));

const somme = (lignes) => sommeMontants(lignes.map((r) => r.montant));
/** Jour de la semaine d'une date ISO, lundi valant 0. */
const jourDe = (iso) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;
const pourcent = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
const decimal = (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/**
 * Regroupe des recettes par une clé, avec leur total et leur nombre, du plus
 * gros total au plus petit. `nom` donne ce qui s'affiche (pour un client :
 * son nom tel qu'écrit, la clé étant ce nom sans casse ni accents).
 */
function regrouper(recettes, cle, nom = cle) {
  const groupes = new Map();
  for (const r of recettes) {
    const k = cle(r);
    const g = groupes.get(k) ?? { cle: k, nom: nom(r), total: 0, nombre: 0 };
    g.total += r.montant;
    g.nombre += 1;
    groupes.set(k, g);
  }
  return [...groupes.values()].map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total || b.nombre - a.nombre);
}

/**
 * Tout ce que racontent les scènes, calculé une fois. Une année en cours se
 * compare à la même période de l'année d'avant, pas à l'année entière.
 */
export function lireAnnee(annee, recettes, parametres, maintenant = new Date()) {
  const deLAnnee = recettes.filter((r) => r.dateEncaissement.startsWith(`${annee}-`))
    .sort((a, b) => a.dateEncaissement.localeCompare(b.dateEncaissement));
  const enCours = annee === maintenant.getFullYear();
  const aujourdHui = dateIso(maintenant.getFullYear(), maintenant.getMonth() + 1, maintenant.getDate());
  const borneAvant = enCours ? `${annee - 1}${aujourdHui.slice(4)}` : `${annee - 1}-12-31`;
  const davant = recettes.filter((r) => r.dateEncaissement.startsWith(`${annee - 1}-`) && r.dateEncaissement <= borneAvant);
  const total = somme(deLAnnee);

  // Les lignes de chaque mois, rangées en un passage.
  const lignesParMois = Array.from({ length: 12 }, () => []);
  for (const r of deLAnnee) lignesParMois[moisDe(r.dateEncaissement) - 1].push(r);
  const parMois = lignesParMois.map(somme);
  const moisMax = Math.max(...parMois);
  const meilleurMois = parMois.indexOf(moisMax) + 1;
  const parClient = (r) => normaliserTexte(r.client);
  const clients = regrouper(deLAnnee, parClient, (r) => r.client);
  // Chaque nom une seule fois : tout l'historique y passe.
  const nomsAvant = new Set(recettes.filter((r) => r.dateEncaissement < `${annee}-01-01`).map((r) => r.client));
  const connusAvant = new Set([...nomsAvant].map(normaliserTexte));

  const jours = Array(7).fill(0);
  for (const r of deLAnnee) jours[jourDe(r.dateEncaissement)] += 1;

  // La régularité se mesure sur les mois écoulés : la plus longue série de
  // mois d'affilée avec au moins un encaissement.
  const moisEcoules = enCours ? maintenant.getMonth() + 1 : 12;
  const actifs = parMois.slice(0, moisEcoules).map((v) => v > 0);
  let serie = { debut: 0, longueur: 0 };
  for (let i = 0, debut = 0; i < actifs.length; i += 1) {
    if (!actifs[i]) { debut = i + 1; continue; }
    if (i - debut + 1 > serie.longueur) serie = { debut: debut + 1, longueur: i - debut + 1 };
  }
  const joursEcoules = jourDeLAnnee(enCours ? aujourdHui : `${annee}-12-31`);

  const ventes = somme(deLAnnee.filter((r) => r.categorie === 'ventes'));
  const prestations = somme(deLAnnee.filter((r) => r.categorie === 'prestations'));
  return {
    annee,
    enCours,
    aujourdHui,
    entreprise: parametres.nomEntreprise || '',
    devise: parametres.devise,
    formatDate: parametres.formatDate,
    mixte: parametres.typeActivite === 'mixte',
    recettes: deLAnnee,
    total,
    nombre: deLAnnee.length,
    totalAvant: somme(davant),
    parMois,
    moisMax,
    meilleurMois,
    porteurMeilleur: regrouper(lignesParMois[meilleurMois - 1], parClient, (r) => r.client)[0] ?? null,
    clients,
    nouveaux: clients.filter((c) => !connusAvant.has(c.cle)),
    fideles: clients.filter((c) => connusAvant.has(c.cle)),
    plusGros: deLAnnee.reduce((a, b) => (b.montant > a.montant ? b : a), deLAnnee[0] ?? null),
    jours,
    modes: regrouper(deLAnnee, (r) => r.modeReglement)
      .map((m) => ({ ...m, libelle: libelleMode(m.cle, parametres.modesPersonnalises ?? []) })),
    ventes,
    prestations,
    moisEcoules,
    actifs,
    serie,
    joursEcoules,
    seuils: parametres.typeActivite ? bilanSeuils(total, parametres.typeActivite, prestations, annee) : null
  };
}

// ---- Les scènes ------------------------------------------------------------------------------

const e = echapperHtml;
/** Un entier comme l'écrit un compteur : « 1 234 ». */
const entier = (n) => n.toLocaleString('fr-FR');

/** Les filets d'un livre de comptes, tracés d'un bord à l'autre. */
const filets = (nombre) => `<div class="retro-filets" aria-hidden="true">${'<i></i>'.repeat(nombre)}</div>`;

/** Des colonnes (mois ou jours), à la hauteur de leur valeur. */
function colonnes(valeurs, libelles, { meilleure, aVenir = () => false, classe }) {
  const max = Math.max(...valeurs, 0);
  return `<div class="retro-colonnes ${classe}" aria-hidden="true">${valeurs.map((v, i) => `
      <span class="${i === meilleure ? 'meilleure' : ''}${aVenir(i) ? ' a-venir' : ''}">
        <i data-colonne style="height:${max > 0 ? Math.max(v > 0 ? 3 : 1, (v / max) * 100) : 1}%"></i>
        <small>${libelles[i]}</small>
      </span>`).join('')}</div>`;
}

/**
 * Les scènes de l'année, dans l'ordre du récit. Chacune : un identifiant, un
 * fond, une durée à l'écran, son contenu et ce qu'en annonce un lecteur
 * d'écran à son arrivée.
 */
function composer(d) {
  const euros = (v) => e(formaterMontantEntier(v, d.devise));
  const auCentime = (v) => e(formaterMontant(v, d.devise));
  const panier = Math.round((d.total / d.nombre) * 100) / 100;
  const scenes = [];

  // 1. L'ouverture.
  scenes.push({
    id: 'ouverture', fond: 'nuit', duree: 5200,
    annonce: `Rétrospective ${d.annee}`,
    html: `${filets(9)}
      <div class="retro-contenu centre">
        <p class="retro-sur" data-entree="250">${e(d.entreprise || 'Votre livre des recettes')}</p>
        <p class="retro-annee" data-entree="150">${d.annee}</p>
        <p class="retro-accroche" data-entree="1500">${d.enCours ? `Votre année, jusqu’au ${e(jourEtMois(d.aujourdHui))}` : 'Votre année en recettes'}</p>
      </div>`
  });

  // 2. Le total, et l'écart avec l'année d'avant.
  const ecart = Math.round((d.total - d.totalAvant) * 100) / 100;
  const ecartPourcent = pourcent(Math.abs(ecart), d.totalAvant);
  const phraseEcart = ecartPourcent === 0
    ? (d.enCours ? `Autant que sur la même période de ${d.annee - 1}` : `Autant qu’en ${d.annee - 1}`)
    : `${ecart > 0 ? '+' : '−'}${ecartPourcent} % par rapport à ${d.enCours ? `la même période de ${d.annee - 1}` : d.annee - 1}`;
  const plusGrand = Math.max(d.total, d.totalAvant);
  scenes.push({
    id: 'total', fond: 'sarcelle', duree: 7000,
    annonce: `${d.enCours ? 'Depuis le 1er janvier' : `En ${d.annee}`}, ${formaterMontantEntier(d.total, d.devise)} encaissés.`,
    html: `<div class="retro-contenu">
        <p class="retro-sur" data-entree="100">${d.enCours ? 'Depuis le 1er janvier, vous avez encaissé' : `En ${d.annee}, vous avez encaissé`}</p>
        <p class="retro-geant"><span data-compteur="${d.total}" data-format="euros">${euros(d.total)}</span></p>
        <p class="retro-texte" data-entree="1500">en ${accorder(d.nombre, 'encaissement')}, auprès de ${accorder(d.clients.length, 'client')}.</p>
        ${d.totalAvant > 0 ? `
        <div class="retro-duel" data-entree="1900">
          <div class="duel"><span>${d.annee - 1}</span><span class="duel-piste"><i data-jauge="2100" style="--part:${d.totalAvant / plusGrand}"></i></span><strong>${euros(d.totalAvant)}</strong></div>
          <div class="duel actuel"><span>${d.annee}</span><span class="duel-piste"><i data-jauge="2300" style="--part:${d.total / plusGrand}"></i></span><strong>${euros(d.total)}</strong></div>
        </div>
        <p class="retro-ecart" data-entree="3100">${phraseEcart}</p>` : ''}
      </div>`
  });

  // 3. Le meilleur mois, parmi les douze.
  const porteur = d.porteurMeilleur && d.porteurMeilleur.total >= d.moisMax * 0.4 && d.clients.length > 1
    ? `, dont ${euros(d.porteurMeilleur.total)} de ${e(d.porteurMeilleur.nom)}` : '';
  scenes.push({
    id: 'mois', fond: 'ivoire', duree: 7000,
    annonce: `Votre meilleur mois : ${nomMois(d.meilleurMois)}, ${formaterMontantEntier(d.moisMax, d.devise)}.`,
    html: `<div class="retro-contenu deux">
        <div>
          <p class="retro-sur" data-entree="100">Mois par mois</p>
          <h2 class="retro-titre" data-entree="1700">Votre meilleur mois : <span class="retro-accent">${nomMois(d.meilleurMois)}</span></h2>
          <p class="retro-texte" data-entree="2100">${euros(d.moisMax)} encaissés${porteur}.</p>
        </div>
        ${colonnes(d.parMois, MOIS_ABREGES, {
          classe: 'douze', meilleure: d.meilleurMois - 1, aVenir: (i) => d.enCours && i + 1 > d.moisEcoules
        })}
      </div>`,
    animer: (scene, outils) => outils.plusTard(1500, () => scene.classList.add('eclairee'))
  });

  // 4. Les encaissements, un carré chacun (ou pour plusieurs, s'ils sont très nombreux).
  const parCarre = Math.ceil(d.nombre / 360);
  const carres = d.recettes.filter((_, i) => i % parCarre === 0);
  const colonnesMosaique = Math.min(24, Math.max(6, Math.ceil(Math.sqrt(carres.length * 1.3))));
  const rythme = d.joursEcoules / d.nombre;
  const frequence = d.nombre < 3 ? ''
    : rythme >= 1.05 ? `un tous les ${decimal(rythme)} jours en moyenne`
      : rythme > 0.95 ? 'environ un par jour' : `${decimal(1 / rythme)} par jour en moyenne`;
  const categories = [['prestations', 'Prestations'], ['ventes', 'Ventes'], ['neutre', 'Non classées']]
    .filter(([cle]) => carres.some((r) => (r.categorie || 'neutre') === cle));
  const premier = d.recettes[0];
  scenes.push({
    id: 'mosaique', fond: 'vert', duree: 7000,
    annonce: `${accorder(d.nombre, 'encaissement')}${frequence ? `, ${frequence}` : ''}.`,
    html: `<div class="retro-contenu deux">
        <div>
          <p class="retro-sur" data-entree="100">Encaissement après encaissement</p>
          <p class="retro-geant"><span data-compteur="${d.nombre}">${entier(d.nombre)}</span></p>
          <p class="retro-texte" data-entree="1700">${d.nombre > 1 ? 'encaissements' : 'encaissement'} au livre${frequence ? `, ${frequence}` : ''}.</p>
          <p class="retro-texte discret" data-entree="2100">Le premier de l’année : le ${e(jourEtMois(premier.dateEncaissement))}, ${e(premier.client)}.</p>
          ${d.mixte && categories.length > 1 ? `<p class="retro-cles" data-entree="2400">${categories.map(([cle, libelle]) =>
            `<span><i class="${cle}"></i>${libelle}</span>`).join('')}</p>` : ''}
          ${parCarre > 1 ? `<p class="retro-texte discret" data-entree="2400">Un carré pour ${parCarre} encaissements.</p>` : ''}
        </div>
        <div class="retro-mosaique" style="--colonnes:${colonnesMosaique}" aria-hidden="true">${carres.map((r) =>
          `<i class="${d.mixte ? (r.categorie || 'neutre') : ''}"></i>`).join('')}</div>
      </div>`,
    animer: (scene, outils) => {
      // Chaque carré se pose quand le compteur passe son rang : même départ,
      // même durée, même courbe que le compteur (voir `compteur`).
      const tuiles = [...scene.querySelectorAll('.retro-mosaique i')];
      tuiles.forEach((t, i) => outils.animer(t, [
        { opacity: 0, transform: 'scale(0.2)' }, { opacity: 1, transform: 'none' }
      ], {
        duration: 420,
        delay: DEPART_COMPTEUR + (1 - (1 - (i + 1) / tuiles.length) ** 0.25) * DUREE_COMPTEUR - 200,
        easing: EASE,
        fill: 'backwards'
      }));
    }
  });

  // 5. Le plus gros encaissement, qui sort de l'imprimante.
  if (d.nombre > 1) {
    const g = d.plusGros;
    const mode = libelleMode(g.modeReglement, etat.parametres.modesPersonnalises ?? []);
    scenes.push({
      id: 'ticket', fond: 'or', duree: 7000,
      annonce: `Le plus gros encaissement : ${formaterMontant(g.montant, d.devise)}, ${g.client}.`,
      html: `<div class="retro-contenu deux">
          <div>
            <p class="retro-sur" data-entree="100">Le plus gros encaissement</p>
            <p class="retro-geant moyen${formaterMontant(g.montant, d.devise).length > 11 ? ' long' : ''}"><span data-compteur="${g.montant}" data-format="centimes">${auCentime(g.montant)}</span></p>
            <p class="retro-texte" data-entree="1600">${e(g.client)}, le ${e(jourEtMois(g.dateEncaissement))}${g.libelle ? `, pour «\u00a0${e(g.libelle)}\u00a0»` : ''}.</p>
          </div>
          <div class="retro-imprimante" aria-hidden="true">
            <div class="fente"></div>
            <div class="ticket-cadre"><div class="ticket">
              <p class="ticket-tete">${e(d.entreprise || 'Livre des recettes')}</p>
              <p class="ticket-ligne"><span>Date</span><span>${e(formaterDate(g.dateEncaissement, d.formatDate))}</span></p>
              <p class="ticket-ligne"><span>Client</span><span>${e(g.client)}</span></p>
              ${g.numeroFacture ? `<p class="ticket-ligne"><span>Facture</span><span>${e(g.numeroFacture)}</span></p>` : ''}
              <p class="ticket-ligne"><span>Règlement</span><span>${e(mode)}</span></p>
              <p class="ticket-total"><span>Total</span><span>${auCentime(g.montant)}</span></p>
              <p class="ticket-pied">Encaissé, inscrit au livre</p>
            </div></div>
          </div>
        </div>`,
      animer: (scene, outils) => {
        // Par à-coups, comme une imprimante de caisse.
        outils.animer(scene.querySelector('.ticket'), [
          { transform: 'translateY(calc(-100% - 16px))' }, { transform: 'none' }
        ], { duration: 2200, delay: 500, easing: 'steps(18, end)', fill: 'backwards' });
      }
    });
  }

  // 6. Le premier client, et ceux qui le suivent.
  if (d.clients.length > 1) {
    const premierClient = d.clients[0];
    const part = pourcent(premierClient.total, d.total);
    scenes.push({
      id: 'client', fond: 'framboise', duree: 7000,
      annonce: `Votre premier client : ${premierClient.nom}, ${part} % de votre année.`,
      html: `<div class="retro-contenu deux inverse">
          <div class="retro-anneau-client" aria-hidden="true">
            <svg viewBox="0 0 200 200"><circle class="anneau-piste" cx="100" cy="100" r="88"/><circle class="anneau-part" cx="100" cy="100" r="88" pathLength="100" style="stroke-dasharray:${part} 100"/></svg>
            <span class="retro-monogramme">${e(initiales(premierClient.nom))}</span>
          </div>
          <div>
            <p class="retro-sur" data-entree="100">Votre premier client</p>
            <h2 class="retro-titre${premierClient.nom.length > 26 ? ' long' : ''}" data-machine="500">${e(premierClient.nom)}</h2>
            <p class="retro-texte" data-entree="1700">${euros(premierClient.total)} en ${accorder(premierClient.nombre, 'encaissement')}, ${part} % de votre année.</p>
            <ol class="retro-podium" start="2">${d.clients.slice(1, 4).map((c, i) => `
              <li data-entree="${2100 + i * 160}"><span class="rang">${i + 2}</span><span class="nom">${e(c.nom)}</span><span class="montant">${euros(c.total)}</span></li>`).join('')}
            </ol>
          </div>
        </div>`,
      animer: (scene, outils) => {
        outils.animer(scene.querySelector('.anneau-part'), [
          { strokeDasharray: '0 100' }, { strokeDasharray: `${part} 100` }
        ], { duration: 1600, delay: 400, easing: EASE, fill: 'backwards' });
        outils.animer(scene.querySelector('.retro-monogramme'), [
          { opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }
        ], { duration: 900, delay: 200, easing: EASE, fill: 'backwards' });
      }
    });

    // 7. Les clients : les nouveaux, les fidèles.
    const PLAFOND = 36;
    const puces = (liste) => liste.slice(0, PLAFOND).map((c) => `<span class="puce">${e(initiales(c.nom))}</span>`).join('') +
      (liste.length > PLAFOND ? `<span class="puce plus">+${liste.length - PLAFOND}</span>` : '');
    const noms = d.nouveaux.slice(0, 3).map((c) => e(c.nom));
    const phrase = d.nouveaux.length === 0 ? 'Tous étaient déjà clients avant cette année.'
      : d.fideles.length === 0 ? `Tous nouveaux cette année, dont ${noms.join(', ')}${d.nouveaux.length > 3 ? '…' : '.'}`
        : `Parmi les nouveaux : ${noms.join(', ')}${d.nouveaux.length > 3 ? '…' : '.'}`;
    scenes.push({
      id: 'clients', fond: 'violet', duree: 7000,
      annonce: `${accorder(d.clients.length, 'client')} : ${accorder(d.nouveaux.length, 'nouveau', 'nouveaux')}, ${accorder(d.fideles.length, 'fidèle')}.`,
      html: `<div class="retro-contenu deux">
          <div>
            <p class="retro-sur" data-entree="100">Vos clients</p>
            <p class="retro-geant"><span data-compteur="${d.clients.length}">${entier(d.clients.length)}</span><span class="retro-unite">${d.clients.length > 1 ? 'clients' : 'client'}</span></p>
            <p class="retro-texte" data-entree="2300">${phrase}</p>
          </div>
          <div class="retro-nuee">
            ${d.nouveaux.length ? `<div class="groupe nouveaux"><p class="groupe-titre" data-entree="1500">${accorder(d.nouveaux.length, 'nouveau', 'nouveaux')} cette année</p><div class="puces" aria-hidden="true">${puces(d.nouveaux)}</div></div>` : ''}
            ${d.fideles.length ? `<div class="groupe fideles"><p class="groupe-titre" data-entree="1700">${accorder(d.fideles.length, 'fidèle')} des années passées</p><div class="puces" aria-hidden="true">${puces(d.fideles)}</div></div>` : ''}
          </div>
        </div>`,
      animer: (scene, outils) => {
        // Les puces arrivent de partout et se rangent dans leur groupe.
        scene.querySelectorAll('.puce').forEach((p, i) => outils.animer(p, [
          { opacity: 0, transform: `translate(${Math.round((Math.random() - 0.5) * 900)}px, ${Math.round((Math.random() - 0.5) * 600)}px) scale(0.3)` },
          { opacity: 1, transform: 'none' }
        ], { duration: 1100, delay: 350 + i * 22, easing: EASE, fill: 'backwards' }));
      }
    });
  }

  // 8. Le rythme de la semaine, et le panier moyen.
  if (d.nombre >= 5) {
    const favori = d.jours.indexOf(Math.max(...d.jours));
    scenes.push({
      id: 'rythme', fond: 'ivoire', duree: 6500,
      annonce: `Le ${JOURS[favori]} revient le plus souvent. Panier moyen : ${formaterMontant(d.total / d.nombre, d.devise)}.`,
      html: `<div class="retro-contenu deux">
          <div>
            <p class="retro-sur" data-entree="100">Votre semaine</p>
            <h2 class="retro-titre" data-entree="1300">Le <span class="retro-accent">${JOURS[favori]}</span> revient le plus souvent</h2>
            <p class="retro-texte" data-entree="1700">${pourcent(d.jours[favori], d.nombre)} % des encaissements tombent ce jour-là. Panier moyen : ${auCentime(panier)}.</p>
          </div>
          ${colonnes(d.jours, JOURS_COURTS, { classe: 'sept', meilleure: favori })}
        </div>`,
      animer: (scene, outils) => outils.plusTard(1100, () => scene.classList.add('eclairee'))
    });
  }

  // 9. Les moyens de paiement, en anneau.
  if (d.modes.length > 1) {
    const principaux = d.modes.slice(0, 4);
    const autres = d.modes.slice(4);
    const parts = [...principaux, ...(autres.length ? [{ libelle: 'Autres', total: sommeMontants(autres.map((m) => m.total)) }] : [])];
    let depart = 0;
    const segments = parts.map((m, i) => {
      const longueur = (m.total / d.total) * 100;
      const segment = `<circle class="m-${i}" cx="100" cy="100" r="80" pathLength="100" style="stroke-dasharray:${Math.max(0.4, longueur - 0.8)} 100;stroke-dashoffset:${-depart}"/>`;
      depart += longueur;
      return segment;
    }).join('');
    const tete = d.modes[0];
    const partTete = pourcent(tete.total, d.total);
    scenes.push({
      id: 'paiement', fond: 'nuit', duree: 6500,
      annonce: `${tete.libelle} en tête des moyens de paiement, ${partTete} % des montants.`,
      html: `<div class="retro-contenu deux inverse">
          <div class="retro-anneau" aria-hidden="true">
            <svg viewBox="0 0 200 200">${segments}</svg>
            <div class="anneau-centre"><strong data-compteur="${partTete}" data-suffixe=" %">${partTete} %</strong><span>${e(tete.libelle)}</span></div>
          </div>
          <div>
            <p class="retro-sur" data-entree="100">Vos moyens de paiement</p>
            <h2 class="retro-titre" data-entree="900">${e(tete.libelle)}, en tête</h2>
            <ul class="retro-legende">${parts.map((m, i) => `
              <li data-entree="${1300 + i * 140}"><i class="m-${i}"></i><span>${e(m.libelle)}</span><strong>${pourcent(m.total, d.total)} %</strong></li>`).join('')}
            </ul>
          </div>
        </div>`,
      animer: (scene, outils) => {
        // Chaque part se trace à son tour, dans le sens des aiguilles d'une montre.
        let delai = 300;
        scene.querySelectorAll('.retro-anneau circle').forEach((c) => {
          const [longueur] = c.style.strokeDasharray.split(' ');
          const duree = 300 + Number.parseFloat(longueur) * 12;
          outils.animer(c, [{ strokeDasharray: '0 100' }, { strokeDasharray: `${longueur} 100` }],
            { duration: duree, delay: delai, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'backwards' });
          delai += duree * 0.85;
        });
      }
    });
  }

  // 10. Ventes et prestations, en activité mixte.
  if (d.mixte && d.ventes > 0 && d.prestations > 0) {
    const partP = pourcent(d.prestations, d.ventes + d.prestations);
    scenes.push({
      id: 'categories', fond: 'vert', duree: 6500,
      annonce: `${partP} % de prestations, ${100 - partP} % de ventes.`,
      html: `<div class="retro-contenu">
          <p class="retro-sur" data-entree="100">Ventes et prestations</p>
          <div class="retro-partage">
            <div class="cote prestations"><strong data-compteur="${partP}" data-suffixe=" %">${partP} %</strong><span>de prestations de services</span><em>${euros(d.prestations)}</em></div>
            <div class="cote ventes"><strong data-compteur="${100 - partP}" data-suffixe=" %">${100 - partP} %</strong><span>de ventes</span><em>${euros(d.ventes)}</em></div>
          </div>
          <div class="retro-barre-partage" aria-hidden="true" style="--part:${partP}%"><i class="prestations"></i><i class="ventes"></i></div>
        </div>`,
      animer: (scene, outils) => {
        // Les deux parts partent à égalité, puis la frontière glisse à sa place.
        const decoupe = (cote, part) => (cote === 'prestations'
          ? `inset(0 calc(${100 - part}% + 2px) 0 0 round 6px)`
          : `inset(0 0 0 calc(${part}% + 2px) round 6px)`);
        for (const cote of ['prestations', 'ventes']) {
          outils.animer(scene.querySelector(`.retro-barre-partage .${cote}`), [
            { clipPath: decoupe(cote, 50) }, { clipPath: decoupe(cote, 50), offset: 0.25 }, { clipPath: decoupe(cote, partP) }
          ], { duration: 2000, delay: 300, easing: EASE, fill: 'backwards' });
        }
      }
    });
  }

  // 11. La régularité : les mois avec au moins un encaissement.
  if (d.nombre >= 3 && d.moisEcoules >= 3) {
    const nombreActifs = d.actifs.filter(Boolean).length;
    const { debut, longueur } = d.serie;
    const fin = debut + longueur - 1;
    const phraseRegularite = nombreActifs === d.moisEcoules ? 'Pas un mois sans encaissement.'
      : longueur >= 2 && longueur === nombreActifs ? `avec au moins un encaissement, sans interruption de ${nomMois(debut)} à ${nomMois(fin)}.`
        : longueur >= 2 ? `avec au moins un encaissement. Votre plus longue série : ${longueur} mois d’affilée, de ${nomMois(debut)} à ${nomMois(fin)}.`
          : 'avec au moins un encaissement.';
    scenes.push({
      id: 'regularite', fond: 'sarcelle', duree: 6500,
      annonce: `${nombreActifs} mois sur ${d.moisEcoules}, ${phraseRegularite.charAt(0).toLowerCase()}${phraseRegularite.slice(1)}`,
      html: `<div class="retro-contenu">
          <p class="retro-sur" data-entree="100">Régularité</p>
          <p class="retro-geant"><span data-compteur="${nombreActifs}">${entier(nombreActifs)}</span><span class="retro-unite">mois sur ${d.moisEcoules}</span></p>
          <div class="retro-frise" aria-hidden="true">${MOIS_ABREGES.map((m, i) => `
            <span class="${d.actifs[i] ? 'actif' : ''}${i + 1 >= debut && i + 1 < debut + longueur && longueur >= 2 ? ' serie' : ''}${i >= d.moisEcoules ? ' a-venir' : ''}"><i></i><small>${m}</small></span>`).join('')}
          </div>
          <p class="retro-texte" data-entree="2200">${phraseRegularite}</p>
        </div>`,
      animer: (scene, outils) => {
        scene.querySelectorAll('.retro-frise .actif i').forEach((n, i) => outils.animer(n, [
          { opacity: 0.25, transform: 'scaleY(0.3)' }, { opacity: 1, transform: 'none' }
        ], { duration: 500, delay: 500 + i * 110, easing: EASE, fill: 'backwards' }));
      }
    });
  }

  // 12. Les plafonds du régime.
  if (d.seuils) {
    const micro = d.seuils.plafondMicro;
    const tva = d.seuils.franchiseTva;
    scenes.push({
      id: 'plafonds', fond: 'ivoire', duree: 6000,
      annonce: `${micro.pourcentage} % du plafond micro-entrepreneur, ${tva.pourcentage} % du seuil de franchise de TVA.`,
      html: `<div class="retro-contenu">
          <p class="retro-sur" data-entree="100">Vos plafonds${d.enCours ? ', à ce jour' : ''}</p>
          <div class="retro-jauges">${[['Plafond micro-entrepreneur', micro, 300], ['Franchise de TVA', tva, 700]].map(([libelle, seuil, entree]) => `
            <div class="retro-jauge-ligne" data-entree="${entree}">
              <p><span>${libelle}</span><strong data-compteur="${seuil.pourcentage}" data-suffixe=" %">${seuil.pourcentage} %</strong></p>
              <div class="retro-jauge"><i data-jauge="${entree + 300}" style="--part:${Math.min(1, seuil.pourcentage / 100)}"></i></div>
              <small>${euros(d.total)} sur ${euros(seuil.seuil)}</small>
            </div>`).join('')}
          </div>
        </div>`
    });
  }

  // 13. La carte de l'année, à garder.
  const tete = d.modes[0];
  const recap = [
    ['Encaissements', entier(d.nombre)],
    ['Clients', entier(d.clients.length)],
    ['Meilleur mois', majusculeInitiale(nomMois(d.meilleurMois))],
    ['Premier client', d.clients[0].nom],
    ['Panier moyen', formaterMontant(panier, d.devise)],
    ['Paiement préféré', tete.libelle]
  ];
  scenes.push({
    id: 'recap', fond: 'nuit', duree: 0,
    annonce: `Votre année ${d.annee} en une carte.`,
    html: `${filets(7)}
      <div class="retro-contenu deux">
        <article class="retro-carte" aria-label="Votre année ${d.annee} en résumé">
          <p class="recap-tete"><span>${e(d.entreprise || 'Livre des recettes')}</span><span>${d.annee}</span></p>
          <p class="recap-libelle">${d.enCours ? 'Encaissé depuis le 1er janvier' : 'Chiffre d’affaires encaissé'}</p>
          <p class="recap-total">${euros(d.total)}</p>
          ${colonnes(d.parMois, MOIS_ABREGES.map((m) => m.slice(0, 1).toUpperCase()), { classe: 'mini', meilleure: d.meilleurMois - 1 })}
          <dl class="recap-grille">${recap.map(([libelle, valeur], i) => `
            <div data-entree="${700 + i * 90}"><dt>${libelle}</dt><dd>${e(valeur)}</dd></div>`).join('')}
          </dl>
        </article>
        <div class="retro-fin">
          <p class="retro-sur" data-entree="300">Votre année ${d.annee}</p>
          <h2 class="retro-titre" data-entree="500">${d.enCours ? 'À suivre jusqu’au 31 décembre' : 'Une année au livre'}</h2>
          <div class="retro-actions" data-entree="900">
            <a class="retro-action principale" href="${lienExport('recettes', { annee: d.annee })}" data-exporter>${icone('telecharger', { taille: 18 })}Exporter le livre ${d.annee}</a>
            <button type="button" class="retro-action" data-revoir>${icone('revoir', { taille: 18 })}Revoir depuis le début</button>
          </div>
        </div>
      </div>`,
    animer: (scene, outils) => {
      outils.animer(scene.querySelector('.retro-carte'), [
        { opacity: 0, transform: 'translateY(40px) rotate(-2deg) scale(0.94)' }, { opacity: 1, transform: 'none' }
      ], { duration: 1100, delay: 200, easing: EASE, fill: 'backwards' });
    }
  });

  return scenes;
}

// ---- Le mouvement ----------------------------------------------------------------------------

/** Une sortie franche, sans rebond. */
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** Le compteur part après ce délai et monte en cette durée (la mosaïque le suit). */
const DEPART_COMPTEUR = 250;
const DUREE_COMPTEUR = 1400;

/**
 * Les animations d'une scène, à annuler quand on la quitte : chaque animation
 * Web passe par `animer`, chaque attente par `plusTard`.
 */
function outillage() {
  const animations = [];
  const minuteries = [];
  return {
    animer(element, images, options) {
      if (element) animations.push(element.animate(images, options));
    },
    plusTard(ms, faire) {
      minuteries.push(setTimeout(faire, ms));
    },
    arreter() {
      minuteries.forEach(clearTimeout);
      animations.forEach((a) => { if (a.playState === 'running') a.finish(); });
    }
  };
}

/** Comment un compteur écrit sa valeur (`data-format`) : comme le texte final. */
const FORMATS = {
  entier: (v) => Math.round(v).toLocaleString('fr-FR'),
  euros: (v) => formaterMontantEntier(Math.round(v), etat.parametres.devise),
  centimes: (v) => formaterMontant(Math.round(v * 100) / 100, etat.parametres.devise)
};

/**
 * Un nombre (ou un montant) qui monte de zéro jusqu'à sa valeur, dans son
 * propre texte : aucun calque, rien ne bouge autour. Sa largeur finale est
 * réservée et les chiffres s'alignent à droite ; la dernière image est
 * exactement le texte de départ.
 */
function compteur(element, largeur, outils) {
  const cible = Number(element.dataset.compteur);
  const ecrire = FORMATS[element.dataset.format] ?? FORMATS.entier;
  const suffixe = element.dataset.suffixe ?? '';
  let debut = null;
  if (getComputedStyle(element).display === 'inline') element.style.display = 'inline-block';
  element.style.minWidth = `${largeur}px`;
  element.style.textAlign = 'right';
  element.textContent = `${ecrire(0)}${suffixe}`;
  const pas = (instant) => {
    if (!element.isConnected) return;
    debut ??= instant;
    const t = Math.min(1, (instant - debut) / DUREE_COMPTEUR);
    element.textContent = `${ecrire(t < 1 ? cible * (1 - (1 - t) ** 4) : cible)}${suffixe}`;
    if (t < 1) requestAnimationFrame(pas);
  };
  outils.plusTard(DEPART_COMPTEUR, () => requestAnimationFrame(pas));
}

/**
 * Le titre s'écrit comme à la machine : une découpe le dévoile de gauche à
 * droite, par à-coups. Le texte n'est jamais découpé en lettres, son
 * approche et son crénage restent ceux du texte final.
 */
function machine(element, delai, outils) {
  const lettres = element.textContent.length;
  outils.animer(element, [
    { clipPath: 'inset(-0.2em 100% -0.2em -0.2em)' }, { clipPath: 'inset(-0.2em -0.2em -0.2em -0.2em)' }
  ], { duration: Math.min(lettres * 55, 1400), delay: delai, easing: `steps(${lettres}, end)`, fill: 'backwards' });
}

/** Ce que toutes les scènes ont en commun : entrées, compteurs, jauges, colonnes, filets. */
function animerScene(scene, definition, outils) {
  scene.querySelectorAll('[data-entree]').forEach((n) => outils.animer(n, [
    { opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }
  ], { duration: 800, delay: Number(n.dataset.entree), easing: EASE, fill: 'backwards' }));
  // Les largeurs finales se lisent toutes avant la première écriture : une seule mise en page.
  const compteurs = [...scene.querySelectorAll('[data-compteur]')];
  const largeurs = compteurs.map((n) => n.getBoundingClientRect().width);
  compteurs.forEach((n, i) => compteur(n, largeurs[i], outils));
  scene.querySelectorAll('[data-machine]').forEach((n) => machine(n, Number(n.dataset.machine), outils));
  scene.querySelectorAll('[data-jauge]').forEach((n) => outils.animer(n, [
    { transform: 'scaleX(0)' }, { transform: `scaleX(${n.style.getPropertyValue('--part')})` }
  ], { duration: 1300, delay: Number(n.dataset.jauge), easing: EASE, fill: 'backwards' }));
  scene.querySelectorAll('[data-colonne]').forEach((n, i) => outils.animer(n, [
    { transform: 'scaleY(0)' }, { transform: 'none' }
  ], { duration: 900, delay: 300 + i * 70, easing: EASE, fill: 'backwards' }));
  scene.querySelectorAll('.retro-filets i').forEach((n, i) => outils.animer(n, [
    { transform: 'scaleX(0)' }, { transform: 'none' }
  ], { duration: 1400, delay: i * 90, easing: EASE, fill: 'backwards' }));
  definition.animer?.(scene, outils);
}

// ---- Le lecteur ------------------------------------------------------------------------------

/**
 * Ouvre la rétrospective de `annee`, en plein écran. Échap ferme ; le focus
 * revient ensuite où il était.
 */
export async function ouvrirRetrospective(annee) {
  const { recettes } = await api.listerRecettes();
  const d = lireAnnee(annee, recettes, etat.parametres);
  if (d.nombre === 0) throw new Error(`Aucune recette en ${annee} : la rétrospective viendra avec la première.`);
  const scenes = composer(d);
  const reduit = mouvementReduit();
  const retour = document.activeElement;

  const dialogue = document.createElement('dialog');
  dialogue.className = 'retro';
  dialogue.setAttribute('aria-label', `Rétrospective ${annee}`);
  dialogue.innerHTML = `
    <div class="retro-scenes"></div>
    <div class="retro-haut">
      <div class="retro-progres" aria-hidden="true">${scenes.map(() => '<span><i></i></span>').join('')}</div>
      <button type="button" class="retro-bouton" data-pause aria-label="Mettre en pause">${icone('pause', { taille: 18 })}</button>
      <button type="button" class="retro-bouton" data-fermer aria-label="Fermer la rétrospective">${icone('croix', { taille: 20 })}</button>
    </div>
    <div class="retro-bas">
      <span class="retro-marque">Rétrospective ${annee}</span>
      <span class="retro-numero" aria-hidden="true"></span>
      <button type="button" class="retro-bouton" data-pas="-1" aria-label="Scène précédente">${icone('chevron-gauche', { taille: 20 })}</button>
      <button type="button" class="retro-bouton" data-pas="1" aria-label="Scène suivante">${icone('chevron-droite', { taille: 20 })}</button>
    </div>
    <p class="hors-ecran" aria-live="polite" data-annonce></p>`;
  document.body.append(dialogue);

  const scene = dialogue.querySelector('.retro-scenes');
  const barres = [...dialogue.querySelectorAll('.retro-progres i')];
  const boutonPause = dialogue.querySelector('[data-pause]');
  let rang = -1;
  let outils = null;
  let progression = null;
  let revelation = null;
  let enPause = false;
  let tenu = false;

  const avancerSeul = () => !reduit && rang < scenes.length - 1;

  function lancerProgression() {
    progression?.cancel();
    progression = null;
    barres.forEach((b, i) => { b.style.transform = i < rang || (i === rang && !avancerSeul()) ? 'scaleX(1)' : 'scaleX(0)'; });
    if (!avancerSeul()) return;
    progression = barres[rang].animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: scenes[rang].duree, easing: 'linear', fill: 'forwards' });
    if (enPause || tenu) progression.pause();
    progression.onfinish = () => aller(rang + 1);
  }

  function majPause() {
    boutonPause.hidden = !avancerSeul();
    boutonPause.setAttribute('aria-label', enPause ? 'Reprendre' : 'Mettre en pause');
    boutonPause.innerHTML = icone(enPause ? 'lecture' : 'pause', { taille: 18 });
  }

  /** Passe à la scène `nouveau`, révélée en cercle depuis `origine` (le point du clic). */
  function aller(nouveau, origine = null) {
    if (nouveau < 0 || nouveau >= scenes.length || nouveau === rang) return;
    const sens = nouveau > rang ? 1 : -1;
    revelation?.finish();
    outils?.arreter();
    rang = nouveau;
    const definition = scenes[rang];
    const element = document.createElement('section');
    element.className = `retro-scene fond-${definition.fond}`;
    element.dataset.scene = definition.id;
    element.innerHTML = definition.html;
    scene.append(element);
    dialogue.dataset.fond = definition.fond;
    const anciennes = [...scene.children].slice(0, -1);
    const retirer = () => anciennes.forEach((n) => n.remove());

    // La première scène n'a rien à recouvrir : le lecteur s'ouvre en fondu (voir la feuille de style).
    if (anciennes.length) {
      if (reduit) revelation = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
      else {
        const largeur = window.innerWidth;
        const hauteur = window.innerHeight;
        const x = origine?.x ?? (sens > 0 ? largeur - 64 : 64);
        const y = origine?.y ?? hauteur - 48;
        const rayon = Math.hypot(Math.max(x, largeur - x), Math.max(y, hauteur - y));
        revelation = element.animate([
          { clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${rayon}px at ${x}px ${y}px)` }
        ], { duration: 850, easing: EASE });
        anciennes.forEach((n) => n.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(0.94)', opacity: 0.5 }],
          { duration: 850, easing: EASE, fill: 'forwards' }));
      }
      revelation.finished.then(retirer).catch(retirer);
    }

    outils = outillage();
    if (!reduit) animerScene(element, definition, outils);
    dialogue.querySelector('[data-annonce]').textContent = definition.annonce;
    dialogue.querySelector('.retro-numero').textContent = `${rang + 1} sur ${scenes.length}`;
    dialogue.querySelector('[data-pas="-1"]').disabled = rang === 0;
    dialogue.querySelector('[data-pas="1"]').disabled = rang === scenes.length - 1;
    lancerProgression();
    majPause();
  }

  function basculerPause() {
    if (!avancerSeul()) return;
    enPause = !enPause;
    if (enPause) progression?.pause();
    else if (!tenu) progression?.play();
    majPause();
  }

  // ---- Commandes
  boutonPause.addEventListener('click', basculerPause);
  dialogue.querySelector('[data-fermer]').addEventListener('click', () => dialogue.close());
  dialogue.querySelectorAll('[data-pas]').forEach((b) => b.addEventListener('click', () => aller(rang + Number(b.dataset.pas))));

  // Un clic sur la scène avance (sur son tiers gauche, il recule) ; un appui
  // long suspend le défilement le temps de lire.
  let appui = null;
  scene.addEventListener('pointerdown', (evenement) => {
    if (evenement.button !== 0 || evenement.target.closest('a, button')) return;
    appui = setTimeout(() => {
      appui = null;
      tenu = true;
      progression?.pause();
      dialogue.classList.add('tenu');
    }, 260);
  });
  const relacher = () => {
    tenu = false;
    dialogue.classList.remove('tenu');
    if (!enPause) progression?.play();
  };
  dialogue.addEventListener('pointerup', (evenement) => {
    if (tenu) { relacher(); return; }
    if (appui === null) return;
    clearTimeout(appui);
    appui = null;
    // Un clic bref sur la scène elle-même (pas sur une commande) : on change de scène.
    if (!scene.contains(evenement.target) || evenement.target.closest('a, button')) return;
    const origine = { x: evenement.clientX, y: evenement.clientY };
    aller(evenement.clientX < window.innerWidth * 0.3 ? rang - 1 : rang + 1, origine);
  });
  dialogue.addEventListener('pointercancel', () => {
    clearTimeout(appui);
    appui = null;
    if (tenu) relacher();
  });

  dialogue.addEventListener('keydown', (evenement) => {
    if (evenement.key === 'ArrowRight') { evenement.preventDefault(); aller(rang + 1); }
    if (evenement.key === 'ArrowLeft') { evenement.preventDefault(); aller(rang - 1); }
    if (evenement.key === ' ' && !evenement.target.closest('button, a')) { evenement.preventDefault(); basculerPause(); }
  });

  // La carte de fin : l'export (qui ferme le lecteur), revoir.
  dialogue.addEventListener('click', (evenement) => {
    if (evenement.target.closest('[data-exporter]')) dialogue.close();
    else if (evenement.target.closest('[data-revoir]')) aller(0);
  });

  dialogue.addEventListener('close', () => {
    progression?.cancel();
    outils?.arreter();
    dialogue.remove();
    if (retour?.isConnected) retour.focus();
  });

  dialogue.showModal();
  aller(0);
  dialogue.querySelector('[data-pas="1"]').focus();
}
