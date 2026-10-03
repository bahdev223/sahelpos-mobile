import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../_layout';
import { chargerModelePourEdition, type ModelePourEdition } from '../../../src/services/modeles-habillement';
import { libelleVariante, listerVariantesProduit, type VarianteMobile } from '../../../src/db/repositories/variante';
import { couleurValide, prixVarianteOuModele } from '../../../src/domain/matrice-habillement';
import { BandeauEtat, formaterMontant, formaterQuantite } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';
import { uriImage } from '../../produit/nouveau';
import { DialogueModeleHabillement } from '../../../src/profile-ui/habillement/DialogueModele';
import { HABILLEMENT_MOBILE_THEME as H } from '../../../src/profile-ui/habillement/theme';

export default function FicheModeleHabillement() {
  const router = useRouter();
  const { id, modifier } = useLocalSearchParams<{ id: string; modifier?: string }>();
  const identifiant = Number(id);
  const { boutique, utilisateur, revisionSynchronisation } = useSession();
  const [produit, setProduit] = useState<ModelePourEdition | null>(null);
  const [variantes, setVariantes] = useState<VarianteMobile[]>([]);
  const [phase, setPhase] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [message, setMessage] = useState(''); const [edition, setEdition] = useState(false);
  const lecture = useRef(0);
  const peutGerer = ['admin', 'gerant'].includes(utilisateur?.role ?? '');
  const charger = useCallback(async () => {
    const courant = ++lecture.current;
    try {
      const p = await chargerModelePourEdition(identifiant);
      const v = await listerVariantesProduit(p.id);
      if (courant !== lecture.current) return;
      setProduit(p); setVariantes(v); setMessage(''); setPhase('pret');
    } catch (e) {
      if (courant !== lecture.current) return;
      setMessage(e instanceof Error ? e.message : 'Lecture du modèle impossible.'); setPhase('erreur');
    }
  }, [identifiant]);
  useFocusEffect(useCallback(() => { void charger(); return () => { lecture.current++; }; }, [charger, revisionSynchronisation]));
  useEffect(() => {
    if (modifier === '1' && phase === 'pret' && peutGerer) {
      setEdition(true); router.setParams({ modifier: '0' });
    }
  }, [modifier, phase, peutGerer, router]);
  const dimensions = useMemo(() => {
    const resultat = new Map<string, { nom: string; ordre: number; valeurs: Map<string, { nom: string; hex: string | null; ordre: number }> }>();
    for (const variante of variantes) for (const valeur of variante.valeurs) {
      const d = resultat.get(valeur.dimensionCode) ?? { nom: valeur.dimensionNom, ordre: valeur.dimensionOrdre, valeurs: new Map() };
      d.valeurs.set(valeur.code, { nom: valeur.nom, hex: couleurValide(valeur.codeHex), ordre: valeur.ordre });
      resultat.set(valeur.dimensionCode, d);
    }
    return [...resultat.entries()].sort((a, b) => a[1].ordre - b[1].ordre);
  }, [variantes]);
  const stock = variantes.reduce((total, v) => total + v.stockActuel, 0);
  const retour = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/catalogue');
  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={retour} accessibilityRole="button" accessibilityLabel="Revenir au catalogue" style={s.icone}>
          <Icone nom="retour" taille={24} couleur={H.texte} /></Pressable>
        <View style={s.titres}><Text style={s.titre} numberOfLines={2}>{produit?.id === identifiant ? produit.nom : 'Fiche modèle'}</Text>
          <Text style={s.aide}>Habillement</Text></View>
        {peutGerer && phase === 'pret' ? <Pressable onPress={() => setEdition(true)} style={s.icone}
          accessibilityRole="button" accessibilityLabel="Modifier le modèle"><Icone nom="crayon" taille={22} couleur={H.primaire} /></Pressable> : null}
      </View>
      {phase === 'chargement' ? <View style={s.centre}><ActivityIndicator color={H.primaire} /><Text style={s.aide}>Lecture du modèle…</Text></View> :
        phase === 'erreur' ? <View style={s.centre}><Text accessibilityRole="alert" style={s.erreur}>{message}</Text>
          <Pressable style={s.action} onPress={() => void charger()}><Text style={s.actionTexte}>Réessayer</Text></Pressable>
          <Pressable style={s.action} onPress={retour}><Text style={s.actionTexte}>Revenir au catalogue</Text></Pressable></View> :
          produit ? <ScrollView contentContainerStyle={s.contenu}>
            {uriImage(produit.cheminImage) ? <Image source={{ uri: uriImage(produit.cheminImage)! }} style={s.image} resizeMode="cover" /> :
              <View style={[s.image, s.imageVide]}><Icone nom="image" taille={56} couleur={H.texteEteint} /></View>}
            <View style={s.resume}>
              <View style={s.kpi}><Text style={s.aide}>Prix du modèle</Text><Text style={s.valeur}>{formaterMontant(produit.prixUnitaire, boutique.devise)}</Text></View>
              <View style={s.kpi}><Text style={s.aide}>Stock des variantes</Text><Text style={s.valeur}>{formaterQuantite(stock)} pièce(s)</Text></View>
              <View style={s.kpi}><Text style={s.aide}>Catégorie</Text><Text style={s.valeur}>{produit.categorie || 'Sans catégorie'}</Text></View>
            </View>
            {dimensions.map(([code, d]) => <View key={code} style={s.carte}><Text style={s.sousTitre}>{d.nom}</Text>
              <View style={s.options}>{[...d.valeurs.entries()].sort((a, b) => a[1].ordre - b[1].ordre).map(([cle, v]) =>
                <View key={cle} style={s.option}>{v.hex ? <View style={[s.pastille, { backgroundColor: v.hex }]} /> : null}<Text style={s.optionTexte}>{v.nom}</Text></View>)}
              </View></View>)}
            <View style={s.carte}>
              <View style={s.enteteSection}><Text style={s.sousTitre}>Variantes ({variantes.length})</Text>
                <Pressable style={s.action} accessibilityLabel="Gérer les variantes" onPress={() => router.push({ pathname: '/habillement/variantes/[id]', params: { id: String(produit.id) } })}>
                  <Text style={s.actionTexte}>{peutGerer ? 'Gérer' : 'Voir tout'}</Text></Pressable></View>
              {variantes.map((v) => <View key={v.idLocal} style={s.variante}>
                <View style={s.titres}><Text style={s.varianteNom}>{libelleVariante(v)}</Text><Text style={s.aide}>{v.sku}</Text></View>
                <View style={s.droite}><Text style={s.prix}>{formaterMontant(prixVarianteOuModele(v.prixOverride, produit.prixUnitaire), boutique.devise)}</Text>
                  <Text style={[s.aide, { color: v.stockActuel > 0 ? H.succes : H.danger }]}>{v.stockActuel > 0 ? `${formaterQuantite(v.stockActuel)} pièce(s)` : 'Rupture'}</Text></View>
              </View>)}
              {!variantes.length ? <Text style={s.aide}>Aucune variante active reçue. Ouvrez la gestion des variantes pour en ajouter ou en réactiver.</Text> : null}
            </View>
          </ScrollView> : null}
      <DialogueModeleHabillement visible={edition} modeleId={identifiant} surFermer={() => setEdition(false)}
        surEnregistre={() => { setEdition(false); void charger(); }} />
    </View>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: H.fond }, entete: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, backgroundColor: H.surface },
  icone: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, titres: { flex: 1, minWidth: 0 }, titre: { fontSize: 20, fontWeight: '800', color: H.texte },
  aide: { fontSize: 12, lineHeight: 19, color: H.texteFaible }, centre: { flex: 1, padding: 24, gap: 14, alignItems: 'center', justifyContent: 'center' }, erreur: { color: H.danger, fontSize: 15, lineHeight: 23 },
  contenu: { padding: 16, paddingBottom: 40, gap: 16 }, image: { width: '100%', aspectRatio: 1.35, borderRadius: 16 }, imageVide: { backgroundColor: H.surfaceDouce, alignItems: 'center', justifyContent: 'center' },
  resume: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, kpi: { flexGrow: 1, minWidth: 135, padding: 14, backgroundColor: H.surface, borderRadius: 14, borderWidth: 1, borderColor: H.bordure },
  valeur: { color: H.texte, fontWeight: '800', fontSize: 16, marginTop: 5 }, carte: { padding: 16, gap: 12, borderWidth: 1, borderColor: H.bordure, borderRadius: 16, backgroundColor: H.surface },
  sousTitre: { color: H.texte, fontWeight: '800', fontSize: 16 }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: H.fond },
  optionTexte: { color: H.texte, fontSize: 14 }, pastille: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: H.bordure }, enteteSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  action: { minHeight: 48, minWidth: 64, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: H.primaireClair }, actionTexte: { color: H.primaireFonce, fontSize: 14, fontWeight: '800' },
  variante: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: H.bordureClaire }, varianteNom: { color: H.texte, fontSize: 14, fontWeight: '700' }, droite: { alignItems: 'flex-end' }, prix: { fontSize: 14, fontWeight: '800', color: H.primaireFonce },
});
