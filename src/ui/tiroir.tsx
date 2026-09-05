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
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { listerAlertesStock } from '../db/repositories/produit';
import { Icone, IconePastille, Pastille } from './icones';
import type { NomIcone } from './icones';
import { couleurs, espaces, rayons } from './theme';

const LARGEUR = Math.min(320, Dimensions.get('window').width * 0.86);
const DUREE = 220;

interface Entree {
  titre: string;
  description: string;
  chemin: string;
  icone: NomIcone;
}

interface Groupe {
  titre: string;
  entrees: Entree[];
}

/**
 * Le contenu du tiroir.
 *
 * L'ordre suit la frequence d'usage reelle : on releve ses ventes tous les
 * soirs, on ouvre les reglages une fois a l'installation.
 */
const GROUPES: Groupe[] = [
  {
    titre: 'Activite',
    entrees: [
      {
        titre: 'Ventes',
        description: 'Historique et tickets',
        chemin: '/ventes',
        icone: 'ventes',
      },
      {
        titre: 'Tableau de bord',
        description: 'Chiffre d affaires et benefice',
        chemin: '/tableau-de-bord',
        icone: 'graphique',
      },
      {
        titre: 'Alertes de stock',
        description: 'Produits sous le seuil',
        chemin: '/stock/alertes',
        icone: 'alerte',
      },
      {
        titre: 'Inventaire',
        description: 'Comptage et ecarts',
        chemin: '/inventaire',
        icone: 'inventaire',
      },
      {
        titre: 'Mouvements de stock',
        description: 'Journal des entrees et sorties',
        chemin: '/stock/mouvements',
        icone: 'mouvements',
      },
    ],
  },
  {
    titre: 'Gestion',
    entrees: [
      { titre: 'Achats', description: 'Commandes fournisseur', chemin: '/achats', icone: 'achats' },
      {
        titre: 'Fournisseurs',
        description: 'Fiches et dettes',
        chemin: '/fournisseurs',
        icone: 'fournisseurs',
      },
      { titre: 'Clients', description: 'Fiches et soldes', chemin: '/clients', icone: 'clients' },
      {
        titre: 'Categories',
        description: 'Rayons du catalogue',
        chemin: '/categories',
        icone: 'etiquette',
      },
    ],
  },
  {
    titre: 'Reglages',
    entrees: [
      {
        titre: 'Ma boutique',
        description: 'Nom, adresse, recu',
        chemin: '/parametres/boutique',
        icone: 'boutique',
      },
      {
        titre: 'Utilisateurs',
        description: 'Comptes, codes et roles',
        chemin: '/parametres/utilisateurs',
        icone: 'utilisateurs',
      },
      {
        titre: 'Imprimante',
        description: 'Bluetooth et ticket de test',
        chemin: '/parametres/imprimante',
        icone: 'imprimante',
      },
      {
        titre: 'Sauvegarde',
        description: 'Exporter et restaurer',
        chemin: '/parametres/sauvegarde',
        icone: 'sauvegarde',
      },
      {
        titre: 'Mon abonnement',
        description: 'Activation et offre en cours',
        chemin: '/abonnement',
        icone: 'document',
      },
      {
        titre: 'Notifications',
        description: 'Ruptures, seuils et rappels',
        chemin: '/notifications',
        icone: 'cloche',
      },
    ],
  },
];

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
  utilisateur: string;
  role: string;
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
  const [visible, setVisible] = useState(false);
  // `monte` reste vrai le temps de l'animation de fermeture : sans lui, la
  // Modal disparaitrait d'un coup au lieu de glisser.
  const [monte, setMonte] = useState(false);
  const glissement = useRef(new Animated.Value(-LARGEUR)).current;
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
      Animated.timing(glissement, { toValue: -LARGEUR, duration: DUREE, useNativeDriver: true }),
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
            style={[st.panneau, { transform: [{ translateX: glissement }] }]}
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
  const marges = useSafeAreaInsets();
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
      // La fermeture est animee ; naviguer dans la foulee ferait sauter le
      // panneau. Un court delai laisse le glissement se terminer.
      setTimeout(() => router.push(chemin as never), DUREE);
    },
    [onFermer, router],
  );

  return (
    <View style={st.contenu}>
      <View style={[st.entete, { paddingTop: marges.top + espaces.m }]}>
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
            <Text style={st.compteRole}>{infos.role}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={st.liste}>
        {GROUPES.map((groupe) => (
          <View key={groupe.titre} style={st.groupe}>
            <Text style={st.groupeTitre}>{groupe.titre.toUpperCase()}</Text>
            {groupe.entrees.map((entree) => (
              <Pressable
                key={entree.chemin}
                onPress={() => aller(entree.chemin)}
                style={({ pressed }) => [st.entree, pressed && st.entreePressee]}
              >
                <IconePastille nom={entree.icone} />
                <View style={st.entreeTextes}>
                  <Text style={st.entreeTitre}>{entree.titre}</Text>
                  <Text style={st.entreeDescription} numberOfLines={1}>
                    {entree.description}
                  </Text>
                </View>
                {entree.chemin === '/stock/alertes' && alertes > 0 ? (
                  <View style={st.badge}>
                    <Text style={st.badgeTexte}>{alertes}</Text>
                  </View>
                ) : (
                  <Icone nom="chevron" taille={16} couleur={couleurs.texteEteint} />
                )}
              </Pressable>
            ))}
          </View>
        ))}

        {infos.onDeconnexion ? (
          <Pressable
            onPress={() => {
              onFermer();
              setTimeout(() => infos.onDeconnexion?.(), DUREE);
            }}
            style={({ pressed }) => [st.deconnexion, pressed && st.entreePressee]}
          >
            <Icone nom="deconnexion" taille={20} couleur={couleurs.danger} />
            <Text style={st.deconnexionTexte}>Fermer la session</Text>
          </Pressable>
        ) : null}

        <Text style={st.pied}>SahelPOS Mobile</Text>
      </ScrollView>
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
    width: LARGEUR,
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

  deconnexion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    minHeight: 52,
    paddingHorizontal: espaces.l,
    marginTop: espaces.s,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.bordure,
  },
  deconnexionTexte: { fontSize: 15, fontWeight: '600', color: couleurs.danger },
  pied: {
    textAlign: 'center',
    fontSize: 11,
    color: couleurs.texteEteint,
    marginTop: espaces.l,
  },

  boutonMenu: { padding: 4, marginRight: espaces.xs },
});
