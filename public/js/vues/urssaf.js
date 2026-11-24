/**
 * Vue « URSSAF » : les périodes de l'année en onglets avec leur état (douze
 * mois ou quatre trimestres, selon le rythme choisi dans les paramètres), puis
 * la période choisie : ce qu'il faut déclarer, avant quelle date, ce que
 * l'URSSAF prélèvera et ce qu'il en restera. Simple calcul local, aucune
 * connexion.
 *
 * L'écran répond d'abord en trois chiffres (à déclarer, prélevé, reste) ; le
 * calcul qui les justifie, base par base et taux par taux, se déplie à la
 * demande.
 */

import { api } from '../api.js';
import { etat, modifierParametres } from '../etat.js';
import { echapperHtml, toast, accorder, choixAnnee, brancherChoixAnnee, mouvementReduit, enFondu } from '../ui.js';
import { reussite, halo, bandeauRetour, copierDansPressePapiers } from '../retours.js';
import { icone } from '../icones.js';
import { pastilleEtat, blocSansChiffreAffaires } from '../declarations.js';
import { formaterMontant, formaterMontantEntier } from '/partage/montants.js';
import {
  formaterDate, dateEnFrancaisLong, aujourdHuiIso, idPeriode, periodeDepuisId, nomMois, trimestreDe,
  echeanceDeclaration, dernierMois
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
  // Le résultat exact, quand l'arrondi à l'euro le change : « 240 € × 0,2 % = 0,48 € »
  // explique un prélèvement de 0 €.
  const calcul = (l) => {
    const exact = Math.round(l.base * Math.round(l.taux * 100) / 100) / 100;
    return `${entier(l.base)} × ${pourcentage(l.taux)}${exact === l.montant ? '' : ` = ${auCentime(exact)}`}`;
  };
  const ligne = (libelle, valeur, classe = '') =>
    `<div class="ligne-montant ${classe}"><span>${libelle}</span><span class="valeur">${valeur}</span></div>`;
  const prelevement = (titre, { lignes, total }) => (lignes.length <= 1
    ? ligne(`${titre}${lignes[0]?.acre ? ', taux ACRE' : ''}${lignes[0] ? ` <small>${calcul(lignes[0])}</small>` : ''}`, moins(total))
    : ligne(titre, moins(total)) + lignes.map((l) =>
      ligne(`${echapperHtml(l.libelle)}${depuis(l)} : ${calcul(l)}`, entier(l.montant), 'sous')).join(''));

  // Ce que devient l'encaissé, dessiné avant d'être détaillé : la part de
  // l'URSSAF, puis ce qui vous reste.
  const parts = [
    ['cotisations', c.total, 'Cotisations sociales'],
    ['formation', c.formationPro.total, 'Formation professionnelle'],
    ...(c.versementLiberatoire ? [['liberatoire', c.versementLiberatoire.total, 'Versement libératoire']] : []),
    ['reste', Math.max(0, c.reste), libelleReste]
  ].filter(([, m]) => m > 0);
  const totalParts = parts.reduce((s, [, m]) => s + m, 0);
  const barre = totalParts > 0 ? `
    <div class="barre-calcul" role="img" aria-label="${echapperHtml(parts.map(([, m, l]) => `${l} ${Math.round((m / totalParts) * 100)} %`).join(', '))}">
      ${parts.map(([cle, m]) => `<i class="part-${cle}" style="flex:${m}"></i>`).join('')}
    </div>
    <div class="legende-calcul" aria-hidden="true">
      <span><i class="part-urssaf"></i>URSSAF <strong>${entier(c.totalPreleve)}</strong></span>
      <span><i class="part-reste"></i>Pour vous <strong>${entier(Math.max(0, c.reste))}</strong></span>
    </div>` : '';

  const notes = [
    bilan.chiffreAffaires !== bilan.aDeclarer
      ? `La déclaration se fait en euros entiers : ${auCentime(bilan.chiffreAffaires)} encaissés se déclarent ${entier(bilan.aDeclarer)}.`
      : '',
    // Chiffre d'affaires qu'aucun taux ne couvre, hors recettes non classées
    // (déjà signalées plus haut) : encaissements antérieurs au premier taux connu.
    c.horsEstimation > 0 && bilan.nonCategorise.nombreEncaissements === 0
      ? `${auCentime(c.horsEstimation)} encaissés avant le plus ancien taux connu ne sont pas comptés : le reste affiché est donc surestimé.`
      : '',
    'Ceci est une estimation : le montant exact reste celui de l’URSSAF. Les frais de votre activité ne sont pas déduits.',
    c.lignes.some((l) => l.acre)
      ? 'Avec l’ACRE, la part du chiffre d’affaires qui dépasse un revenu égal au plafond de la sécurité sociale repasse au taux normal : l’estimation n’en tient pas compte.'
      : '',
    oublis.length ? `Vous ${oublis.join(' ou ')} ? <a href="#/parametres?section=regime">Indiquez-le dans les Paramètres</a>.` : ''
  ].filter(Boolean);

  return `
    <details class="details-calcul">
      <summary>${icone('chevron-bas', { taille: 16 })}Voir le détail du calcul</summary>
      <div class="contenu">
        ${barre}
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

  // ---- Périodes : celles du rythme choisi dans les paramètres (trimestres
  // tant qu'il n'est pas renseigné). Le découpage ne se choisit pas ici : un
  // autre rythme n'aurait rien à déclarer.
  const type = p().periodiciteUrssaf || 'trimestre';
  /** Un lien vers une période d'un autre rythme ouvre la période correspondante : le 3e trimestre devient septembre. */
  const dansLeRythme = (periode) => {
    if (!periode || periode.type === type) return periode;
    const mois = dernierMois(periode.type, periode.valeur);
    return { annee: periode.annee, type, valeur: type === 'mois' ? mois : trimestreDe(mois) };
  };
  const moisCourant = Number(aujourdHui.slice(5, 7));

  // ---- Période affichée : demandée par le lien, retenue, à traiter, ou en cours
  let choix = dansLeRythme(periodeDepuisId(params?.get('periode')))
    ?? (memoire?.type === type ? memoire : null)
    ?? (aTraiter ? { annee: aTraiter.annee, type, valeur: aTraiter.valeur } : null)
    ?? { annee: anneeCourante, type, valeur: type === 'mois' ? moisCourant : trimestreDe(moisCourant) };
  memoire = { ...choix };
  /** Un choix de l'utilisateur est retenu, et l'adresse le suit : un rechargement le retrouve. */
  const choisir = (nouveau) => {
    choix = nouveau;
    memoire = { ...choix };
    history.replaceState(null, '', `#/urssaf?periode=${idPeriode(choix.annee, choix.type, choix.valeur)}`);
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
    const activite = libelleActivite(p());
    const morceaux = [
      periodicite === 'mois' ? 'Déclaration mensuelle' : periodicite === 'trimestre' ? 'Déclaration trimestrielle' : 'Rythme de déclaration non renseigné',
      // Au fil de la phrase, le libellé de l'activité perd sa majuscule.
      activite ? echapperHtml(activite.charAt(0).toLowerCase() + activite.slice(1)) : 'activité non renseignée',
      `${p().versementLiberatoire ? 'avec' : 'sans'} versement libératoire`,
      // L'ACRE en cours se rappelle ; terminée, elle n'a plus rien à dire ici.
      // Espaces insécables : la mention ne se coupe pas en fin de ligne.
      ...(acre && acre.fin >= aujourdHui ? [`ACRE\u00a0jusqu’au\u00a0${echapperHtml(formaterDate(acre.fin, p().formatDate))}`] : [])
    ];
    return `${morceaux.join(', ')} <a class="lien-modifier" href="#/parametres?section=regime">Modifier</a>`;
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
        </div>
      </header>
      <div class="periodes${type === 'mois' ? ' mensuelles' : ''}" role="group" aria-label="Périodes" id="periodes"></div>
      <section class="carte declaration-page" id="detail" aria-labelledby="titre-periode" aria-live="polite"></section>
    </div>`;

  const page = conteneur.querySelector('.page');
  const zoneOnglets = page.querySelector('#periodes');
  const zone = page.querySelector('#detail');

  // ---- Onglets
  async function rendreOnglets() {
    const { periodes } = await api.periodesUrssaf({ annee: choix.annee, type: choix.type });
    const devise = p().devise;
    // Les périodes en frise : un repère par période, relié au suivant par un
    // trait qui se remplit jusqu'à la période en cours. L'année se lit comme
    // un parcours.
    const etats = periodes.map((periode) => etatPeriode({ annee: choix.annee, type: choix.type, valeur: periode.valeur }, p(), aujourdHui));
    const marque = (etatP) => ({
      declaree: icone('coche', { taille: 14 }),
      'en-retard': icone('triangle-alerte', { taille: 13 }),
      'a-declarer': icone('echeance', { taille: 14 }),
      'en-cours': icone('horloge', { taille: 14 })
    }[etatP] ?? '');
    zoneOnglets.innerHTML = periodes.map((periode, i) => {
      const etatP = etats[i];
      const montant = etatP === 'a-venir' ? 'À venir'
        : periode.nombreEncaissements === 0 ? 'Aucun encaissement'
          : `${formaterMontantEntier(periode.aDeclarer, devise)} ${etatP === 'declaree' ? 'déclarés' : etatP === 'en-cours' ? 'à ce jour' : etatP === 'ecoulee' ? 'encaissés' : 'à déclarer'}`;
      const suiteFaite = i < periodes.length - 1 && etats[i + 1] !== 'a-venir';
      return `<button type="button" class="periode etat-${etatP}${suiteFaite ? ' suite-faite' : ''}" data-valeur="${periode.valeur}" aria-pressed="${periode.valeur === choix.valeur}">
          <span class="marque-periode" aria-hidden="true">${marque(etatP)}</span>
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
    const bilan = await api.bilanUrssaf({ annee: choix.annee, type: choix.type, valeur: choix.valeur });
    const c = bilan.cotisations;
    const etatP = etatPeriode(choix, p(), aujourdHui);
    const id = idPeriode(choix.annee, choix.type, choix.valeur);
    const echeance = dateEnFrancaisLong(echeanceDeclaration(choix.annee, choix.type, choix.valeur));
    const quand = {
      'en-retard': `Échéance du ${echeance} dépassée de ${accorder(joursEntre(echeanceDeclaration(choix.annee, choix.type, choix.valeur), aujourdHui), 'jour')}`,
      'a-declarer': `À déclarer avant le ${echeance}`,
      'en-cours': 'Période en cours',
      'a-venir': `À déclarer avant le ${echeance}`,
      declaree: 'Période marquée comme déclarée',
      ecoulee: `Échéance : ${echeance}`
    }[etatP];
    const declarable = etatP === 'a-declarer' || etatP === 'en-retard';
    const annulable = etatP === 'declaree' && id === p().dernierePeriodeDeclaree;
    const libelleTotal = etatP === 'declaree' ? 'Déclaré' : etatP === 'en-cours' ? 'Encaissé à ce jour' : 'À déclarer';
    // Tant que la période n'est pas déclarée, les cotisations restent à payer :
    // le prélèvement et le reste se disent au futur.
    const aPayer = ['a-declarer', 'en-retard', 'en-cours', 'a-venir'].includes(etatP);
    const libellePreleve = aPayer ? 'Sera prélevé par l’URSSAF' : 'Prélevé par l’URSSAF';
    const libelleReste = aPayer ? 'Il vous restera' : 'Il vous reste';
    // Rien encaissé sur la période : des mots plutôt qu'une rangée de « 0 € ».
    const sansCA = bilan.chiffreAffaires === 0;
    // Chaque montant prend la forme de la case à remplir : son intitulé
    // au-dessus, le montant en euros entiers dedans, « Copier » au bout.
    const caseDeclaration = (etiquette, cle, montant) => `<div class="case-urssaf">
        <span class="intitule-case">${etiquette}</span>
        <div class="champ-case">
          <strong>${echapperHtml(formaterMontantEntier(montant, devise))}</strong>
          <button type="button" class="btn btn-petit btn-fantome" data-copier="${montant}" aria-label="Copier le montant des ${cle}, sans symbole de devise">${icone('copier', { taille: 15 })}Copier</button>
        </div>
      </div>`;

    zone.innerHTML = `
      <div class="carte-tete">
        <div>
          <h2 id="titre-periode">${libellePeriode(choix)}</h2>
          <div class="statut-ligne">${pastilleEtat(etatP)}<span>${quand}</span>${bilan.nombreEncaissements ? `<span class="attenue">${accorder(bilan.nombreEncaissements, 'encaissement')}</span>` : ''}</div>
        </div>
        <div class="actions">
          ${declarable ? `<button type="button" class="btn btn-principal" id="declarer">${icone('coche', { taille: 16 })}<span>Marquer comme déclarée</span></button>` : ''}
          ${annulable ? `<button type="button" class="btn btn-fantome" id="annuler-declaration">${icone('annuler', { taille: 16 })}Annuler la déclaration</button>` : ''}
        </div>
      </div>

      ${sansCA ? `<div class="chiffres-cles seul">${blocSansChiffreAffaires(etatP)}</div>
      ${estMixte && declarable ? '<p class="notes bloc-note">Indiquez 0 dans chaque case de votre déclaration, ventes comme prestations.</p>' : ''}` : `
      <div class="chiffres-cles${c ? '' : ' seul'}">
        <div class="chiffre-cle principal">
          <span class="libelle">${libelleTotal}${estMixte ? ' (total)' : ''}</span>
          <div class="valeur">${echapperHtml(formaterMontantEntier(bilan.aDeclarer, devise))}
            ${estMixte ? '' : `<button type="button" class="btn btn-petit" data-copier="${bilan.aDeclarer}" aria-label="Copier le montant, sans symbole de devise">${icone('copier', { taille: 15 })}Copier</button>`}</div>
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
      ${caseUrssaf(p().typeActivite) ? `<p class="notes bloc-note">À reporter dans la case
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

      ${detailCalcul(bilan, devise, formatDate, libelleReste, p())}`}`;

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
