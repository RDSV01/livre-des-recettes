/**
 * Banc d'essai, côté navigateur : `npm run essai` seulement.
 *
 * Un bouton en bas de l'écran ouvre un panneau de situations à provoquer d'un
 * clic, pour essayer chaque écran sans attendre qu'un vrai livre les produise.
 * Chaque geste passe par l'API de l'application (paramètres, recettes) ou par
 * celle du banc (`/api/essai`, voir ../serveur.mjs), puis la page se recharge
 * pour tout montrer tel que l'utilisateur le verrait.
 */

import { echapperHtml, toast } from '/js/ui.js';
import { icone } from '/js/icones.js';
import { montrerNouveautes, versionsAnnoncees, CLE_NOUVEAUTES_VUES } from '/js/nouveautes.js';
import { cleRetrospectiveMasquee } from '/js/retrospective.js';
import {
  aujourdHuiIso, dateIso, formaterDate, idPeriode, finPeriode, echeanceDeclaration, trimestreDe, joursDuMois
} from '/partage/dates.js';
import { seuilsDe } from '/partage/seuils.js';

// ---- Outils ------------------------------------------------------------------------------

async function appel(chemin, corps, methode = 'POST') {
  const reponse = await fetch(chemin, {
    method: methode,
    headers: corps === undefined ? {} : { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps)
  });
  const json = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(json.erreur ?? `Erreur ${reponse.status}`);
  return json;
}
const lireParametres = async () => (await appel('/api/parametres', undefined, 'GET')).parametres;
async function regler(modification) {
  const parametres = await lireParametres();
  return appel('/api/parametres', { ...parametres, ...modification }, 'PUT');
}
const ajouterRecette = (champs) => appel('/api/recettes', {
  dateEncaissement: aujourdHuiIso(), client: 'Client d’essai', libelle: 'Prestation', numeroFacture: '',
  montant: 100, modeReglement: 'virement', categorie: '', ...champs
});
/** Une date ISO décalée de `jours`. */
const decaler = (iso, jours) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + jours);
  return dateIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
const recharger = (route = null) => {
  if (route !== null) location.hash = `#/${route}`;
  location.reload();
};
/** Retire les préférences d'affichage gardées par ce navigateur (sauf le thème). */
function oublierPreferences(filtre = () => true) {
  try {
    Object.keys(localStorage).filter((cle) => cle.startsWith('ldr-') && cle !== 'ldr-theme' && filtre(cle))
      .forEach((cle) => localStorage.removeItem(cle));
  } catch { /* stockage indisponible : rien à oublier */ }
}

// ---- Situations --------------------------------------------------------------------------

/** La vraie date du jour, et la période de déclaration en cours ce jour-là. */
function reperes(etatBanc, periodicite) {
  const vrai = new Date(Date.now() - etatBanc.decalage);
  const annee = vrai.getFullYear();
  const mois = vrai.getMonth() + 1;
  const type = periodicite === 'mois' ? 'mois' : 'trimestre';
  const valeur = type === 'mois' ? mois : trimestreDe(mois);
  // La période qui précède celle en cours : déjà déclarée dans les situations ci-dessous.
  const [aFinie, vFinie] = valeur > 1 ? [annee, valeur - 1] : [annee - 1, type === 'mois' ? 12 : 4];
  return { type, finie: { annee: aFinie, valeur: vFinie }, courante: { annee, valeur } };
}

function situations(etatBanc) {
  const date = (iso) => async () => { await appel('/api/essai/date', { date: iso }); recharger(); };
  const livre = (jeu, route = '') => async () => {
    await appel('/api/essai/livre', { jeu });
    if (jeu === 'vierge') oublierPreferences((cle) => cle !== 'ldr-rail' && cle !== 'ldr-densite-registres');
    recharger(route);
  };
  const reglage = (modification) => async () => { await regler(modification); recharger(); };

  /** La période en cours vient de s'achever (à déclarer), ou son échéance est passée (en retard). */
  const declaration = (enRetard) => async () => {
    const { periodiciteUrssaf } = await lireParametres();
    const r = reperes(etatBanc, periodiciteUrssaf);
    const fin = finPeriode(r.courante.annee, r.type, r.courante.valeur);
    const jour = enRetard ? decaler(echeanceDeclaration(r.courante.annee, r.type, r.courante.valeur), 2) : decaler(fin, 5);
    await regler({
      periodiciteUrssaf: r.type,
      dernierePeriodeDeclaree: idPeriode(r.finie.annee, r.type, r.finie.valeur)
    });
    await appel('/api/essai/date', { date: jour });
    recharger('');
  };

  /** Le chiffre d'affaires de l'année porté à une part d'un seuil. */
  const seuil = (cle, part, marge = 0) => async () => {
    const { typeActivite } = await lireParametres();
    const annee = new Date().getFullYear();
    const seuils = seuilsDe(typeActivite, annee);
    if (!seuils) throw new Error('Choisissez d’abord un type d’activité (section Activité).');
    const { caAnnee } = await appel(`/api/tableau-de-bord?annee=${annee}`, undefined, 'GET');
    const montant = Math.round((seuils[cle] * part + marge - caAnnee) * 100) / 100;
    if (montant <= 0) throw new Error('Le chiffre d’affaires de l’année y est déjà.');
    await ajouterRecette({ client: 'Essai des seuils', libelle: 'Grosse commande', montant, categorie: typeActivite === 'mixte' ? 'ventes' : '' });
    recharger('');
  };

  const ilYa = (mois) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - mois);
    return dateIso(d.getFullYear(), d.getMonth() + 1, Math.min(5, joursDuMois(d.getFullYear(), d.getMonth() + 1)));
  };

  return [
    {
      titre: 'Livre',
      note: 'Remplace tout le livre d’essai.',
      gestes: [
        ['Livre vierge (accueil guidé)', livre('vierge')],
        ['Jeu de démonstration', livre('demo')],
        ['Livre très chargé (6 ans, 6 000 recettes)', livre('charge')],
        ['Livre extrême (longueurs, gros montants)', livre('extreme')]
      ]
    },
    {
      titre: 'Date du jour',
      note: 'Simulée pour le serveur comme pour le navigateur.',
      champDate: true,
      gestes: [
        ['Vraie date', date(null)],
        ['Saison de la rétrospective (20 décembre)', date(dateIso(new Date(Date.now() - etatBanc.decalage).getFullYear(), 12, 20))],
        ['Rétrospective de l’année passée (15 janvier)', date(dateIso(new Date(Date.now() - etatBanc.decalage).getFullYear() + 1, 1, 15))],
        ['Nouvelle année (2 janvier)', date(dateIso(new Date(Date.now() - etatBanc.decalage).getFullYear() + 1, 1, 2))],
        ['Déclaration URSSAF à faire', declaration(false)],
        ['Déclaration URSSAF en retard', declaration(true)]
      ]
    },
    {
      titre: 'Activité',
      gestes: [
        ['Ventes', reglage({ typeActivite: 'ventes' })],
        ['Prestations (BIC)', reglage({ typeActivite: 'prestations' })],
        ['Libérale (BNC)', reglage({ typeActivite: 'liberal' })],
        ['Mixte', reglage({ typeActivite: 'mixte', naturePrestations: 'prestations' })],
        ['Non renseignée', reglage({ typeActivite: '' })]
      ]
    },
    {
      titre: 'URSSAF',
      gestes: [
        ['Déclaration mensuelle', reglage({ periodiciteUrssaf: 'mois' })],
        ['Trimestrielle', reglage({ periodiciteUrssaf: 'trimestre' })],
        ['Rythme non choisi', reglage({ periodiciteUrssaf: '' })],
        ['Rien de déclaré', reglage({ dernierePeriodeDeclaree: '' })],
        ['ACRE en cours', reglage({ acre: true, debutActivite: decaler(aujourdHuiIso(), -60) })],
        ['Sans ACRE', reglage({ acre: false })],
        ['Versement libératoire', async () => {
          const { versementLiberatoire } = await lireParametres();
          await regler({ versementLiberatoire: !versementLiberatoire });
          toast(`Versement libératoire ${versementLiberatoire ? 'retiré' : 'choisi'}.`);
        }]
      ]
    },
    {
      titre: 'Seuils de l’année',
      note: 'Ajoute la recette qui manque pour y arriver.',
      gestes: [
        ['Franchise de TVA à 90 %', seuil('franchiseTva', 0.9)],
        ['Franchise de TVA dépassée', seuil('franchiseTva', 1, 100)],
        ['Seuil majoré de TVA dépassé', seuil('franchiseTvaMajore', 1, 100)],
        ['Plafond micro à 90 %', seuil('plafondMicro', 0.9)],
        ['Plafond micro dépassé', seuil('plafondMicro', 1, 100)]
      ]
    },
    {
      titre: 'Registres',
      gestes: [
        ['Numéro de facture manquant', async () => {
          await ajouterRecette({ client: 'Essai numérotation', numeroFacture: 'ESSAI-001', montant: 120 });
          await ajouterRecette({ client: 'Essai numérotation', numeroFacture: 'ESSAI-003', montant: 140 });
          recharger('recettes');
        }],
        ['Doublon', async () => {
          await ajouterRecette({ client: 'Essai doublon', libelle: 'Affiches', montant: 260 });
          await ajouterRecette({ client: 'Essai doublon', libelle: 'Affiches', montant: 260 });
          recharger('recettes');
        }],
        ['Recette sans catégorie (mixte)', async () => {
          await ajouterRecette({ client: 'Essai catégorie', categorie: '' });
          recharger('');
        }],
        ['Recette qui revient chaque mois', async () => {
          for (const mois of [3, 2, 1]) {
            await ajouterRecette({ client: 'Essai abonnement', libelle: 'Abonnement mensuel', montant: 49, dateEncaissement: ilYa(mois) });
          }
          recharger('');
        }],
        ['Un achat', async () => {
          await appel('/api/achats', { dateReglement: aujourdHuiIso(), fournisseur: 'Fournisseur d’essai', referenceFacture: '', montant: 42.5, modeReglement: 'carte' });
          recharger('achats');
        }]
      ]
    },
    {
      titre: 'Sauvegardes et sécurité',
      gestes: [
        [etatBanc.cleBranchee ? 'Retirer la clé d’essai' : 'Brancher la clé d’essai', async () => {
          await appel('/api/essai/cle', { branchee: !etatBanc.cleBranchee });
          recharger();
        }],
        [etatBanc.sauvegardesEnPanne ? 'Réparer les sauvegardes' : 'Sauvegardes en panne', async () => {
          await appel('/api/essai/sauvegardes', { enPanne: !etatBanc.sauvegardesEnPanne });
          // La panne se voit à l'écriture suivante.
          if (!etatBanc.sauvegardesEnPanne) await regler({});
          recharger();
        }],
        ['Livre abîmé (récupération)', async () => { await appel('/api/essai/fichier', { etat: 'abime' }); recharger(''); }],
        ['Livre disparu (récupération)', async () => { await appel('/api/essai/fichier', { etat: 'absent' }); recharger(''); }]
      ]
    },
    {
      titre: 'Application',
      gestes: [
        [etatBanc.majSimulee ? 'Plus de mise à jour' : 'Mise à jour disponible', async () => {
          if (!etatBanc.majSimulee) await regler({ verifierMisesAJour: true });
          await appel('/api/essai/maj', { disponible: !etatBanc.majSimulee });
          recharger();
        }],
        ['Revoir les nouveautés', () => {
          try { localStorage.removeItem(CLE_NOUVEAUTES_VUES); } catch { /* sans gravité */ }
          montrerNouveautes(versionsAnnoncees().at(-1), { decouverte: false });
        }],
        ['Réafficher « Bien démarrer »', () => {
          oublierPreferences((cle) => cle.startsWith('ldr-bien-demarrer'));
          toast('« Bien démarrer » revient sur un livre de moins de dix recettes, accueil fait.');
          recharger('');
        }],
        ['Réafficher la carte de la rétrospective', () => {
          const annee = new Date().getFullYear();
          oublierPreferences((cle) => cle === cleRetrospectiveMasquee(annee) || cle === cleRetrospectiveMasquee(annee - 1));
          recharger('');
        }],
        ['Préférences d’affichage à zéro', () => { oublierPreferences(); recharger(); }],
        ['Serveur injoignable 20 s', async () => {
          await appel('/api/essai/panne', { secondes: 20 });
          toast('Le serveur ne répond plus pendant 20 secondes : changez de page, saisissez…');
        }]
      ]
    }
  ];
}

// ---- Panneau -----------------------------------------------------------------------------

function lienCss() {
  if (document.querySelector('link[href="/essai/banc.css"]')) return;
  const lien = document.createElement('link');
  lien.rel = 'stylesheet';
  lien.href = '/essai/banc.css';
  document.head.append(lien);
}

export async function installerBanc() {
  lienCss();
  const etatBanc = await appel('/api/essai', undefined, 'GET');
  const simulee = etatBanc.decalage !== 0;
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = `bouton-banc${simulee ? ' simule' : ''}`;
  bouton.innerHTML = `${icone('outil', { taille: 15 })}<span>Banc d’essai${simulee ? ` (${echapperHtml(formaterDate(aujourdHuiIso()))})` : ''}</span>`;
  bouton.title = simulee ? 'Date du jour simulée' : 'Provoquer une situation';
  document.body.append(bouton);

  const dialogue = document.createElement('dialog');
  dialogue.className = 'banc-essai';
  dialogue.setAttribute('aria-labelledby', 'titre-banc');
  const groupes = situations(etatBanc);
  dialogue.innerHTML = `
    <div class="banc-tete">
      <div><h2 id="titre-banc">Banc d’essai</h2>
        <p>${simulee ? `Date simulée : <strong>${echapperHtml(formaterDate(aujourdHuiIso()))}</strong>` : 'Vraie date du jour'}. Livre temporaire : votre vrai livre n’est pas touché.</p></div>
      <button type="button" class="btn-icone" data-fermer aria-label="Fermer">${icone('croix', { taille: 18 })}</button>
    </div>
    <div class="banc-corps">${groupes.map((g, i) => `
      <section class="banc-groupe">
        <h3>${echapperHtml(g.titre)}</h3>
        ${g.note ? `<p class="banc-note">${echapperHtml(g.note)}</p>` : ''}
        ${g.champDate ? `<form class="banc-date" data-date><input type="date" class="champ-texte" value="${aujourdHuiIso()}" aria-label="Date du jour simulée"><button class="btn btn-petit">Simuler ce jour</button></form>` : ''}
        <div class="banc-gestes">${g.gestes.map(([libelle], j) => `<button type="button" class="btn btn-petit" data-geste="${i}-${j}">${echapperHtml(libelle)}</button>`).join('')}</div>
      </section>`).join('')}
    </div>`;
  document.body.append(dialogue);

  bouton.addEventListener('click', () => dialogue.showModal());
  dialogue.addEventListener('click', async (evenement) => {
    if (evenement.target === dialogue || evenement.target.closest('[data-fermer]')) { dialogue.close(); return; }
    const cible = evenement.target.closest('[data-geste]');
    if (!cible) return;
    const [i, j] = cible.dataset.geste.split('-').map(Number);
    // Le panneau s'efface : on voit l'effet (la page se recharge le plus souvent).
    dialogue.close();
    try {
      await groupes[i].gestes[j][1]();
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
  });
  dialogue.querySelector('[data-date]').addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    const iso = evenement.target.querySelector('input').value;
    try {
      await appel('/api/essai/date', { date: iso || null });
      recharger();
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
  });
}
