import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  annulerCommandeClient,
  confirmerCommandeClient,
  marquerCommandePrete,
  obtenirCommandeClient,
  preparerCommandeClient,
  type CommandeClientDetail,
} from '../../../src/services/commande-client';
import { useSession } from '../../_layout';
import { HABILLEMENT_MOBILE_THEME as H } from '../../../src/profile-ui/habillement/theme';
import { Bouton, espaces, rayons } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';

const LABELS:Record<string,string>={
  BROUILLON:'Brouillon',CONFIRMEE:'Confirmée',EN_PREPARATION:'En préparation',
  PRETE:'Prête',TERMINEE:'Terminée',ANNULEE:'Annulée',
};

export default function DetailCommandeHabillement(){
  const router=useRouter();
  const{id}=useLocalSearchParams<{id:string}>();
  const{boutique,synchroniserMaintenant}=useSession();
  const[commande,setCommande]=useState<CommandeClientDetail|null>(null);
  const[enCours,setEnCours]=useState(false);

  const charger=useCallback(async()=>{
    const n=Number(id);if(!Number.isInteger(n))return;
    setCommande(await obtenirCommandeClient(n));
  },[id]);

  useFocusEffect(useCallback(()=>{void charger();},[charger]));

  const action=useCallback(async(fn:()=>Promise<void>,message:string)=>{
    if(!commande)return;setEnCours(true);
    try{await fn();await charger();Alert.alert('Commande mise à jour',message);}
    catch(e){Alert.alert('Impossible',e instanceof Error?e.message:String(e));}
    finally{setEnCours(false);}
  },[charger,commande]);

  const sync=useCallback(async()=>{
    setEnCours(true);try{await synchroniserMaintenant();await charger();}
    catch(e){Alert.alert('Synchronisation impossible',e instanceof Error?e.message:String(e));}
    finally{setEnCours(false);}
  },[charger,synchroniserMaintenant]);

  if(!commande)return <View style={s.page}><View style={s.vide}><Text style={s.videTexte}>Chargement...</Text></View></View>;

  const progression=commande.pieces>0?Math.min(100,(commande.preparees/commande.pieces)*100):0;
  return <View style={s.page}>
    <View style={s.entete}><Pressable onPress={()=>router.back()}><Icone nom="retour" taille={23} couleur={H.texte}/></Pressable>
      <View style={{flex:1}}><Text style={s.titre}>{commande.numero}</Text><Text style={s.sous}>{commande.clientNom||'Client de passage'}</Text></View>
      <View style={s.badge}><Text style={s.badgeTexte}>{LABELS[commande.statut]||commande.statut}</Text></View>
    </View>

    <ScrollView contentContainerStyle={s.contenu}>
      <View style={s.resume}>
        <View><Text style={s.resumeLabel}>Total</Text><Text style={s.resumeMontant}>{Math.round(commande.total).toLocaleString('fr-FR')} {boutique.devise}</Text></View>
        <View style={s.resumeDroite}><Text style={s.resumeLabel}>Synchronisation</Text><Text style={s.sync}>{commande.syncStatut==='SYNCED'?'Synchronisée':'En attente'}</Text></View>
      </View>

      <View style={s.progressionBloc}><View style={s.progressionEntete}><Text style={s.progressionTitre}>Préparation</Text><Text style={s.progressionPct}>{Math.round(progression)} %</Text></View>
        <View style={s.progressionFond}><View style={[s.progressionBarre,{width:progression+'%'}]}/></View>
        <Text style={s.progressionMeta}>{commande.preparees} / {commande.pieces} pièce(s) préparée(s)</Text></View>

      <Text style={s.section}>Articles</Text>
      <View style={s.liste}>
        {commande.lignes.map(l=><View key={l.id} style={s.ligne}>
          <View style={{flex:1}}><Text style={s.ligneNom}>{l.libelle}</Text>
            <Text style={s.ligneMeta}>Commandé {l.quantiteCommandee} · Réservé {l.quantiteReservee} · Préparé {l.quantitePreparee}</Text></View>
          <Text style={s.lignePrix}>{Math.round(l.total).toLocaleString('fr-FR')} {boutique.devise}</Text>
        </View>)}
      </View>

      {commande.note?<View style={s.note}><Text style={s.noteTitre}>Note</Text><Text style={s.noteTexte}>{commande.note}</Text></View>:null}

      <Text style={s.section}>Actions</Text>
      <View style={s.actions}>
        {commande.syncStatut!=='SYNCED'?<Bouton titre="Synchroniser d’abord" onPress={()=>void sync()} enCours={enCours} grand/>:null}
        {commande.statut==='BROUILLON'&&commande.serveurId?<Bouton titre="Confirmer et réserver le stock" onPress={()=>void action(()=>confirmerCommandeClient(commande.id),'Stock réservé selon les disponibilités.')} enCours={enCours} grand/>:null}
        {commande.statut==='CONFIRMEE'?<Bouton titre="Marquer la préparation complète" onPress={()=>void action(()=>preparerCommandeClient(commande.id),'Articles marqués préparés.')} enCours={enCours} grand/>:null}
        {commande.statut==='EN_PREPARATION'?<Bouton titre="Marquer la commande prête" onPress={()=>void action(()=>marquerCommandePrete(commande.id),'Commande prête pour le client.')} enCours={enCours} grand/>:null}
        {commande.statut==='PRETE'?<View style={s.pretInfo}><Icone nom="coche" taille={20} couleur={H.succes}/><View style={{flex:1}}><Text style={s.pretTitre}>Commande prête</Text><Text style={s.pretTexte}>La prochaine étape est l’encaissement et la conversion en vente.</Text></View></View>:null}
        {!['TERMINEE','ANNULEE'].includes(commande.statut)?<Bouton titre="Annuler la commande" variante="secondaire" onPress={()=>
          Alert.alert('Annuler la commande','La réservation sera libérée côté serveur.',[
            {text:'Retour',style:'cancel'},{text:'Annuler la commande',style:'destructive',onPress:()=>void action(()=>annulerCommandeClient(commande.id),'Commande annulée.')}
          ])} />:null}
      </View>
    </ScrollView>
  </View>;
}

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:H.fond},entete:{minHeight:62,flexDirection:'row',alignItems:'center',gap:espaces.m,padding:espaces.m,backgroundColor:H.surface,borderBottomWidth:1,borderBottomColor:H.bordure},
  titre:{fontSize:18,fontWeight:'900',color:H.texte},sous:{marginTop:2,fontSize:11,color:H.texteFaible},badge:{paddingVertical:5,paddingHorizontal:9,borderRadius:12,backgroundColor:H.primaireClair},badgeTexte:{fontSize:9,fontWeight:'900',color:H.primaire},
  contenu:{padding:espaces.m,paddingBottom:espaces.xxl},resume:{flexDirection:'row',justifyContent:'space-between',padding:16,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  resumeLabel:{fontSize:10,fontWeight:'700',color:H.texteFaible},resumeMontant:{marginTop:5,fontSize:20,fontWeight:'900',color:H.primaire},resumeDroite:{alignItems:'flex-end'},sync:{marginTop:5,fontSize:11,fontWeight:'900',color:H.texte},
  progressionBloc:{marginTop:10,padding:14,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},progressionEntete:{flexDirection:'row',justifyContent:'space-between'},progressionTitre:{fontSize:12,fontWeight:'900',color:H.texte},progressionPct:{fontSize:12,fontWeight:'900',color:H.primaire},
  progressionFond:{height:8,marginTop:9,borderRadius:4,overflow:'hidden',backgroundColor:H.fondSecondaire},progressionBarre:{height:8,backgroundColor:H.primaire},progressionMeta:{marginTop:5,fontSize:9,color:H.texteFaible},
  section:{marginTop:20,marginBottom:8,fontSize:14,fontWeight:'900',color:H.texte},liste:{borderRadius:rayons.m,overflow:'hidden',backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  ligne:{minHeight:66,flexDirection:'row',alignItems:'center',gap:9,padding:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:H.bordure},ligneNom:{fontSize:12,fontWeight:'900',color:H.texte},ligneMeta:{marginTop:3,fontSize:9,color:H.texteFaible},lignePrix:{fontSize:10,fontWeight:'900',color:H.texte},
  note:{marginTop:12,padding:13,borderRadius:rayons.m,backgroundColor:H.primaireClair},noteTitre:{fontSize:10,fontWeight:'900',color:H.primaire},noteTexte:{marginTop:4,fontSize:11,lineHeight:17,color:H.texteCorps},
  actions:{gap:9},pretInfo:{flexDirection:'row',alignItems:'center',gap:10,padding:14,borderRadius:rayons.m,backgroundColor:H.succesFond},pretTitre:{fontSize:12,fontWeight:'900',color:H.texte},pretTexte:{marginTop:3,fontSize:10,lineHeight:15,color:H.texteFaible},
  vide:{flex:1,alignItems:'center',justifyContent:'center'},videTexte:{color:H.texteFaible}
});
