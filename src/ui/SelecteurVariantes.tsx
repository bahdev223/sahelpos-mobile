import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { libelleVariante, type VarianteMobile } from '../db/repositories/variante';
import { filtrerVariantes } from '../domain/selection-variantes';
import { useAccent } from './accent';
import { couleurs, espaces, rayons } from './theme';

/** Choix exact du SKU, commun aux tailles/couleurs et références techniques. */
export function SelecteurVariantes({ variantes, selection, onSelection }: {
  variantes: VarianteMobile[];
  selection: number | null;
  onSelection: (variante: VarianteMobile | null) => void;
}) {
  const accent = useAccent();
  const { width, fontScale } = useWindowDimensions();
  const [filtres, setFiltres] = useState<Record<string, string>>({});
  const [recherche, setRecherche] = useState('');
  const [limite, setLimite] = useState(6);
  const dimensions = useMemo(() => {
    const groupes = new Map<string, { nom: string; options: Map<string, string> }>();
    for (const variante of variantes) for (const valeur of variante.valeurs) {
      const groupe = groupes.get(valeur.dimensionCode) ?? { nom: valeur.dimensionNom, options: new Map() };
      groupe.options.set(valeur.code, valeur.nom);
      groupes.set(valeur.dimensionCode, groupe);
    }
    return [...groupes.entries()];
  }, [variantes]);
  const visibles = useMemo(() => filtrerVariantes(variantes, filtres, recherche), [variantes, filtres, recherche]);
  const filtrer = (suivants: Record<string, string>, texte = recherche) => {
    setFiltres(suivants); setRecherche(texte); setLimite(6);
    if (selection !== null && !filtrerVariantes(variantes, suivants, texte).some(v => v.id === selection)) {
      onSelection(null);
    }
  };
  const largeur = width / fontScale >= 280 ? '48%' : '100%';
  return <View style={s.bloc}>
    {variantes.length > 6 ? <TextInput value={recherche} onChangeText={texte => filtrer(filtres, texte)}
      placeholder="Taille, couleur ou référence" accessibilityLabel="Rechercher une variante"
      placeholderTextColor={couleurs.texteFaible} style={s.recherche} /> : null}
    <View style={s.grille}>
      {dimensions.filter(([, groupe]) => groupe.options.size > 1).map(([code, groupe]) =>
        <View key={code} style={{ width: largeur }}>
          <Text style={s.label}>{groupe.nom}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtres}>
            {[['', 'Tout'], ...groupe.options.entries()].map(([valeur, nom]) => {
              const actif = (filtres[code] ?? '') === valeur;
              return <Pressable key={valeur} accessibilityRole="button"
                accessibilityLabel={`${groupe.nom} : ${nom}`} accessibilityState={{ selected: actif }}
                onPress={() => filtrer({ ...filtres, [code]: valeur })}
                style={[s.filtre, actif && { borderColor: accent.primaire, backgroundColor: accent.primaire }]}>
                <Text style={[s.filtreTexte, actif && s.blanc]}>{nom}</Text>
              </Pressable>;
            })}
          </ScrollView>
        </View>)}
    </View>
    <View style={s.grille}>
      {visibles.slice(0, limite).map(variante => {
        const actif = variante.id === selection;
        const couleur = variante.valeurs.find(valeur => valeur.codeHex)?.codeHex;
        return <Pressable key={variante.idLocal} accessibilityRole="button"
          accessibilityLabel={`${libelleVariante(variante)}, stock ${variante.stockActuel}`}
          accessibilityState={{ selected: actif }} onPress={() => onSelection(variante)}
          style={[s.option, { width: largeur }, actif && { borderColor: accent.primaire, backgroundColor: accent.primaire }]}>
          <View style={s.identite}>
            {couleur ? <View style={[s.couleur, { backgroundColor: couleur }]} /> : null}
            <Text style={[s.nom, actif && s.blanc]}>{libelleVariante(variante)}</Text>
          </View>
          <Text style={[s.stock, actif && s.blanc]}>{variante.stockActuel > 0 ? `Stock ${variante.stockActuel}` : 'Rupture'}</Text>
        </Pressable>;
      })}
    </View>
    {visibles.length === 0 ? <Text accessibilityLiveRegion="polite" style={s.stock}>Aucune variante pour ces critères.</Text> : null}
    {visibles.length > limite ? <Pressable accessibilityRole="button" style={s.suite} onPress={() => setLimite(n => n + 6)}>
      <Text style={{ color: accent.primaire }}>Voir la suite · {Math.min(limite, visibles.length)}/{visibles.length}</Text>
    </Pressable> : null}
  </View>;
}

const s = StyleSheet.create({
  bloc: { gap: espaces.m },
  recherche: { minHeight: 48, padding: espaces.m, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.m, fontSize: 15, color: couleurs.texte },
  grille: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: espaces.s },
  label: { color: couleurs.texteFaible, fontSize: 12, fontWeight: '600', marginBottom: espaces.xs },
  filtres: { gap: espaces.xs },
  filtre: { minHeight: 48, paddingHorizontal: espaces.m, paddingVertical: espaces.s, alignItems: 'center', justifyContent: 'center', borderRadius: rayons.s, borderWidth: 1, borderColor: couleurs.bordure },
  filtreTexte: { color: couleurs.texte, fontSize: 14 },
  option: { minHeight: 64, padding: espaces.m, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.m, backgroundColor: couleurs.surface },
  identite: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  couleur: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: couleurs.bordure },
  nom: { flex: 1, color: couleurs.texte, fontWeight: '700', fontSize: 14 },
  stock: { color: couleurs.texteFaible, fontSize: 12, marginTop: espaces.xs },
  blanc: { color: couleurs.texteInverse },
  suite: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
