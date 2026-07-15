/**
 * Vue « Paramètres » : identité de l'entreprise (reprise dans les exports),
 * préférences d'affichage, et informations sur les données locales.
 */

import { api } from '../api.js';
import { etat, definirParametres } from '../etat.js';
import { toast, echapperHtml, afficherErreursFormulaire, effacerErreursFormulaire } from '../ui.js';
import { icone } from '../icones.js';
import { DEVISES, FORMATS_DATE } from '/partage/constantes.js';

export async function vueParametres(conteneur) {
  const p = etat.parametres;

  conteneur.innerHTML = `
    <header class="entete-vue">
      <div>
        <h1>Paramètres</h1>
        <p>Ces informations figurent en tête de vos exports.</p>
      </div>
    </header>

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
      <div class="pied-dialogue" style="justify-content: flex-start;">
        <button type="submit" class="btn btn-primaire">Enregistrer</button>
      </div>
    </form>

    <div class="carte">
      <h2>Vos données</h2>
      <p>
        Tout le livre tient dans un seul fichier sur cette machine :<br>
        <code class="chemin">${echapperHtml(etat.systeme.fichierDonnees)}</code>
      </p>
      <ul>
        <li>Une sauvegarde automatique est conservée chaque jour dans le sous-dossier
          <code class="chemin">sauvegardes</code> (30 jours glissants).</li>
        <li>Pour changer d’ordinateur ou vous protéger d’une panne : copiez le dossier
          <code class="chemin">data</code> (clé USB, dossier synchronisé…), c’est tout.</li>
      </ul>
      <a class="btn btn-secondaire" href="/api/sauvegarde">${icone('telecharger', { taille: 16 })}<span>Télécharger une copie de mes données (JSON)</span></a>
    </div>`;

  const formulaire = conteneur.querySelector('#formulaire-parametres');
  formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    effacerErreursFormulaire(formulaire);
    const donnees = Object.fromEntries(new FormData(formulaire).entries());
    try {
      const reponse = await api.enregistrerParametres(donnees);
      definirParametres(reponse.parametres);
      toast('Paramètres enregistrés.');
    } catch (erreur) {
      if (erreur.erreurs) {
        afficherErreursFormulaire(formulaire, erreur.erreurs);
      } else {
        toast(erreur.message, 'erreur');
      }
    }
  });
}
