import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MODES_PERIODE, type ModePeriode } from '../domain/periodes';
import { couleurs } from './theme';
import { Icone } from './icones';

export function SelecteurPeriode({ mode, decalage, libelle, onMode, onDecalage }: {
  mode: ModePeriode; decalage: number; libelle: string;
  onMode: (mode: ModePeriode) => void; onDecalage: (valeur: number) => void;
}) {
  return <View style={s.bloc}>
    <View style={s.modes}>{MODES_PERIODE.map((p) => <Pressable key={p.mode} accessibilityRole="button" accessibilityState={{ selected: mode === p.mode }} onPress={() => onMode(p.mode)} style={[s.mode, mode === p.mode && s.actif]}><Text style={[s.texte, mode === p.mode && s.texteActif]}>{p.libelle}</Text></Pressable>)}</View>
    <View style={s.navigation}>
      <Pressable style={s.fleche} accessibilityRole="button" accessibilityLabel="Période précédente" onPress={() => onDecalage(decalage - 1)}><Icone nom="retour" taille={20} /></Pressable>
      <View style={s.centre}><Text style={s.libelle}>{libelle}</Text>{decalage !== 0 && <Pressable onPress={() => onDecalage(0)} accessibilityRole="button"><Text style={s.retour}>Période actuelle</Text></Pressable>}</View>
      <Pressable style={s.fleche} accessibilityRole="button" accessibilityLabel="Période suivante" disabled={decalage >= 0} accessibilityState={{ disabled: decalage >= 0 }} onPress={() => onDecalage(Math.min(0, decalage + 1))}><Icone nom="chevron" taille={20} couleur={decalage >= 0 ? couleurs.texteEteint : couleurs.texte} /></Pressable>
    </View>
  </View>;
}
const s = StyleSheet.create({
  bloc: { padding: 12, gap: 8 }, modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mode: { width: '30%', flexGrow: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface },
  actif: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire }, texte: { fontSize: 13, color: couleurs.texte, fontWeight: '600' }, texteActif: { color: couleurs.texteInverse },
  navigation: { flexDirection: 'row', alignItems: 'center', gap: 6 }, fleche: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  centre: { flex: 1, minWidth: 0, alignItems: 'center' }, libelle: { fontSize: 14, fontWeight: '700', color: couleurs.texte, textAlign: 'center' }, retour: { fontSize: 12, padding: 5, color: couleurs.primaire },
});
