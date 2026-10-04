import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';

import { listerModelesHabillement, type ModeleHabillementMobile } from '../../src/services/catalogueHabillement';
import { BandeauEtat, couleurs, uriImage } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';

export default function FicheModeleMobile() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const produitId = Number(id);
  const [modele, setModele] = useState<ModeleHabillementMobile | null>(null);
  const [chargement, setChargement] = useState(true);

  useFocusEffect(useCallback(() => {
    let actif = true;
    void listerModelesHabillement().then(liste => {
      if (actif) setModele(liste.find(m => m.produit.id === produitId) ?? null);
    }).finally(() => actif && setChargement(false));
    return () => { actif = false; };
  }, [produitId]));

  if (chargement) return <View style={s.page}><BandeauEtat /><View style={s.centre}><ActivityIndicator color={couleurs.primaire} /></View></View>;
  if (!modele) return <View style={s.page}><BandeauEtat /><View style={s.centre}><Text style={s.nom}>Modèle introuvable</Text></View></View>;

  const image = uriImage(modele.produit.cheminImage);
  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} style={s.retour}>
          <Icone nom="retour" taille={18} couleur={couleurs.primaire} />
          <Text style={s.retourTexte}>Modèles</Text>
        </Pressable>
        <Text style={s.titre}>Fiche modèle</Text>
      </View>
      <ScrollView contentContainerStyle={s.contenu}>
        <View style={s.identite}>
          {image ? <Image source={{ uri: image }} style={s.photo} /> : <View style={[s.photo,s.photoVide]}><Text style={s.initiale}>{modele.produit.nom.slice(0,1).toUpperCase()}</Text></View>}
          <View style={s.identiteCorps}>
            <Text style={s.nom}>{modele.produit.nom}</Text>
            <Text style={s.meta}>{[modele.categorieMode,modele.marque,modele.collection].filter(Boolean).join(' · ') || 'Habillement'}</Text>
            <Text style={s.stock}>{modele.stockDisponible} disponible(s) · {modele.stockTotal} en stock</Text>
          </View>
        </View>

        <View style={s.carte}>
          <Text style={s.carteTitre}>Déclinaisons</Text>
          {modele.variantes.map(v => (
            <View key={v.idLocal} style={s.variante}>
              <View style={s.varianteCorps}>
                <Text style={s.varianteNom}>{v.valeurs.map(x=>x.nom).join(' · ') || v.sku}</Text>
                <Text style={s.sku}>{v.sku}</Text>
              </View>
              <View style={s.varianteDroite}>
                <Text style={[s.varianteStock,v.stockDisponible<=0&&s.rupture]}>{v.stockDisponible} dispo.</Text>
                {v.prixOverride !== null ? <Text style={s.prix}>{Math.round(v.prixOverride).toLocaleString('fr-FR')} F</Text> : null}
              </View>
            </View>
          ))}
          {modele.variantes.length===0 ? <Text style={s.vide}>Aucune déclinaison synchronisée.</Text> : null}
        </View>

        <View style={s.carte}>
          <Text style={s.carteTitre}>Tailles / pointures</Text>
          <View style={s.puces}>{modele.tailles.map(t=><View key={t} style={s.puce}><Text style={s.puceTexte}>{t}</Text></View>)}</View>
        </View>
        <View style={s.carte}>
          <Text style={s.carteTitre}>Couleurs</Text>
          <View style={s.puces}>{modele.couleurs.map(c=><View key={c.nom} style={s.puce}>{c.codeHex?<View style={[s.pastille,{backgroundColor:c.codeHex}]}/>:null}<Text style={s.puceTexte}>{c.nom}</Text></View>)}</View>
        </View>
      </ScrollView>
    </View>
  );
}

const s=StyleSheet.create({
 page:{flex:1,backgroundColor:couleurs.fond},centre:{flex:1,alignItems:'center',justifyContent:'center'},
 entete:{flexDirection:'row',alignItems:'center',gap:14,padding:14,backgroundColor:couleurs.surface,borderBottomWidth:1,borderBottomColor:couleurs.bordure},
 retour:{flexDirection:'row',alignItems:'center',gap:5},retourTexte:{color:couleurs.primaire,fontWeight:'700'},titre:{fontSize:18,fontWeight:'800',color:couleurs.texte},
 contenu:{padding:12,paddingBottom:40,gap:12},identite:{flexDirection:'row',gap:14,padding:14,borderRadius:12,backgroundColor:couleurs.surface,borderWidth:1,borderColor:couleurs.bordure},
 photo:{width:100,height:116,borderRadius:10,backgroundColor:couleurs.surfaceDouce},photoVide:{alignItems:'center',justifyContent:'center'},initiale:{fontSize:34,fontWeight:'800',color:couleurs.texteFaible},
 identiteCorps:{flex:1,justifyContent:'center',gap:5},nom:{fontSize:20,fontWeight:'800',color:couleurs.texte},meta:{fontSize:13,color:couleurs.texteFaible},stock:{fontSize:13,fontWeight:'700',color:couleurs.succesFonce},
 carte:{backgroundColor:couleurs.surface,borderRadius:12,borderWidth:1,borderColor:couleurs.bordure,overflow:'hidden'},carteTitre:{fontSize:15,fontWeight:'800',color:couleurs.texte,padding:14,paddingBottom:8},
 variante:{minHeight:58,flexDirection:'row',alignItems:'center',paddingHorizontal:14,paddingVertical:9,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:couleurs.bordure},
 varianteCorps:{flex:1,gap:2},varianteNom:{fontSize:14,fontWeight:'700',color:couleurs.texte},sku:{fontSize:11,color:couleurs.texteFaible},varianteDroite:{alignItems:'flex-end',gap:2},varianteStock:{fontSize:12,fontWeight:'700',color:couleurs.succesFonce},rupture:{color:couleurs.danger},prix:{fontSize:12,color:couleurs.texte},
 puces:{flexDirection:'row',flexWrap:'wrap',gap:7,padding:14,paddingTop:4},puce:{minHeight:30,paddingHorizontal:9,borderRadius:999,borderWidth:1,borderColor:couleurs.bordure,flexDirection:'row',alignItems:'center',gap:5},puceTexte:{fontSize:12,color:couleurs.texte},pastille:{width:12,height:12,borderRadius:6,borderWidth:1,borderColor:couleurs.bordure},vide:{padding:14,color:couleurs.texteFaible},
});
