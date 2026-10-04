import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { obtenirBase } from '../../db/database';
import { useSession } from '../../../app/_layout';
import { BandeauEtat, espaces, rayons } from '../../ui/components';
import { BoutonMenu } from '../../ui/tiroir';
import { Icone } from '../../ui/icones';
import { HABILLEMENT_MOBILE_THEME as H } from './theme';

interface Donnees {
  ca: number;
  nbVentes: number;
  nbModeles: number;
  nbVariantes: number;
  stockTotal: number;
  ruptures: number;
  dernieres: Array<{
    id: number;
    numero: string;
    total: number;
    date_vente: string;
  }>;
}

async function chargerDashboard(): Promise<Donnees> {
  const db=await obtenirBase();
  const jour=new Date();
  const debut=new Date(jour.getFullYear(),jour.getMonth(),jour.getDate()).toISOString();
  const fin=new Date(jour.getFullYear(),jour.getMonth(),jour.getDate()+1).toISOString();
  const ventes=await db.getFirstAsync<{ca:number;nb:number}>(
    `SELECT COALESCE(SUM(total),0) AS ca, COUNT(*) AS nb
       FROM vente
      WHERE date_vente >= ? AND date_vente < ? AND statut <> 'annulee'`,
    debut,fin,
  );
  const modeles=await db.getFirstAsync<{n:number}>(
    'SELECT COUNT(*) AS n FROM produit WHERE actif = 1',
  );
  const variantes=await db.getFirstAsync<{n:number;stock:number;ruptures:number}>(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(stock_actuel),0) AS stock,
            COALESCE(SUM(CASE WHEN stock_actuel <= 0 THEN 1 ELSE 0 END),0) AS ruptures
       FROM variante_produit
      WHERE actif = 1`,
  );
  const dernieres=await db.getAllAsync<{
    id:number;numero:string;total:number;date_vente:string;
  }>(
    `SELECT id, numero, total, date_vente
       FROM vente
      WHERE statut <> 'annulee'
      ORDER BY date_vente DESC, id DESC
      LIMIT 5`,
  );
  return {
    ca:ventes?.ca??0,
    nbVentes:ventes?.nb??0,
    nbModeles:modeles?.n??0,
    nbVariantes:variantes?.n??0,
    stockTotal:variantes?.stock??0,
    ruptures:variantes?.ruptures??0,
    dernieres,
  };
}

function montant(v:number, devise:string):string {
  return `${Math.round(v).toLocaleString('fr-FR')} ${devise}`;
}

export function AccueilHabillement() {
  const router=useRouter();
  const {boutique,utilisateur,revisionSynchronisation}=useSession();
  const [d,setD]=useState<Donnees>({
    ca:0,nbVentes:0,nbModeles:0,nbVariantes:0,stockTotal:0,ruptures:0,dernieres:[],
  });

  useFocusEffect(useCallback(()=>{void chargerDashboard().then(setD);},[revisionSynchronisation]));

  return (
    <View style={s.page}>
      <BandeauEtat fond={H.primaire}/>
      <View style={s.entete}>
        <BoutonMenu couleur="#FFFFFF"/>
        <View style={s.enteteTextes}>
          <Text style={s.marque}>SahelPOS · Mode</Text>
          <Text style={s.boutique}>{boutique.nom}</Text>
        </View>
        <Pressable onPress={()=>router.push('/notifications')} style={s.cloche}>
          <Icone nom="cloche" taille={21} couleur="#FFFFFF"/>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.contenu}>
        <View style={s.bienvenue}>
          <Text style={s.salut}>Bonjour {utilisateur?.nom||utilisateur?.login||''}</Text>
          <Text style={s.sousSalut}>Prêt-à-porter · tailles · couleurs · variantes</Text>
        </View>

        <View style={s.caCarte}>
          <View>
            <Text style={s.caLabel}>Chiffre d’affaires aujourd’hui</Text>
            <Text style={s.ca}>{montant(d.ca,boutique.devise)}</Text>
            <Text style={s.caSous}>{d.nbVentes} vente{d.nbVentes>1?'s':''}</Text>
          </View>
          <View style={s.caIcone}>
            <Icone nom="graphique" taille={26} couleur={H.primaire}/>
          </View>
        </View>

        <View style={s.grille}>
          <Kpi titre="Modèles" valeur={String(d.nbModeles)} icone="catalogue"
            onPress={()=>router.push('/(tabs)/catalogue')}/>
          <Kpi titre="Variantes" valeur={String(d.nbVariantes)} icone="etiquette"
            onPress={()=>router.push('/habillement/referentiel')}/>
          <Kpi titre="Stock pièces" valeur={String(d.stockTotal)} icone="stock"
            onPress={()=>router.push('/(tabs)/stock')}/>
          <Kpi titre="Ruptures" valeur={String(d.ruptures)} icone="alerte"
            danger={d.ruptures>0} onPress={()=>router.push('/(tabs)/stock')}/>
        </View>

        <Text style={s.sectionTitre}>Actions rapides</Text>
        <View style={s.actions}>
          <Action titre="Nouvelle vente" icone="caisse"
            onPress={()=>router.push('/(tabs)/caisse')}/>
          <Action titre="Nouveau modèle" icone="plus"
            onPress={()=>router.push('/habillement/modele/nouveau')}/>
          <Action titre="Approvisionnement" icone="achats"
            onPress={()=>router.push('/achats/nouveau')}/>
          <Action titre="Inventaire" icone="inventaire"
            onPress={()=>router.push('/habillement/inventaire')}/>
          <Action titre="Échanges" icone="mouvements"
            onPress={()=>router.push('/habillement/echanges')}/>
        </View>

        <View style={s.sectionEntete}>
          <Text style={s.sectionTitre}>Ventes récentes</Text>
          <Pressable onPress={()=>router.push('/ventes')}>
            <Text style={s.lien}>Voir tout</Text>
          </Pressable>
        </View>
        <View style={s.liste}>
          {d.dernieres.map((v)=>(
            <Pressable key={v.id} style={s.vente}
              onPress={()=>router.push({pathname:'/vente/[id]',params:{id:String(v.id)}})}>
              <View style={s.ticketIcone}>
                <Icone nom="ventes" taille={18} couleur={H.primaire}/>
              </View>
              <View style={s.venteTextes}>
                <Text style={s.venteNumero}>{v.numero}</Text>
                <Text style={s.venteDate}>{new Date(v.date_vente).toLocaleString('fr-FR')}</Text>
              </View>
              <Text style={s.venteMontant}>{montant(v.total,boutique.devise)}</Text>
            </Pressable>
          ))}
          {d.dernieres.length===0?<Text style={s.vide}>Aucune vente pour le moment.</Text>:null}
        </View>
      </ScrollView>
    </View>
  );
}

function Kpi({titre,valeur,icone,onPress,danger=false}:{
  titre:string;valeur:string;icone:Parameters<typeof Icone>[0]['nom'];
  onPress:()=>void;danger?:boolean;
}) {
  return (
    <Pressable style={s.kpi} onPress={onPress}>
      <View style={[s.kpiIcone,danger&&s.kpiIconeDanger]}>
        <Icone nom={icone} taille={20} couleur={danger?H.danger:H.primaire}/>
      </View>
      <Text style={s.kpiTitre}>{titre}</Text>
      <Text style={[s.kpiValeur,danger&&{color:H.danger}]}>{valeur}</Text>
    </Pressable>
  );
}

function Action({titre,icone,onPress}:{
  titre:string;icone:Parameters<typeof Icone>[0]['nom'];onPress:()=>void;
}) {
  return (
    <Pressable style={s.action} onPress={onPress}>
      <View style={s.actionIcone}><Icone nom={icone} taille={20} couleur={H.primaire}/></View>
      <Text style={s.actionTexte}>{titre}</Text>
      <Icone nom="chevron" taille={14} couleur={H.texteEteint}/>
    </Pressable>
  );
}

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:H.fond},
  entete:{flexDirection:'row',alignItems:'center',gap:espaces.s,paddingHorizontal:16,paddingVertical:10,backgroundColor:H.primaire},
  enteteTextes:{flex:1},
  marque:{color:'#fff',fontSize:17,fontWeight:'900'},
  boutique:{marginTop:1,color:'#F5ECE5',fontSize:11},
  cloche:{padding:7},
  contenu:{padding:16,paddingBottom:80},
  bienvenue:{padding:16,borderRadius:rayons.l,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  salut:{fontSize:18,fontWeight:'900',color:H.texte},
  sousSalut:{marginTop:4,fontSize:12,color:H.texteFaible},
  caCarte:{marginTop:12,minHeight:112,flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:17,borderRadius:rayons.l,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  caLabel:{fontSize:12,fontWeight:'700',color:H.texteFaible},
  ca:{marginTop:7,fontSize:25,fontWeight:'900',color:H.primaire},
  caSous:{marginTop:3,fontSize:11,color:H.texteFaible},
  caIcone:{width:50,height:50,borderRadius:15,backgroundColor:H.primaireClair,alignItems:'center',justifyContent:'center'},
  grille:{marginTop:10,flexDirection:'row',flexWrap:'wrap',gap:10},
  kpi:{width:'47%',flexGrow:1,minHeight:108,padding:13,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  kpiIcone:{width:35,height:35,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:H.primaireClair},
  kpiIconeDanger:{backgroundColor:H.dangerFond},
  kpiTitre:{marginTop:9,fontSize:11,fontWeight:'700',color:H.texteFaible},
  kpiValeur:{marginTop:2,fontSize:22,fontWeight:'900',color:H.texte},
  sectionTitre:{marginTop:22,fontSize:15,fontWeight:'900',color:H.texte},
  sectionEntete:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  lien:{marginTop:22,fontSize:12,fontWeight:'900',color:H.primaire},
  actions:{marginTop:8,gap:7},
  action:{minHeight:54,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  actionIcone:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:H.primaireClair},
  actionTexte:{flex:1,fontSize:13,fontWeight:'800',color:H.texte},
  liste:{marginTop:8,borderRadius:rayons.m,overflow:'hidden',backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},
  vente:{minHeight:61,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:H.bordure},
  ticketIcone:{width:32,height:32,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:H.primaireClair},
  venteTextes:{flex:1},
  venteNumero:{fontSize:12,fontWeight:'900',color:H.texte},
  venteDate:{marginTop:2,fontSize:9,color:H.texteFaible},
  venteMontant:{fontSize:12,fontWeight:'900',color:H.texte},
  vide:{padding:20,textAlign:'center',color:H.texteFaible,fontSize:12},
});
