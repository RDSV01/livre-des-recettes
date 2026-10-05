/**
 * Recherche dans tout le livre (Ctrl+K) : un seul champ qui trouve une page,
 * une action, un client, une recette ou un achat, où que l'on soit.
 *
 * Tout est déjà sur l'ordinateur : les listes sont lues à l'ouverture, puis
 * chaque frappe filtre en mémoire. Flèches pour choisir, Entrée pour y aller,
 * Échap pour fermer. Une recette ou un achat s'ouvre dans son registre, la
 * ligne mise en avant ; un client, sur sa fiche.
 */

import { api } from './api.js';
import { etat, registreAchatsUtile } from './etat.js';
import { echapperHtml, identifiantUnique, accorder, allerA, fermerAuClicSurLeVoile } from './ui.js';
import { icone } from './icones.js';
import { surlignageGlissant } from './glisseur.js';
import { surligner } from './autocompletion.js';
import { formaterMontant, analyserMontant, enCentimes } from '/partage/montants.js';
import { formaterDate } from '/partage/dates.js';
import { normaliserTexte } from '/partage/texte.js';

/** Au plus, par groupe : la liste reste lisible d'un coup d'œil. */
const LIMITES = { pages: 5, actions: 3, clients: 4, recettes: 6, achats: 4 };

/**
 * Chaque élément avec son texte de recherche, normalisé une fois à
 * l'ouverture plutôt qu'à chaque frappe. Un séparateur qu'on ne tape pas
 * empêche un mot de se trouver à cheval sur deux champs.
 */
const indexer = (liste, champs) => liste.map((element) => ({
  element, texte: champs(element).map(normaliserTexte).join('\u0001')
}));

/**
 * Ouvre la recherche.
 *
 * @param {object} options
 * @param {{ chemin: string, label: string, icone: string }[]} options.pages
 *   pages du menu, dans son ordre.
 */
export async function ouvrirRechercheGlobale({ pages }) {
  if (document.querySelector('dialog.boite-recherche')) return;
  const { devise, formatDate } = etat.parametres;
  const avecAchats = registreAchatsUtile();
  const idListe = identifiantUnique('resultats');

  const dialogue = document.createElement('dialog');
  dialogue.className = 'boite boite-recherche';
  dialogue.setAttribute('aria-label', 'Rechercher dans tout le livre');
  dialogue.innerHTML = `
    <label class="champ-recherche-globale">
      ${icone('recherche', { taille: 18 })}
      <span class="hors-ecran">Rechercher</span>
      <input type="search" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true"
        aria-controls="${idListe}" aria-autocomplete="list" placeholder="Client, libellé, facture, montant, page…">
      <kbd>Échap</kbd>
    </label>
    <div class="resultats-recherche" id="${idListe}" role="listbox" aria-label="Résultats"></div>
    <p class="pied-recherche"><span><kbd>↑</kbd><kbd>↓</kbd> pour choisir</span><span><kbd>Entrée</kbd> pour y aller</span></p>`;
  document.body.append(dialogue);
  const champ = dialogue.querySelector('input');
  const zone = dialogue.querySelector('.resultats-recherche');
  // Un seul surlignage, qui glisse d'un résultat à l'autre.
  const surlignage = surlignageGlissant(zone, { classe: 'choix' });
  const origine = document.activeElement;

  const fermer = () => {
    if (!dialogue.isConnected) return;
    dialogue.close();
    dialogue.remove();
  };
  /** Échap, ou un clic à côté : on revient où l'on était. */
  const abandonner = () => {
    fermer();
    if (origine instanceof HTMLElement && origine.isConnected) origine.focus({ preventScroll: true });
  };
  dialogue.addEventListener('cancel', (evenement) => {
    evenement.preventDefault();
    abandonner();
  });
  // Un clic sur le voile, hors de la boîte, la referme.
  fermerAuClicSurLeVoile(dialogue, abandonner);
  dialogue.showModal();
  champ.focus();

  // Recettes, achats et clients : lus plus bas, une fois. Le clavier répond
  // dès l'ouverture, pages et actions comprises ; les listes du livre
  // rejoignent les résultats dès qu'elles sont là.
  let indexRecettes = [];
  let indexAchats = [];
  let indexClients = [];

  const actions = [
    { libelle: 'Nouvelle recette', icone: 'plus', aller: '#/recettes?nouvelle=1', touche: 'N' },
    ...(avecAchats ? [{ libelle: 'Nouvel achat', icone: 'plus', aller: '#/achats?nouveau=1', touche: 'A' }] : []),
    { libelle: 'Raccourcis clavier', icone: 'info', aller: '#/parametres?section=raccourcis', touche: '?' }
  ];

  let resultats = [];
  let actif = 0;

  /** `garderChoix` : le résultat choisi le reste (les listes du livre arrivent après les pages). */
  function chercher({ garderChoix = false } = {}) {
    const saisie = champ.value.trim();
    const mot = normaliserTexte(saisie);
    // Une saisie qui se lit comme un montant (« 120 », « 120,50 ») le cherche aussi.
    const montant = analyserMontant(saisie);
    const centimes = montant === null ? null : enCentimes(montant);
    const contient = (texte) => normaliserTexte(texte).includes(mot);
    /** Les premiers éléments d'un index que la saisie désigne : seuls ceux-là seront mis en forme. */
    const trouves = (index, cle) => {
      const choisis = [];
      for (const { element, texte } of index) {
        if (texte.includes(mot) || (centimes !== null && 'montant' in element && enCentimes(element.montant) === centimes)) {
          choisis.push(element);
          if (choisis.length === LIMITES[cle]) break;
        }
      }
      return choisis;
    };
    const groupes = [];
    const ajouter = (titre, cle, elements) => {
      if (elements.length) groupes.push({ titre, elements: elements.slice(0, LIMITES[cle]) });
    };

    ajouter('Pages', 'pages', pages.filter((p) => !mot || contient(p.label)).map((p) => ({
      icone: p.icone, texte: p.label, aller: `#/${p.chemin}`
    })));
    ajouter('Actions', 'actions', actions.filter((a) => !mot || contient(a.libelle)).map((a) => ({
      icone: a.icone, texte: a.libelle, aller: a.aller, touche: a.touche
    })));
    if (mot) {
      ajouter('Clients', 'clients', trouves(indexClients, 'clients').map((c) => ({
        icone: 'clients', texte: c.nom,
        detail: c.nombreRecettes ? `${accorder(c.nombreRecettes, 'encaissement')}, ${formaterMontant(c.totalRecettes, devise)}` : 'aucun encaissement',
        aller: `#/clients?client=${encodeURIComponent(c.id)}`
      })));
      ajouter('Recettes', 'recettes', trouves(indexRecettes, 'recettes').map((r) => ({
        icone: 'recettes', texte: [r.client, r.libelle].filter(Boolean).join(' · '),
        detail: [formaterDate(r.dateEncaissement, formatDate), r.numeroFacture, formaterMontant(r.montant, devise)].filter(Boolean).join(' · '),
        aller: `#/recettes?voir=${encodeURIComponent(r.id)}`
      })));
      ajouter('Achats', 'achats', trouves(indexAchats, 'achats').map((a) => ({
        icone: 'achats', texte: a.fournisseur,
        detail: [formaterDate(a.dateReglement, formatDate), a.referenceFacture, formaterMontant(a.montant, devise)].filter(Boolean).join(' · '),
        aller: `#/achats?voir=${encodeURIComponent(a.id)}`
      })));
    }

    resultats = groupes.flatMap((g) => g.elements);
    actif = garderChoix ? Math.min(actif, Math.max(resultats.length - 1, 0)) : 0;
    let rang = -1;
    zone.innerHTML = groupes.length === 0
      ? `<p class="aucun-resultat">Rien ne correspond à «\u00a0${echapperHtml(saisie)}\u00a0».</p>`
      : groupes.map((g) => `<div class="groupe-resultats" role="group" aria-label="${g.titre}">
          <p class="titre-groupe" aria-hidden="true">${g.titre}</p>
          ${g.elements.map((e) => {
            rang += 1;
            return `<div class="resultat" role="option" id="${idListe}-${rang}" data-rang="${rang}" aria-selected="${rang === actif}">
              ${icone(e.icone, { taille: 16 })}
              <span class="resultat-texte"><strong>${surligner(e.texte, saisie)}</strong>${e.detail ? `<span>${echapperHtml(e.detail)}</span>` : ''}</span>
              ${e.touche ? `<kbd>${e.touche}</kbd>` : ''}
            </div>`;
          }).join('')}
        </div>`).join('');
    majActif();
  }

  function majActif() {
    zone.querySelectorAll('.resultat').forEach((r) => r.setAttribute('aria-selected', String(Number(r.dataset.rang) === actif)));
    const choisi = zone.querySelector(`[data-rang="${actif}"]`);
    surlignage.placer(choisi);
    if (choisi) {
      champ.setAttribute('aria-activedescendant', choisi.id);
      choisi.scrollIntoView({ block: 'nearest' });
    } else {
      champ.removeAttribute('aria-activedescendant');
    }
  }

  function aller(rang) {
    const resultat = resultats[rang];
    if (!resultat) return;
    fermer();
    // Même adresse (la recette déjà affichée) : la page est redessinée quand même.
    allerA(resultat.aller);
  }

  champ.addEventListener('input', () => chercher());
  champ.addEventListener('keydown', (evenement) => {
    if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      if (resultats.length === 0) return;
      actif = (actif + (evenement.key === 'ArrowDown' ? 1 : -1) + resultats.length) % resultats.length;
      majActif();
    } else if (evenement.key === 'Enter') {
      evenement.preventDefault();
      aller(actif);
    } else if (evenement.key === 'Escape' || ((evenement.ctrlKey || evenement.metaKey) && evenement.key.toLowerCase() === 'k')) {
      // Sans cela, Échap viderait d'abord le champ de recherche, et Ctrl+K
      // passerait au navigateur : l'un comme l'autre referment la boîte.
      evenement.preventDefault();
      abandonner();
    }
  });
  zone.addEventListener('mousemove', (evenement) => {
    const ligne = evenement.target.closest('.resultat');
    if (!ligne || Number(ligne.dataset.rang) === actif) return;
    actif = Number(ligne.dataset.rang);
    majActif();
  });
  zone.addEventListener('click', (evenement) => {
    const ligne = evenement.target.closest('.resultat');
    if (ligne) aller(Number(ligne.dataset.rang));
  });

  chercher();
  // Les listes, lues une fois : tout est local, c'est immédiat. Elles
  // arrivent déjà de la plus récente à la plus ancienne.
  try {
    const [{ recettes }, { achats }, { clients }] = await Promise.all([
      api.listerRecettes(),
      avecAchats ? api.listerAchats() : { achats: [] },
      api.listerClients()
    ]);
    indexRecettes = indexer(recettes, (r) => [r.client, r.libelle ?? '', r.numeroFacture ?? '']);
    indexAchats = indexer(achats, (a) => [a.fournisseur, a.referenceFacture ?? '']);
    indexClients = indexer(clients, (c) => [c.nom, c.siret ?? '']);
  } catch {
    return; // les pages et les actions restent cherchables
  }
  if (dialogue.isConnected) chercher({ garderChoix: true });
}
