import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  couleurValide, preparerMatrice, LIMITE_VARIANTES_HABILLEMENT, type DimensionModele,
} from '../../domain/matrice-habillement';
import { HABILLEMENT_MOBILE_THEME as H } from './theme';

interface Props {
  references: DimensionModele[];
  selection: number[];
  surSelection: (ids: number[]) => void;
  desactive?: boolean;
}
/** Même sélection et même plafond dans la création et l'ajout de variantes. */
export function SelecteurMatrice({ references, selection, surSelection, desactive = false }: Props) {
  const [recherche, setRecherche] = useState('');
  const ids = useMemo(() => new Set(selection), [selection]);
  const bilan = useMemo(() => {
    if (!selection.length) return { nombre: 0, erreur: '' };
    try { return { nombre: preparerMatrice(references, selection).length, erreur: '' }; }
    catch (e) { return { nombre: 0, erreur: e instanceof Error ? e.message : 'Sélection invalide.' }; }
  }, [references, selection]);
  const q = recherche.trim().toLocaleLowerCase('fr');
  return (
    <View style={s.bloc}>
      <Text style={s.titre}>Couleurs & tailles</Text>
      <Text style={s.aide}>Les options viennent du référentiel synchronisé de cette boutique.</Text>
      <TextInput accessibilityLabel="Rechercher une taille ou une couleur" value={recherche}
        onChangeText={setRecherche} editable={!desactive} placeholder="Rechercher une option"
        placeholderTextColor={H.texteFaible} style={s.recherche} />
      {references.map((dimension) => {
        const valeurs = dimension.valeurs.filter((v) => !q || v.nom.toLocaleLowerCase('fr').includes(q));
        if (!valeurs.length) return null;
        return (
          <View key={dimension.code} style={s.dimension}>
            <Text style={s.sousTitre}>{dimension.nom}</Text>
            <View style={s.options}>
              {valeurs.map((v) => {
                const actif = ids.has(v.valeurServeurId); const couleur = couleurValide(v.codeHex);
                return (
                  <Pressable key={v.valeurServeurId} accessibilityRole="checkbox"
                    accessibilityLabel={`${dimension.nom} : ${v.nom}`}
                    accessibilityState={{ checked: actif, disabled: desactive }} disabled={desactive}
                    onPress={() => surSelection(actif ? selection.filter((id) => id !== v.valeurServeurId)
                      : [...selection, v.valeurServeurId])}
                    style={[s.option, actif && s.active]}>
                    {couleur ? <View style={[s.pastille, { backgroundColor: couleur }]} /> : null}
                    <Text style={[s.optionTexte, actif && s.texteActif]}>{actif ? '✓ ' : ''}{v.nom}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      {references.length === 0 ? <Text style={s.aide}>Aucune option reçue. Synchronisez le référentiel avant de créer des déclinaisons.</Text> : null}
      <Text accessibilityLiveRegion="polite" style={[s.bilan, bilan.erreur ? s.erreur : null]}>
        {bilan.erreur || `${bilan.nombre} combinaison(s) · maximum ${LIMITE_VARIANTES_HABILLEMENT}`}
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  bloc: { gap: 10 }, titre: { color: H.texte, fontSize: 18, fontWeight: '800' },
  aide: { color: H.texteFaible, fontSize: 13, lineHeight: 20 },
  recherche: { minHeight: 48, borderWidth: 1, borderColor: H.bordure, borderRadius: 12,
    paddingHorizontal: 12, color: H.texte, backgroundColor: H.surface },
  dimension: { gap: 8, marginTop: 8 }, sousTitre: { color: H.texte, fontSize: 15, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 48, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row',
    alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: H.bordure, backgroundColor: H.surface },
  active: { borderColor: H.primaire, backgroundColor: H.primaireClair },
  optionTexte: { color: H.texte, fontSize: 14 }, texteActif: { color: H.primaireFonce, fontWeight: '800' },
  pastille: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: H.bordure },
  bilan: { color: H.primaireFonce, fontSize: 14, fontWeight: '700', marginTop: 10 }, erreur: { color: H.danger },
});
