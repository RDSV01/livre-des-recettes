/**
 * Vue « Paramètres » : un sommaire fixe à gauche, les sections à droite.
 *
 * L'identité se consulte, puis se modifie sur place ; tous les autres
 * réglages s'appliquent dès qu'on les change, sans bouton « Enregistrer » au
 * bas d'une longue page, et « Enregistré » s'affiche à côté du réglage.
 */

import { api, telechargerFichier } from '../api.js';
import { etat, definirParametres } from '../etat.js';
import {
  toast, echapperHtml, infobulle, selecteur, afficherErreursFormulaire, effacerErreursFormulaire,
  accorder, poidsLisible, siretLisible, mouvementReduit, optionsCodes, interrupteur,
  deplierHauteur, replierPuisRetirer
} from '../ui.js';
import {
  annoncer, reussite, patienter, bandeauRetour, brancherSegmentes, copierDansPressePapiers
} from '../retours.js';
import { icone } from '../icones.js';
import { listeSauvegardes, brancherRestauration } from '../sauvegardes.js';
import { basculerTheme } from '../theme.js';
import { champDate, brancherChampDate } from '../calendrier.js';
import { DEVISES, FORMATS_DATE, MODES_REGLEMENT } from '/partage/constantes.js';
import { TYPES_ACTIVITE, NATURES_PRESTATIONS } from '/partage/seuils.js';
import { periodeAcre } from '/partage/acre.js';
import { dateEnFrancaisLong, aujourdHuiIso } from '/partage/dates.js';

const SECTIONS = [
  ['identite', 'Identité'], ['regime', 'Régime et déclaration'], ['affichage', 'Affichage'],
  ['modes', 'Modes de règlement'], ['options', 'Options'], ['donnees', 'Vos données'], ['sauvegardes', 'Sauvegardes']
];

const OPTIONS = [
  ['alertesNumerotation', 'Alertes de numérotation des factures', 'Doublons et numéros manquants, signalés dans le livre des recettes.'],
  ['alerteRecetteSimilaire', 'Avertir d’une recette très similaire', 'Même date, même client, même montant qu’une recette existante.'],
  ['suiviSeuils', 'Suivi des seuils sur le tableau de bord', 'Plafond micro-entrepreneur et franchise de TVA.'],
  ['verifierMisesAJour', 'Signaler les nouvelles versions', 'Demande la dernière version publiée à GitHub, sans rien envoyer de vos données.']
];

const CHAMPS_IDENTITE = [
  ['prenom', 'Votre prénom', 'Pour vous saluer sur le tableau de bord'],
  ['nomEntreprise', 'Nom de l’entreprise', ''],
  ['siren', 'SIREN', '9 chiffres'],
  ['siret', 'SIRET', '14 chiffres'],
  ['activite', 'Activité', 'Ex. : développement informatique'],
  ['adresse', 'Adresse', '']
];

const section = (id, titre, corps, action = '') => `<section class="carte section-param" id="s-${id}" aria-labelledby="t-${id}">
    <div class="carte-tete"><h2 id="t-${id}">${titre}</h2>${action}</div>${corps}</section>`;

export async function vueParametres(conteneur, params) {
  const p = () => etat.parametres;
  // État système rafraîchi : l'échec des sauvegardes n'apparaît qu'après une
  // écriture, donc pas forcément au démarrage.
  const [systeme, { sauvegardes }, { recettes }, { achats }] = await Promise.all([
    api.systeme().catch(() => etat.systeme),
    api.listerSauvegardes(),
    api.listerRecettes(),
    api.listerAchats()
  ]);
  const usagesMode = (code) => recettes.filter((r) => r.modeReglement === code).length +
    achats.filter((a) => a.modeReglement === code).length;
  const sombre = document.documentElement.dataset.theme === 'dark';
  const identiteVide = !p().nomEntreprise && !p().siren && !p().siret;

  // ---- Gabarits ----------------------------------------------------------------------
  function identiteLue() {
    const valeur = (v, format = (x) => x) => (v ? `<strong>${echapperHtml(format(v))}</strong>` : '<strong class="attenue">Non renseigné</strong>');
    return `<div class="carte-corps"><div class="identite">
        <div><span>Votre prénom</span>${valeur(p().prenom)}</div>
        <div class="large"><span>Nom de l’entreprise</span>${valeur(p().nomEntreprise)}</div>
        <div><span>SIREN</span>${valeur(p().siren, (s) => s.replace(/(\d{3})(?=\d)/g, '$1 '))}</div>
        <div><span>SIRET</span>${valeur(p().siret, siretLisible)}</div>
        <div><span>Activité</span>${valeur(p().activite)}</div>
        <div class="large"><span>Adresse</span>${valeur(p().adresse)}</div>
      </div><p class="notes">Hormis votre prénom, ces lignes figurent en tête de chaque export.</p></div>`;
  }

  function identiteFormulaire() {
    return `<form id="form-identite" class="carte-corps" novalidate>
        <div class="grille-champs">
          ${CHAMPS_IDENTITE.map(([nom, libelle, exemple]) => `<div class="champ" data-champ="${nom}">
            <label for="p-${nom}">${libelle}</label>
            <input class="champ-texte" id="p-${nom}" name="${nom}" value="${echapperHtml(p()[nom])}" autocomplete="off"
              ${exemple ? `placeholder="${exemple}"` : ''}${nom === 'siren' || nom === 'siret' ? ' inputmode="numeric"' : ''}>
            <span class="erreur-champ message-erreur"></span></div>`).join('')}
        </div>
        <p class="erreur-panneau" data-erreur-panneau role="alert"></p>
        <div class="actions fin">
          ${identiteVide ? '' : '<button type="button" class="btn btn-fantome" id="p-annuler">Annuler</button>'}
          <button type="submit" class="btn btn-principal">${icone('coche', { taille: 16 })}<span>Enregistrer</span></button>
        </div>
      </form>`;
  }

  const ligneMode = ({ code = '', libelle = '' } = {}) => {
    const usages = code ? usagesMode(code) : 0;
    return `<div class="ligne-gestion" data-code="${echapperHtml(code)}">
        ${icone('portefeuille', { taille: 17 })}
        <input class="champ-texte quoi" value="${echapperHtml(libelle)}" maxlength="50" placeholder="Nom du mode (ex. : Lydia)"
          aria-label="Nom du mode de règlement">
        <span class="quand">${usages ? `utilisé par ${accorder(usages, 'ligne')}` : 'jamais utilisé'}</span>
        <button type="button" class="btn-icone danger" data-supprimer-mode ${usages ? 'disabled title="Utilisé dans vos registres : il peut être renommé, pas supprimé"' : 'title="Supprimer"'}
          aria-label="Supprimer ${echapperHtml(libelle || 'ce mode')}">${icone('corbeille', { taille: 16 })}</button>
      </div>`;
  };

  const pieces = systeme.pieces ?? { nombre: 0, taille: 0, dossier: '' };
  const chemin = (texte, quoi) => `<div class="chemin"><span>${echapperHtml(texte)}</span>
    <button type="button" class="btn-icone" data-copier="${echapperHtml(texte)}" aria-label="Copier le chemin ${quoi}" title="Copier le chemin">${icone('copier', { taille: 15 })}</button></div>`;

  conteneur.innerHTML = `
    <div class="page">
      <header class="entete-page">
        <div>
          <h1>Paramètres</h1>
          <p class="sous-titre">Votre entreprise, votre régime et vos préférences, enregistrés sur cet ordinateur avec le livre.</p>
        </div>
      </header>

      ${etat.systeme.premierLancement ? `
      <section class="carte bienvenue" id="carte-bienvenue">
        <div class="carte-corps">
          <h2>Bienvenue !</h2>
          <p>Laissez-vous guider : quelques questions, deux minutes, et votre entreprise, votre activité et votre
          rythme de déclaration sont en place. Vous pouvez aussi tout renseigner ci-dessous, section par section.</p>
          <div class="actions">
            <button type="button" class="btn btn-principal" id="reprendre-accueil">${icone('etincelle', { taille: 16 })}Reprendre la configuration guidée</button>
            <button type="button" class="btn" id="charger-demo">Découvrir avec un jeu de démonstration</button>
          </div>
        </div>
      </section>` : ''}

      <div class="parametres">
        <nav class="sommaire" aria-label="Sections des paramètres">
          ${SECTIONS.map(([id, titre], i) => `<a href="#/parametres?section=${id}" data-section="${id}" class="${i === 0 ? 'actif' : ''}">${titre}</a>`).join('')}
        </nav>
        <div class="sections">
          ${section('identite', 'Vous et votre entreprise', `<div id="zone-identite">${identiteVide ? identiteFormulaire() : identiteLue()}</div>`,
            `<button type="button" class="btn btn-petit" id="modifier-identite" ${identiteVide ? 'hidden' : ''}>${icone('crayon', { taille: 15 })}Modifier</button>`)}

          ${section('regime', 'Régime et déclaration', `<div class="carte-corps">
            <div class="grille-champs">
              <div class="champ option-champ large"><label for="p-typeActivite">Type d’activité${infobulle(
                'Détermine le plafond micro-entrepreneur et le seuil de franchise de TVA suivis sur le tableau de bord, ainsi que le taux de cotisations estimé.',
                'le type d’activité')}</label>
                ${selecteur({ id: 'p-typeActivite', options: optionsCodes(TYPES_ACTIVITE, p().typeActivite) })}</div>
              <div class="champ option-champ large" id="champ-nature"><label for="p-naturePrestations">Nature de vos prestations${infobulle(
                'Les plafonds sont les mêmes pour toutes les prestations, mais la catégorie fiscale (BIC ou BNC) et le taux de cotisations diffèrent.',
                'la nature des prestations')}</label>
                ${selecteur({ id: 'p-naturePrestations', options: optionsCodes(NATURES_PRESTATIONS, p().naturePrestations) })}</div>
            </div>
            <div class="option separee">
              <div><strong>Déclaration URSSAF</strong><span>Le rythme choisi à votre immatriculation : l’écran URSSAF et le tableau de bord le suivent.</span></div>
              <div class="segmente compact" role="group" aria-label="Rythme de déclaration">
                <button type="button" data-periodicite="mois" aria-pressed="${p().periodiciteUrssaf === 'mois'}">Mensuelle</button>
                <button type="button" data-periodicite="trimestre" aria-pressed="${p().periodiciteUrssaf === 'trimestre'}">Trimestrielle</button>
              </div>
            </div>
            <div class="option" id="option-versementLiberatoire">
              <div><strong>Versement libératoire de l’impôt sur le revenu</strong><span>1 % des ventes, 1,7 % des prestations commerciales ou artisanales, 2,2 % d’une activité libérale, payés à l’URSSAF avec les cotisations.</span></div>
              ${interrupteur('p-versementLiberatoire', p().versementLiberatoire, 'Versement libératoire de l’impôt sur le revenu')}
            </div>
            <div class="option" id="option-activiteArtisanale">
              <div><strong>Activité artisanale</strong><span>Formation professionnelle à 0,3 % du chiffre d’affaires, au lieu de 0,1 % pour un commerçant et 0,2 % pour une activité libérale.</span></div>
              ${interrupteur('p-activiteArtisanale', p().activiteArtisanale, 'Activité artisanale')}
            </div>
            <div class="option" id="option-acre">
              <div><strong>ACRE</strong><span>Aide à la création ou à la reprise d’une entreprise, accordée sur demande à l’URSSAF : cotisations sociales réduites jusqu’à la fin du 3e trimestre civil qui suit le début d’activité.</span></div>
              ${interrupteur('p-acre', p().acre, 'ACRE')}
            </div>
            <div class="grille-champs detail-option" id="detail-acre" ${p().acre ? '' : 'hidden'}>
              <div class="champ option-champ" data-champ="debutActivite">
                <label for="p-debutActivite">Début d’activité${infobulle(
                  'La date de début d’activité déclarée à l’immatriculation. Elle fixe la fin de l’ACRE, et la part du taux payée : 50 % pour une création avant le 1er juillet 2026, 75 % ensuite.',
                  'le début d’activité')}</label>
                ${champDate({ id: 'p-debutActivite', nom: 'debutActivite', format: p().formatDate })}
                <span class="erreur-champ message-erreur"></span>
              </div>
              <p class="notes" id="fin-acre"></p>
            </div>
          </div>`)}

          ${section('affichage', 'Affichage', `<div class="carte-corps">
            <div class="grille-champs">
              <div class="champ option-champ"><label for="p-devise">Devise</label>
                ${selecteur({ id: 'p-devise', options: optionsCodes(DEVISES, p().devise) })}</div>
              <div class="champ option-champ"><label for="p-formatDate">Format des dates</label>
                ${selecteur({ id: 'p-formatDate', options: FORMATS_DATE.map((f) => `<option value="${f.code}"${f.code === p().formatDate ? ' selected' : ''}>${f.code} (${f.libelle})</option>`).join('') })}</div>
            </div>
            <div class="option separee">
              <div><strong>Thème</strong><span>Aussi accessible en bas du menu.</span></div>
              <div class="segmente compact" role="group" aria-label="Thème">
                <button type="button" data-theme-choix="light" aria-pressed="${!sombre}">${icone('soleil', { taille: 15 })}Clair</button>
                <button type="button" data-theme-choix="dark" aria-pressed="${sombre}">${icone('lune', { taille: 15 })}Sombre</button>
              </div>
            </div>
          </div>`)}

          ${section('modes', 'Modes de règlement personnalisés', `<div class="carte-corps">
            <p class="sous-titre">${MODES_REGLEMENT.map((m) => m.libelle).join(', ')} restent toujours disponibles. Un mode déjà utilisé peut être renommé, pas supprimé.</p>
            <div id="liste-modes">${p().modesPersonnalises.map(ligneMode).join('')}</div>
            <p class="erreur-panneau" id="erreur-modes" role="alert"></p>
            <button type="button" class="btn btn-petit" id="ajouter-mode">${icone('plus', { taille: 15 })}Ajouter un mode</button>
          </div>`)}

          ${section('options', 'Options', `<div class="carte-corps">
            ${OPTIONS.map(([cle, titre, texte]) => `<div class="option">
              <div><strong>${titre}</strong><span>${texte}</span></div>${interrupteur(`o-${cle}`, p()[cle], titre)}</div>`).join('')}
            <div id="numeros-ignores"></div>
          </div>`, '<span class="note">S’appliquent aussitôt</span>')}

          ${section('donnees', 'Vos données', `<div class="carte-corps">
            ${systeme.sauvegardesEnEchec ? `<p class="avis">${icone('cercle-alerte', { taille: 17 })}<span>Vos sauvegardes automatiques n’ont pas pu
              être écrites : le dossier ci-dessous est peut-être inaccessible (lecteur réseau déconnecté, disque plein). Vos saisies sont
              bien enregistrées, mais sans filet pour l’instant : téléchargez une copie par précaution.</span></p>` : ''}
            <p class="sous-titre">Tout le livre tient dans un seul fichier :</p>
            ${chemin(systeme.fichierDonnees, 'du fichier de données')}
            <p class="sous-titre">Les factures et justificatifs PDF joints sont rangés à côté${pieces.nombre ? ` (${accorder(pieces.nombre, 'PDF')}, ${poidsLisible(pieces.taille)})` : ', dès le premier joint'} :</p>
            ${chemin(pieces.dossier, 'du dossier des pièces jointes')}
            <p class="sous-titre">Les sauvegardes vivent en dehors, pour survivre à la perte du dossier de données :</p>
            ${chemin(systeme.dossierSauvegardes, 'des sauvegardes')}
            <p class="notes">Une sauvegarde est créée chaque jour, avant chaque import et avant chaque restauration : tout pendant
            14 jours, puis une par semaine pendant 2 mois, puis une par mois pendant 1 an, plus une copie de secours mise à jour à
            chaque saisie. Chaque PDF joint y est aussi doublé. Pour changer d’ordinateur, copiez simplement le dossier de données.</p>
            <div class="actions">
              <button type="button" class="btn" data-telecharger="/api/sauvegarde">${icone('telecharger', { taille: 16 })}Télécharger une copie (JSON)</button>
              <button type="button" class="btn" data-telecharger="/api/sauvegarde/complete">${icone('telecharger', { taille: 16 })}Copie complète avec les PDF (.zip)</button>
            </div>
          </div>`)}

          ${section('sauvegardes', 'Sauvegardes disponibles', `<div class="carte-corps" id="liste-sauvegardes">
            ${sauvegardes.length === 0
              ? '<p class="sous-titre">Aucune sauvegarde pour l’instant : la première sera créée à la prochaine modification.</p>'
              : listeSauvegardes(sauvegardes)}
          </div>`, '<span class="note">De la plus récente à la plus ancienne</span>')}
        </div>
      </div>
    </div>`;

  const page = conteneur.querySelector('.page');
  brancherSegmentes(page);

  // ---- Enregistrement ------------------------------------------------------------------
  /** Enregistre des paramètres modifiés, tout le reste repris à l'identique. */
  async function enregistrer(modification) {
    const reponse = await api.enregistrerParametres({ ...p(), ...modification });
    definirParametres(reponse.parametres);
    return reponse.parametres;
  }

  /** « Enregistré » s'affiche un instant à côté du réglage qu'on vient de changer. */
  function enregistre(controle) {
    const option = controle.closest('.option, .option-champ');
    if (!option) { annoncer('Enregistré'); return; }
    option.querySelector('.enregistre')?.remove();
    const pastille = document.createElement('span');
    pastille.className = 'enregistre';
    pastille.innerHTML = `${icone('coche', { taille: 14, classe: 'trace-coche' })}Enregistré`;
    // Ligne d'option : juste à gauche du réglage, dans la place que la grille
    // lui garde (voir `.option` dans style.css).
    if (option.classList.contains('option')) pastille.style.right = `${controle.offsetWidth + 12}px`;
    option.append(pastille);
    annoncer('Enregistré');
    setTimeout(() => {
      pastille.classList.add('part');
      setTimeout(() => pastille.remove(), 300);
    }, 1600);
  }

  /** Un réglage qui n'a pas pu être enregistré le dit à sa place, et l'écran revient en arrière. */
  function echec(controle, erreur) {
    const option = controle.closest('.option, .option-champ, .carte-corps');
    const zone = option?.closest('.carte')?.querySelector('.carte-corps') ?? page;
    bandeauRetour(zone, erreur.message, null, { erreur: true, duree: 6000 });
  }

  // ---- Sommaire : suit la section lue ------------------------------------------------------
  const liens = [...page.querySelectorAll('.sommaire a')];
  const marquer = (id) => liens.forEach((a) => a.classList.toggle('actif', a.dataset.section === id));
  const observateur = new IntersectionObserver((entrees) => {
    if (!page.isConnected) { observateur.disconnect(); return; }
    entrees.filter((e) => e.isIntersecting).forEach((e) => marquer(e.target.id.slice(2)));
  }, { rootMargin: '-20% 0px -70% 0px' });
  page.querySelectorAll('.section-param').forEach((s) => observateur.observe(s));
  const allerA = (id, doux = true) => {
    page.querySelector(`#s-${id}`)?.scrollIntoView({ behavior: doux && !mouvementReduit() ? 'smooth' : 'auto', block: 'start' });
    marquer(id);
  };
  liens.forEach((a) => a.addEventListener('click', (evenement) => {
    evenement.preventDefault();
    allerA(a.dataset.section);
  }));
  // Arrivée depuis un lien « Modifier » (écran URSSAF, tableau de bord).
  const demandee = params?.get('section');
  if (demandee) requestAnimationFrame(() => allerA(demandee, false));

  // ---- Identité ---------------------------------------------------------------------------
  const zoneIdentite = page.querySelector('#zone-identite');
  const boutonModifier = page.querySelector('#modifier-identite');

  function brancherFormulaireIdentite() {
    const form = zoneIdentite.querySelector('form');
    const fermer = () => {
      zoneIdentite.innerHTML = identiteLue();
      boutonModifier.hidden = false;
      boutonModifier.focus();
    };
    form.querySelector('#p-annuler')?.addEventListener('click', fermer);
    form.addEventListener('submit', async (evenement) => {
      evenement.preventDefault();
      effacerErreursFormulaire(form);
      form.querySelector('[data-erreur-panneau]').innerHTML = '';
      const saisie = Object.fromEntries(CHAMPS_IDENTITE.map(([nom]) => [nom, form[nom].value]));
      const bouton = form.querySelector('[type="submit"]');
      bouton.disabled = true;
      try {
        // Seule exception au « tout le reste à l'identique », voulue :
        // renseigner sa propre entreprise sort du mode démonstration.
        await enregistrer({ ...saisie, jeuDemo: false });
        // Fin de la première mise en route : la carte de bienvenue disparaît.
        etat.systeme.premierLancement = false;
        page.querySelector('#carte-bienvenue')?.remove();
        fermer();
        reussite(boutonModifier, 'Enregistré');
      } catch (erreur) {
        bouton.disabled = false;
        if (erreur.erreurs) afficherErreursFormulaire(form, erreur.erreurs);
        else form.querySelector('[data-erreur-panneau]').innerHTML = `${icone('cercle-alerte', { taille: 16 })}<span>${echapperHtml(erreur.message)}</span>`;
      }
    });
  }
  if (identiteVide) brancherFormulaireIdentite();
  boutonModifier.addEventListener('click', () => {
    zoneIdentite.innerHTML = identiteFormulaire();
    boutonModifier.hidden = true;
    brancherFormulaireIdentite();
    zoneIdentite.querySelector('#p-prenom').focus();
  });

  // ---- Régime : ce qui dépend du type d'activité ---------------------------------------------
  // La nature des prestations ne se pose que pour une activité mixte ; le
  // versement libératoire suppose une activité connue ; l'activité artisanale
  // ne concerne que le commercial, jamais le libéral seul.
  const majRegime = () => {
    const type = p().typeActivite;
    page.querySelector('#champ-nature').hidden = type !== 'mixte';
    page.querySelector('#option-versementLiberatoire').hidden = type === '';
    page.querySelector('#option-activiteArtisanale').hidden = !['ventes', 'prestations', 'mixte'].includes(type);
    page.querySelector('#option-acre').hidden = type === '';
    majAcre();
  };

  // ---- ACRE : la date de début d'activité, et ce qu'elle implique -----------------------------
  const detailAcre = page.querySelector('#detail-acre');
  const noteAcre = page.querySelector('#fin-acre');
  function majAcre() {
    detailAcre.hidden = !p().acre || p().typeActivite === '';
    const periode = periodeAcre(p());
    if (!p().debutActivite) {
      noteAcre.textContent = 'Indiquez votre date de début d’activité : la fin de l’ACRE et le taux réduit en dépendent.';
    } else if (!periode) {
      noteAcre.textContent = 'Cette date précède les règles de l’ACRE connues de l’application : le taux normal est appliqué.';
    } else {
      const fin = dateEnFrancaisLong(periode.fin);
      noteAcre.textContent = periode.fin < aujourdHuiIso()
        ? `Votre ACRE a pris fin le ${fin} : vos encaissements suivants cotisent au taux normal.`
        : `Cotisations sociales à ${periode.fraction} % du taux normal jusqu’au ${fin}. La formation professionnelle et le versement libératoire restent dus en entier.`;
    }
  }
  const champDebut = detailAcre.querySelector('.champ-date');
  champDebut.querySelector('input[type="hidden"]').value = p().debutActivite;
  brancherChampDate(champDebut, {
    format: p().formatDate,
    surChangement: async (iso) => {
      const saisie = champDebut.querySelector('.champ-texte');
      try {
        await enregistrer({ debutActivite: iso });
        enregistre(saisie);
        majAcre();
      } catch (erreur) {
        echec(saisie, erreur);
      }
    }
  });
  majRegime();

  // Listes déroulantes enregistrées dès qu'on les change.
  for (const cle of ['typeActivite', 'naturePrestations', 'devise', 'formatDate']) {
    const select = page.querySelector(`#p-${cle}`);
    select.addEventListener('change', async () => {
      const avant = p()[cle];
      try {
        await enregistrer({ [cle]: select.value });
        enregistre(select);
        if (cle === 'typeActivite') majRegime();
      } catch (erreur) {
        select.value = avant;
        echec(select, erreur);
      }
    });
  }

  // ---- Modes de règlement ----------------------------------------------------------------------
  const listeModes = page.querySelector('#liste-modes');
  const erreurModes = page.querySelector('#erreur-modes');

  /** Relit la liste affichée et l'enregistre ; en cas de refus, la liste revient à l'état enregistré. */
  async function enregistrerModes(controle) {
    const modes = [...listeModes.querySelectorAll('.ligne-gestion')]
      .map((ligne) => ({ code: ligne.dataset.code, libelle: ligne.querySelector('input').value.trim() }))
      .filter((m) => m.libelle);
    erreurModes.innerHTML = '';
    try {
      const enregistres = await enregistrer({ modesPersonnalises: modes });
      listeModes.innerHTML = enregistres.modesPersonnalises.map(ligneMode).join('');
      if (controle) annoncer('Enregistré');
      return true;
    } catch (erreur) {
      const message = erreur.erreurs?.modesPersonnalises ?? Object.values(erreur.erreurs ?? {})[0] ?? erreur.message;
      erreurModes.innerHTML = `${icone('cercle-alerte', { taille: 15 })}<span>${echapperHtml(message)}</span>`;
      listeModes.innerHTML = p().modesPersonnalises.map(ligneMode).join('');
      return false;
    }
  }

  listeModes.addEventListener('change', (evenement) => {
    if (evenement.target.matches('input')) enregistrerModes(evenement.target);
  });
  listeModes.addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('[data-supprimer-mode]');
    if (!bouton || bouton.disabled) return;
    const ligne = bouton.closest('.ligne-gestion');
    const avant = p().modesPersonnalises;
    const nom = ligne.querySelector('input').value || 'Mode sans nom';
    // La ligne se replie d'abord : les suivantes remontent en douceur.
    bouton.disabled = true;
    await replierPuisRetirer(ligne);
    if (!ligne.dataset.code) return; // jamais enregistré : rien d'autre à faire
    if (await enregistrerModes()) {
      bandeauRetour(listeModes, `« ${nom} » supprimé`, async () => {
        try {
          const enregistres = await enregistrer({ modesPersonnalises: avant });
          // Les lignes sont refaites sans toucher au retour, qui se replie ;
          // celle qui revient se déplie à sa place.
          const presents = new Set([...listeModes.querySelectorAll('.ligne-gestion')].map((l) => l.dataset.code));
          listeModes.querySelectorAll('.ligne-gestion').forEach((l) => l.remove());
          listeModes.insertAdjacentHTML('beforeend', enregistres.modesPersonnalises.map(ligneMode).join(''));
          listeModes.querySelectorAll('.ligne-gestion').forEach((l) => { if (!presents.has(l.dataset.code)) deplierHauteur(l); });
        } catch (erreur) {
          toast(erreur.message, 'erreur');
        }
      });
    }
  });
  page.querySelector('#ajouter-mode').addEventListener('click', () => {
    listeModes.insertAdjacentHTML('beforeend', ligneMode());
    listeModes.lastElementChild.querySelector('input').focus();
  });

  // ---- Numéros de facture ignorés -----------------------------------------------------------------
  const zoneIgnores = page.querySelector('#numeros-ignores');
  /**
   * La liste des numéros ignorés. Refaite sans toucher au retour posé dans la
   * même zone ; `deplier` la fait revenir en douceur (annulation).
   */
  function rendreNumerosIgnores({ deplier = false } = {}) {
    const numeros = p().numerosIgnores ?? [];
    zoneIgnores.querySelector(':scope > .numeros-ignores')?.remove();
    if (numeros.length === 0) return;
    zoneIgnores.insertAdjacentHTML('beforeend', `<div class="numeros-ignores">
        <span>${numeros.length > 1 ? 'Numéros de facture' : 'Numéro de facture'} que vous avez choisi de ne plus signaler :
        <span class="ref">${numeros.map(echapperHtml).join(', ')}</span></span>
        <button type="button" class="btn btn-petit" id="reafficher-numeros">${icone('restaurer', { taille: 15 })}Les signaler de nouveau</button>
      </div>`);
    const boite = zoneIgnores.lastElementChild;
    if (deplier) deplierHauteur(boite);
    boite.querySelector('#reafficher-numeros').addEventListener('click', async (evenement) => {
      const bouton = evenement.currentTarget;
      const avant = p().numerosIgnores;
      try {
        await enregistrer({ numerosIgnores: [] });
        // La liste se replie pendant que le retour se déplie.
        replierPuisRetirer(boite);
        bandeauRetour(zoneIgnores, 'Ces numéros seront de nouveau signalés', async () => {
          await enregistrer({ numerosIgnores: avant }).catch((erreur) => toast(erreur.message, 'erreur'));
          rendreNumerosIgnores({ deplier: true });
        });
      } catch (erreur) {
        // `currentTarget` ne vaut plus rien après l'attente : le bouton a été retenu avant.
        echec(bouton, erreur);
      }
    });
  }
  rendreNumerosIgnores();

  // ---- Clics : interrupteurs, rythme, thème, copies, téléchargements ------------------------------
  page.addEventListener('click', async (evenement) => {
    const inter = evenement.target.closest('.interrupteur');
    if (inter) {
      const actif = inter.getAttribute('aria-checked') !== 'true';
      const cle = inter.id.replace(/^[po]-/, '');
      inter.setAttribute('aria-checked', String(actif));
      try {
        await enregistrer({ [cle]: actif });
        enregistre(inter);
        if (cle === 'acre') majAcre();
      } catch (erreur) {
        inter.setAttribute('aria-checked', String(!actif));
        echec(inter, erreur);
      }
      return;
    }

    const periodicite = evenement.target.closest('[data-periodicite]');
    if (periodicite && periodicite.getAttribute('aria-pressed') !== 'true') {
      const groupe = periodicite.closest('.segmente');
      const boutons = groupe.querySelectorAll('[data-periodicite]');
      const avant = p().periodiciteUrssaf;
      boutons.forEach((b) => b.setAttribute('aria-pressed', String(b === periodicite)));
      try {
        await enregistrer({ periodiciteUrssaf: periodicite.dataset.periodicite });
        enregistre(groupe);
      } catch (erreur) {
        boutons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.periodicite === avant)));
        echec(groupe, erreur);
      }
      return;
    }

    const theme = evenement.target.closest('[data-theme-choix]');
    if (theme && theme.getAttribute('aria-pressed') !== 'true') {
      page.querySelectorAll('[data-theme-choix]').forEach((b) => b.setAttribute('aria-pressed', String(b === theme)));
      basculerTheme(theme);
      return;
    }

    const copie = evenement.target.closest('[data-copier]');
    if (copie) {
      copierDansPressePapiers(copie.dataset.copier, copie);
      return;
    }

    const telecharger = evenement.target.closest('[data-telecharger]');
    if (telecharger && !telecharger.disabled) {
      const reprendre = patienter(telecharger, 'Préparation…');
      try {
        await telechargerFichier(telecharger.dataset.telecharger);
        reprendre();
        reussite(telecharger, 'Copie téléchargée', { nomIcone: 'fichier-valide', duree: 2200 });
      } catch (erreur) {
        reprendre();
        reussite(telecharger, 'Échec', { nomIcone: 'cercle-alerte', duree: 2600, echec: true });
        annoncer(erreur.message);
      }
    }
  });

  // ---- Première utilisation : accueil guidé ou jeu de démonstration --------------------------------
  page.querySelector('#reprendre-accueil')?.addEventListener('click', () => window.dispatchEvent(new Event('ouvrir-accueil')));
  page.querySelector('#charger-demo')?.addEventListener('click', async (evenement) => {
    const bouton = evenement.currentTarget;
    const reprendre = patienter(bouton, 'Chargement…');
    try {
      await api.chargerDemo();
      window.location.hash = '#/';
      window.location.reload();
    } catch (erreur) {
      reprendre();
      toast(erreur.message, 'erreur');
    }
  });

  // ---- Sauvegardes : chaque restauration demande confirmation (voir `sauvegardes.js`) --------------
  brancherRestauration(page.querySelector('#liste-sauvegardes'));
}
