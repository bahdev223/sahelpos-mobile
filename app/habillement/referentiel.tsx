import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { obtenirBase } from '../../src/db/database';
import { BandeauEtat, couleurs, espaces, rayons } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';

interface Ligne {
  dimension_code: string;
  dimension_nom: string;
  dimension_ordre: number;
  valeur_code: string;
  valeur_nom: string;
  code_hex: string | null;
  valeur_ordre: number;
}

export default function ReferentielHabillement() {
  const router = useRouter();
  const [lignes, setLignes] = useState<Ligne[]>([]);

  useFocusEffect(useCallback(() => {
    void (async () => {
      const db = await obtenirBase();
      setLignes(await db.getAllAsync<Ligne>(
        `SELECT DISTINCT dimension_code, dimension_nom, dimension_ordre,
                         valeur_code, valeur_nom, code_hex, valeur_ordre
           FROM variante_valeur
          ORDER BY dimension_ordre, valeur_ordre, valeur_nom`,
      ));
    })();
  }, []));

  const dimensions = new Map<string, { nom: string; valeurs: Ligne[] }>();
  for (const ligne of lignes) {
    const courant = dimensions.get(ligne.dimension_code) ?? { nom: ligne.dimension_nom, valeurs: [] };
    courant.valeurs.push(ligne);
    dimensions.set(ligne.dimension_code, courant);
  }

  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icone nom="retour" taille={24} couleur={couleurs.texte} />
        </Pressable>
        <View>
          <Text style={s.titre}>Tailles & couleurs</Text>
          <Text style={s.sousTitre}>Référentiel Habillement synchronisé</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={s.contenu}>
        {[...dimensions.entries()].map(([code, dimension]) => (
          <View key={code} style={s.carte}>
            <Text style={s.dimension}>{dimension.nom}</Text>
            <View style={s.valeurs}>
              {dimension.valeurs.map((valeur) => (
                <View key={`${code}:${valeur.valeur_code}`} style={s.puce}>
                  {valeur.code_hex ? (
                    <View style={[s.couleur, { backgroundColor: valeur.code_hex }]} />
                  ) : null}
                  <Text style={s.puceTexte}>{valeur.valeur_nom}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
        {lignes.length === 0 ? (
          <View style={s.vide}>
            <Text style={s.videTitre}>Aucune taille ou couleur synchronisée</Text>
            <Text style={s.videTexte}>Créez les variantes depuis le Web, puis synchronisez le mobile.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  entete: {
    flexDirection: 'row', alignItems: 'center', gap: espaces.m,
    padding: espaces.m, backgroundColor: couleurs.surface,
  },
  titre: { fontSize: 19, fontWeight: '900', color: couleurs.texte },
  sousTitre: { marginTop: 2, fontSize: 11, color: couleurs.texteFaible },
  contenu: { padding: espaces.m, paddingBottom: espaces.xxl, gap: espaces.m },
  carte: {
    padding: espaces.m, borderRadius: rayons.l, borderWidth: 1,
    borderColor: couleurs.bordure, backgroundColor: couleurs.surface,
  },
  dimension: { fontSize: 15, fontWeight: '900', color: couleurs.texte },
  valeurs: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s, marginTop: espaces.m },
  puce: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8,
    paddingHorizontal: 11, borderRadius: 18, backgroundColor: couleurs.fond,
    borderWidth: 1, borderColor: couleurs.bordure,
  },
  couleur: { width: 16, height: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: couleurs.bordure },
  puceTexte: { color: couleurs.texte, fontWeight: '700', fontSize: 12 },
  vide: { alignItems: 'center', padding: espaces.xl },
  videTitre: { fontSize: 16, fontWeight: '900', color: couleurs.texte },
  videTexte: { marginTop: 8, textAlign: 'center', color: couleurs.texteFaible, lineHeight: 19 },
});
