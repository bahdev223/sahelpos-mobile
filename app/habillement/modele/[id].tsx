import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { obtenirProduit } from '../../../src/db/repositories/produit';
import {
  dimensionsProduit, libelleVariante, listerVariantesProduit, type VarianteMobile,
} from '../../../src/db/repositories/variante';
import type { Produit } from '../../../src/domain/types';
import { BandeauEtat, couleurs, espaces, rayons } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';
import { uriImage, formaterFrancs } from '../../produit/nouveau';

export default function FicheModeleHabillement() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [produit, setProduit] = useState<Produit | null>(null);
  const [variantes, setVariantes] = useState<VarianteMobile[]>([]);
  const [dimensions, setDimensions] = useState<Awaited<ReturnType<typeof dimensionsProduit>>>([]);

  useEffect(() => {
    const produitId = Number(id);
    if (!Number.isFinite(produitId)) return;
    void Promise.all([
      obtenirProduit(produitId),
      listerVariantesProduit(produitId),
      dimensionsProduit(produitId),
    ]).then(([p, v, d]) => {
      setProduit(p);
      setVariantes(v);
      setDimensions(d);
    });
  }, [id]);

  const stock = useMemo(
    () => variantes.reduce((total, variante) => total + variante.stockActuel, 0),
    [variantes],
  );

  if (!produit) {
    return (
      <View style={s.page}>
        <BandeauEtat />
        <View style={s.centre}><Text style={s.texteFaible}>Chargement du modèle...</Text></View>
      </View>
    );
  }

  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icone nom="retour" taille={24} couleur={couleurs.texte} />
        </Pressable>
        <View style={s.enteteTextes}>
          <Text style={s.titre} numberOfLines={1}>{produit.nom}</Text>
          <Text style={s.sousTitre}>Fiche modèle · {variantes.length} variantes</Text>
        </View>
        <Pressable onPress={() => router.push({ pathname: '/produit/modifier/[id]', params: { id: String(produit.id) } })}>
          <Icone nom="crayon" taille={21} couleur={couleurs.primaire} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.contenu}>
        {uriImage(produit.cheminImage) ? (
          <Image source={{ uri: uriImage(produit.cheminImage)! }} style={s.hero} resizeMode="cover" />
        ) : (
          <View style={[s.hero, s.heroVide]}>
            <Text style={s.initiale}>{produit.nom.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}

        <View style={s.carteResume}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Prix modèle</Text>
            <Text style={s.kpiValeur}>{formaterFrancs(produit.prixUnitaire)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Stock variantes</Text>
            <Text style={s.kpiValeur}>{stock}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Collection</Text>
            <Text style={s.kpiValeur} numberOfLines={1}>{produit.categorie || '—'}</Text>
          </View>
        </View>

        {dimensions.map((dimension) => (
          <View key={dimension.code} style={s.section}>
            <Text style={s.sectionTitre}>{dimension.nom}</Text>
            <View style={s.choix}>
              {dimension.valeurs.map((valeur) => (
                <View key={valeur.code} style={s.valeur}>
                  {valeur.codeHex ? (
                    <View style={[s.couleur, { backgroundColor: valeur.codeHex }]} />
                  ) : null}
                  <Text style={s.valeurTexte}>{valeur.nom}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={s.section}>
          <View style={s.sectionEntete}>
            <Text style={s.sectionTitre}>Variantes</Text>
            <Text style={s.sectionCompteur}>{variantes.length}</Text>
          </View>
          {variantes.map((variante) => (
            <View key={variante.idLocal} style={s.variante}>
              <View style={s.varianteTextes}>
                <Text style={s.varianteNom}>{libelleVariante(variante)}</Text>
                <Text style={s.varianteSku}>{variante.sku}</Text>
              </View>
              <View style={s.varianteDroite}>
                <Text style={s.variantePrix}>
                  {formaterFrancs(variante.prixOverride ?? produit.prixUnitaire)}
                </Text>
                <Text style={[
                  s.varianteStock,
                  { color: variante.stockActuel > 0 ? couleurs.succesFonce : couleurs.danger },
                ]}>
                  {variante.stockActuel > 0 ? `Stock ${variante.stockActuel}` : 'Rupture'}
                </Text>
              </View>
            </View>
          ))}
        </View>
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
  enteteTextes: { flex: 1 },
  titre: { fontSize: 18, fontWeight: '900', color: couleurs.texte },
  sousTitre: { marginTop: 2, fontSize: 11, color: couleurs.texteFaible },
  contenu: { padding: espaces.m, paddingBottom: espaces.xxl },
  hero: { width: '100%', aspectRatio: 1.35, borderRadius: rayons.l, backgroundColor: couleurs.surface },
  heroVide: { alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.primaireDouce },
  initiale: { fontSize: 64, fontWeight: '900', color: couleurs.primaire },
  carteResume: {
    flexDirection: 'row', gap: espaces.s, marginTop: espaces.m,
  },
  kpi: {
    flex: 1, minWidth: 0, padding: espaces.m, borderRadius: rayons.m,
    borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface,
  },
  kpiLabel: { fontSize: 10, color: couleurs.texteFaible, fontWeight: '700' },
  kpiValeur: { marginTop: 5, fontSize: 14, color: couleurs.texte, fontWeight: '900' },
  section: {
    marginTop: espaces.l, padding: espaces.m, borderRadius: rayons.l,
    borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface,
  },
  sectionEntete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitre: { fontSize: 15, fontWeight: '900', color: couleurs.texte },
  sectionCompteur: { color: couleurs.primaire, fontWeight: '900' },
  choix: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s, marginTop: espaces.m },
  valeur: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11,
    paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: couleurs.bordure,
    backgroundColor: couleurs.fond,
  },
  couleur: { width: 16, height: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: couleurs.bordure },
  valeurTexte: { color: couleurs.texte, fontSize: 12, fontWeight: '700' },
  variante: {
    flexDirection: 'row', alignItems: 'center', gap: espaces.m, paddingVertical: espaces.m,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.bordure,
  },
  varianteTextes: { flex: 1 },
  varianteNom: { fontSize: 13, fontWeight: '800', color: couleurs.texte },
  varianteSku: { marginTop: 3, fontSize: 10, color: couleurs.texteFaible },
  varianteDroite: { alignItems: 'flex-end' },
  variantePrix: { fontSize: 13, fontWeight: '900', color: couleurs.primaire },
  varianteStock: { marginTop: 3, fontSize: 10, fontWeight: '800' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  texteFaible: { color: couleurs.texteFaible },
});
