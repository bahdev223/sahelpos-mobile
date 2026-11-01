import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { DEVISES_INSCRIPTION, rechercherActivites, type DonneesBoutique } from '../../domain/inscription';
import { MODES_VENTE, MODES_APPROVISIONNEMENT } from '../../domain/commerce';
import { Icone } from '../icones';
import { couleurs as C } from '../theme';
import { ILLUSTRATIONS_ACTIVITES } from './Activites';

export function ProgressionCreation({etape}:{etape:1|2}) {
  return <View style={s.etapes} accessibilityLabel={`Étape ${etape} sur 2`}>
    <View style={s.etape}><View style={[s.numero,etape===2?s.terminee:s.actif]}>{etape===2?<Icone nom="coche" taille={13} couleur={C.texteInverse}/>:<Text style={s.numeroTexte}>1</Text>}</View><Text style={s.etapeTexte}>Choisir l’activité</Text></View>
    <View style={s.trait}/>
    <View style={s.etape}><View style={[s.numero,etape===2&&s.actif]}><Text style={[s.numeroTexte,etape===1&&{color:C.texteFaible}]}>2</Text></View><Text style={s.etapeTexte}>Boutique et compte</Text></View>
  </View>;
}
export function ActionCreation({titre,onPress,secondaire=false,busy=false,disabled=false}:{
  titre:string; onPress:()=>void; secondaire?:boolean; busy?:boolean; disabled?:boolean;
}) {
  return <Pressable onPress={onPress} disabled={disabled||busy} accessibilityRole="button"
    accessibilityState={{disabled:disabled||busy,busy}} style={[s.bouton,secondaire&&s.secondaire,(disabled||busy)&&{opacity:.55}]}>
    {busy?<ActivityIndicator color={C.texteInverse}/>:<Text style={[s.boutonTexte,secondaire&&{color:C.inscriptionEncre}]}>{titre}</Text>}
  </Pressable>;
}
export function ChampCreation({label,erreur,secret=false,...props}:TextInputProps&{label:string;erreur?:string;secret?:boolean}) {
  const [visible,setVisible]=useState(false);
  return <View style={s.champ}>
    <Text style={s.label}>{label}</Text>
    <View><TextInput {...props} accessibilityLabel={label} secureTextEntry={secret&&!visible}
      placeholderTextColor={C.texteFaible} style={[s.input,secret&&{paddingRight:50},erreur&&{borderColor:C.danger}]}/>
      {secret?<Pressable accessibilityRole="button" accessibilityLabel={visible?'Masquer le mot de passe':'Afficher le mot de passe'}
        style={s.oeil} disabled={props.editable===false} onPress={()=>setVisible(!visible)}>
        <Icone nom={visible?'oeilFerme':'oeil'} taille={20} couleur={C.texteFaible}/>
      </Pressable>:null}
    </View>
    {erreur?<Text style={s.erreur} accessibilityLiveRegion="polite">{erreur}</Text>:null}
  </View>;
}
export function ChoixCreation<T extends string>({label,valeur,choix,onChange,disabled=false}:{
  label:string; valeur:T; choix:ReadonlyArray<{code:T;titre:string}>; onChange:(v:T)=>void; disabled?:boolean;
}) {
  return <View style={s.champ}><Text style={s.label}>{label}</Text>
    <View style={s.choix} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {choix.map(c=><Pressable key={c.code} onPress={()=>onChange(c.code)} disabled={disabled}
        accessibilityRole="radio" accessibilityLabel={c.titre} accessibilityState={{checked:c.code===valeur,disabled}}
        style={[s.option,c.code===valeur&&s.optionActive]}><Text style={[s.optionTexte,c.code===valeur&&{color:C.inscriptionBleu}]}>{c.titre}</Text></Pressable>)}
    </View>
  </View>;
}
export function PanneauCreation({titre,children,action}:{titre:string;children:ReactNode;action?:ReactNode}) {
  return <View style={s.panneau}><View style={s.panneauEntete}><Text style={s.panneauTitre} accessibilityRole="header">{titre}</Text>{action}</View>{children}</View>;
}
export function ChampsBoutiqueCreation({data,onChange,surActivite,disabled=false,erreurs={}}:{
  data:DonneesBoutique; onChange:(data:DonneesBoutique)=>void; surActivite:()=>void;disabled?:boolean;erreurs?:Record<string,string>;
}) {
  const modifier=(champ:keyof DonneesBoutique,v:string)=>onChange({...data,[champ]:v});
  const activite=rechercherActivites('').find(a=>a.code===data.secteur);
  return <PanneauCreation titre="Ma boutique" action={
    <Pressable onPress={surActivite} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Modifier l’activité : ${activite?.titre}`}
      style={s.profil}>{data.secteur?<Image source={ILLUSTRATIONS_ACTIVITES[data.secteur]} style={s.miniImage} resizeMode="contain" accessible={false}/>:null}<Text style={s.profilTexte}>{activite?.titre} · Modifier</Text></Pressable>}>
    <ChampCreation label="Nom de la boutique *" value={data.nom_boutique} onChangeText={v=>modifier('nom_boutique',v)}
      placeholder="Ex. : Mode Plus" maxLength={150} editable={!disabled} erreur={erreurs.nom_boutique}/>
    <ChampCreation label="Téléphone professionnel" value={data.telephone} onChangeText={v=>modifier('telephone',v)}
      placeholder="+223 76 12 34 56" keyboardType="phone-pad" maxLength={30} editable={!disabled} erreur={erreurs.telephone}/>
    <ChampCreation label="Ville" value={data.ville} onChangeText={v=>modifier('ville',v)} placeholder="Bamako" maxLength={80} editable={!disabled} erreur={erreurs.ville}/>
    <ChoixCreation label="Devise" valeur={data.devise} choix={DEVISES_INSCRIPTION} onChange={v=>modifier('devise',v)} disabled={disabled}/>
    {erreurs.devise?<Text style={s.erreur}>{erreurs.devise}</Text>:null}
    <ChoixCreation label="Comment vendez-vous ?" valeur={data.mode_vente} choix={MODES_VENTE.map(m=>({...m,titre:m.code==='DETAIL'?'Détail':m.code==='MIXTE'?'Les deux':m.titre}))}
      onChange={v=>modifier('mode_vente',v)} disabled={disabled}/>
    <ChoixCreation label="Approvisionnement" valeur={data.mode_approvisionnement} choix={MODES_APPROVISIONNEMENT}
      onChange={v=>modifier('mode_approvisionnement',v)} disabled={disabled}/>
    <Text style={s.aide}>Ces choix pourront être modifiés plus tard.</Text>
  </PanneauCreation>;
}
export const s=StyleSheet.create({
  page:{flex:1,backgroundColor:C.inscriptionFond},contenu:{padding:16,paddingBottom:24,width:'100%',maxWidth:1120,alignSelf:'center'},
  entete:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:20,gap:12},logo:{width:108,height:36},
  carte:{borderRadius:20,borderWidth:1,borderColor:C.inscriptionBordure,backgroundColor:C.surface,padding:16},
  surtitre:{fontSize:10,fontWeight:'700',letterSpacing:1,color:C.texteFaible,textTransform:'uppercase',marginBottom:14},
  titre:{fontSize:26,fontWeight:'800',color:C.inscriptionEncre,lineHeight:32,marginVertical:14},
  sousTitre:{fontSize:14,lineHeight:21,color:C.texteFaible,marginBottom:16},
  etapes:{flexDirection:'row',alignItems:'center',gap:8,paddingBottom:16,borderBottomWidth:1,borderBottomColor:C.inscriptionBordure},
  etape:{flexDirection:'row',alignItems:'center',gap:5,flexShrink:1},etapeTexte:{fontSize:11,fontWeight:'600',color:C.inscriptionEncre,flexShrink:1},
  numero:{width:24,height:24,borderRadius:12,backgroundColor:C.surfaceDouce,alignItems:'center',justifyContent:'center'},
  actif:{backgroundColor:C.inscriptionBleu},terminee:{backgroundColor:C.succesFonce},numeroTexte:{fontSize:12,fontWeight:'700',color:C.texteInverse},
  trait:{height:1,backgroundColor:C.inscriptionBordure,flex:1,minWidth:8},
  panneaux:{gap:14},panneau:{borderWidth:1,borderColor:C.inscriptionBordure,borderRadius:16,padding:14,backgroundColor:C.surface},
  panneauEntete:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap',marginBottom:16},
  panneauTitre:{fontSize:19,fontWeight:'700',color:C.inscriptionEncre},
  champ:{marginBottom:14},label:{fontSize:13,fontWeight:'600',color:C.inscriptionEncre,marginBottom:6},
  input:{minHeight:48,borderWidth:1,borderColor:C.inscriptionBordure,borderRadius:11,paddingHorizontal:12,paddingVertical:10,fontSize:16,color:C.inscriptionEncre,backgroundColor:C.inscriptionFond},
  oeil:{position:'absolute',right:0,top:0,bottom:0,width:48,alignItems:'center',justifyContent:'center'},
  erreur:{fontSize:13,color:C.danger,marginTop:5},aide:{fontSize:12,lineHeight:19,color:C.texteFaible},
  choix:{flexDirection:'row',flexWrap:'wrap',gap:7},option:{minHeight:48,minWidth:60,paddingHorizontal:12,paddingVertical:12,borderRadius:10,borderWidth:1,borderColor:C.inscriptionBordure,justifyContent:'center',alignItems:'center'},
  optionActive:{borderColor:C.inscriptionBleu,backgroundColor:C.primaireDouce},optionTexte:{fontSize:13,fontWeight:'600',color:C.inscriptionEncre},
  profil:{minHeight:48,flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:8,borderRadius:10,backgroundColor:C.inscriptionFond,flexShrink:1},
  miniImage:{width:24,height:24},profilTexte:{fontSize:12,color:C.inscriptionBleu,flexShrink:1},
  bouton:{minHeight:48,paddingHorizontal:18,paddingVertical:12,borderRadius:12,backgroundColor:C.inscriptionBleu,alignItems:'center',justifyContent:'center'},
  secondaire:{backgroundColor:C.surface,borderWidth:1,borderColor:C.inscriptionBordure},boutonTexte:{fontSize:15,fontWeight:'700',color:C.texteInverse,textAlign:'center'},
  pied:{padding:12,borderTopWidth:1,borderTopColor:C.inscriptionBordure,backgroundColor:C.surface},piedInterieur:{flexDirection:'row',gap:12,alignItems:'center',maxWidth:1088,width:'100%',alignSelf:'center'},
  selection:{fontSize:12,color:C.texteFaible},separateur:{fontSize:12,color:C.texteFaible,textAlign:'center',marginVertical:14},
});
