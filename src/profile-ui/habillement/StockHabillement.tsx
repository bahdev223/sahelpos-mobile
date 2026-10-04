import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { obtenirBase } from '../../db/database';
import { useSession } from '../../../app/_layout';
import { BandeauEtat, couleurs, espaces, rayons } from '../../ui/components';
import { Icone } from '../../ui/icones';
import { BoutonMenu } from '../../ui/tiroir';
import { HABILLEMENT_MOBILE_THEME as H } from './theme';

interface LigneStockVariante {
  id: number;
  idLocal: string;
  produitId: number;
  modele: string;
  collection: string | null;
  sku: string;
  stock: number;
  prix: number;
  libelle: string;
  couleurHex: string | null;
}

async function charger(): Promise<LigneStockVariante[]> {
  const db = await obtenirBase();
  const lignes = await db.getAllAsync<{
    id: number;
    id_local: string;
    produit_id: number;
    modele: string;
    collection: string | null;
    sku: string;
    stock_actuel: number;
    prix_override: number | null;
    prix_unitaire: number;
  }>(`
    SELECT vp.id, vp.id_local, vp.produit_id, p.nom AS modele,
           p.categorie AS collection, vp.sku, vp.stock_actuel,
           vp.prix_override, p.prix_unitaire
      FROM variante_produit vp
      JOIN produit p ON p.id = vp.produit_id
     WHERE vp.actif = 1 AND p.actif = 1
     ORDER BY p.nom COLLATE NOCASE, vp.sku COLLATE NOCASE
  `);

  const resultat: LigneStockVariante[] = [];
  for (const ligne of lignes) {
    const valeurs = await db.getAllAsync<{
      valeur_nom: string;
      code_hex: string | null;
      dimension_code: string;
    }>(
      `SELECT valeur_nom, code_hex, dimension_code
         FROM variante_valeur
        WHERE variante_id = ?
        ORDER BY dimension_ordre, valeur_ordre, valeur_nom`,
      ligne.id,
    );
    resultat.push({
      id: ligne.id,
      idLocal: ligne.id_local,
      produitId: ligne.produit_id,
      modele: ligne.modele,
      collection: ligne.collection,
      sku: ligne.sku,
      stock: ligne.stock_actuel,
      prix: ligne.prix_override ?? ligne.prix_unitaire,
      libelle: valeurs.map((v) => v.valeur_nom).join(' / ') || ligne.sku,
      couleurHex: valeurs.find((v) => v.code_hex)?.code_hex ?? null,
    });
  }
  return resultat;
}

export function StockHabillement() {
  const { revisionSynchronisation, synchroniserMaintenant, boutique } = useSession();
  const [lignes, setLignes] = useState<LigneStockVariante[]>([]);
  const [recherche, setRecherche] = useState('');
  const [rafraichit, setRafraichit] = useState(false);
  const [rupturesSeulement, setRupturesSeulement] = useState(false);

  const relire = useCallback(async () => setLignes(await charger()), []);
  useFocusEffect(useCallback(() => { void relire(); }, [relire, revisionSynchronisation]));

  const visibles = useMemo(() => {
    const q = recherche.trim().toLocaleLowerCase('fr');
    return lignes.filter((ligne) => {
      if (rupturesSeulement && ligne.stock > 0) return false;
      if (!q) return true;
      return (
        ligne.modele.toLocaleLowerCase('fr').includes(q) ||
        ligne.libelle.toLocaleLowerCase('fr').includes(q) ||
        ligne.sku.toLocaleLowerCase('fr').includes(q) ||
        (ligne.collection ?? '').toLocaleLowerCase('fr').includes(q)
      );
    });
  }, [lignes, recherche, rupturesSeulement]);

  const stats = useMemo(() => ({
    variantes: lignes.length,
    stock: lignes.reduce((s, v) => s + v.stock, 0),
    ruptures: lignes.filter((v) => v.stock <= 0).length,
  }), [lignes]);

  const rafraichir = useCallback(async () => {
    setRafraichit(true);
    try {
      await synchroniserMaintenant();
      await relire();
    } finally {
      setRafraichit(false);
    }
  }, [relire, synchroniserMaintenant]);

  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <BoutonMenu />
        <View style={s.enteteTextes}>
          <Text style={s.titre}>Stock par variantes</Text>
          <Text style={s.sousTitre}>{stats.variantes} variantes · {stats.stock} pièces</Text>
        </View>
        <View style={[s.ruptureBadge, stats.ruptures === 0 && s.ruptureBadgeOk]}>
          <Text style={s.ruptureBadgeTexte}>{stats.ruptures} rupture{stats.ruptures > 1 ? 's' : ''}</Text>
        </View>
      </View>

      <View style={s.outils}>
        <View style={s.recherche}>
          <Icone nom="recherche" taille={18} couleur={H.texteFaible} />
          <TextInput
            value={recherche}
            onChangeText={setRecherche}
            placeholder="Modèle, taille, couleur ou SKU"
            placeholderTextColor={H.texteFaible}
            style={s.saisie}
          />
        </View>
        <Pressable
          style={[s.filtre, rupturesSeulement && s.filtreActif]}
          onPress={() => setRupturesSeulement((v) => !v)}
        >
          <Text style={[s.filtreTexte, rupturesSeulement && s.filtreTexteActif]}>Ruptures</Text>
        </Pressable>
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(item) => item.idLocal}
        contentContainerStyle={s.liste}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={rafraichir} />}
        renderItem={({ item }) => (
          <View style={s.carte}>
            <View style={s.gauche}>
              {item.couleurHex ? <View style={[s.couleur, { backgroundColor: item.couleurHex }]} /> : null}
              <View style={s.textes}>
                <Text style={s.modele} numberOfLines={1}>{item.modele}</Text>
                <Text style={s.variante}>{item.libelle}</Text>
                <Text style={s.meta}>{item.collection || 'Sans collection'} · {item.sku}</Text>
              </View>
            </View>
            <View style={s.droite}>
              <Text style={[s.stock, item.stock <= 0 && s.stockRupture]}>{item.stock}</Text>
              <Text style={s.unite}>pièce{item.stock > 1 ? 's' : ''}</Text>
              <Text style={s.prix}>
                {Math.round(item.prix).toLocaleString('fr-FR')} {boutique.devise}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={s.vide}>
            <Text style={s.videTitre}>Aucune variante</Text>
            <Text style={s.videTexte}>Synchronisez les modèles, tailles et couleurs du profil Habillement.</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: H.fond },
  entete: {
    flexDirection: 'row', alignItems: 'center', gap: espaces.m,
    padding: espaces.m, backgroundColor: H.surface,
  },
  enteteTextes: { flex: 1 },
  titre: { fontSize: 19, fontWeight: '900', color: H.texte },
  sousTitre: { marginTop: 2, fontSize: 11, color: H.texteFaible },
  ruptureBadge: {
    paddingVertical: 6, paddingHorizontal: 9, borderRadius: 14,
    backgroundColor: couleurs.dangerDouce,
  },
  ruptureBadgeOk: { backgroundColor: couleurs.succesDouce },
  ruptureBadgeTexte: { fontSize: 10, fontWeight: '900', color: H.texte },
  outils: {
    flexDirection: 'row', gap: espaces.s, padding: espaces.m,
  },
  recherche: {
    flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center',
    gap: espaces.s, paddingHorizontal: espaces.m, borderRadius: rayons.m,
    backgroundColor: H.surface, borderWidth: 1, borderColor: H.bordure,
  },
  saisie: { flex: 1, color: H.texte, fontSize: 13 },
  filtre: {
    minHeight: 46, justifyContent: 'center', paddingHorizontal: espaces.m,
    borderRadius: rayons.m, backgroundColor: H.surface,
    borderWidth: 1, borderColor: H.bordure,
  },
  filtreActif: { backgroundColor: H.primaire, borderColor: H.primaire },
  filtreTexte: { fontSize: 12, fontWeight: '800', color: H.texte },
  filtreTexteActif: { color: '#FFFFFF' },
  liste: { paddingHorizontal: espaces.m, paddingBottom: espaces.xxl, gap: espaces.s },
  carte: {
    minHeight: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: espaces.m, padding: espaces.m, borderRadius: rayons.m,
    backgroundColor: H.surface, borderWidth: 1, borderColor: H.bordure,
  },
  gauche: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: espaces.m },
  couleur: {
    width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    borderColor: H.bordure,
  },
  textes: { flex: 1, minWidth: 0 },
  modele: { fontSize: 14, fontWeight: '900', color: H.texte },
  variante: { marginTop: 3, fontSize: 12, fontWeight: '700', color: H.primaire },
  meta: { marginTop: 3, fontSize: 10, color: H.texteFaible },
  droite: { alignItems: 'flex-end' },
  stock: { fontSize: 21, fontWeight: '900', color: couleurs.succesFonce },
  stockRupture: { color: couleurs.danger },
  unite: { fontSize: 10, color: H.texteFaible },
  prix: { marginTop: 4, fontSize: 10, fontWeight: '700', color: H.texte },
  vide: { alignItems: 'center', padding: espaces.xl },
  videTitre: { fontSize: 16, fontWeight: '900', color: H.texte },
  videTexte: { marginTop: 7, textAlign: 'center', color: H.texteFaible },
});
