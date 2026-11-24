/**
 * Ce qui change, version par version, dit en mots simples : trois ou quatre
 * points qui comptent pour l'utilisateur, pas la liste des corrections.
 *
 * Au premier lancement d'une version qui figure ici, une boîte les présente
 * une seule fois (voir `montrerNouveautes`). Une version absente ne montre rien.
 */

import { echapperHtml, identifiantUnique, lirePreference, ecrirePreference } from './ui.js';
import { icone } from './icones.js';

const NOUVEAUTES = {
  '2.4.0': [
    { icone: 'tableau-de-bord', titre: 'Un tableau de bord plus lisible', texte: 'Dernières recettes présentées comme un relevé, plafonds estimés au 31 décembre et le détail d’un mois en un clic.' },
    { icone: 'historique', titre: 'La rétrospective de l’année', texte: 'Votre année racontée en scènes animées : le total, le meilleur mois, vos clients, vos habitudes. En fin d’année sur le tableau de bord, et à tout moment depuis le rapport annuel, dans les exports.' },
    { icone: 'recettes', titre: 'Des registres plus confortables', texte: 'Mois collés en haut, mode compact, filtres qui disent combien ils trouvent, navigation au clavier, et le bilan d’un client au survol.' },
    { icone: 'plus', titre: 'Une saisie plus sûre', texte: 'Le montant en tête, la facture déposée n’importe où, la série comptée, les doublons comparés côte à côte et les suppressions confirmées.' },
    { icone: 'urssaf', titre: 'URSSAF et clients plus clairs', texte: 'L’année des déclarations en frise, le calcul dessiné, les cases à reporter comme sur le formulaire, et une fiche complète pour chaque client.' }
  ]
};

/** Les versions qui ont leurs nouveautés, de la plus ancienne à la plus récente. */
export const versionsAnnoncees = () => Object.keys(NOUVEAUTES);

/** La dernière version dont les nouveautés ont été montrées dans ce navigateur. */
export const CLE_NOUVEAUTES_VUES = 'ldr-nouveautes-vues';
const CLE = CLE_NOUVEAUTES_VUES;

/**
 * Montre une fois les nouveautés de la version en cours. Un premier lancement
 * (rien à comparer) note simplement la version : on ne présente pas les
 * nouveautés d'une application qu'on découvre.
 *
 * @param {string} version
 * @param {{ decouverte: boolean }} options
 */
export function montrerNouveautes(version, { decouverte }) {
  const points = NOUVEAUTES[version];
  if (!points || lirePreference(CLE) === version) return;
  ecrirePreference(CLE, version);
  if (decouverte) return;
  const dialogue = document.createElement('dialog');
  dialogue.className = 'boite boite-nouveautes';
  const idTitre = identifiantUnique('titre-nouveautes');
  dialogue.setAttribute('aria-labelledby', idTitre);
  dialogue.innerHTML = `
    <form method="dialog" class="boite-corps">
      <div class="boite-tete"><span class="boite-tuile">${icone('cercle-valide', { taille: 18 })}</span><h2 id="${idTitre}">Ce qui change dans la version ${echapperHtml(version)}</h2></div>
      <ul class="liste-nouveautes">${points.map((p) => `<li>
        <span class="tuile-nouveaute">${icone(p.icone, { taille: 16 })}</span>
        <div><strong>${echapperHtml(p.titre)}</strong><span>${echapperHtml(p.texte)}</span></div></li>`).join('')}</ul>
      <div class="boite-pied"><button class="btn btn-principal" value="ok">Compris</button></div>
    </form>`;
  document.body.append(dialogue);
  dialogue.addEventListener('close', () => dialogue.remove());
  dialogue.showModal();
}
