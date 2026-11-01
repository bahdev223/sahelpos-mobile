import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import type { SecteurCommerce } from '../../domain/commerce';
import { rechercherActivites } from '../../domain/inscription';
import { Icone } from '../icones';
import { couleurs as C } from '../theme';

// Metro exige des chemins statiques. Les mêmes illustrations sont embarquées, même hors ligne.
export const ILLUSTRATIONS_ACTIVITES:Record<SecteurCommerce,ImageSourcePropType> = {
  COMMERCE_GENERAL:require('../../../assets/activites/COMMERCE_GENERAL.png'),
  ALIMENTATION:require('../../../assets/activites/ALIMENTATION.png'),
  HABILLEMENT:require('../../../assets/activites/HABILLEMENT.png'),
  FRIPERIE:require('../../../assets/activites/FRIPERIE.png'),
  ELECTRONIQUE:require('../../../assets/activites/ELECTRONIQUE.png'),
  ELECTRICITE:require('../../../assets/activites/ELECTRICITE.png'),
  QUINCAILLERIE:require('../../../assets/activites/QUINCAILLERIE.png'),
  COSMETIQUE:require('../../../assets/activites/COSMETIQUE.png'),
  PIECES_DETACHEES:require('../../../assets/activites/PIECES_DETACHEES.png'),
  CEREALES_VRAC:require('../../../assets/activites/CEREALES_VRAC.png'),
  AUTRE:require('../../../assets/activites/AUTRE.png'),
};
export function ActivitesInscription({valeur,surChoisir,disabled=false}:{
  valeur:string; surChoisir:(v:SecteurCommerce)=>void; disabled?:boolean;
}) {
  const {width} = useWindowDimensions();
  const colonnes = width >= 1000 ? 4 : width >= 700 ? 3 : 2;
  const [recherche,setRecherche] = useState('');
  const activites = rechercherActivites(recherche);
  return <View>
    <TextInput accessibilityLabel="Rechercher une activité" placeholder="Rechercher une activité"
      placeholderTextColor={C.texteFaible} value={recherche} onChangeText={setRecherche} editable={!disabled}
      autoCorrect={false} autoCapitalize="none" returnKeyType="search" style={s.recherche} />
    <View style={s.grille} accessibilityRole="radiogroup" accessibilityLabel="Choisir votre activité">
      {activites.map(a => <View key={a.code} style={{width:`${100/colonnes}%`,padding:4}}>
        <Pressable onPress={()=>surChoisir(a.code)} disabled={disabled} accessibilityRole="radio"
          accessibilityState={{checked:valeur===a.code,disabled}} accessibilityLabel={a.titre}
          style={[s.carte,valeur===a.code&&s.selectionnee]}>
          <View style={[s.coche,valeur===a.code&&s.cocheActive]}>{valeur===a.code?<Icone nom="coche" taille={12} couleur={C.texteInverse}/>:null}</View>
          <Image source={ILLUSTRATIONS_ACTIVITES[a.code]} resizeMode="contain" style={s.image} accessible={false}/>
          <Text style={s.nom}>{a.titre}</Text>
        </Pressable>
      </View>)}
    </View>
    {!activites.length?<Text accessibilityLiveRegion="polite" style={s.vide}>Aucune activité trouvée. Essayez un autre mot.</Text>:null}
  </View>;
}
const s=StyleSheet.create({
  recherche:{minHeight:48,borderWidth:1,borderColor:C.inscriptionBordure,borderRadius:12,paddingHorizontal:14,
    fontSize:16,backgroundColor:C.surface,color:C.inscriptionEncre,marginBottom:12},
  grille:{flexDirection:'row',flexWrap:'wrap',marginHorizontal:-4},
  carte:{minHeight:132,borderWidth:1,borderColor:C.inscriptionBordure,borderRadius:15,backgroundColor:C.surface,
    padding:10,alignItems:'center',justifyContent:'center'},
  selectionnee:{borderWidth:2,borderColor:C.inscriptionBleu,backgroundColor:C.primaireDouce,padding:9},
  image:{width:'100%',height:80,marginBottom:6},nom:{fontSize:13,fontWeight:'700',color:C.inscriptionEncre,textAlign:'center'},
  coche:{position:'absolute',right:8,top:8,width:18,height:18,borderRadius:9,borderWidth:1,borderColor:C.inscriptionBordure,alignItems:'center',justifyContent:'center'},
  cocheActive:{backgroundColor:C.inscriptionBleu,borderColor:C.inscriptionBleu},
  vide:{padding:20,textAlign:'center',color:C.texteFaible},
});
