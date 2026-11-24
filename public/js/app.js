/**
 * Point d'entrée du navigateur : le menu (rail), le routage par ancre
 * (`#/recettes`, …), les bandeaux globaux, la mise à jour de l'application,
 * les raccourcis Annuler / Rétablir et le chargement de l'état global, sans
 * aucun framework ni étape de build.
 *
 * Le rail est construit une fois ; d'une page à l'autre, seul l'indicateur
 * de la page courante glisse jusqu'au bon lien.
 */

import { api } from './api.js';
import { chargerEtat, etat, registreAchatsUtile } from './etat.js';
import {
  echapperHtml, toast, confirmer, dialogueAttente, chargeur, installerInfobulles, mouvementReduit, enFondu, fermerMenu, heureLisible,
  lirePreference, ecrirePreference
} from './ui.js';
import { icone } from './icones.js';
import { annuler, retablir } from './historique.js';
import { listeSauvegardes, brancherRestauration } from './sauvegardes.js';
import { ouvrirReprise } from './fichier-sauvegarde.js';
import { basculerTheme, themeCourant, themeChoisi, appliquerThemeEphemere, revenirAuThemeParDefaut } from './theme.js';
import { fermerPanneauOuvert } from './panneau.js';
import { lancerAccueil } from './accueil.js';
import { installerRaccourcis } from './raccourcis.js';
import { ouvrirRechercheGlobale } from './recherche-globale.js';
import { RESSORT_SURBRILLANCE } from './ressort.js';
import { installerReponsesControles } from './retours.js';
import { montrerNouveautes } from './nouveautes.js';
import { alerteUrssaf } from '/partage/declarations.js';
import { vueTableauDeBord } from './vues/tableau-de-bord.js';
import { vueRecettes, ouvrirNouvelleRecette } from './vues/recettes.js';
import { vueAchats, ouvrirNouvelAchat } from './vues/achats.js';
import { vueUrssaf } from './vues/urssaf.js';
import { vueClients } from './vues/clients.js';
import { vueRetrospective } from './vues/retrospective.js';
import { anneeDeSaison } from './retrospective.js';
import { vueImport } from './vues/import.js';
import { vueExports } from './vues/exports.js';
import { vueParametres } from './vues/parametres.js';

/**
 * Définition unique des pages : sert à la fois au menu et au routage, dans
 * l'ordre et les groupes du menu : le suivi de tous les jours en tête ;
 * l'import et les exports, gestes rares, plus discrets en bas, au-dessus des
 * réglages. Une page peut porter une condition d'affichage (`utile`), ou
 * n'entrer au menu qu'à certains moments (`menu`) : le reste du temps, on y
 * arrive par un lien ou par Ctrl+K. Elle peut aussi dire, après son nom, à
 * quoi elle s'applique (`suffixe`).
 */
const ROUTES = [
  { chemin: '', label: 'Tableau de bord', icone: 'tableau-de-bord', vue: vueTableauDeBord, forme: 'tableau-de-bord', groupe: 1 },
  { chemin: 'recettes', label: 'Recettes', icone: 'recettes', vue: vueRecettes, forme: 'liste', groupe: 1, rubrique: 'Registres', compte: 'recettes' },
  { chemin: 'achats', label: 'Achats', icone: 'achats', vue: vueAchats, utile: registreAchatsUtile, forme: 'liste', groupe: 1, rubrique: 'Registres', compte: 'achats' },
  { chemin: 'urssaf', label: 'URSSAF', icone: 'urssaf', vue: vueUrssaf, forme: 'simple', groupe: 1, alerte: true, rubrique: 'Suivi' },
  { chemin: 'clients', label: 'Clients', icone: 'clients', vue: vueClients, forme: 'liste', groupe: 1, rubrique: 'Suivi', compte: 'clients' },
  // En fin d'année seulement (15 décembre au 31 janvier), avec l'année racontée.
  {
    chemin: 'retrospective', label: 'Rétrospective', icone: 'historique', vue: vueRetrospective, forme: 'simple', groupe: 2,
    menu: () => anneeDeSaison() !== null, suffixe: anneeDeSaison
  },
  { chemin: 'import', label: 'Importer', icone: 'import', vue: vueImport, forme: 'simple', groupe: 2 },
  { chemin: 'exports', label: 'Exports', icone: 'telecharger', vue: vueExports, forme: 'simple', groupe: 2 },
  { chemin: 'parametres', label: 'Paramètres', icone: 'parametres', vue: vueParametres, forme: 'simple', groupe: 3 }
];

/** Vrai tant que les données sont corrompues : la navigation est suspendue. */
let modeRestauration = false;

/** Premier affichage : l'indicateur du menu se pose sans glisser. */
let premierAffichage = true;

/** La page affichée (son chemin). */
let pageAffichee = null;
/** Vrai le temps du retour d'historique qui suit une saisie ouverte sur place. */
let retourSansDessin = false;

// ---- Menu (rail) ----------------------------------------------------------------

/** Pages ouvertes, selon les paramètres de l'utilisateur. */
const routesVisibles = () => ROUTES.filter((r) => !r.utile || r.utile());
/** Celles qui ont, en ce moment, leur lien dans le menu. */
const routesDuMenu = () => routesVisibles().filter((r) => !r.menu || r.menu());

function construireRail() {
  const nav = document.getElementById('navigation');
  // La surbrillance rejoint le lien choisi avec un léger dépassement, comme tirée par un ressort.
  nav.style.setProperty('--ressort-surbrillance', RESSORT_SURBRILLANCE.easing);
  nav.style.setProperty('--ressort-surbrillance-duree', `${RESSORT_SURBRILLANCE.duree}ms`);
  const lien = (r) => `<a class="lien-nav" href="#/${r.chemin}" data-route="${r.chemin}" data-libelle="${echapperHtml(r.label)}">
      ${icone(r.icone, { taille: 18 })}<span>${echapperHtml(r.label)}</span>${r.alerte ? '<span class="alerte-nav" hidden></span>' : ''}${r.compte ? `<span class="compte-nav" data-compte="${r.compte}"></span>` : ''}${r.suffixe ? `<span class="compte-nav">${r.suffixe()}</span>` : ''}
    </a>`;
  const liens = (n) => routesDuMenu().filter((r) => r.groupe === n).map(lien).join('');
  // Le menu principal se range par rubriques : les registres, puis le suivi.
  let rubrique = '';
  const principal = routesDuMenu().filter((r) => r.groupe === 1).map((r) => {
    const titre = r.rubrique && r.rubrique !== rubrique ? `<span class="rubrique-nav" aria-hidden="true">${(rubrique = r.rubrique)}</span>` : '';
    return titre + lien(r);
  }).join('');
  nav.innerHTML = `
    <div class="ligne-marque">
      <a class="marque" href="#/" aria-label="Livre des recettes, tableau de bord">
        <span class="marque-logo">${icone('livre', { taille: 18 })}</span>
        <span class="marque-nom">Livre des recettes<small id="nom-entreprise"></small></span>
      </a>
      <button type="button" class="replier-rail" id="replier-rail" aria-controls="navigation"></button>
    </div>
    <button type="button" class="recherche-rail" id="recherche-rail" aria-keyshortcuts="Control+K">
      ${icone('recherche', { taille: 16 })}<span>Rechercher</span><span class="touches"><kbd>Ctrl</kbd><kbd>K</kbd></span>
    </button>
    <span class="indicateur-nav" aria-hidden="true"></span>
    <div class="nav-principale"><div class="groupe-nav">${principal}</div></div>
    <div class="pied-rail">
      <a class="etat-copie" id="etat-copie" href="#/parametres?section=securite" hidden>
        ${icone('disque', { taille: 18 })}<span class="texte-etat-copie"></span>
      </a>
      <div class="liens-rares">${liens(2)}</div>
      <div class="ligne-reglages">
        ${liens(3)}
        <button type="button" class="bascule-theme" id="bouton-theme"></button>
      </div>
      <p class="mention-locale"><span class="ligne-version"><span id="version-app">${etat.systeme ? `Version ${echapperHtml(etat.systeme.version)}` : ''}</span><span class="etat-enregistrement" id="etat-enregistrement" aria-hidden="true"></span></span>
        <a class="lien-soutien" href="https://buymeacoffee.com/rdsv01" target="_blank" rel="noopener">Offrir un café à l’auteur</a></p>
    </div>`;
  nav.querySelector('#bouton-theme').addEventListener('click', (evenement) => basculerTheme(evenement.currentTarget));
  nav.querySelector('#recherche-rail').addEventListener('click', rechercher);
  nav.querySelector('#replier-rail').addEventListener('click', () => replierRail(!document.documentElement.classList.contains('rail-replie')));
  replierRail(railReplie(), { anime: false });
  majRail({ anime: false });
}

// ---- L'onglet du navigateur ---------------------------------------------------------

/**
 * L'icône de l'onglet : le livre bleu, et une pastille orange quand quelque
 * chose attend (déclaration, copie en retard). L'app vit dans un onglet
 * souvent caché derrière d'autres : on le voit sans l'ouvrir.
 */
const iconeOnglet = (attente) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v16"/><path d="M20.001 19A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2 5 5 0 0 1 4-2z"/>${attente ? '<circle cx="19" cy="5" r="4.5" fill="#ea580c" stroke="#ffffff" stroke-width="1.5"/>' : ''}</svg>`)}`;
let ongletEnAttente = false;

/** Le titre de l'onglet, précédé de « (1) » quand quelque chose attend. */
const titreOnglet = (titre) => `${ongletEnAttente ? '(1) ' : ''}${titre.replace(/^\(1\) /, '')}`;

function majOnglet(attente) {
  const lien = document.querySelector('link[rel="icon"]');
  if (attente === ongletEnAttente && lien?.dataset.posee) return;
  ongletEnAttente = attente;
  if (lien) { lien.href = iconeOnglet(attente); lien.dataset.posee = 'oui'; }
  document.title = titreOnglet(document.title);
}

// ---- Menu replié -------------------------------------------------------------------

/** Le menu replié en icônes, retenu dans ce navigateur comme le thème. */
const CLE_RAIL = 'ldr-rail';
const railReplie = () => lirePreference(CLE_RAIL) === 'replie';

/** Durées du repli du menu (ms) : le contenu s'efface, la largeur glisse, le contenu revient. */
const REPLI = { fondu: 110, largeur: 280 };
let repliEnCours = null;

/**
 * Replie le menu en une colonne d'icônes, ou le déplie ; replié, chaque lien
 * dit son nom au survol. Le contenu s'efface d'abord, la largeur glisse à
 * vide, puis il revient en fondu, surbrillance déjà recalée : sinon mots et
 * rubriques sauteraient pendant le glissement.
 */
function replierRail(replie, { anime = true } = {}) {
  const racine = document.documentElement;
  ecrirePreference(CLE_RAIL, replie ? 'replie' : 'deplie');
  const nav = document.getElementById('navigation');
  const bouton = nav.querySelector('#replier-rail');
  const libelle = replie ? 'Déplier le menu' : 'Replier le menu';
  bouton.innerHTML = icone(replie ? 'chevron-droite' : 'chevron-gauche', { taille: 16 });
  bouton.setAttribute('aria-label', libelle);
  bouton.title = libelle;
  bouton.setAttribute('aria-expanded', String(!replie));
  nav.querySelectorAll('.lien-nav').forEach((a) => { if (replie) a.title = a.dataset.libelle; else a.removeAttribute('title'); });
  clearTimeout(repliEnCours);
  if (!anime || mouvementReduit()) {
    nav.classList.remove('rail-en-change');
    racine.classList.toggle('rail-replie', replie);
    placerIndicateur({ anime: false });
    return;
  }
  nav.classList.add('rail-en-change');
  repliEnCours = setTimeout(() => {
    racine.classList.toggle('rail-replie', replie);
    repliEnCours = setTimeout(() => {
      placerIndicateur({ anime: false });
      // Deux images plus tard (surbrillance posée sans glisser), tout revient en fondu.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const indicateur = nav.querySelector('.indicateur-nav');
        if (indicateur) indicateur.style.transition = '';
        nav.classList.remove('rail-en-change');
      }));
    }, REPLI.largeur);
  }, REPLI.fondu);
}

/** Moment de la dernière écriture du livre, dans cette session. */
let derniereEcriture = null;
let minuteurEnregistrement = null;

/** « à l'instant », « il y a 3 min », « il y a 2 h » : l'âge de la dernière écriture. */
function ageEcriture() {
  const minutes = Math.floor((Date.now() - derniereEcriture) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.floor(minutes / 60)} h`;
}

/** Écrit l'état d'enregistrement en bas du menu ; l'heure exacte se lit au survol. */
function majEnregistrement() {
  const zone = document.getElementById('etat-enregistrement');
  if (!zone || !derniereEcriture) return;
  zone.innerHTML = `${icone('coche', { taille: 13 })}Enregistré ${ageEcriture()}`;
  const ligne = zone.parentElement;
  ligne.classList.add('montre-heure');
  ligne.title = `Enregistré à ${heureLisible(new Date(derniereEcriture))}, version ${etat.systeme?.version ?? ''}`;
  zone.removeAttribute('aria-hidden');
}

// Chaque écriture réussie du livre (voir `api.js`) : « Enregistré à l'instant »
// prend la place de la version, en fondu, puis vieillit tout seul
// (« il y a 2 min »). Les compteurs du menu suivent.
window.addEventListener('donnees-enregistrees', () => {
  derniereEcriture = Date.now();
  majEnregistrement();
  clearInterval(minuteurEnregistrement);
  minuteurEnregistrement = setInterval(majEnregistrement, 30_000);
  rafraichirCompteurs();
});

/** Relit les compteurs du livre (une requête locale, regroupée) et les pose dans le menu. */
let compteursEnAttente = null;
function rafraichirCompteurs() {
  clearTimeout(compteursEnAttente);
  compteursEnAttente = setTimeout(async () => {
    try {
      etat.systeme = { ...etat.systeme, ...(await api.systeme()) };
      majCompteurs();
    } catch { /* les compteurs attendront la prochaine écriture */ }
  }, 400);
}

function majCompteurs() {
  const compteurs = etat.systeme?.compteurs ?? {};
  document.querySelectorAll('#navigation .compte-nav[data-compte]').forEach((span) => {
    const n = compteurs[span.dataset.compte];
    span.textContent = n ? String(n) : '';
  });
}

/** La recherche dans tout le livre (Ctrl+K, ou le bouton du menu). */
function rechercher() {
  ouvrirRechercheGlobale({ pages: routesVisibles().map(({ chemin, label, icone: nomIcone }) => ({ chemin, label, icone: nomIcone })) });
}

/** Met le menu à jour sans le reconstruire : page courante, pastille URSSAF, thème, nom. */
function majRail({ anime = true } = {}) {
  const nav = document.getElementById('navigation');
  const { chemin } = decouperHash();
  const route = routeDe(chemin);
  nav.querySelectorAll('.lien-nav').forEach((a) => {
    const actif = !modeRestauration && a.dataset.route === route.chemin;
    // La page courante ne peut pas se signaler par la seule couleur du lien.
    if (actif) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const alerte = nav.querySelector('.alerte-nav');
  const texte = etat.parametres && !modeRestauration ? alerteUrssaf(etat.parametres) : '';
  if (alerte) {
    alerte.hidden = !texte;
    alerte.textContent = texte;
    alerte.classList.toggle('retard', texte === 'En retard');
  }
  nav.querySelector('#nom-entreprise').textContent = etat.parametres?.nomEntreprise ?? '';
  majCompteurs();
  // Une déclaration à faire, ou une copie sur clé en retard : l'onglet le dit.
  const externe = etat.systeme?.copieExterne;
  majOnglet(Boolean(texte || (!modeRestauration && externe?.active && externe.enRetard)));
  // Pendant la récupération des données, rien à chercher : le livre n'est pas lisible.
  nav.querySelector('#recherche-rail').hidden = modeRestauration;

  // Pas de copie hors de l'ordinateur, ou plus récente depuis une semaine : dit
  // discrètement en tête du pied de menu, avec ce qu'il faut faire.
  const copie = nav.querySelector('#etat-copie');
  const avis = modeRestauration ? null : avisCopie(etat.systeme?.copieExterne);
  copie.hidden = !avis;
  // Une seule ligne ; le conseil s'affiche au survol, et se lit avec le titre.
  copie.querySelector('.texte-etat-copie').innerHTML = avis ? `${avis.titre}<span class="hors-ecran"> : ${avis.conseil}</span>` : '';
  copie.title = avis?.conseil ?? '';

  const bouton = nav.querySelector('#bouton-theme');
  const sombre = themeCourant() === 'dark';
  bouton.innerHTML = icone(sombre ? 'soleil' : 'lune', { taille: 17 });
  bouton.setAttribute('aria-label', `Passer au thème ${sombre ? 'clair' : 'sombre'}`);
  bouton.title = `Thème ${sombre ? 'clair' : 'sombre'}`;
  // En dernier : ce qui précède (nom, avis de copie, Rechercher) déplace les liens.
  placerIndicateur({ anime });
}

/**
 * Pose la surbrillance sur le lien de la page courante. Elle couvre tout le
 * menu et n'en laisse voir, par découpe, que la place du lien : d'une page à
 * l'autre, seule la découpe glisse, sans animer ni largeur ni hauteur.
 */
function placerIndicateur({ anime = false } = {}) {
  const nav = document.getElementById('navigation');
  const indicateur = nav?.querySelector('.indicateur-nav');
  if (!indicateur) return;
  const courant = nav.querySelector('.lien-nav[aria-current="page"]');
  if (!courant) {
    indicateur.style.opacity = '0';
    return;
  }
  // Mesuré sans elle : sa hauteur précédente gonflerait celle du menu.
  indicateur.style.height = '0';
  indicateur.style.height = `${nav.scrollHeight}px`;
  indicateur.style.transition = anime && !mouvementReduit() ? '' : 'none';
  // Paramètres partage sa ligne avec le bouton du thème : la découpe prend sa
  // largeur. Mesurée à l'écran, sans arrondi.
  const zone = indicateur.getBoundingClientRect();
  const lien = courant.getBoundingClientRect();
  const [haut, droite, bas, gauche] = [lien.top - zone.top, zone.right - lien.right, zone.bottom - lien.bottom, lien.left - zone.left]
    .map((v) => `${v.toFixed(2)}px`);
  indicateur.style.clipPath = `inset(${haut} ${droite} ${bas} ${gauche} round var(--rayon))`;
  indicateur.style.opacity = '1';
}

/**
 * L'avis du pied de menu sur la copie externe (`{ titre, conseil }`), ou
 * `null` quand tout va bien. L'absence de copie n'est plus rappelée si
 * l'utilisateur l'a demandé (paramètres, section Sécurité) ; un retard, lui,
 * l'est toujours.
 */
function avisCopie(copie) {
  if (!copie) return null;
  if (!copie.active) {
    return etat.parametres?.signalerAbsenceCopie === false
      ? null
      : { titre: 'Aucune sauvegarde externe', conseil: 'Pensez à faire une sauvegarde.' };
  }
  if (!copie.enRetard) return null;
  if (!copie.derniereCopie) return { titre: 'Première copie pas encore faite', conseil: 'Branchez la clé ou le disque choisi.' };
  const jours = Math.floor((Date.now() - Date.parse(copie.derniereCopie)) / 86_400_000);
  return { titre: `Dernière copie il y a ${jours} jours`, conseil: 'Branchez la clé ou le disque pour la mettre à jour.' };
}

/** Le menu se reconstruit si ses pages ont changé ; vrai s'il était déjà juste. */
function menuAJour() {
  const liens = [...document.querySelectorAll('#navigation .lien-nav')].map((a) => a.dataset.route).join();
  if (liens === routesDuMenu().map((r) => r.chemin).join()) return true;
  construireRail();
  return false;
}

// Changer de type d'activité fait apparaître ou disparaître la page Achats ;
// déclarer une période éteint la pastille URSSAF.
window.addEventListener('parametres-modifies', () => { if (menuAJour()) majRail(); });
// Une application laissée ouverte d'un jour à l'autre : au retour sur la
// fenêtre, le menu suit la date (la Rétrospective y entre le 15 décembre).
document.addEventListener('visibilitychange', () => { if (!document.hidden && document.getElementById('navigation')?.children.length) menuAJour(); });
window.addEventListener('theme-modifie', () => majRail({ anime: false }));

// ---- Routage ---------------------------------------------------------------------

/** Découpe `#/recettes?nouvelle=1` en `{ chemin: 'recettes', params }`. */
function decouperHash() {
  const brut = window.location.hash.replace(/^#\/?/, '');
  const [chemin, chaine] = brut.split('?');
  return { chemin: chemin ?? '', params: new URLSearchParams(chaine ?? '') };
}

const routeDe = (chemin) => routesVisibles().find((r) => r.chemin === chemin) ?? ROUTES[0];

async function afficherVue() {
  if (modeRestauration) return;
  const { chemin, params } = decouperHash();
  const route = routeDe(chemin);

  // « Nouvelle recette » ou « Nouvel achat » depuis une autre page : le
  // panneau s'ouvre sur place ; on arrive au registre une fois la ligne ajoutée.
  const saisieSurPlace = route.chemin === 'recettes' && (params.get('nouvelle') || params.get('modele'))
    ? () => ouvrirNouvelleRecette({ modele: params.get('modele'), client: params.get('client') ?? '' })
    : route.chemin === 'achats' && params.get('nouveau') ? ouvrirNouvelAchat : null;
  if (saisieSurPlace && pageAffichee !== null && pageAffichee !== route.chemin) {
    // L'adresse de la saisie a été ajoutée à l'historique : on revient d'un
    // pas, ce qui rend à la page son adresse exacte (avec ce qu'elle y a
    // noté depuis, comme la période URSSAF) sans laisser de doublon. Ce retour
    // ne redessine rien : la page n'a pas changé.
    retourSansDessin = true;
    history.back();
    fermerMenu();
    saisieSurPlace().catch((erreur) => toast(erreur.message, 'erreur'));
    return;
  }
  const premiere = premierAffichage;

  // Le menu change aussitôt : l'indicateur glisse pendant que la page arrive.
  majRail({ anime: !premiere });
  premierAffichage = false;

  // Ce qui appartient à la page précédente s'en va avec elle.
  fermerPanneauOuvert();
  fermerMenu();
  const barre = document.getElementById('barre-selection');
  barre.hidden = true;
  barre.classList.remove('resultat');
  barre.onclick = null;

  const conteneur = document.getElementById('vue');

  /** Dessine la nouvelle page à la place de l'ancienne. */
  async function dessiner() {
    const contenuPrecedent = conteneur.innerHTML;
    // Squelette différé : en local une vue s'affiche en quelques millisecondes ;
    // le squelette n'apparaît qu'au-delà d'un court délai, si rien n'est encore dessiné.
    const minuteurSquelette = setTimeout(() => {
      if (conteneur.innerHTML === contenuPrecedent) conteneur.innerHTML = chargeur(route.forme);
    }, 180);
    try {
      pageAffichee = route.chemin;
      // Le bandeau (démonstration, mise à jour) se pose avant la page : posé
      // après, il la pousserait vers le bas une fois affichée.
      rendreBandeaux();
      await route.vue(conteneur, params);
      document.title = titreOnglet(route.chemin ? `${route.label} - Livre des recettes` : 'Livre des recettes');
      rendreBandeaux();
    } catch (erreur) {
      console.error(erreur);
      conteneur.innerHTML = `
        <div class="page"><section class="carte erreur-page">
          <div class="carte-corps">
            <h2>Cette page n’a pas pu s’afficher</h2>
            <p>${echapperHtml(erreur.message)}</p>
            <p>Vos données ne sont pas en cause : elles sont enregistrées dans leur fichier.</p>
            <button type="button" class="btn btn-principal" id="recharger-page">${icone('restaurer', { taille: 16 })}Recharger la page</button>
          </div>
        </section></div>`;
      // Dire « rechargez » sans donner de quoi le faire laisse l'utilisateur
      // chercher le raccourci de son navigateur.
      conteneur.querySelector('#recharger-page').addEventListener('click', () => window.location.reload());
    } finally {
      clearTimeout(minuteurSquelette);
    }
    window.scrollTo(0, 0);
  }

  // Fondu enchaîné : l'ancienne page s'efface pendant que la nouvelle
  // apparaît. Le navigateur fige l'écran le temps du dessin (quelques
  // millisecondes en local), puis mêle les deux images ; le menu reste net.
  if (premiere) {
    await dessiner();
    reveler(conteneur);
  } else {
    await enFondu(dessiner);
  }
  document.getElementById('contenu').focus({ preventScroll: true });
  surveillerEntete();
}

// ---- En-tête compact ---------------------------------------------------------------

let observateurEntete = null;
let enteteSurveillee = null;

/**
 * Dans une page longue, le titre et le bouton principal partent avec le
 * défilement. Dès que l'en-tête sort de l'écran, une barre fine le remplace
 * en haut : le titre en petit et les mêmes boutons (qui déclenchent les
 * vrais). Rien ne se resserre dans la page : aucun saut pendant le défilement.
 *
 * @param {{ garderEtat?: boolean }} [options] `garderEtat` : même page
 *   redessinée, la barre reste comme elle est jusqu'à la nouvelle mesure.
 */
function surveillerEntete({ garderEtat = false } = {}) {
  observateurEntete?.disconnect();
  const barre = document.getElementById('barre-compacte');
  const entete = document.querySelector('#vue .entete-page');
  enteteSurveillee = entete;
  if (!garderEtat || !entete) {
    barre.classList.remove('visible');
    document.documentElement.classList.remove('entete-compact-visible');
  }
  if (!entete) { barre.innerHTML = ''; return; }
  const titre = entete.querySelector('h1')?.textContent.trim() ?? '';
  const boutons = [...entete.querySelectorAll('.actions .btn')];
  barre.innerHTML = `<span class="barre-compacte-titre">${echapperHtml(titre)}</span>
    <span class="barre-compacte-actions">${boutons.map((b, i) => `<button type="button" class="${b.className} btn-petit" data-relais="${i}">${b.innerHTML}</button>`).join('')}</span>`;
  barre.querySelectorAll('[data-relais]').forEach((relais) => relais.addEventListener('click', () => boutons[Number(relais.dataset.relais)].click()));
  observateurEntete = new IntersectionObserver(([entree]) => {
    const visible = !entree.isIntersecting && entree.boundingClientRect.top < 0;
    barre.classList.toggle('visible', visible);
    // Les titres collés des registres se rangent dessous.
    document.documentElement.classList.toggle('entete-compact-visible', visible);
    barre.toggleAttribute('inert', !visible);
    barre.setAttribute('aria-hidden', String(!visible));
  }, { threshold: 0 });
  observateurEntete.observe(entete);
}
// Une page qui se redessine en entier (le tableau de bord, à un changement
// d'année ou un Ctrl+Z) remplace son en-tête : la barre suit le nouveau.
new MutationObserver(() => {
  if (document.querySelector('#vue .entete-page') !== enteteSurveillee) surveillerEntete({ garderEtat: true });
}).observe(document.getElementById('vue'), { childList: true });

/**
 * Premier affichage : la page apparaît en fondu. La classe tombe une fois le
 * fondu joué : sinon, une page redessinée sur place (changement d'année)
 * rejouerait son apparition depuis le blanc.
 */
function reveler(conteneur) {
  conteneur.classList.remove('vue-entre');
  void conteneur.offsetWidth;
  conteneur.classList.add('vue-entre');
  const fin = (evenement) => {
    if (evenement.target.parentElement !== conteneur) return;
    conteneur.classList.remove('vue-entre');
    conteneur.removeEventListener('animationend', fin);
  };
  conteneur.addEventListener('animationend', fin);
}

// ---- Bandeaux globaux ---------------------------------------------------------------

/**
 * Bandeau rappelant que le livre affiché est le jeu de démonstration, avec un
 * bouton pour tout effacer et commencer son vrai livre.
 */
function bandeauDemo() {
  if (!etat.parametres?.jeuDemo) return '';
  return `
    <div class="bandeau-global">
      ${icone('info', { taille: 18 })}
      <span>Vous explorez un <strong>jeu de démonstration</strong>. Effacez-le quand vous voulez commencer votre vrai livre des recettes.</span>
      <button type="button" class="btn btn-petit" id="effacer-demo">${icone('corbeille', { taille: 15 })}Tout effacer</button>
    </div>`;
}

/** Dernière réponse de `/api/maj`, ou `null` tant que rien n'est connu. */
let miseAJour = null;

/**
 * Bandeau annonçant une nouvelle version, affiché en tête de page quelle que
 * soit la page. L'exécutable sait se remplacer lui-même ; une installation
 * depuis les sources renvoie vers la page des versions.
 */
function bandeauMaj() {
  if (!miseAJour?.disponible) return '';
  // Une annonce courte : le numéro, une phrase, et deux gestes.
  const action = miseAJour.remplacable
    ? `<a class="lien-bouton" href="${echapperHtml(miseAJour.page)}" target="_blank" rel="noopener">Ce qui change${icone('externe', { taille: 13 })}</a>
       <button type="button" class="btn btn-petit btn-principal" id="lancer-maj">${icone('telecharger', { taille: 15 })}Mettre à jour</button>`
    : `<a class="btn btn-petit" href="${echapperHtml(miseAJour.page)}" target="_blank" rel="noopener">Voir la nouvelle version</a>`;
  return `
    <div class="annonce-maj" title="Vous utilisez la version ${echapperHtml(etat.systeme.version)}">
      <span class="annonce-numero">${echapperHtml(miseAJour.version)}</span>
      <span class="annonce-texte">Une nouvelle version est disponible<span class="hors-ecran"> : la ${echapperHtml(miseAJour.version)} (vous utilisez la ${echapperHtml(etat.systeme.version)})</span></span>
      ${action}
    </div>`;
}

/**
 * Rend le bandeau global : un seul à la fois, la mise à jour passant devant
 * la démonstration. Empilés, ils repoussaient le titre de la page et son
 * action principale.
 */
let bandeauAffiche = '';
function rendreBandeaux() {
  const contenu = modeRestauration ? '' : (bandeauMaj() || bandeauDemo());
  // Inchangé : rien à redessiner, ni à rebrancher, ni à rejouer. (Comparer à
  // `innerHTML` ne marcherait pas : le navigateur réécrit les icônes SVG.)
  if (contenu === bandeauAffiche) return;
  bandeauAffiche = contenu;
  document.getElementById('bandeaux').innerHTML = contenu;
  document.getElementById('lancer-maj')?.addEventListener('click', appliquerMiseAJour);
  document.getElementById('effacer-demo')?.addEventListener('click', async (evenement) => {
    const bouton = evenement.currentTarget;
    const accord = await confirmer({
      titre: 'Effacer le jeu de démonstration ?',
      suites: [
        { perd: 'Les recettes, achats, clients et factures de démonstration' },
        { garde: 'Une sauvegarde est faite juste avant' },
        { garde: 'L’accueil guidé reprend pour commencer votre vrai livre' }
      ],
      boutonOk: 'Tout effacer',
      maintenir: true
    });
    if (!accord) return;
    bouton.disabled = true;
    try {
      await api.repartirDeZero();
      // Livre vide : l'accueil guidé reprend au rechargement.
      window.location.hash = '#/';
      window.location.reload();
    } catch (erreur) {
      bouton.disabled = false;
      toast(erreur.message, 'erreur');
    }
  });
}

// ---- Mise à jour de l'application -----------------------------------------------------

async function appliquerMiseAJour(evenement) {
  // `currentTarget` est remis à null dès la fin de l'événement : le bouton
  // doit être retenu AVANT la moindre attente.
  const bouton = evenement.currentTarget;
  const accord = await confirmer({
    titre: `Installer la version ${miseAJour.version} ?`,
    message: 'L’application va se mettre à jour puis redémarrer. Vos données ne sont pas touchées.',
    boutonOk: 'Mettre à jour',
    danger: false,
    iconeOk: 'telecharger'
  });
  if (!accord) return;

  bouton.disabled = true;
  const attente = dialogueAttente({
    titre: `Mise à jour vers la version ${miseAJour.version}`,
    message: 'Ne fermez pas cette fenêtre : vos données ne sont pas touchées.',
    etapes: ['Téléchargement et vérification de la nouvelle version', 'Redémarrage de l’application']
  });
  try {
    await api.appliquerMiseAJour();
    attente.avancer();
    await attendreRedemarrage();
    window.location.reload();
  } catch (erreur) {
    attente.fermer();
    bouton.disabled = false;
    toast(erreur.message, 'erreur');
  }
}

/**
 * Attend que le serveur réponde de nouveau, après son redémarrage. Jusqu'à
 * deux minutes : si la nouvelle version ne démarre pas, l'ancienne attend une
 * minute avant de se remettre en place (voir `src/maj.js`).
 */
async function attendreRedemarrage() {
  for (let essai = 0; essai < 120; essai += 1) {
    await new Promise((suite) => setTimeout(suite, 1000));
    try {
      await api.systeme();
      return;
    } catch { /* pas encore reparti : on patiente */ }
  }
  throw new Error('L’application n’a pas redémarré. Relancez-la à la main.');
}

// ---- Erreurs inattendues ----------------------------------------------------------------

// Une erreur de programmation ne doit jamais rester invisible : sans cela,
// un bouton peut sembler ne rien faire, sans que l'utilisateur comprenne.
function signalerErreurInattendue(erreur) {
  console.error(erreur);
  toast('Une erreur inattendue est survenue. Rechargez la page si le problème persiste.', 'erreur');
}
window.addEventListener('error', (evenement) => signalerErreurInattendue(evenement.error ?? evenement.message));
window.addEventListener('unhandledrejection', (evenement) => signalerErreurInattendue(evenement.reason));

// Un fichier lâché à côté de sa cible ne doit pas remplacer l'application
// par le PDF : le navigateur l'ouvrirait à la place de la page.
for (const type of ['dragover', 'drop']) {
  window.addEventListener(type, (evenement) => {
    if ([...(evenement.dataTransfer?.types ?? [])].includes('Files')) evenement.preventDefault();
  });
}

// Lien d'évitement : il mène au contenu sans toucher à l'adresse (le routeur
// y lirait une page).
document.querySelector('.lien-evitement')?.addEventListener('click', (evenement) => {
  evenement.preventDefault();
  document.getElementById('contenu').focus();
});

// ---- Annuler / Rétablir (Ctrl+Z / Ctrl+Y) ---------------------------------------------

window.addEventListener('keydown', async (evenement) => {
  if (!(evenement.ctrlKey || evenement.metaKey) || evenement.altKey) return;
  const touche = evenement.key.toLowerCase();
  const veutAnnuler = touche === 'z' && !evenement.shiftKey;
  const veutRetablir = touche === 'y' || (touche === 'z' && evenement.shiftKey);
  if (!veutAnnuler && !veutRetablir) return;

  // Dans un champ de saisie, un panneau ou une boîte de dialogue, on laisse
  // le comportement natif du navigateur (annulation de texte).
  const cible = evenement.target;
  if (cible instanceof Element && cible.closest('input, textarea, select')) return;
  if (document.querySelector('dialog[open]')) return;

  evenement.preventDefault();
  // Un menu ouvert (« … », liste des années) visait l'état d'avant : il se referme.
  fermerMenu();
  try {
    const fait = veutAnnuler ? await annuler() : await retablir();
    if (fait) {
      toast(veutAnnuler ? 'Action annulée.' : 'Action rétablie.');
      // Un registre affiché se recharge lui-même, lignes et total animés ;
      // ailleurs, la page est redessinée.
      const surPlace = !window.dispatchEvent(new Event('historique-applique', { cancelable: true }));
      if (!surPlace) afficherVue();
    }
  } catch (erreur) {
    toast(erreur.message, 'erreur');
  }
});

// ---- Récupération des données (fichier illisible ou disparu) ---------------------------------

/**
 * Écran affiché au démarrage quand le fichier de données est illisible, ou
 * qu'il a disparu alors que des sauvegardes existent. Il propose de le
 * reconstituer à partir d'une sauvegarde automatique, qui vit hors du dossier
 * de données et survit donc à sa suppression.
 *
 * Rien n'est modifiable tant que l'utilisateur n'a pas choisi : restaurer,
 * ou repartir d'un livre vide quand la disparition était volontaire.
 */
async function afficherEcranRestauration({ titre, introduction, message, disparition = false }) {
  modeRestauration = true;
  majRail({ anime: false });
  const conteneur = document.getElementById('vue');
  const { sauvegardes } = await api.listerSauvegardes().catch(() => ({ sauvegardes: [] }));

  conteneur.innerHTML = `
    <div class="page">
      <header class="entete-page">
        <div>
          <h1>${echapperHtml(titre)}</h1>
          <p class="sous-titre">${echapperHtml(introduction)}</p>
        </div>
      </header>
      <p class="avis">${icone('cercle-alerte', { taille: 17 })}<span>${echapperHtml(message)}</span></p>
      <section class="carte">
        <div class="carte-corps restauration">
          <p>Choisissez une sauvegarde à restaurer (la plus récente d’abord). Le fichier actuel sera d’abord mis de côté : rien n’est effacé.</p>
          <div id="liste-restauration">${sauvegardes.length === 0
            ? '<p class="attenue">Aucune sauvegarde sur cet ordinateur.</p>'
            : listeSauvegardes(sauvegardes)}</div>
          <p class="notes">Une sauvegarde sur une clé USB, un disque ou dans un fichier ? Elle se reprend aussi.</p>
          <button type="button" class="btn" id="reprise-restauration">${icone('import', { taille: 16 })}Reprendre une sauvegarde</button>
          ${disparition ? `
            <p class="notes">Vous aviez supprimé ces données volontairement ? Repartez d’un livre vide : les sauvegardes ci-dessus resteront disponibles.</p>
            <button type="button" class="btn" id="repartir-de-zero">${icone('plus', { taille: 16 })}Repartir d’un livre vide</button>` : ''}
        </div>
      </section>
    </div>`;

  conteneur.querySelector('#reprise-restauration').addEventListener('click', async () => {
    if (await ouvrirReprise()) window.location.reload();
  });
  conteneur.querySelector('#repartir-de-zero')?.addEventListener('click', async () => {
    const accord = await confirmer({
      titre: 'Repartir d’un livre vide ?',
      suites: [
        { perd: 'L’application redémarre sur un livre sans aucune recette' },
        { garde: 'Vos sauvegardes restent : vous pourrez encore les restaurer' }
      ],
      boutonOk: 'Repartir de zéro',
      danger: false,
      iconeOk: 'plus'
    });
    if (!accord) return;
    try {
      await api.repartirDeZero();
      window.location.reload();
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
  });

  brancherRestauration(conteneur.querySelector('#liste-restauration'));
  reveler(conteneur);
}

// ---- Livre momentanément inaccessible -----------------------------------------------------

/**
 * Écran d'un livre présent mais illisible pour l'instant (resté dans iCloud,
 * OneDrive hors connexion…). Il se recharge seul dès que le fichier revient.
 */
function afficherEcranIndisponible(message) {
  modeRestauration = true;
  majRail({ anime: false });
  const conteneur = document.getElementById('vue');
  conteneur.innerHTML = `
    <div class="page">
      <header class="entete-page">
        <div>
          <h1>Livre momentanément inaccessible</h1>
          <p class="sous-titre">Le fichier du livre est bien là, mais il ne peut pas être lu pour l’instant. Rien n’y a été modifié.</p>
        </div>
      </header>
      <p class="avis">${icone('cercle-alerte', { taille: 17 })}<span>${echapperHtml(message)}</span></p>
      <section class="carte"><div class="carte-corps">
        <p>Cette page se rouvre d’elle-même dès que le livre est de nouveau lisible.</p>
        <div class="actions"><button type="button" class="btn" id="reessayer">${icone('restaurer', { taille: 16 })}Réessayer maintenant</button></div>
      </div></section>
    </div>`;
  conteneur.querySelector('#reessayer').addEventListener('click', () => window.location.reload());
  const attente = setInterval(async () => {
    try {
      if (!(await api.systeme()).indisponible) {
        clearInterval(attente);
        window.location.reload();
      }
    } catch { /* serveur arrêté : l'utilisateur relancera */ }
  }, 5000);
  reveler(conteneur);
}

/**
 * Suit le livre pendant que la page est ouverte : l'indication de la copie
 * externe reste à jour, et un livre devenu inaccessible (ou revenu) est relu.
 */
function surveillerLivre() {
  setInterval(async () => {
    if (document.visibilityState !== 'visible' || modeRestauration) return;
    let systeme;
    try {
      systeme = await api.systeme();
    } catch {
      return;
    }
    const avant = etat.systeme;
    etat.systeme = systeme;
    majRail({ anime: false });
    if (Boolean(systeme.indisponible) !== Boolean(avant.indisponible)) window.location.reload();
  }, 15_000);
}

// ---- Démarrage ---------------------------------------------------------------------------

construireRail();
// ---- Accueil guidé ----------------------------------------------------------------------

/** Premier lancement (rien de configuré, accueil jamais fait), ou accueil interrompu. */
const accueilAttendu = () => etat.parametres.accueil === 'en-cours' ||
  (etat.systeme.premierLancement && etat.parametres.accueil !== 'termine');

function ouvrirAccueil() {
  // L'accueil s'affiche toujours en clair, tant que l'utilisateur n'a pas
  // choisi de thème : premier contact plus accueillant, quel que soit le
  // réglage sombre du système.
  if (!themeChoisi()) appliquerThemeEphemere('light');
  lancerAccueil({
    // L'accueil se referme sur une page : l'état est relu (paramètres, jeu de
    // démonstration éventuel), le menu refait, puis la page dessinée derrière lui.
    fermer: async (route) => {
      revenirAuThemeParDefaut();
      await chargerEtat();
      construireRail();
      history.replaceState(null, '', `#/${route}`);
      await afficherVue();
    }
  });
}
// Les Paramètres proposent de reprendre l'accueil tant que rien n'est configuré.
window.addEventListener('ouvrir-accueil', ouvrirAccueil);

// Écouteurs délégués : posés une fois, ils valent pour toutes les vues, qui
// se redessinent entièrement à chaque navigation.
installerInfobulles();
installerReponsesControles();
// Raccourcis clavier (N, A, /, ?, Ctrl+K) : ni pendant l'accueil, ni sur l'écran de récupération.
installerRaccourcis({
  disponibles: () => Boolean(etat.parametres) && !modeRestauration && !document.querySelector('.accueil'),
  rechercher
});
window.addEventListener('hashchange', () => {
  if (retourSansDessin) { retourSansDessin = false; return; }
  afficherVue();
});
// Les polices chargées peuvent décaler les liens : l'indicateur se recale une fois.
document.fonts?.ready.then(() => majRail({ anime: false }));
// Paramètres est en bas du menu : sa place suit la hauteur de la fenêtre.
window.addEventListener('resize', () => majRail({ anime: false }));

chargerEtat()
  .then(() => {
    // Les pages dépendent des paramètres : le menu est refait une fois ceux-ci connus.
    construireRail();
    if (etat.systeme.corruption) {
      afficherEcranRestauration({
        titre: 'Données à restaurer',
        introduction: 'Le fichier de données n’a pas pu être lu. Restaurez l’une de vos sauvegardes automatiques pour reprendre.',
        message: etat.systeme.corruption
      });
    } else if (etat.systeme.indisponible) {
      afficherEcranIndisponible(etat.systeme.indisponible);
    } else if (etat.systeme.donneesAbsentes) {
      afficherEcranRestauration({
        titre: 'Fichier de données introuvable',
        introduction: 'Vos sauvegardes automatiques, elles, sont toujours là : restaurez-en une pour reprendre.',
        message: `Aucun fichier « ${etat.systeme.fichierDonnees} ». Il a pu être supprimé, ` +
          'déplacé, ou perdu par un dossier synchronisé.',
        disparition: true
      });
    } else if (accueilAttendu()) {
      ouvrirAccueil();
      // Une découverte : la version est notée (rien n'est présenté), pour que
      // l'ouverture suivante ne parle pas de « nouveautés » à qui débute.
      montrerNouveautes(etat.systeme.version, { decouverte: true });
    } else {
      afficherVue().then(() => montrerNouveautes(etat.systeme.version, {
        // Sans recette, c'est une découverte : rien de « nouveau » à présenter.
        decouverte: !(etat.systeme.compteurs?.recettes > 0)
      }));
    }
    // Une mise à jour qui n'a pas pu démarrer a été annulée : l'utilisateur le
    // sait, une fois (pas à chaque rechargement de la page).
    const echec = etat.systeme.majEchouee;
    if (echec) {
      toast(`La version ${echec.version ?? 'nouvelle'} n’a pas pu démarrer : la version précédente a été rétablie.`, 'erreur');
      api.echecMajVu().catch(() => {});
    }
    surveillerLivre();
    // `npm run essai` seulement : le banc d'essai des développeurs (voir scripts/essai/).
    if (etat.systeme.essai) import('/essai/banc.js').then((m) => m.installerBanc()).catch(console.error);
    // Recherche d'une nouvelle version, en arrière-plan : l'application est
    // utilisable immédiatement, et hors ligne rien ne se voit.
    api.miseAJour()
      .then((reponse) => {
        miseAJour = reponse;
        rendreBandeaux();
      })
      .catch(() => { /* vérification impossible : sans conséquence */ });
  })
  .catch((erreur) => {
    console.error(erreur);
    document.getElementById('vue').innerHTML = `
      <div class="page"><section class="carte erreur-page"><div class="carte-corps">
        <h2>Connexion impossible</h2>
        <p>Le serveur local ne répond pas : ${echapperHtml(erreur.message)}</p>
      </div></section></div>`;
  });
