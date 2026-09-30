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
  echapperHtml, toast, confirmer, dialogueAttente, chargeur, installerInfobulles, mouvementReduit, enFondu
} from './ui.js';
import { icone } from './icones.js';
import { annuler, retablir } from './historique.js';
import { listeSauvegardes, brancherRestauration } from './sauvegardes.js';
import { ouvrirReprise } from './fichier-sauvegarde.js';
import { basculerTheme, themeCourant, themeChoisi, appliquerThemeEphemere, revenirAuThemeParDefaut } from './theme.js';
import { fermerPanneauOuvert } from './panneau.js';
import { lancerAccueil } from './accueil.js';
import { alerteUrssaf } from '/partage/declarations.js';
import { vueTableauDeBord } from './vues/tableau-de-bord.js';
import { vueRecettes } from './vues/recettes.js';
import { vueAchats } from './vues/achats.js';
import { vueUrssaf } from './vues/urssaf.js';
import { vueClients } from './vues/clients.js';
import { vueImport } from './vues/import.js';
import { vueExports } from './vues/exports.js';
import { vueParametres } from './vues/parametres.js';

/**
 * Définition unique des pages : sert à la fois au menu et au routage, dans
 * l'ordre et les groupes du menu (le suivi, les documents, les réglages). Une
 * page peut porter une condition d'affichage (`utile`).
 */
const ROUTES = [
  { chemin: '', label: 'Tableau de bord', icone: 'tableau-de-bord', vue: vueTableauDeBord, forme: 'tableau-de-bord', groupe: 1 },
  { chemin: 'recettes', label: 'Recettes', icone: 'recettes', vue: vueRecettes, forme: 'liste', groupe: 1 },
  { chemin: 'achats', label: 'Achats', icone: 'achats', vue: vueAchats, utile: registreAchatsUtile, forme: 'liste', groupe: 1 },
  { chemin: 'urssaf', label: 'URSSAF', icone: 'urssaf', vue: vueUrssaf, forme: 'simple', groupe: 1, alerte: true },
  { chemin: 'clients', label: 'Clients', icone: 'clients', vue: vueClients, forme: 'liste', groupe: 1 },
  { chemin: 'import', label: 'Import CSV', icone: 'import', vue: vueImport, forme: 'simple', groupe: 2 },
  { chemin: 'exports', label: 'Exports', icone: 'telecharger', vue: vueExports, forme: 'simple', groupe: 2 },
  { chemin: 'parametres', label: 'Paramètres', icone: 'parametres', vue: vueParametres, forme: 'simple', groupe: 3 }
];

/** Vrai tant que les données sont corrompues : la navigation est suspendue. */
let modeRestauration = false;

/** Premier affichage : l'indicateur du menu se pose sans glisser. */
let premierAffichage = true;

// ---- Menu (rail) ----------------------------------------------------------------

/** Pages à afficher, selon les paramètres de l'utilisateur. */
const routesVisibles = () => ROUTES.filter((r) => !r.utile || r.utile());

function construireRail() {
  const nav = document.getElementById('navigation');
  const lien = (r) => `<a class="lien-nav" href="#/${r.chemin}" data-route="${r.chemin}">
      ${icone(r.icone, { taille: 18 })}<span>${echapperHtml(r.label)}</span>${r.alerte ? '<span class="alerte-nav" hidden></span>' : ''}
    </a>`;
  const liens = (n) => routesVisibles().filter((r) => r.groupe === n).map(lien).join('');
  const groupe = (n) => `<div class="groupe-nav">${liens(n)}</div>`;
  nav.innerHTML = `
    <a class="marque" href="#/" aria-label="Livre des recettes, tableau de bord">
      <span class="marque-logo">${icone('livre', { taille: 18 })}</span>
      <span class="marque-nom">Livre des recettes<small id="nom-entreprise"></small></span>
    </a>
    <span class="indicateur-nav" aria-hidden="true"></span>
    <div class="nav-principale">${groupe(1)}${groupe(2)}</div>
    <div class="pied-rail">
      <a class="etat-copie" id="etat-copie" href="#/parametres?section=securite" hidden>
        ${icone('disque', { taille: 16 })}<span class="texte-etat-copie"></span>
      </a>
      <button type="button" class="bascule-theme" id="bouton-theme"></button>
      ${liens(3)}
      <p class="mention-locale"><span id="version-app">${etat.systeme ? `Version ${echapperHtml(etat.systeme.version)}` : ''}</span>100 % local, vos données restent chez vous</p>
    </div>`;
  nav.querySelector('#bouton-theme').addEventListener('click', (evenement) => basculerTheme(evenement.currentTarget));
  majRail({ anime: false });
}

/** Met le menu à jour sans le reconstruire : page courante, pastille URSSAF, thème, nom. */
function majRail({ anime = true } = {}) {
  const nav = document.getElementById('navigation');
  const { chemin } = decouperHash();
  const route = routeDe(chemin);
  let courant = null;
  nav.querySelectorAll('.lien-nav').forEach((a) => {
    const actif = !modeRestauration && a.dataset.route === route.chemin;
    // La page courante ne peut pas se signaler par la seule couleur du lien.
    if (actif) { a.setAttribute('aria-current', 'page'); courant = a; } else a.removeAttribute('aria-current');
  });
  const indicateur = nav.querySelector('.indicateur-nav');
  if (courant) {
    indicateur.style.transition = anime && !mouvementReduit() ? '' : 'none';
    indicateur.style.transform = `translateY(${courant.offsetTop}px)`;
    indicateur.style.height = `${courant.offsetHeight}px`;
    indicateur.style.opacity = '1';
  } else {
    indicateur.style.opacity = '0';
  }

  const alerte = nav.querySelector('.alerte-nav');
  const texte = etat.parametres && !modeRestauration ? alerteUrssaf(etat.parametres) : '';
  if (alerte) {
    alerte.hidden = !texte;
    alerte.textContent = texte;
    alerte.classList.toggle('retard', texte === 'En retard');
  }
  nav.querySelector('#nom-entreprise').textContent = etat.parametres?.nomEntreprise ?? '';

  // Pas de copie hors de l'ordinateur, ou plus récente depuis une semaine : dit
  // discrètement en tête du pied de menu, avec ce qu'il faut faire.
  const copie = nav.querySelector('#etat-copie');
  const avis = modeRestauration ? null : avisCopie(etat.systeme?.copieExterne);
  copie.hidden = !avis;
  copie.querySelector('.texte-etat-copie').innerHTML = avis ? `<strong>${avis.titre}</strong>${avis.conseil}` : '';

  const bouton = nav.querySelector('#bouton-theme');
  const sombre = themeCourant() === 'dark';
  bouton.innerHTML = `${icone(sombre ? 'soleil' : 'lune', { taille: 17 })}<span>Thème ${sombre ? 'clair' : 'sombre'}</span>`;
  bouton.setAttribute('aria-label', `Passer au thème ${sombre ? 'clair' : 'sombre'}`);
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
      : { titre: 'Aucune copie hors de cet ordinateur', conseil: 'Pensez à faire une sauvegarde.' };
  }
  if (!copie.enRetard) return null;
  if (!copie.derniereCopie) return { titre: 'Copie hors de l’ordinateur pas encore faite', conseil: 'Branchez la clé ou le disque choisi.' };
  const jours = Math.floor((Date.now() - Date.parse(copie.derniereCopie)) / 86_400_000);
  return { titre: `Dernière copie il y a ${jours} jours`, conseil: 'Branchez la clé ou le disque pour la mettre à jour.' };
}

// Changer de type d'activité fait apparaître ou disparaître la page Achats ;
// déclarer une période éteint la pastille URSSAF.
window.addEventListener('parametres-modifies', () => {
  const liens = [...document.querySelectorAll('#navigation .lien-nav')].map((a) => a.dataset.route).join();
  if (liens !== routesVisibles().map((r) => r.chemin).join()) construireRail();
  else majRail();
});
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
  const premiere = premierAffichage;

  // Le menu change aussitôt : l'indicateur glisse pendant que la page arrive.
  majRail({ anime: !premiere });
  premierAffichage = false;

  // Ce qui appartient à la page précédente s'en va avec elle.
  fermerPanneauOuvert();
  document.querySelector('.menu-contextuel')?.remove();
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
      await route.vue(conteneur, params);
      document.title = route.chemin ? `${route.label} · Livre des recettes` : 'Livre des recettes';
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
}

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
  const action = miseAJour.remplacable
    ? `<a class="lien-bouton" href="${echapperHtml(miseAJour.page)}" target="_blank" rel="noopener">Nouveautés</a>
       <button type="button" class="btn btn-petit btn-principal" id="lancer-maj">${icone('telecharger', { taille: 15 })}Mettre à jour</button>`
    : `<a class="btn btn-petit" href="${echapperHtml(miseAJour.page)}" target="_blank" rel="noopener">Voir la nouvelle version</a>`;
  return `
    <div class="bandeau-global">
      ${icone('etincelle', { taille: 18 })}
      <span>Version ${echapperHtml(miseAJour.version)} disponible (vous utilisez la ${echapperHtml(etat.systeme.version)}).</span>
      ${action}
    </div>`;
}

/**
 * Rend le bandeau global : un seul à la fois, la mise à jour passant devant
 * la démonstration. Empilés, ils repoussaient le titre de la page et son
 * action principale.
 */
function rendreBandeaux() {
  const zone = document.getElementById('bandeaux');
  zone.innerHTML = modeRestauration ? '' : (bandeauMaj() || bandeauDemo());
  document.getElementById('lancer-maj')?.addEventListener('click', appliquerMiseAJour);
  document.getElementById('effacer-demo')?.addEventListener('click', async (evenement) => {
    const bouton = evenement.currentTarget;
    const accord = await confirmer({
      titre: 'Effacer le jeu de démonstration ?',
      message: 'Les données de démonstration seront supprimées pour repartir sur un livre vide.',
      boutonOk: 'Tout effacer'
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
    message: 'Téléchargement en cours… Ne fermez pas cette fenêtre.'
  });
  try {
    await api.appliquerMiseAJour();
    attente.etat('L’application redémarre…');
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
  try {
    const fait = veutAnnuler ? await annuler() : await retablir();
    if (fait) {
      toast(veutAnnuler ? 'Action annulée.' : 'Action rétablie.');
      afficherVue();
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
      message: 'L’application redémarrera sur un livre sans aucune recette. ' +
        'Vos sauvegardes ne sont pas effacées : vous pourrez encore les restaurer.',
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
window.addEventListener('hashchange', afficherVue);
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
    } else {
      afficherVue();
    }
    // Une mise à jour qui n'a pas pu démarrer a été annulée : l'utilisateur le
    // sait, une fois (pas à chaque rechargement de la page).
    const echec = etat.systeme.majEchouee;
    if (echec) {
      toast(`La version ${echec.version ?? 'nouvelle'} n’a pas pu démarrer : la version précédente a été rétablie.`, 'erreur');
      api.echecMajVu().catch(() => {});
    }
    surveillerLivre();
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
