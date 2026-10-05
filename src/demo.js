/**
 * Jeu de démonstration : un petit livre fictif, pour découvrir l'application
 * avant d'y saisir ses vraies données.
 *
 * Il fait travailler chaque écran : deux années d'activité (l'année d'avant
 * se compare à l'année en cours, le rapport annuel a de quoi dire), ventes et
 * prestations mêlées, tous les modes de règlement dont un personnalisé, une
 * maintenance prélevée chaque mois que le tableau de bord propose de
 * renouveler, des factures PDF jointes (sauf aux plus récentes), un numéro de
 * facture manquant que l'alerte de numérotation signale, et les trimestres
 * passés déjà déclarés.
 *
 * Les dates suivent le calendrier du jour : l'année en cours s'arrête à
 * aujourd'hui, jamais au-delà. Aucune donnée réelle, aucun SIRET : ce n'est
 * qu'une vitrine, chargée uniquement sur un livre vide et effaçable d'un clic.
 */

import PDFDocument from 'pdfkit';
import { idPeriode, echeanceDeclaration, trimestreDe, formaterDate, dateIso, joursDuMois } from './partage/dates.js';
import { periodePrecedente } from './partage/declarations.js';
import { formaterMontant } from './partage/montants.js';
import { texteSur, COULEURS } from './exports/commun.js';
import { libelleMode } from './partage/constantes.js';

/** Mode de règlement ajouté par l'utilisateur fictif : celui de la maintenance. */
const PRELEVEMENT = { code: 'perso-5e9a1c42', libelle: 'Prélèvement' };

const ENTREPRISE = {
  nomEntreprise: 'Atelier Démonstration',
  adresse: '8 place de l’Exemple, 69001 Lyon',
  activite: 'Studio graphique : sites, photo, imprimés et papeterie'
};

/**
 * Encaissements ponctuels, mois par mois (janvier à décembre) : ceux de
 * l'année d'avant, puis ceux de l'année en cours, un peu plus nombreux.
 * [jour, client, libellé, montant, catégorie, mode, facturée]
 */
const P = 'prestations';
const V = 'ventes';
const PASSAGE = 'Client de passage';
const ENCAISSEMENTS = {
  precedente: [
    [[8, 'Boulangerie Dupré', 'Carte de vœux illustrée', 180, P, 'virement', true], [22, PASSAGE, 'Tirages photo A4', 36, V, 'especes', false]],
    [[12, 'Studio Lumen', 'Retouche de portraits', 420, P, 'virement', true], [25, 'Librairie des Quais', 'Affiches pour la vitrine', 145, V, 'cheque', true]],
    [[6, 'SARL Bâtiment Plus', 'Site vitrine, acompte', 1200, P, 'virement', true], [19, 'Mme Bernard', 'Séance photo de famille', 220, P, 'carte', true]],
    [[9, 'SARL Bâtiment Plus', 'Site vitrine, solde', 1600, P, 'virement', true], [24, PASSAGE, 'Carnets illustrés', 54, V, 'carte', false]],
    [[14, 'Les Jardins Partagés', 'Flyers et affiches de la fête', 190, V, 'cheque', true], [20, 'Café des Arts', 'Menus imprimés', 240, V, 'virement', true],
      [27, 'Studio Lumen', 'Shooting produits', 650, P, 'virement', true]],
    [[4, 'Studio Lumen', 'Landing page', 900, P, 'virement', true], [18, 'Boulangerie Dupré', 'Étiquettes de produits', 130, V, 'paypal', true],
      [28, PASSAGE, 'Tirages d’art', 75, V, 'especes', false]],
    [[10, 'Mme Bernard', 'Album photo', 160, V, 'paypal', true], [23, 'Librairie des Quais', 'Site de la librairie', 2400, P, 'virement', true]],
    [[20, 'Café des Arts', 'Photos de la carte', 300, P, 'carte', true]],
    [[5, 'SARL Bâtiment Plus', 'Hébergement annuel', 240, P, 'virement', true], [16, 'Studio Lumen', 'Identité visuelle', 1400, P, 'virement', true],
      [26, PASSAGE, 'Stickers personnalisés', 48, V, 'carte', false]],
    [[9, 'Librairie des Quais', 'Marque-pages imprimés', 210, V, 'cheque', true], [21, 'Boulangerie Dupré', 'Refonte du logo', 650, P, 'virement', true]],
    [[7, 'Mme Bernard', 'Séance photo portrait', 180, P, 'carte', true], [18, 'Les Jardins Partagés', 'Calendrier illustré', 340, V, 'virement', true],
      [29, PASSAGE, 'Tirages photo A4', 42, V, 'especes', false]],
    [[3, 'Café des Arts', 'Menu de fêtes', 160, V, 'stripe', true], [12, 'Studio Lumen', 'Cartes de vœux', 280, V, 'paypal', true],
      [19, PASSAGE, 'Carnets illustrés', 96, V, 'carte', false]]
  ],
  courante: [
    [[8, 'Boulangerie Dupré', 'Carte de vœux illustrée', 220, P, 'virement', true], [15, 'SARL Bâtiment Plus', 'Page des réalisations', 480, P, 'virement', true],
      [24, PASSAGE, 'Tirages photo A4', 48, V, 'especes', false]],
    [[11, 'Studio Lumen', 'Retouche de portraits', 460, P, 'virement', true], [24, 'Librairie des Quais', 'Affiches du salon du livre', 185, V, 'cheque', true]],
    [[5, 'Café des Arts', 'Site de réservation, acompte', 1500, P, 'virement', true], [17, 'Mme Bernard', 'Séance photo de famille', 240, P, 'carte', true],
      [26, PASSAGE, 'Carnets illustrés', 72, V, 'carte', false]],
    [[8, 'Café des Arts', 'Site de réservation, solde', 1800, P, 'virement', true], [22, 'Les Jardins Partagés', 'Affiches de la fête', 210, V, 'cheque', true]],
    [[13, 'Studio Lumen', 'Shooting produits', 780, P, 'virement', true], [21, 'Boulangerie Dupré', 'Étiquettes de produits', 160, V, 'paypal', true],
      [28, PASSAGE, 'Tirages d’art', 90, V, 'especes', false]],
    [[10, 'Librairie des Quais', 'Catalogue de la rentrée', 1350, P, 'virement', true], [24, 'Mme Bernard', 'Tirages de l’album', 90, V, 'paypal', true]],
    [[9, 'SARL Bâtiment Plus', 'Photos de chantier', 650, P, 'virement', true], [25, PASSAGE, 'Stickers personnalisés', 60, V, 'carte', false]],
    [[19, 'Café des Arts', 'Photos de la nouvelle carte', 320, P, 'carte', true], [27, PASSAGE, 'Tirages photo A4', 40, V, 'especes', false]],
    [[4, 'SARL Bâtiment Plus', 'Hébergement annuel', 240, P, 'virement', true], [12, 'Studio Lumen', 'Site portfolio', 2200, P, 'virement', true],
      [18, 'Boulangerie Dupré', 'Création de logo', 320, P, 'virement', true], [25, 'Mme Bernard', 'Séance photo portrait', 180, P, 'carte', true]],
    [[2, 'Librairie des Quais', 'Marque-pages imprimés', 240, V, 'cheque', true], [6, PASSAGE, 'Tirages d’art', 85, V, 'especes', false],
      [14, 'Studio Lumen', 'Bannières pour les réseaux', 260, P, 'stripe', true]],
    [[6, 'Mme Bernard', 'Séance photo de famille', 240, P, 'carte', true], [19, 'Les Jardins Partagés', 'Calendrier illustré', 360, V, 'virement', true]],
    [[4, 'Café des Arts', 'Menu de fêtes', 180, V, 'stripe', true], [11, 'Studio Lumen', 'Cartes de vœux', 300, V, 'paypal', true]]
  ]
};

/** La maintenance du site du café : prélevée le 1er de chaque mois, depuis mars de l'année d'avant. */
const MAINTENANCE = { client: 'Café des Arts', libelle: 'Maintenance mensuelle', montant: 120, categorie: P, modeReglement: PRELEVEMENT.code };

/**
 * Achats de marchandises revendues (impressions, papeterie), mois par mois.
 * [jour, fournisseur, référence, montant, mode]
 */
const ACHATS = {
  precedente: [
    [], [[14, 'Imprimerie du Centre', 'IC-2201', 186.4, 'virement']], [], [[11, 'Papeterie Léon', '', 48.9, 'especes']], [],
    [[6, 'Stickers & Co', 'SC-087', 74.5, 'carte']], [], [], [[3, 'Imprimerie du Centre', 'IC-2287', 264, 'virement']], [],
    [[12, 'Stickers & Co', 'SC-118', 92.5, 'carte']], [[2, 'Métro Cash & Carry', 'A-0412', 74.3, 'carte']]
  ],
  courante: [
    [[20, 'Papeterie Léon', '', 56.2, 'especes']], [], [[9, 'Imprimerie du Centre', 'IC-2331', 212.6, 'virement']], [],
    [[16, 'Stickers & Co', 'SC-164', 108, 'carte']], [], [[2, 'Métro Cash & Carry', 'A-0471', 64.9, 'carte']], [],
    [[1, 'Imprimerie du Centre', 'IC-2398', 298.4, 'virement']], [[1, 'Papeterie Léon', '', 38.6, 'especes']],
    [[5, 'Imprimerie du Centre', 'IC-2420', 245, 'virement']], [[3, 'Stickers & Co', 'SC-201', 96, 'carte']]
  ]
};

/** Date ISO, le jour ramené au dernier du mois s'il le dépasse (un 31 en avril). */
const jourDansLeMois = (annee, mois, jour) => dateIso(annee, mois, Math.min(jour, joursDuMois(annee, mois)));

/**
 * Les lignes d'un tableau mois par mois, de janvier de l'année d'avant
 * jusqu'à aujourd'hui : le mois en cours ne garde que ses jours écoulés, ses
 * lignes plus tardives ramenées à aujourd'hui.
 */
function parcourir(tableau, maintenant, ligne) {
  const annee = maintenant.getFullYear();
  const moisCourant = maintenant.getMonth() + 1;
  const jourCourant = maintenant.getDate();
  const lignes = [];
  for (const [cle, an] of [['precedente', annee - 1], ['courante', annee]]) {
    tableau[cle].forEach((entrees, i) => {
      const mois = i + 1;
      if (an === annee && mois > moisCourant) return;
      for (const [jour, ...reste] of entrees) {
        const j = an === annee && mois === moisCourant ? Math.min(jour, jourCourant) : jour;
        lignes.push(ligne(jourDansLeMois(an, mois, j), ...reste));
      }
    });
  }
  return lignes;
}

/**
 * Numérote les factures année par année (« F2026-007 »), dans l'ordre des
 * dates, en sautant un numéro parmi les plus récents : l'alerte de
 * numérotation a ainsi quelque chose à montrer.
 */
function numeroter(recettes, annee) {
  const facturees = recettes.filter((r) => r.facturee).sort((a, b) => a.dateEncaissement.localeCompare(b.dateEncaissement));
  const parAnnee = (an) => facturees.filter((r) => r.dateEncaissement.startsWith(`${an}-`));
  const courantes = parAnnee(annee);
  const anneeTrou = courantes.length >= 4 ? annee : annee - 1;
  const trou = parAnnee(anneeTrou).length - 2;
  for (const an of [annee - 1, annee]) {
    let n = 0;
    parAnnee(an).forEach((r, i) => {
      n += 1;
      if (an === anneeTrou && i === trou) n += 1;
      r.numeroFacture = `F${an}-${String(n).padStart(3, '0')}`;
    });
  }
}

/**
 * La dernière période déclarée : le trimestre écoulé l'est déjà une fois son
 * échéance passée ; avant, il reste à déclarer et la carte du tableau de bord
 * le propose.
 */
function derniereDeclaree(maintenant) {
  const aujourdHui = dateIso(maintenant.getFullYear(), maintenant.getMonth() + 1, maintenant.getDate());
  const courant = { annee: maintenant.getFullYear(), type: 'trimestre', valeur: trimestreDe(maintenant.getMonth() + 1) };
  const ecoule = periodePrecedente(courant);
  const declare = aujourdHui > echeanceDeclaration(ecoule.annee, ecoule.type, ecoule.valeur) ? ecoule : periodePrecedente(ecoule);
  return idPeriode(declare.annee, declare.type, declare.valeur);
}

/**
 * Construit le jeu de démonstration (activité mixte, pour tout montrer).
 * `aJoindre` désigne les lignes qui reçoivent un PDF au chargement (voir
 * `piecesDemo`) : leurs positions dans `recettes` et `achats`.
 */
export function construireJeuDemo(maintenant = new Date()) {
  const annee = maintenant.getFullYear();
  const moisCourant = maintenant.getMonth() + 1;

  const recettes = parcourir(ENCAISSEMENTS, maintenant, (date, client, libelle, montant, categorie, modeReglement, facturee) => ({
    dateEncaissement: date, client, libelle, numeroFacture: '', montant, modeReglement, categorie, facturee
  }));
  // La maintenance, chaque mois jusqu'au mois dernier : celle de ce mois-ci
  // n'est pas encore saisie, le tableau de bord propose de l'ajouter.
  for (let rang = (annee - 1) * 12 + 2; rang < annee * 12 + moisCourant - 1; rang += 1) {
    const an = Math.floor(rang / 12);
    recettes.push({ dateEncaissement: dateIso(an, (rang % 12) + 1, 1), numeroFacture: '', ...MAINTENANCE, facturee: true });
  }
  numeroter(recettes, annee);
  recettes.sort((a, b) => b.dateEncaissement.localeCompare(a.dateEncaissement));
  // Les trois factures les plus récentes attendent encore leur PDF.
  const recettesAJoindre = recettes.map((r, i) => (r.facturee ? i : -1)).filter((i) => i >= 0).slice(3);

  const achats = parcourir(ACHATS, maintenant, (date, fournisseur, referenceFacture, montant, modeReglement) => ({
    dateReglement: date, fournisseur, referenceFacture, montant, modeReglement
  })).sort((a, b) => b.dateReglement.localeCompare(a.dateReglement));
  // Justificatif joint à chaque achat qui a une référence, sauf au plus récent.
  const achatsAJoindre = achats.map((a, i) => (a.referenceFacture ? i : -1)).filter((i) => i >= 0).slice(1);

  const clients = [...new Set(recettes.map((r) => r.client))].sort().map((nom) => ({ nom, siret: '' }));
  return {
    parametres: {
      ...ENTREPRISE,
      typeActivite: 'mixte',
      periodiciteUrssaf: 'trimestre',
      dernierePeriodeDeclaree: derniereDeclaree(maintenant),
      modesPersonnalises: [PRELEVEMENT],
      jeuDemo: true
    },
    clients,
    recettes: recettes.map(({ facturee, ...r }) => r),
    achats,
    aJoindre: { recettes: recettesAJoindre, achats: achatsAJoindre }
  };
}

/** Une facture fictive en PDF (A4), en mémoire. */
function facturePdf({ emetteur, adresse, destinataire, numero, date, libelle, montant, mode, mention }) {
  return new Promise((resoudre, rejeter) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `Facture ${numero}`, Author: emetteur } });
    const morceaux = [];
    doc.on('data', (m) => morceaux.push(m));
    doc.on('end', () => resoudre(Buffer.concat(morceaux)));
    doc.on('error', rejeter);
    const t = texteSur;
    const largeur = doc.page.width - 112;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(COULEURS.texte).text(t(emetteur), 56, 56);
    if (adresse) doc.font('Helvetica').fontSize(10).fillColor(COULEURS.secondaire).text(t(adresse));
    doc.font('Helvetica-Bold').fontSize(20).fillColor(COULEURS.texte).text('FACTURE', 56, 56, { width: largeur, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor(COULEURS.secondaire)
      .text(t(`N° ${numero}`), { width: largeur, align: 'right' })
      .text(t(`Date : ${date}`), { width: largeur, align: 'right' });
    doc.moveDown(3).fillColor(COULEURS.texte).fontSize(11).text(t(`Facturé à : ${destinataire}`), 56);
    const y = doc.y + 24;
    doc.rect(56, y, largeur, 24).fill(COULEURS.fondEntete);
    doc.fillColor(COULEURS.texte).font('Helvetica-Bold').fontSize(10)
      .text('Désignation', 66, y + 7).text('Montant', 56, y + 7, { width: largeur - 10, align: 'right' });
    doc.font('Helvetica').text(t(libelle), 66, y + 36).text(t(montant), 56, y + 36, { width: largeur - 10, align: 'right' });
    doc.moveTo(56, y + 60).lineTo(56 + largeur, y + 60).strokeColor(COULEURS.bordure).stroke();
    doc.font('Helvetica-Bold').text('Total', 66, y + 72).text(t(montant), 56, y + 72, { width: largeur - 10, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(COULEURS.secondaire)
      .text(t(mention), 66, y + 100)
      .text(t(mode), 66, y + 114);
    doc.fontSize(8).text('Document fictif, créé pour le jeu de démonstration du Livre des recettes.', 56, doc.page.height - 80, { width: largeur, align: 'center' });
    doc.end();
  });
}

/**
 * Les PDF du jeu : la facture des recettes et le justificatif des achats
 * désignés par `aJoindre`. Chaque PDF est rangé par `enregistrer` (voir
 * `pieces.js`), et sa fiche posée sur la ligne.
 */
export async function piecesDemo(jeu, enregistrer) {
  const { devise = 'EUR', formatDate = 'JJ/MM/AAAA' } = jeu.parametres;
  const mode = (code) => libelleMode(code, jeu.parametres.modesPersonnalises);
  for (const r of jeu.aJoindre.recettes.map((i) => jeu.recettes[i])) {
    const date = formaterDate(r.dateEncaissement, formatDate);
    const octets = await facturePdf({
      emetteur: ENTREPRISE.nomEntreprise, adresse: ENTREPRISE.adresse, destinataire: r.client, numero: r.numeroFacture,
      date, libelle: r.libelle, montant: formaterMontant(r.montant, devise),
      mention: 'TVA non applicable, article 293 B du CGI.', mode: `Réglée le ${date} : ${mode(r.modeReglement)}.`
    });
    r.pieceJointe = enregistrer(octets, `Facture ${r.numeroFacture}.pdf`);
  }
  for (const a of jeu.aJoindre.achats.map((i) => jeu.achats[i])) {
    const date = formaterDate(a.dateReglement, formatDate);
    const octets = await facturePdf({
      emetteur: a.fournisseur, adresse: '', destinataire: ENTREPRISE.nomEntreprise, numero: a.referenceFacture,
      date, libelle: 'Fournitures et impressions', montant: formaterMontant(a.montant, devise),
      mention: 'Montant TTC.', mode: `Réglée le ${date} : ${mode(a.modeReglement)}.`
    });
    a.pieceJointe = enregistrer(octets, `${a.fournisseur} ${a.referenceFacture}.pdf`);
  }
  return jeu;
}
