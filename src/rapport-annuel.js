/**
 * Rapport annuel de gestion : la photographie d'une année d'activité.
 *
 * À ne pas confondre avec les deux registres légaux (livre des recettes,
 * registre des achats), dont le contenu et les colonnes sont imposés et ne
 * bougent pas. Ce rapport-ci n'est destiné ni à l'URSSAF ni à un contrôle :
 * il s'adresse au dirigeant qui veut comprendre son année (répartition des
 * encaissements, saisonnalité, clients qui pèsent, moyens de paiement).
 *
 * Module de calcul pur : il ne lit aucun fichier et ne met rien en forme.
 * `src/exports/rapport-pdf.js` se charge du rendu.
 */

import { enCentimes, enEuros } from './partage/montants.js';
import { normaliserTexte } from './partage/texte.js';
import { moisDe, nomMois } from './partage/dates.js';
import { libelleMode } from './partage/constantes.js';
import { filtrerParPeriode, totalMontants, parDateAsc } from './totaux.js';

/** Nombre de clients et de fournisseurs listés dans les classements. */
const TAILLE_CLASSEMENT = 5;

/** Part d'un montant dans un total, en pourcentage à une décimale. */
function part(centimes, totalCentimes) {
  if (totalCentimes === 0) return 0;
  return Math.round((centimes / totalCentimes) * 1000) / 10;
}

/**
 * Regroupe des lignes par tiers (client ou fournisseur) et les classe du plus
 * gros au plus petit. La comparaison ignore la casse et les accents, mais le
 * nom affiché reste celui saisi la première fois.
 */
function classementTiers(lignes, cleTiers, totalCentimes) {
  const groupes = new Map();
  for (const ligne of lignes) {
    const nom = String(ligne[cleTiers] ?? '').trim();
    const cle = normaliserTexte(nom);
    const groupe = groupes.get(cle) ?? { nom, nombre: 0, centimes: 0 };
    groupe.nombre += 1;
    groupe.centimes += enCentimes(ligne.montant);
    groupes.set(cle, groupe);
  }
  return [...groupes.values()]
    .sort((a, b) => b.centimes - a.centimes)
    .map((g) => ({
      nom: g.nom,
      nombre: g.nombre,
      montant: enEuros(g.centimes),
      part: part(g.centimes, totalCentimes)
    }));
}

/**
 * Répartition des encaissements par mode de règlement, du plus utilisé au
 * moins utilisé. Les modes personnalisés de l'utilisateur sont pris en compte.
 */
function repartitionModes(recettes, totalCentimes, modesPersonnalises) {
  const groupes = new Map();
  for (const recette of recettes) {
    const code = recette.modeReglement;
    const groupe = groupes.get(code) ?? { code, nombre: 0, centimes: 0 };
    groupe.nombre += 1;
    groupe.centimes += enCentimes(recette.montant);
    groupes.set(code, groupe);
  }
  return [...groupes.values()]
    .sort((a, b) => b.centimes - a.centimes)
    .map((g) => ({
      code: g.code,
      libelle: libelleMode(g.code, modesPersonnalises),
      nombre: g.nombre,
      montant: enEuros(g.centimes),
      part: part(g.centimes, totalCentimes)
    }));
}

/** Les douze mois de l'année, ceux sans encaissement compris. */
function mensuel(recettes, achats) {
  return Array.from({ length: 12 }, (_, i) => {
    const mois = i + 1;
    const duMois = recettes.filter((r) => moisDe(r.dateEncaissement) === mois);
    return {
      mois,
      nom: nomMois(mois),
      montant: totalMontants(duMois),
      nombre: duMois.length,
      achats: totalMontants(achats.filter((a) => moisDe(a.dateReglement) === mois))
    };
  });
}

/**
 * Construit le rapport d'une année.
 *
 * @param {object} donnees `{ recettes, achats, parametres }` du livre complet
 *   (le filtrage par année est fait ici, l'année précédente servant à mesurer
 *   l'évolution).
 * @param {number} annee année civile analysée.
 * @returns {object} rapport prêt à mettre en forme.
 */
export function rapportAnnuel({ recettes = [], achats = [], parametres = {} }, annee) {
  const modes = parametres.modesPersonnalises ?? [];
  const duRegistre = filtrerParPeriode(recettes, { annee }).sort(parDateAsc('dateEncaissement'));
  const achatsAnnee = filtrerParPeriode(achats, { annee }, 'dateReglement');

  const caCentimes = duRegistre.reduce((acc, r) => acc + enCentimes(r.montant), 0);
  const achatsCentimes = achatsAnnee.reduce((acc, a) => acc + enCentimes(a.montant), 0);
  const nombre = duRegistre.length;

  const parCategorie = (categorie) => {
    const groupe = categorie === null
      ? duRegistre.filter((r) => !r.categorie)
      : duRegistre.filter((r) => r.categorie === categorie);
    const centimes = groupe.reduce((acc, r) => acc + enCentimes(r.montant), 0);
    return { montant: enEuros(centimes), nombre: groupe.length, part: part(centimes, caCentimes) };
  };

  // Évolution : sans aucun encaissement l'année précédente, un pourcentage
  // n'aurait pas de sens (division par zéro), d'où `evolution: null`.
  const precedente = filtrerParPeriode(recettes, { annee: annee - 1 });
  const caPrecedentCentimes = precedente.reduce((acc, r) => acc + enCentimes(r.montant), 0);

  const mois = mensuel(duRegistre, achatsAnnee);
  const meilleurMois = mois.reduce((a, b) => (b.montant > a.montant ? b : a), mois[0]);

  // Le classement sert aussi à compter les clients : les regrouper deux fois
  // coûterait un parcours de plus et laisserait le décompte diverger du
  // classement si l'un des deux changeait de règle de rapprochement.
  const clients = classementTiers(duRegistre, 'client', caCentimes);

  return {
    annee,
    synthese: {
      chiffreAffaires: enEuros(caCentimes),
      nombreEncaissements: nombre,
      panierMoyen: nombre === 0 ? 0 : enEuros(Math.round(caCentimes / nombre)),
      ventes: parCategorie('ventes'),
      prestations: parCategorie('prestations'),
      nonCategorise: parCategorie(null),
      achats: { montant: enEuros(achatsCentimes), nombre: achatsAnnee.length },
      resultatBrut: enEuros(caCentimes - achatsCentimes),
      meilleurMois: meilleurMois.montant > 0 ? meilleurMois : null,
      premierEncaissement: nombre === 0 ? null : duRegistre[0].dateEncaissement,
      dernierEncaissement: nombre === 0 ? null : duRegistre[nombre - 1].dateEncaissement
    },
    comparaison: {
      annee: annee - 1,
      chiffreAffaires: enEuros(caPrecedentCentimes),
      nombreEncaissements: precedente.length,
      evolution: caPrecedentCentimes === 0
        ? null
        : Math.round(((caCentimes - caPrecedentCentimes) / caPrecedentCentimes) * 1000) / 10
    },
    mensuel: mois,
    modesReglement: repartitionModes(duRegistre, caCentimes, modes),
    clients: {
      nombre: clients.length,
      classement: clients.slice(0, TAILLE_CLASSEMENT)
    },
    fournisseurs: classementTiers(achatsAnnee, 'fournisseur', achatsCentimes).slice(0, TAILLE_CLASSEMENT),
    detail: duRegistre
  };
}
