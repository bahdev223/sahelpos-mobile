import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSession } from '../_layout';
import { construireNavigationMobile } from '../../src/domain/navigation-mobile';
import { BandeauEtat, espaces, rayons } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { couleurs } from '../../src/ui/theme';
import { HABILLEMENT_MOBILE_THEME as H } from '../../src/profile-ui/habillement/theme';

/** Les mêmes rubriques que le tiroir, dans un vrai écran pour le téléphone. */
export default function Menu() {
  const router = useRouter();
  const { profilCommerce, utilisateur, boutique } = useSession();
  const habillement = profilCommerce?.secteur === 'HABILLEMENT';
  const theme = habillement ? H : couleurs;
  const groupes = construireNavigationMobile(
    profilCommerce?.secteur ?? 'COMMERCE_GENERAL',
    utilisateur?.role ?? 'vendeur',
    profilCommerce?.capabilities_effectives ?? [],
  );
  return (
    <View style={[styles.page, { backgroundColor: theme.fond }]}>
      <BandeauEtat fond={theme.primaire} />
      <View style={[styles.entete, { backgroundColor: theme.primaire }]}>
        <Text style={styles.surTitre}>SAHELPOS · NAVIGATION</Text>
        <Text style={styles.titre}>Mes espaces</Text>
        <Text style={styles.boutique} numberOfLines={1}>{boutique.nom}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.liste}>
        {groupes.map((groupe) => (
          <View key={groupe.id} style={styles.groupe}>
            <Text style={[styles.groupeTitre, { color: theme.texte }]}>{groupe.titre}</Text>
            {groupe.entrees.map((entree) => (
              <Pressable key={entree.id} accessibilityRole="button"
                accessibilityLabel={entree.titre}
                onPress={() => router.push(entree.chemin as never)}
                style={({ pressed }) => [
                  styles.ligne,
                  { backgroundColor: theme.surface, borderColor: theme.bordure },
                  pressed && { opacity: 0.75 },
                ]}>
                <View style={[styles.icone, { backgroundColor: habillement ? H.primaireClair : couleurs.primaireDouce }]}>
                  <Icone nom={entree.icone} taille={20} couleur={theme.primaire} />
                </View>
                <View style={styles.textes}>
                  <Text style={[styles.nom, { color: theme.texte }]}>{entree.titre}</Text>
                  <Text style={[styles.description, { color: theme.texteFaible }]} numberOfLines={1}>{entree.description}</Text>
                </View>
                <Icone nom="chevron" taille={17} couleur={theme.texteFaible} />
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  entete: { paddingHorizontal: espaces.l, paddingTop: espaces.l, paddingBottom: espaces.xl },
  surTitre: { color: '#ffffffd9', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  titre: { color: '#fff', fontSize: 25, fontWeight: '900', marginTop: 5 },
  boutique: { color: '#ffffffcf', marginTop: 4, fontSize: 12 },
  liste: { padding: espaces.l, paddingBottom: 44 },
  groupe: { marginBottom: espaces.l },
  groupeTitre: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  ligne: { minHeight: 61, paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1,
    borderRadius: rayons.m, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 7 },
  icone: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  textes: { flex: 1, minWidth: 0 },
  nom: { fontSize: 14, fontWeight: '700' },
  description: { fontSize: 11, marginTop: 2 },
});
