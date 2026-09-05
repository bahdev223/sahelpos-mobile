/**
 * Briques d'interface communes a tous les ecrans.
 *
 * POURQUOI UN SEUL FICHIER : ces composants sont courts et toujours employes
 * ensemble. Les eclater en sept fichiers obligerait a ouvrir sept onglets pour
 * comprendre une seule regle d'aspect.
 *
 * POURQUOI DES CIBLES DE 48 POINTS : l'application se tient debout, une main
 * sur le telephone et l'autre sur la marchandise. En dessous de 48 points une
 * cible se rate une fois sur trois, et une caisse qui rate se contourne.
 *
 * POURQUOI CES CONTRASTES : la caisse sert souvent en plein soleil. Les gris
 * clairs sur blanc disparaissent dehors, d'ou un texte tres fonce sur des fonds
 * francs plutot qu'une palette pastel.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  StyleProp,
  TextInputProps,
  TextStyle,
  ViewStyle,
} from 'react-native';

/** Hauteur (et largeur) minimale de toute zone tactile. */
export const CIBLE_MIN = 48;

/**
 * La palette vient de `src/ui/theme.ts` et de nulle part ailleurs.
 *
 * Ce fichier en definissait une SECONDE — primaire verte, accent brun — et
 * comme la plupart des ecrans importent leurs couleurs d'ici, c'est elle qui
 * s'affichait : l'application ne portait pas les couleurs de la marque. Les
 * deux palettes ont donc ete fusionnees sur celle de `theme.ts`, qui est celle
 * du logiciel de bureau. Ne rien redefinir ici.
 */
import { File, Paths } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { couleurs, espaces, rayons } from '../theme';
export { couleurs, espaces, rayons };

/**
 * Le franc CFA n'a pas de sous-unite : on affiche des entiers de francs,
 * groupes par milliers. Le groupement est fait a la main plutot qu'avec
 * `toLocaleString` pour que l'ecran et le ticket imprime produisent exactement
 * la meme chaine, sans dependre de la presence d'Intl dans le moteur.
 */
export function formaterMontant(valeur: number, devise = 'F'): string {
  const entier = Math.round(valeur);
  const groupe = String(entier).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return devise ? `${groupe} ${devise}` : groupe;
}

/** Quantites : 3 et non "3.000", mais 1.5 reste 1.5 pour la vente au poids. */
export function formaterQuantite(quantite: number): string {
  return Number.isInteger(quantite)
    ? String(quantite)
    : String(Number(quantite.toFixed(3)));
}

// --- Bouton -----------------------------------------------------------------

export type VarianteBouton = 'primaire' | 'secondaire' | 'discret' | 'danger';

export interface ProprietesBouton {
  titre: string;
  onPress: () => void;
  variante?: VarianteBouton;
  desactive?: boolean;
  enCours?: boolean;
  /** Bouton d'action principale d'un ecran : plus haut et plus lisible. */
  grand?: boolean;
  sousTitre?: string;
  style?: StyleProp<ViewStyle>;
}

export function Bouton({
  titre,
  onPress,
  variante = 'primaire',
  desactive = false,
  enCours = false,
  grand = false,
  sousTitre,
  style,
}: ProprietesBouton) {
  const inactif = desactive || enCours;
  const fond = FONDS_BOUTON[variante];
  const teinte = TEINTES_BOUTON[variante];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactif, busy: enCours }}
      disabled={inactif}
      onPress={onPress}
      style={({ pressed }) => [
        stylesBouton.base,
        grand && stylesBouton.grand,
        { backgroundColor: fond },
        variante === 'secondaire' && stylesBouton.contour,
        variante === 'discret' && stylesBouton.contour,
        pressed && stylesBouton.presse,
        inactif && stylesBouton.inactif,
        style,
      ]}
    >
      {enCours ? (
        <ActivityIndicator color={teinte} />
      ) : (
        <View>
          <Text
            numberOfLines={1}
            style={[
              stylesBouton.titre,
              grand && stylesBouton.titreGrand,
              { color: teinte },
            ]}
          >
            {titre}
          </Text>
          {sousTitre ? (
            <Text style={[stylesBouton.sousTitre, { color: teinte }]}>
              {sousTitre}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const FONDS_BOUTON: Record<VarianteBouton, string> = {
  primaire: couleurs.primaire,
  secondaire: couleurs.surface,
  discret: 'transparent',
  danger: couleurs.danger,
};

const TEINTES_BOUTON: Record<VarianteBouton, string> = {
  primaire: couleurs.texteInverse,
  secondaire: couleurs.texte,
  discret: couleurs.texteFaible,
  danger: couleurs.texteInverse,
};

const stylesBouton = StyleSheet.create({
  base: {
    minHeight: CIBLE_MIN,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.m,
    borderRadius: rayons.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grand: { minHeight: 60, borderRadius: rayons.l },
  contour: { borderWidth: 1, borderColor: couleurs.bordure },
  presse: { opacity: 0.72 },
  inactif: { opacity: 0.45 },
  titre: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  titreGrand: { fontSize: 19 },
  sousTitre: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.85,
  },
});

// --- Champ ------------------------------------------------------------------

export interface ProprietesChamp {
  valeur: string;
  onChangeText: (valeur: string) => void;
  label?: string;
  placeholder?: string;
  clavier?: TextInputProps['keyboardType'];
  retourClavier?: TextInputProps['returnKeyType'];
  onValider?: () => void;
  secret?: boolean;
  erreur?: string | null;
  aide?: string;
  autoFocus?: boolean;
  editable?: boolean;
  alignerADroite?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Champ({
  valeur,
  onChangeText,
  label,
  placeholder,
  clavier,
  retourClavier,
  onValider,
  secret = false,
  erreur,
  aide,
  autoFocus = false,
  editable = true,
  alignerADroite = false,
  style,
}: ProprietesChamp) {
  return (
    <View style={[stylesChamp.bloc, style]}>
      {label ? <Text style={stylesChamp.label}>{label}</Text> : null}
      <TextInput
        value={valeur}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={couleurs.texteFaible}
        keyboardType={clavier}
        returnKeyType={retourClavier}
        onSubmitEditing={onValider}
        secureTextEntry={secret}
        autoFocus={autoFocus}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          stylesChamp.saisie,
          alignerADroite && stylesChamp.saisieDroite,
          !editable && stylesChamp.saisieBloquee,
          erreur ? stylesChamp.saisieEnErreur : null,
        ]}
      />
      {erreur ? (
        <Text style={stylesChamp.erreur}>{erreur}</Text>
      ) : aide ? (
        <Text style={stylesChamp.aide}>{aide}</Text>
      ) : null}
    </View>
  );
}

const stylesChamp = StyleSheet.create({
  bloc: { marginBottom: espaces.l },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.texteFaible,
    marginBottom: espaces.s,
  },
  saisie: {
    minHeight: CIBLE_MIN,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.m,
    backgroundColor: couleurs.surface,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.m,
    fontSize: 17,
    color: couleurs.texte,
  },
  saisieDroite: { textAlign: 'right', fontSize: 22, fontWeight: '700' },
  saisieBloquee: { backgroundColor: couleurs.surfaceDouce },
  saisieEnErreur: { borderColor: couleurs.danger, borderWidth: 2 },
  erreur: { marginTop: espaces.xs, fontSize: 13, color: couleurs.danger },
  aide: { marginTop: espaces.xs, fontSize: 13, color: couleurs.texteFaible },
});

// --- Carte ------------------------------------------------------------------

export interface ProprietesCarte {
  children: ReactNode;
  titre?: string;
  style?: StyleProp<ViewStyle>;
}

export function Carte({ children, titre, style }: ProprietesCarte) {
  return (
    <View style={[stylesCarte.carte, style]}>
      {titre ? <Text style={stylesCarte.titre}>{titre}</Text> : null}
      {children}
    </View>
  );
}

const stylesCarte = StyleSheet.create({
  carte: {
    backgroundColor: couleurs.surface,
    borderRadius: rayons.l,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espaces.l,
  },
  titre: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: couleurs.texteFaible,
    marginBottom: espaces.m,
  },
});

// --- Etats : vide, chargement, erreur ---------------------------------------

export interface ProprietesListeVide {
  titre: string;
  message?: string;
  actionTitre?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ListeVide({
  titre,
  message,
  actionTitre,
  onAction,
  style,
}: ProprietesListeVide) {
  return (
    <View style={[stylesEtat.bloc, style]}>
      <Text style={stylesEtat.titre}>{titre}</Text>
      {message ? <Text style={stylesEtat.message}>{message}</Text> : null}
      {actionTitre && onAction ? (
        <Bouton
          titre={actionTitre}
          onPress={onAction}
          variante="secondaire"
          style={stylesEtat.action}
        />
      ) : null}
    </View>
  );
}

export function Chargement({ message = 'Chargement...' }: { message?: string }) {
  return (
    <View style={stylesEtat.bloc}>
      <ActivityIndicator size="large" color={couleurs.primaire} />
      <Text style={[stylesEtat.message, stylesEtat.messageChargement]}>
        {message}
      </Text>
    </View>
  );
}

export interface ProprietesErreur {
  message: string;
  titre?: string;
  onReessayer?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Erreur({
  message,
  titre = 'Quelque chose a echoue',
  onReessayer,
  style,
}: ProprietesErreur) {
  return (
    <View style={[stylesEtat.bloc, style]}>
      <View style={stylesEtat.pastilleErreur}>
        <Text style={stylesEtat.signeErreur}>!</Text>
      </View>
      <Text style={stylesEtat.titre}>{titre}</Text>
      <Text style={stylesEtat.message}>{message}</Text>
      {onReessayer ? (
        <Bouton
          titre="Reessayer"
          onPress={onReessayer}
          variante="secondaire"
          style={stylesEtat.action}
        />
      ) : null}
    </View>
  );
}

const stylesEtat = StyleSheet.create({
  bloc: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espaces.xl,
  },
  titre: {
    fontSize: 18,
    fontWeight: '700',
    color: couleurs.texte,
    textAlign: 'center',
  },
  message: {
    marginTop: espaces.s,
    fontSize: 15,
    lineHeight: 22,
    color: couleurs.texteFaible,
    textAlign: 'center',
  },
  messageChargement: { marginTop: espaces.l },
  action: { marginTop: espaces.xl, minWidth: 180 },
  pastilleErreur: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: couleurs.dangerDouce,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaces.m,
  },
  signeErreur: { fontSize: 28, fontWeight: '800', color: couleurs.danger },
});

// --- Montant ----------------------------------------------------------------

export type TailleMontant = 'petit' | 'moyen' | 'grand' | 'geant';

export interface ProprietesMontant {
  valeur: number;
  devise?: string;
  taille?: TailleMontant;
  couleur?: string;
  style?: StyleProp<TextStyle>;
}

export function Montant({
  valeur,
  devise = 'F',
  taille = 'moyen',
  couleur,
  style,
}: ProprietesMontant) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[
        stylesMontant.base,
        stylesMontant[taille],
        couleur ? { color: couleur } : null,
        style,
      ]}
    >
      {formaterMontant(valeur, devise)}
    </Text>
  );
}

const stylesMontant = StyleSheet.create({
  base: { color: couleurs.texte, fontVariant: ['tabular-nums'] },
  petit: { fontSize: 14, fontWeight: '600' },
  moyen: { fontSize: 17, fontWeight: '700' },
  grand: { fontSize: 24, fontWeight: '800' },
  geant: { fontSize: 40, fontWeight: '800', letterSpacing: -0.5 },
});

/**
 * Bande reservee a la barre d'etat du telephone (heure, batterie, reseau).
 *
 * POURQUOI CE COMPOSANT EXISTE : la pile de navigation est configuree avec
 * `headerShown: false`, chaque ecran dessine donc son propre en-tete. Sans
 * reservation, cet en-tete se dessine a y = 0, c'est-a-dire SOUS l'horloge et
 * la batterie : le bouton "Retour" devenait illisible, voire intouchable.
 *
 * POURQUOI UNE BANDE PLUTOT QU'UNE MARGE : les styles d'en-tete sont des
 * `StyleSheet` statiques et partages entre neuf ecrans ; ils ne peuvent pas
 * contenir une hauteur qui depend du telephone. Une bande posee juste au-dessus
 * prend la meme couleur de fond et ne demande aucun recalcul de marge.
 */
export function BandeauEtat({ fond = couleurs.surface }: { fond?: string }) {
  const marges = useSafeAreaInsets();
  return <View style={{ height: marges.top, backgroundColor: fond }} />;
}

/**
 * Les photos sont enregistrees en chemin RELATIF ("produits/xxx.jpg") et
 * resolues a l'affichage. Le repertoire de l'application change d'adresse
 * absolue d'une installation a l'autre : un chemin absolu stocke en base
 * pointerait dans le vide apres une mise a jour.
 */
export function uriImage(cheminRelatif: string | null): string | null {
  if (!cheminRelatif) return null;
  if (cheminRelatif.startsWith('file://') || cheminRelatif.startsWith('content://')) {
    return cheminRelatif;
  }
  try {
    return new File(Paths.document, cheminRelatif).uri;
  } catch {
    return null;
  }
}

/**
 * Photo d'un produit dans une liste.
 *
 * POURQUOI UNE PLACE EST TOUJOURS RESERVEE : si la vignette disparaissait pour
 * les produits sans photo, les lignes n'auraient pas la meme hauteur et l'oeil
 * perdrait l'alignement en faisant defiler. Le cadre vide porte donc les
 * premieres lettres du nom, ce qui reste un repere.
 */
export function Vignette({
  chemin,
  nom,
  taille = 52,
}: {
  chemin: string | null;
  nom?: string;
  taille?: number;
}) {
  const uri = uriImage(chemin);
  const cadre = {
    width: taille,
    height: taille,
    borderRadius: Math.round(taille / 6),
  };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[cadre, { backgroundColor: couleurs.surfaceDouce }]}
        resizeMode="cover"
      />
    );
  }

  const initiales = (nom ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      style={[
        cadre,
        {
          backgroundColor: couleurs.primaireDouce,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Text
        style={{
          fontSize: Math.round(taille / 2.8),
          fontWeight: '700',
          color: couleurs.primaire,
        }}
      >
        {initiales || '?'}
      </Text>
    </View>
  );
}

/**
 * A poser sur le `style` de tout `ScrollView horizontal`.
 *
 * POURQUOI C'EST INDISPENSABLE : un `ScrollView` horizontal reste un enfant
 * flex ordinaire pour son parent. Dans une colonne, il reclame donc TOUTE la
 * hauteur libre, et une simple barre de rayons repousse la liste de produits
 * au bas de l'ecran en laissant un grand rectangle vide. Le defaut s'etait
 * glisse dans neuf ecrans : la barre est visible, le vide en dessous ne
 * ressemble a rien de connu, et on cherche le bug ailleurs.
 *
 * `contentContainerStyle` ne corrige pas cela : il habille le contenu qui
 * defile, pas la boite qui le contient.
 */
export const BARRE_HORIZONTALE = { flexGrow: 0, flexShrink: 0 } as const;
