/**
 * Choix d'une date au calendrier, sans dependance native.
 *
 * La valeur reste au format AAAA-MM-JJ attendu par le serveur ; l'ecran
 * affiche JJ/MM/AAAA.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { HABILLEMENT_MOBILE_THEME as H } from '../profile-ui/habillement/theme';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const deux = (n: number) => String(n).padStart(2, '0');
const versIso = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;

function lireIso(valeur: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ChampDate({ label, valeur, onChange, couleur = H.primaire }: {
  label: string;
  valeur: string;
  onChange: (iso: string) => void;
  couleur?: string;
}) {
  const choisie = lireIso(valeur);
  const [ouvert, setOuvert] = useState(false);
  const [vue, setVue] = useState(() => {
    const base = choisie ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const decalage = (vue.getDay() + 6) % 7;
  const nbJours = new Date(vue.getFullYear(), vue.getMonth() + 1, 0).getDate();
  const cases: (number | null)[] = [
    ...Array.from({ length: decalage }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => i + 1),
  ];
  const isoChoisie = choisie ? versIso(choisie) : '';
  const isoJour = versIso(new Date());

  return (
    <View style={s.bloc}>
      <Text style={s.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} style={s.champ} onPress={() => setOuvert(true)}>
        <Text style={choisie ? s.valeur : s.vide}>
          {choisie ? `${deux(choisie.getDate())}/${deux(choisie.getMonth() + 1)}/${choisie.getFullYear()}` : 'Choisir une date'}
        </Text>
        {choisie ? (
          <Pressable hitSlop={10} accessibilityLabel="Effacer la date" onPress={() => onChange('')}>
            <Text style={s.effacer}>×</Text>
          </Pressable>
        ) : null}
      </Pressable>

      <Modal visible={ouvert} transparent animationType="fade" onRequestClose={() => setOuvert(false)}>
        <Pressable style={s.fond} onPress={() => setOuvert(false)}>
          <Pressable style={s.carte} onPress={() => undefined}>
            <View style={s.navigation}>
              <Pressable hitSlop={10} accessibilityLabel="Mois précédent" onPress={() => setVue(new Date(vue.getFullYear(), vue.getMonth() - 1, 1))}>
                <Text style={[s.fleche, { color: couleur }]}>‹</Text>
              </Pressable>
              <Text style={s.mois}>{MOIS[vue.getMonth()]} {vue.getFullYear()}</Text>
              <Pressable hitSlop={10} accessibilityLabel="Mois suivant" onPress={() => setVue(new Date(vue.getFullYear(), vue.getMonth() + 1, 1))}>
                <Text style={[s.fleche, { color: couleur }]}>›</Text>
              </Pressable>
            </View>
            <View style={s.grille}>
              {JOURS.map((j, i) => <Text key={`e${i}`} style={s.jourEntete}>{j}</Text>)}
              {cases.map((jour, i) => {
                if (jour === null) return <View key={`v${i}`} style={s.case} />;
                const iso = versIso(new Date(vue.getFullYear(), vue.getMonth(), jour));
                const actif = iso === isoChoisie;
                return (
                  <Pressable
                    key={iso}
                    accessibilityRole="button"
                    accessibilityState={{ selected: actif }}
                    style={[s.case, actif && { backgroundColor: couleur }]}
                    onPress={() => { onChange(iso); setOuvert(false); }}
                  >
                    <Text style={[s.jour, iso === isoJour && { color: couleur, fontWeight: '900' }, actif && s.jourActif]}>{jour}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  bloc: { gap: 6, flex: 1 },
  label: { fontSize: 11, fontWeight: '800', color: H.texteFaible },
  champ: { minHeight: 48, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: H.bordure, backgroundColor: H.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  valeur: { fontSize: 14, color: H.texte },
  vide: { fontSize: 14, color: H.texteEteint },
  effacer: { fontSize: 20, color: H.texteFaible, paddingHorizontal: 4 },
  fond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  carte: { width: '100%', maxWidth: 360, borderRadius: 12, backgroundColor: H.surface, padding: 12 },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  fleche: { fontSize: 28, fontWeight: '700', paddingHorizontal: 10 },
  mois: { fontSize: 15, fontWeight: '800', color: H.texte, textTransform: 'capitalize' },
  grille: { flexDirection: 'row', flexWrap: 'wrap' },
  jourEntete: { width: '14.28%', textAlign: 'center', fontSize: 11, fontWeight: '700', color: H.texteFaible, paddingVertical: 4 },
  case: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  jour: { fontSize: 14, color: H.texte },
  jourActif: { color: '#FFFFFF', fontWeight: '800' },
});
