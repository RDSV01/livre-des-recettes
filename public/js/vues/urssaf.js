/**
 * Vue « URSSAF » : les périodes de l'année en onglets avec leur état (douze
 * mois ou quatre trimestres, selon le rythme choisi dans les paramètres, ou
 * l'année entière), puis la période choisie : ce qu'il faut déclarer, avant
 * quelle date, ce que l'URSSAF prélèvera et ce qu'il en restera. Simple calcul
 * local, aucune connexion.
 *
 * L'écran répond d'abord en trois chiffres (à déclarer, prélevé, reste) ; le
 * calcul qui les justifie, base par base et taux par taux, se déplie à la
 * demande.
 */

import { api } from '../api.js';
import { etat, modifierParametres } from '../etat.js';
import { echapperHtml, toast, accorder, choixAnnee, brancherChoixAnnee, mouvementReduit, enFondu } from '../ui.js';
import { reussite, halo, bandeauRetour, brancherSegmentes, copierDansPressePapiers } from '../retours.js';
import { icone } from '../icones.js';
import { pastilleEtat } from '../declarations.js';
import { formaterMontant, formaterMontantEntier } from '/partage/montants.js';
import {
  formaterDate, dateEnFrancaisLong, aujourdHuiIso, idPeriode, periodeDepuisId, nomMois, trimestreDe,
  echeanceDeclaration
} from '/partage/dates.js';
import { majusculeInitiale } from '/partage/texte.js';
import {
  etatPeriode, periodeATraiter, libellePeriode, periodePrecedente, joursEntre
} from '/partage/declarations.js';
import { libelleActivite, caseUrssaf, natureDesPrestations } from '/partage/seuils.js';
import { periodeAcre } from '/partage/acre.js';

/** « 12,3 % » plutôt que « 12.3 % ». */
const pourcentage = (taux) => `${String(taux).replace('.', ',')} %`;

/** Nom court d'un onglet : « 1er trimestre », « Janvier ». */
const nomOnglet = (type, valeur) => (type === 'trimestre'
  ? `${valeur}${valeur === 1 ? 'er' : 'e'} trimestre`
  : majusculeInitiale(nomMois(valeur)));

/** Période affichée, retenue d'une visite à l'autre. */
let memoire = null;

/**
 * Le calcul qui mène de l'encaissé au reste : l'encaissé, chaque prélèvement
 * retranché (avec sa base et son taux), puis le reste. Un prélèvement calculé
 * sur plusieurs bases (activité mixte, changement de taux en cours de
 * période) montre son total puis le détail en retrait.
 *
 * Tous les prélèvements sont en euros entiers, comme l'URSSAF les arrondit ;
 * seuls l'encaissé et le reste gardent leurs centimes. Un prélèvement nul
 * s'écrit « 0 € », sans signe moins.
 */
function detailCalcul(bilan, devise, formatDate, libelleReste, parametres) {
  const c = bilan.cotisations;
  if (!c) return '';
  // Options qui changent l'estimation et que l'utilisateur a pu oublier d'indiquer.
  const oublis = [
    !c.versementLiberatoire && 'avez opté pour le versement libératoire de l’impôt sur le revenu',
    !parametres.acre && 'bénéficiez de l’ACRE'
  ].filter(Boolean);
  const entier = (m) => echapperHtml(formaterMontantEntier(m, devise));
  const auCentime = (m) => echapperHtml(formaterMontant(m, devise));
  const moins = (m) => (m ? `− ${entier(m)}` : entier(0));

  // Quand un taux a changé pendant la période, la même activité revient à deux
  // taux : préciser depuis quand lève l'ambiguïté. Inutile sinon.
  const plusieursPaliers = new Set(c.lignes.map((l) => l.duJour)).size > 1;
  const depuis = (l) => (plusieursPaliers ? ` à partir du ${echapperHtml(formaterDate(l.duJour, formatDate))}` : '');
  const calcul = (l) => `${entier(l.base)} × ${pourcentage(l.taux)}`;
  const ligne = (libelle, valeur, classe = '') =>
    `<div class="ligne-montant ${classe}"><span>${libelle}</span><span class="valeur">${valeur}</span></div>`;
  const prelevement = (titre, { lignes, total }) => (lignes.length <= 1
    ? ligne(`${titre}${lignes[0]?.acre ? ', taux ACRE' : ''}${lignes[0] ? ` <small>${calcul(lignes[0])}</small>` : ''}`, moins(total))
    : ligne(titre, moins(total)) + lignes.map((l) =>
      ligne(`${echapperHtml(l.libelle)}${depuis(l)} : ${calcul(l)}`, entier(l.montant), 'sous')).join(''));

  const notes = [
    bilan.chiffreAffaires !== bilan.aDeclarer
      ? `La déclaration se fait en euros entiers : ${auCentime(bilan.chiffreAffaires)} encaissés se déclarent ${entier(bilan.aDeclarer)}.`
      : '',
    // Chiffre d'affaires qu'aucun taux ne couvre, hors recettes non classées
    // (déjà signalées plus haut) : encaissements antérieurs au premier taux connu.
    c.horsEstimation > 0 && bilan.nonCategorise.nombreEncaissements === 0
      ? `${auCentime(c.horsEstimation)} encaissés avant le plus ancien taux connu ne sont pas comptés : le reste affiché est donc surestimé.`
      : '',
    'Prélèvements arrondis à l’euro, comme sur le site de l’URSSAF. Estimation hors taxe pour frais de chambre consulaire ; le montant exact reste celui de l’URSSAF. Les frais de votre activité ne sont pas déduits.',
    c.lignes.some((l) => l.acre)
      ? 'Avec l’ACRE, la part du chiffre d’affaires qui dépasse un revenu égal au plafond de la sécurité sociale repasse au taux normal : l’estimation n’en tient pas compte.'
      : '',
    oublis.length ? `Vous ${oublis.join(' ou ')} ? <a href="#/parametres?section=regime">Indiquez-le dans les Paramètres</a>.` : ''
  ].filter(Boolean);

  return `
    <details class="details-calcul">
      <summary>${icone('chevron-bas', { taille: 16 })}Voir le détail du calcul</summary>
      <div class="contenu">
        ${ligne('Encaissé sur la période', auCentime(bilan.chiffreAffaires))}
        ${prelevement('Cotisations sociales', c)}
        ${prelevement('Formation professionnelle', c.formationPro)}
        ${c.versementLiberatoire ? prelevement('Versement libératoire de l’impôt sur le revenu', c.versementLiberatoire) : ''}
        ${ligne(libelleReste, auCentime(c.reste), 'reste')}
        ${notes.map((n) => `<p class="notes">${n}</p>`).join('')}
      </div>
    </details>`;
}

export async function vueUrssaf(conteneur, params) {
  const p = () => etat.parametres;
  const aujourdHui = aujourdHuiIso();
  const anneeCourante = Number(aujourdHui.slice(0, 4));
  const aTraiter = periodeATraiter(p());
  const { annees } = await api.listerAnnees();
  // L'année en cours et celle de la période à traiter restent proposées, même
  // sans encaissement (janvier, pour décembre).
  const anneesProposees = [...new Set([...annees, anneeCourante, ...(aTraiter ? [aTraiter.annee] : [])])].sort((a, b) => b - a);

  // ---- Période affichée : demandée par le lien, retenue, ou à traiter
  const demandee = periodeDepuisId(params?.get('periode'));
  const vueParDefaut = p().periodiciteUrssaf || 'trimestre';
  let choix;
  if (demandee) choix = demandee;
  else if (memoire && memoire.periodicite === p().periodiciteUrssaf) choix = memoire.choix;
  else if (aTraiter) choix = { annee: aTraiter.annee, type: aTraiter.type, valeur: aTraiter.valeur };
  else choix = { annee: anneeCourante, type: vueParDefaut, valeur: vueParDefaut === 'mois' ? Number(aujourdHui.slice(5, 7)) : trimestreDe(Number(aujourdHui.slice(5, 7))) };
  const retenir = () => { memoire = { periodicite: p().periodiciteUrssaf, choix: { ...choix } }; };
  retenir();
  /** Un choix de l'utilisateur est retenu, et l'adresse le suit : un rechargement le retrouve. */
  const choisir = (nouveau) => {
    choix = nouveau;
    retenir();
    const id = idPeriode(choix.annee, choix.type, choix.valeur);
    history.replaceState(null, '', id ? `#/urssaf?periode=${id}` : '#/urssaf');
  };
  if (!anneesProposees.includes(choix.annee)) {
    anneesProposees.push(choix.annee);
    anneesProposees.sort((a, b) => b - a);
  }

  // Le détail du calcul reste déplié d'une période à l'autre, si
  // l'utilisateur l'a ouvert : il compare alors les calculs.
  let detailOuvert = false;

  const rythme = () => {
    const periodicite = p().periodiciteUrssaf;
    const acre = periodeAcre(p());
    const morceaux = [
      periodicite === 'mois' ? 'Déclaration mensuelle' : periodicite === 'trimestre' ? 'Déclaration trimestrielle' : 'Rythme de déclaration non renseigné',
      p().typeActivite ? echapperHtml(libelleActivite(p())) : 'activité non renseignée',
      `${p().versementLiberatoire ? 'avec' : 'sans'} versement libératoire`,
      // L'ACRE en cours se rappelle ; terminée, elle n'a plus rien à dire ici.
      // Espaces insécables : la mention ne se coupe pas en fin de ligne.
      ...(acre && acre.fin >= aujourdHui ? [`ACRE\u00a0jusqu’au\u00a0${echapperHtml(formaterDate(acre.fin, p().formatDate))}`] : [])
    ];
    // Chaque morceau reste d'un seul tenant : la ligne ne se coupe qu'après un
    // point (`<wbr>`, sans ajouter d'espace).
    const point = '<span class="point">·</span><wbr>';
    return `${morceaux.map((m) => `<span class="morceau">${m}</span>`).join(point)}${point}<a href="#/parametres?section=regime">Modifier</a>`;
  };

  conteneur.innerHTML = `
    <div class="page">
      <header class="entete-page">
        <div>
          <h1>Déclaration URSSAF</h1>
          <p class="sous-titre">${rythme()}</p>
        </div>
        <div class="actions">
          ${choixAnnee({ id: 'urssaf-annee', etiquette: 'Année' })}
          <div class="segmente compact" role="group" aria-label="Découpage">
            <button type="button" data-decoupage="mois" aria-pressed="${choix.type === 'mois'}">Mois</button>
            <button type="button" data-decoupage="trimestre" aria-pressed="${choix.type === 'trimestre'}">Trimestres</button>
            <button type="button" data-decoupage="annee" aria-pressed="${choix.type === 'annee'}">Année</button>
          </div>
        </div>
      </header>
      <div class="periodes" role="group" aria-label="Périodes" id="periodes"></div>
      <section class="carte declaration-page" id="detail" aria-labelledby="titre-periode" aria-live="polite"></section>
    </div>`;

  const page = conteneur.querySelector('.page');
  const zoneOnglets = page.querySelector('#periodes');
  const zone = page.querySelector('#detail');
  brancherSegmentes(page);

  // ---- Onglets
  async function rendreOnglets() {
    if (choix.type === 'annee') {
      zoneOnglets.hidden = true;
      zoneOnglets.innerHTML = '';
      return;
    }
    const { periodes } = await api.periodesUrssaf({ annee: choix.annee, type: choix.type });
    const devise = p().devise;
    zoneOnglets.hidden = false;
    zoneOnglets.classList.toggle('mensuelles', choix.type === 'mois');
    zoneOnglets.innerHTML = periodes.map((periode) => {
      const etatP = etatPeriode({ annee: choix.annee, type: choix.type, valeur: periode.valeur }, p(), aujourdHui);
      const montant = etatP === 'a-venir' ? 'À venir'
        : periode.nombreEncaissements === 0 ? 'Aucun encaissement'
          : `${formaterMontantEntier(periode.aDeclarer, devise)} ${etatP === 'declaree' ? 'déclarés' : etatP === 'en-cours' ? 'à ce jour' : etatP === 'ecoulee' ? 'encaissés' : 'à déclarer'}`;
      return `<button type="button" class="periode" data-valeur="${periode.valeur}" aria-pressed="${periode.valeur === choix.valeur}">
          <span class="nom">${nomOnglet(choix.type, periode.valeur)}</span>
          <span class="montant">${echapperHtml(montant)}</span>
          ${pastilleEtat(etatP)}
        </button>`;
    }).join('');
  }

  // ---- Détail de la période choisie
  async function rendreDetail() {
    const { devise, formatDate } = p();
    const estMixte = p().typeActivite === 'mixte';
    const bilan = await api.bilanUrssaf({ annee: choix.annee, type: choix.type, valeur: choix.type === 'annee' ? '' : choix.valeur });
    const c = bilan.cotisations;
    const parPeriode = choix.type !== 'annee';
    const etatP = parPeriode ? etatPeriode(choix, p(), aujourdHui) : null;
    const id = parPeriode ? idPeriode(choix.annee, choix.type, choix.valeur) : null;
    const echeance = parPeriode ? dateEnFrancaisLong(echeanceDeclaration(choix.annee, choix.type, choix.valeur)) : '';
    const quand = {
      'en-retard': `Échéance du ${echeance} dépassée de ${accorder(joursEntre(echeanceDeclaration(choix.annee, choix.type, choix.valeur), aujourdHui), 'jour')}`,
      'a-declarer': `À déclarer avant le ${echeance}`,
      'en-cours': 'Période en cours',
      'a-venir': `À déclarer avant le ${echeance}`,
      declaree: 'Période marquée comme déclarée',
      ecoulee: p().periodiciteUrssaf ? 'Hors de votre rythme de déclaration' : `Échéance : ${echeance}`
    }[etatP] ?? '';
    const declarable = etatP === 'a-declarer' || etatP === 'en-retard';
    const annulable = etatP === 'declaree' && id === p().dernierePeriodeDeclaree;
    const libelleTotal = choix.type === 'annee' ? 'Encaissé sur l’année'
      : etatP === 'declaree' ? 'Déclaré' : etatP === 'en-cours' ? 'Encaissé à ce jour' : 'À déclarer';
    // Tant que la période n'est pas déclarée, les cotisations restent à payer :
    // le prélèvement et le reste se disent au futur.
    const aPayer = ['a-declarer', 'en-retard', 'en-cours', 'a-venir'].includes(etatP);
    const libellePreleve = aPayer ? 'Sera prélevé par l’URSSAF' : 'Prélevé par l’URSSAF';
    const libelleReste = aPayer ? 'Il vous restera' : 'Il vous reste';
    const caseDeclaration = (etiquette, cle, montant) => `<div class="case-urssaf">
        <span>${etiquette}</span>
        <strong>${echapperHtml(formaterMontantEntier(montant, devise))}</strong>
        <button type="button" class="btn-icone" data-copier="${montant}" aria-label="Copier le montant des ${cle}, sans symbole de devise" title="Copier">${icone('copier', { taille: 16 })}</button>
      </div>`;

    zone.innerHTML = `
      <div class="carte-tete">
        <div>
          <h2 id="titre-periode">${libellePeriode(choix)}</h2>
          <div class="statut-ligne">${etatP ? pastilleEtat(etatP) : ''}${quand ? `<span>${quand}</span>` : ''}<span class="attenue">${accorder(bilan.nombreEncaissements, 'encaissement')}</span></div>
        </div>
        <div class="actions">
          ${declarable && choix.type === p().periodiciteUrssaf ? `<button type="button" class="btn btn-principal" id="declarer">${icone('coche', { taille: 16 })}<span>Marquer comme déclarée</span></button>` : ''}
          ${annulable ? `<button type="button" class="btn btn-fantome" id="annuler-declaration">${icone('annuler', { taille: 16 })}Annuler la déclaration</button>` : ''}
        </div>
      </div>

      <div class="chiffres-cles${c ? '' : ' seul'}">
        <div class="chiffre-cle principal">
          <span class="libelle">${libelleTotal}${estMixte ? ' (total)' : ''}</span>
          <div class="valeur">${echapperHtml(formaterMontantEntier(bilan.aDeclarer, devise))}
            <button type="button" class="btn btn-petit" data-copier="${bilan.aDeclarer}" aria-label="Copier le montant, sans symbole de devise">${icone('copier', { taille: 15 })}Copier</button></div>
        </div>
        ${c ? `
        <div class="chiffre-cle">
          <span class="libelle">${libellePreleve}</span>
          <div class="valeur">${echapperHtml(formaterMontantEntier(c.totalPreleve, devise))}</div>
          <span class="precision">estimation</span>
        </div>
        <div class="chiffre-cle reste">
          <span class="libelle">${libelleReste}</span>
          <div class="valeur">${echapperHtml(formaterMontantEntier(c.reste, devise))}</div>
          <span class="precision">estimation, ${c.versementLiberatoire ? 'impôt sur le revenu compris' : 'avant impôt sur le revenu'}</span>
        </div>` : ''}
      </div>
      ${c ? '' : `<p class="notes bloc-note"><a href="#/parametres?section=regime">Indiquez votre type d’activité</a> pour estimer ce que l’URSSAF prélèvera et ce qu’il vous restera.</p>`}
      ${parPeriode && caseUrssaf(p().typeActivite) ? `<p class="notes bloc-note">À reporter dans la case
        « ${echapperHtml(caseUrssaf(p().typeActivite))} » de votre déclaration.</p>` : ''}

      ${estMixte ? `<div class="bloc">
        <h3>À reporter case par case</h3>
        ${caseDeclaration(caseUrssaf('ventes'), 'ventes', bilan.ventes.aDeclarer)}
        ${caseDeclaration(caseUrssaf(natureDesPrestations(p().naturePrestations)), 'prestations', bilan.prestations.aDeclarer)}
      </div>` : ''}

      ${estMixte && bilan.nonCategorise.nombreEncaissements > 0 ? `
        <p class="avis">${icone('cercle-alerte', { taille: 17 })}<span>${accorder(bilan.nonCategorise.nombreEncaissements, 'recette', 'recettes')}
        sans catégorie (${echapperHtml(formaterMontant(bilan.nonCategorise.chiffreAffaires, devise))}) :
        classez-les en vente ou en prestation pour une ventilation et une estimation exactes.</span></p>` : ''}

      ${detailCalcul(bilan, devise, formatDate, libelleReste, p())}`;

    if (detailOuvert) zone.querySelector('.details-calcul')?.setAttribute('open', '');
  }

  async function rendreTout() {
    try {
      await Promise.all([rendreOnglets(), rendreDetail()]);
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
  }

  function enregistrerDerniereDeclaree(valeur) {
    return modifierParametres({ dernierePeriodeDeclaree: valeur });
  }

  // ---- Événements
  zone.addEventListener('toggle', (evenement) => {
    if (evenement.target.matches('.details-calcul')) detailOuvert = evenement.target.open;
  }, true);

  brancherChoixAnnee(page.querySelector('#urssaf-annee'), {
    annees: anneesProposees,
    choisie: choix.annee,
    surChoix: (annee) => {
      choisir({ ...choix, annee });
      enFondu(rendreTout);
    }
  });

  page.addEventListener('click', async (evenement) => {
    const decoupage = evenement.target.closest('[data-decoupage]');
    if (decoupage && decoupage.dataset.decoupage !== choix.type) {
      page.querySelectorAll('[data-decoupage]').forEach((b) => b.setAttribute('aria-pressed', String(b === decoupage)));
      const type = decoupage.dataset.decoupage;
      // On garde le même moment de l'année : juillet devient le 3e trimestre.
      const mois = choix.type === 'mois' ? choix.valeur : choix.type === 'trimestre' ? choix.valeur * 3 : 12;
      choisir({ annee: choix.annee, type, valeur: type === 'mois' ? mois : type === 'trimestre' ? trimestreDe(mois) : null });
      await enFondu(rendreTout);
      return;
    }

    const onglet = evenement.target.closest('.periode');
    if (onglet) {
      choisir({ ...choix, valeur: Number(onglet.dataset.valeur) });
      zoneOnglets.querySelectorAll('.periode').forEach((b) => b.setAttribute('aria-pressed', String(b === onglet)));
      await enFondu(() => rendreDetail().catch((erreur) => toast(erreur.message, 'erreur')));
      return;
    }

    const copie = evenement.target.closest('[data-copier]');
    if (copie) {
      // Le nombre nu, sans devise ni séparateur : prêt à coller dans le formulaire de l'URSSAF.
      copierDansPressePapiers(copie.dataset.copier, copie);
      return;
    }

    const declarer = evenement.target.closest('#declarer');
    if (declarer) {
      declarer.disabled = true;
      try {
        await enregistrerDerniereDeclaree(idPeriode(choix.annee, choix.type, choix.valeur));
      } catch (erreur) {
        declarer.disabled = false;
        toast(erreur.message, 'erreur');
        return;
      }
      reussite(declarer, 'Déclarée', { duree: 5000 });
      halo(declarer);
      // Le bouton a dit « Déclarée » : la période passe en fondu à son nouvel
      // état, et « Annuler la déclaration » prend la place du bouton (pas de
      // ligne « Annuler » en plus, qui ferait doublon).
      setTimeout(() => {
        if (page.isConnected) enFondu(rendreTout);
      }, mouvementReduit() ? 200 : 1100);
      return;
    }

    if (evenement.target.closest('#annuler-declaration')) {
      const avant = p().dernierePeriodeDeclaree;
      const precedente = periodePrecedente(choix);
      try {
        await enregistrerDerniereDeclaree(idPeriode(precedente.annee, precedente.type, precedente.valeur));
        await enFondu(async () => {
          await rendreTout();
          bandeauRetour(zone, `${libellePeriode(choix)} : déclaration annulée`, async () => {
            try {
              await enregistrerDerniereDeclaree(avant);
              await enFondu(rendreTout);
            } catch (erreur) {
              toast(erreur.message, 'erreur');
            }
          });
        });
      } catch (erreur) {
        toast(erreur.message, 'erreur');
      }
    }
  });

  await rendreTout();
}
