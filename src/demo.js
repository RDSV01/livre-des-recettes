/**
 * Jeu de démonstration : un petit livre fictif, pour découvrir l'application
 * avant d'y saisir ses vraies données.
 *
 * Les dates sont calculées relativement à aujourd'hui pour tomber dans l'année
 * courante et alimenter le tableau de bord. Aucune donnée réelle, aucun SIRET
 * valide : ce n'est qu'une vitrine, chargée uniquement sur un livre vide et
 * effaçable d'un clic.
 */

/** Date ISO d'il y a `jours` jours (l'ordre chronologique reste réaliste). */
function ilYA(jours, maintenant) {
  const d = new Date(maintenant.getTime() - jours * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Construit le jeu de démonstration (activité mixte, pour tout montrer). */
export function construireJeuDemo(maintenant = new Date()) {
  return {
    parametres: {
      nomEntreprise: 'Atelier Démonstration',
      activite: 'Création de sites et vente de fournitures',
      typeActivite: 'mixte',
      periodiciteUrssaf: 'trimestre',
      jeuDemo: true
    },
    clients: [
      { nom: 'Café des Arts', siret: '' },
      { nom: 'Studio Lumen', siret: '' },
      { nom: 'SARL Bâtiment Plus', siret: '' },
      { nom: 'Mme Bernard', siret: '' },
      { nom: 'Boulangerie Dupré', siret: '' }
    ],
    recettes: [
      { dateEncaissement: ilYA(4, maintenant), client: 'Café des Arts', libelle: 'Maintenance mensuelle', numeroFacture: 'FAC-018', montant: 120, modeReglement: 'stripe', categorie: 'prestations' },
      { dateEncaissement: ilYA(9, maintenant), client: 'Mme Bernard', libelle: 'Séance photo portrait', numeroFacture: 'FAC-017', montant: 180, modeReglement: 'carte', categorie: 'prestations' },
      { dateEncaissement: ilYA(15, maintenant), client: 'SARL Bâtiment Plus', libelle: 'Refonte du site vitrine', numeroFacture: 'FAC-016', montant: 850, modeReglement: 'virement', categorie: 'prestations' },
      { dateEncaissement: ilYA(22, maintenant), client: 'Boulangerie Dupré', libelle: 'Vente de méthode de guitare', numeroFacture: '', montant: 45, modeReglement: 'especes', categorie: 'ventes' },
      { dateEncaissement: ilYA(30, maintenant), client: 'Boulangerie Dupré', libelle: 'Création de logo', numeroFacture: 'FAC-014', montant: 320, modeReglement: 'virement', categorie: 'prestations' },
      { dateEncaissement: ilYA(48, maintenant), client: 'Café des Arts', libelle: 'Maintenance mensuelle', numeroFacture: 'FAC-013', montant: 120, modeReglement: 'stripe', categorie: 'prestations' },
      { dateEncaissement: ilYA(59, maintenant), client: 'Studio Lumen', libelle: 'Landing page', numeroFacture: 'FAC-012', montant: 680, modeReglement: 'virement', categorie: 'prestations' },
      { dateEncaissement: ilYA(76, maintenant), client: 'Mme Bernard', libelle: 'Vente de tirages photo', numeroFacture: 'FAC-011', montant: 90, modeReglement: 'paypal', categorie: 'ventes' },
      { dateEncaissement: ilYA(94, maintenant), client: 'SARL Bâtiment Plus', libelle: 'Hébergement annuel', numeroFacture: 'FAC-010', montant: 240, modeReglement: 'virement', categorie: 'prestations' },
      { dateEncaissement: ilYA(120, maintenant), client: 'Café des Arts', libelle: 'Vente de stickers personnalisés', numeroFacture: '', montant: 60, modeReglement: 'carte', categorie: 'ventes' }
    ],
    achats: [
      { dateReglement: ilYA(7, maintenant), fournisseur: 'LDLC Pro', referenceFacture: 'FA-4471', montant: 1249, modeReglement: 'carte' },
      { dateReglement: ilYA(14, maintenant), fournisseur: 'OVHcloud', referenceFacture: 'OVH-07', montant: 35.88, modeReglement: 'carte' },
      { dateReglement: ilYA(35, maintenant), fournisseur: 'Métro Cash & Carry', referenceFacture: 'A-014', montant: 214.5, modeReglement: 'carte' },
      { dateReglement: ilYA(52, maintenant), fournisseur: 'Papeterie Léon', referenceFacture: '', montant: 48.9, modeReglement: 'especes' },
      { dateReglement: ilYA(70, maintenant), fournisseur: 'Grossiste Textile Paris', referenceFacture: 'FT-0312', montant: 890, modeReglement: 'virement' }
    ]
  };
}
