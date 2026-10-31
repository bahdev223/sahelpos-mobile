/**
 * Tiroir de navigation (le « drawer »).
 *
 * POURQUOI IL EST ECRIT ICI PLUTOT QUE PRIS DANS @react-navigation/drawer
 * ----------------------------------------------------------------------
 * Ce paquet tire `react-native-reanimated`, donc `react-native-worklets`, dont
 * une version incompatible a deja fait echouer la compilation native de ce
 * projet pendant une demi-heure. Un panneau qui glisse ne demande qu'une
 * `Animated.View` et une `Modal`, toutes deux fournies par React Native : la
 * dependance ne se justifie pas.
 *
 * POURQUOI UN TIROIR ET NON UN CINQUIEME ONGLET
 * --------------------------------------------
 * Une barre d'onglets cesse d'etre lisible au pouce au-dela de quatre entrees,
 * et l'application compte une quinzaine d'ecrans. Les quatre gestes de la
 * journee restent en bas ; tout ce qu'on ouvre une fois par semaine passe ici.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  useWindowDimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';

import { listerAlertesStock } from '../db/repositories/produit';
import { Icone, IconePastille, Pastille } from './icones';
import type { NomIcone } from './icones';
import { couleurs, espaces, rayons } from './theme';
import type { SecteurCommerce } from '../domain/commerce';
import type { Role } from '../domain/types';
import { construireNavigationMobile } from '../domain/navigation-mobile';
import { HABILLEMENT_MOBILE_THEME as H } from '../profile-ui/habillement/theme';

const DUREE = 220;

interface ValeurTiroir {
  ouvrir: () => void;
  fermer: () => void;
}

const ContexteTiroir = createContext<ValeurTiroir | null>(null);

export function useTiroir(): ValeurTiroir {
  const valeur = useContext(ContexteTiroir);
  if (!valeur) {
    throw new Error('useTiroir est appele hors du FournisseurTiroir.');
  }
  return valeur;
}

export interface InfosTiroir {
  boutique: string;
  secteur: SecteurCommerce;
  secteurLibelle: string;
  capabilitiesCommerce: string[];
  utilisateur: string;
  role: Role;
  /** Nombre d'alertes de stock, affiche en pastille sur l'entree correspondante. */
  alertes?: number;
  onDeconnexion?: () => void;
}

export function FournisseurTiroir({
  children,
  infos,
}: {
  children: React.ReactNode;
  infos: InfosTiroir;
}) {
  const { width } = useWindowDimensions();
  const largeur = Math.min(320, width * 0.86);
  const [visible, setVisible] = useState(false);
  // `monte` reste vrai le temps de l'animation de fermeture : sans lui, la
  // Modal disparaitrait d'un coup au lieu de glisser.
  const [monte, setMonte] = useState(false);
  const glissement = useRef(new Animated.Value(-320)).current;
  const voile = useRef(new Animated.Value(0)).current;

  const ouvrir = useCallback(() => {
    setMonte(true);
    setVisible(true);
  }, []);

  const fermer = useCallback(() => {
    setVisible(false);
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(glissement, { toValue: 0, duration: DUREE, useNativeDriver: true }),
        Animated.timing(voile, { toValue: 1, duration: DUREE, useNativeDriver: true }),
      ]).start();
      return;
    }
    if (!monte) return;
    Animated.parallel([
      Animated.timing(glissement, { toValue: -320, duration: DUREE, useNativeDriver: true }),
      Animated.timing(voile, { toValue: 0, duration: DUREE, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setMonte(false);
    });
  }, [visible, monte, glissement, voile]);

  const valeur = useMemo<ValeurTiroir>(() => ({ ouvrir, fermer }), [ouvrir, fermer]);

  return (
    <ContexteTiroir.Provider value={valeur}>
      {children}
      <Modal visible={monte} transparent animationType="none" onRequestClose={fermer}>
        <View style={st.plein}>
          <Animated.View style={[st.voile, { opacity: voile }]}>
            <Pressable style={st.plein} onPress={fermer} accessibilityLabel="Fermer le menu" />
          </Animated.View>
          <Animated.View
            style={[
              st.panneau,
              infos.secteur === 'HABILLEMENT' && { backgroundColor: H.surface },
              { width: largeur },
              { transform: [{ translateX: glissement }] },
            ]}
          >
            <ContenuTiroir infos={infos} onFermer={fermer} />
          </Animated.View>
        </View>
      </Modal>
    </ContexteTiroir.Provider>
  );
}

function ContenuTiroir({ infos, onFermer }: { infos: InfosTiroir; onFermer: () => void }) {
  const router = useRouter();
  const cheminActuel = usePathname();
  const groupes = construireNavigationMobile(infos.secteur, infos.role, infos.capabilitiesCommerce);
  const marges = useSafeAreaInsets();
  const habillement = infos.secteur === 'HABILLEMENT';
  const accent = habillement ? H.primaire : couleurs.primaire;
  const accentClair = habillement ? H.primaireClair : couleurs.primaireDouce;
  const fond = habillement ? H.fond : couleurs.fond;
  const texte = habillement ? H.texte : couleurs.texte;
  const texteFaible = habillement ? H.texteFaible : couleurs.texteFaible;
  const [alertes, setAlertes] = useState(infos.alertes ?? 0);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const liste = await listerAlertesStock();
        if (vivant) setAlertes(liste.length);
      } catch {
        // Un comptage qui echoue coute une pastille, pas l'acces au menu.
      }
    })();
    return () => {
      vivant = false;
    };
  }, []);

  const aller = useCallback(
    (chemin: string) => {
      onFermer();
      // Aucun délai artificiel entre la sélection et le changement d'écran.
      router.push(chemin as never);
    },
    [onFermer, router],
  );

  return (
    <View style={st.contenu}>
      <View style={[
        st.entete,
        { paddingTop: marges.top + espaces.m, backgroundColor: accent },
      ]}>
        <View style={st.enteteHaut}>
          <View style={st.ecussonLogo}>
            <Image
              source={require('../../assets/logo.png')}
              style={st.logo}
              resizeMode="contain"
            />
          </View>
          <Pressable onPress={onFermer} hitSlop={12} style={st.croix}>
            <Icone nom="fermer" taille={22} couleur={couleurs.texteInverse} />
          </Pressable>
        </View>
        <Text style={st.boutique} numberOfLines={1}>
          {infos.boutique}
        </Text>
        <View style={st.compte}>
          <Pastille
            texte={infos.utilisateur}
            fond={couleurs.texteInverse}
            couleurTexte={couleurs.primaire}
            taille={38}
          />
          <View style={st.compteTextes}>
            <Text style={st.compteNom} numberOfLines={1}>
              {infos.utilisateur}
            </Text>
            <Text style={st.compteRole}>{infos.role} · {infos.secteurLibelle}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={st.liste}>
        {groupes.map((groupe) => (
          <View key={groupe.id} style={st.groupe}>
            <Text style={[st.groupeTitre, { color: texteFaible }]}>{groupe.titre.toUpperCase()}</Text>
            {groupe.entrees.map((entree) => {
              const path = entree.chemin.replace('/(tabs)', '');
              const actif = cheminActuel === path || cheminActuel.startsWith(path + '/');
              return <Pressable
                key={entree.id}
                onPress={() => aller(entree.chemin)}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
                style={({ pressed }) => [
                  st.entree,
                  actif && { backgroundColor: accentClair, borderLeftWidth: 3, borderLeftColor: accent },
                  pressed && { backgroundColor: fond },
                ]}>
                <IconePastille nom={entree.icone} couleur={accent} fond={accentClair} />
                <View style={st.entreeTextes}>
                  <Text style={[st.entreeTitre, { color: actif ? accent : texte }]}>{entree.titre}</Text>
                  <Text style={[st.entreeDescription, { color: texteFaible }]} numberOfLines={1}>{entree.description}</Text>
                </View>
                {entree.id === 'alertes' && alertes > 0
                  ? <View style={st.badge}><Text style={st.badgeTexte}>{alertes}</Text></View>
                  : <Icone nom="chevron" taille={16} couleur={couleurs.texteEteint} />}
              </Pressable>;
            })}
          </View>
        ))}

        <Text style={st.pied}>SahelPOS Mobile</Text>
      </ScrollView>
      {infos.onDeconnexion ? (
        <View style={[st.piedFixe, { paddingBottom: marges.bottom + espaces.s }]}>
          <Pressable
            onPress={() => {
              // La session est fermée immédiatement : attendre la fin de
              // l'animation pouvait laisser l'ancien utilisateur actif si le
              // composant était démonté avant le callback.
              infos.onDeconnexion?.();
              onFermer();
            }}
            style={({ pressed }) => [st.deconnexion, pressed && st.entreePressee]}
            accessibilityRole="button"
            accessibilityLabel="Se déconnecter"
          >
            <Icone nom="deconnexion" taille={20} couleur={couleurs.danger} />
            <View style={st.deconnexionTextes}>
              <Text style={st.deconnexionTexte}>Se déconnecter</Text>
              <Text style={st.deconnexionDetail}>Retour au choix des profils</Text>
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Bouton d'ouverture, a poser dans l'en-tete des ecrans.
 *
 * Il porte un libelle d'accessibilite parce qu'un pictogramme de trois traits
 * n'annonce rien a un lecteur d'ecran.
 */
export function BoutonMenu({ couleur = couleurs.texte }: { couleur?: string }) {
  const { ouvrir } = useTiroir();
  return (
    <Pressable
      onPress={ouvrir}
      hitSlop={10}
      style={st.boutonMenu}
      accessibilityRole="button"
      accessibilityLabel="Ouvrir le menu"
    >
      <Icone nom="menu" taille={24} couleur={couleur} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  plein: { flex: 1 },
  voile: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 30, 43, 0.45)',
  },
  panneau: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 320,
    backgroundColor: couleurs.surface,
  },
  contenu: { flex: 1 },

  entete: {
    backgroundColor: couleurs.primaire,
    paddingHorizontal: espaces.l,
    paddingTop: espaces.m,
    paddingBottom: espaces.l,
  },
  enteteHaut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ecussonLogo: {
    width: 52,
    height: 52,
    borderRadius: rayons.m,
    backgroundColor: couleurs.texteInverse,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 42, height: 42 },
  croix: { padding: 4 },
  boutique: {
    color: couleurs.texteInverse,
    fontSize: 18,
    fontWeight: '700',
    marginTop: espaces.m,
  },
  compte: { flexDirection: 'row', alignItems: 'center', gap: espaces.m, marginTop: espaces.l },
  compteTextes: { flex: 1 },
  compteNom: { color: couleurs.texteInverse, fontSize: 15, fontWeight: '600' },
  compteRole: { color: couleurs.primaireDouce, fontSize: 12, textTransform: 'capitalize' },

  liste: { paddingVertical: espaces.m, paddingBottom: espaces.xxl },
  groupe: { marginBottom: espaces.l },
  groupeTitre: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: couleurs.texteFaible,
    paddingHorizontal: espaces.l,
    marginBottom: espaces.xs,
  },
  entree: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    // Cible confortable : le tiroir s'ouvre souvent d'une seule main.
    minHeight: 56,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.s,
  },
  entreePressee: { backgroundColor: couleurs.fond },
  entreeTextes: { flex: 1 },
  entreeTitre: { fontSize: 15, fontWeight: '600', color: couleurs.texte },
  entreeDescription: { fontSize: 12, color: couleurs.texteFaible, marginTop: 1 },
  badge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.accent,
  },
  badgeTexte: { fontSize: 12, fontWeight: '700', color: couleurs.texteInverse },

  piedFixe: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  deconnexion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    minHeight: 52,
    paddingHorizontal: espaces.l,
  },
  deconnexionTextes: { flex: 1 },
  deconnexionTexte: { fontSize: 15, fontWeight: '600', color: couleurs.danger },
  deconnexionDetail: { marginTop: 2, fontSize: 11, color: couleurs.texteFaible },
  pied: {
    textAlign: 'center',
    fontSize: 11,
    color: couleurs.texteEteint,
    marginTop: espaces.l,
  },

  boutonMenu: { padding: 4, marginRight: espaces.xs },
});
