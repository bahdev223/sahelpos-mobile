import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSession } from '../../../app/_layout';
import { BandeauEtat, formaterMontant, formaterQuantite } from '../../ui/components';
import { Icone } from '../../ui/icones';
import { BoutonMenu } from '../../ui/tiroir';
import { uriImage } from '../../../app/produit/nouveau';
import {
  chargerCatalogueHabillement, filtrerCatalogueHabillement, type ModeleCatalogueHabillement,
} from '../../services/catalogue-habillement';
import { DialogueModeleHabillement } from './DialogueModele';
import { HABILLEMENT_MOBILE_THEME as H } from './theme';

export function CatalogueHabillement() {
  const router = useRouter();
  const { boutique, utilisateur, revisionSynchronisation, synchroniserMaintenant } = useSession();
  const { width, fontScale } = useWindowDimensions();
  const colonnes = width < 350 || fontScale > 1.35 ? 1 : 2;
  const largeur = (width - 32 - (colonnes - 1) * 12) / colonnes;
  const [modeles, setModeles] = useState<ModeleCatalogueHabillement[]>([]);
  const [charge, setCharge] = useState(false); const [message, setMessage] = useState('');
  const [recherche, setRecherche] = useState(''); const [categorie, setCategorie] = useState<string | null>(null);
  const [rafraichit, setRafraichit] = useState(false); const [creation, setCreation] = useState(false);
  const lecture = useRef(0);
  const peutGerer = ['admin', 'gerant'].includes(utilisateur?.role ?? '');
  const charger = useCallback(async () => {
    const courant = ++lecture.current;
    try {
      const valeurs = await chargerCatalogueHabillement();
      if (courant !== lecture.current) return;
      setModeles(valeurs); setCharge(true); setMessage('');
    } catch (e) {
      if (courant !== lecture.current) return;
      setCharge(true); setMessage(e instanceof Error ? e.message : 'Le catalogue ne peut pas être lu.');
    }
  }, []);
  useFocusEffect(useCallback(() => { void charger(); return () => { lecture.current++; }; }, [charger, revisionSynchronisation]));
  const visibles = useMemo(() => filtrerCatalogueHabillement(modeles, recherche, categorie), [modeles, recherche, categorie]);
  const categories = useMemo(() => [...new Set(modeles.filter((m) => m.actif === 1)
    .map((m) => m.categorie).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b, 'fr')), [modeles]);
  const rafraichir = async () => {
    if (rafraichit) return;
    setRafraichit(true);
    try { await synchroniserMaintenant(); await charger(); }
    catch (e) {
      await charger();
      setMessage(`Actualisation distante impossible. ${e instanceof Error ? e.message : 'Vérifiez la connexion.'}`);
    } finally { setRafraichit(false); }
  };
  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <BoutonMenu couleur={H.texte} />
        <View style={s.titres}><Text style={s.titre}>Modèles</Text><Text style={s.aide}>Tailles · couleurs · variantes</Text></View>
        <Pressable style={s.icone} accessibilityRole="button" accessibilityLabel="Tailles et couleurs"
          onPress={() => router.push('/habillement/referentiel')}><Icone nom="etiquette" taille={23} couleur={H.primaire} /></Pressable>
      </View>
      <View style={s.recherche}>
        <Icone nom="recherche" taille={20} couleur={H.texteFaible} />
        <TextInput style={s.saisie} value={recherche} onChangeText={setRecherche} autoCorrect={false}
          accessibilityLabel="Rechercher dans les modèles" placeholder="Modèle, taille, couleur, SKU…" placeholderTextColor={H.texteFaible} />
      </View>
      <ScrollView horizontal style={s.barre} showsHorizontalScrollIndicator={false} contentContainerStyle={s.raccourcis}>
        <Pressable style={s.puce} onPress={() => router.push('/habillement/referentiel')}><Text style={s.puceTexte}>Tailles & couleurs</Text></Pressable>
        {peutGerer ? <>
          <Pressable style={s.puce} onPress={() => router.push('/habillement/inventaire')}><Text style={s.puceTexte}>Inventaire</Text></Pressable>
          <Pressable style={s.puce} onPress={() => router.push('/achats')}><Text style={s.puceTexte}>Approvisionnements</Text></Pressable>
        </> : null}
      </ScrollView>
      {categories.length ? <ScrollView horizontal style={s.barre} contentContainerStyle={s.raccourcis} showsHorizontalScrollIndicator={false}>
        {[null, ...categories].map((c) => <Pressable key={c ?? '__toutes'} onPress={() => setCategorie(c)}
          style={[s.puce, categorie === c && s.puceActive]} accessibilityRole="button" accessibilityState={{ selected: categorie === c }}>
          <Text style={[s.puceTexte, categorie === c && s.texteActif]}>{c ?? 'Toutes les catégories'}</Text>
        </Pressable>)}
      </ScrollView> : null}
      {message ? <View style={s.erreur}><Text accessibilityRole="alert" style={s.erreurTexte}>{message}</Text>
        <Pressable style={s.reessayer} onPress={() => void charger()}><Text style={s.puceTexte}>Réessayer la lecture locale</Text></Pressable>
      </View> : null}
      {!charge ? <View style={s.vide}><ActivityIndicator color={H.primaire} /><Text style={s.aide}>Lecture des modèles…</Text></View> :
        <FlatList key={colonnes} data={visibles} numColumns={colonnes}
          columnWrapperStyle={colonnes === 2 ? s.ligne : undefined} keyExtractor={(m) => String(m.id)}
          contentContainerStyle={s.liste} refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={() => void rafraichir()} tintColor={H.primaire} />}
          renderItem={({ item }) => <Pressable style={[s.carte, { width: largeur }]} accessibilityRole="button"
            accessibilityLabel={`Ouvrir ${item.nom}`}
            onPress={() => router.push({ pathname: '/habillement/modele/[id]', params: { id: String(item.id) } })}>
            {uriImage(item.image) ? <Image source={{ uri: uriImage(item.image)! }} style={s.image} resizeMode="cover" /> :
              <View style={[s.image, s.imageVide]}><Icone nom="image" taille={48} couleur={H.texteEteint} /></View>}
            <View style={s.corps}>
              <Text style={s.nom} numberOfLines={2}>{item.nom}</Text>
              <Text style={s.aide} numberOfLines={1}>{item.categorie || 'Sans catégorie'}</Text>
              <Text style={s.prix}>{formaterMontant(item.prix, boutique.devise)}</Text>
              <Text style={s.aide}>{item.nbVariantes} variante(s){item.nbVariantes ? ` · ${formaterQuantite(item.stockVariantes)} pièce(s)` : ''}</Text>
              <View style={s.options}>
                {item.tailles.slice(0, 5).map((taille) => <Text key={taille} style={s.taille}>{taille}</Text>)}
                {item.tailles.length > 5 ? <Text style={s.aide}>+{item.tailles.length - 5}</Text> : null}
              </View>
              <View style={s.options}>
                {item.couleurs.slice(0, 5).map((c) => <View key={c.code} accessible accessibilityLabel={`Couleur ${c.nom}`}
                  style={[s.couleur, { backgroundColor: c.hex ?? H.surfaceDouce }]} />)}
                {item.couleurs.length > 5 ? <Text style={s.aide}>+{item.couleurs.length - 5}</Text> : null}
              </View>
              {item.couleurs.length ? <Text style={s.aide} numberOfLines={1}>{item.couleurs.map((c) => c.nom).join(' · ')}</Text> : null}
            </View>
          </Pressable>}
          ListEmptyComponent={!message ? <View style={s.vide}>
            <Text style={s.nom}>{modeles.length ? 'Aucun résultat' : 'Aucun modèle'}</Text>
            <Text style={s.aide}>{modeles.length ? 'Modifiez les filtres ou votre recherche.' : 'Créez un modèle ou synchronisez votre catalogue.'}</Text>
          </View> : null} />}
      {peutGerer ? <Pressable accessibilityRole="button" accessibilityLabel="Nouveau modèle" style={s.fab}
        onPress={() => setCreation(true)}><Icone nom="plus" taille={27} couleur="#FFFFFF" /></Pressable> : null}
      <DialogueModeleHabillement visible={creation} surFermer={() => setCreation(false)} surEnregistre={() => {
        setCreation(false); void charger();
      }} />
    </View>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: H.fond }, entete: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: H.surface },
  titres: { flex: 1 }, titre: { fontSize: 23, fontWeight: '800', color: H.texte }, aide: { fontSize: 12, lineHeight: 18, color: H.texteFaible },
  icone: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center' },
  recherche: { margin: 16, marginBottom: 8, paddingHorizontal: 12, minHeight: 50, borderWidth: 1, borderColor: H.bordure,
    borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: H.surface }, saisie: { flex: 1, fontSize: 15, color: H.texte },
  barre: { flexGrow: 0, flexShrink: 0, maxHeight: 60 }, raccourcis: { gap: 8, paddingHorizontal: 16, paddingVertical: 5, alignItems: 'center' },
  puce: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: H.primaireClair },
  puceTexte: { color: H.primaireFonce, fontSize: 13, fontWeight: '700' }, puceActive: { backgroundColor: H.primaire }, texteActif: { color: '#FFFFFF' },
  liste: { padding: 16, gap: 12, paddingBottom: 105 }, ligne: { gap: 12 }, carte: { backgroundColor: H.surface, borderWidth: 1, borderColor: H.bordure, borderRadius: 16, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 1 }, imageVide: { backgroundColor: H.surfaceDouce, justifyContent: 'center', alignItems: 'center' },
  corps: { padding: 12, gap: 5 }, nom: { fontSize: 15, fontWeight: '800', color: H.texte, lineHeight: 21 }, prix: { color: H.primaireFonce, fontSize: 17, fontWeight: '800' },
  options: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }, taille: { color: H.texte, fontSize: 12, fontWeight: '700', backgroundColor: H.fondSecondaire, borderRadius: 5, padding: 5 },
  couleur: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: H.bordure },
  vide: { padding: 24, alignItems: 'center', gap: 10 }, fab: { position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: H.primaire, alignItems: 'center', justifyContent: 'center' },
  erreur: { margin: 16, padding: 12, gap: 4, backgroundColor: H.dangerFond, borderRadius: 12 }, erreurTexte: { color: H.danger, fontSize: 13, lineHeight: 20 }, reessayer: { minHeight: 44, justifyContent: 'center' },
});
