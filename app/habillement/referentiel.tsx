import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { obtenirBase } from '../../src/db/database';
import { BandeauEtat, couleurs, espaces, rayons } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { HABILLEMENT_MOBILE_THEME as H } from '../../src/profile-ui/habillement/theme';

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
        `SELECT d.code AS dimension_code, d.nom AS dimension_nom, d.ordre AS dimension_ordre,
                         v.code AS valeur_code, v.nom AS valeur_nom, v.code_hex,
                         v.ordre AS valeur_ordre
           FROM valeur_dimension_ref v
           JOIN dimension_variante_ref d ON d.id_serveur = v.dimension_id_serveur
          ORDER BY d.ordre, v.ordre, v.nom`,
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
          <Icone nom="retour" taille={24} couleur={H.texte} />
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
  page: { flex: 1, backgroundColor: H.fond },
  entete: {
    flexDirection: 'row', alignItems: 'center', gap: espaces.m,
    padding: espaces.m, backgroundColor: H.surface,
  },
  titre: { fontSize: 19, fontWeight: '900', color: H.texte },
  sousTitre: { marginTop: 2, fontSize: 11, color: H.texteFaible },
  contenu: { padding: espaces.m, paddingBottom: espaces.xxl, gap: espaces.m },
  carte: {
    padding: espaces.m, borderRadius: rayons.l, borderWidth: 1,
    borderColor: H.bordure, backgroundColor: H.surface,
  },
  dimension: { fontSize: 15, fontWeight: '900', color: H.texte },
  valeurs: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s, marginTop: espaces.m },
  puce: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8,
    paddingHorizontal: 11, borderRadius: 18, backgroundColor: H.fond,
    borderWidth: 1, borderColor: H.bordure,
  },
  couleur: { width: 16, height: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: H.bordure },
  puceTexte: { color: H.texte, fontWeight: '700', fontSize: 12 },
  vide: { alignItems: 'center', padding: espaces.xl },
  videTitre: { fontSize: 16, fontWeight: '900', color: H.texte },
  videTexte: { marginTop: 8, textAlign: 'center', color: H.texteFaible, lineHeight: 19 },
});
