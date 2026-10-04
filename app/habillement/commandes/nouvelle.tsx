import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { listerProduits } from '../../../src/db/repositories/produit';
import { listerClients } from '../../../src/db/repositories/client';
import { listerVariantesProduit, libelleVariante, type VarianteMobile } from '../../../src/db/repositories/variante';
import type { Client, Produit } from '../../../src/domain/types';
import { creerCommandeClient, type ArticleCommandeClient } from '../../../src/services/commande-client';
import { useSession } from '../../_layout';
import { HABILLEMENT_MOBILE_THEME as H } from '../../../src/profile-ui/habillement/theme';
import { Bouton, espaces, rayons } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';

export default function NouvelleCommandeHabillement(){
  const router=useRouter();
  const {boutique}=useSession();
  const[articles,setArticles]=useState<ArticleCommandeClient[]>([]);
  const[clients,setClients]=useState<Client[]>([]);
  const[client,setClient]=useState<Client|null>(null);
  const[note,setNote]=useState('');
  const[selectClient,setSelectClient]=useState(false);
  const[ajout,setAjout]=useState(false);
  const[enCours,setEnCours]=useState(false);

  useFocusEffect(useCallback(()=>{void listerClients().then(setClients);},[]));

  const total=useMemo(()=>articles.reduce((s,a)=>s+Math.round(a.quantite*a.prixUnitaire),0),[articles]);

  const enregistrer=useCallback(async()=>{
    if(!articles.length){Alert.alert('Commande vide','Ajoutez au moins un article.');return;}
    setEnCours(true);
    try{
      const id=await creerCommandeClient(articles,{clientId:client?.id??null,note});
      router.replace({pathname:'/habillement/commandes/[id]',params:{id:String(id)}});
    }catch(e){Alert.alert('Impossible',e instanceof Error?e.message:String(e));}
    finally{setEnCours(false);}
  },[articles,client,note,router]);

  return <View style={s.page}>
    <View style={s.entete}><Pressable onPress={()=>router.back()}><Icone nom="retour" taille={23} couleur={H.texte}/></Pressable>
      <View style={{flex:1}}><Text style={s.titre}>Nouvelle commande</Text><Text style={s.sous}>Commande client Habillement</Text></View></View>

    <ScrollView contentContainerStyle={s.contenu}>
      <Text style={s.label}>Client</Text>
      <Pressable style={s.selecteur} onPress={()=>setSelectClient(true)}>
        <Icone nom="clients" taille={19} couleur={H.primaire}/>
        <Text style={s.selecteurTexte}>{client?.nom||'Client de passage'}</Text>
        <Icone nom="chevron" taille={15} couleur={H.texteFaible}/>
      </Pressable>

      <View style={s.sectionEntete}><Text style={s.sectionTitre}>Articles ({articles.length})</Text>
        <Pressable style={s.ajouter} onPress={()=>setAjout(true)}><Icone nom="plus" taille={18} couleur="#fff"/><Text style={s.ajouterTexte}>Ajouter</Text></Pressable></View>

      {articles.map((a,i)=><View key={i} style={s.article}>
        <View style={{flex:1}}><Text style={s.articleNom}>{a.variante?`${a.produit.nom} · ${libelleVariante(a.variante)}`:a.produit.nom}</Text>
          <Text style={s.articleMeta}>{a.quantite} × {Math.round(a.prixUnitaire).toLocaleString('fr-FR')} {boutique.devise}</Text></View>
        <Text style={s.articleTotal}>{Math.round(a.quantite*a.prixUnitaire).toLocaleString('fr-FR')} {boutique.devise}</Text>
        <Pressable onPress={()=>setArticles(cur=>cur.filter((_,idx)=>idx!==i))}><Icone nom="corbeille" taille={18} couleur={H.danger}/></Pressable>
      </View>)}
      {!articles.length?<View style={s.vide}><Text style={s.videTexte}>Ajoutez les modèles, tailles et couleurs commandés par le client.</Text></View>:null}

      <Text style={s.label}>Note</Text>
      <TextInput value={note} onChangeText={setNote} multiline placeholder="Ex. préparer avant vendredi..."
        placeholderTextColor={H.texteFaible} style={s.note}/>

      <View style={s.resume}><Text style={s.resumeLabel}>Total commande</Text><Text style={s.resumeValeur}>{total.toLocaleString('fr-FR')} {boutique.devise}</Text></View>
    </ScrollView>

    <View style={s.pied}><Bouton titre="Enregistrer la commande" onPress={()=>void enregistrer()} desactive={!articles.length} enCours={enCours} grand/></View>

    <Modal visible={selectClient} animationType="slide" onRequestClose={()=>setSelectClient(false)}>
      <SafeAreaView style={s.page}><View style={s.entete}><Pressable onPress={()=>setSelectClient(false)}><Icone nom="retour" taille={23} couleur={H.texte}/></Pressable><Text style={s.titre}>Choisir le client</Text></View>
        <ScrollView contentContainerStyle={s.contenu}>
          <Pressable style={s.clientLigne} onPress={()=>{setClient(null);setSelectClient(false);}}><Text style={s.clientNom}>Client de passage</Text></Pressable>
          {clients.map(c=><Pressable key={c.id} style={s.clientLigne} onPress={()=>{setClient(c);setSelectClient(false);}}>
            <View style={{flex:1}}><Text style={s.clientNom}>{c.nom}</Text><Text style={s.clientMeta}>{c.telephone||'Sans téléphone'}</Text></View><Icone nom="chevron" taille={15} couleur={H.texteFaible}/>
          </Pressable>)}
        </ScrollView>
      </SafeAreaView>
    </Modal>

    <AjoutArticleCommande visible={ajout} onFermer={()=>setAjout(false)}
      onAjouter={(article)=>{setArticles(cur=>[...cur,article]);setAjout(false);}}/>
  </View>;
}

function AjoutArticleCommande({visible,onFermer,onAjouter}:{visible:boolean;onFermer:()=>void;onAjouter:(a:ArticleCommandeClient)=>void}){
  const[produits,setProduits]=useState<Produit[]>([]);
  const[recherche,setRecherche]=useState('');
  const[produit,setProduit]=useState<Produit|null>(null);
  const[variantes,setVariantes]=useState<VarianteMobile[]>([]);
  const[variante,setVariante]=useState<VarianteMobile|null>(null);
  const[quantite,setQuantite]=useState('1');
  const[prix,setPrix]=useState('');

  useFocusEffect(useCallback(()=>{
    if(!visible)return;
    void listerProduits({recherche}).then(setProduits);
  },[visible,recherche]));

  const choisirProduit=useCallback(async(p:Produit)=>{
    setProduit(p);const vs=await listerVariantesProduit(p.id);setVariantes(vs);setVariante(null);
    setPrix(String(Math.round(p.prixUnitaire)));
  },[]);

  const ajouter=()=>{
    if(!produit)return;
    const q=Number(quantite.replace(',','.'))||0;const p=Number(prix.replace(',','.'))||0;
    if(q<=0||p<0){Alert.alert('Saisie invalide','Vérifiez quantité et prix.');return;}
    if(variantes.length&&!variante){Alert.alert('Variante requise','Choisissez la taille/couleur.');return;}
    onAjouter({produit,variante,quantite:q,prixUnitaire:p});
    setProduit(null);setVariantes([]);setVariante(null);setRecherche('');setQuantite('1');setPrix('');
  };

  return <Modal visible={visible} animationType="slide" onRequestClose={onFermer}><SafeAreaView style={s.page}>
    <View style={s.entete}><Pressable onPress={onFermer}><Icone nom="retour" taille={23} couleur={H.texte}/></Pressable><Text style={s.titre}>Ajouter un article</Text></View>
    <ScrollView contentContainerStyle={s.contenu}>
      {!produit?<><View style={s.recherche}><Icone nom="recherche" taille={18} couleur={H.texteFaible}/><TextInput value={recherche} onChangeText={setRecherche} placeholder="Rechercher un modèle" placeholderTextColor={H.texteFaible} style={s.rechercheInput}/></View>
        {produits.map(p=><Pressable key={p.id} style={s.modeleLigne} onPress={()=>void choisirProduit(p)}><View style={{flex:1}}><Text style={s.clientNom}>{p.nom}</Text><Text style={s.clientMeta}>{p.categorie||'Sans collection'}</Text></View><Icone nom="chevron" taille={15} couleur={H.texteFaible}/></Pressable>)}</>:
      <><View style={s.modeleChoisi}><Text style={s.articleNom}>{produit.nom}</Text><Pressable onPress={()=>{setProduit(null);setVariantes([]);}}><Text style={s.changer}>Changer</Text></Pressable></View>
        {variantes.length?<><Text style={s.label}>Taille / couleur</Text><View style={s.options}>{variantes.map(v=>{
          const actif=variante?.id===v.id;return <Pressable key={v.idLocal} style={[s.option,actif&&s.optionActif]} onPress={()=>{setVariante(v);setPrix(String(Math.round(v.prixOverride??produit.prixUnitaire)));}}>
            <Text style={[s.optionNom,actif&&s.optionNomActif]}>{libelleVariante(v)}</Text><Text style={[s.optionStock,actif&&s.optionNomActif]}>Stock {v.stockActuel}</Text></Pressable>;
        })}</View></>:null}
        <Text style={s.label}>Quantité</Text><TextInput value={quantite} onChangeText={setQuantite} keyboardType="decimal-pad" style={s.champ}/>
        <Text style={s.label}>Prix unitaire</Text><TextInput value={prix} onChangeText={setPrix} keyboardType="numeric" style={s.champ}/>
        <Bouton titre="Ajouter à la commande" onPress={ajouter} grand/></>}
    </ScrollView>
  </SafeAreaView></Modal>;
}

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:H.fond},entete:{minHeight:60,flexDirection:'row',alignItems:'center',gap:espaces.m,padding:espaces.m,backgroundColor:H.surface,borderBottomWidth:1,borderBottomColor:H.bordure},
  titre:{fontSize:19,fontWeight:'900',color:H.texte},sous:{marginTop:2,fontSize:11,color:H.texteFaible},contenu:{padding:espaces.m,paddingBottom:120},
  label:{marginTop:16,marginBottom:7,fontSize:12,fontWeight:'900',color:H.texte},selecteur:{minHeight:52,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  selecteurTexte:{flex:1,fontSize:13,fontWeight:'800',color:H.texte},sectionEntete:{marginTop:22,marginBottom:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  sectionTitre:{fontSize:15,fontWeight:'900',color:H.texte},ajouter:{minHeight:38,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:11,borderRadius:10,backgroundColor:H.primaire},ajouterTexte:{color:'#fff',fontSize:11,fontWeight:'900'},
  article:{minHeight:70,flexDirection:'row',alignItems:'center',gap:9,padding:11,marginBottom:7,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  articleNom:{fontSize:12,fontWeight:'900',color:H.texte},articleMeta:{marginTop:3,fontSize:10,color:H.texteFaible},articleTotal:{fontSize:11,fontWeight:'900',color:H.primaire},
  vide:{padding:25,borderRadius:rayons.m,borderWidth:1,borderStyle:'dashed',borderColor:H.bordure,alignItems:'center'},videTexte:{textAlign:'center',color:H.texteFaible,fontSize:11},
  note:{minHeight:88,padding:12,textAlignVertical:'top',borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure,color:H.texte},
  resume:{marginTop:18,padding:16,borderRadius:rayons.m,backgroundColor:H.primaireClair,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},resumeLabel:{fontSize:11,fontWeight:'700',color:H.texteFaible},resumeValeur:{fontSize:18,fontWeight:'900',color:H.primaire},
  pied:{position:'absolute',left:0,right:0,bottom:0,padding:espaces.m,backgroundColor:H.surface,borderTopWidth:1,borderTopColor:H.bordure},
  clientLigne:{minHeight:58,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:H.bordure,backgroundColor:H.surface},
  clientNom:{fontSize:13,fontWeight:'900',color:H.texte},clientMeta:{marginTop:2,fontSize:10,color:H.texteFaible},recherche:{minHeight:46,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,marginBottom:10,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  rechercheInput:{flex:1,color:H.texte},modeleLigne:{minHeight:58,flexDirection:'row',alignItems:'center',paddingHorizontal:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:H.bordure,backgroundColor:H.surface},
  modeleChoisi:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:14,borderRadius:rayons.m,backgroundColor:H.primaireClair},changer:{fontSize:11,fontWeight:'900',color:H.primaire},
  options:{flexDirection:'row',flexWrap:'wrap',gap:7},option:{minWidth:'46%',flexGrow:1,padding:10,borderRadius:10,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},optionActif:{backgroundColor:H.primaire,borderColor:H.primaire},
  optionNom:{fontSize:11,fontWeight:'900',color:H.texte},optionNomActif:{color:'#fff'},optionStock:{marginTop:3,fontSize:9,color:H.texteFaible},champ:{minHeight:48,paddingHorizontal:12,marginBottom:10,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure,color:H.texte}
});
