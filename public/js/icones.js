/**
 * Icônes de l'interface, au style « trait » de Lucide (https://lucide.dev).
 *
 * Les tracés sont intégrés directement (aucune dépendance, aucun réseau :
 * cohérent avec une application 100 % locale). Lucide est distribué sous
 * licence ISC ; voir la mention dans le README.
 *
 * `icone(nom, options)` renvoie une chaîne SVG prête à insérer dans un
 * gabarit. La couleur suit `currentColor` (donc la couleur du texte parent)
 * et la taille se règle via l'option `taille` (en pixels).
 */

const TRACES = {
  'tableau-de-bord':
    '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/>' +
    '<rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  recettes:
    '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/>' +
    '<path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>',
  urssaf:
    '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/>' +
    '<line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/>' +
    '<path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
  clients:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
    '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  import:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/>' +
    '<line x1="12" x2="12" y1="3" y2="15"/>',
  exports:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" x2="12" y1="15" y2="3"/>',
  parametres:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/>' +
    '<circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  copier:
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>' +
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'chevron-haut': '<path d="m18 15-6-6-6 6"/>',
  'chevron-bas': '<path d="m6 9 6 6 6-6"/>',
  recherche: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  crayon: '<path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  corbeille:
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
    '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
    '<line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  lune: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  soleil:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/>' +
    '<path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/>' +
    '<path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  'cercle-valide': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'cercle-alerte':
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/>' +
    '<line x1="12" x2="12.01" y1="16" y2="16"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  billet: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  calendrier: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  diese:
    '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/>' +
    '<line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  tendance: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'fichier-pdf':
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>' +
    '<path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  'fichier-tableur':
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>' +
    '<path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  tableau: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  reinitialiser: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  liste:
    '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  telecharger:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" x2="12" y1="15" y2="3"/>'
};

/**
 * Renvoie le balisage SVG d'une icône.
 * @param {string} nom clé du tracé (voir `TRACES`)
 * @param {{ taille?: number, classe?: string }} [options]
 */
export function icone(nom, { taille = 18, classe = '' } = {}) {
  const trace = TRACES[nom];
  if (!trace) return '';
  const classes = `icone${classe ? ` ${classe}` : ''}`;
  return (
    `<svg class="${classes}" width="${taille}" height="${taille}" viewBox="0 0 24 24" ` +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    `stroke-linejoin="round" aria-hidden="true" focusable="false">${trace}</svg>`
  );
}
