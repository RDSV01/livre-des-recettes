/**
 * Point d'entrée du navigateur : routage par ancre (`#/recettes`, …),
 * construction de la navigation, gestion du thème, raccourcis
 * Annuler / Rétablir et chargement de l'état global, sans aucun framework
 * ni étape de build.
 */

import { api } from './api.js';
import { chargerEtat, etat } from './etat.js';
import { echapperHtml, toast, confirmer } from './ui.js';
import { icone } from './icones.js';
import { annuler, retablir } from './historique.js';
import { vueTableauDeBord } from './vues/tableau-de-bord.js';
import { vueRecettes } from './vues/recettes.js';
import { vueUrssaf } from './vues/urssaf.js';
import { vueClients } from './vues/clients.js';
import { vueImport } from './vues/import.js';
import { vueExports } from './vues/exports.js';
import { vueParametres } from './vues/parametres.js';

/** Définition unique des onglets : sert à la fois à la navigation et au routage. */
const ROUTES = [
  { chemin: '', label: 'Tableau de bord', icone: 'tableau-de-bord', vue: vueTableauDeBord },
  { chemin: 'recettes', label: 'Recettes', icone: 'recettes', vue: vueRecettes },
  { chemin: 'urssaf', label: 'URSSAF', icone: 'urssaf', vue: vueUrssaf },
  { chemin: 'clients', label: 'Clients', icone: 'clients', vue: vueClients },
  { chemin: 'import', label: 'Import CSV', icone: 'import', vue: vueImport },
  { chemin: 'exports', label: 'Exports', icone: 'exports', vue: vueExports },
  { chemin: 'parametres', label: 'Paramètres', icone: 'parametres', vue: vueParametres }
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

function construireNavigation() {
  const nav = document.getElementById('navigation');
  nav.innerHTML = `
    <div class="marque">${icone('recettes', { taille: 22 })}<span>Livre des recettes</span></div>
    <div class="liens-nav">
      ${ROUTES.map((r) => `
        <a href="#/${r.chemin}" data-route="${r.chemin}">
          ${icone(r.icone)}<span>${echapperHtml(r.label)}</span>
        </a>`).join('')}
    </div>
    <div class="pied-nav">
      <button type="button" class="bouton-theme" id="bouton-theme"></button>
      <div class="infos-nav">
        <span id="version-app"></span>
        <span>100 % local, vos données restent chez vous</span>
      </div>
    </div>`;
  document.getElementById('bouton-theme').addEventListener('click', basculerTheme);
}

/** Découpe `#/recettes?nouvelle=1` en `{ chemin: 'recettes', params }`. */
function decouperHash() {
  const brut = window.location.hash.replace(/^#\/?/, '');
  const [chemin, chaine] = brut.split('?');
  return { chemin: chemin ?? '', params: new URLSearchParams(chaine ?? '') };
}

async function afficherVue() {
  if (modeRestauration) return;
  const { chemin, params } = decouperHash();
  const route = ROUTES.find((r) => r.chemin === chemin) ?? ROUTES[0];

  document.querySelectorAll('#navigation a[data-route]').forEach((lien) => {
    lien.classList.toggle('actif', lien.dataset.route === route.chemin);
  });

  const conteneur = document.getElementById('vue');
  conteneur.innerHTML = '<div class="chargement">Chargement…</div>';
  try {
    await route.vue(conteneur, params);
    conteneur.focus();
  } catch (erreur) {
    console.error(erreur);
    conteneur.innerHTML = `
      <div class="carte">
        <h2>Oups</h2>
        <p>Impossible de charger cette page : ${echapperHtml(erreur.message)}</p>
        <p>Vérifiez que l’application est bien lancée, puis rechargez.</p>
      </div>`;
  }
}

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

// ---- Restauration des données corrompues -------------------------------------

/**
 * Écran affiché quand le fichier de données est illisible au démarrage :
 * il propose de restaurer une des sauvegardes automatiques. Rien n'est
 * modifiable tant que la restauration n'a pas eu lieu.
 */
async function afficherEcranRestauration(message) {
  modeRestauration = true;
  const conteneur = document.getElementById('vue');
  const { sauvegardes } = await api.listerSauvegardes().catch(() => ({ sauvegardes: [] }));

  conteneur.innerHTML = `
    <header class="entete-vue">
      <div>
        <h1>Données à restaurer</h1>
        <p>Le fichier de données n’a pas pu être lu. Vos sauvegardes automatiques sont là pour ça.</p>
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
    </div>`;

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
appliquerTheme(document.documentElement.dataset.theme); // remplit le bouton une fois construit

window.addEventListener('hashchange', afficherVue);

chargerEtat()
  .then(() => {
    document.getElementById('version-app').textContent = `Version ${etat.systeme.version}`;
    if (etat.systeme.corruption) {
      afficherEcranRestauration(etat.systeme.corruption);
    } else if (etat.systeme.premierLancement && !window.location.hash) {
      // Première utilisation : direction les Paramètres pour bien démarrer
      // (le changement d'ancre déclenche l'affichage de la vue).
      window.location.hash = '#/parametres';
    } else {
      afficherVue();
    }
  })
  .catch((erreur) => {
    console.error(erreur);
    document.getElementById('vue').innerHTML = `
      <div class="carte">
        <h2>Connexion impossible</h2>
        <p>Le serveur local ne répond pas : ${echapperHtml(erreur.message)}</p>
      </div>`;
  });
