/**
 * Icones des categories de vetements (mode Habillement).
 *
 * Meme jeu de formes que SahelPOS Web (IconeCategorie.tsx) : l'icone est
 * choisie a partir du nom de la categorie, avec un cintre par defaut. Aucune
 * categorie n'est codee en dur cote metier.
 */
import Svg, { Path } from 'react-native-svg';

type Forme = string[];

const FORMES: Record<string, Forme> = {
  chemise: ['M8 3 4.5 5 2.5 9.5 5 10.8 6 9v12h12V9l1 1.8 2.5-1.3L19.5 5 16 3l-4 4Z', 'M12 7v14', 'M14.5 12h1.5'],
  tshirt: ['M8.5 3.5c1 1.5 6 1.5 7 0l5 2 1.5 4.5-3.5 1v9.5h-13V11L2 10l1.5-4.5Z'],
  polo: ['M8.5 3.5c1 1.5 6 1.5 7 0l5 2 1.5 4.5-3.5 1v9.5h-13V11L2 10l1.5-4.5Z', 'M10 4.4 12 7l2-2.6', 'M12 7v3'],
  top: ['M8 3v2.5C8 7 6 8 6 10v11h12V10c0-2-2-3-2-4.5V3', 'M8 5.5c2 1.6 6 1.6 8 0'],
  pull: ['M8.5 3.5c1 1.5 6 1.5 7 0l4 1.5L22 18l-2.5.6-2-8.6v10.5h-11V10l-2 8.6L2 18 4.5 5Z', 'M6.5 18h11'],
  gilet: ['M8 3 5 5.5V21h6.5V11Z', 'M16 3l3 2.5V21h-6.5V11Z', 'M10 14.5h.01', 'M10 17.5h.01'],
  pantalon: ['M6 3h12l1 18h-5l-2-11.5L10 21H5Z', 'M6.2 6h11.6'],
  jean: ['M6 3h12l1 18h-5l-2-11.5L10 21H5Z', 'M6.2 6h11.6', 'M8 6c0 1.8 1 2.4 2 2.4', 'M16 6c0 1.8-1 2.4-2 2.4'],
  short: ['M5.5 4h13L20 15h-6l-2-6-2 6H4Z', 'M5.5 7h13'],
  jupe: ['M8 3.5h8l3.5 17h-15Z', 'M7.6 6.5h8.8', 'M10 6.5 9 20.5', 'M14 6.5l1 14'],
  robe: ['M9 2.5v3L7 9l2 1.5L5 21h14l-4-10.5L17 9l-2-3.5v-3', 'M9 5.5c1.5 1.5 4.5 1.5 6 0', 'M8.6 10.5h6.8'],
  combinaison: ['M8.5 3v3l-2 3v3L6 21h5l1-7 1 7h5l-.5-9V9l-2-3V3', 'M6.5 12h11'],
  ensemble: ['M8.5 2.5c1 1 6 1 7 0l4 1.5 1 3-3 .6V11h-11V7.6l-3-.6 1-3Z', 'M7 13h10l1 8.5h-4.5L12 16l-1.5 5.5H6Z'],
  costume: ['M8 3 4 5v16h16V5l-4-2', 'M8 3l4 7 4-7', 'm12 10-1 3 1 2 1-2Z', 'M12 15v6'],
  veste: ['M8 3 4 5l-1.5 13 3 .5L6 11v10h12V11l.5 7.5 3-.5L20 5l-4-2c-1 2-7 2-8 0Z', 'M12 4.5V21'],
  blazer: ['M8 3 4.5 5v16h15V5L16 3', 'M8 3l2 6 2 3 2-3 2-6', 'M12 12v9', 'M13.5 15h.01', 'M13.5 18h.01', 'M6.5 16h2.5'],
  manteau: ['M8 2.5 4 4.5l-1 17h18l-1-17-4-2', 'M8 2.5 12 8l4-5.5', 'M12 8v13.5', 'M3.6 12.5h16.8'],
  boubou: ['M9 3c1 1.5 5 1.5 6 0l7 6-2.5 2.5-1.5-1L19 21H5l1-10.5-1.5 1L2 9Z', 'M10 4.6 12 9l2-4.4', 'M12 9v3'],
  bazin: ['M9 3c1 1.5 5 1.5 6 0l7 6-2.5 2.5-1.5-1L19 21H5l1-10.5-1.5 1L2 9Z', 'M10 4.6 12 9l2-4.4', 'm12 13 1.5 2-1.5 2-1.5-2Z'],
  tradition: ['M9 3c1 1.5 5 1.5 6 0l7 6-2.5 2.5-1.5-1L19 21H5l1-10.5-1.5 1L2 9Z', 'M10 4.6 12 9l2-4.4', 'M7.4 15h9.2', 'M7.1 18h9.8'],
  sousvetement: ['M3 7h18l-1 3c-4 1-6 4-6.5 7h-3c-.5-3-2.5-6-6.5-7Z'],
  sport: ['M8 3c0 3 8 3 8 0l2.5 1c-.5 3 0 5 1 6v11h-15V10c1-1 1.5-3 1-6Z', 'M4.5 13.5h15'],
  uniforme: ['M8 3 4.5 5 2.5 9.5 5 10.8 6 9v12h12V9l1 1.8 2.5-1.3L19.5 5 16 3l-4 4Z', 'M12 7v14', 'M14 11h3v3h-3Z'],
  scolaire: ['M7 7c0-3 2-4 5-4s5 1 5 4', 'M5 9c0-1.5 1-2 2-2h10c1 0 2 .5 2 2v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z', 'M8 13h8v4H8Z'],
  chaussure: ['M2.5 17v-4.5L8 11l2.5-2.5L13 9.5c1.5 2.5 4 3.5 7 4 1.2.2 1.5 1.5 1.5 3.5Z', 'M2.5 17h19v1.5h-19Z', 'm10 10.5 1.5.8', 'm9 11.8 1.5.8'],
  sac: ['M5 9h14l1 12H4Z', 'M9 9V7c0-2 1.3-3 3-3s3 1 3 3v2'],
  accessoire: ['M3 9.5h7v3c0 1.5-1 2.5-2.5 2.5h-2C4 15 3 14 3 12.5Z', 'M14 9.5h7v3c0 1.5-1 2.5-2.5 2.5h-2c-1.5 0-2.5-1-2.5-2.5Z', 'M10 10.5c1.3-.7 2.7-.7 4 0'],
  cintre: ['M12 6.5c0-1.5 1-2 1-3a1.2 1.2 0 0 0-2.5-.2', 'M12 6.5 3 13.5c-.6.5-.3 1.5.5 1.5h17c.8 0 1.1-1 .5-1.5Z'],
};

/* L'ordre compte : le premier mot-clé trouvé l'emporte. */
const REGLES: Array<[string, string[]]> = [
  ['sousvetement', ['sous-vet', 'sous vet', 'lingerie', 'calecon', 'slip']],
  ['jean', ['jean']],
  ['short', ['short', 'bermuda']],
  ['pantalon', ['pantalon', 'chino', 'jogging']],
  ['jupe', ['jupe']],
  ['combinaison', ['combinaison', 'salopette']],
  ['robe', ['robe']],
  ['ensemble', ['ensemble', 'tenue de', 'pyjama']],
  ['costume', ['costume', 'smoking']],
  ['blazer', ['blazer']],
  ['manteau', ['manteau', 'parka', 'doudoune', 'imper']],
  ['veste', ['veste', 'blouson', 'jacket']],
  ['bazin', ['bazin', 'basin']],
  ['boubou', ['boubou', 'kaftan', 'caftan', 'djellaba', 'gandoura', 'abaya']],
  ['tradition', ['tradition', 'pagne', 'wax', 'bogolan', 'faso']],
  ['sport', ['sport', 'maillot']],
  ['uniforme', ['uniforme', 'blouse de travail']],
  ['scolaire', ['scolaire', 'ecole']],
  ['chaussure', ['chaussure', 'basket', 'sandale', 'escarpin', 'botte', 'mocassin', 'tong']],
  ['sac', ['sac', 'pochette', 'cartable']],
  ['accessoire', ['accessoire', 'lunette', 'ceinture', 'bijou', 'montre', 'chapeau', 'casquette', 'foulard', 'echarpe']],
  ['polo', ['polo']],
  ['tshirt', ['t-shirt', 'tshirt', 'tee-shirt', 'tee shirt']],
  ['top', ['top', 'blouse', 'debardeur', 'body']],
  ['pull', ['pull', 'sweat', 'hoodie', 'tricot']],
  ['gilet', ['gilet', 'cardigan']],
  ['chemise', ['chemise']],
];

export function formeCategorie(nom?: string | null): string {
  const n = (nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return REGLES.find(([, mots]) => mots.some(m => n.includes(m)))?.[0] || 'cintre';
}

export function IconeCategorie({ nom, taille = 18, epaisseur = 1.6, couleur = '#8B5E3C' }: {
  nom?: string | null; taille?: number; epaisseur?: number; couleur?: string;
}) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur}
      strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round">
      {FORMES[formeCategorie(nom)].map((d, i) => <Path key={i} d={d} />)}
    </Svg>
  );
}
