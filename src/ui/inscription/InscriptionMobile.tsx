import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { rechercherActivites, validerBoutique, fusionnerErreursBoutique, type DonneesBoutique } from '../../domain/inscription';
import { ActivitesInscription } from './Activites';
import { ActionCreation, ChampCreation, ChampsBoutiqueCreation, PanneauCreation, ProgressionCreation, s } from './Champs';
import { couleurs as C } from '../theme';

export interface CompteInscription {nom:string;login:string;motDePasse:string;confirmation:string}
export default function InscriptionMobile({boutique,onBoutique,compte,onCompte,surCreer,surRetour,surConnexion,actionsAccounts,enCours,erreur,erreurs={}}:{
  boutique:DonneesBoutique;onBoutique:(v:DonneesBoutique)=>void;compte:CompteInscription;onCompte:(v:CompteInscription)=>void;
  surCreer:()=>void;surRetour:()=>void;surConnexion:()=>void;actionsAccounts:ReactNode;enCours:boolean;erreur:string|null;erreurs?:Record<string,string>;
}) {
  const [etape,setEtape]=useState<1|2>(1);
  const [erreursBoutique,setErreursBoutique]=useState<Record<string,string>>({});
  const scroll=useRef<ScrollView>(null);
  const {width}=useWindowDimensions();
  useEffect(()=>{scroll.current?.scrollTo({y:0,animated:false});},[etape]);
  useEffect(()=>{const listener=BackHandler.addEventListener('hardwareBackPress',()=>{
    if(enCours)return true;
    if(etape===2)setEtape(1);else surRetour();return true;
  });return()=>listener.remove();},[etape,enCours,surRetour]);
  const modifierCompte=(champ:keyof CompteInscription,v:string)=>onCompte({...compte,[champ]:v});
  function suivant(){
    if(enCours)return;
    if(etape===1){if(boutique.secteur)setEtape(2);return;}
    const trouvees=validerBoutique(boutique);setErreursBoutique(trouvees);
    if(!Object.keys(trouvees).length)surCreer();
  }
  return <SafeAreaView style={s.page} edges={['top','bottom']}>
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS==='ios'?'padding':'height'}>
      <ScrollView ref={scroll} contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={s.entete}><Image source={require('../../../assets/logo.png')} style={s.logo} resizeMode="contain" accessible={false}/>
          <Pressable onPress={surConnexion} disabled={enCours} accessibilityRole="button" style={{minHeight:48,justifyContent:'center'}}><Text style={{color:C.inscriptionBleu,fontWeight:'600'}}>Se connecter</Text></Pressable></View>
        <View style={s.carte}><Text style={s.surtitre}>Création de votre boutique</Text><ProgressionCreation etape={etape}/>
          <Text style={s.titre} accessibilityRole="header">{etape===1?'Quel commerce créez-vous ?':'Finalisez la création de votre boutique'}</Text>
          <Text style={s.sousTitre}>{etape===1?'Choisissez votre activité pour adapter SahelPOS à votre boutique.':'L’essentiel pour démarrer. Les autres réglages pourront être modifiés plus tard.'}</Text>
          {erreur?<Text style={s.erreur} accessibilityRole="alert">{erreur}</Text>:null}
          {etape===1?<ActivitesInscription valeur={boutique.secteur} surChoisir={v=>onBoutique({...boutique,secteur:v})} disabled={enCours}/>:<View style={[s.panneaux,width>=900&&{flexDirection:'row'}]}>
            <View style={width>=900?{flex:1}:undefined}><ChampsBoutiqueCreation data={boutique} onChange={onBoutique} surActivite={()=>setEtape(1)} disabled={enCours} erreurs={fusionnerErreursBoutique(erreursBoutique,erreurs)}/></View>
            <View style={width>=900?{flex:1}:undefined}><PanneauCreation titre="Mon compte">
              {actionsAccounts}<Text style={s.separateur}>ou créer mon compte avec mes identifiants</Text>
              <ChampCreation label="Nom complet *" value={compte.nom} onChangeText={v=>modifierCompte('nom',v)} maxLength={120} autoComplete="name" editable={!enCours} erreur={erreurs.nomAdmin}/>
              <ChampCreation label="Identifiant de connexion *" value={compte.login} onChangeText={v=>modifierCompte('login',v)} maxLength={60} autoCapitalize="none" autoCorrect={false} editable={!enCours} erreur={erreurs.login}/>
              <ChampCreation label="Mot de passe *" value={compte.motDePasse} onChangeText={v=>modifierCompte('motDePasse',v)} secret placeholder="6 caractères minimum" autoComplete="new-password" editable={!enCours} erreur={erreurs.motDePasseWeb}/>
              <ChampCreation label="Confirmer le mot de passe *" value={compte.confirmation} onChangeText={v=>modifierCompte('confirmation',v)} secret autoComplete="new-password" editable={!enCours} erreur={erreurs.motDePasseWebConfirme}/>
              <Text style={s.aide}>Avec Google ou SahelDigital, aucun mot de passe local n’est nécessaire.</Text>
            </PanneauCreation></View>
          </View>}
        </View>
      </ScrollView>
      <View style={s.pied}><View style={s.piedInterieur}>
        {etape===2?<ActionCreation titre="Retour" secondaire disabled={enCours} onPress={()=>setEtape(1)}/>:<ActionCreation titre="Retour" secondaire disabled={enCours} onPress={surRetour}/>}
        <View style={{flex:1}}><ActionCreation titre={etape===1?'Continuer':'Créer ma boutique'} onPress={suivant} busy={enCours} disabled={!boutique.secteur}/></View>
      </View><Text style={[s.selection,{textAlign:'center',marginTop:8}]}>{etape===1?`Activité : ${rechercherActivites('').find(a=>a.code===boutique.secteur)?.titre??'à choisir'}`:'Étape 2 sur 2'}</Text></View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
