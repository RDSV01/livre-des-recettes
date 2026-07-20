/**
 * Vue « Paramètres » : identité de l'entreprise (reprise dans les exports),
 * type d'activité (pour le suivi des seuils), modes de règlement
 * personnalisés, préférences d'affichage, données locales et sauvegardes.
 */

import { api } from '../api.js';
import { etat, definirParametres } from '../etat.js';
import {
  toast, echapperHtml, confirmer,
  afficherErreursFormulaire, effacerErreursFormulaire
} from '../ui.js';
import { icone } from '../icones.js';
import { DEVISES, FORMATS_DATE, MODES_REGLEMENT } from '/partage/constantes.js';
import { TYPES_ACTIVITE } from '/partage/seuils.js';

export async function vueParametres(conteneur) {
  const p = etat.parametres;
  // État système rafraîchi : l'échec des sauvegardes n'apparaît qu'après une
  // écriture, donc pas forcément au démarrage. On relit la valeur courante.
  const systeme = await api.systeme().catch(() => etat.systeme);

  conteneur.innerHTML = `
    <header class="entete-vue">
      <div>
        <h1>Paramètres</h1>
        <p>Ces informations figurent en tête de vos exports.</p>
      </div>
    </header>

    ${etat.systeme.premierLancement ? `
    <div class="carte" id="carte-bienvenue">
      <h2>Bienvenue !</h2>
      <p>Avant votre première recette, prenez une minute pour renseigner votre entreprise :
      ces informations apparaissent en tête de vos exports, le type d’activité active le
      suivi de vos plafonds et de la franchise de TVA, et la périodicité de déclaration
      active un rappel discret sur le tableau de bord.</p>
      <p>Envie de voir l’application en action d’abord ?</p>
      <button type="button" class="btn btn-secondaire" id="charger-demo">
        ${icone('etincelle', { taille: 16 })}<span>Découvrir avec un jeu de démonstration</span>
      </button>
    </div>` : ''}

    <form class="carte" id="formulaire-parametres" novalidate>
      <h2>Mon entreprise</h2>
      <div class="grille-formulaire">
        <div class="champ" data-champ="nomEntreprise">
          <label for="param-nom">Nom de l’entreprise</label>
          <input type="text" id="param-nom" name="nomEntreprise" value="${echapperHtml(p.nomEntreprise)}">
          <span class="erreur-champ"></span>
        </div>
        <div class="champ" data-champ="activite">
          <label for="param-activite">Activité</label>
          <input type="text" id="param-activite" name="activite" value="${echapperHtml(p.activite)}"
            placeholder="Ex. : développement informatique">
          <span class="erreur-champ"></span>
        </div>
        <div class="champ" data-champ="siren">
          <label for="param-siren">SIREN</label>
          <input type="text" id="param-siren" name="siren" value="${echapperHtml(p.siren)}"
            placeholder="9 chiffres" inputmode="numeric">
          <span class="erreur-champ"></span>
        </div>
        <div class="champ" data-champ="siret">
          <label for="param-siret">SIRET</label>
          <input type="text" id="param-siret" name="siret" value="${echapperHtml(p.siret)}"
            placeholder="14 chiffres" inputmode="numeric">
          <span class="erreur-champ"></span>
        </div>
        <div class="champ pleine-largeur" data-champ="adresse">
          <label for="param-adresse">Adresse</label>
          <input type="text" id="param-adresse" name="adresse" value="${echapperHtml(p.adresse)}">
          <span class="erreur-champ"></span>
        </div>
        <div class="champ" data-champ="typeActivite">
          <label for="param-type-activite">Type d’activité (pour le suivi des seuils)</label>
          <select id="param-type-activite" name="typeActivite">
            ${TYPES_ACTIVITE.map((t) =>
              `<option value="${t.code}" ${t.code === p.typeActivite ? 'selected' : ''}>${echapperHtml(t.libelle)}</option>`
            ).join('')}
          </select>
          <span class="indication">Détermine le plafond micro-entrepreneur et le seuil de franchise de TVA affichés sur le tableau de bord.</span>
          <span class="erreur-champ"></span>
        </div>
        <div class="champ" data-champ="periodiciteUrssaf">
          <label for="param-periodicite">Déclaration URSSAF</label>
          <select id="param-periodicite" name="periodiciteUrssaf">
            <option value="" ${p.periodiciteUrssaf === '' ? 'selected' : ''}>Non renseignée</option>
            <option value="mois" ${p.periodiciteUrssaf === 'mois' ? 'selected' : ''}>Mensuelle</option>
            <option value="trimestre" ${p.periodiciteUrssaf === 'trimestre' ? 'selected' : ''}>Trimestrielle</option>
          </select>
          <span class="indication">Active un rappel sur le tableau de bord quand une période à déclarer est écoulée.</span>
          <span class="erreur-champ"></span>
        </div>
        <div class="champ" data-champ="devise">
          <label for="param-devise">Devise</label>
          <select id="param-devise" name="devise">
            ${DEVISES.map((d) =>
              `<option value="${d.code}" ${d.code === p.devise ? 'selected' : ''}>${d.libelle}</option>`
            ).join('')}
          </select>
          <span class="erreur-champ"></span>
        </div>
        <div class="champ" data-champ="formatDate">
          <label for="param-format-date">Format des dates</label>
          <select id="param-format-date" name="formatDate">
            ${FORMATS_DATE.map((f) =>
              `<option value="${f.code}" ${f.code === p.formatDate ? 'selected' : ''}>${f.code} (${f.libelle})</option>`
            ).join('')}
          </select>
          <span class="erreur-champ"></span>
        </div>
      </div>

      <h2 style="margin-top: 24px;">Options</h2>
      <div class="liste-options">
        <label class="option-case">
          <input type="checkbox" name="alertesNumerotation" ${p.alertesNumerotation ? 'checked' : ''}>
          <span>Alertes de numérotation des factures (doublons, numéros manquants)</span>
        </label>
        <label class="option-case">
          <input type="checkbox" name="alerteRecetteSimilaire" ${p.alerteRecetteSimilaire ? 'checked' : ''}>
          <span>Avertissement quand une recette très similaire existe déjà</span>
        </label>
        <label class="option-case">
          <input type="checkbox" name="suiviSeuils" ${p.suiviSeuils ? 'checked' : ''}>
          <span>Suivi des seuils (plafond micro et franchise de TVA) sur le tableau de bord</span>
        </label>
        <label class="option-case">
          <input type="checkbox" name="verifierMisesAJour" ${p.verifierMisesAJour ? 'checked' : ''}>
          <span>Signaler les nouvelles versions de l’application (demande la dernière version
          publiée à GitHub, sans rien envoyer de vos données)</span>
        </label>
      </div>

      <h2 style="margin-top: 24px;">Modes de règlement personnalisés</h2>
      <div class="champ pleine-largeur" data-champ="modesPersonnalises">
        <div id="liste-modes"></div>
        <div>
          <button type="button" class="btn btn-secondaire" id="ajouter-mode">
            ${icone('plus', { taille: 16 })}<span>Ajouter un mode</span>
          </button>
        </div>
        <span class="indication">
          Les modes par défaut (${MODES_REGLEMENT.map((m) => m.libelle).join(', ')}) restent
          toujours disponibles. Un mode utilisé par des recettes peut être renommé mais pas supprimé.
        </span>
        <span class="erreur-champ"></span>
      </div>

      <div class="pied-dialogue" style="justify-content: flex-start;">
        <button type="submit" class="btn btn-primaire">Enregistrer</button>
      </div>
    </form>

    <div class="carte">
      <h2>Vos données</h2>
      ${systeme.sauvegardesEnEchec ? `
        <p class="note-legale alerte">
          ${icone('cercle-alerte', { taille: 16 })}
          <span>Vos sauvegardes automatiques n’ont pas pu être écrites : le dossier ci-dessous
          est peut-être inaccessible (lecteur réseau déconnecté, disque plein). Vos saisies sont
          bien enregistrées, mais sans filet pour l’instant : téléchargez une copie ci-dessous
          par précaution.</span>
        </p>` : ''}
      <p>
        Tout le livre tient dans un seul fichier :<br>
        <span class="chemin-copiable">
          <code class="chemin">${echapperHtml(systeme.fichierDonnees)}</code>
          <button type="button" class="btn-icone" data-copier="${echapperHtml(systeme.fichierDonnees)}"
            title="Copier le chemin" aria-label="Copier le chemin du fichier de données">${icone('copier', { taille: 15 })}</button>
        </span>
      </p>
      <ul>
        <li>Une sauvegarde automatique est créée chaque jour, avant chaque import CSV
          et avant chaque restauration. Conservation : tout pendant 14 jours, puis une
          par semaine pendant 2 mois, puis une par mois pendant 1 an. S’y ajoute une
          copie de secours mise à jour à chaque saisie.</li>
        <li>Ces sauvegardes vivent <strong>en dehors</strong> du dossier de données :<br>
          <span class="chemin-copiable">
            <code class="chemin">${echapperHtml(systeme.dossierSauvegardes)}</code>
            <button type="button" class="btn-icone" data-copier="${echapperHtml(systeme.dossierSauvegardes)}"
              title="Copier le chemin" aria-label="Copier le chemin des sauvegardes">${icone('copier', { taille: 15 })}</button>
          </span><br>
          supprimer vos documents ne les efface donc pas, et l’application propose de
          tout reconstituer au démarrage suivant.</li>
        <li>Pour changer d’ordinateur ou vous protéger d’une panne : copiez le dossier
          de données (clé USB, dossier synchronisé…), c’est tout.</li>
      </ul>
      <div class="actions-donnees">
        <a class="btn btn-secondaire" href="/api/sauvegarde">${icone('telecharger', { taille: 16 })}<span>Télécharger une copie de mes données (JSON)</span></a>
      </div>
    </div>

    <div class="carte">
      <h2>Sauvegardes disponibles</h2>
      <p class="resume-filtre" id="resume-sauvegardes"></p>
      <div id="liste-sauvegardes"></div>
    </div>`;

  // ---- Modes de règlement personnalisés -----------------------------------------
  const listeModes = conteneur.querySelector('#liste-modes');

  function ligneMode({ code = '', libelle = '' } = {}) {
    const ligne = document.createElement('div');
    ligne.className = 'ligne-gestion';
    ligne.innerHTML = `
      <input type="text" class="libelle-gestion" value="${echapperHtml(libelle)}"
        placeholder="Nom du mode (ex. : Lydia)" aria-label="Nom du mode de règlement"
        data-code="${echapperHtml(code)}" maxlength="50">
      <button type="button" class="btn-icone danger" title="Supprimer" aria-label="Supprimer">${icone('corbeille', { taille: 16 })}</button>`;
    ligne.querySelector('button').addEventListener('click', () => ligne.remove());
    return ligne;
  }

  for (const mode of p.modesPersonnalises) {
    listeModes.appendChild(ligneMode(mode));
  }
  conteneur.querySelector('#ajouter-mode').addEventListener('click', () => {
    const ligne = ligneMode();
    listeModes.appendChild(ligne);
    ligne.querySelector('input').focus();
  });

  // ---- Enregistrement --------------------------------------------------------------
  const formulaire = conteneur.querySelector('#formulaire-parametres');
  formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    effacerErreursFormulaire(formulaire);
    const donnees = Object.fromEntries(new FormData(formulaire).entries());
    donnees.modesPersonnalises = [...listeModes.querySelectorAll('input')].map((champ) => ({
      code: champ.dataset.code,
      libelle: champ.value
    }));
    // Les cases décochées sont absentes de FormData : booléens explicites.
    for (const option of ['alertesNumerotation', 'alerteRecetteSimilaire', 'suiviSeuils', 'verifierMisesAJour']) {
      donnees[option] = formulaire[option].checked;
    }
    // Posée par le bouton « C'est fait » du tableau de bord : conservée telle quelle.
    donnees.dernierePeriodeDeclaree = etat.parametres.dernierePeriodeDeclaree;
    try {
      const reponse = await api.enregistrerParametres(donnees);
      definirParametres(reponse.parametres);
      // Reconstruit la liste avec les codes définitifs attribués par le serveur.
      listeModes.innerHTML = '';
      for (const mode of reponse.parametres.modesPersonnalises) {
        listeModes.appendChild(ligneMode(mode));
      }
      // Fin de la première mise en route : la carte de bienvenue disparaît.
      etat.systeme.premierLancement = false;
      conteneur.querySelector('#carte-bienvenue')?.remove();
      toast('Paramètres enregistrés.');
    } catch (erreur) {
      if (erreur.erreurs) {
        afficherErreursFormulaire(formulaire, erreur.erreurs);
      } else {
        toast(erreur.message, 'erreur');
      }
    }
  });

  // ---- Jeu de démonstration (première utilisation) -----------------------------------
  conteneur.querySelector('#charger-demo')?.addEventListener('click', async (evenement) => {
    const bouton = evenement.currentTarget;
    bouton.disabled = true;
    try {
      await api.chargerDemo();
      toast('Jeu de démonstration chargé.');
      window.location.hash = '#/';
      window.location.reload();
    } catch (erreur) {
      bouton.disabled = false;
      toast(erreur.message, 'erreur');
    }
  });

  // ---- Copie d'un chemin dans le presse-papiers --------------------------------------
  conteneur.querySelectorAll('[data-copier]').forEach((bouton) => {
    bouton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(bouton.dataset.copier);
        toast('Chemin copié dans le presse-papiers.');
      } catch {
        toast('Copie impossible : sélectionnez le chemin à la main.', 'erreur');
      }
    });
  });

  // ---- Sauvegardes -------------------------------------------------------------------
  const resumeSauvegardes = conteneur.querySelector('#resume-sauvegardes');
  const listeSauvegardes = conteneur.querySelector('#liste-sauvegardes');

  async function chargerSauvegardes() {
    const { sauvegardes } = await api.listerSauvegardes();
    resumeSauvegardes.textContent = sauvegardes.length === 0
      ? 'Aucune sauvegarde pour l’instant : la première sera créée à la prochaine modification.'
      : `${sauvegardes.length} sauvegarde${sauvegardes.length > 1 ? 's' : ''}, de la plus récente à la plus ancienne.`;

    listeSauvegardes.innerHTML = sauvegardes.map((s) => `
      <div class="ligne-gestion">
        <span class="libelle-gestion">${echapperHtml(s.fichier)}</span>
        <span class="details-gestion">${echapperHtml(new Date(s.date).toLocaleString('fr-FR'))} (${Math.max(1, Math.round(s.taille / 1024))} Ko)</span>
        <button type="button" class="btn btn-secondaire" data-fichier="${echapperHtml(s.fichier)}">
          ${icone('reinitialiser', { taille: 16 })}<span>Restaurer</span>
        </button>
      </div>`).join('');

    listeSauvegardes.querySelectorAll('[data-fichier]').forEach((bouton) => {
      bouton.addEventListener('click', async () => {
        const fichier = bouton.dataset.fichier;
        const accord = await confirmer({
          titre: 'Restaurer cette sauvegarde ?',
          message: `Toutes les données reviendront à l’état de « ${fichier} ». ` +
            'Le fichier actuel est d’abord mis de côté : rien n’est effacé.',
          boutonOk: 'Restaurer'
        });
        if (!accord) return;
        try {
          await api.restaurerSauvegarde(fichier);
          toast('Sauvegarde restaurée.');
          window.location.reload();
        } catch (erreur) {
          toast(erreur.message, 'erreur');
        }
      });
    });
  }

  await chargerSauvegardes();
}
