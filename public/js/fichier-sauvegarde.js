/**
 * « Sauvegarder maintenant » et « Reprendre une sauvegarde » : tout le livre
 * et ses PDF dans un seul fichier, à ranger où l'on veut, puis sa reprise,
 * sur cet ordinateur ou sur un autre (voir `src/fichier-sauvegarde.js`).
 */

import { api, telechargerFichier } from './api.js';
import { icone } from './icones.js';
import { echapperHtml, identifiantUnique, accorder, toast } from './ui.js';
import { patienter, reussite } from './retours.js';
import { aujourdHuiIso } from '/partage/dates.js';

const ADRESSE = '/api/sauvegarde';

/** « 28 recettes, 10 clients, 5 PDF » : ce que contient un livre (les recettes toujours, le reste s'il existe). */
const decompte = (n) => [
  accorder(n.recettes, 'recette'),
  n.achats > 0 && accorder(n.achats, 'achat'),
  n.clients > 0 && accorder(n.clients, 'client'),
  n.pdf > 0 && accorder(n.pdf, 'PDF', 'PDF')
].filter(Boolean);

/** « le 26 septembre 2026 » : la date d'une saisie ou d'une copie. */
const dateLongue = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
};

/**
 * Enregistre la sauvegarde. Là où le navigateur le permet (Edge, Chrome),
 * l'utilisateur choisit l'endroit, une clé USB par exemple, dans la fenêtre
 * « Enregistrer sous » du système ; ailleurs, elle part dans les
 * téléchargements. Le bouton dit où en est l'opération. Retourne vrai si la
 * sauvegarde a été enregistrée.
 */
export async function sauvegarderMaintenant(bouton) {
  let destination = null;
  if (window.showSaveFilePicker) {
    try {
      destination = await window.showSaveFilePicker({
        suggestedName: `sauvegarde-livre-des-recettes-${aujourdHuiIso()}.zip`,
        types: [{ description: 'Sauvegarde du Livre des recettes', accept: { 'application/zip': ['.zip'] } }]
      });
    } catch (erreur) {
      if (erreur.name === 'AbortError') return false;
      destination = null; // fenêtre refusée par le navigateur : téléchargement ordinaire
    }
  }
  const retablir = patienter(bouton, 'Sauvegarde…');
  try {
    if (destination) {
      const reponse = await fetch(ADRESSE);
      if (!reponse.ok) throw new Error((await reponse.json().catch(() => null))?.erreur ?? `Erreur ${reponse.status}`);
      await reponse.body.pipeTo(await destination.createWritable());
    } else {
      await telechargerFichier(ADRESSE);
    }
    retablir();
    reussite(bouton, 'Sauvegardé', { nomIcone: 'fichier-valide', duree: 2400 });
    return true;
  } catch (erreur) {
    retablir();
    reussite(bouton, 'Échec', { nomIcone: 'cercle-alerte', duree: 2600, echec: true });
    toast(erreur.message, 'erreur');
    return false;
  }
}

/**
 * Ouvre la reprise d'une sauvegarde. L'application cherche d'elle-même une
 * copie sur les clés et disques branchés ; sinon, l'utilisateur choisit le
 * fichier. Rien n'est remplacé avant son accord. Résout vrai si un livre a
 * été repris : la page doit alors être rechargée.
 */
export function ouvrirReprise() {
  return new Promise((resoudre) => {
    const dialogue = document.createElement('dialog');
    dialogue.className = 'boite boite-reprise';
    const idTitre = identifiantUnique('titre-reprise');
    dialogue.setAttribute('aria-labelledby', idTitre);
    dialogue.innerHTML = `
      <div class="boite-corps">
        <h2 id="${idTitre}">Reprendre une sauvegarde</h2>
        <div class="etape-reprise"></div>
      </div>`;
    document.body.append(dialogue);
    const etape = dialogue.querySelector('.etape-reprise');
    const origine = document.activeElement;
    let occupee = false;
    let reprise = false;

    const fermer = () => {
      if (occupee) return;
      dialogue.close();
      dialogue.remove();
      if (origine instanceof HTMLElement && origine.isConnected) origine.focus();
      resoudre(reprise);
    };
    dialogue.addEventListener('cancel', (evenement) => {
      evenement.preventDefault();
      fermer();
    });

    /** Lit la sauvegarde choisie ; en cas de refus, l'erreur s'affiche et le choix reste ouvert. */
    async function lire(bouton, lecture) {
      occupee = true;
      const retablir = patienter(bouton, 'Lecture…');
      try {
        const analyse = await lecture();
        occupee = false;
        confirmation(analyse);
      } catch (erreur) {
        occupee = false;
        retablir();
        choix(erreur.message);
      }
    }

    /** Première étape : d'où vient la sauvegarde. */
    function choix(erreur = '') {
      etape.innerHTML = `
        ${erreur ? `<p class="message-erreur">${icone('cercle-alerte', { taille: 14 })}<span>${echapperHtml(erreur)}</span></p>` : ''}
        <p>Le livre et ses PDF reviennent tels qu’ils étaient au moment de la sauvegarde.</p>
        <div class="sources-reprise">
          <p class="recherche-supports">${icone('chargement', { taille: 15, classe: 'tourne' })}Recherche d’une copie sur les clés et disques branchés…</p>
        </div>
        <div class="fichier-reprise">
          <button type="button" class="btn" data-role="fichier">${icone('import', { taille: 16 })}Choisir un fichier de sauvegarde</button>
          <span class="note">Le fichier .zip créé par «\u00a0Sauvegarder maintenant\u00a0».</span>
          <input type="file" accept=".zip,.json" hidden>
        </div>
        <div class="boite-pied"><button type="button" class="btn btn-fantome" data-role="annuler">Annuler</button></div>`;
      const sources = etape.querySelector('.sources-reprise');
      const selection = etape.querySelector('input[type="file"]');
      etape.querySelector('[data-role="annuler"]').addEventListener('click', fermer);
      etape.querySelector('[data-role="fichier"]').addEventListener('click', () => selection.click());
      selection.addEventListener('change', () => {
        const fichier = selection.files?.[0];
        if (fichier) lire(etape.querySelector('[data-role="fichier"]'), () => api.lireFichierSauvegarde(fichier));
      });

      api.copiesSurSupports().then(({ copies }) => {
        if (!sources.isConnected) return;
        sources.innerHTML = copies.length === 0
          ? '<p class="recherche-supports">Aucune copie sur les clés et disques branchés.</p>'
          : `<p class="consigne-supports">${copies.length > 1 ? 'Copies trouvées' : 'Copie trouvée'} :</p>
            <div class="supports">${copies.map((c) => `
              <button type="button" class="support" data-copie="${echapperHtml(c.chemin)}">
                ${icone('disque', { taille: 18 })}<span><strong>${echapperHtml(c.libelle)}</strong>
                <small>${[c.sauvegarde.entreprise, accorder(c.sauvegarde.recettes, 'recette'), `copie ${dateLongue(c.date)}`]
                  .filter(Boolean).map(echapperHtml).join(' · ')}</small></span>
              </button>`).join('')}</div>`;
        sources.querySelectorAll('[data-copie]').forEach((bouton) => bouton.addEventListener('click', () =>
          lire(bouton, () => api.lireCopieSurSupport(bouton.dataset.copie))));
      }).catch(() => {
        if (sources.isConnected) sources.innerHTML = '';
      });
    }

    /** Deuxième étape : ce que contient la sauvegarde, et l'accord de l'utilisateur. */
    function confirmation(analyse) {
      const { sauvegarde: s, actuel, origine: source, copieActive } = analyse;
      const remplace = actuel.recettes + actuel.achats + actuel.clients > 0;
      etape.innerHTML = `
        <div class="apercu-reprise">
          <strong>${echapperHtml(s.entreprise ?? 'Livre sans nom d’entreprise')}</strong>
          <span>${decompte(s).join(' · ')}</span>
          <span>${s.derniereSaisie ? `Dernière saisie ${dateLongue(s.derniereSaisie)}, ` : ''}depuis ${echapperHtml(source.libelle)}</span>
        </div>
        ${s.pdfManquants ? `<p class="avis">${icone('cercle-alerte', { taille: 17 })}<span>${accorder(s.pdfManquants, 'PDF joint manque', 'PDF joints manquent')} dans cette
          sauvegarde : les lignes concernées reviennent sans leur PDF.</span></p>` : ''}
        <p>${remplace
          ? `Il remplacera le livre de cet ordinateur (${accorder(actuel.recettes, 'recette')}), qui reste récupérable dans les sauvegardes des paramètres.`
          : 'Il deviendra le livre de cet ordinateur.'}</p>
        ${source.type === 'support' && !copieActive ? `<label class="case-a-cocher"><input type="checkbox" checked>
          <span>Continuer ensuite la copie automatique sur ${echapperHtml(source.libelle)}</span></label>` : ''}
        <p class="message-erreur" aria-live="polite"></p>
        <div class="boite-pied">
          <button type="button" class="btn btn-fantome" data-role="retour">Retour</button>
          <button type="button" class="btn btn-principal" data-role="reprendre">${icone('import', { taille: 16 })}Reprendre ce livre</button>
        </div>`;
      etape.querySelector('[data-role="retour"]').addEventListener('click', () => choix());
      const bouton = etape.querySelector('[data-role="reprendre"]');
      bouton.focus();
      bouton.addEventListener('click', async () => {
        occupee = true;
        etape.querySelector('[data-role="retour"]').disabled = true;
        const retablir = patienter(bouton, 'Reprise en cours…');
        try {
          const resultat = await api.reprendreSauvegarde(analyse.jeton, Boolean(etape.querySelector('.case-a-cocher input')?.checked));
          occupee = false;
          reprise = true;
          termine(resultat, source);
        } catch (erreur) {
          occupee = false;
          retablir();
          etape.querySelector('[data-role="retour"]').disabled = false;
          etape.querySelector('.message-erreur').innerHTML = `${icone('cercle-alerte', { taille: 14 })}<span>${echapperHtml(erreur.message)}</span>`;
        }
      });
    }

    /** Dernière étape : le livre est repris. */
    function termine(resultat, source) {
      const copie = resultat.copie;
      etape.innerHTML = `
        <p class="reussite-reprise">${icone('cercle-valide', { taille: 18 })}<span>Livre repris : ${decompte(resultat).join(', ')}.</span></p>
        ${copie ? `<p>${copie.copie
          ? `La copie automatique continue sur ${echapperHtml(source.libelle)}.`
          : `La copie automatique n’a pas pu démarrer : ${echapperHtml(copie.message ?? 'choisissez la clé dans les paramètres, section Sécurité.')}`}</p>` : ''}
        <div class="boite-pied"><button type="button" class="btn btn-principal" data-role="ouvrir">Ouvrir le livre</button></div>`;
      const ouvrir = etape.querySelector('[data-role="ouvrir"]');
      ouvrir.addEventListener('click', fermer);
      ouvrir.focus();
    }

    choix();
    dialogue.showModal();
  });
}
