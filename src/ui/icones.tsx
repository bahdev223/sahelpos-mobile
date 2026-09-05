/**
 * Jeu d'icones de l'application.
 *
 * POURQUOI DES TRACES SVG ET NON UNE POLICE D'ICONES
 * -------------------------------------------------
 * Une police (`@expo/vector-icons` et ses variantes) embarque plusieurs milliers
 * de glyphes dont on en utilise trente, et pese plusieurs mega-octets dans
 * l'APK. Le commercant installe l'application depuis son telephone, souvent en
 * 3G payante : chaque mega compte. Les traces ci-dessous ne coutent que le poids
 * de leur texte et `react-native-svg` est deja present pour les QR codes.
 *
 * POURQUOI UN SEUL FICHIER
 * ------------------------
 * Une icone se choisit en regardant les autres. Les avoir toutes sous les yeux
 * evite d'en redessiner une qui existe deja sous un autre nom.
 *
 * CONVENTION DE DESSIN : traits seuls, sans remplissage, sur une grille 24x24,
 * epaisseur 2, extremites arrondies. Toute icone ajoutee doit suivre la meme
 * regle, sinon elle se voit immediatement comme une piece rapportee.
 */
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { couleurs } from './theme';

/** Noms disponibles. Le type force la faute de frappe a echouer a la compilation. */
export type NomIcone =
  | 'accueil'
  | 'caisse'
  | 'catalogue'
  | 'stock'
  | 'ventes'
  | 'achats'
  | 'clients'
  | 'fournisseurs'
  | 'inventaire'
  | 'alerte'
  | 'mouvements'
  | 'boutique'
  | 'utilisateurs'
  | 'imprimante'
  | 'sauvegarde'
  | 'menu'
  | 'fermer'
  | 'retour'
  | 'chevron'
  | 'recherche'
  | 'codeBarres'
  | 'appareilPhoto'
  | 'image'
  | 'plus'
  | 'moins'
  | 'corbeille'
  | 'crayon'
  | 'coche'
  | 'cloche'
  | 'deconnexion'
  | 'reseau'
  | 'graphique'
  | 'argent'
  | 'etiquette'
  | 'document';

/**
 * Traces, en syntaxe `d` de SVG.
 *
 * Chaque entree est une liste : certaines icones demandent plusieurs traits
 * distincts, qu'on ne peut pas relier sans dessiner une ligne parasite.
 */
const TRACES: Record<NomIcone, string[]> = {
  accueil: ['M3 10.5 12 3l9 7.5', 'M5.5 9.5V20h13V9.5', 'M9.5 20v-5.5h5V20'],
  caisse: ['M3 4h2l2.2 9.2a2 2 0 0 0 2 1.5h7.4a2 2 0 0 0 2-1.5L20.5 7H6'],
  catalogue: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
  stock: ['M12 3 4 7v10l8 4 8-4V7z', 'M4 7l8 4 8-4', 'M12 11v10'],
  ventes: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9.5 8h5', 'M9.5 12h5'],
  achats: ['M4 5h2l1.6 8.5h9.2L18.5 7H7', 'M8 19h.01', 'M16 19h.01', 'M12 3v4', 'M10 5h4'],
  clients: ['M4 20v-1.5A4.5 4.5 0 0 1 8.5 14h3A4.5 4.5 0 0 1 16 18.5V20', 'M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7', 'M17 14.5a4 4 0 0 1 3 3.9V20'],
  fournisseurs: ['M3 8h10v8H3z', 'M13 11h4l3 3v2h-7z', 'M6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3', 'M16.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3'],
  inventaire: ['M8 4h8v3H8z', 'M6 7h12v13H6z', 'M9.5 12l1.8 1.8L15 10.5'],
  alerte: ['M12 4 3 19h18z', 'M12 10v4', 'M12 17h.01'],
  mouvements: ['M4 8h12', 'M13 5l3 3-3 3', 'M20 16H8', 'M11 13l-3 3 3 3'],
  boutique: ['M4 9V6h16v3', 'M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0', 'M5.5 11v9h13v-9', 'M10 20v-5h4v5'],
  utilisateurs: ['M4 20v-1.5A4.5 4.5 0 0 1 8.5 14h3A4.5 4.5 0 0 1 16 18.5V20', 'M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7', 'M18 8v5', 'M15.5 10.5h5'],
  imprimante: ['M7 9V4h10v5', 'M5 9h14v7h-3v-3H8v3H5z', 'M8 16h8v4H8z'],
  sauvegarde: ['M12 3v11', 'M8 10.5l4 4 4-4', 'M4 17v3h16v-3'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  fermer: ['M6 6l12 12', 'M18 6 6 18'],
  retour: ['M15 5l-7 7 7 7'],
  chevron: ['M9 5l7 7-7 7'],
  recherche: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14', 'M16.2 16.2 20 20'],
  codeBarres: ['M4 6v12', 'M7 6v12', 'M10 6v8', 'M13 6v12', 'M16 6v8', 'M20 6v12'],
  appareilPhoto: ['M4 8h3.5L9 6h6l1.5 2H20v11H4z', 'M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7'],
  image: ['M4 5h16v14H4z', 'M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3', 'M4 16l5-4 4 3 3-2 4 3'],
  plus: ['M12 5v14', 'M5 12h14'],
  moins: ['M5 12h14'],
  corbeille: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  crayon: ['M4 20l1-4 11-11 3 3-11 11z', 'M14 6l3 3'],
  coche: ['M5 12.5 10 17.5 19 7'],
  cloche: ['M6 17V11a6 6 0 0 1 12 0v6', 'M4.5 17h15', 'M10 20h4'],
  deconnexion: ['M14 4H6v16h8', 'M17 8l4 4-4 4', 'M21 12h-9'],
  reseau: ['M12 19h.01', 'M8.5 15.5a5 5 0 0 1 7 0', 'M5.5 12.3a9.5 9.5 0 0 1 13 0', 'M3 9.2a14 14 0 0 1 18 0'],
  graphique: ['M4 20V4', 'M4 20h16', 'M8 17v-5', 'M12.5 17V8', 'M17 17v-8'],
  argent: ['M3 7h18v10H3z', 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5', 'M6.5 10.5h.01', 'M17.5 13.5h.01'],
  etiquette: ['M4 4h7l9 9-7 7-9-9z', 'M8 8h.01'],
  // Feuille avec un coin plie : le document qu'on exporte et qu'on envoie.
  document: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
             'M14 3v5h5', 'M9 13h6', 'M9 17h4'],
};

export interface ProprietesIcone {
  nom: NomIcone;
  /** Cote du carre en points. 24 convient au corps de texte, 26 a la barre d'onglets. */
  taille?: number;
  couleur?: string;
  /** Epaisseur du trait. On l'affine sur les grandes tailles pour ne pas empater. */
  epaisseur?: number;
}

export function Icone({
  nom,
  taille = 22,
  couleur = couleurs.texte,
  epaisseur = 2,
}: ProprietesIcone) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24">
      {TRACES[nom].map((trace, index) => (
        <Path
          // L'index suffit : la liste des traces d'une icone ne change jamais
          // en cours d'execution.
          key={index}
          d={trace}
          stroke={couleur}
          strokeWidth={epaisseur}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

/**
 * Icone posee dans une pastille de couleur.
 *
 * Sert dans les listes de menu : une rangee de traits gris se lit mal, alors
 * qu'une pastille donne un point d'ancrage a l'oeil qui parcourt la liste.
 */
export function IconePastille({
  nom,
  couleur = couleurs.primaire,
  fond = couleurs.primaireDouce,
  taille = 38,
}: {
  nom: NomIcone;
  couleur?: string;
  fond?: string;
  taille?: number;
}) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24">
      <Rect x={0} y={0} width={24} height={24} rx={7} fill={fond} />
      {TRACES[nom].map((trace, index) => (
        <Path
          key={index}
          // Le trace est reduit a 60 % et recentre : dessine a taille pleine il
          // toucherait les bords de la pastille.
          d={trace}
          stroke={couleur}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          transform="translate(4.8 4.8) scale(0.6)"
        />
      ))}
    </Svg>
  );
}

/** Rond d'initiales, pour l'en-tete du tiroir. */
export function Pastille({
  texte,
  taille = 44,
  fond = couleurs.primaire,
  couleurTexte = couleurs.texteInverse,
}: {
  texte: string;
  taille?: number;
  fond?: string;
  couleurTexte?: string;
}) {
  const initiales = texte
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <Svg width={taille} height={taille} viewBox="0 0 44 44">
      <Circle cx={22} cy={22} r={22} fill={fond} />
      <SvgTexte initiales={initiales || '?'} couleur={couleurTexte} />
    </Svg>
  );
}

/**
 * Le texte d'un SVG passe par `Text` de react-native-svg, importe ici pour
 * garder l'import principal court.
 */
function SvgTexte({ initiales, couleur }: { initiales: string; couleur: string }) {
  const { Text: TexteSvg } = require('react-native-svg');
  return (
    <TexteSvg
      x={22}
      y={22}
      fill={couleur}
      fontSize={16}
      fontWeight="700"
      textAnchor="middle"
      alignmentBaseline="central"
    >
      {initiales}
    </TexteSvg>
  );
}
