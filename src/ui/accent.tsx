/**
 * Couleur d'accent du profil commerce.
 *
 * Les StyleSheet sont figees au chargement du module : elles gardent le bleu
 * SahelPOS. Les ecrans et composants partages lisent donc l'accent ici et le
 * posent en style en ligne, pour que le mode Habillement reste marron partout.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { couleurs } from './theme';
import { HABILLEMENT_MOBILE_THEME as H } from '../profile-ui/habillement/theme';

export interface Accent {
  mode: boolean;
  primaire: string;
  primaireFonce: string;
  primaireDouce: string;
  primaireBordure: string;
}

export const ACCENT_STANDARD: Accent = {
  mode: false,
  primaire: couleurs.primaire,
  primaireFonce: couleurs.primaireFonce,
  primaireDouce: couleurs.primaireDouce,
  primaireBordure: couleurs.primaireBordure,
};

export const ACCENT_MODE: Accent = {
  mode: true,
  primaire: H.primaire,
  primaireFonce: H.primaireFonce,
  primaireDouce: H.primaireClair,
  primaireBordure: H.primaireBordure,
};

const ContexteAccent = createContext<Accent>(ACCENT_STANDARD);

export function accentPourSecteur(secteur?: string | null): Accent {
  return secteur === 'HABILLEMENT' ? ACCENT_MODE : ACCENT_STANDARD;
}

export function FournisseurAccent({ secteur, children }: { secteur?: string | null; children: ReactNode }) {
  return <ContexteAccent.Provider value={accentPourSecteur(secteur)}>{children}</ContexteAccent.Provider>;
}

export function useAccent(): Accent {
  return useContext(ContexteAccent);
}

export interface StylesAccent {
  actif: { backgroundColor?: string; borderColor?: string };
  texte: { color?: string };
  fondDoux: { backgroundColor?: string; borderColor?: string };
}

const VIDE: StylesAccent = { actif: {}, texte: {}, fondDoux: {} };
const MODE: StylesAccent = {
  actif: { backgroundColor: ACCENT_MODE.primaire, borderColor: ACCENT_MODE.primaire },
  texte: { color: ACCENT_MODE.primaire },
  fondDoux: { backgroundColor: ACCENT_MODE.primaireDouce, borderColor: ACCENT_MODE.primaireBordure },
};

/** Surcharges en ligne a poser APRES les styles bleus d'origine (vides hors mode). */
export function useStylesAccent(): StylesAccent {
  return useAccent().mode ? MODE : VIDE;
}
