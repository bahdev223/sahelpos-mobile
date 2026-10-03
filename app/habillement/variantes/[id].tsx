import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../_layout';
import { chargerModelePourEdition, changerEtatVarianteHabillement, type ModelePourEdition } from '../../../src/services/modeles-habillement';
import { libelleVariante, listerVariantesProduit, type VarianteMobile } from '../../../src/db/repositories/variante';
import { couleurValide } from '../../../src/domain/matrice-habillement';
import { BandeauEtat, formaterQuantite } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';
import { DialogueModeleHabillement } from '../../../src/profile-ui/habillement/DialogueModele';
import { HABILLEMENT_MOBILE_THEME as H } from '../../../src/profile-ui/habillement/theme';

export default function GererVariantesHabillement() {
  const router = useRouter(); const { id } = useLocalSearchParams<{ id: string }>(); const produitId = Number(id);
  const { utilisateur, revisionSynchronisation, synchroniserMaintenant } = useSession();
  const [produit, setProduit] = useState<ModelePourEdition | null>(null); const [variantes, setVariantes] = useState<VarianteMobile[]>([]);
  const [charge, setCharge] = useState(false); const [message, setMessage] = useState('');
  const [ajout, setAjout] = useState(false); const [enCours, setEnCours] = useState(false);
  const lecture = useRef(0); const verrou = useRef(false);
  const peutGerer = ['admin', 'gerant'].includes(utilisateur?.role ?? '');
  const charger = useCallback(async () => {
    const courant = ++lecture.current;
    try {
      const p = await chargerModelePourEdition(produitId); const v = await listerVariantesProduit(p.id, false);
      if (courant !== lecture.current) return;
      setProduit(p); setVariantes(v); setCharge(true); setMessage('');
    } catch (e) {
      if (courant !== lecture.current) return;
      setCharge(true); setMessage(e instanceof Error ? e.message : 'Lecture impossible.');
    }
  }, [produitId]);
  useFocusEffect(useCallback(() => { void charger(); return () => { lecture.current++; }; }, [charger, revisionSynchronisation]));
  const changerEtat = async (variante: VarianteMobile) => {
    if (verrou.current) return;
    verrou.current = true; setEnCours(true);
    try {
      await changerEtatVarianteHabillement(variante.id, !variante.actif, utilisateur?.id ?? 0);
      await charger(); void synchroniserMaintenant().catch(() => {});
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Changement impossible.'); }
    finally { verrou.current = false; setEnCours(false); }
  };
  const demanderChangement = (v: VarianteMobile) => {
    if (!v.actif) { void changerEtat(v); return; }
    Alert.alert('Désactiver cette variante ?', 'Elle ne sera plus proposée en caisse. Le stock et l’historique sont conservés.', [
      { text: 'Annuler', style: 'cancel' }, { text: 'Désactiver', onPress: () => void changerEtat(v) },
    ]);
  };
  return <View style={s.page}>
    <BandeauEtat />
    <View style={s.entete}>
      <Pressable style={s.icone} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/catalogue')}
        accessibilityRole="button" accessibilityLabel="Revenir à la fiche"><Icone nom="retour" taille={24} couleur={H.texte} /></Pressable>
      <View style={s.titres}><Text style={s.titre}>Variantes</Text><Text style={s.aide}>{produit?.nom ?? 'Fiche modèle'}</Text></View>
      {peutGerer && produit ? <Pressable style={s.icone} onPress={() => setAjout(true)} disabled={enCours}
        accessibilityRole="button" accessibilityLabel="Ajouter des variantes"><Icone nom="plus" taille={24} couleur={H.primaire} /></Pressable> : null}
    </View>
    {message ? <View style={s.erreur}><Text accessibilityRole="alert" style={s.erreurTexte}>{message}</Text>
      <Pressable style={s.action} onPress={() => void charger()}><Text style={s.actionTexte}>Réessayer</Text></Pressable></View> : null}
    {!charge ? <View style={s.vide}><ActivityIndicator color={H.primaire} /><Text style={s.aide}>Lecture des variantes…</Text></View> :
      <FlatList data={variantes} keyExtractor={(v) => v.idLocal} contentContainerStyle={s.liste}
        renderItem={({ item }) => {
          const hex = couleurValide(item.valeurs.find((v) => couleurValide(v.codeHex))?.codeHex);
          return <View style={[s.carte, !item.actif && s.inactive]}>
            <View style={s.titres}><View style={s.nomLigne}>{hex ? <View style={[s.couleur, { backgroundColor: hex }]} /> : null}
              <Text style={s.nom}>{libelleVariante(item)}</Text></View>
              <Text style={s.aide}>{item.sku}</Text><Text style={s.aide}>Stock : {formaterQuantite(item.stockActuel)}</Text>
              <Text style={s.etat}>{item.actif ? 'Active en caisse' : 'Désactivée'}</Text>
            </View>
            {peutGerer ? <Pressable style={s.action} disabled={enCours} onPress={() => demanderChangement(item)} accessibilityRole="button"
              accessibilityLabel={`${item.actif ? 'Désactiver' : 'Réactiver'} ${libelleVariante(item)}`}>
              <Text style={s.actionTexte}>{item.actif ? 'Désactiver' : 'Réactiver'}</Text></Pressable> : null}
          </View>;
        }} ListEmptyComponent={!message ? <View style={s.vide}><Text style={s.nom}>Aucune variante</Text>
          <Text style={s.aide}>{peutGerer ? 'Le bouton + ouvre la saisie des tailles et couleurs.' : 'Aucune variante n’a été synchronisée.'}</Text></View> : null} />}
    <DialogueModeleHabillement visible={ajout} modeleId={produitId} mode="variantes" surFermer={() => setAjout(false)}
      surEnregistre={() => { setAjout(false); void charger(); }} />
  </View>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: H.fond }, entete: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: H.surface },
  titres: { flex: 1, minWidth: 0 }, titre: { color: H.texte, fontSize: 21, fontWeight: '800' }, icone: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  aide: { color: H.texteFaible, fontSize: 12, lineHeight: 19 }, liste: { padding: 16, gap: 12, paddingBottom: 40 },
  carte: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: H.surface, borderRadius: 14, borderWidth: 1, borderColor: H.bordure },
  inactive: { backgroundColor: H.fondSecondaire }, nomLigne: { flexDirection: 'row', gap: 8, alignItems: 'center' }, nom: { flexShrink: 1, color: H.texte, fontSize: 15, fontWeight: '800' },
  couleur: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: H.bordure }, etat: { color: H.primaireFonce, fontSize: 12, fontWeight: '700', marginTop: 5 },
  action: { minHeight: 48, paddingHorizontal: 12, borderRadius: 12, backgroundColor: H.primaireClair, justifyContent: 'center', alignItems: 'center' },
  actionTexte: { color: H.primaireFonce, fontWeight: '700', fontSize: 13 }, vide: { padding: 24, alignItems: 'center', gap: 12 },
  erreur: { margin: 16, padding: 14, gap: 10, borderRadius: 12, backgroundColor: H.dangerFond }, erreurTexte: { color: H.danger, fontSize: 14, lineHeight: 22 },
});
