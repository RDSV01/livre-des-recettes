/**
 * Salutation du tableau de bord : « Bonjour » ou « Bonsoir » selon l'heure
 * (« Bon après-midi » ou « Bon dimanche » se disent plutôt en partant),
 * suivie d'une phrase propre au moment et au jour de la semaine, sur un ton
 * neutre.
 *
 * Les phrases n'affirment rien de l'état des comptes (« tout est à jour ») :
 * l'application ne sait pas si tout est saisi. Quand une déclaration URSSAF
 * est à faire, le tableau de bord passe à la place un rappel (`rappel`).
 *
 * Module pur, partagé : testé côté serveur, servi tel quel au navigateur.
 */

import { majusculeInitiale } from "./texte.js";
import { nomMois } from "./dates.js";

const NOMS_JOURS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

/**
 * Phrase de chaque moment. Le ton reste neutre : elle dit ce que montre le
 * tableau de bord, sans juger l'état des comptes ni supposer ce qu'on a fait
 * de sa journée.
 */
const PHRASES = {
  matin: "Voici où en est votre activité ce matin.",
  lundi: "Voici où en est votre activité en ce début de semaine.",
  midi: "Voici où en est votre activité ce midi.",
  apresMidi: "Voici où en est votre activité cet après-midi.",
  vendredi: "Avant le week-end, le point sur votre activité.",
  soir: "Voici où en est votre activité ce soir.",
  tard: "Même à cette heure tardive, voici où en est votre activité.",
  weekend: "Voici où en est votre activité ce week-end.",
};

/**
 * @param {object} [options]
 * @param {string} [options.prenom] facultatif : sans lui, la salutation reste entière.
 * @param {Date} [options.maintenant]
 * @param {string} [options.rappel] ce qui est à faire (une déclaration URSSAF) :
 *   il prend la place de la phrase du moment.
 * @returns {{ titre: string, phrase: string, jour: string }} `jour` : « Mardi 24 septembre 2026 ».
 */
export function salutation({
  prenom = "",
  maintenant = new Date(),
  rappel = "",
} = {}) {
  const heure = maintenant.getHours();
  const jourSemaine = maintenant.getDay();
  const weekend = jourSemaine === 0 || jourSemaine === 6;

  const titre = heure < 5 || heure >= 18 ? "Bonsoir" : "Bonjour";
  let moment;
  if (heure < 5 || heure >= 22) {
    moment = "tard";
  } else if (heure >= 18) {
    moment = "soir";
  } else if (weekend) {
    moment = "weekend";
  } else if (heure < 12) {
    moment = jourSemaine === 1 ? "lundi" : "matin";
  } else if (heure < 13) {
    moment = "midi";
  } else {
    moment = jourSemaine === 5 ? "vendredi" : "apresMidi";
  }

  const nom = majusculeInitiale(String(prenom ?? "").trim());
  const quantieme = maintenant.getDate() === 1 ? "1er" : maintenant.getDate();
  const jour = `${majusculeInitiale(NOMS_JOURS[jourSemaine])} ${quantieme} ${nomMois(maintenant.getMonth() + 1)} ${maintenant.getFullYear()}`;
  return {
    titre: nom ? `${titre} ${nom}` : titre,
    phrase: rappel || PHRASES[moment],
    jour,
  };
}
