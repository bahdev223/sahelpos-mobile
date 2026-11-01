import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';

import { creerArrivage } from '../../../src/services/arrivage';
import { BandeauEtat, Bouton, espaces, rayons } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';
import { HABILLEMENT_MOBILE_THEME as H } from '../../../src/profile-ui/habillement/theme';

function Champ({label,value,onChange,placeholder,multiline=false}:{
  label:string;value:string;onChange:(v:string)=>void;placeholder?:string;multiline?:boolean;
}) {
  return <View style={s.champBloc}>
    <Text style={s.label}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={H.texteEteint}
      multiline={multiline}
      style={[s.champ,multiline&&s.multiligne]}
    />
  </View>;
}

export default function NouvelArrivageHabillement() {
  const router=useRouter();
  const [titre,setTitre]=useState('');
  const [transporteur,setTransporteur]=useState('');
  const [tracking,setTracking]=useState('');
  const [dateEstimee,setDateEstimee]=useState('');
  const [notes,setNotes]=useState('');
  const [enCours,setEnCours]=useState(false);

  const creer=useCallback(async()=>{
    if(!titre.trim()){
      Alert.alert('Titre requis',"Donnez un nom à l'arrivage.");
      return;
    }
    setEnCours(true);
    try{
      const id=await creerArrivage({
        titre,
        transporteur,
        trackingNumber:tracking,
        dateReceptionEstimee:dateEstimee.trim()||null,
        notes,
      });
      router.replace({pathname:'/habillement/arrivages/[id]',params:{id:String(id)}});
    }catch(e){
      Alert.alert('Création impossible',e instanceof Error?e.message:String(e));
    }finally{setEnCours(false);}
  },[dateEstimee,notes,router,titre,tracking,transporteur]);

  return <View style={s.page}>
    <BandeauEtat/>
    <View style={s.entete}>
      <Pressable onPress={()=>router.back()} hitSlop={10}>
        <Icone nom="retour" taille={23} couleur={H.texte}/>
      </Pressable>
      <View style={s.enteteTextes}>
        <Text style={s.titre}>Nouvel arrivage</Text>
        <Text style={s.sous}>Créer le dossier logistique</Text>
      </View>
    </View>
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled">
        <View style={s.info}>
          <Text style={s.infoTitre}>Commencez par le dossier</Text>
          <Text style={s.infoTexte}>
            Les bons fournisseurs, tailles/couleurs, frais, quantités reçues et lots seront ajoutés sur la fiche suivante.
          </Text>
        </View>
        <Champ label="Titre *" value={titre} onChange={setTitre} placeholder="Ex. Conteneur Dakar octobre"/>
        <Champ label="Transporteur / transitaire" value={transporteur} onChange={setTransporteur} placeholder="Ex. Sahel Transit"/>
        <Champ label="N° tracking / BL" value={tracking} onChange={setTracking} placeholder="Ex. BL-2026-1044"/>
        <Champ label="Réception estimée" value={dateEstimee} onChange={setDateEstimee} placeholder="AAAA-MM-JJ"/>
        <Champ label="Notes" value={notes} onChange={setNotes} placeholder="Informations utiles…" multiline/>
      </ScrollView>
      <View style={s.pied}>
        <Bouton titre="Créer et compléter l’arrivage" onPress={()=>void creer()} enCours={enCours} grand/>
      </View>
    </KeyboardAvoidingView>
  </View>;
}

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:H.fond},
  entete:{flexDirection:'row',alignItems:'center',gap:espaces.m,padding:espaces.m,backgroundColor:H.surface,borderBottomWidth:1,borderBottomColor:H.bordure},
  enteteTextes:{flex:1},titre:{fontSize:19,fontWeight:'900',color:H.texte},sous:{marginTop:2,fontSize:11,color:H.texteFaible},
  contenu:{padding:espaces.m,paddingBottom:120,gap:espaces.m},
  info:{padding:espaces.m,borderRadius:rayons.m,backgroundColor:H.primaireClair},infoTitre:{fontSize:13,fontWeight:'900',color:H.primaireFonce},infoTexte:{marginTop:4,fontSize:11,lineHeight:17,color:H.texteCorps},
  champBloc:{gap:6},label:{fontSize:11,fontWeight:'800',color:H.texteFaible},
  champ:{minHeight:48,paddingHorizontal:12,borderRadius:rayons.m,borderWidth:1,borderColor:H.bordure,backgroundColor:H.surface,color:H.texte,fontSize:14},
  multiligne:{minHeight:100,paddingTop:12,textAlignVertical:'top'},
  pied:{padding:espaces.m,borderTopWidth:1,borderTopColor:H.bordure,backgroundColor:H.surface},
});
