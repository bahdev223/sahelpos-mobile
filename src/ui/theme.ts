/**
 * Thème SahelPOS — source unique.
 *
 * Les couleurs sont EXACTEMENT celles de l'application de bureau
 * (ui/theme/colors.py) : un commercant qui connait le logiciel sur son
 * ordinateur doit reconnaitre le sien sur le telephone. Le bleu et l'orange
 * sont les couleurs de la marque, pas un choix esthetique reversible.
 *
 * Ce fichier est la SEULE definition de couleurs du projet. Il y en a eu trois
 * en parallele — une dans les composants, une dans un ecran, une orpheline — et
 * aucune n'etait celle de la marque. Toute nouvelle couleur se declare ici.
 */

export const couleurs = {
  // --- marque ------------------------------------------------------------
  primaire: '#004a8d',
  primaireFonce: '#003d73',
  primaireDouce: '#e6eef6',

  accent: '#ff9900',
  accentFonce: '#e68a00',
  accentDouce: '#fff4e0',

  // --- etats -------------------------------------------------------------
  succes: '#70c9a0',
  succesFonce: '#5cb85c',
  succesDouce: '#eaf7f1',

  danger: '#dc3545',
  dangerFonce: '#c82333',
  dangerDouce: '#fbe9eb',

  avertissement: '#ff9900',
  avertissementDouce: '#fff4e0',
  // Texte lisible sur avertissementDouce : l'orange de marque sur fond creme
  // ne passe pas le contraste en plein soleil.
  avertissementFonce: '#8a5200',

  // --- bordures des bandeaux d'information -------------------------------
  primaireBordure: '#bcd3e8',
  dangerBordure: '#f1b0b7',
  succesBordure: '#a8dcc4',
  avertissementBordure: '#ffd08a',

  // --- neutres -----------------------------------------------------------
  fond: '#f8fafc',
  surface: '#ffffff',
  surfaceDouce: '#f1f5f9',
  bordure: '#e2e8f0',

  texte: '#1e293b',
  texteFaible: '#64748b',
  texteEteint: '#94a3b8',
  texteInverse: '#ffffff',
} as const;

export const espaces = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
} as const;

export const rayons = {
  s: 8,
  m: 12,
  l: 16,
} as const;

/**
 * Hauteur minimale de tout element sur lequel on doit pouvoir appuyer.
 *
 * L'utilisateur est debout derriere son comptoir, souvent presse, parfois les
 * mains sales : en dessous de 48 px, il rate sa cible.
 */
export const CIBLE_TACTILE = 48;

/**
 * Ancien nom du theme, conserve pour les ecrans qui importaient `C`.
 *
 * Les cles sont celles qu'ils utilisent deja, pour qu'aucun ecran n'ait a etre
 * reecrit : elles pointent desormais vers les couleurs de la marque.
 */
export const C = {
  fond: couleurs.fond,
  carte: couleurs.surface,
  bordure: couleurs.bordure,
  texte: couleurs.texte,
  texteFaible: couleurs.texteFaible,
  accent: couleurs.primaire,
  vert: couleurs.succesFonce,
  orange: couleurs.accent,
  rouge: couleurs.danger,
} as const;
