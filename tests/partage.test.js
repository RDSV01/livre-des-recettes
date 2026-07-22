/**
 * Tests des modules partagés : dates, montants, texte, doublons, seuils.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estDateIso, formaterDate, analyserDateSouple, trimestreDe, dernierePeriodeEchue, dateEnFrancaisLong
} from '../src/partage/dates.js';
import { analyserMontant, sommeMontants, enCentimes } from '../src/partage/montants.js';
import { normaliserTexte } from '../src/partage/texte.js';
import { estDoublon, estDoublonAchat, chercherSimilaire } from '../src/partage/doublons.js';
import {
  bilanSeuils, seuilsValentPour, regimeFiscal, activiteAvecRevente,
  seuilsDe, baremePour, periodeSeuils
} from '../src/partage/seuils.js';
import { BAREMES } from '../src/partage/bareme-seuils.js';
import { filtrerRecettes, filtrerAchats, valeursFrequentes } from '../src/partage/filtres.js';

test('estDateIso accepte les dates réelles et refuse le reste', () => {
  assert.equal(estDateIso('2026-07-15'), true);
  assert.equal(estDateIso('2026-02-29'), false); // 2026 n'est pas bissextile
  assert.equal(estDateIso('2024-02-29'), true);  // 2024 l'est
  assert.equal(estDateIso('2026-13-01'), false);
  assert.equal(estDateIso('15/07/2026'), false);
  assert.equal(estDateIso(''), false);
});

test('formaterDate suit le format des paramètres', () => {
  assert.equal(formaterDate('2026-07-15', 'JJ/MM/AAAA'), '15/07/2026');
  assert.equal(formaterDate('2026-07-15', 'JJ-MM-AAAA'), '15-07-2026');
  assert.equal(formaterDate('2026-07-15', 'AAAA-MM-JJ'), '2026-07-15');
});

test('dateEnFrancaisLong écrit la date en toutes lettres, sans zéro ni décalage', () => {
  assert.equal(dateEnFrancaisLong('2026-05-28'), '28 mai 2026');
  assert.equal(dateEnFrancaisLong('2026-01-01'), '1 janvier 2026');
  assert.equal(dateEnFrancaisLong('2026-08-09'), '9 août 2026');
  assert.equal(dateEnFrancaisLong(''), '', 'rien pour une date incomplète');
  assert.equal(dateEnFrancaisLong('2026-02-31'), '', 'rien pour une date impossible');
});

test('analyserDateSouple comprend les formats usuels des tableurs', () => {
  assert.equal(analyserDateSouple('2026-07-15'), '2026-07-15');
  assert.equal(analyserDateSouple('15/07/2026'), '2026-07-15');
  assert.equal(analyserDateSouple('5/7/2026'), '2026-07-05');
  assert.equal(analyserDateSouple('15-07-26'), '2026-07-15');
  assert.equal(analyserDateSouple('15.07.2026'), '2026-07-15');
  assert.equal(analyserDateSouple('32/07/2026'), null);
  assert.equal(analyserDateSouple('n’importe quoi'), null);
});

test('trimestreDe regroupe les mois par trimestre civil', () => {
  assert.equal(trimestreDe(1), 1);
  assert.equal(trimestreDe(3), 1);
  assert.equal(trimestreDe(4), 2);
  assert.equal(trimestreDe(12), 4);
});

test('analyserMontant comprend les écritures françaises et anglaises', () => {
  assert.equal(analyserMontant(12.5), 12.5);
  assert.equal(analyserMontant('1234.56'), 1234.56);
  assert.equal(analyserMontant('1234,56'), 1234.56);
  assert.equal(analyserMontant('1 234,56 €'), 1234.56);
  assert.equal(analyserMontant('1.234,56'), 1234.56);
  assert.equal(analyserMontant('1,234.56'), 1234.56);
  assert.equal(analyserMontant('1.234'), 1234);   // 3 décimales : séparateur de milliers
  assert.equal(analyserMontant('12,5'), 12.5);
  assert.equal(analyserMontant('abc'), null);
  assert.equal(analyserMontant(''), null);
  assert.equal(analyserMontant(null), null);

  // Un montant copié depuis l'application porte les espaces insécables et
  // fines produits par `Intl.NumberFormat` : ils doivent être retirés comme
  // les autres. Écrits en séquences d'échappement, invisibles autrement.
  const insecable = String.fromCharCode(0x00A0);
  const fine = String.fromCharCode(0x202F);
  assert.equal(analyserMontant(`1${insecable}234,56${fine}€`), 1234.56);
  assert.equal(analyserMontant(`9${fine}999${insecable}999,99`), 9999999.99);
  // Et les lettres ne doivent surtout pas disparaître au passage.
  assert.equal(analyserMontant('sans chiffre'), null);
});

test('sommeMontants évite les erreurs des flottants', () => {
  // En flottant naïf : 0.1 + 0.2 = 0.30000000000000004
  assert.equal(sommeMontants([0.1, 0.2]), 0.3);
  assert.equal(sommeMontants([19.99, 0.01, 100]), 120);
  assert.equal(enCentimes(19.99), 1999);
});

test('normaliserTexte ignore casse, accents et espaces superflus', () => {
  assert.equal(normaliserTexte('  Boulangerie   Dupré '), 'boulangerie dupre');
  assert.equal(normaliserTexte('CRÈME brûlée'), 'creme brulee');
  assert.equal(normaliserTexte(null), '');
});

test('dernierePeriodeEchue renvoie la dernière période complète', () => {
  const juillet = new Date(2026, 6, 16);
  assert.deepEqual(dernierePeriodeEchue('mois', juillet), { id: '2026-06', libelle: 'juin 2026' });
  assert.deepEqual(dernierePeriodeEchue('trimestre', juillet), { id: '2026-T2', libelle: '2e trimestre 2026' });
  // Janvier : la période précédente est sur l'année d'avant.
  const janvier = new Date(2026, 0, 5);
  assert.deepEqual(dernierePeriodeEchue('mois', janvier), { id: '2025-12', libelle: 'décembre 2025' });
  assert.deepEqual(dernierePeriodeEchue('trimestre', janvier), { id: '2025-T4', libelle: '4e trimestre 2025' });
  assert.equal(dernierePeriodeEchue('', juillet), null);
});

// ---- Filtrage des recettes (côté navigateur) ---------------------------------

const RECETTES_FILTRE = [
  { dateEncaissement: '2026-07-10', client: 'Époux Lefèvre', libelle: 'Cours de piano', numeroFacture: 'F-1', montant: 120.5, modeReglement: 'cheque', categorie: 'prestations' },
  { dateEncaissement: '2026-03-01', client: 'SARL Bâtiment', libelle: 'Site', numeroFacture: 'F-2', montant: 800, modeReglement: 'virement', categorie: 'ventes' },
  { dateEncaissement: '2025-03-01', client: 'Autre', libelle: '', numeroFacture: '', montant: 50, modeReglement: 'especes' }
];

test('filtrerRecettes croise année, mois, mode, catégorie et recherche', () => {
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { annee: '2026' }).length, 2);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { annee: 2026, mois: 7 }).length, 1);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { mode: 'virement' }).length, 1);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { categorie: 'ventes' }).length, 1);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { categorie: 'aucune' })[0].client, 'Autre');
  // Recherche insensible aux accents, et par montant exact.
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { q: 'epoux' }).length, 1);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { q: '120,50' }).length, 1);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, { q: 'introuvable' }).length, 0);
  assert.equal(filtrerRecettes(RECETTES_FILTRE, {}).length, 3);
});

test('valeursFrequentes dédoublonne et trie par fréquence puis alphabet', () => {
  const libelles = valeursFrequentes([
    { libelle: 'cours de piano' }, { libelle: 'Cours de piano' },
    { libelle: 'Accordage' }, { libelle: '' }
  ], 'libelle');
  assert.deepEqual(libelles, ['cours de piano', 'Accordage']);
});

const ACHATS_FILTRE = [
  { dateReglement: '2026-07-15', fournisseur: 'Métro', referenceFacture: 'A-12', montant: 120.50, modeReglement: 'carte' },
  { dateReglement: '2026-02-01', fournisseur: 'Papeterie Léon', referenceFacture: '', montant: 30, modeReglement: 'virement' },
  { dateReglement: '2025-12-10', fournisseur: 'Métro', referenceFacture: 'A-04', montant: 80, modeReglement: 'carte' }
];

test('filtrerAchats croise période, mode de paiement et recherche libre', () => {
  assert.equal(filtrerAchats(ACHATS_FILTRE, { annee: 2026 }).length, 2);
  assert.equal(filtrerAchats(ACHATS_FILTRE, { annee: 2026, mois: 7 }).length, 1);
  assert.equal(filtrerAchats(ACHATS_FILTRE, { mode: 'carte' }).length, 2);
  // Recherche sur le fournisseur (sans accent), la référence, puis le montant exact.
  assert.equal(filtrerAchats(ACHATS_FILTRE, { q: 'metro' }).length, 2);
  assert.equal(filtrerAchats(ACHATS_FILTRE, { q: 'A-04' }).length, 1);
  assert.equal(filtrerAchats(ACHATS_FILTRE, { q: '120,50' }).length, 1);
  assert.equal(filtrerAchats(ACHATS_FILTRE, {}).length, 3);
});

// ---- Doublons et similarité ------------------------------------------------

const EXISTANTES = [
  { dateEncaissement: '2026-07-15', client: 'Boulangerie Dupré', montant: 450, numeroFacture: 'FAC-1' }
];

test('même date + même client + même montant = doublon', () => {
  assert.equal(estDoublon(
    { dateEncaissement: '2026-07-15', client: 'boulangerie dupre', montant: 450, numeroFacture: '' },
    EXISTANTES
  ), true);
});

test('deux factures différentes de même montant ne sont pas des doublons', () => {
  assert.equal(estDoublon(
    { dateEncaissement: '2026-07-15', client: 'Boulangerie Dupré', montant: 450, numeroFacture: 'FAC-2' },
    EXISTANTES
  ), false);
});

test('un montant différent n’est pas un doublon', () => {
  assert.equal(estDoublon(
    { dateEncaissement: '2026-07-15', client: 'Boulangerie Dupré', montant: 450.01, numeroFacture: '' },
    EXISTANTES
  ), false);
});

test('chercherSimilaire trouve aussi une facture identique', () => {
  const similaire = chercherSimilaire(
    { dateEncaissement: '2026-08-01', client: 'Autre client', montant: 10, numeroFacture: 'fac-1' },
    EXISTANTES
  );
  assert.equal(similaire, EXISTANTES[0]);
  assert.equal(chercherSimilaire(
    { dateEncaissement: '2026-08-01', client: 'Autre client', montant: 10, numeroFacture: 'FAC-9' },
    EXISTANTES
  ), null);
});

test('estDoublonAchat compare la date de règlement, le fournisseur et la référence', () => {
  const existants = [
    { dateReglement: '2026-05-10', fournisseur: 'Métro', referenceFacture: 'A-1', montant: 120 }
  ];
  // Mêmes date, fournisseur, montant (référence absente d'un côté) : doublon.
  assert.equal(estDoublonAchat(
    { dateReglement: '2026-05-10', fournisseur: 'métro', referenceFacture: '', montant: 120 }, existants
  ), true);
  // Deux références différentes : pièces distinctes, pas un doublon.
  assert.equal(estDoublonAchat(
    { dateReglement: '2026-05-10', fournisseur: 'Métro', referenceFacture: 'A-2', montant: 120 }, existants
  ), false);
  // Fournisseur différent : pas un doublon.
  assert.equal(estDoublonAchat(
    { dateReglement: '2026-05-10', fournisseur: 'Autre', referenceFacture: '', montant: 120 }, existants
  ), false);
});

// ---- Seuils micro et franchise de TVA ---------------------------------------

// Une année réellement couverte par le barème du projet : les tests suivent
// donc les montants en vigueur, sans les recopier.
const ANNEE = BAREMES[0].aPartirDe;
const SERVICES = seuilsDe('prestations', ANNEE);
const MARCHANDISES = seuilsDe('ventes', ANNEE);

test('bilanSeuils suit le type d’activité choisi', () => {
  // La moitié du plafond : le test reste vrai quand les seuils sont mis à jour.
  const moitie = SERVICES.plafondMicro / 2;
  const bilan = bilanSeuils(moitie, 'prestations', null, ANNEE);
  assert.equal(bilan.plafondMicro.seuil, SERVICES.plafondMicro);
  assert.equal(bilan.plafondMicro.pourcentage, 50);
  assert.equal(bilan.plafondMicro.restant, moitie);
  assert.equal(bilan.franchiseTva.seuil, SERVICES.franchiseTva);
  assert.equal(bilan.franchiseTva.seuilMajore, SERVICES.franchiseTvaMajore);
  assert.equal(bilan.prestations, null);
});

test('bilanSeuils plafonne le restant à zéro en cas de dépassement', () => {
  const bilan = bilanSeuils(SERVICES.plafondMicro + 1000, 'prestations', null, ANNEE);
  assert.equal(bilan.plafondMicro.restant, 0);
  assert.ok(bilan.plafondMicro.pourcentage > 100);
});

test('bilanSeuils vaut null sans type d’activité', () => {
  assert.equal(bilanSeuils(1000, '', null, ANNEE), null);
  assert.equal(bilanSeuils(1000, 'inconnu', null, ANNEE), null);
});

test('bilanSeuils suit la part prestations d’une activité mixte', () => {
  const bilan = bilanSeuils(100_000, 'mixte', SERVICES.franchiseTva, ANNEE);
  assert.equal(bilan.plafondMicro.seuil, MARCHANDISES.plafondMicro);
  assert.equal(bilan.prestations.chiffreAffaires, SERVICES.franchiseTva);
  assert.equal(bilan.prestations.plafondMicro.seuil, SERVICES.plafondMicro);
  assert.equal(bilan.prestations.franchiseTva.pourcentage, 100);
  // Sans CA prestations fourni, pas de bilan de la part prestations.
  assert.equal(bilanSeuils(100_000, 'mixte', null, ANNEE).prestations, null);
});

test('une activité mixte n’impose aucun plafond propre aux ventes', () => {
  // Deux conditions cumulatives, et deux seulement : le total et la part
  // prestations. La part ventes n'est bornée que par le total.
  const bilan = bilanSeuils(MARCHANDISES.plafondMicro, 'mixte', 1000, ANNEE);
  assert.deepEqual(Object.keys(bilan.prestations), ['chiffreAffaires', 'plafondMicro', 'franchiseTva']);
  assert.equal(bilan.ventes, undefined, 'aucun seuil des ventes ne doit être calculé');
});

test('la franchise de TVA d’une activité mixte se mesure sur le CA total', () => {
  // Le cas qui prête à confusion : chaque part reste sous son propre seuil de
  // TVA, mais leur somme dépasse le seuil global et fait perdre la franchise.
  // C'est le total qui fait foi.
  const partPrestations = SERVICES.franchiseTva - 1000;
  const total = MARCHANDISES.franchiseTva + 1000;
  const bilan = bilanSeuils(total, 'mixte', partPrestations, ANNEE);

  assert.ok(bilan.franchiseTva.pourcentage > 100, 'le total dépasse le seuil de TVA');
  assert.equal(bilan.franchiseTva.restant, 0);
  assert.ok(bilan.prestations.franchiseTva.pourcentage < 100, 'la part prestations, elle, tient');
  // Et pourtant le régime micro reste acquis : les deux suivis sont indépendants.
  assert.ok(bilan.plafondMicro.pourcentage < 100, 'le plafond micro n’est pas atteint');
  assert.ok(bilan.prestations.plafondMicro.pourcentage < 100);
});

test('une activité libérale relève du BNC, sans registre des achats', () => {
  const bilan = bilanSeuils(SERVICES.plafondMicro / 2, 'liberal', null, ANNEE);
  assert.equal(bilan.plafondMicro.pourcentage, 50);
  assert.equal(bilan.franchiseTva.seuil, SERVICES.franchiseTva, 'mêmes seuils que les prestations');
  assert.equal(bilan.prestations, null, 'aucune ventilation hors activité mixte');

  assert.equal(regimeFiscal('liberal', ANNEE).regime, 'BNC');
  assert.equal(regimeFiscal('prestations', ANNEE).regime, 'BIC', 'les prestations commerciales restent en BIC');
  assert.equal(regimeFiscal('mixte', ANNEE).regime, null, 'une activité mixte n’a pas de catégorie unique');
  assert.equal(regimeFiscal(''), null);

  // L'abattement se lit dans le barème et distingue BIC et BNC.
  assert.equal(regimeFiscal('liberal', ANNEE).abattement, BAREMES[0].abattements.liberal);
  assert.equal(regimeFiscal('mixte', ANNEE).abattement, null);

  // Le registre des achats n'est exigible que pour l'achat / revente.
  assert.equal(activiteAvecRevente('liberal'), false);
  assert.equal(activiteAvecRevente('prestations'), false);
  assert.equal(activiteAvecRevente('ventes'), true);
  assert.equal(activiteAvecRevente('mixte'), true);
  assert.equal(activiteAvecRevente(''), true, 'dans le doute, on propose le registre');
});

// ---- Barème daté --------------------------------------------------------------

test('chaque année retenue tombe sur le barème qui la couvre', () => {
  const bareme = BAREMES[0];
  assert.equal(baremePour(bareme.aPartirDe), bareme);
  assert.equal(seuilsValentPour(bareme.aPartirDe), true);

  // Une année antérieure au plus ancien barème n'est mesurée par rien : mieux
  // vaut ne rien afficher que des jauges fausses.
  const plusAncienne = Math.min(...BAREMES.map((b) => b.aPartirDe));
  assert.equal(baremePour(plusAncienne - 1), null);
  assert.equal(seuilsValentPour(plusAncienne - 1), false);
  assert.equal(bilanSeuils(1000, 'prestations', null, plusAncienne - 1), null);
  assert.equal(seuilsDe('prestations', plusAncienne - 1), null);
});

test('un barème borné ne déborde pas sur les années suivantes', () => {
  const borne = BAREMES.find((b) => b.jusqua !== null);
  if (!borne) return; // tous les barèmes sont ouverts : rien à vérifier
  assert.equal(baremePour(borne.jusqua), borne);
  const suivant = baremePour(borne.jusqua + 1);
  assert.notEqual(suivant, borne, 'l’année suivante relève d’un autre barème, ou d’aucun');
});

test('periodeSeuils nomme la période du barème appliqué', () => {
  for (const bareme of BAREMES) {
    const attendu = bareme.jusqua === null ? `à partir de ${bareme.aPartirDe}`
      : bareme.jusqua === bareme.aPartirDe ? String(bareme.aPartirDe)
        : `${bareme.aPartirDe}-${bareme.jusqua}`;
    assert.equal(periodeSeuils(bareme.aPartirDe), attendu);
    // Un barème d'une seule année ne doit pas s'annoncer « 2025-2025 ».
    assert.doesNotMatch(periodeSeuils(bareme.aPartirDe), /^(\d{4})-\1$/);
  }
  assert.equal(periodeSeuils(Math.min(...BAREMES.map((b) => b.aPartirDe)) - 1), null);
});

test('les barèmes se suivent sans trou ni chevauchement', () => {
  // Deux barèmes qui se recouvrent rendraient le choix dépendant de l'ordre
  // de la liste ; un trou laisserait une année sans seuils alors qu'elle en a.
  const tries = [...BAREMES].sort((a, b) => a.aPartirDe - b.aPartirDe);
  for (let i = 1; i < tries.length; i += 1) {
    const precedent = tries[i - 1];
    const courant = tries[i];
    assert.notEqual(precedent.jusqua, null, `le barème ${precedent.aPartirDe} doit être borné`);
    assert.equal(
      courant.aPartirDe, precedent.jusqua + 1,
      `${precedent.aPartirDe}-${precedent.jusqua} et ${courant.aPartirDe} doivent se toucher`
    );
  }
});

test('le barème ne contient que des montants cohérents', () => {
  for (const bareme of BAREMES) {
    assert.ok(Number.isInteger(bareme.aPartirDe), 'une année d’entrée en vigueur');
    assert.ok(bareme.jusqua === null || bareme.jusqua >= bareme.aPartirDe, 'période non inversée');
    for (const jeu of ['marchandises', 'services']) {
      const s = bareme[jeu];
      assert.ok(s.plafondMicro > 0, `${jeu} : plafond micro renseigné`);
      assert.ok(s.franchiseTvaMajore > s.franchiseTva,
        `${jeu} : le seuil majoré de TVA doit dépasser le seuil de base`);
    }
    // Les marchandises sont toujours plus largement plafonnées que les services.
    assert.ok(bareme.marchandises.plafondMicro > bareme.services.plafondMicro);
    for (const taux of Object.values(bareme.abattements)) {
      assert.ok(taux > 0 && taux < 100, 'un abattement est un pourcentage');
    }
  }
});
