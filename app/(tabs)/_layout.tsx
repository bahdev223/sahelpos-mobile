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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: couleurs.primaire,
        tabBarInactiveTintColor: couleurs.texteFaible,
        sceneStyle: { backgroundColor: couleurs.fond },
        tabBarStyle: {
          backgroundColor: couleurs.surface,
          borderTopColor: couleurs.bordure,
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
      <Tabs.Screen name="accueil" options={{ title: 'Accueil', tabBarIcon: icone('accueil') }} />
      <Tabs.Screen name="caisse" options={{ title: 'Caisse', tabBarIcon: icone('caisse') }} />
      <Tabs.Screen
        name="catalogue"
        options={{ title: 'Catalogue', tabBarIcon: icone('catalogue') }}
      />
      <Tabs.Screen name="achats" options={{ title: 'Achats', tabBarIcon: icone('achats') }} />
      <Tabs.Screen name="stock" options={{ title: 'Stock', tabBarIcon: icone('stock') }} />
      <Tabs.Screen name="ventes" options={{ href: null }} />
    </Tabs>
  );
}
