/**
 * Contrôle d'un registre avant export.
 *
 * Passe en revue ce qu'un contrôleur regarderait en premier : mentions
 * obligatoires présentes, numérotation continue, absence de doublons. Le but
 * n'est pas de bloquer l'export (l'utilisateur reste maître de ses données)
 * mais de lui montrer noir sur blanc que son registre se tient, ou de pointer
 * précisément ce qui mérite un coup d'œil avant de l'imprimer.
 *
 * Chaque point de contrôle retourne :
 *   - `etat` : `ok`, `attention` (à regarder) ou `erreur` (mention légale
 *     manquante) ;
 *   - `libelle` : ce qui a été vérifié ;
 *   - `detail` : le constat, affiché sous le libellé.
 *
 * Module de calcul pur, appelé par la route d'export et testable seul.
 */

import { estDateIso } from './partage/dates.js';
import { MODES_REGLEMENT } from './partage/constantes.js';
import { analyserNumerotation } from './partage/factures.js';
import { estDoublon, estDoublonAchat } from './partage/doublons.js';
import { filtrerParPeriode } from './totaux.js';

/** Accorde « 3 lignes » / « 1 ligne ». */
const pluriel = (nombre, mot, terminaison = 's') => `${nombre} ${mot}${nombre > 1 ? terminaison : ''}`;

/**
 * Point de contrôle sur une mention obligatoire : toutes les lignes doivent la
 * porter. Une absence est une erreur, la mention étant exigée par la loi.
 */
function mentionObligatoire(lignes, { libelle, present, nom }) {
  const manquantes = lignes.filter((l) => !present(l)).length;
  return {
    libelle,
    etat: manquantes === 0 ? 'ok' : 'erreur',
    detail: manquantes === 0
      ? `${pluriel(lignes.length, 'ligne')} vérifiée${lignes.length > 1 ? 's' : ''}.`
      : `${pluriel(manquantes, 'ligne')} sans ${nom}.`
  };
}

/**
 * Compte les lignes qui font double emploi avec une ligne précédente. La liste
 * déjà parcourue est réutilisée telle quelle, plutôt que recopiée à chaque
 * tour : sur un registre chargé, la comparaison reste la même mais sans les
 * allocations inutiles.
 */
function compterDoublons(lignes, estDoublonDe) {
  const vues = [];
  let total = 0;
  for (const ligne of lignes) {
    if (estDoublonDe(ligne, vues)) total += 1;
    vues.push(ligne);
  }
  return total;
}

/** Point de contrôle « aucun doublon » commun aux deux registres. */
function controleDoublons(lignes, estDoublonDe, nom) {
  const doublons = compterDoublons(lignes, estDoublonDe);
  return {
    libelle: 'Absence de doublons',
    etat: doublons === 0 ? 'ok' : 'attention',
    detail: doublons === 0
      ? 'Aucune ligne ne fait double emploi.'
      : `${pluriel(doublons, nom)} ressemble${doublons > 1 ? 'nt' : ''} trait pour trait à une autre (même date, même tiers, même montant).`
  };
}

/** Codes de règlement acceptés : ceux d'origine plus ceux de l'utilisateur. */
function codesConnus(modesPersonnalises = []) {
  return new Set([
    ...MODES_REGLEMENT.map((m) => m.code),
    ...modesPersonnalises.map((m) => m.code)
  ]);
}

/**
 * Contrôle du livre des recettes sur une période.
 *
 * @param {object[]} recettes toutes les recettes du livre.
 * @param {object} periode `{ annee, mois }`, `mois` facultatif.
 * @param {object} parametres paramètres de l'entreprise (modes, type d'activité).
 * @returns {{ nombre: number, points: object[] }}
 */
export function controlerRecettes(recettes, periode, parametres = {}) {
  const selection = filtrerParPeriode(recettes, periode, 'dateEncaissement');
  const codes = codesConnus(parametres.modesPersonnalises);
  const points = [
    mentionObligatoire(selection, {
      libelle: 'Date de réception du paiement',
      present: (r) => estDateIso(r.dateEncaissement),
      nom: 'date valide'
    }),
    mentionObligatoire(selection, {
      libelle: 'Identité du client',
      present: (r) => String(r.client ?? '').trim() !== '',
      nom: 'client'
    }),
    mentionObligatoire(selection, {
      libelle: 'Montant encaissé',
      present: (r) => Number(r.montant) > 0,
      nom: 'montant valide'
    }),
    mentionObligatoire(selection, {
      libelle: 'Mode de règlement',
      present: (r) => codes.has(r.modeReglement),
      nom: 'mode de règlement connu'
    })
  ];

  // Le numéro de facture n'est exigé que s'il existe une facture : son absence
  // se signale, sans être traitée comme une donnée manquante.
  const sansNumero = selection.filter((r) => String(r.numeroFacture ?? '').trim() === '').length;
  points.push({
    libelle: 'Numéro de facture renseigné',
    etat: sansNumero === 0 ? 'ok' : 'attention',
    detail: sansNumero === 0
      ? 'Toutes les recettes portent un numéro.'
      : `${pluriel(sansNumero, 'recette')} sans numéro de facture.`
  });

  const { doublons, manquants } = analyserNumerotation(selection);
  const trous = manquants.reduce((acc, s) => acc + s.numeros.length, 0);
  points.push({
    libelle: 'Continuité de la numérotation',
    etat: doublons.length === 0 && trous === 0 ? 'ok' : 'attention',
    detail: doublons.length === 0 && trous === 0
      ? 'Aucun numéro en double ni manquant.'
      : [
        doublons.length > 0 && `${pluriel(doublons.length, 'numéro', 's')} en double`,
        trous > 0 && `${pluriel(trous, 'numéro', 's')} manquant${trous > 1 ? 's' : ''} dans la série`
      ].filter(Boolean).join(', ') + '.'
  });

  points.push(controleDoublons(selection, estDoublon, 'recette'));

  // La ventilation ventes / prestations ne concerne que les activités mixtes :
  // ailleurs, une catégorie vide est normale et ne mérite aucun signalement.
  if (parametres.typeActivite === 'mixte') {
    const sansCategorie = selection.filter((r) => !r.categorie).length;
    points.push({
      libelle: 'Ventilation ventes / prestations',
      etat: sansCategorie === 0 ? 'ok' : 'attention',
      detail: sansCategorie === 0
        ? 'Toutes les recettes sont classées.'
        : `${pluriel(sansCategorie, 'recette')} sans catégorie : elle${sansCategorie > 1 ? 's' : ''} manquera${sansCategorie > 1 ? 'ont' : ''} aux sous-totaux « dont ventes / dont prestations ».`
    });
  }

  return { nombre: selection.length, points };
}

/**
 * Contrôle du registre des achats sur une période.
 *
 * @param {object[]} achats tous les achats du registre.
 * @param {object} periode `{ annee, mois }`, `mois` facultatif.
 * @param {object} parametres paramètres de l'entreprise (modes de paiement).
 * @returns {{ nombre: number, points: object[] }}
 */
export function controlerAchats(achats, periode, parametres = {}) {
  const selection = filtrerParPeriode(achats, periode, 'dateReglement');
  const codes = codesConnus(parametres.modesPersonnalises);
  const sansReference = selection.filter((a) => String(a.referenceFacture ?? '').trim() === '').length;

  return {
    nombre: selection.length,
    points: [
      mentionObligatoire(selection, {
        libelle: 'Date du règlement',
        present: (a) => estDateIso(a.dateReglement),
        nom: 'date valide'
      }),
      mentionObligatoire(selection, {
        libelle: 'Identité du fournisseur',
        present: (a) => String(a.fournisseur ?? '').trim() !== '',
        nom: 'fournisseur'
      }),
      mentionObligatoire(selection, {
        libelle: 'Montant de l’achat',
        present: (a) => Number(a.montant) > 0,
        nom: 'montant valide'
      }),
      mentionObligatoire(selection, {
        libelle: 'Mode de paiement',
        present: (a) => codes.has(a.modeReglement),
        nom: 'mode de paiement connu'
      }),
      {
        libelle: 'Référence de la pièce justificative',
        etat: sansReference === 0 ? 'ok' : 'attention',
        detail: sansReference === 0
          ? 'Chaque achat renvoie à une facture ou à un justificatif.'
          : `${pluriel(sansReference, 'achat')} sans référence de justificatif.`
      },
      controleDoublons(selection, estDoublonAchat, 'achat')
    ]
  };
}
