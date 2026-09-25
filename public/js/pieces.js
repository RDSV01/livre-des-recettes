/**
 * Pièces jointes, côté navigateur : la facture PDF d'une recette, le
 * justificatif d'un achat.
 *
 *  - `zoneDepot(...)` : le champ du panneau de saisie, déposer ou choisir un
 *    PDF, puis la pastille du fichier joint ;
 *  - `apercuPiece(...)` : le PDF ouvert dans un grand panneau, avec
 *    Télécharger, Remplacer et Retirer ;
 *  - `choisirPdf()`, `verifierPdf()` : le sélecteur de fichiers et le premier
 *    tri (le serveur vérifie de nouveau, sur le contenu lui-même).
 *
 * Les fichiers sont rangés par le serveur dans le dossier « pieces », à côté
 * du livre (voir `src/pieces.js`).
 */

import { icone } from './icones.js';
import { echapperHtml, poidsLisible } from './ui.js';
import { ouvrirPanneau } from './panneau.js';

/** Même limite que le serveur (`src/pieces.js`). */
const TAILLE_MAX = 10 * 1024 * 1024;

/** Message d'erreur si le fichier ne peut pas être joint, sinon chaîne vide. */
export function verifierPdf(fichier) {
  if (!fichier) return 'Aucun fichier.';
  const pdf = fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name);
  if (!pdf) return `« ${fichier.name} » n’est pas un PDF.`;
  if (fichier.size > TAILLE_MAX) return `« ${fichier.name} » dépasse 10 Mo.`;
  if (fichier.size === 0) return `« ${fichier.name} » est vide.`;
  return '';
}

/** Ouvre le sélecteur de fichiers ; rend le PDF choisi, ou `null`. */
export function choisirPdf() {
  return new Promise((resoudre) => {
    const entree = document.createElement('input');
    entree.type = 'file';
    entree.accept = 'application/pdf,.pdf';
    entree.addEventListener('change', () => resoudre(entree.files[0] ?? null));
    entree.addEventListener('cancel', () => resoudre(null));
    entree.click();
  });
}

/** Le fichier déposé, s'il y en a un parmi ce qui est glissé. */
const fichierDepose = (evenement) => evenement.dataTransfer?.files?.[0] ?? null;

/** Vrai si ce qui est glissé au-dessus contient des fichiers. */
export const glisseDesFichiers = (evenement) => [...(evenement.dataTransfer?.types ?? [])].includes('Files');

/**
 * Champ « pièce jointe » d'un formulaire.
 *
 * @param {HTMLElement} conteneur
 * @param {object|null} piece pièce actuelle : fiche du serveur
 *   (`{ id, nom, taille }`) ou fichier en attente d'envoi (`File`).
 * @param {(piece: object|File|null) => void} surChange
 * @param {object} options
 * @param {string} options.quoi « la facture » ou « le justificatif ».
 * @param {() => object} options.apercu ce que l'aperçu doit montrer :
 *   `{ url, details }` pour la pièce déjà jointe à la ligne.
 */
export function zoneDepot(conteneur, piece, surChange, { quoi, apercu }) {
  let actuelle = piece;
  const nomDe = (p) => (p instanceof File ? p.name : p.nom);
  const tailleDe = (p) => (p instanceof File ? p.size : p.taille);

  const dessiner = (nouvelle = false) => {
    conteneur.innerHTML = (actuelle
      ? `<div class="piece-jointe${nouvelle ? ' arrive-piece' : ''}">
          <span class="piece-icone">${icone('fichier-texte', { taille: 18 })}<em>PDF</em></span>
          <span class="piece-infos"><strong>${echapperHtml(nomDe(actuelle))}</strong>
            <span>${tailleDe(actuelle) ? poidsLisible(tailleDe(actuelle)) : 'PDF'}${nouvelle ? ' · sera joint à l’enregistrement' : ''}</span></span>
          <span class="piece-progression" aria-hidden="true"></span>
          <button type="button" class="btn-icone" data-piece="voir" aria-label="Voir ${quoi}" title="Voir">${icone('oeil', { taille: 16 })}</button>
          <button type="button" class="btn-icone danger" data-piece="retirer" aria-label="Retirer ${quoi}" title="Retirer">${icone('croix', { taille: 16 })}</button>
        </div>`
      : `<button type="button" class="depot-piece" data-piece="choisir">
          <span class="tuile">${icone('fichier-depot', { taille: 18 })}</span>
          <span><strong>Déposez ${quoi} ici</strong><span>ou cliquez pour choisir un PDF, 10 Mo au plus</span></span>
        </button>`) + '<p class="message-erreur" data-piece-erreur></p>';
  };
  const erreur = (texte) => {
    conteneur.querySelector('[data-piece-erreur]').innerHTML = texte
      ? `${icone('cercle-alerte', { taille: 14 })}<span>${echapperHtml(texte)}</span>`
      : '';
  };
  const joindre = (fichier) => {
    const probleme = verifierPdf(fichier);
    if (probleme) { erreur(probleme); return; }
    actuelle = fichier;
    dessiner(true);
    surChange(actuelle);
  };

  dessiner();
  conteneur.addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('[data-piece]');
    if (!bouton) return;
    const action = bouton.dataset.piece;
    if (action === 'choisir') {
      const fichier = await choisirPdf();
      if (fichier) joindre(fichier);
    } else if (action === 'retirer') {
      actuelle = null;
      dessiner();
      surChange(null);
      conteneur.querySelector('[data-piece="choisir"]')?.focus();
    } else if (action === 'voir') {
      const enAttente = actuelle instanceof File;
      apercuPiece({
        nom: nomDe(actuelle),
        details: enAttente ? poidsLisible(actuelle.size) : apercu().details,
        url: enAttente ? URL.createObjectURL(actuelle) : apercu().url,
        temporaire: enAttente
      });
    }
  });
  ['dragenter', 'dragover'].forEach((type) => conteneur.addEventListener(type, (evenement) => {
    if (!glisseDesFichiers(evenement)) return;
    evenement.preventDefault();
    conteneur.classList.add('survol');
  }));
  conteneur.addEventListener('dragleave', (evenement) => {
    if (!conteneur.contains(evenement.relatedTarget)) conteneur.classList.remove('survol');
  });
  conteneur.addEventListener('drop', (evenement) => {
    evenement.preventDefault();
    conteneur.classList.remove('survol');
    const fichier = fichierDepose(evenement);
    if (fichier) joindre(fichier);
  });
}

/**
 * Aperçu d'un PDF joint, dans un grand panneau.
 *
 * @param {object} options
 * @param {string} options.nom nom du fichier.
 * @param {string} options.details ligne de contexte (tiers, montant, date, poids).
 * @param {string} options.url adresse du PDF.
 * @param {boolean} [options.temporaire] adresse créée pour un fichier local,
 *   libérée à la fermeture.
 * @param {() => void} [options.remplacer] proposé si fourni.
 * @param {() => void} [options.retirer] proposé si fourni.
 */
export function apercuPiece({ nom, details, url, temporaire = false, remplacer, retirer }) {
  const panneau = ouvrirPanneau(`
    <div class="panneau-tete">
      <div>
        <h2 id="titre-piece">${echapperHtml(nom)}</h2>
        <p>${echapperHtml(details)}</p>
      </div>
      <button type="button" class="btn-icone" data-fermer aria-label="Fermer l’aperçu">${icone('croix', { taille: 18 })}</button>
    </div>
    <div class="apercu-pdf"><iframe src="${echapperHtml(url)}#toolbar=0&amp;navpanes=0&amp;view=FitH" title="Aperçu de ${echapperHtml(nom)}"></iframe></div>
    <div class="panneau-pied">
      <a class="btn" href="${echapperHtml(url)}" download="${echapperHtml(nom)}">${icone('telecharger', { taille: 16 })}Télécharger</a>
      ${remplacer || retirer ? `<div class="actions">
        ${retirer ? `<button type="button" class="btn btn-fantome danger-texte" data-retirer>${icone('corbeille', { taille: 16 })}Retirer</button>` : ''}
        ${remplacer ? `<button type="button" class="btn" data-remplacer>${icone('import', { taille: 16 })}Remplacer</button>` : ''}
      </div>` : ''}
    </div>`, { classe: 'large', idTitre: 'titre-piece' });

  if (temporaire) panneau.element.addEventListener('close', () => URL.revokeObjectURL(url));
  panneau.element.querySelector('[data-retirer]')?.addEventListener('click', async () => {
    await panneau.fermer(true);
    retirer();
  });
  panneau.element.querySelector('[data-remplacer]')?.addEventListener('click', async () => {
    const fichier = await choisirPdf();
    if (!fichier) return;
    await panneau.fermer(true);
    remplacer(fichier);
  });
}
