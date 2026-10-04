import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { obtenirBase } from '../../src/db/database';
import { uriImage, formaterFrancs } from '../produit/nouveau';
import { HABILLEMENT_MOBILE_THEME as H } from '../../src/profile-ui/habillement/theme';
import { Icone } from '../../src/ui/icones';
import { espaces, rayons } from '../../src/ui/components';

interface CarteShowroom {
  id: number;
  nom: string;
  categorie: string | null;
  prix: number;
  image: string | null;
  variantes: number;
  stock: number;
  couleurs: string[];
}

async function charger(): Promise<CarteShowroom[]> {
  const db = await obtenirBase();
  const produits = await db.getAllAsync<{
    id: number; nom: string; categorie: string | null; prix_unitaire: number; chemin_image: string | null;
  }>('SELECT id, nom, categorie, prix_unitaire, chemin_image FROM produit WHERE actif = 1 ORDER BY nom COLLATE NOCASE');

  const sortie: CarteShowroom[] = [];
  for (const p of produits) {
    const stats = await db.getFirstAsync<{ n: number; stock: number }>(
      'SELECT COUNT(*) AS n, COALESCE(SUM(stock_actuel), 0) AS stock FROM variante_produit WHERE produit_id = ? AND actif = 1',
      p.id,
    );
    const couleurs = await db.getAllAsync<{ nom: string }>(
      "SELECT DISTINCT vv.valeur_nom AS nom FROM variante_valeur vv JOIN variante_produit vp ON vp.id = vv.variante_id WHERE vp.produit_id = ? AND vp.actif = 1 AND UPPER(vv.dimension_code) LIKE '%COULEUR%' ORDER BY vv.valeur_ordre LIMIT 5",
      p.id,
    );
    sortie.push({
      id: p.id,
      nom: p.nom,
      categorie: p.categorie,
      prix: p.prix_unitaire,
      image: p.chemin_image,
      variantes: stats?.n ?? 0,
      stock: stats?.stock ?? 0,
      couleurs: couleurs.map((x) => x.nom),
    });
  }
  return sortie;
}

export default function ShowroomHabillement() {
  const router = useRouter();
  const [modeles, setModeles] = useState<CarteShowroom[]>([]);
  const [recherche, setRecherche] = useState('');

  useFocusEffect(useCallback(() => {
    void charger().then(setModeles);
  }, []));

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return modeles;
    return modeles.filter(
      (m) => m.nom.toLowerCase().includes(q) || (m.categorie ?? '').toLowerCase().includes(q),
    );
  }, [modeles, recherche]);

  return (
    <View style={s.page}>
      <View style={s.entete}>
        <Pressable onPress={() => router.back()}>
          <Icone nom="retour" taille={23} couleur={H.texte} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.titre}>Showroom</Text>
          <Text style={s.sous}>Vue visuelle des modèles disponibles</Text>
        </View>
      </View>

      <View style={s.recherche}>
        <Icone nom="recherche" taille={18} couleur={H.texteFaible} />
        <TextInput
          value={recherche}
          onChangeText={setRecherche}
          placeholder="Rechercher un modèle ou une collection"
          placeholderTextColor={H.texteFaible}
          style={s.input}
        />
      </View>

      <ScrollView contentContainerStyle={s.grille}>
        {visibles.map((m) => (
          <Pressable
            key={m.id}
            style={s.carte}
            onPress={() =>
              router.push({ pathname: '/habillement/modele/[id]', params: { id: String(m.id) } })
            }
          >
            {uriImage(m.image) ? (
              <Image source={{ uri: uriImage(m.image)! }} style={s.image} resizeMode="cover" />
            ) : (
              <View style={[s.image, s.imageVide]}>
                <Text style={s.initiale}>{m.nom[0]?.toUpperCase()}</Text>
              </View>
            )}
            <View style={s.corps}>
              <Text style={s.collection}>{m.categorie || 'Collection'}</Text>
              <Text style={s.nom} numberOfLines={2}>{m.nom}</Text>
              <Text style={s.prix}>{formaterFrancs(m.prix)}</Text>
              <View style={s.meta}>
                <Text style={s.metaTexte}>{m.variantes} variantes</Text>
                <Text style={s.metaTexte}>Stock {m.stock}</Text>
              </View>
              {m.couleurs.length ? (
                <Text style={s.couleurs} numberOfLines={1}>{m.couleurs.join(' · ')}</Text>
              ) : null}
            </View>
          </Pressable>
        ))}
        {!visibles.length ? (
          <View style={s.vide}>
            <Text style={s.videTitre}>Aucun modèle</Text>
            <Text style={s.videTexte}>Les modèles actifs apparaîtront ici.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: H.fond },
  entete: {
    flexDirection: 'row', alignItems: 'center', gap: espaces.m, padding: espaces.m,
    backgroundColor: H.surface, borderBottomWidth: 1, borderBottomColor: H.bordure,
  },
  titre: { fontSize: 20, fontWeight: '900', color: H.texte },
  sous: { marginTop: 2, fontSize: 11, color: H.texteFaible },
  recherche: {
    margin: espaces.m, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: espaces.s,
    paddingHorizontal: espaces.m, borderRadius: rayons.m, backgroundColor: H.surface,
    borderWidth: 1, borderColor: H.bordure,
  },
  input: { flex: 1, fontSize: 13, color: H.texte },
  grille: {
    paddingHorizontal: espaces.m, paddingBottom: espaces.xxl,
    flexDirection: 'row', flexWrap: 'wrap', gap: espaces.m,
  },
  carte: {
    width: '47%', flexGrow: 1, maxWidth: '48%', borderRadius: rayons.l, overflow: 'hidden',
    backgroundColor: H.surface, borderWidth: 1, borderColor: H.bordure,
  },
  image: { width: '100%', aspectRatio: 0.82, backgroundColor: H.fondSecondaire },
  imageVide: { alignItems: 'center', justifyContent: 'center' },
  initiale: { fontSize: 48, fontWeight: '900', color: H.primaire },
  corps: { padding: 11 },
  collection: {
    fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.7,
    color: H.texteEteint, fontWeight: '800',
  },
  nom: { marginTop: 4, fontSize: 14, lineHeight: 18, fontWeight: '900', color: H.texte },
  prix: { marginTop: 6, fontSize: 14, fontWeight: '900', color: H.primaire },
  meta: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  metaTexte: { fontSize: 9, color: H.texteFaible, fontWeight: '700' },
  couleurs: { marginTop: 6, fontSize: 9, color: H.texteCorps },
  vide: { width: '100%', padding: 40, alignItems: 'center' },
  videTitre: { fontSize: 16, fontWeight: '900', color: H.texte },
  videTexte: { marginTop: 6, color: H.texteFaible },
});
