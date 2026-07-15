/**
 * Lecture des fichiers CSV côté navigateur (pour l'import).
 *
 * - détection automatique du séparateur (`;`, `,` ou tabulation) ;
 * - gestion des champs entre guillemets (avec `""` échappé) ;
 * - décodage UTF-8, avec repli automatique en Windows-1252 pour les
 *   fichiers exportés par de vieux tableurs.
 */

const DELIMITEURS = [';', ',', '\t'];

/** Détecte le séparateur le plus fréquent sur la première ligne. */
function detecterDelimiteur(contenu) {
  const finLigne = contenu.indexOf('\n');
  const premiereLigne = finLigne === -1 ? contenu : contenu.slice(0, finLigne);
  let meilleur = ';';
  let meilleurCompte = 0;
  for (const delimiteur of DELIMITEURS) {
    const compte = premiereLigne.split(delimiteur).length - 1;
    if (compte > meilleurCompte) {
      meilleur = delimiteur;
      meilleurCompte = compte;
    }
  }
  return meilleur;
}

/**
 * Analyse un texte CSV.
 * @returns {{ entetes: string[], lignes: string[][], delimiteur: string }}
 */
export function analyserCsv(texte) {
  const contenu = texte.replace(/^﻿/, '');
  const delimiteur = detecterDelimiteur(contenu);

  const lignes = [];
  let ligne = [];
  let champ = '';
  let entreGuillemets = false;

  for (let i = 0; i < contenu.length; i += 1) {
    const caractere = contenu[i];

    if (entreGuillemets) {
      if (caractere === '"') {
        if (contenu[i + 1] === '"') {
          champ += '"';
          i += 1;
        } else {
          entreGuillemets = false;
        }
      } else {
        champ += caractere;
      }
    } else if (caractere === '"') {
      entreGuillemets = true;
    } else if (caractere === delimiteur) {
      ligne.push(champ);
      champ = '';
    } else if (caractere === '\n' || caractere === '\r') {
      if (caractere === '\r' && contenu[i + 1] === '\n') i += 1;
      ligne.push(champ);
      champ = '';
      if (ligne.length > 1 || ligne[0].trim() !== '') lignes.push(ligne);
      ligne = [];
    } else {
      champ += caractere;
    }
  }
  if (champ !== '' || ligne.length > 0) {
    ligne.push(champ);
    if (ligne.length > 1 || ligne[0].trim() !== '') lignes.push(ligne);
  }

  return {
    entetes: (lignes[0] ?? []).map((e) => e.trim()),
    lignes: lignes.slice(1),
    delimiteur
  };
}

/** Lit un fichier CSV en texte, avec détection d'encodage basique. */
export async function lireFichierCsv(fichier) {
  const tampon = await fichier.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(tampon);
  // U+FFFD signale des octets invalides en UTF-8 : le fichier vient
  // probablement d'un tableur configuré en Windows-1252.
  if (utf8.includes('�')) {
    return new TextDecoder('windows-1252').decode(tampon);
  }
  return utf8;
}
