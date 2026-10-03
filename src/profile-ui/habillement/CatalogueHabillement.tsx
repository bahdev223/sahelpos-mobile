import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from 'react-native';

import { obtenirBase } from '../../db/database';
import { stockTotalVariantes } from '../../db/repositories/variante';
import { useSession } from '../../../app/_layout';
import { BandeauEtat, couleurs, espaces, rayons } from '../../ui/components';
import { Icone } from '../../ui/icones';
import { BoutonMenu } from '../../ui/tiroir';
import { uriImage, formaterFrancs } from '../../../app/produit/nouveau';

interface Modele {
  id: number;
  nom: string;
  categorie: string | null;
  prix: number;
  image: string | null;
  actif: number;
  nbVariantes: number;
  stockVariantes: number;
  couleurs: string[];
  tailles: string[];
}

async function chargerModeles(): Promise<Modele[]> {
  const db = await obtenirBase();
  const produits = await db.getAllAsync<{
    id: number; nom: string; categorie: string | null; prix_unitaire: number;
    chemin_image: string | null; actif: number;
  }>(
    `SELECT id, nom, categorie, prix_unitaire, chemin_image, actif
       FROM produit ORDER BY nom COLLATE NOCASE`,
  );
  const resultat: Modele[] = [];
  for (const p of produits) {
    const variantes = await db.getAllAsync<{
      id: number; dimension_code: string | null; valeur_nom: string | null;
    }>(
      `SELECT vp.id, vv.dimension_code, vv.valeur_nom
         FROM variante_produit vp
         LEFT JOIN variante_valeur vv ON vv.variante_id = vp.id
        WHERE vp.produit_id = ? AND vp.actif = 1`,
      p.id,
    );
    const couleursSet = new Set<string>();
    const taillesSet = new Set<string>();
    for (const v of variantes) {
      const code = (v.dimension_code ?? '').toUpperCase();
      if (code.includes('COULEUR') && v.valeur_nom) couleursSet.add(v.valeur_nom);
      if ((code.includes('TAILLE') || code.includes('SIZE') || code.includes('POINTURE')) && v.valeur_nom) {
        taillesSet.add(v.valeur_nom);
      }
    }
    resultat.push({
      id: p.id,
      nom: p.nom,
      categorie: p.categorie,
      prix: p.prix_unitaire,
      image: p.chemin_image,
      actif: p.actif,
      nbVariantes: new Set(variantes.map((v) => v.id)).size,
      stockVariantes: await stockTotalVariantes(p.id),
      couleurs: [...couleursSet].slice(0, 4),
      tailles: [...taillesSet].slice(0, 5),
    });
  }
  return resultat;
}

export function CatalogueHabillement() {
  const router = useRouter();
  const { revisionSynchronisation, synchroniserMaintenant } = useSession();
  const [modeles, setModeles] = useState<Modele[]>([]);
  const [recherche, setRecherche] = useState('');
  const [rafraichit, setRafraichit] = useState(false);

  const charger = useCallback(async () => setModeles(await chargerModeles()), []);
  useFocusEffect(useCallback(() => { void charger(); }, [charger, revisionSynchronisation]));

  const visibles = useMemo(() => {
    const q = recherche.trim().toLocaleLowerCase('fr');
    return modeles.filter((m) => m.actif === 1 && (!q ||
      m.nom.toLocaleLowerCase('fr').includes(q) ||
      (m.categorie ?? '').toLocaleLowerCase('fr').includes(q)));
  }, [modeles, recherche]);

  const rafraichir = useCallback(async () => {
    setRafraichit(true);
    try {
      await synchroniserMaintenant();
      await charger();
    } finally {
      setRafraichit(false);
    }
  }, [charger, synchroniserMaintenant]);

  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <BoutonMenu />
        <View style={s.enteteTextes}>
          <Text style={s.titre}>Modèles</Text>
          <Text style={s.sousTitre}>Tailles · couleurs · variantes</Text>
        </View>
        <Pressable style={s.boutonIcone} onPress={() => router.push('/habillement/referentiel')}>
          <Icone nom="etiquette" taille={20} couleur={couleurs.primaire} />
        </Pressable>
      </View>

      <View style={s.recherche}>
        <Icone nom="recherche" taille={18} couleur={couleurs.texteFaible} />
        <TextInput
          style={s.saisie}
          value={recherche}
          onChangeText={setRecherche}
          placeholder="Rechercher un modèle ou une collection"
          placeholderTextColor={couleurs.texteFaible}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.raccourcis}>
        <Pressable style={s.puce} onPress={() => router.push('/habillement/referentiel')}>
          <Text style={s.puceTexte}>Tailles & couleurs</Text>
        </Pressable>
        <Pressable style={s.puce} onPress={() => router.push('/inventaire')}>
          <Text style={s.puceTexte}>Inventaire variantes</Text>
        </Pressable>
        <Pressable style={s.puce} onPress={() => router.push('/achats')}>
          <Text style={s.puceTexte}>Approvisionnements</Text>
        </Pressable>
      </ScrollView>

      <FlatList
        data={visibles}
        numColumns={2}
        keyExtractor={(item) => String(item.id)}
        columnWrapperStyle={s.ligne}
        contentContainerStyle={s.liste}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={rafraichir} />}
        renderItem={({ item }) => (
          <Pressable
            style={s.carte}
            onPress={() => router.push({ pathname: '/habillement/modele/[id]', params: { id: String(item.id) } })}
          >
            {uriImage(item.image) ? (
              <Image source={{ uri: uriImage(item.image)! }} style={s.image} resizeMode="cover" />
            ) : (
              <View style={[s.image, s.imageVide]}>
                <Text style={s.initiale}>{item.nom.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <View style={s.corps}>
              <Text style={s.nom} numberOfLines={2}>{item.nom}</Text>
              <Text style={s.collection} numberOfLines={1}>{item.categorie || 'Sans collection'}</Text>
              <Text style={s.prix}>{formaterFrancs(item.prix)}</Text>
              <View style={s.meta}>
                <Text style={s.metaTexte}>{item.nbVariantes} variantes</Text>
                <Text style={s.metaTexte}>Stock {item.stockVariantes}</Text>
              </View>
              {item.tailles.length > 0 ? (
                <Text style={s.options} numberOfLines={1}>{item.tailles.join(' · ')}</Text>
              ) : null}
              {item.couleurs.length > 0 ? (
                <Text style={s.options} numberOfLines={1}>{item.couleurs.join(' · ')}</Text>
              ) : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={s.vide}>
            <Text style={s.videTitre}>Aucun modèle</Text>
            <Text style={s.videTexte}>Les modèles et leurs variantes synchronisés depuis le Web apparaîtront ici.</Text>
          </View>
        }
      />

      <Pressable
        style={s.fab}
        onPress={() => router.push('/habillement/modele/nouveau')}
        accessibilityLabel="Nouveau modèle"
      >
        <Icone nom="plus" taille={28} couleur={couleurs.texteInverse} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  entete: {
    flexDirection: 'row', alignItems: 'center', gap: espaces.m,
    paddingHorizontal: espaces.m, paddingVertical: espaces.m, backgroundColor: couleurs.surface,
  },
  enteteTextes: { flex: 1 },
  titre: { fontSize: 21, fontWeight: '900', color: couleurs.texte },
  sousTitre: { marginTop: 2, fontSize: 12, color: couleurs.texteFaible },
  boutonIcone: {
    width: 42, height: 42, borderRadius: rayons.m, borderWidth: 1,
    borderColor: couleurs.bordure, alignItems: 'center', justifyContent: 'center',
  },
  recherche: {
    margin: espaces.m, marginBottom: espaces.s, minHeight: 48, paddingHorizontal: espaces.m,
    flexDirection: 'row', alignItems: 'center', gap: espaces.s, borderRadius: rayons.m,
    borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface,
  },
  saisie: { flex: 1, color: couleurs.texte, fontSize: 14 },
  raccourcis: { gap: espaces.s, paddingHorizontal: espaces.m, paddingBottom: espaces.m },
  puce: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 20, backgroundColor: couleurs.primaireDouce },
  puceTexte: { color: couleurs.primaire, fontSize: 12, fontWeight: '800' },
  liste: { paddingHorizontal: espaces.m, paddingBottom: 110, gap: espaces.m },
  ligne: { gap: espaces.m },
  carte: {
    flex: 1, minWidth: 0, borderRadius: rayons.l, overflow: 'hidden',
    backgroundColor: couleurs.surface, borderWidth: 1, borderColor: couleurs.bordure,
  },
  image: { width: '100%', aspectRatio: 1 },
  imageVide: { alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.primaireDouce },
  initiale: { fontSize: 42, fontWeight: '900', color: couleurs.primaire },
  corps: { padding: 11 },
  nom: { color: couleurs.texte, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  collection: { marginTop: 3, color: couleurs.texteFaible, fontSize: 11 },
  prix: { marginTop: 7, color: couleurs.primaire, fontSize: 15, fontWeight: '900' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginTop: 7 },
  metaTexte: { fontSize: 10, color: couleurs.texteFaible, fontWeight: '700' },
  options: { marginTop: 5, fontSize: 10, color: couleurs.texte },
  vide: { padding: 40, alignItems: 'center' },
  videTitre: { fontSize: 17, fontWeight: '900', color: couleurs.texte },
  videTexte: { marginTop: 8, textAlign: 'center', color: couleurs.texteFaible, lineHeight: 19 },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29,
    backgroundColor: couleurs.primaire, alignItems: 'center', justifyContent: 'center',
  },
});
