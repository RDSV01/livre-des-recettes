/**
 * Point d'entrée du navigateur : routage par ancre (`#/recettes`, …),
 * construction de la navigation, gestion du thème et chargement de l'état
 * global, sans aucun framework ni étape de build.
 */

import { chargerEtat, etat } from './etat.js';
import { echapperHtml } from './ui.js';
import { icone } from './icones.js';
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

// ---- Thème -----------------------------------------------------------------

/** Applique le thème (« dark » par défaut) et mémorise le choix. */
function appliquerTheme(theme) {
  const valide = theme === 'light' ? 'light' : 'dark';
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
  return 'dark'; // sombre par défaut
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

// ---- Démarrage -------------------------------------------------------------

appliquerTheme(themeInitial());
construireNavigation();
appliquerTheme(document.documentElement.dataset.theme); // remplit le bouton une fois construit

window.addEventListener('hashchange', afficherVue);

chargerEtat()
  .then(() => {
    document.getElementById('version-app').textContent = `Version ${etat.systeme.version}`;
    afficherVue();
  })
  .catch((erreur) => {
    console.error(erreur);
    document.getElementById('vue').innerHTML = `
      <div class="carte">
        <h2>Connexion impossible</h2>
        <p>Le serveur local ne répond pas : ${echapperHtml(erreur.message)}</p>
      </div>`;
  });
