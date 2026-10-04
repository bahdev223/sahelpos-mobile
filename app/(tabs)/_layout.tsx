/**
 * Les cinq onglets de l'application.
 *
 * POURQUOI CINQ ONGLETS
 * ---------------------------
 * L'achat est une action quotidienne de stock : il doit etre atteignable sans
 * ouvrir le tiroir. Les cinq libelles restent courts et conservent une cible
 * tactile de 48 points sur le plus petit telephone pris en charge.
 *
 * POURQUOI CET ORDRE
 * ------------------
 * Accueil d'abord parce qu'on ouvre l'application pour savoir ou on en est,
 * puis la caisse, le catalogue, les achats et le stock. Les ventes et tout le
 * reste sont dans le tiroir.
 *
 * POURQUOI LES PICTOGRAMMES NE SONT PLUS DESSINES ICI
 * --------------------------------------------------
 * Ils l'etaient, en cinq exemplaires, pendant que le reste de l'application
 * n'en avait aucun. Ils vivent desormais dans `src/ui/icones.tsx`, ou tous les
 * ecrans peuvent les reprendre.
 *
 * `href: null` sur l'ecran des ventes conserve la route /ventes — le tiroir et
 * l'accueil y renvoient — sans lui donner d'onglet.
 */
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { couleurs } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import type { NomIcone } from '../../src/ui/icones';
import { useSession } from '../_layout';
import { resoudreProfilUIMobile } from '../../src/domain/commerce';
import { HABILLEMENT_MOBILE_THEME as H } from '../../src/profile-ui/habillement/theme';
import { ongletsAutorises } from '../../src/domain/permissions-mobile';

/**
 * Les pictogrammes de la barre sont un peu plus grands que dans le corps du
 * texte : c'est la cible qu'on vise sans regarder, en tenant le telephone d'une
 * main.
 */
function icone(nom: NomIcone) {
  return ({ color }: { color: ColorValue }) => (
    <Icone nom={nom} taille={25} couleur={String(color)} />
  );
}

export default function DispositionOnglets() {
  const marges = useSafeAreaInsets();
  const { profilCommerce, utilisateur } = useSession();
  const profilUI = resoudreProfilUIMobile(profilCommerce);
  const l = profilUI.libelles;
  const habillement = profilUI.code === 'HABILLEMENT';
  const active = habillement ? H.primaire : couleurs.primaire;
  const inactive = habillement ? H.texteFaible : couleurs.texteFaible;
  const fond = habillement ? H.fond : couleurs.fond;
  const surface = habillement ? H.surface : couleurs.surface;
  const bordure = habillement ? H.bordure : couleurs.bordure;
  const onglets = ongletsAutorises(utilisateur?.role ?? 'vendeur');

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: active,
        tabBarInactiveTintColor: inactive,
        sceneStyle: { backgroundColor: fond },
        tabBarStyle: {
          backgroundColor: surface,
          borderTopColor: bordure,
          // Hauteur imposee pour garder des cibles confortables : la valeur par
          // defaut de React Navigation descend sous les 48 points utiles des
          // que le systeme reserve une barre de gestes.
          height: 62 + marges.bottom,
          paddingTop: 6,
          paddingBottom: marges.bottom + 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="accueil" options={{ title: l.accueil, tabBarIcon: icone('accueil') }} />
      <Tabs.Screen name="caisse" options={{ title: l.caisse, tabBarIcon: icone('caisse') }} />
      <Tabs.Screen
        name="catalogue"
        options={{ title: l.catalogue, tabBarIcon: icone('catalogue'), href: onglets.catalogue ? undefined : null }}
      />
      <Tabs.Screen name="achats" options={{ title: l.achats, tabBarIcon: icone('achats'), href: onglets.achats ? undefined : null }} />
      <Tabs.Screen name="stock" options={{ title: l.stock, tabBarIcon: icone('stock'), href: onglets.stock ? undefined : null }} />
      <Tabs.Screen name="ventes" options={{ href: null }} />
    </Tabs>
  );
}
