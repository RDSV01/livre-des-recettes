/**
 * Vue « Import CSV », pour les deux registres (recettes et achats), en trois
 * étapes :
 *  1. choix du fichier (clic ou glisser-déposer) ;
 *  2. correspondance de chaque colonne du fichier avec un champ du registre,
 *     devinée d'après son titre et sa première valeur montrée ;
 *  3. analyse (simulation côté serveur : validation et doublons), puis import.
 * La réussite s'affiche dans la carte elle-même.
 *
 * Le registre visé se choisit en tête quand l'activité tient aussi un registre
 * des achats ; sinon seules les recettes sont proposées.
 */

import { api } from '../api.js';
import { etat, registreAchatsUtile } from '../etat.js';
import { echapperHtml, selecteur, accorder } from '../ui.js';
import { patienter, halo, annoncer, brancherSegmentes } from '../retours.js';
import { icone } from '../icones.js';
import { analyserCsv, lireFichierCsv } from '../csv.js';
import { analyserDateSouple } from '/partage/dates.js';
import { normaliserTexte } from '/partage/texte.js';

/** Convertit une catégorie en texte libre vers un code du livre. */
function devinerCategorie(texte) {
  const t = normaliserTexte(texte);
  if (t.includes('vente') || t.includes('march')) return 'ventes';
  if (t.includes('prest') || t.includes('service')) return 'prestations';
  return '';
}

/**
 * Convertit un mode de règlement en texte libre vers un code du livre.
 * Un libellé identique à un mode personnalisé de l'utilisateur est reconnu,
 * puis les modes par défaut sont devinés par mots-clés.
 */
function devinerMode(texte, modesPersonnalises) {
  const t = normaliserTexte(texte);
  if (!t) return 'autre';
  const perso = modesPersonnalises.find((m) => normaliserTexte(m.libelle) === t);
  if (perso) return perso.code;
  if (t.includes('vir')) return 'virement';
  if (t.includes('carte') || t === 'cb' || t.includes('bancaire')) return 'carte';
  if (t.includes('esp') || t.includes('cash') || t.includes('liquide')) return 'especes';
  if (t.includes('cheq') || t.includes('chq')) return 'cheque';
  if (t.includes('paypal')) return 'paypal';
  if (t.includes('stripe')) return 'stripe';
  return 'autre';
}

/**
 * Description des deux registres importables. `cibles` liste les champs
 * pouvant être alimentés (`indices` sert à deviner la colonne d'après son
 * en-tête), et `construire` assemble une ligne prête pour le serveur.
 */
const REGISTRES = {
  recettes: {
    libelle: 'Recettes',
    nom: ['recette', 'recettes'],
    lien: '#/recettes',
    obligatoires: ['dateEncaissement', 'client', 'montant'],
    importer: (demande) => api.importerRecettes(demande),
    cibles: ({ estMixte }) => [
      { cle: 'dateEncaissement', libelle: 'Date d’encaissement', indices: ['date', 'encaissement'] },
      { cle: 'client', libelle: 'Client', indices: ['client', 'nom'] },
      { cle: 'montant', libelle: 'Montant', indices: ['montant', 'prix', 'somme', 'total', 'ttc'] },
      { cle: 'libelle', libelle: 'Libellé', indices: ['libelle', 'description', 'objet', 'designation'] },
      { cle: 'modeReglement', libelle: 'Mode de règlement', indices: ['mode', 'paiement', 'reglement'] },
      { cle: 'numeroFacture', libelle: 'N° de facture', indices: ['facture', 'reference'] },
      ...(estMixte ? [{ cle: 'categorie', libelle: 'Catégorie (vente ou prestation)', indices: ['categorie', 'type'] }] : [])
    ],
    construire: (v, { estMixte, categorieDefaut, modes }) => ({
      dateEncaissement: analyserDateSouple(v('dateEncaissement')) ?? v('dateEncaissement'),
      client: v('client'),
      montant: v('montant'),
      libelle: v('libelle'),
      modeReglement: devinerMode(v('modeReglement'), modes),
      numeroFacture: v('numeroFacture'),
      categorie: estMixte ? (devinerCategorie(v('categorie')) || categorieDefaut) : ''
    })
  },
  achats: {
    libelle: 'Achats',
    nom: ['achat', 'achats'],
    lien: '#/achats',
    obligatoires: ['dateReglement', 'fournisseur', 'montant'],
    importer: (demande) => api.importerAchats(demande),
    cibles: () => [
      { cle: 'dateReglement', libelle: 'Date du règlement', indices: ['date', 'reglement', 'paiement'] },
      { cle: 'fournisseur', libelle: 'Fournisseur', indices: ['fournisseur', 'nom', 'vendeur'] },
      { cle: 'montant', libelle: 'Montant', indices: ['montant', 'prix', 'somme', 'total', 'ttc'] },
      { cle: 'modeReglement', libelle: 'Mode de paiement', indices: ['mode', 'paiement', 'reglement'] },
      { cle: 'referenceFacture', libelle: 'Référence de la pièce', indices: ['reference', 'facture', 'piece', 'justificatif'] }
    ],
    construire: (v, { modes }) => ({
      dateReglement: analyserDateSouple(v('dateReglement')) ?? v('dateReglement'),
      fournisseur: v('fournisseur'),
      montant: v('montant'),
      modeReglement: devinerMode(v('modeReglement'), modes),
      referenceFacture: v('referenceFacture')
    })
  }
};

const ETAPES = ['Fichier', 'Colonnes', 'Vérification'];

export async function vueImport(conteneur) {
  const estMixte = etat.parametres.typeActivite === 'mixte';
  const modes = etat.parametres.modesPersonnalises;
  const achatsUtiles = registreAchatsUtile();
  let registre = 'recettes';
  let etape = 1;
  let donneesCsv = null; // { entetes, lignes }
  let nomFichier = '';
  let colonnes = [];     // champ du registre choisi pour chaque colonne du fichier
  let lignes = [];       // lignes construites, envoyées au serveur
  let rapport = null;    // résultat de la simulation
  let resultat = null;   // résultat de l'import

  conteneur.innerHTML = `
    <div class="page">
      <header class="entete-page">
        <div>
          <h1>Import CSV</h1>
          <p class="sous-titre">Reprenez un historique tenu dans un tableur : rien n’est importé sans votre confirmation.</p>
        </div>
      </header>
      <section class="carte" id="import" aria-label="Import CSV"></section>
    </div>`;
  const zone = conteneur.querySelector('#import');

  const desc = () => REGISTRES[registre];
  const cibles = () => desc().cibles({ estMixte });

  function etapesHtml() {
    return `<ol class="etapes" aria-label="Étapes de l’import">${ETAPES.map((titre, i) => {
      const faite = etape > i + 1;
      return `<li class="etape${etape === i + 1 ? ' active' : ''}${faite ? ' faite' : ''}"${etape === i + 1 ? ' aria-current="step"' : ''}>
        <span class="num">${faite ? icone('coche', { taille: 13 }) : i + 1}</span>${titre}</li>`;
    }).join('')}</ol>`;
  }

  /** Premier contenu non vide d'une colonne : il aide à la reconnaître. */
  const premiereValeur = (i) => donneesCsv.lignes.map((l) => (l[i] ?? '').trim()).find(Boolean) ?? '';

  /** Devine le champ de chaque colonne d'après les en-têtes, sans jamais en donner un à deux colonnes. */
  function devinerColonnes() {
    const entetes = donneesCsv.entetes.map(normaliserTexte);
    colonnes = entetes.map(() => '');
    for (const cible of cibles()) {
      for (const indice of cible.indices) {
        const index = entetes.findIndex((e, i) => e.includes(indice) && colonnes[i] === '');
        if (index !== -1) { colonnes[index] = cible.cle; break; }
      }
    }
  }

  function corpsHtml() {
    if (etape === 1) {
      return `${achatsUtiles ? `<div class="carte-corps choix-registre">
          <span class="etiquette-champ" id="i-registre">Registre à compléter</span>
          <div class="segmente compact" role="group" aria-labelledby="i-registre">
            ${Object.entries(REGISTRES).map(([cle, r]) => `<button type="button" data-registre="${cle}" aria-pressed="${cle === registre}">
              ${icone(cle, { taille: 15 })}${r.libelle}</button>`).join('')}
          </div>
        </div>` : ''}
        <label class="depot" id="depot">
          <span class="tuile">${icone('import', { taille: 22 })}</span>
          <strong>Déposez un fichier CSV ici</strong>
          <span>ou cliquez pour le choisir. Séparateur « ; » ou « , », la première ligne portant les titres des colonnes.</span>
          <input type="file" accept=".csv,text/csv" class="hors-ecran" id="i-fichier">
        </label>
        ${donneesCsv ? `<p class="reprise-fichier"><button type="button" class="lien-bouton" id="i-reprendre">Reprendre « ${echapperHtml(nomFichier)} »</button> avec ce registre</p>` : ''}
        <p class="message-erreur centre" data-erreur></p>`;
    }
    if (etape === 2) {
      const options = `<option value="">Ne pas importer</option>${cibles().map((c) => `<option value="${c.cle}">${echapperHtml(c.libelle)}</option>`).join('')}`;
      const obligatoires = cibles().filter((c) => desc().obligatoires.includes(c.cle)).map((c) => c.libelle.toLowerCase());
      return `<p class="resume-registre fichier-importe">${icone('fichier-tableur', { taille: 16 })}<span><strong>${echapperHtml(nomFichier)}</strong> :
          ${accorder(donneesCsv.lignes.length, 'ligne')}, ${accorder(donneesCsv.entetes.length, 'colonne')}. Colonnes reconnues d’après leur titre, à corriger au besoin.</span></p>
        <table class="tableau">
          <thead><tr><th>Colonne du fichier</th><th>Première valeur</th><th>Champ du ${registre === 'achats' ? 'registre' : 'livre'}</th></tr></thead>
          <tbody>${donneesCsv.entetes.map((entete, i) => `<tr>
            <td><strong>${echapperHtml(entete || `Colonne ${i + 1}`)}</strong></td>
            <td class="attenue">${echapperHtml(premiereValeur(i))}</td>
            <td class="col-correspondance">${selecteur({ id: `i-col-${i}`, etiquette: `Champ pour la colonne ${entete || i + 1}`, options })}</td>
          </tr>`).join('')}</tbody>
        </table>
        ${registre === 'recettes' && estMixte ? `<div class="carte-corps defaut-categorie">
          <label class="etiquette-champ" for="i-categorie-defaut">Catégorie des lignes qui n’en ont pas</label>
          ${selecteur({ id: 'i-categorie-defaut', options: '<option value="prestations">Prestation de services</option><option value="ventes">Vente de marchandises</option>' })}
        </div>` : ''}
        <p class="message-erreur centre" data-erreur></p>
        <div class="carte-pied">
          <span class="attenue">Obligatoires : ${obligatoires.join(', ')}. Les colonnes « Ne pas importer » sont ignorées.</span>
          <div class="actions">
            <button type="button" class="btn btn-fantome" data-etape="1">Retour</button>
            <button type="button" class="btn btn-principal" id="i-analyser">Analyser le fichier${icone('fleche-droite', { taille: 16 })}</button>
          </div>
        </div>`;
    }
    if (etape === 3) {
      const [un, plusieurs] = desc().nom;
      const feminin = registre === 'recettes';
      const nom = (n) => (n > 1 ? plusieurs : un);
      return `<div class="carte-corps corps-verification">
          <ul class="points points-import">
            <li class="vu">${icone('cercle-valide', { taille: 16 })}<span><strong>${accorder(rapport.valides, `${un} ${feminin ? 'prête' : 'prêt'}`, `${plusieurs} ${feminin ? 'prêtes' : 'prêts'}`)} à importer</strong>
              ${feminin ? 'Elles rejoindront le livre des recettes' : 'Ils rejoindront le registre des achats'}.</span></li>
            ${rapport.doublons.length > 0 ? `<li class="vu alerte">${icone('triangle-alerte', { taille: 16 })}<span>
              <strong>${accorder(rapport.doublons.length, 'doublon détecté', 'doublons détectés')}</strong>
              Même date, même ${registre === 'achats' ? 'fournisseur' : 'client'}, même montant qu’une ligne déjà enregistrée :
              ${rapport.doublons.slice(0, 6).map((d) => `ligne ${d.ligne} (${echapperHtml(d.date)}, ${echapperHtml(d.tiers)}, ${echapperHtml(String(d.montant))})`).join(' ; ')}${rapport.doublons.length > 6 ? ` et ${rapport.doublons.length - 6} autres` : ''}.
              <label class="option-pieces"><input type="checkbox" class="case" id="i-doublons"><span>Importer aussi les doublons</span></label></span></li>` : ''}
            ${rapport.erreurs.length > 0 ? `<li class="vu erreur">${icone('cercle-alerte', { taille: 16 })}<span>
              <strong>${accorder(rapport.erreurs.length, 'ligne en erreur', 'lignes en erreur')}, non importée${rapport.erreurs.length > 1 ? 's' : ''}</strong>
              ${rapport.erreurs.slice(0, 6).map((e) => `ligne ${e.ligne} : ${echapperHtml(Object.values(e.erreurs).join(' '))}`).join(' ; ')}${rapport.erreurs.length > 6 ? ` et ${rapport.erreurs.length - 6} autres` : ''}.</span></li>` : ''}
            <li class="vu info">${icone('bouclier', { taille: 16 })}<span><strong>Une sauvegarde sera faite juste avant</strong>
              L’import peut donc être annulé depuis les Paramètres.</span></li>
          </ul>
        </div>
        <p class="message-erreur centre" data-erreur></p>
        <div class="carte-pied">
          <span class="attenue">Les numéros de facture du fichier sont repris tels quels.</span>
          <div class="actions">
            <button type="button" class="btn btn-fantome" data-etape="2">Retour</button>
            <button type="button" class="btn btn-principal" id="i-importer" ${rapport.valides + rapport.doublons.length === 0 ? 'disabled' : ''}>
              ${icone('coche', { taille: 16 })}<span>Importer ${accorder(rapport.valides, nom(rapport.valides))}</span></button>
          </div>
        </div>`;
    }
    // Étape finale : la réussite s'affiche dans la carte, pas dans un coin de l'écran.
    const [un, plusieurs] = desc().nom;
    const n = resultat.importees;
    return `<div class="reussite-import">
        <span class="sceau-reussite">${icone('coche', { taille: 30, classe: 'trace-coche' })}</span>
        <h2>${accorder(n, `${un} importé${registre === 'achats' ? '' : 'e'}`, `${plusieurs} importé${registre === 'achats' ? '' : 'e'}s`)}</h2>
        <p>${resultat.erreurs.length > 0 ? `${accorder(resultat.erreurs.length, 'ligne en erreur ignorée', 'lignes en erreur ignorées')}. ` : ''}${resultat.sauvegarde ? 'Une sauvegarde des données précédentes a été créée : elle se restaure depuis les Paramètres.' : ''}</p>
        <div class="actions">
          <button type="button" class="btn" data-etape="1">Importer un autre fichier</button>
          <a class="btn btn-principal" href="${desc().lien}">Voir les ${desc().libelle.toLowerCase()}${icone('fleche-droite', { taille: 16 })}</a>
        </div>
      </div>`;
  }

  function aller(n) {
    etape = n;
    zone.innerHTML = (etape < 4 ? etapesHtml() : '') + corpsHtml();
    zone.classList.remove('arrive');
    void zone.offsetWidth;
    zone.classList.add('arrive');
    brancher();
  }

  const signaler = (texte) => {
    const cible = zone.querySelector('[data-erreur]');
    if (cible) cible.innerHTML = texte ? `${icone('cercle-alerte', { taille: 15 })}<span>${echapperHtml(texte)}</span>` : '';
  };

  async function chargerFichier(fichier) {
    try {
      const texte = await lireFichierCsv(fichier);
      const donnees = analyserCsv(texte);
      if (donnees.entetes.length < 2 || donnees.lignes.length === 0) {
        signaler('Fichier vide ou illisible : vérifiez qu’il s’agit bien d’un CSV avec une ligne de titres.');
        return;
      }
      donneesCsv = donnees;
      nomFichier = fichier.name;
      devinerColonnes();
      aller(2);
    } catch (erreur) {
      signaler(`Lecture impossible : ${erreur.message}`);
    }
  }

  /** Construit les lignes à envoyer au serveur d'après la correspondance choisie ; `null` si elle est incomplète. */
  function construireLignes() {
    const correspondance = {};
    const doubles = new Set();
    colonnes.forEach((cle, i) => {
      if (!cle) return;
      if (cle in correspondance) doubles.add(cle);
      correspondance[cle] = i;
    });
    const libelleDe = (cle) => cibles().find((c) => c.cle === cle)?.libelle ?? cle;
    if (doubles.size > 0) {
      signaler(`Un champ ne peut venir que d’une colonne : ${[...doubles].map(libelleDe).join(', ')} ${doubles.size > 1 ? 'sont choisis' : 'est choisi'} deux fois.`);
      return null;
    }
    const manquantes = desc().obligatoires.filter((cle) => correspondance[cle] === undefined);
    if (manquantes.length > 0) {
      signaler(`Associez une colonne ${manquantes.length > 1 ? 'aux champs' : 'au champ'} : ${manquantes.map(libelleDe).join(', ')}.`);
      return null;
    }
    const valeur = (rangee, cle) => (correspondance[cle] === undefined ? '' : (rangee[correspondance[cle]] ?? '').trim());
    const categorieDefaut = zone.querySelector('#i-categorie-defaut')?.value ?? '';
    return donneesCsv.lignes.map((rangee) =>
      desc().construire((cle) => valeur(rangee, cle), { estMixte, categorieDefaut, modes }));
  }

  function brancher() {
    brancherSegmentes(zone);
    zone.querySelectorAll('[data-registre]').forEach((bouton) => bouton.addEventListener('click', () => {
      if (bouton.dataset.registre === registre) return;
      registre = bouton.dataset.registre;
      zone.querySelectorAll('[data-registre]').forEach((b) => b.setAttribute('aria-pressed', String(b === bouton)));
    }));
    zone.querySelectorAll('[data-etape]').forEach((bouton) => bouton.addEventListener('click', () => {
      aller(Number(bouton.dataset.etape));
    }));

    zone.querySelector('#i-reprendre')?.addEventListener('click', () => {
      devinerColonnes();
      aller(2);
    });

    const depot = zone.querySelector('#depot');
    if (depot) {
      ['dragenter', 'dragover'].forEach((type) => depot.addEventListener(type, (evenement) => {
        evenement.preventDefault();
        depot.classList.add('survol');
      }));
      depot.addEventListener('dragleave', (evenement) => {
        if (!depot.contains(evenement.relatedTarget)) depot.classList.remove('survol');
      });
      depot.addEventListener('drop', (evenement) => {
        evenement.preventDefault();
        depot.classList.remove('survol');
        const fichier = evenement.dataTransfer.files?.[0];
        if (fichier) chargerFichier(fichier);
      });
      zone.querySelector('#i-fichier').addEventListener('change', (evenement) => {
        const fichier = evenement.target.files?.[0];
        if (fichier) chargerFichier(fichier);
      });
    }

    if (etape === 2) {
      colonnes.forEach((cle, i) => {
        const select = zone.querySelector(`#i-col-${i}`);
        select.value = cle;
        select.addEventListener('change', () => {
          colonnes[i] = select.value;
          signaler('');
        });
      });
      zone.querySelector('#i-analyser').addEventListener('click', async (evenement) => {
        const construites = construireLignes();
        if (!construites) return;
        const reprendre = patienter(evenement.currentTarget, 'Analyse…');
        try {
          rapport = await desc().importer({ lignes: construites, simulation: true });
          lignes = construites;
          aller(3);
        } catch (erreur) {
          reprendre();
          signaler(erreur.message);
        }
      });
    }

    if (etape === 3) {
      const bouton = zone.querySelector('#i-importer');
      const caseDoublons = zone.querySelector('#i-doublons');
      const [un, plusieurs] = desc().nom;
      caseDoublons?.addEventListener('change', () => {
        const n = rapport.valides + (caseDoublons.checked ? rapport.doublons.length : 0);
        bouton.querySelector('span').textContent = `Importer ${accorder(n, un, plusieurs)}`;
        bouton.disabled = n === 0;
      });
      bouton.addEventListener('click', async () => {
        const importerDoublons = caseDoublons?.checked ?? false;
        const reprendre = patienter(bouton, 'Import…');
        // Tant que l'import est en cours, une fermeture de l'onglet demande confirmation.
        const gardeFermeture = (e) => { e.preventDefault(); };
        window.addEventListener('beforeunload', gardeFermeture);
        try {
          resultat = await desc().importer({ lignes, importerDoublons });
          aller(4);
          halo(zone.querySelector('.sceau-reussite'));
          annoncer(`${accorder(resultat.importees, un, plusieurs)} importé${resultat.importees > 1 ? 's' : ''}`);
        } catch (erreur) {
          reprendre();
          signaler(erreur.message);
        } finally {
          window.removeEventListener('beforeunload', gardeFermeture);
        }
      });
    }
  }

  aller(1);
}
