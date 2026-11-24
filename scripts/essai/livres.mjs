/**
 * Livres d'essai que la démonstration ne couvre pas : un livre très chargé
 * (des années d'activité, des centaines de clients) pour la fluidité, et un
 * livre extrême (noms et libellés très longs, montants énormes) pour la mise
 * en page. Toujours les mêmes d'un lancement à l'autre : le hasard est tiré
 * d'une graine fixe.
 */

import { dateIso, joursDuMois } from '../../src/partage/dates.js';

/** Un hasard reproductible (mulberry32). */
function hasard(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MODES = ['virement', 'virement', 'virement', 'carte', 'cheque', 'especes', 'paypal'];
const LIBELLES = ['Prestation', 'Site vitrine', 'Maintenance', 'Logo', 'Affiches', 'Séance photo', 'Conseil', 'Formation', 'Retouches', 'Catalogue'];
const PREFIXES = ['Atelier', 'Studio', 'Cabinet', 'Boulangerie', 'Librairie', 'Garage', 'Café', 'Agence', 'Maison', 'Ferme'];
const NOMS = ['Durand', 'Martin', 'Bernard', 'Petit', 'Robert', 'Richard', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Lefèvre', 'Garcia', 'Roux', 'Fournier', 'Girard'];

const PARAMETRES = {
  nomEntreprise: 'Atelier d’essai',
  activite: 'Graphisme et impression',
  adresse: '1 rue des Essais, 75001 Paris',
  typeActivite: 'mixte',
  naturePrestations: 'prestations',
  periodiciteUrssaf: 'trimestre'
};

/** Une date de l'année `annee`, jamais après aujourd'hui. */
function dateAuHasard(alea, annee, maintenant) {
  const dernierMois = annee === maintenant.getFullYear() ? maintenant.getMonth() + 1 : 12;
  const mois = 1 + Math.floor(alea() * dernierMois);
  const dernierJour = annee === maintenant.getFullYear() && mois === dernierMois ? maintenant.getDate() : joursDuMois(annee, mois);
  return dateIso(annee, mois, 1 + Math.floor(alea() * dernierJour));
}

/** Six ans d'activité : environ 6 000 recettes, 300 clients, 400 achats. */
export function livreCharge(maintenant) {
  const alea = hasard(2026);
  const clients = Array.from({ length: 300 }, (_, i) => ({
    nom: `${PREFIXES[i % PREFIXES.length]} ${NOMS[Math.floor(i / PREFIXES.length) % NOMS.length]}${i >= 150 ? ` ${i}` : ''}`,
    siret: ''
  }));
  const recettes = [];
  const anneeCourante = maintenant.getFullYear();
  for (let annee = anneeCourante - 5; annee <= anneeCourante; annee += 1) {
    const nombre = annee === anneeCourante ? Math.round(1000 * (maintenant.getMonth() + 1) / 12) : 1000;
    const lignes = Array.from({ length: nombre }, () => {
      const vente = alea() < 0.3;
      return {
        dateEncaissement: dateAuHasard(alea, annee, maintenant),
        // Les gros clients reviennent plus souvent.
        client: clients[Math.floor(alea() ** 2 * clients.length)].nom,
        libelle: LIBELLES[Math.floor(alea() * LIBELLES.length)],
        montant: Math.round((20 + alea() ** 3 * 2400) * 100) / 100,
        modeReglement: MODES[Math.floor(alea() * MODES.length)],
        categorie: vente ? 'ventes' : 'prestations'
      };
    }).sort((a, b) => a.dateEncaissement.localeCompare(b.dateEncaissement));
    lignes.forEach((r, i) => { r.numeroFacture = `F${annee}-${String(i + 1).padStart(4, '0')}`; });
    recettes.push(...lignes);
  }
  const achats = Array.from({ length: 400 }, (_, i) => ({
    dateReglement: dateAuHasard(alea, anneeCourante - 5 + (i % 6), maintenant),
    fournisseur: ['Imprimerie du Centre', 'Papeterie Léon', 'Métro Cash & Carry', 'Stickers & Co'][i % 4],
    referenceFacture: `A-${1000 + i}`,
    montant: Math.round((10 + alea() * 300) * 100) / 100,
    modeReglement: MODES[i % MODES.length]
  }));
  return { parametres: { ...PARAMETRES }, clients, recettes, achats };
}

/** Ce qui met la mise en page à l'épreuve : longueurs, montants, nombre de clients. */
export function livreExtreme(maintenant) {
  const annee = maintenant.getFullYear();
  const long = 'Société Coopérative d’Intérêt Collectif des Artisans Réunis du Grand Ouest et des Territoires Associés';
  const aujourdHui = dateIso(annee, maintenant.getMonth() + 1, maintenant.getDate());
  const recettes = [
    {
      dateEncaissement: aujourdHui, client: long,
      libelle: 'Restauration complète d’un ensemble de mobilier classé pour une exposition itinérante dans plusieurs musées',
      numeroFacture: 'F-2026-000000999-EXPOSITION', montant: 1234567.89, modeReglement: 'virement', categorie: 'prestations'
    },
    { dateEncaissement: aujourdHui, client: 'A', libelle: '', numeroFacture: '', montant: 0.01, modeReglement: 'especes', categorie: 'ventes' }
  ];
  const alea = hasard(7);
  for (let i = 0; i < 320; i += 1) {
    recettes.push({
      dateEncaissement: dateAuHasard(alea, annee, maintenant),
      client: `Client ${String(i % 120).padStart(3, '0')}${i % 7 === 0 ? ' Établissements Durand et Fils Associés' : ''}`,
      libelle: i % 5 === 0 ? 'Prestation avec un libellé particulièrement long pour voir comment il se coupe' : 'Prestation',
      numeroFacture: '', montant: 40 + (i % 50) * 7, modeReglement: MODES[i % MODES.length], categorie: i % 3 ? 'prestations' : 'ventes'
    });
  }
  const clients = [...new Set(recettes.map((r) => r.client))].map((nom) => ({ nom, siret: '' }));
  return {
    parametres: { ...PARAMETRES, nomEntreprise: 'Atelier de Restauration de Meubles Anciens et Contemporains du Grand Ouest', periodiciteUrssaf: 'mois' },
    clients,
    recettes,
    achats: [{ dateReglement: aujourdHui, fournisseur: long, referenceFacture: 'REF-TRES-LONGUE-0000000001', montant: 98765.43, modeReglement: 'carte' }]
  };
}
