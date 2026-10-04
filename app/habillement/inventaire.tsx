import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { obtenirBase } from '../../src/db/database';
import { corrigerStockVariante } from '../../src/db/repositories/variante';
import { useSession } from '../_layout';
import { BandeauEtat, Bouton, couleurs, espaces, rayons } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { HABILLEMENT_MOBILE_THEME as H } from '../../src/profile-ui/habillement/theme';

interface LigneInventaireVariante {
  id: number;
  modele: string;
  sku: string;
  stock: number;
  libelle: string;
  couleurHex: string | null;
}

async function chargerLignes(): Promise<LigneInventaireVariante[]> {
  const db = await obtenirBase();
  const variantes = await db.getAllAsync<{
    id: number;
    modele: string;
    sku: string;
    stock_actuel: number;
  }>(
    `SELECT vp.id, p.nom AS modele, vp.sku, vp.stock_actuel
       FROM variante_produit vp
       JOIN produit p ON p.id = vp.produit_id
      WHERE vp.actif = 1 AND p.actif = 1
      ORDER BY p.nom COLLATE NOCASE, vp.sku COLLATE NOCASE`,
  );

  const resultat: LigneInventaireVariante[] = [];
  for (const variante of variantes) {
    const valeurs = await db.getAllAsync<{
      valeur_nom: string;
      code_hex: string | null;
    }>(
      `SELECT valeur_nom, code_hex
         FROM variante_valeur
        WHERE variante_id = ?
        ORDER BY dimension_ordre, valeur_ordre, valeur_nom`,
      variante.id,
    );
    resultat.push({
      id: variante.id,
      modele: variante.modele,
      sku: variante.sku,
      stock: variante.stock_actuel,
      libelle: valeurs.map((v) => v.valeur_nom).join(' / ') || variante.sku,
      couleurHex: valeurs.find((v) => v.code_hex)?.code_hex ?? null,
    });
  }
  return resultat;
}

export default function InventaireHabillement() {
  const router = useRouter();
  const { revisionSynchronisation, synchroniserMaintenant } = useSession();
  const [lignes, setLignes] = useState<LigneInventaireVariante[]>([]);
  const [saisies, setSaisies] = useState<Record<number, string>>({});
  const [recherche, setRecherche] = useState('');
  const [rafraichit, setRafraichit] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    const data = await chargerLignes();
    setLignes(data);
    setSaisies((actuel) => {
      const suivant = { ...actuel };
      for (const ligne of data) {
        if (!(ligne.id in suivant)) suivant[ligne.id] = String(ligne.stock);
      }
      return suivant;
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger, revisionSynchronisation]),
  );

  const visibles = useMemo(() => {
    const q = recherche.trim().toLocaleLowerCase('fr');
    if (!q) return lignes;
    return lignes.filter(
      (ligne) =>
        ligne.modele.toLocaleLowerCase('fr').includes(q) ||
        ligne.libelle.toLocaleLowerCase('fr').includes(q) ||
        ligne.sku.toLocaleLowerCase('fr').includes(q),
    );
  }, [lignes, recherche]);

  const ecarts = useMemo(() => {
    return lignes.filter((ligne) => {
      const n = Number((saisies[ligne.id] ?? '').replace(',', '.'));
      return Number.isFinite(n) && n >= 0 && Math.abs(n - ligne.stock) > 0.0001;
    });
  }, [lignes, saisies]);

  const valider = useCallback(async () => {
    if (ecarts.length === 0) return;
    setEnCours(true);
    try {
      for (const ligne of ecarts) {
        const stock = Number((saisies[ligne.id] ?? '').replace(',', '.'));
        await corrigerStockVariante(
          ligne.id,
          stock,
          `Inventaire mobile - ${ligne.modele} - ${ligne.libelle}`,
        );
      }
      await charger();
      Alert.alert('Inventaire enregistré', `${ecarts.length} variante(s) corrigée(s).`);
    } catch (erreur) {
      Alert.alert(
        'Inventaire impossible',
        erreur instanceof Error ? erreur.message : String(erreur),
      );
    } finally {
      setEnCours(false);
    }
  }, [charger, ecarts, saisies]);

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
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icone nom="retour" taille={23} couleur={H.texte} />
        </Pressable>
        <View style={s.enteteTextes}>
          <Text style={s.titre}>Inventaire par variantes</Text>
          <Text style={s.sousTitre}>{lignes.length} déclinaisons · {ecarts.length} écart(s)</Text>
        </View>
      </View>

      <View style={s.recherche}>
        <Icone nom="recherche" taille={18} couleur={H.texteFaible} />
        <TextInput
          style={s.rechercheTexte}
          value={recherche}
          onChangeText={setRecherche}
          placeholder="Modèle, taille, couleur ou SKU"
          placeholderTextColor={H.texteFaible}
        />
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={s.liste}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={rafraichir} />}
        renderItem={({ item }) => {
          const saisi = saisies[item.id] ?? '';
          const nombre = Number(saisi.replace(',', '.'));
          const different = Number.isFinite(nombre) && nombre >= 0 && Math.abs(nombre - item.stock) > 0.0001;
          return (
            <View style={[s.carte, different && s.carteEcart]}>
              <View style={s.ligneHaut}>
                <View style={s.identite}>
                  {item.couleurHex ? (
                    <View style={[s.couleur, { backgroundColor: item.couleurHex }]} />
                  ) : null}
                  <View style={s.textes}>
                    <Text style={s.modele}>{item.modele}</Text>
                    <Text style={s.variante}>{item.libelle}</Text>
                    <Text style={s.sku}>{item.sku}</Text>
                  </View>
                </View>
                <View style={s.theorique}>
                  <Text style={s.theoriqueLabel}>Théorique</Text>
                  <Text style={s.theoriqueValeur}>{item.stock}</Text>
                </View>
              </View>

              <View style={s.comptage}>
                <Text style={s.comptageLabel}>Stock physique compté</Text>
                <TextInput
                  value={saisi}
                  onChangeText={(texte) =>
                    setSaisies((actuel) => ({ ...actuel, [item.id]: texte }))
                  }
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  style={[s.champ, different && s.champEcart]}
                />
                {different ? (
                  <Text style={s.ecart}>
                    Écart {nombre - item.stock > 0 ? '+' : ''}{Math.round((nombre - item.stock) * 1000) / 1000}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.vide}>
            <Text style={s.videTitre}>Aucune variante à compter</Text>
            <Text style={s.videTexte}>
              Créez ou synchronisez d’abord les modèles avec leurs tailles et couleurs.
            </Text>
          </View>
        }
      />

      <View style={s.pied}>
        <Bouton
          titre={ecarts.length > 0 ? `Valider ${ecarts.length} écart(s)` : 'Aucun écart à valider'}
          onPress={() => void valider()}
          desactive={ecarts.length === 0}
          enCours={enCours}
          grand
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: H.fond },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    padding: espaces.m,
    backgroundColor: H.surface,
  },
  enteteTextes: { flex: 1 },
  titre: { fontSize: 19, fontWeight: '900', color: H.texte },
  sousTitre: { marginTop: 2, fontSize: 11, color: H.texteFaible },
  recherche: {
    minHeight: 46,
    margin: espaces.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    paddingHorizontal: espaces.m,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: H.bordure,
    backgroundColor: H.surface,
  },
  rechercheTexte: { flex: 1, fontSize: 13, color: H.texte },
  liste: { paddingHorizontal: espaces.m, paddingBottom: 120, gap: espaces.s },
  carte: {
    padding: espaces.m,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: H.bordure,
    backgroundColor: H.surface,
  },
  carteEcart: { borderColor: couleurs.avertissement },
  ligneHaut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaces.m },
  identite: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  couleur: { width: 26, height: 26, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: H.bordure },
  textes: { flex: 1, minWidth: 0 },
  modele: { fontSize: 14, fontWeight: '900', color: H.texte },
  variante: { marginTop: 2, fontSize: 12, fontWeight: '800', color: H.primaire },
  sku: { marginTop: 2, fontSize: 9, color: H.texteFaible },
  theorique: { alignItems: 'flex-end' },
  theoriqueLabel: { fontSize: 9, color: H.texteFaible },
  theoriqueValeur: { marginTop: 2, fontSize: 20, fontWeight: '900', color: H.texte },
  comptage: { marginTop: espaces.m, flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  comptageLabel: { flex: 1, fontSize: 11, color: H.texteFaible, fontWeight: '700' },
  champ: {
    width: 82,
    minHeight: 42,
    paddingHorizontal: espaces.s,
    textAlign: 'right',
    borderRadius: rayons.s,
    borderWidth: 1,
    borderColor: H.bordure,
    backgroundColor: H.fond,
    color: H.texte,
    fontWeight: '900',
  },
  champEcart: { borderColor: couleurs.avertissement },
  ecart: { minWidth: 58, fontSize: 11, fontWeight: '900', color: couleurs.avertissementFonce },
  vide: { padding: espaces.xl, alignItems: 'center' },
  videTitre: { fontSize: 16, fontWeight: '900', color: H.texte },
  videTexte: { marginTop: 7, textAlign: 'center', color: H.texteFaible, lineHeight: 18 },
  pied: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    padding: espaces.m,
    backgroundColor: H.surface,
    borderTopWidth: 1,
    borderTopColor: H.bordure,
  },
});
