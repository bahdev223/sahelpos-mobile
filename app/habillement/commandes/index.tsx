import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { listerCommandesClients, type CommandeClientResume } from '../../../src/services/commande-client';
import { useSession } from '../../_layout';
import { HABILLEMENT_MOBILE_THEME as H } from '../../../src/profile-ui/habillement/theme';
import { Icone } from '../../../src/ui/icones';
import { espaces, rayons } from '../../../src/ui/components';

const LIBELLES: Record<string,string>={
  BROUILLON:'Brouillon',CONFIRMEE:'Confirmée',EN_PREPARATION:'En préparation',
  PRETE:'Prête',TERMINEE:'Terminée',ANNULEE:'Annulée',
};

export default function CommandesClientsHabillement(){
  const router=useRouter();
  const {boutique,revisionSynchronisation}=useSession();
  const[commandes,setCommandes]=useState<CommandeClientResume[]>([]);
  const[recherche,setRecherche]=useState('');
  const[filtre,setFiltre]=useState<string>('TOUTES');

  const charger=useCallback(async()=>setCommandes(await listerCommandesClients()),[]);
  useFocusEffect(useCallback(()=>{void charger();},[charger,revisionSynchronisation]));

  const visibles=useMemo(()=>{
    const q=recherche.trim().toLowerCase();
    return commandes.filter(c=>{
      if(filtre!=='TOUTES'&&c.statut!==filtre)return false;
      if(!q)return true;
      return c.numero.toLowerCase().includes(q)||(c.clientNom??'').toLowerCase().includes(q);
    });
  },[commandes,recherche,filtre]);

  return <View style={s.page}>
    <View style={s.entete}>
      <Pressable onPress={()=>router.back()}><Icone nom="retour" taille={23} couleur={H.texte}/></Pressable>
      <View style={{flex:1}}><Text style={s.titre}>Commandes clients</Text><Text style={s.sous}>{commandes.length} commande(s)</Text></View>
      <Pressable style={s.plus} onPress={()=>router.push('/habillement/commandes/nouvelle')}>
        <Icone nom="plus" taille={20} couleur="#fff"/>
      </Pressable>
    </View>

    <View style={s.recherche}><Icone nom="recherche" taille={18} couleur={H.texteFaible}/><TextInput
      value={recherche} onChangeText={setRecherche} placeholder="N° commande ou client"
      placeholderTextColor={H.texteFaible} style={s.input}/></View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtres}>
      {['TOUTES','BROUILLON','CONFIRMEE','EN_PREPARATION','PRETE','TERMINEE'].map(f=><Pressable
        key={f} onPress={()=>setFiltre(f)} style={[s.filtre,filtre===f&&s.filtreActif]}>
        <Text style={[s.filtreTexte,filtre===f&&s.filtreTexteActif]}>{f==='TOUTES'?'Toutes':LIBELLES[f]}</Text>
      </Pressable>)}
    </ScrollView>

    <ScrollView contentContainerStyle={s.liste}>
      {visibles.map(c=><Pressable key={c.id} style={s.carte}
        onPress={()=>router.push({pathname:'/habillement/commandes/[id]',params:{id:String(c.id)}})}>
        <View style={s.carteHaut}><Text style={s.numero}>{c.numero}</Text><View style={[s.badge,c.statut==='PRETE'&&s.badgePret,c.statut==='ANNULEE'&&s.badgeAnnule]}>
          <Text style={s.badgeTexte}>{LIBELLES[c.statut]??c.statut}</Text></View></View>
        <Text style={s.client}>{c.clientNom||'Client de passage'}</Text>
        <View style={s.progression}><View style={s.progressionFond}><View style={[s.progressionBarre,{width:(c.pieces>0?Math.min(100,(c.preparees/c.pieces)*100):0)+'%'}]}/></View>
          <Text style={s.progressionTexte}>{c.preparees}/{c.pieces} préparée(s)</Text></View>
        <View style={s.carteBas}><Text style={s.sync}>{c.syncStatut==='SYNCED'?'Synchronisée':'À synchroniser'}</Text>
          <Text style={s.total}>{Math.round(c.total).toLocaleString('fr-FR')} {boutique.devise}</Text></View>
      </Pressable>)}
      {!visibles.length?<View style={s.vide}><Text style={s.videTitre}>Aucune commande</Text><Text style={s.videTexte}>Créez une commande client avec des modèles et variantes.</Text></View>:null}
    </ScrollView>
  </View>;
}

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:H.fond},entete:{flexDirection:'row',alignItems:'center',gap:espaces.m,padding:espaces.m,backgroundColor:H.surface,borderBottomWidth:1,borderBottomColor:H.bordure},
  titre:{fontSize:19,fontWeight:'900',color:H.texte},sous:{marginTop:2,fontSize:11,color:H.texteFaible},plus:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:H.primaire},
  recherche:{margin:espaces.m,marginBottom:8,minHeight:46,flexDirection:'row',alignItems:'center',gap:espaces.s,paddingHorizontal:espaces.m,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  input:{flex:1,fontSize:13,color:H.texte},filtres:{gap:7,paddingHorizontal:espaces.m,paddingBottom:espaces.m},filtre:{paddingVertical:8,paddingHorizontal:11,borderRadius:18,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  filtreActif:{backgroundColor:H.primaire,borderColor:H.primaire},filtreTexte:{fontSize:10,fontWeight:'800',color:H.texteFaible},filtreTexteActif:{color:'#fff'},
  liste:{paddingHorizontal:espaces.m,paddingBottom:espaces.xxl,gap:espaces.s},carte:{padding:espaces.m,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  carteHaut:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},numero:{fontSize:14,fontWeight:'900',color:H.texte},badge:{paddingVertical:4,paddingHorizontal:8,borderRadius:12,backgroundColor:H.primaireClair},
  badgePret:{backgroundColor:H.succesFond},badgeAnnule:{backgroundColor:H.dangerFond},badgeTexte:{fontSize:9,fontWeight:'900',color:H.texte},client:{marginTop:6,fontSize:11,color:H.texteFaible},
  progression:{marginTop:12},progressionFond:{height:6,borderRadius:3,overflow:'hidden',backgroundColor:H.fondSecondaire},progressionBarre:{height:6,backgroundColor:H.primaire},progressionTexte:{marginTop:4,fontSize:9,color:H.texteFaible},
  carteBas:{marginTop:10,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},sync:{fontSize:9,fontWeight:'700',color:H.texteEteint},total:{fontSize:13,fontWeight:'900',color:H.primaire},
  vide:{padding:40,alignItems:'center'},videTitre:{fontSize:16,fontWeight:'900',color:H.texte},videTexte:{marginTop:6,textAlign:'center',color:H.texteFaible}
});
