import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import {
  ajouterFraisArrivage,
  ajouterLigneArrivage,
  annulerArrivage,
  obtenirArrivage,
  passerArrivageEnTransit,
  rattacherAchatArrivage,
  supprimerFraisArrivage,
  supprimerLigneArrivage,
  type ArrivageLocal,
  type ModeRepartitionFrais,
  type TypeFraisArrivage,
} from '../../../src/services/arrivage';
import { listerAchats, type AchatResume } from '../../../src/services/achat';
import { listerProduits } from '../../../src/db/repositories/produit';
import {
  libelleVariante,
  listerVariantesProduit,
  type VarianteMobile,
} from '../../../src/db/repositories/variante';
import type { Produit } from '../../../src/domain/types';
import { BandeauEtat, Bouton, espaces, formaterMontant, rayons } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';
import { HABILLEMENT_MOBILE_THEME as H } from '../../../src/profile-ui/habillement/theme';
import { useSession } from '../../_layout';

const FRAIS: Array<[TypeFraisArrivage,string]> = [
  ['FRET','Fret'],['DOUANE','Douane'],['TRANSPORT_LOCAL','Transport local'],
  ['TRANSIT','Transit'],['ASSURANCE','Assurance'],['COMMISSION','Commission'],['AUTRE','Autre'],
];
const MODES: Array<[ModeRepartitionFrais,string]> = [
  ['VALEUR','Valeur'],['QUANTITE','Quantité'],['POIDS','Poids'],['VOLUME','Volume'],
];

function nombre(v:string):number {
  const n=Number(v.replace(',','.'));
  return Number.isFinite(n)?n:0;
}

export default function DetailArrivageHabillement() {
  const router=useRouter();
  const {id}=useLocalSearchParams<{id:string}>();
  const {boutique,revisionSynchronisation}=useSession();
  const identifiant=Number(id);
  const [arrivage,setArrivage]=useState<ArrivageLocal|null>(null);
  const [produits,setProduits]=useState<Produit[]>([]);
  const [achats,setAchats]=useState<AchatResume[]>([]);
  const [modalLigne,setModalLigne]=useState(false);
  const [modalFrais,setModalFrais]=useState(false);
  const [produitId,setProduitId]=useState<number|null>(null);
  const [variantes,setVariantes]=useState<VarianteMobile[]>([]);
  const [varianteId,setVarianteId]=useState<number|null>(null);
  const [qte,setQte]=useState('1');
  const [prix,setPrix]=useState('');
  const [poids,setPoids]=useState('0');
  const [volume,setVolume]=useState('0');
  const [typeFrais,setTypeFrais]=useState<TypeFraisArrivage>('FRET');
  const [libelleFrais,setLibelleFrais]=useState('');
  const [montantFrais,setMontantFrais]=useState('');
  const [modeFrais,setModeFrais]=useState<ModeRepartitionFrais>('VALEUR');
  const [enCours,setEnCours]=useState(false);

  const charger=useCallback(async()=>{
    const [a,p,ach]=await Promise.all([
      obtenirArrivage(identifiant),
      listerProduits({actifsSeulement:true,limite:500}),
      listerAchats({statut:'BROUILLON',limite:100}),
    ]);
    setArrivage(a);setProduits(p);setAchats(ach);
  },[identifiant]);

  useFocusEffect(useCallback(()=>{void charger();},[charger,revisionSynchronisation]));

  useEffect(()=>{
    if(!produitId){setVariantes([]);setVarianteId(null);return;}
    void listerVariantesProduit(produitId).then(v=>{
      setVariantes(v);setVarianteId(v.length===1?v[0].id:null);
      const p=produits.find(x=>x.id===produitId);
      setPrix(String(Math.round(v[0]?.prixAchat??p?.prixAchat??0)));
    });
  },[produitId,produits]);

  const achatsDisponibles=useMemo(
    ()=>achats.filter(a=>!arrivage?.achatIds.includes(a.id)),
    [achats,arrivage],
  );

  const agir=useCallback(async(action:()=>Promise<void>,succes?:string)=>{
    setEnCours(true);
    try{await action();await charger();if(succes)Alert.alert('Arrivage',succes);}
    catch(e){Alert.alert('Opération impossible',e instanceof Error?e.message:String(e));}
    finally{setEnCours(false);}
  },[charger]);

  if(!arrivage){
    return <View style={s.page}><BandeauEtat/><View style={s.vide}><Text style={s.videTitre}>Arrivage introuvable</Text></View></View>;
  }

  const editable=arrivage.statut==='BROUILLON';
  const ouvert=!['RECEPTIONNE','ANNULE'].includes(arrivage.statut);

  const enregistrerLigne=async()=>{
    if(!produitId||nombre(qte)<=0){Alert.alert('Ligne incomplète','Choisissez le produit et la quantité.');return;}
    await agir(async()=>{
      await ajouterLigneArrivage(arrivage.id,{
        produitId,
        varianteId,
        quantitePrevue:nombre(qte),
        prixAchatUnitaire:nombre(prix),
        poidsUnitaireKg:nombre(poids),
        volumeUnitaireM3:nombre(volume),
      });
      setModalLigne(false);setProduitId(null);setQte('1');setPrix('');setPoids('0');setVolume('0');
    });
  };

  const enregistrerFrais=async()=>{
    if(nombre(montantFrais)<0){return;}
    await agir(async()=>{
      await ajouterFraisArrivage(arrivage.id,{
        typeFrais,libelle:libelleFrais,montant:nombre(montantFrais),
        modeRepartition:modeFrais,
      });
      setModalFrais(false);setMontantFrais('');setLibelleFrais('');
    });
  };

  return <View style={s.page}>
    <BandeauEtat/>
    <View style={s.entete}>
      <Pressable onPress={()=>router.back()} hitSlop={10}><Icone nom="retour" taille={23} couleur={H.texte}/></Pressable>
      <View style={s.enteteTextes}><Text style={s.titre}>{arrivage.numero}</Text><Text style={s.sous}>{arrivage.titre}</Text></View>
      <View style={s.badge}><Text style={s.badgeTexte}>{arrivage.statut.replaceAll('_',' ')}</Text></View>
    </View>

    <ScrollView contentContainerStyle={s.contenu}>
      <View style={s.resume}>
        <LigneInfo label="Transporteur" value={arrivage.transporteur||'—'}/>
        <LigneInfo label="Tracking" value={arrivage.trackingNumber||'—'}/>
        <LigneInfo label="Réception estimée" value={arrivage.dateReceptionEstimee||'—'}/>
        <View style={s.kpis}>
          <Kpi label="Prévu" value={String(arrivage.totalPiecesPrevues)}/>
          <Kpi label="Reçu" value={String(arrivage.totalPiecesRecues)}/>
          <Kpi label="Frais" value={formaterMontant(arrivage.totalFrais,boutique.devise)}/>
          <Kpi label="Coût rendu" value={formaterMontant(arrivage.coutTotalRendu,boutique.devise)}/>
        </View>
      </View>

      {editable&&achatsDisponibles.length>0?<Section titre="Bons fournisseurs disponibles">
        {achatsDisponibles.map(a=><Pressable key={a.id} style={s.bon} onPress={()=>void agir(()=>rattacherAchatArrivage(arrivage.id,a.id),'Bon fournisseur rattaché.')}>
          <View style={{flex:1}}><Text style={s.bonTitre}>{a.numero}</Text><Text style={s.meta}>{a.fournisseurNom||'Sans fournisseur'} · {formaterMontant(a.total,boutique.devise)}</Text></View>
          <Text style={s.lien}>Rattacher</Text>
        </Pressable>)}
      </Section>:null}

      <Section titre="Marchandises" action={editable?{label:'Ajouter',onPress:()=>setModalLigne(true)}:undefined}>
        {arrivage.lignes.map(l=><View key={l.idLocal} style={s.ligne}>
          <View style={{flex:1}}>
            <Text style={s.ligneTitre}>{l.produitNom}</Text>
            {l.varianteNom?<Text style={s.variante}>{l.varianteNom}</Text>:null}
            <Text style={s.meta}>
              Prévu {l.quantitePrevue} · Reçu {l.quantiteRecue} · Rejeté {l.quantiteRejetee}
            </Text>
            <Text style={s.meta}>
              Achat {formaterMontant(l.prixAchatUnitaire,boutique.devise)}
              {l.coutRevientUnitaire>0?` · Rendu ${formaterMontant(l.coutRevientUnitaire,boutique.devise)}`:''}
            </Text>
            {l.numeroLot?<Text style={s.lot}>Lot {l.numeroLot}{l.datePeremption?` · exp. ${l.datePeremption}`:''}</Text>:null}
          </View>
          {editable?<Pressable onPress={()=>void agir(()=>supprimerLigneArrivage(arrivage.id,l.id))}><Icone nom="corbeille" taille={18} couleur={H.danger}/></Pressable>:null}
        </View>)}
        {arrivage.lignes.length===0?<Text style={s.videTexte}>Ajoutez les articles attendus ou rattachez un bon fournisseur.</Text>:null}
      </Section>

      <Section titre="Frais d’approche" action={ouvert?{label:'Ajouter',onPress:()=>setModalFrais(true)}:undefined}>
        {arrivage.frais.map(f=><View key={f.idLocal} style={s.ligne}>
          <View style={{flex:1}}><Text style={s.ligneTitre}>{f.libelle||FRAIS.find(x=>x[0]===f.typeFrais)?.[1]||f.typeFrais}</Text><Text style={s.meta}>{f.modeRepartition} · {formaterMontant(f.montant,boutique.devise)}</Text></View>
          {ouvert?<Pressable onPress={()=>void agir(()=>supprimerFraisArrivage(arrivage.id,f.id))}><Icone nom="corbeille" taille={18} couleur={H.danger}/></Pressable>:null}
        </View>)}
        {arrivage.frais.length===0?<Text style={s.videTexte}>Aucun fret, douane ou transport enregistré.</Text>:null}
      </Section>

      {arrivage.notes?<Section titre="Notes"><Text style={s.notes}>{arrivage.notes}</Text></Section>:null}
    </ScrollView>

    <View style={s.pied}>
      {arrivage.statut==='BROUILLON'?<Bouton titre="Passer en transit" onPress={()=>void agir(()=>passerArrivageEnTransit(arrivage.id),'Arrivage passé en transit.')} desactive={arrivage.lignes.length===0} enCours={enCours} grand/>:null}
      {['EN_TRANSIT','EN_COURS_RECEPTION'].includes(arrivage.statut)?<Bouton titre="Réceptionner / compter" onPress={()=>router.push({pathname:'/habillement/arrivages/reception/[id]',params:{id:String(arrivage.id)}})} grand/>:null}
      {ouvert?<Pressable style={s.annuler} onPress={()=>Alert.alert('Annuler l’arrivage','Cette action est irréversible.',[
        {text:'Retour',style:'cancel'},
        {text:'Annuler l’arrivage',style:'destructive',onPress:()=>void agir(()=>annulerArrivage(arrivage.id,'Annulation mobile'))},
      ])}><Text style={s.annulerTexte}>Annuler l’arrivage</Text></Pressable>:null}
    </View>

    <Modal visible={modalLigne} animationType="slide" onRequestClose={()=>setModalLigne(false)}>
      <View style={s.page}><View style={s.modalEntete}><Pressable onPress={()=>setModalLigne(false)}><Icone nom="retour" taille={22} couleur={H.texte}/></Pressable><Text style={s.modalTitre}>Ajouter une marchandise</Text></View>
      <ScrollView contentContainerStyle={s.modalContenu} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>Produit / modèle</Text>
        {produits.map(p=><Pressable key={p.id} style={[s.option,produitId===p.id&&s.optionActive]} onPress={()=>setProduitId(p.id)}><Text style={[s.optionTexte,produitId===p.id&&s.optionTexteActif]}>{p.nom}</Text></Pressable>)}
        {variantes.length>0?<><Text style={s.label}>Taille / couleur</Text>{variantes.map(v=><Pressable key={v.id} style={[s.option,varianteId===v.id&&s.optionActive]} onPress={()=>{setVarianteId(v.id);setPrix(String(Math.round(v.prixAchat??produits.find(p=>p.id===produitId)?.prixAchat??0)));}}><Text style={[s.optionTexte,varianteId===v.id&&s.optionTexteActif]}>{libelleVariante(v)} · {v.sku}</Text></Pressable>)}</>:null}
        <Champ label="Quantité prévue" value={qte} onChange={setQte}/>
        <Champ label="Prix achat unitaire" value={prix} onChange={setPrix}/>
        <Champ label="Poids unitaire (kg)" value={poids} onChange={setPoids}/>
        <Champ label="Volume unitaire (m³)" value={volume} onChange={setVolume}/>
      </ScrollView><View style={s.pied}><Bouton titre="Ajouter la ligne" onPress={()=>void enregistrerLigne()} enCours={enCours} grand/></View></View>
    </Modal>

    <Modal visible={modalFrais} animationType="slide" onRequestClose={()=>setModalFrais(false)}>
      <View style={s.page}><View style={s.modalEntete}><Pressable onPress={()=>setModalFrais(false)}><Icone nom="retour" taille={22} couleur={H.texte}/></Pressable><Text style={s.modalTitre}>Ajouter un frais</Text></View>
      <ScrollView contentContainerStyle={s.modalContenu}>
        <Text style={s.label}>Type</Text><View style={s.optionsWrap}>{FRAIS.map(([v,l])=><Pressable key={v} style={[s.option,typeFrais===v&&s.optionActive]} onPress={()=>setTypeFrais(v)}><Text style={[s.optionTexte,typeFrais===v&&s.optionTexteActif]}>{l}</Text></Pressable>)}</View>
        <Champ label="Libellé" value={libelleFrais} onChange={setLibelleFrais}/>
        <Champ label="Montant" value={montantFrais} onChange={setMontantFrais}/>
        <Text style={s.label}>Répartition</Text><View style={s.optionsWrap}>{MODES.map(([v,l])=><Pressable key={v} style={[s.option,modeFrais===v&&s.optionActive]} onPress={()=>setModeFrais(v)}><Text style={[s.optionTexte,modeFrais===v&&s.optionTexteActif]}>{l}</Text></Pressable>)}</View>
      </ScrollView><View style={s.pied}><Bouton titre="Ajouter le frais" onPress={()=>void enregistrerFrais()} enCours={enCours} grand/></View></View>
    </Modal>
  </View>;
}

function Section({titre,children,action}:{titre:string;children:React.ReactNode;action?:{label:string;onPress:()=>void}}){
  return <View style={s.section}><View style={s.sectionEntete}><Text style={s.sectionTitre}>{titre}</Text>{action?<Pressable onPress={action.onPress}><Text style={s.lien}>{action.label}</Text></Pressable>:null}</View>{children}</View>;
}
function LigneInfo({label,value}:{label:string;value:string}){return <View style={s.infoLigne}><Text style={s.infoLabel}>{label}</Text><Text style={s.infoValeur}>{value}</Text></View>;}
function Kpi({label,value}:{label:string;value:string}){return <View style={s.kpi}><Text style={s.kpiLabel}>{label}</Text><Text style={s.kpiValeur}>{value}</Text></View>;}
function Champ({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <View style={{gap:5}}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" style={s.champ}/></View>;}

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:H.fond},entete:{flexDirection:'row',alignItems:'center',gap:espaces.m,padding:espaces.m,backgroundColor:H.surface,borderBottomWidth:1,borderBottomColor:H.bordure},enteteTextes:{flex:1},titre:{fontSize:18,fontWeight:'900',color:H.texte},sous:{marginTop:2,fontSize:11,color:H.texteFaible},badge:{paddingHorizontal:8,paddingVertical:4,borderRadius:999,backgroundColor:H.primaireClair},badgeTexte:{fontSize:9,fontWeight:'900',color:H.primaire},
  contenu:{padding:espaces.m,paddingBottom:170,gap:espaces.m},resume:{padding:espaces.m,borderRadius:rayons.m,backgroundColor:H.surface,borderWidth:1,borderColor:H.bordure},infoLigne:{flexDirection:'row',justifyContent:'space-between',gap:8,paddingVertical:4},infoLabel:{fontSize:11,color:H.texteFaible},infoValeur:{fontSize:11,fontWeight:'800',color:H.texte},kpis:{marginTop:10,flexDirection:'row',flexWrap:'wrap',gap:7},kpi:{minWidth:'46%',flexGrow:1,padding:9,borderRadius:9,backgroundColor:H.fondSecondaire},kpiLabel:{fontSize:9,color:H.texteFaible},kpiValeur:{marginTop:2,fontSize:13,fontWeight:'900',color:H.texte},
  section:{borderRadius:rayons.m,borderWidth:1,borderColor:H.bordure,backgroundColor:H.surface,overflow:'hidden'},sectionEntete:{minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:espaces.m},sectionTitre:{fontSize:14,fontWeight:'900',color:H.texte},lien:{fontSize:11,fontWeight:'900',color:H.primaire},
  ligne:{minHeight:60,flexDirection:'row',alignItems:'center',gap:10,padding:espaces.m,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:H.bordure},ligneTitre:{fontSize:13,fontWeight:'900',color:H.texte},variante:{marginTop:2,fontSize:11,fontWeight:'800',color:H.primaire},meta:{marginTop:2,fontSize:10,color:H.texteFaible},lot:{marginTop:4,fontSize:10,fontWeight:'800',color:'#15803D'},videTexte:{padding:espaces.m,fontSize:11,color:H.texteFaible},notes:{padding:espaces.m,fontSize:12,lineHeight:18,color:H.texteCorps},
  bon:{flexDirection:'row',alignItems:'center',gap:8,padding:espaces.m,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:H.bordure},bonTitre:{fontSize:12,fontWeight:'900',color:H.texte},
  pied:{padding:espaces.m,gap:8,borderTopWidth:1,borderTopColor:H.bordure,backgroundColor:H.surface},annuler:{minHeight:42,alignItems:'center',justifyContent:'center'},annulerTexte:{fontSize:12,fontWeight:'900',color:H.danger},
  modalEntete:{minHeight:58,flexDirection:'row',alignItems:'center',gap:12,padding:espaces.m,borderBottomWidth:1,borderBottomColor:H.bordure,backgroundColor:H.surface},modalTitre:{fontSize:17,fontWeight:'900',color:H.texte},modalContenu:{padding:espaces.m,paddingBottom:120,gap:10},label:{fontSize:11,fontWeight:'800',color:H.texteFaible},champ:{minHeight:46,paddingHorizontal:12,borderRadius:rayons.m,borderWidth:1,borderColor:H.bordure,backgroundColor:H.surface,color:H.texte},option:{minHeight:42,paddingHorizontal:12,justifyContent:'center',borderRadius:rayons.m,borderWidth:1,borderColor:H.bordure,backgroundColor:H.surface},optionActive:{borderColor:H.primaire,backgroundColor:H.primaireClair},optionTexte:{fontSize:12,fontWeight:'700',color:H.texte},optionTexteActif:{color:H.primaire},optionsWrap:{flexDirection:'row',flexWrap:'wrap',gap:7},
  vide:{flex:1,alignItems:'center',justifyContent:'center'},videTitre:{fontSize:16,fontWeight:'900',color:H.texte},
});
