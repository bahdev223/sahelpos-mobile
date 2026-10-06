import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';

import {
  enregistrerComptageArrivage,
  obtenirArrivage,
  validerReceptionArrivage,
  type ArrivageLocal,
  type ComptageArrivage,
} from '../../../../src/services/arrivage';
import { useSession } from '../../../_layout';
import { BandeauEtat, Bouton, espaces, rayons } from '../../../../src/ui/components';
import { Icone } from '../../../../src/ui/icones';
import { HABILLEMENT_MOBILE_THEME as H } from '../../../../src/profile-ui/habillement/theme';

interface Saisie {
  recue: string;
  rejetee: string;
  motif: string;
  lot: string;
  peremption: string;
}

function nombre(v:string):number {
  const n=Number(v.replace(',','.'));
  return Number.isFinite(n)?n:0;
}

export default function ReceptionArrivageHabillement() {
  const router=useRouter();
  const {id}=useLocalSearchParams<{id:string}>();
  const {synchroniserMaintenant}=useSession();
  const identifiant=Number(id);
  const [arrivage,setArrivage]=useState<ArrivageLocal|null>(null);
  const [saisies,setSaisies]=useState<Record<number,Saisie>>({});
  const [enCours,setEnCours]=useState(false);

  const charger=useCallback(async()=>{
    const a=await obtenirArrivage(identifiant);
    setArrivage(a);
    if(!a)return;
    setSaisies(actuel=>{
      const suivant={...actuel};
      for(const l of a.lignes){
        if(!suivant[l.id]){
          suivant[l.id]={
            recue:String(l.comptee?l.quantiteRecue:l.quantitePrevue),
            rejetee:String(l.quantiteRejetee||0),
            motif:l.motifEcart||'',
            lot:l.numeroLot||'',
            peremption:l.datePeremption||'',
          };
        }
      }
      return suivant;
    });
  },[identifiant]);

  useFocusEffect(useCallback(()=>{void charger();},[charger]));

  const comptages=useMemo<ComptageArrivage[]>(()=>{
    if(!arrivage)return[];
    return arrivage.lignes.map(l=>{
      const s=saisies[l.id]??{recue:'0',rejetee:'0',motif:'',lot:'',peremption:''};
      return {
        ligneId:l.id,
        quantiteRecue:nombre(s.recue),
        quantiteRejetee:nombre(s.rejetee),
        motifEcart:s.motif,
        numeroLot:s.lot,
        datePeremption:s.peremption||null,
      };
    });
  },[arrivage,saisies]);

  const invalide=useMemo(()=>{
    if(!arrivage)return true;
    return comptages.some(c=>{
      if(c.quantiteRecue<0||(c.quantiteRejetee ?? 0)<0)return true;
      const ligne=arrivage.lignes.find(l=>l.id===c.ligneId);
      if(!ligne)return true;
      return c.quantiteRecue+c.quantiteRejetee<0;
    });
  },[arrivage,comptages]);

  const ecarts=useMemo(()=>{
    if(!arrivage)return 0;
    return comptages.filter(c=>{
      const l=arrivage.lignes.find(x=>x.id===c.ligneId);
      return !!l&&Math.abs(c.quantiteRecue+c.quantiteRejetee-l.quantitePrevue)>0.0001;
    }).length;
  },[arrivage,comptages]);

  const sauver=useCallback(async(finaliser=false)=>{
    if(!arrivage||invalide)return;
    setEnCours(true);
    try{
      await enregistrerComptageArrivage(arrivage.id,comptages);
      if(finaliser){
        await validerReceptionArrivage(arrivage.id);
        try{await synchroniserMaintenant();}catch{/* réception reste locale */ }
        Alert.alert('Réception terminée','Le stock et les coûts rendus ont été mis à jour.',[
          {text:'Voir l’arrivage',onPress:()=>router.replace({pathname:'/habillement/arrivages/[id]',params:{id:String(arrivage.id)}})},
        ]);
      }else{
        await charger();
        Alert.alert('Comptage enregistré','Vous pouvez reprendre cette réception plus tard.');
      }
    }catch(e){
      Alert.alert('Réception impossible',e instanceof Error?e.message:String(e));
    }finally{setEnCours(false);}
  },[arrivage,charger,comptages,invalide,router,synchroniserMaintenant]);

  if(!arrivage){
    return <View style={s.page}><BandeauEtat/><View style={s.vide}><Text style={s.titre}>Arrivage introuvable</Text></View></View>;
  }

  return <View style={s.page}>
    <BandeauEtat/>
    <View style={s.entete}>
      <Pressable onPress={()=>router.back()} hitSlop={10}><Icone nom="retour" taille={23} couleur={H.texte}/></Pressable>
      <View style={s.enteteTextes}>
        <Text style={s.titre}>Réception</Text>
        <Text style={s.sous}>{arrivage.numero} · {arrivage.titre}</Text>
      </View>
    </View>

    <View style={s.resume}>
      <Text style={s.resumeTexte}>{arrivage.lignes.length} ligne(s)</Text>
      <Text style={s.resumeTexte}>{ecarts} écart(s)</Text>
      <Text style={s.resumeTexte}>{arrivage.totalPiecesPrevues} pièce(s) prévues</Text>
    </View>

    <FlatList
      data={arrivage.lignes}
      keyExtractor={l=>l.idLocal}
      contentContainerStyle={s.liste}
      keyboardShouldPersistTaps="handled"
      renderItem={({item})=>{
        const saisie=saisies[item.id]??{recue:'',rejetee:'',motif:'',lot:'',peremption:''};
        const total=nombre(saisie.recue)+nombre(saisie.rejetee);
        const ecart=total-item.quantitePrevue;
        return <View style={[s.carte,Math.abs(ecart)>0.0001&&s.carteEcart]}>
          <Text style={s.modele}>{item.produitNom}</Text>
          {item.varianteNom?<Text style={s.variante}>{item.varianteNom}</Text>:null}
          <Text style={s.meta}>Prévu : {item.quantitePrevue} · {item.varianteSku||'Produit simple'}</Text>

          <View style={s.deux}>
            <Champ label="Reçu / accepté" value={saisie.recue} onChange={v=>setSaisies(cur=>({...cur,[item.id]:{...cur[item.id],recue:v}}))}/>
            <Champ label="Rejeté / abîmé" value={saisie.rejetee} onChange={v=>setSaisies(cur=>({...cur,[item.id]:{...cur[item.id],rejetee:v}}))}/>
          </View>
          <View style={s.ecartLigne}>
            <Text style={s.meta}>Compté : {Math.round(total*1000)/1000}</Text>
            <Text style={[s.ecart,Math.abs(ecart)>0.0001&&s.ecartActif]}>
              Écart {ecart>0?'+':''}{Math.round(ecart*1000)/1000}
            </Text>
          </View>
          {Math.abs(ecart)>0.0001?<TextInput
            value={saisie.motif}
            onChangeText={v=>setSaisies(cur=>({...cur,[item.id]:{...cur[item.id],motif:v}}))}
            placeholder="Motif de l’écart : manquant, abîmé…"
            placeholderTextColor={H.texteEteint}
            style={s.champLong}
          />:null}

          <Text style={s.sectionLabel}>Traçabilité du lot</Text>
          <View style={s.deux}>
            <Champ label="N° lot" value={saisie.lot} onChange={v=>setSaisies(cur=>({...cur,[item.id]:{...cur[item.id],lot:v}}))} clavier="default"/>
            <Champ label="Péremption" value={saisie.peremption} onChange={v=>setSaisies(cur=>({...cur,[item.id]:{...cur[item.id],peremption:v}}))} clavier="default" placeholder="AAAA-MM-JJ"/>
          </View>
        </View>;
      }}
    />

    <View style={s.pied}>
      <Bouton titre="Enregistrer le comptage" variante="secondaire" onPress={()=>void sauver(false)} desactive={invalide} enCours={enCours}/>
      <Bouton titre="Valider la réception définitive" onPress={()=>Alert.alert(
        'Réception définitive',
        'Le stock sera augmenté et le coût rendu appliqué aux variantes reçues. Continuer ?',
        [{text:'Annuler',style:'cancel'},{text:'Valider',onPress:()=>void sauver(true)}],
      )} desactive={invalide||arrivage.lignes.length===0} enCours={enCours} grand/>
    </View>
  </View>;
}

function Champ({label,value,onChange,clavier='decimal-pad',placeholder}:{
  label:string;value:string;onChange:(v:string)=>void;
  clavier?:'decimal-pad'|'default';placeholder?:string;
}){
  return <View style={s.champBloc}><Text style={s.label}>{label}</Text><TextInput
    value={value} onChangeText={onChange} keyboardType={clavier}
    placeholder={placeholder} placeholderTextColor={H.texteEteint}
    style={s.champ}
  /></View>;
}

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:H.fond},entete:{flexDirection:'row',alignItems:'center',gap:espaces.m,padding:espaces.m,backgroundColor:H.surface,borderBottomWidth:1,borderBottomColor:H.bordure},enteteTextes:{flex:1},titre:{fontSize:19,fontWeight:'900',color:H.texte},sous:{marginTop:2,fontSize:11,color:H.texteFaible},
  resume:{flexDirection:'row',flexWrap:'wrap',gap:7,padding:espaces.m},resumeTexte:{paddingHorizontal:9,paddingVertical:5,borderRadius:999,backgroundColor:H.primaireClair,fontSize:10,fontWeight:'800',color:H.primaire},
  liste:{paddingHorizontal:espaces.m,paddingBottom:170,gap:espaces.s},carte:{padding:espaces.m,borderRadius:rayons.m,borderWidth:1,borderColor:H.bordure,backgroundColor:H.surface},carteEcart:{borderColor:'#D97706'},
  modele:{fontSize:14,fontWeight:'900',color:H.texte},variante:{marginTop:2,fontSize:12,fontWeight:'800',color:H.primaire},meta:{marginTop:3,fontSize:10,color:H.texteFaible},
  deux:{marginTop:10,flexDirection:'row',gap:8},champBloc:{flex:1,gap:5},label:{fontSize:9,fontWeight:'800',color:H.texteFaible},champ:{minHeight:43,paddingHorizontal:10,borderRadius:rayons.s,borderWidth:1,borderColor:H.bordure,backgroundColor:H.fond,color:H.texte,fontWeight:'800'},champLong:{marginTop:8,minHeight:44,paddingHorizontal:10,borderRadius:rayons.s,borderWidth:1,borderColor:'#D97706',color:H.texte,backgroundColor:H.fond},
  ecartLigne:{marginTop:7,flexDirection:'row',justifyContent:'space-between'},ecart:{fontSize:10,fontWeight:'900',color:H.texteFaible},ecartActif:{color:'#B45309'},sectionLabel:{marginTop:13,fontSize:10,fontWeight:'900',color:H.texte},
  pied:{padding:espaces.m,gap:8,borderTopWidth:1,borderTopColor:H.bordure,backgroundColor:H.surface},vide:{flex:1,alignItems:'center',justifyContent:'center'},
});
