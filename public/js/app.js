/**
 * Point d'entrée du navigateur : routage par ancre (`#/recettes`, …),
 * construction de la navigation, gestion du thème, raccourcis
 * Annuler / Rétablir et chargement de l'état global, sans aucun framework
 * ni étape de build.
 */

import { api } from './api.js';
import { chargerEtat, etat, registreAchatsUtile } from './etat.js';
import {
  echapperHtml, toast, confirmer, dialogueAttente, chargeur, installerInfobulles
} from './ui.js';
import { icone } from './icones.js';
import { annuler, retablir } from './historique.js';
import { vueTableauDeBord } from './vues/tableau-de-bord.js';
import { vueRecettes } from './vues/recettes.js';
import { vueAchats } from './vues/achats.js';
import { vueUrssaf } from './vues/urssaf.js';
import { vueClients } from './vues/clients.js';
import { vueImport } from './vues/import.js';
import { vueExports } from './vues/exports.js';
import { vueParametres } from './vues/parametres.js';

/**
 * Définition unique des onglets : sert à la fois à la navigation et au
 * routage. Un onglet peut porter une condition d'affichage (`utile`).
 */
const ROUTES = [
  { chemin: '', label: 'Tableau de bord', icone: 'tableau-de-bord', vue: vueTableauDeBord, forme: 'tableau-de-bord' },
  { chemin: 'recettes', label: 'Recettes', icone: 'recettes', vue: vueRecettes, forme: 'liste' },
  { chemin: 'achats', label: 'Achats', icone: 'achats', vue: vueAchats, utile: registreAchatsUtile, forme: 'liste' },
  { chemin: 'urssaf', label: 'URSSAF', icone: 'urssaf', vue: vueUrssaf, forme: 'simple' },
  { chemin: 'clients', label: 'Clients', icone: 'clients', vue: vueClients, forme: 'liste' },
  { chemin: 'import', label: 'Import CSV', icone: 'import', vue: vueImport, forme: 'simple' },
  { chemin: 'exports', label: 'Exports', icone: 'exports', vue: vueExports, forme: 'simple' },
  { chemin: 'parametres', label: 'Paramètres', icone: 'parametres', vue: vueParametres, forme: 'simple' }
];

const CLE_THEME = 'ldr-theme';

/** Vrai tant que les données sont corrompues : la navigation est suspendue. */
let modeRestauration = false;

// ---- Thème -----------------------------------------------------------------

/** Applique le thème (« light » par défaut) et mémorise le choix. */
function appliquerTheme(theme) {
  const valide = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = valide;
  try { localStorage.setItem(CLE_THEME, valide); } catch { /* stockage indisponible : sans gravité */ }
  const bouton = document.getElementById('bouton-theme');
  if (bouton) {
    const versClair = valide === 'dark';
    bouton.innerHTML = icone(versClair ? 'soleil' : 'lune') +
      `<span>Thème ${versClair ? 'clair' : 'sombre'}</span>`;
    bouton.setAttribute('aria-label', `Passer au thème ${versClair ? 'clair' : 'sombre'}`);
  }
}

function themeInitial() {
  try {
    const enregistre = localStorage.getItem(CLE_THEME);
    if (enregistre === 'light' || enregistre === 'dark') return enregistre;
  } catch { /* ignore */ }
  return 'light'; // clair par défaut
}

function basculerTheme() {
  const actuel = document.documentElement.dataset.theme;
  appliquerTheme(actuel === 'light' ? 'dark' : 'light');
}

// ---- Navigation ------------------------------------------------------------

/** Onglets à afficher, selon les paramètres de l'utilisateur. */
const routesVisibles = () => ROUTES.filter((r) => !r.utile || r.utile());

function construireNavigation() {
  const nav = document.getElementById('navigation');
  const version = document.getElementById('version-app')?.textContent ?? '';
  nav.innerHTML = `
    <div class="marque">${icone('recettes', { taille: 22 })}<span>Livre des recettes</span></div>
    <div class="liens-nav">
      ${routesVisibles().map((r) => `
        <a href="#/${r.chemin}" data-route="${r.chemin}">
          ${icone(r.icone)}<span>${echapperHtml(r.label)}</span>
        </a>`).join('')}
    </div>
    <div class="pied-nav">
      <button type="button" class="bouton-theme" id="bouton-theme"></button>
      <div class="infos-nav">
        <span id="version-app">${echapperHtml(version)}</span>
        <span>100 % local, vos données restent chez vous</span>
      </div>
    </div>`;
  document.getElementById('bouton-theme').addEventListener('click', basculerTheme);
  appliquerTheme(document.documentElement.dataset.theme); // remplit le bouton
}

// Changer de type d'activité fait apparaître ou disparaître l'onglet Achats.
window.addEventListener('parametres-modifies', construireNavigation);

/** Découpe `#/recettes?nouvelle=1` en `{ chemin: 'recettes', params }`. */
function decouperHash() {
  const brut = window.location.hash.replace(/^#\/?/, '');
  const [chemin, chaine] = brut.split('?');
  return { chemin: chemin ?? '', params: new URLSearchParams(chaine ?? '') };
}

async function afficherVue() {
  if (modeRestauration) return;
  const { chemin, params } = decouperHash();
  const route = routesVisibles().find((r) => r.chemin === chemin) ?? ROUTES[0];

  document.querySelectorAll('#navigation a[data-route]').forEach((lien) => {
    lien.classList.toggle('actif', lien.dataset.route === route.chemin);
  });

  const conteneur = document.getElementById('vue');
  // La zone de contenu est masquée le temps de préparer la vue, puis révélée en
  // fondu une fois le contenu (ou le placeholder, si le chargement traîne)
  // prêt. Rien ne bouge : seule l'opacité de cette zone change, jamais le menu.
  const contenuPrecedent = conteneur.innerHTML;
  conteneur.classList.add('vue-cachee');

  // Squelette différé : en local une vue s'affiche en quelques millisecondes ;
  // le placeholder n'apparaît donc qu'au-delà d'un court délai, en fondu lui
  // aussi, et seulement si la vue n'a encore rien dessiné.
  const minuteurSquelette = setTimeout(() => {
    if (conteneur.innerHTML === contenuPrecedent) {
      conteneur.innerHTML = chargeur(route.forme);
      revelerEnFondu(conteneur);
    }
  }, 180);
  try {
    await route.vue(conteneur, params);
    rendreBandeauMaj();
    rendreBandeauDemo();
    revelerEnFondu(conteneur);
    conteneur.focus();
  } catch (erreur) {
    console.error(erreur);
    conteneur.innerHTML = `
      <div class="carte">
        <h2>Oups</h2>
        <p>Impossible de charger cette page : ${echapperHtml(erreur.message)}</p>
        <p>Veuillez recharger la page.</p>
      </div>`;
    revelerEnFondu(conteneur);
  } finally {
    clearTimeout(minuteurSquelette);
  }
}

/** Révèle la zone de contenu en rejouant le fondu (retrait du masque, reflow). */
function revelerEnFondu(conteneur) {
  conteneur.classList.remove('vue-cachee', 'vue-entre');
  void conteneur.offsetWidth;
  conteneur.classList.add('vue-entre');
}

// ---- Jeu de démonstration ----------------------------------------------------

/**
 * Bandeau rappelant que le livre affiché est le jeu de démonstration, avec un
 * bouton pour tout effacer et commencer son vrai livre.
 */
function rendreBandeauDemo() {
  if (!etat.parametres?.jeuDemo) return;
  const conteneur = document.getElementById('vue');
  conteneur.insertAdjacentHTML('afterbegin', `
    <div class="bandeau-rappel bandeau-demo">
      ${icone('info', { taille: 18 })}
      <span>Vous explorez un <strong>jeu de démonstration</strong>. Effacez-le quand vous voulez commencer votre vrai livre des recettes.</span>
      <button type="button" class="btn btn-tertiaire" id="effacer-demo">${icone('corbeille', { taille: 16 })}<span>Tout effacer</span></button>
    </div>`);
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
      window.location.reload();
    } catch (erreur) {
      bouton.disabled = false;
      toast(erreur.message, 'erreur');
    }
  });
}

// ---- Mise à jour de l'application ---------------------------------------------

/** Dernière réponse de `/api/maj`, ou `null` tant que rien n'est connu. */
let miseAJour = null;

/**
 * Bandeau annonçant une nouvelle version, ajouté en tête de la vue
 * courante (donc visible quel que soit l'onglet). L'exécutable sait se
 * remplacer lui-même ; une installation depuis les sources renvoie vers la
 * page des versions.
 */
function rendreBandeauMaj() {
  if (!miseAJour?.disponible) return;
  const conteneur = document.getElementById('vue');
  // Un exécutable se met à jour tout seul, mais on propose toujours de lire
  // ce que la version apporte avant de l'installer.
  const action = miseAJour.remplacable
    ? `<a class="lien-attenue" href="${echapperHtml(miseAJour.page)}" target="_blank" rel="noopener">Nouveautés</a>
       <button type="button" class="btn btn-tertiaire" id="lancer-maj">Mettre à jour</button>`
    : `<a class="btn btn-tertiaire" href="${echapperHtml(miseAJour.page)}" target="_blank" rel="noopener">Voir la nouvelle version</a>`;

  conteneur.insertAdjacentHTML('afterbegin', `
    <div class="bandeau-rappel">
      ${icone('exports', { taille: 18 })}
      <span>Version ${echapperHtml(miseAJour.version)} disponible
      (vous utilisez la ${echapperHtml(etat.systeme.version)}).</span>
      ${action}
    </div>`);

  document.getElementById('lancer-maj')?.addEventListener('click', appliquerMiseAJour);
}

async function appliquerMiseAJour(evenement) {
  // `currentTarget` est remis à null dès la fin de l'événement : le bouton
  // doit être retenu AVANT la moindre attente.
  const bouton = evenement.currentTarget;

  const accord = await confirmer({
    titre: `Installer la version ${miseAJour.version} ?`,
    message: 'L’application va se mettre à jour puis redémarrer.',
    boutonOk: 'Mettre à jour',
    danger: false,
    iconeOk: 'exports'
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

/** Attend que le serveur réponde de nouveau, après son redémarrage. */
async function attendreRedemarrage() {
  for (let essai = 0; essai < 60; essai += 1) {
    await new Promise((suite) => setTimeout(suite, 1000));
    try {
      await api.systeme();
      return;
    } catch { /* pas encore reparti : on patiente */ }
  }
  throw new Error('L’application n’a pas redémarré. Relancez-la à la main.');
}

// ---- Erreurs inattendues -----------------------------------------------------

// Une erreur de programmation ne doit jamais rester invisible : sans cela,
// un bouton peut sembler ne rien faire, sans que l'utilisateur comprenne.
function signalerErreurInattendue(erreur) {
  console.error(erreur);
  toast('Une erreur inattendue est survenue. Rechargez la page si le problème persiste.', 'erreur');
}
window.addEventListener('error', (evenement) => signalerErreurInattendue(evenement.error ?? evenement.message));
window.addEventListener('unhandledrejection', (evenement) => signalerErreurInattendue(evenement.reason));

// ---- Annuler / Rétablir (Ctrl+Z / Ctrl+Y) ------------------------------------

window.addEventListener('keydown', async (evenement) => {
  if (!(evenement.ctrlKey || evenement.metaKey) || evenement.altKey) return;
  const touche = evenement.key.toLowerCase();
  const veutAnnuler = touche === 'z' && !evenement.shiftKey;
  const veutRetablir = touche === 'y' || (touche === 'z' && evenement.shiftKey);
  if (!veutAnnuler && !veutRetablir) return;

  // Dans un champ de saisie ou une boîte de dialogue, on laisse le
  // comportement natif du navigateur (annulation de texte).
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

// ---- Récupération des données (fichier illisible ou disparu) ------------------

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
  const conteneur = document.getElementById('vue');
  const { sauvegardes } = await api.listerSauvegardes().catch(() => ({ sauvegardes: [] }));

  conteneur.innerHTML = `
    <header class="entete-vue">
      <div>
        <h1>${echapperHtml(titre)}</h1>
        <p>${echapperHtml(introduction)}</p>
      </div>
    </header>
    <div class="carte">
      <p>${echapperHtml(message)}</p>
      <p>Choisissez une sauvegarde à restaurer (la plus récente d’abord). Le fichier
      actuel sera conservé de côté : rien n’est effacé.</p>
      ${sauvegardes.length === 0
        ? '<p class="attenue">Aucune sauvegarde disponible. Vous pouvez remplacer manuellement le fichier de données par une copie personnelle, puis relancer l’application.</p>'
        : sauvegardes.map((s) => `
          <div class="ligne-gestion">
            <span class="libelle-gestion">${echapperHtml(s.fichier)}</span>
            <span class="details-gestion">${echapperHtml(new Date(s.date).toLocaleString('fr-FR'))} (${Math.max(1, Math.round(s.taille / 1024))} Ko)</span>
            <button type="button" class="btn btn-secondaire" data-fichier="${echapperHtml(s.fichier)}">
              ${icone('reinitialiser', { taille: 16 })}<span>Restaurer</span>
            </button>
          </div>`).join('')}
      ${disparition ? `
        <p class="note-legale">
          ${icone('info', { taille: 16 })}
          <span>Vous aviez supprimé ces données volontairement ? Repartez d’un livre vide :
          les sauvegardes ci-dessus resteront disponibles.</span>
        </p>
        <button type="button" class="btn btn-tertiaire" id="repartir-de-zero">Repartir d’un livre vide</button>` : ''}
    </div>`;

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

  conteneur.querySelectorAll('[data-fichier]').forEach((bouton) => {
    bouton.addEventListener('click', async () => {
      const fichier = bouton.dataset.fichier;
      const accord = await confirmer({
        titre: 'Restaurer cette sauvegarde ?',
        message: `Les données reviendront à l’état de « ${fichier} ». Le fichier actuel est conservé de côté.`,
        boutonOk: 'Restaurer'
      });
      if (!accord) return;
      try {
        await api.restaurerSauvegarde(fichier);
        window.location.reload();
      } catch (erreur) {
        toast(erreur.message, 'erreur');
      }
    });
  });
}

// ---- Démarrage -------------------------------------------------------------

appliquerTheme(themeInitial());
construireNavigation();
// Écouteurs délégués : posés une fois, ils valent pour toutes les vues, qui
// se redessinent entièrement à chaque navigation.
installerInfobulles();

window.addEventListener('hashchange', afficherVue);

chargerEtat()
  .then(() => {
    // Les onglets dépendent des paramètres : la navigation est refaite une
    // fois ceux-ci connus.
    construireNavigation();
    document.getElementById('version-app').textContent = `Version ${etat.systeme.version}`;
    if (etat.systeme.corruption) {
      afficherEcranRestauration({
        titre: 'Données à restaurer',
        introduction: 'Le fichier de données n’a pas pu être lu. Vos sauvegardes automatiques sont là pour ça.',
        message: etat.systeme.corruption
      });
    } else if (etat.systeme.donneesAbsentes) {
      afficherEcranRestauration({
        titre: 'Vos données ont disparu',
        introduction: 'Le fichier de données est introuvable, mais vos sauvegardes, elles, sont intactes.',
        message: `Aucun fichier « ${etat.systeme.fichierDonnees} ». Il a pu être supprimé, ` +
          'déplacé, ou perdu par un dossier synchronisé.',
        disparition: true
      });
    } else if (etat.systeme.premierLancement && !window.location.hash) {
      // Première utilisation : direction les Paramètres pour bien démarrer
      // (le changement d'ancre déclenche l'affichage de la vue).
      window.location.hash = '#/parametres';
    } else {
      afficherVue();
    }
    // Recherche d'une nouvelle version, en arrière-plan : l'application est
    // utilisable immédiatement, et hors ligne rien ne se voit.
    api.miseAJour()
      .then((reponse) => {
        miseAJour = reponse;
        rendreBandeauMaj();
      })
      .catch(() => { /* vérification impossible : sans conséquence */ });
  })
  .catch((erreur) => {
    console.error(erreur);
    document.getElementById('vue').innerHTML = `
      <div class="carte">
        <h2>Connexion impossible</h2>
        <p>Le serveur local ne répond pas : ${echapperHtml(erreur.message)}</p>
      </div>`;
  });
