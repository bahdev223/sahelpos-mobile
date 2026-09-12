import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { apercuPdf, genererEtPartager } from '../services/pdf';
import { Icone } from './icones';
import { couleurs } from './theme';

export function ActionsDocument({ preparer, desactive = false }: {
  preparer: () => Promise<{ html: string; nom: string }>;
  desactive?: boolean;
}) {
  const [action, setAction] = useState<'apercu' | 'export' | null>(null);
  const verrou = useRef(false);
  const ouvrir = async (mode: 'apercu' | 'export') => {
    if (verrou.current || desactive) return;
    verrou.current = true;
    setAction(mode);
    try {
      const document = await preparer();
      if (mode === 'apercu') await apercuPdf(document.html);
      else if (!await genererEtPartager(document.html, document.nom, 'Exporter le PDF')) {
        Alert.alert('Partage indisponible', 'Utilisez l’aperçu pour enregistrer le document en PDF.');
      }
    } catch (erreur) {
      Alert.alert('Document indisponible', erreur instanceof Error ? erreur.message : 'Le PDF n’a pas pu être généré.');
    } finally {
      verrou.current = false;
      setAction(null);
    }
  };
  return <View style={s.actions}>
    {(['apercu', 'export'] as const).map((mode) => <Pressable key={mode} accessibilityRole="button" disabled={desactive || action !== null} onPress={() => void ouvrir(mode)} style={[s.bouton, (desactive || action !== null) && s.desactive]}>
      {action === mode ? <ActivityIndicator size="small" color={couleurs.primaire} /> : <Icone nom="document" taille={19} couleur={couleurs.primaire} />}
      <Text style={s.texte}>{mode === 'apercu' ? 'Aperçu / imprimer' : 'Exporter PDF'}</Text>
    </Pressable>)}
  </View>;
}
const s = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8 },
  bouton: { flex: 1, minHeight: 44, padding: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 6, backgroundColor: couleurs.surface },
  texte: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: couleurs.primaire, textAlign: 'center' },
  desactive: { opacity: 0.5 },
});
