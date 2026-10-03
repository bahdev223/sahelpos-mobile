import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { obtenirProduit } from '../../src/db/repositories/produit';
import {
  libelleVariante,
  listerVariantesProduit,
  type VarianteMobile,
} from '../../src/db/repositories/variante';
import { calculerLigneAchat, type ArticleAchat } from '../../src/services/achat';
import type { Produit } from '../../src/domain/types';
import { Bouton, couleurs, espaces, formaterMontant, rayons } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { HABILLEMENT_MOBILE_THEME as H } from '../../src/profile-ui/habillement/theme';

interface Cellule {
  variante: VarianteMobile;
  quantite: string;
  prix: string;
}

export default function ApprovisionnementMatrice() {
  const router=useRouter();
  const { produit: produitParam }=useLocalSearchParams<{produit?:string}>();
  const [modele,setModele]=useState<Produit|null>(null);
  const [variantes,setVariantes]=useState<VarianteMobile[]>([]);
  const [cellules,setCellules]=useState<Record<number,Cellule>>({});
  const [modeles,setModeles]=useState<Produit[]>([]);

  const chargerModele=useCallback(async(id:number)=>{
    const p=await obtenirProduit(id);
    if(!p)return;
    const vars=await listerVariantesProduit(id);
    setModele(p);setVariantes(vars);
    const c:Record<number,Cellule>={};
    for(const v of vars)c[v.id]={variante:v,quantite:'0',prix:String(Math.round(v.prixAchat??p.prixAchat??0))};
    setCellules(c);
  },[]);

  useFocusEffect(useCallback(()=>{
    void (async()=>{
      const { obtenirBase }=await import('../../src/db/database');
      const db=await obtenirBase();
      const rows=await db.getAllAsync<{id:number}>(
        'SELECT id FROM produit WHERE actif = 1 AND EXISTS (SELECT 1 FROM variante_produit vp WHERE vp.produit_id = produit.id AND vp.actif = 1) ORDER BY nom'
      );
      const ps=(await Promise.all(rows.map(r=>obtenirProduit(r.id)))).filter((p):p is Produit=>!!p);
      setModeles(ps);
      const id=Number(produitParam);
      if(Number.isInteger(id)&&id>0)await chargerModele(id);
    })();
  },[chargerModele,produitParam]));

  const dimensions=useMemo(()=>{
    const codes=new Map<string,{code:string;nom:string;valeurs:string[]}>();
    for(const v of variantes)for(const val of v.valeurs){
      const d=codes.get(val.dimensionCode)??{code:val.dimensionCode,nom:val.dimensionNom,valeurs:[]};
      if(!d.valeurs.includes(val.nom))d.valeurs.push(val.nom);
      codes.set(val.dimensionCode,d);
    }
    return [...codes.values()];
  },[variantes]);

  const tailleDim=dimensions.find(d=>/TAILLE|SIZE|POINTURE/i.test(d.code))??dimensions[0];
  const couleurDim=dimensions.find(d=>/COULEUR|COLOR/i.test(d.code))??dimensions[1];
  const tailles=tailleDim?.valeurs??[];
  const couleurs=couleurDim?.valeurs??[];

  const trouver=(taille:string,couleur:string)=>{
    return variantes.find(v=>{
      const noms=v.valeurs.map(x=>x.nom);
      return noms.includes(taille)&&noms.includes(couleur);
    });
  };

  const articles=useMemo<ArticleAchat[]>(()=>{
    if(!modele)return[];
    const resultat:ArticleAchat[]=[];
    for(const c of Object.values(cellules)){
      const q=Number(c.quantite.replace(',','.'))||0;
      const p=Number(c.prix.replace(',','.'))||0;
      if(q<=0||p<=0)continue;
      resultat.push({
        produitId:modele.id,
        varianteId:c.variante.id,
        libelle:`${modele.nom} - ${libelleVariante(c.variante)}`,
        unite:modele.uniteBase,
        facteur:1,
        quantite:q,
        prixUnitaire:p,
      });
    }
    return resultat;
  },[cellules,modele]);

  const total=useMemo(()=>articles.reduce((s,a)=>s+calculerLigneAchat(a).total,0),[articles]);

  const continuer=()=>{
    if(!articles.length){Alert.alert('Aucune quantité','Saisissez au moins une quantité dans la matrice.');return;}
    router.push({
      pathname:'/achats/nouveau',
      params:{matrice:JSON.stringify(articles)},
    });
  };

  if(!modele){
    return <View style={s.page}>
      <View style={s.entete}>
        <Pressable onPress={()=>router.back()}><Icone nom="retour" taille={23} couleur={H.texte}/></Pressable>
        <View style={s.enteteTextes}><Text style={s.titre}>Approvisionnement matriciel</Text><Text style={s.sous}>Choisissez un modèle</Text></View>
      </View>
      <ScrollView contentContainerStyle={s.contenu}>
        {modeles.map(p=><Pressable key={p.id} style={s.modele} onPress={()=>void chargerModele(p.id)}>
          <View style={s.modeleIcone}><Icone nom="catalogue" taille={21} couleur={H.primaire}/></View>
          <View style={{flex:1}}><Text style={s.modeleNom}>{p.nom}</Text><Text style={s.modeleMeta}>{p.categorie||'Sans collection'}</Text></View>
          <Icone nom="chevron" taille={16} couleur={H.texteEteint}/>
        </Pressable>)}
      </ScrollView>
    </View>;
  }

  return <View style={s.page}>
    <View style={s.entete}>
      <Pressable onPress={()=>setModele(null)}><Icone nom="retour" taille={23} couleur={H.texte}/></Pressable>
      <View style={s.enteteTextes}><Text style={s.titre}>{modele.nom}</Text><Text style={s.sous}>Quantités par taille × couleur</Text></View>
    </View>
    <ScrollView contentContainerStyle={s.contenu} horizontal={false}>
      <View style={s.note}><Text style={s.noteTitre}>Saisie rapide</Text><Text style={s.noteTexte}>Remplissez uniquement les variantes reçues. Les cases à 0 seront ignorées.</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={s.ligneMatrice}>
            <View style={[s.cellule,s.celluleTitre]}><Text style={s.celluleTitreTexte}>Taille \ Couleur</Text></View>
            {couleurs.map(c=><View key={c} style={[s.cellule,s.enteteCellule]}><Text style={s.enteteCelluleTexte}>{c}</Text></View>)}
          </View>
          {tailles.map(t=><View key={t} style={s.ligneMatrice}>
            <View style={[s.cellule,s.celluleTaille]}><Text style={s.celluleTailleTexte}>{t}</Text></View>
            {couleurs.map(c=>{
              const v=trouver(t,c);if(!v)return <View key={c} style={[s.cellule,s.celluleIndispo]}><Text style={s.indispo}>—</Text></View>;
              const cell=cellules[v.id];
              return <View key={c} style={s.cellule}>
                <TextInput value={cell?.quantite??'0'} onChangeText={txt=>setCellules(cur=>({...cur,[v.id]:{...cur[v.id],quantite:txt}}))}
                  keyboardType="decimal-pad" selectTextOnFocus style={s.inputQ}/>
                <TextInput value={cell?.prix??''} onChangeText={txt=>setCellules(cur=>({...cur,[v.id]:{...cur[v.id],prix:txt}}))}
                  keyboardType="numeric" selectTextOnFocus style={s.inputP}/>
              </View>;
            })}
          </View>)}
        </View>
      </ScrollView>
      <View style={s.resume}><View><Text style={s.resumeLabel}>Variantes saisies</Text><Text style={s.resumeValeur}>{articles.length}</Text></View><View><Text style={s.resumeLabel}>Total</Text><Text style={s.resumeMontant}>{formaterMontant(total,'FCFA')}</Text></View></View>
    </ScrollView>
    <View style={s.pied}><Bouton titre="Continuer vers le fournisseur et le règlement" onPress={continuer} desactive={!articles.length} grand/></View>
  </View>;
}

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:H.fond},
  entete:{flexDirection:'row',alignItems:'center',gap:espaces.m,padding:espaces.m,backgroundColor:H.surface,borderBottomWidth:1,borderBottomColor:H.bordure},
  enteteTextes:{flex:1},titre:{fontSize:18,fontWeight:'900',color:H.texte},sous:{marginTop:2,fontSize:11,color:H.texteFaible},
  contenu:{padding:espaces.m,paddingBottom:120,gap:espaces.s},
  modele:{minHeight:62,flexDirection:'row',alignItems:'center',gap:espaces.m,padding:espaces.m,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  modeleIcone:{width:38,height:38,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:H.primaireClair},
  modeleNom:{fontSize:14,fontWeight:'900',color:H.texte},modeleMeta:{marginTop:2,fontSize:10,color:H.texteFaible},
  note:{padding:espaces.m,borderRadius:rayons.m,backgroundColor:H.primaireClair},noteTitre:{fontSize:13,fontWeight:'900',color:H.primaireFonce},noteTexte:{marginTop:4,fontSize:11,lineHeight:16,color:H.texteCorps},
  ligneMatrice:{flexDirection:'row'},cellule:{width:105,minHeight:76,padding:6,borderRightWidth:1,borderBottomWidth:1,borderColor:H.bordure,backgroundColor:H.surface,justifyContent:'center'},
  celluleTitre:{width:115,backgroundColor:H.fondSecondaire},celluleTitreTexte:{fontSize:10,fontWeight:'900',color:H.texte},
  enteteCellule:{backgroundColor:H.fondSecondaire},enteteCelluleTexte:{fontSize:10,fontWeight:'900',color:H.primaire,textAlign:'center'},
  celluleTaille:{width:115,backgroundColor:H.fondSecondaire},celluleTailleTexte:{fontSize:13,fontWeight:'900',color:H.texte,textAlign:'center'},
  celluleIndispo:{backgroundColor:H.fondSecondaire},indispo:{textAlign:'center',color:H.texteEteint},
  inputQ:{height:31,borderRadius:6,borderWidth:1,borderColor:H.primaireBordure,textAlign:'center',color:H.texte,fontWeight:'900',backgroundColor:H.fond},
  inputP:{height:27,marginTop:5,borderRadius:6,borderWidth:1,borderColor:H.bordure,textAlign:'center',fontSize:10,color:H.texteFaible,backgroundColor:'#fff'},
  resume:{flexDirection:'row',justifyContent:'space-between',padding:espaces.l,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  resumeLabel:{fontSize:10,color:H.texteFaible,fontWeight:'700'},resumeValeur:{marginTop:3,fontSize:22,fontWeight:'900',color:H.primaire},resumeMontant:{marginTop:3,fontSize:18,fontWeight:'900',color:H.texte},
  pied:{position:'absolute',left:0,right:0,bottom:0,padding:espaces.m,backgroundColor:H.surface,borderTopWidth:1,borderTopColor:H.bordure},
});
