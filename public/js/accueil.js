/**
 * Accueil guidé du premier lancement : quatre questions (vous, votre
 * entreprise, votre activité, vos déclarations), puis « C'est prêt ». Il
 * remplace, pour une première mise en route, la recherche des bons réglages
 * dans les Paramètres.
 *
 * Chaque étape s'enregistre en passant à la suivante : interrompu, l'accueil
 * reprend au lancement suivant, avec ce qui a déjà été saisi. Rien n'est
 * obligatoire : « Continuer » passe même un champ vide, et « Configurer plus
 * tard » le referme pour de bon (les Paramètres permettent de le relancer).
 */

import { api } from './api.js';
import { etat, definirParametres } from './etat.js';
import {
  echapperHtml, mouvementReduit, interrupteur, resultatSiret, afficherErreursFormulaire,
  effacerErreursFormulaire, toast
} from './ui.js';
import { halo, annoncer, patienter } from './retours.js';
import { icone } from './icones.js';
import { NATURES_PRESTATIONS, libelleActivite } from '/partage/seuils.js';
import { majusculeInitiale } from '/partage/texte.js';
import { dernierePeriodeEchue, periodeDepuisId, echeanceDeclaration, aujourdHuiIso } from '/partage/dates.js';

const ETAPES = ['Vous', 'Votre entreprise', 'Votre activité', 'Vos déclarations', 'C’est prêt'];
const DERNIERE = ETAPES.length - 1;

const ACTIVITES = [
  { code: 'prestations', icone: 'outil', titre: 'Prestations de services commerciales ou artisanales', texte: 'Dépannage, travaux, transport, coiffure… (BIC)' },
  { code: 'ventes', icone: 'colis', titre: 'Ventes de marchandises', texte: 'Achat-revente, vente de vos fabrications, restauration, hébergement (BIC)' },
  { code: 'liberal', icone: 'mallette', titre: 'Autres prestations de services : activité libérale', texte: 'Conseil, formation, informatique, graphisme, rédaction… (BNC)' },
  { code: 'liberalCipav', icone: 'mallette', titre: 'Profession libérale relevant de la Cipav', texte: 'Architecte, psychologue, ostéopathe, diététicien… (BNC)' },
  { code: 'mixte', icone: 'calques', titre: 'Les deux : ventes et prestations', texte: 'Chaque recette sera classée en vente ou en prestation.' }
];

const RYTHMES = [
  { code: 'mois', icone: 'calendrier', titre: 'Chaque mois', texte: 'Avant la fin du mois suivant.' },
  { code: 'trimestre', icone: 'echeance', titre: 'Chaque trimestre', texte: 'Avant le 30 avril, le 31 juillet, le 31 octobre et le 31 janvier.' }
];

const attendre = (ms) => new Promise((fin) => { setTimeout(fin, ms); });

/**
 * Ouvre l'accueil par-dessus l'application, qui reste inerte derrière.
 *
 * @param {object} options
 * @param {(route: string) => Promise<void>} options.fermer relit l'état et
 *   affiche la page `route` (« recettes?nouvelle=1 », « » pour le tableau de
 *   bord) : l'accueil s'efface ensuite pour la découvrir.
 */
export function lancerAccueil({ fermer }) {
  const saisie = { ...etat.parametres };
  let indice = 0;
  const prenom = () => majusculeInitiale(String(saisie.prenom ?? '').trim());

  const racine = document.createElement('div');
  racine.className = 'accueil';
  racine.innerHTML = `
    <aside class="accueil-cote">
      <div class="accueil-marque"><span class="marque-logo">${icone('livre', { taille: 20 })}</span>Livre des recettes</div>
      <ol class="accueil-etapes">${ETAPES.map((titre, i) => `<li data-etape="${i}">
          <span class="accueil-repere"><span class="numero">${i + 1}</span>${icone('coche', { taille: 14, classe: 'trace-coche' })}</span>${titre}</li>`).join('')}</ol>
      <p class="accueil-note">100 % local : vos données restent sur cet ordinateur.</p>
    </aside>
    <section class="accueil-scene" aria-labelledby="titre-etape">
      <button type="button" class="btn btn-fantome btn-petit accueil-plus-tard" data-plus-tard>Configurer plus tard</button>
      <form class="accueil-etape" novalidate></form>
    </section>`;
  document.body.append(racine);
  const coque = document.querySelector('.coque');
  coque.inert = true;
  const formulaire = racine.querySelector('.accueil-etape');
  const listeEtapes = racine.querySelector('.accueil-etapes');

  // ---- Gabarits -----------------------------------------------------------------------------

  const surtitre = (i) => `<p class="etape-surtitre">Étape ${i + 1} sur ${DERNIERE}</p>`;

  const champ = (nom, libelle, { exemple = '', aide = '', attributs = '' } = {}) => `
    <div class="champ" data-champ="${nom}">
      <label for="a-${nom}">${libelle}</label>
      <input class="champ-texte" id="a-${nom}" name="${nom}" value="${echapperHtml(saisie[nom] ?? '')}"
        ${exemple ? `placeholder="${echapperHtml(exemple)}"` : ''} ${attributs || 'autocomplete="off"'}>
      ${aide ? `<span class="aide-champ">${aide}</span>` : ''}
      <span class="erreur-champ message-erreur"></span>
    </div>`;

  /** Choix exclusifs présentés en cartes : de vrais boutons radio, flèches du clavier comprises. */
  const cartes = (nom, options, choisi, { classe = '', etiquette = 'titre-etape' } = {}) => `
    <div class="choix-cartes ${classe}" role="radiogroup" aria-labelledby="${etiquette}">
      ${options.map((o) => `<label class="choix-carte">
          <input type="radio" class="hors-ecran" name="${nom}" value="${o.code}" ${o.code === choisi ? 'checked' : ''}>
          ${o.icone ? `<span class="choix-icone">${icone(o.icone, { taille: 18 })}</span>` : ''}
          <span class="choix-texte"><strong>${o.titre}</strong>${o.texte ? `<span>${o.texte}</span>` : ''}</span>
          <span class="choix-coche">${icone('coche', { taille: 14 })}</span>
        </label>`).join('')}
    </div>`;

  const actions = (i) => `<div class="etape-actions">
      ${i > 0 ? `<button type="button" class="btn btn-fantome" data-retour>${icone('chevron-gauche', { taille: 16 })}Retour</button>` : ''}
      <button type="submit" class="btn btn-principal">Continuer${icone('fleche-droite', { taille: 16 })}</button>
    </div>`;

  const GABARITS = [
    () => `${surtitre(0)}
      <h1 id="titre-etape" tabindex="-1">Bienvenue<span class="nom-accueil">${prenom() ? ` ${echapperHtml(prenom())}` : ''}</span></h1>
      <p class="etape-intro">Quelques questions, deux minutes, et votre livre des recettes est prêt. Tout reste sur cet ordinateur.</p>
      ${champ('prenom', 'Comment vous appelez-vous ?', {
        exemple: 'Votre prénom', aide: 'Pour vous accueillir à chaque ouverture.', attributs: 'maxlength="40" autocomplete="given-name"'
      })}
      ${actions(0)}
      <p class="etape-autre">Vous souhaitez d’abord voir l’application à l’œuvre ?
        <button type="button" class="lien-bouton" data-demo>Découvrir avec un jeu de démonstration</button></p>`,

    () => `${surtitre(1)}
      <h1 id="titre-etape" tabindex="-1">Votre entreprise</h1>
      <p class="etape-intro">Ces informations figurent en tête de vos exports : livre des recettes, registre des achats, rapport annuel.</p>
      <div class="champ" data-champ="siret">
        <label for="a-siret">SIRET</label>
        <div class="ligne-siret">
          <input class="champ-texte" id="a-siret" name="siret" inputmode="numeric" autocomplete="off" placeholder="14 chiffres"
            value="${echapperHtml(saisie.siret || saisie.siren || '')}">
          <button type="button" class="btn" data-chercher>${icone('recherche', { taille: 16 })}Retrouver mon entreprise</button>
        </div>
        <p class="aide-champ" id="a-resultat" aria-live="polite">Le nom est repris de l’annuaire officiel des entreprises.</p>
        <span class="erreur-champ message-erreur"></span>
      </div>
      ${champ('nomEntreprise', 'Nom de l’entreprise', { exemple: 'Tel qu’il figure sur votre avis de situation' })}
      ${champ('activite', 'Activité', { exemple: 'Ex. : création de sites web' })}
      ${champ('adresse', 'Adresse', { exemple: 'Ex. : 12 rue des Lilas, 69003 Lyon', attributs: 'autocomplete="street-address"' })}
      ${actions(1)}`,

    () => `${surtitre(2)}
      <h1 id="titre-etape" tabindex="-1">Votre activité</h1>
      <p class="etape-intro">Elle fixe vos plafonds, votre seuil de TVA et le taux de vos cotisations.</p>
      ${cartes('typeActivite', ACTIVITES, saisie.typeActivite)}
      <div class="nature-prestations" ${saisie.typeActivite === 'mixte' ? '' : 'hidden'}>
        <p class="etiquette-champ" id="a-nature">De quelle nature sont vos prestations ?</p>
        ${cartes('naturePrestations', NATURES_PRESTATIONS.map((n) => ({ code: n.code, titre: n.libelle })), saisie.naturePrestations, { classe: 'compactes', etiquette: 'a-nature' })}
      </div>
      ${actions(2)}`,

    () => `${surtitre(3)}
      <h1 id="titre-etape" tabindex="-1">Vos déclarations URSSAF</h1>
      <p class="etape-intro">Le tableau de bord vous rappellera chaque échéance, avec le montant à déclarer.</p>
      <p class="etiquette-champ" id="a-rythme">À quel rythme déclarez-vous votre chiffre d’affaires ?</p>
      ${cartes('periodiciteUrssaf', RYTHMES, saisie.periodiciteUrssaf, { classe: 'deux', etiquette: 'a-rythme' })}
      <div class="option-accueil">
        <div><strong>Versement libératoire de l’impôt sur le revenu</strong>
          <span>Votre impôt sur le revenu est payé avec vos cotisations, en pourcentage du chiffre d’affaires.</span></div>
        ${interrupteur('a-versementLiberatoire', saisie.versementLiberatoire, 'Versement libératoire de l’impôt sur le revenu')}
      </div>
      <p class="aide-champ">Deux choix faits à votre immatriculation ; votre espace URSSAF les rappelle.</p>
      ${actions(3)}`,

    () => {
      const manque = '<em>à préciser dans les Paramètres</em>';
      const rythme = { mois: 'Mensuelle', trimestre: 'Trimestrielle' }[saisie.periodiciteUrssaf];
      return `
        <span class="sceau-reussite">${icone('coche', { taille: 30, classe: 'trace-coche' })}</span>
        <h1 id="titre-etape" tabindex="-1">Tout est prêt${prenom() ? ` ${echapperHtml(prenom())}` : ''}</h1>
        <p class="etape-intro">Votre livre des recettes vous attend. Tout se modifie ensuite dans les Paramètres.</p>
        <ul class="recapitulatif">
          <li>${icone('entreprise', { taille: 17 })}<span>Entreprise</span><strong>${saisie.nomEntreprise ? echapperHtml(saisie.nomEntreprise) : manque}</strong></li>
          <li>${icone('mallette', { taille: 17 })}<span>Activité</span><strong>${echapperHtml(libelleActivite(saisie) ?? '') || manque}</strong></li>
          <li>${icone('urssaf', { taille: 17 })}<span>Déclaration</span><strong>${rythme ? `${rythme}${saisie.versementLiberatoire ? ', avec versement libératoire' : ''}` : manque}</strong></li>
        </ul>
        <div class="etape-actions">
          <button type="button" class="btn" data-aller="import">${icone('import', { taille: 16 })}Importer un historique</button>
          <button type="button" class="btn btn-principal" data-aller="recettes?nouvelle=1">${icone('plus', { taille: 16 })}Ajouter ma première recette</button>
        </div>
        <p class="etape-autre"><button type="button" class="lien-bouton" data-aller="">Découvrir le tableau de bord</button></p>`;
    }
  ];

  // ---- Lecture d'une étape ------------------------------------------------------------------

  const coche = (nom) => formulaire.querySelector(`input[name="${nom}"]:checked`)?.value;

  /** Valeurs de l'étape affichée ; `null` si une saisie est à reprendre. */
  function lireEtape() {
    const f = formulaire.elements;
    if (indice === 0) return { prenom: f.prenom.value.trim() };
    if (indice === 1) {
      const chiffres = f.siret.value.replace(/\s/g, '');
      if (chiffres && !/^\d{9}$|^\d{14}$/.test(chiffres)) {
        afficherErreursFormulaire(formulaire, { siret: 'Un SIRET compte 14 chiffres (un SIREN, 9).' });
        return null;
      }
      return {
        siren: chiffres.slice(0, 9),
        siret: chiffres.length === 14 ? chiffres : '',
        nomEntreprise: f.nomEntreprise.value.trim(),
        activite: f.activite.value.trim(),
        adresse: f.adresse.value.trim()
      };
    }
    if (indice === 2) {
      return { typeActivite: coche('typeActivite') ?? '', naturePrestations: coche('naturePrestations') ?? saisie.naturePrestations };
    }
    if (indice === 3) {
      const periodiciteUrssaf = coche('periodiciteUrssaf') ?? '';
      return {
        periodiciteUrssaf,
        versementLiberatoire: formulaire.querySelector('#a-versementLiberatoire').getAttribute('aria-checked') === 'true',
        ...dejaReglee(periodiciteUrssaf)
      };
    }
    return {};
  }

  /**
   * Première mise en route : une période dont l'échéance était passée avant
   * l'installation a été déclarée (ou non) hors de l'application, qui n'en
   * sait rien. Le tableau de bord ne s'ouvre donc pas sur un « En retard » :
   * elle est tenue pour réglée. Une échéance encore à venir, elle, est
   * rappelée.
   */
  function dejaReglee(periodicite) {
    if (!periodicite || saisie.dernierePeriodeDeclaree) return {};
    const { id } = dernierePeriodeEchue(periodicite);
    const { annee, type, valeur } = periodeDepuisId(id);
    return aujourdHuiIso() > echeanceDeclaration(annee, type, valeur) ? { dernierePeriodeDeclaree: id } : {};
  }

  // ---- Affichage d'une étape ----------------------------------------------------------------

  function majEtapes() {
    const fini = indice === DERNIERE;
    listeEtapes.querySelectorAll('li').forEach((li, i) => {
      // Arrivé au bout, tout est coché, « C'est prêt » compris.
      li.classList.toggle('faite', i < indice || fini);
      li.classList.toggle('courante', i === indice);
      if (i === indice) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    listeEtapes.style.setProperty('--avance', String(indice / DERNIERE));
    racine.querySelector('[data-plus-tard]').hidden = fini;
  }

  /** Passe à l'étape `i` : l'actuelle glisse dans le sens de la marche et s'efface, la suivante arrive. */
  async function montrer(i, sens = 1) {
    const premiere = !formulaire.hasChildNodes();
    indice = i;
    majEtapes();
    if (!premiere && !mouvementReduit()) {
      formulaire.dataset.sens = sens > 0 ? 'avant' : 'arriere';
      formulaire.classList.add('part');
      await attendre(170);
    }
    formulaire.innerHTML = GABARITS[i]();
    [...formulaire.children].forEach((element, rang) => element.style.setProperty('--i', rang));
    formulaire.classList.remove('part', 'entre');
    void formulaire.offsetWidth;
    formulaire.classList.add('entre');
    brancher();
    if (i === 0) formulaire.elements.prenom.focus();
    else formulaire.querySelector('#titre-etape').focus({ preventScroll: true });
    annoncer(`${ETAPES[i]}${i < DERNIERE ? `, étape ${i + 1} sur ${DERNIERE}` : ''}`);
    if (i === DERNIERE) setTimeout(() => halo(formulaire.querySelector('.sceau-reussite')), mouvementReduit() ? 0 : 450);
  }

  function brancher() {
    // Le prénom s'inscrit dans le titre à mesure qu'on le tape.
    formulaire.elements.prenom?.addEventListener('input', (evenement) => {
      const nom = majusculeInitiale(evenement.target.value.trim());
      const cible = formulaire.querySelector('.nom-accueil');
      cible.textContent = nom ? ` ${nom}` : '';
      cible.classList.remove('arrive');
      void cible.offsetWidth;
      cible.classList.add('arrive');
    });
    // Activité mixte : la nature des prestations se déplie.
    formulaire.querySelectorAll('input[name="typeActivite"]').forEach((radio) => radio.addEventListener('change', () => {
      const nature = formulaire.querySelector('.nature-prestations');
      const mixte = coche('typeActivite') === 'mixte';
      if (mixte && nature.hidden) {
        nature.hidden = false;
        nature.classList.remove('deplie');
        void nature.offsetWidth;
        nature.classList.add('deplie');
      } else if (!mixte) {
        nature.hidden = true;
      }
    }));
  }

  // ---- Enregistrement et sortie -------------------------------------------------------------

  async function enregistrer(valeurs) {
    const { parametres } = await api.enregistrerParametres({ ...etat.parametres, ...valeurs });
    definirParametres(parametres);
    Object.assign(saisie, parametres);
  }

  /** Referme l'accueil sur la page `route`, une fois celle-ci dessinée derrière lui. */
  async function sortir(route) {
    await fermer(route);
    coque.inert = false;
    racine.classList.add('ferme');
    setTimeout(() => racine.remove(), mouvementReduit() ? 0 : 360);
  }

  async function terminer(route) {
    try {
      if (etat.parametres.accueil !== 'termine') await enregistrer({ accueil: 'termine' });
      await sortir(route);
    } catch (erreur) {
      toast(erreur.message, 'erreur');
    }
  }

  formulaire.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    if (indice >= DERNIERE) return;
    effacerErreursFormulaire(formulaire);
    const valeurs = lireEtape();
    if (!valeurs) return;
    const bouton = formulaire.querySelector('[type="submit"]');
    bouton.disabled = true;
    try {
      // Arrivé au bout des questions, l'accueil est fait : il ne reviendra pas.
      await enregistrer({ ...valeurs, accueil: indice + 1 === DERNIERE ? 'termine' : 'en-cours' });
      await montrer(indice + 1, 1);
    } catch (erreur) {
      bouton.disabled = false;
      if (!erreur.erreurs) {
        toast(erreur.message, 'erreur');
        return;
      }
      // Le SIREN se saisit dans le champ SIRET : son erreur s'y affiche.
      const { siren, ...autres } = erreur.erreurs;
      afficherErreursFormulaire(formulaire, siren && !autres.siret ? { ...autres, siret: siren } : autres);
    }
  });

  racine.addEventListener('click', async (evenement) => {
    const cible = evenement.target;
    if (cible.closest('[data-retour]')) {
      Object.assign(saisie, lireEtape() ?? {});
      montrer(indice - 1, -1);
      return;
    }
    if (cible.closest('[data-plus-tard]')) {
      terminer('');
      return;
    }
    const aller = cible.closest('[data-aller]');
    if (aller) {
      terminer(aller.dataset.aller);
      return;
    }
    const inter = cible.closest('.interrupteur');
    if (inter) {
      inter.setAttribute('aria-checked', String(inter.getAttribute('aria-checked') !== 'true'));
      return;
    }
    const chercher = cible.closest('[data-chercher]');
    if (chercher) {
      const chiffres = formulaire.elements.siret.value.replace(/\s/g, '');
      const zone = formulaire.querySelector('#a-resultat');
      if (!/^\d{9}$|^\d{14}$/.test(chiffres)) {
        resultatSiret(zone, { erreur: 'Un SIRET compte 14 chiffres (un SIREN, 9).' });
        return;
      }
      chercher.disabled = true;
      resultatSiret(zone);
      try {
        const { entreprise } = await api.rechercherSiret(chiffres);
        formulaire.elements.nomEntreprise.value = entreprise.nom;
        if (entreprise.siret) formulaire.elements.siret.value = entreprise.siret;
        resultatSiret(zone, { nom: entreprise.nom });
      } catch (erreur) {
        resultatSiret(zone, { erreur: erreur.message });
      } finally {
        chercher.disabled = false;
      }
      return;
    }
    const demo = cible.closest('[data-demo]');
    if (demo) {
      // Le jeu de démonstration remplace les paramètres : le prénom tapé est
      // reporté dessus, et l'accueil marqué fait.
      const reprendre = patienter(demo, 'Chargement…');
      try {
        const prenomSaisi = formulaire.elements.prenom?.value.trim() ?? '';
        await api.chargerDemo();
        const { parametres } = await api.obtenirParametres();
        definirParametres(parametres);
        await enregistrer({ prenom: prenomSaisi, accueil: 'termine' });
        await sortir('');
      } catch (erreur) {
        reprendre();
        toast(erreur.message, 'erreur');
      }
    }
  });

  montrer(0);
}
