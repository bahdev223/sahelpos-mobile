import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { obtenirProduit } from '../../../src/db/repositories/produit';
import {
  changerEtatVariante, genererMatriceVariantesLocale, libelleVariante,
  listerVariantesProduit, optionsMatriceProduit,
  type OptionMatriceMobile, type VarianteMobile,
} from '../../../src/db/repositories/variante';
import type { Produit } from '../../../src/domain/types';
import { BandeauEtat, Bouton, formaterQuantite } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';
import { couleurs, espaces, rayons } from '../../../src/ui/theme';

export default function CaracteristiquesQuincaillerie() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{id:string}>();
  const produitId = Number(id);
  const [produit,setProduit] = useState<Produit|null>(null);
  const [variantes,setVariantes] = useState<VarianteMobile[]>([]);
  const [dimensions,setDimensions] = useState<Awaited<ReturnType<typeof optionsMatriceProduit>>>([]);
  const [selection,setSelection] = useState<Record<string,Set<number>>>({});
  const [modal,setModal] = useState(false);
  const [enCours,setEnCours] = useState(false);
  const [erreur,setErreur] = useState('');
  const [charge,setCharge] = useState(false);

  const charger=useCallback(async()=>{
    if(!Number.isInteger(produitId)||produitId<=0){setErreur('Référence invalide.');setCharge(true);return;}
    try{
      const [p,v,d]=await Promise.all([obtenirProduit(produitId),listerVariantesProduit(produitId,false),optionsMatriceProduit()]);
      if(!p){setErreur('Référence introuvable.');setCharge(true);return;}
      setProduit(p);setVariantes(v);setDimensions(d);setErreur('');setCharge(true);
    }catch(e){setErreur(e instanceof Error?e.message:'Lecture impossible.');setCharge(true);}
  },[produitId]);
  useFocusEffect(useCallback(()=>{void charger();},[charger]));

  const selections=useMemo(()=>{
    const sortie:Record<string,OptionMatriceMobile[]>={};
    for(const d of dimensions){
      const ids=selection[d.code]??new Set<number>();
      sortie[d.code]=d.valeurs.filter(v=>ids.has(v.valeurServeurId));
    }
    return sortie;
  },[dimensions,selection]);
  const nb=useMemo(()=>{
    const groupes=Object.values(selections).filter(g=>g.length>0);
    return groupes.length?groupes.reduce((t,g)=>t*g.length,1):0;
  },[selections]);

  const ouvrir=()=>{setSelection({});setModal(true);};
  const basculer=(dimension:string,idValeur:number)=>setSelection(actuel=>{
    const prochain={...actuel};const valeurs=new Set(prochain[dimension]??[]);
    if(valeurs.has(idValeur))valeurs.delete(idValeur);else valeurs.add(idValeur);
    prochain[dimension]=valeurs;return prochain;
  });
  const generer=async()=>{
    if(!produit||nb===0||nb>240)return;
    setEnCours(true);
    try{
      const ids=await genererMatriceVariantesLocale(produit.id,selections);
      setModal(false);setSelection({});await charger();
      Alert.alert('Caractéristiques enregistrées',`${ids.length} combinaison(s) disponible(s). Les nouvelles variantes démarrent avec un stock nul.`);
    }catch(e){Alert.alert('Impossible',e instanceof Error?e.message:String(e));}
    finally{setEnCours(false);}
  };
  const changer=async(v:VarianteMobile)=>{
    setEnCours(true);
    try{await changerEtatVariante(v.id,!v.actif);await charger();}
    catch(e){Alert.alert('Impossible',e instanceof Error?e.message:String(e));}
    finally{setEnCours(false);}
  };

  return <View style={s.page}>
    <BandeauEtat/>
    <View style={s.entete}>
      <Pressable style={s.icone} onPress={()=>router.back()} accessibilityLabel="Retour"><Icone nom="retour" taille={22} couleur={couleurs.texte}/></Pressable>
      <View style={s.flex}><Text style={s.titre}>Caractéristiques techniques</Text><Text style={s.muted}>{produit?.nom??'Référence'}</Text></View>
      <Pressable style={s.icone} onPress={ouvrir} accessibilityLabel="Ajouter des combinaisons"><Icone nom="plus" taille={22} couleur={couleurs.primaire}/></Pressable>
    </View>
    {!charge?<View style={s.centre}><ActivityIndicator color={couleurs.primaire}/></View>:
      erreur?<View style={s.centre}><Text style={s.erreur}>{erreur}</Text><Bouton titre="Réessayer" onPress={()=>void charger()}/></View>:
      <ScrollView contentContainerStyle={s.contenu}>
        <Text style={s.explication}>Une variante correspond à une combinaison réelle de caractéristiques : diamètre, section, capacité, tension, couleur… Le stock reste séparé pour chaque combinaison.</Text>
        {variantes.map(v=><View key={v.idLocal} style={[s.variante,!v.actif&&s.inactive]}>
          <View style={s.flex}><Text style={s.varianteNom}>{libelleVariante(v)}</Text><Text style={s.muted}>{v.sku} · stock {formaterQuantite(v.stockActuel)}</Text></View>
          <Pressable disabled={enCours} style={[s.etat,v.actif&&s.etatDanger]} onPress={()=>void changer(v)}><Text style={[s.etatTexte,v.actif&&s.etatTexteDanger]}>{v.actif?'Désactiver':'Réactiver'}</Text></Pressable>
        </View>)}
        {!variantes.length?<View style={s.centre}><Text style={s.varianteNom}>Aucune combinaison technique</Text><Text style={s.muted}>Utilisez + pour définir les variantes vendables.</Text></View>:null}
      </ScrollView>}

    <Modal visible={modal} animationType="slide" onRequestClose={()=>!enCours&&setModal(false)}>
      <SafeAreaView style={s.page} edges={['top','bottom']}>
        <View style={s.entete}><Pressable disabled={enCours} style={s.icone} onPress={()=>setModal(false)}><Icone nom="fermer" taille={22} couleur={couleurs.texte}/></Pressable><View style={s.flex}><Text style={s.titre}>Ajouter des variantes</Text><Text style={s.muted}>{nb} combinaison(s) · maximum 240</Text></View></View>
        <ScrollView contentContainerStyle={s.contenu}>
          {!dimensions.length?<Text style={s.explication}>Le référentiel technique n’est pas encore synchronisé. Synchronisez la boutique avant de créer des variantes.</Text>:null}
          {dimensions.map(d=><View key={d.code} style={s.dimension}>
            <Text style={s.dimensionTitre}>{d.nom}</Text>
            <View style={s.options}>{d.valeurs.map(v=>{
              const actif=selection[d.code]?.has(v.valeurServeurId)??false;
              return <Pressable key={v.valeurServeurId} onPress={()=>basculer(d.code,v.valeurServeurId)} style={[s.option,actif&&s.optionActive]}>
                {v.codeHex&&/^#[\da-f]{6}$/i.test(v.codeHex)?<View style={[s.couleur,{backgroundColor:v.codeHex}]}/>:null}
                <Text style={[s.optionTexte,actif&&s.optionTexteActive]}>{v.nom}</Text>
              </Pressable>;
            })}</View>
          </View>)}
          {nb>240?<Text style={s.erreur}>Trop de combinaisons. Réduisez la sélection à 240 maximum.</Text>:null}
        </ScrollView>
        <View style={s.pied}><Bouton titre={`Créer ${nb} combinaison(s)`} onPress={()=>void generer()} desactive={nb===0||nb>240||!dimensions.length} enCours={enCours} grand/></View>
      </SafeAreaView>
    </Modal>
  </View>;
}
const s=StyleSheet.create({
 page:{flex:1,backgroundColor:couleurs.fond},flex:{flex:1,minWidth:0},
 entete:{flexDirection:'row',alignItems:'center',gap:10,padding:12,backgroundColor:couleurs.surface,borderBottomWidth:1,borderBottomColor:couleurs.bordure},
 icone:{width:48,height:48,alignItems:'center',justifyContent:'center'},titre:{fontSize:19,fontWeight:'800',color:couleurs.texte},muted:{fontSize:12,lineHeight:18,color:couleurs.texteFaible},
 contenu:{padding:16,paddingBottom:40,gap:10},explication:{fontSize:13,lineHeight:20,color:couleurs.texteFaible,marginBottom:6},
 variante:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:12,borderWidth:1,borderColor:couleurs.bordure,backgroundColor:couleurs.surface},
 inactive:{opacity:.55},varianteNom:{fontSize:14,fontWeight:'800',color:couleurs.texte},etat:{paddingHorizontal:10,minHeight:40,justifyContent:'center',borderRadius:9,backgroundColor:couleurs.primaireDouce},etatDanger:{backgroundColor:couleurs.dangerDouce},
 etatTexte:{fontSize:11,fontWeight:'800',color:couleurs.primaire},etatTexteDanger:{color:couleurs.danger},
 centre:{padding:28,alignItems:'center',justifyContent:'center',gap:10},erreur:{color:couleurs.danger,fontSize:13,lineHeight:19,textAlign:'center'},
 dimension:{marginBottom:18},dimensionTitre:{fontSize:14,fontWeight:'800',color:couleurs.texte,marginBottom:8},options:{flexDirection:'row',flexWrap:'wrap',gap:8},
 option:{minHeight:44,paddingHorizontal:12,borderRadius:12,borderWidth:1,borderColor:couleurs.bordure,backgroundColor:couleurs.surface,flexDirection:'row',alignItems:'center',gap:7},
 optionActive:{backgroundColor:couleurs.primaire,borderColor:couleurs.primaire},optionTexte:{fontSize:12,fontWeight:'700',color:couleurs.texte},optionTexteActive:{color:couleurs.texteInverse},
 couleur:{width:20,height:20,borderRadius:10,borderWidth:1,borderColor:couleurs.bordure},pied:{padding:16,borderTopWidth:1,borderTopColor:couleurs.bordure,backgroundColor:couleurs.surface},
});
