import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { useSession } from '../_layout';
import { construireNavigationMobile, navigationSecondaire } from '../../src/domain/navigation-mobile';
import { BandeauEtat, espaces, rayons } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { couleurs } from '../../src/ui/theme';
import { HABILLEMENT_MOBILE_THEME as H } from '../../src/profile-ui/habillement/theme';

/** Les mêmes rubriques que le tiroir, dans un vrai écran pour le téléphone. */
export default function Menu() {
  const router = useRouter();
  const [recherche, setRecherche] = useState('');
  const { width, fontScale } = useWindowDimensions();
  const deuxColonnes = width >= 768 && fontScale < 1.5;
  const { profilCommerce, utilisateur, boutique } = useSession();
  const habillement = profilCommerce?.secteur === 'HABILLEMENT';
  const theme = habillement ? H : couleurs;
  const normaliser = (texte: string) => texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const terme = normaliser(recherche.trim());
  const groupes = navigationSecondaire(construireNavigationMobile(
    profilCommerce?.secteur ?? 'COMMERCE_GENERAL',
    utilisateur?.role ?? 'vendeur',
    profilCommerce?.capabilities_effectives ?? [],
  )).map(groupe => ({ ...groupe,
    entrees: groupe.entrees.filter(entree => normaliser(`${groupe.titre} ${entree.titre}`).includes(terme)),
  })).filter(groupe => groupe.entrees.length > 0);
  return (
    <View style={[styles.page, { backgroundColor: theme.fond }]}>
      <BandeauEtat fond={theme.primaire} />
      <View style={[styles.entete, { backgroundColor: theme.primaire }]}>
        <Text style={styles.titre}>Menu</Text>
        <Text style={styles.boutique} numberOfLines={1}>{boutique.nom}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.liste}>
        <TextInput value={recherche} onChangeText={setRecherche}
          accessibilityLabel="Rechercher dans le menu" placeholder="Rechercher une rubrique"
          placeholderTextColor={theme.texteFaible}
          style={[styles.recherche, { color: theme.texte, backgroundColor: theme.surface, borderColor: theme.bordure }]} />
        <View style={styles.groupes}>
        {groupes.map((groupe) => (
          <View key={groupe.id} style={[styles.groupe, { width: deuxColonnes ? '48%' : '100%' }]}>
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
                </View>
                <Icone nom="chevron" taille={17} couleur={theme.texteFaible} />
              </Pressable>
            ))}
          </View>
        ))}
        </View>
        {groupes.length === 0 ? <Text style={{ color: theme.texteFaible }}>Aucune rubrique trouvée.</Text> : null}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  entete: { paddingHorizontal: espaces.l, paddingVertical: espaces.m },
  titre: { color: '#fff', fontSize: 23, fontWeight: '800' },
  boutique: { color: '#ffffffcf', marginTop: 4, fontSize: 12 },
  liste: { padding: espaces.l, paddingBottom: 44, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  recherche: { minHeight: 48, borderWidth: 1, borderRadius: rayons.m, padding: espaces.m, marginBottom: espaces.l, fontSize: 15 },
  groupes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  groupe: { marginBottom: espaces.l },
  groupeTitre: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  ligne: { minHeight: 54, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1,
    borderRadius: rayons.m, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 7 },
  icone: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  textes: { flex: 1, minWidth: 0 },
  nom: { fontSize: 14, fontWeight: '700' },
});
