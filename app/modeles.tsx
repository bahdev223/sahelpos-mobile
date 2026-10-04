import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Pressable, RefreshControl,
  StyleSheet, Text, TextInput, View,
} from 'react-native';

import { listerModelesHabillement, type ModeleHabillementMobile } from '../src/services/catalogueHabillement';
import { BandeauEtat, couleurs, uriImage } from '../src/ui/components';
import { Icone } from '../src/ui/icones';
import { useSession } from './_layout';

function normaliser(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function ModelesHabillementEcran() {
  const router = useRouter();
  const { revisionSynchronisation, synchroniserMaintenant } = useSession();
  const [modeles, setModeles] = useState<ModeleHabillementMobile[]>([]);
  const [chargement, setChargement] = useState(true);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [recherche, setRecherche] = useState('');

  const charger = useCallback(async () => {
    try {
      setModeles(await listerModelesHabillement());
    } finally {
      setChargement(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void charger();
  }, [charger, revisionSynchronisation]));

  const visibles = useMemo(() => {
    const q = normaliser(recherche.trim());
    if (!q) return modeles;
    return modeles.filter(m => [
      m.produit.nom, m.categorieMode ?? '', m.marque ?? '', m.saison ?? '',
      ...m.tailles, ...m.couleurs.map(c => c.nom), ...m.variantes.map(v => v.sku),
    ].some(v => normaliser(v).includes(q)));
  }, [modeles, recherche]);

  const rafraichir = useCallback(async () => {
    setRafraichissement(true);
    try {
      await synchroniserMaintenant();
      await charger();
    } finally {
      setRafraichissement(false);
    }
  }, [charger, synchroniserMaintenant]);

  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <View>
          <Text style={s.titre}>Modèles</Text>
          <Text style={s.sousTitre}>Tailles, couleurs et stock par déclinaison</Text>
        </View>
      </View>
      <View style={s.recherche}>
        <Icone nom="recherche" taille={18} couleur={couleurs.texteFaible} />
        <TextInput
          value={recherche}
          onChangeText={setRecherche}
          placeholder="Modèle, taille, couleur ou SKU"
          placeholderTextColor={couleurs.texteFaible}
          style={s.champ}
          autoCorrect={false}
        />
      </View>

      {chargement ? (
        <View style={s.centre}><ActivityIndicator color={couleurs.primaire} /></View>
      ) : (
        <FlatList
          data={visibles}
          keyExtractor={m => String(m.produit.id)}
          refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={rafraichir} />}
          contentContainerStyle={s.liste}
          ListEmptyComponent={
            <View style={s.centre}>
              <Text style={s.videTitre}>Aucun modèle disponible</Text>
              <Text style={s.videTexte}>Synchronisez le catalogue Habillement depuis le Web.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <CarteModele
              modele={item}
              onPress={() => router.push({ pathname: '/modele/[id]', params: { id: String(item.produit.id) } })}
            />
          )}
        />
      )}
    </View>
  );
}

function CarteModele({ modele, onPress }: { modele: ModeleHabillementMobile; onPress: () => void }) {
  const image = uriImage(modele.produit.cheminImage);
  const rupture = modele.produit.gestionStock && modele.stockDisponible <= 0;
  return (
    <Pressable style={s.carte} onPress={onPress}>
      {image ? <Image source={{ uri: image }} style={s.photo} /> : (
        <View style={[s.photo, s.photoVide]}>
          <Text style={s.initiale}>{modele.produit.nom.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View style={s.corps}>
        <View style={s.ligneTitre}>
          <Text style={s.nom} numberOfLines={1}>{modele.produit.nom}</Text>
          <Text style={[s.stock, rupture && s.rupture]}>
            {rupture ? 'Rupture' : `${modele.stockDisponible} dispo.`}
          </Text>
        </View>
        <Text style={s.meta} numberOfLines={1}>
          {[modele.categorieMode, modele.marque].filter(Boolean).join(' · ') || 'Habillement'}
        </Text>
        <View style={s.puces}>
          {modele.couleurs.slice(0, 4).map(c => (
            <View key={c.nom} style={s.puce}>
              {c.codeHex ? <View style={[s.couleur, { backgroundColor: c.codeHex }]} /> : null}
              <Text style={s.puceTexte}>{c.nom}</Text>
            </View>
          ))}
          {modele.tailles.slice(0, 5).map(t => (
            <View key={t} style={s.puce}><Text style={s.puceTexte}>{t}</Text></View>
          ))}
        </View>
        <Text style={s.variantes}>{modele.variantes.length} déclinaison(s) · {modele.stockTotal} en stock</Text>
      </View>
      <Icone nom="chevron" taille={17} couleur={couleurs.texteEteint} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  page:{flex:1,backgroundColor:couleurs.fond},
  entete:{paddingHorizontal:16,paddingTop:14,paddingBottom:10,backgroundColor:couleurs.surface},
  titre:{fontSize:22,fontWeight:'800',color:couleurs.texte},
  sousTitre:{fontSize:12,color:couleurs.texteFaible,marginTop:2},
  recherche:{margin:12,flexDirection:'row',alignItems:'center',gap:8,borderWidth:1,borderColor:couleurs.bordure,borderRadius:12,paddingHorizontal:12,backgroundColor:couleurs.surface},
  champ:{flex:1,minHeight:46,color:couleurs.texte,fontSize:15},
  liste:{padding:12,paddingBottom:90,gap:9},
  carte:{flexDirection:'row',alignItems:'center',gap:12,padding:11,borderRadius:12,borderWidth:1,borderColor:couleurs.bordure,backgroundColor:couleurs.surface},
  photo:{width:68,height:76,borderRadius:9,backgroundColor:couleurs.fond},
  photoVide:{alignItems:'center',justifyContent:'center'},
  initiale:{fontSize:25,fontWeight:'800',color:couleurs.texteFaible},
  corps:{flex:1,gap:4},
  ligneTitre:{flexDirection:'row',gap:8,alignItems:'center'},
  nom:{flex:1,fontSize:16,fontWeight:'700',color:couleurs.texte},
  stock:{fontSize:11,fontWeight:'700',color:couleurs.succes},
  rupture:{color:couleurs.danger},
  meta:{fontSize:12,color:couleurs.texteFaible},
  puces:{flexDirection:'row',flexWrap:'wrap',gap:5},
  puce:{minHeight:24,paddingHorizontal:7,borderRadius:999,borderWidth:1,borderColor:couleurs.bordure,flexDirection:'row',alignItems:'center',gap:4},
  puceTexte:{fontSize:11,color:couleurs.texte},
  couleur:{width:10,height:10,borderRadius:5,borderWidth:1,borderColor:couleurs.bordure},
  variantes:{fontSize:11,color:couleurs.texteFaible},
  centre:{flex:1,alignItems:'center',justifyContent:'center',padding:30,gap:8},
  videTitre:{fontSize:17,fontWeight:'700',color:couleurs.texte},
  videTexte:{fontSize:13,color:couleurs.texteFaible,textAlign:'center'},
});
