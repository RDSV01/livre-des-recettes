/**
 * Rapport annuel de gestion en PDF (A4 portrait), généré avec PDFKit.
 *
 * Document de pilotage destiné au dirigeant : synthèse chiffrée, saisonnalité,
 * moyens de paiement, clients qui pèsent, puis le détail des encaissements.
 * Il ne remplace aucun registre légal et le rappelle en pied de page.
 *
 * Comme pour les registres, tout texte écrit passe par `texteSur` : les
 * polices standard du PDF ignorent les espaces insécables des montants.
 */

import PDFDocument from 'pdfkit';
import { formaterDate } from '../partage/dates.js';
import { formaterMontant } from '../partage/montants.js';
import { libelleCategorieCourt } from '../partage/constantes.js';
import { libelleActivite } from '../partage/seuils.js';
import { texteSur, MARGE, COULEURS } from './pdf-commun.js';

const LARGEUR = 515;
const TAILLE_TEXTE = 9;
const REMPLISSAGE = 5;
const HAUTEUR_GRAPHIQUE = 120;

/** Colonnes du détail des encaissements, selon que les recettes sont classées. */
function colonnesDetail(avecCategorie) {
  return avecCategorie
    ? [
      { titre: 'Date', largeur: 58, valeur: (r, p) => formaterDate(r.dateEncaissement, p.formatDate) },
      { titre: 'Client', largeur: 95, valeur: (r) => r.client },
      { titre: 'Libellé', largeur: 100, valeur: (r) => r.libelle },
      { titre: 'Catégorie', largeur: 55, valeur: (r) => libelleCategorieCourt(r.categorie) },
      { titre: 'N° facture', largeur: 60, valeur: (r) => r.numeroFacture },
      { titre: 'Mode', largeur: 65, valeur: (r, p, modes) => modes(r.modeReglement) },
      { titre: 'Montant', largeur: 82, montant: true }
    ]
    : [
      { titre: 'Date', largeur: 58, valeur: (r, p) => formaterDate(r.dateEncaissement, p.formatDate) },
      { titre: 'Client', largeur: 105, valeur: (r) => r.client },
      { titre: 'Libellé', largeur: 122, valeur: (r) => r.libelle },
      { titre: 'N° facture', largeur: 66, valeur: (r) => r.numeroFacture },
      { titre: 'Mode', largeur: 72, valeur: (r, p, modes) => modes(r.modeReglement) },
      { titre: 'Montant', largeur: 92, montant: true }
    ];
}

/**
 * Écrit le rapport annuel dans le flux donné (réponse HTTP ou fichier).
 * Le flux est clôturé par PDFKit à la fin de la génération.
 *
 * @param {object} rapport sortie de `rapportAnnuel()`.
 * @param {object} parametres paramètres de l'entreprise (identité, devise).
 * @param {NodeJS.WritableStream} flux destination.
 */
export function genererRapportPdf(rapport, parametres, flux) {
  const titre = `Rapport annuel ${rapport.annee}`;
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGE,
    bufferPages: true,
    info: { Title: titre, Author: parametres.nomEntreprise || 'Livre des recettes' }
  });
  doc.pipe(flux);

  const euros = (montant) => texteSur(formaterMontant(montant, parametres.devise));
  const basDePage = () => doc.page.height - MARGE - 18;

  /** Passe à la page suivante si la hauteur demandée ne tient plus. */
  function assurerPlace(hauteur) {
    if (doc.y + hauteur > basDePage()) {
      doc.addPage();
      doc.y = MARGE;
      return true;
    }
    return false;
  }

  /** Titre de section, précédé d'un filet. */
  function section(libelle) {
    assurerPlace(48);
    doc.moveDown(0.9);
    const y = doc.y;
    doc.moveTo(MARGE, y).lineTo(MARGE + LARGEUR, y)
      .lineWidth(0.5).strokeColor(COULEURS.bordure).stroke();
    doc.font('Helvetica-Bold').fontSize(12).fillColor(COULEURS.texte)
      .text(texteSur(libelle), MARGE, y + 8);
    doc.moveDown(0.5);
  }

  /** Paragraphe explicatif, en gris sous un titre de section. */
  function commentaire(texte) {
    doc.font('Helvetica').fontSize(8.5).fillColor(COULEURS.secondaire)
      .text(texteSur(texte), MARGE, doc.y, { width: LARGEUR });
    doc.moveDown(0.4);
  }

  // ---- En-tête ---------------------------------------------------------------
  function enTete() {
    if (parametres.nomEntreprise) {
      doc.font('Helvetica-Bold').fontSize(16).fillColor(COULEURS.texte)
        .text(texteSur(parametres.nomEntreprise), MARGE, MARGE, { width: LARGEUR });
    }
    const identite = [
      parametres.siren && `SIREN ${parametres.siren}`,
      parametres.siret && `SIRET ${parametres.siret}`,
      parametres.adresse,
      parametres.activite
    ].filter(Boolean).join('  ·  ');
    if (identite) {
      doc.font('Helvetica').fontSize(9).fillColor(COULEURS.secondaire)
        .text(texteSur(identite), { width: LARGEUR });
    }

    doc.moveDown(0.9);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(COULEURS.texte).text(texteSur(titre));

    // Le libellé de l'activité porte déjà sa catégorie de bénéfices
    // (« Activité libérale (BNC) ») : la répéter n'apprendrait rien.
    const sousTitre = [
      `Édité le ${formaterDate(new Date().toISOString().slice(0, 10), parametres.formatDate)}`,
      libelleActivite(parametres)
    ].filter(Boolean).join('  ·  ');
    doc.font('Helvetica').fontSize(9).fillColor(COULEURS.secondaire).text(texteSur(sousTitre));
    doc.moveDown(0.3);
    commentaire(
      'Document de gestion interne, établi pour le dirigeant. Il ne se substitue ' +
      'ni au livre des recettes ni au registre des achats, seuls exigibles en cas de contrôle.'
    );
  }

  // ---- Tuiles de synthèse ------------------------------------------------------
  /** Rangée de tuiles chiffrées, trois par ligne. */
  function tuiles(entrees) {
    const PAR_LIGNE = 3;
    const ECART = 10;
    const largeur = (LARGEUR - ECART * (PAR_LIGNE - 1)) / PAR_LIGNE;
    const hauteur = 54;

    for (let debut = 0; debut < entrees.length; debut += PAR_LIGNE) {
      const rangee = entrees.slice(debut, debut + PAR_LIGNE);
      assurerPlace(hauteur + ECART);
      const y = doc.y;
      rangee.forEach((entree, i) => {
        const x = MARGE + i * (largeur + ECART);
        doc.roundedRect(x, y, largeur, hauteur, 6)
          .fillAndStroke(COULEURS.fondTotal, COULEURS.bordure);
        doc.font('Helvetica').fontSize(8).fillColor(COULEURS.secondaire)
          .text(texteSur(entree.etiquette.toUpperCase()), x + 10, y + 9, {
            width: largeur - 20, lineBreak: false
          });
        doc.font('Helvetica-Bold').fontSize(14)
          .fillColor(entree.accent ? COULEURS.accent : COULEURS.texte)
          .text(texteSur(entree.valeur), x + 10, y + 24, { width: largeur - 20, lineBreak: false });
      });
      doc.y = y + hauteur + ECART;
    }
  }

  // ---- Graphique mensuel -------------------------------------------------------
  /** Histogramme des douze mois, mis à l'échelle du meilleur mois. */
  function graphiqueMensuel(mois) {
    const maximum = Math.max(...mois.map((m) => m.montant));
    if (maximum <= 0) {
      commentaire('Aucun encaissement sur l’année : le graphique n’a rien à représenter.');
      return;
    }

    assurerPlace(HAUTEUR_GRAPHIQUE + 34);
    const base = doc.y + HAUTEUR_GRAPHIQUE;
    const largeurColonne = LARGEUR / 12;
    const largeurBarre = largeurColonne - 10;

    mois.forEach((m, i) => {
      const x = MARGE + i * largeurColonne;
      const hauteur = m.montant <= 0 ? 0 : Math.max(2, (m.montant / maximum) * HAUTEUR_GRAPHIQUE);
      if (hauteur > 0) {
        doc.roundedRect(x + 5, base - hauteur, largeurBarre, hauteur, 2).fill(COULEURS.accent);
      }
      // Initiale du mois sous chaque barre : douze libellés entiers ne
      // tiendraient pas sur la largeur d'une page portrait.
      doc.font('Helvetica').fontSize(7.5).fillColor(COULEURS.secondaire)
        .text(texteSur(m.nom.slice(0, 3)), x, base + 5, {
          width: largeurColonne, align: 'center', lineBreak: false
        });
    });

    doc.moveTo(MARGE, base).lineTo(MARGE + LARGEUR, base)
      .lineWidth(0.5).strokeColor(COULEURS.bordure).stroke();
    doc.y = base + 18;
    commentaire(`Échelle : le mois le plus fort atteint ${formaterMontant(maximum, parametres.devise)}.`);
  }

  // ---- Tableaux ----------------------------------------------------------------
  /**
   * Tableau générique : en-tête grisé répété après un saut de page, une ligne
   * par entrée. Chaque colonne fournit son contenu déjà mis en forme, via
   * `colonnes[].texte(entree)` ; `montant: true` l'aligne à droite.
   */
  function tableau(colonnes, entrees) {
    const enTeteTableau = () => {
      const y = doc.y;
      doc.rect(MARGE, y, LARGEUR, 20).fill(COULEURS.fondEntete);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COULEURS.texte);
      let x = MARGE;
      for (const colonne of colonnes) {
        doc.text(texteSur(colonne.titre), x + REMPLISSAGE, y + 6, {
          width: colonne.largeur - REMPLISSAGE * 2,
          align: colonne.montant ? 'right' : 'left',
          lineBreak: false
        });
        x += colonne.largeur;
      }
      doc.y = y + 20;
    };

    assurerPlace(48);
    enTeteTableau();

    for (const entree of entrees) {
      doc.font('Helvetica').fontSize(TAILLE_TEXTE);
      const cellules = colonnes.map((c) => c.texte(entree));
      const hauteur = Math.max(15, ...cellules.map((texte, i) =>
        doc.heightOfString(texte || ' ', { width: colonnes[i].largeur - REMPLISSAGE * 2 })
      )) + REMPLISSAGE * 2;

      if (assurerPlace(hauteur)) enTeteTableau();
      doc.font('Helvetica').fontSize(TAILLE_TEXTE).fillColor(COULEURS.texte);
      const y = doc.y;
      let x = MARGE;
      cellules.forEach((texte, i) => {
        doc.text(texte, x + REMPLISSAGE, y + REMPLISSAGE, {
          width: colonnes[i].largeur - REMPLISSAGE * 2,
          align: colonnes[i].montant ? 'right' : 'left'
        });
        x += colonnes[i].largeur;
      });
      doc.moveTo(MARGE, y + hauteur).lineTo(MARGE + LARGEUR, y + hauteur)
        .lineWidth(0.5).strokeColor(COULEURS.bordure).stroke();
      doc.y = y + hauteur;
    }
  }

  /**
   * Tableau « libellé, nombre, montant, part » commun aux classements.
   *
   * `nom` est fourni par l'appelant, car les entrées classées ne portent pas
   * toutes leur libellé sous la même clé : un client a un `nom`, un mode de
   * règlement un `libelle`. Le lire à l'aveugle laissait la colonne vide.
   */
  function tableauClassement(entrees, { titre, compte, nom }) {
    tableau([
      { titre, largeur: 245, texte: (e) => texteSur(nom(e)) },
      { titre: compte, largeur: 90, texte: (e) => String(e.nombre) },
      { titre: 'Montant', largeur: 100, montant: true, texte: (e) => euros(e.montant) },
      { titre: 'Part', largeur: 80, montant: true, texte: (e) => `${String(e.part).replace('.', ',')} %` }
    ], entrees);
  }

  // ---- Rendu -------------------------------------------------------------------
  const { synthese, comparaison } = rapport;
  const avecAchats = synthese.achats.nombre > 0;
  const estMixte = parametres.typeActivite === 'mixte';

  /**
   * Lignes de la répartition par activité. Une activité mixte les montre
   * toutes les deux, même à zéro : leur équilibre est justement ce qu'on
   * regarde. Ailleurs, annoncer « Vente de marchandises : 0 € » à qui ne fait
   * que des prestations n'apprend rien, la ligne est donc omise.
   */
  const repartition = [
    (estMixte || synthese.ventes.nombre > 0) && { nom: 'Vente de marchandises', ...synthese.ventes },
    (estMixte || synthese.prestations.nombre > 0) && { nom: 'Prestation de services', ...synthese.prestations },
    synthese.nonCategorise.nombre > 0 && { nom: 'Non catégorisé', ...synthese.nonCategorise }
  ].filter(Boolean);

  // La colonne « Catégorie » du détail ne sert que si les encaissements ne
  // sont pas tous de la même nature.
  const avecCategorie = estMixte ||
    new Set(rapport.detail.map((r) => r.categorie || '')).size > 1;

  enTete();

  section('Synthèse de l’année');
  tuiles([
    { etiquette: 'Chiffre d’affaires encaissé', valeur: euros(synthese.chiffreAffaires), accent: true },
    { etiquette: 'Encaissements', valeur: String(synthese.nombreEncaissements) },
    { etiquette: 'Panier moyen', valeur: euros(synthese.panierMoyen) },
    ...(avecAchats ? [
      { etiquette: 'Achats de l’année', valeur: euros(synthese.achats.montant) },
      { etiquette: 'Recettes moins achats', valeur: euros(synthese.resultatBrut) },
      { etiquette: 'Clients de l’année', valeur: String(rapport.clients.nombre) }
    ] : [
      { etiquette: 'Clients de l’année', valeur: String(rapport.clients.nombre) }
    ])
  ]);

  const reperes = [
    synthese.meilleurMois && `Meilleur mois : ${synthese.meilleurMois.nom} (${formaterMontant(synthese.meilleurMois.montant, parametres.devise)}).`,
    comparaison.evolution === null
      ? (comparaison.nombreEncaissements === 0 ? `Aucun encaissement en ${comparaison.annee} : pas de comparaison possible.` : null)
      : `Par rapport à ${comparaison.annee} (${formaterMontant(comparaison.chiffreAffaires, parametres.devise)}) : ` +
        `${comparaison.evolution >= 0 ? '+' : ''}${String(comparaison.evolution).replace('.', ',')} %.`
  ].filter(Boolean).join(' ');
  if (reperes) commentaire(reperes);

  // Une seule ligne ne fait pas une répartition : la section n'a de sens que
  // si le chiffre d'affaires se partage entre plusieurs natures.
  if (repartition.length > 1) {
    section('Répartition par activité');
    tableau([
      { titre: 'Activité', largeur: 245, texte: (e) => texteSur(e.nom) },
      { titre: 'Encaissements', largeur: 90, texte: (e) => String(e.nombre) },
      { titre: 'Montant', largeur: 100, montant: true, texte: (e) => euros(e.montant) },
      { titre: 'Part', largeur: 80, montant: true, texte: (e) => `${String(e.part).replace('.', ',')} %` }
    ], repartition);
  }

  section('Évolution mois par mois');
  graphiqueMensuel(rapport.mensuel);
  tableau(avecAchats
    ? [
      { titre: 'Mois', largeur: 155, texte: (m) => texteSur(m.nom) },
      { titre: 'Encaissements', largeur: 90, texte: (m) => String(m.nombre) },
      { titre: 'Recettes', largeur: 135, montant: true, texte: (m) => euros(m.montant) },
      { titre: 'Achats', largeur: 135, montant: true, texte: (m) => euros(m.achats) }
    ]
    : [
      { titre: 'Mois', largeur: 200, texte: (m) => texteSur(m.nom) },
      { titre: 'Encaissements', largeur: 125, texte: (m) => String(m.nombre) },
      { titre: 'Recettes', largeur: 190, montant: true, texte: (m) => euros(m.montant) }
    ], rapport.mensuel);

  section('Moyens de paiement');
  if (rapport.modesReglement.length === 0) {
    commentaire('Aucun encaissement sur l’année.');
  } else {
    tableauClassement(rapport.modesReglement, {
      titre: 'Mode de règlement', compte: 'Encaissements', nom: (m) => m.libelle
    });
  }

  section('Clients');
  if (rapport.clients.classement.length === 0) {
    commentaire('Aucun client sur l’année.');
  } else {
    commentaire(
      `${rapport.clients.nombre} client${rapport.clients.nombre > 1 ? 's' : ''} ont réglé au moins ` +
      `une facture en ${rapport.annee}. Les plus importants en chiffre d’affaires :`
    );
    tableauClassement(rapport.clients.classement, {
      titre: 'Client', compte: 'Encaissements', nom: (c) => c.nom
    });
  }

  if (avecAchats) {
    section('Principaux fournisseurs');
    tableauClassement(rapport.fournisseurs, {
      titre: 'Fournisseur', compte: 'Achats', nom: (f) => f.nom
    });
  }

  section('Détail des encaissements');
  if (rapport.detail.length === 0) {
    commentaire('Aucun encaissement sur l’année.');
  } else {
    const modes = (code) => {
      const trouve = rapport.modesReglement.find((m) => m.code === code);
      return trouve ? trouve.libelle : code;
    };
    tableau(
      colonnesDetail(avecCategorie).map((c) => ({
        ...c,
        texte: (r) => (c.montant ? euros(r.montant) : texteSur(c.valeur(r, parametres, modes)))
      })),
      rapport.detail
    );
  }

  // ---- Pied de page -------------------------------------------------------------
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    // Écrire sous la marge basse déclencherait l'ajout d'une page :
    // on la neutralise le temps d'écrire le pied.
    const margeBasse = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(COULEURS.secondaire)
      .text(texteSur(`${titre}  ·  document de gestion interne`), MARGE, doc.page.height - MARGE + 8, {
        width: LARGEUR, align: 'left', lineBreak: false
      })
      .text(`Page ${i + 1} / ${pages.count}`, MARGE, doc.page.height - MARGE + 8, {
        width: LARGEUR, align: 'right', lineBreak: false
      });
    doc.page.margins.bottom = margeBasse;
  }

  doc.end();
}
