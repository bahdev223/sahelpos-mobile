import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSession } from '../../_layout';
import { obtenirBase } from '../../../src/db/database';
import {
  libelleVariante,
  listerVariantesProduit,
  type VarianteMobile,
} from '../../../src/db/repositories/variante';
import { BandeauEtat, formaterMontant, formaterQuantite, uriImage } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';
import { couleurs, espaces, rayons } from '../../../src/ui/theme';

interface ReferenceSql {
  id: number;
  nom: string;
  categorie: string | null;
  marque: string;
  reference_fabricant: string;
  code_barre: string | null;
  prix_unitaire: number;
  prix_gros: number;
  prix_achat: number;
  unite_base: string;
  quantite_base: number;
  stock_min: number;
  gestion_stock: number;
  chemin_image: string | null;
  actif: number;
}
interface ConditionnementSql {
  nom: string;
  facteur: number;
  prix: number;
  prix_gros: number;
}
interface FicheReference {
  produit: ReferenceSql;
  conditionnements: ConditionnementSql[];
  variantes: VarianteMobile[];
}

async function chargerReference(id: number): Promise<FicheReference | null> {
  const db = await obtenirBase();
  const produit = await db.getFirstAsync<ReferenceSql>(
    `SELECT id, nom, categorie, marque, reference_fabricant, code_barre,
            prix_unitaire, prix_gros, prix_achat, unite_base, quantite_base,
            stock_min, gestion_stock, chemin_image, actif
       FROM produit WHERE id = ?`,
    id,
  );
  if (!produit) return null;
  const [conditionnements, variantes] = await Promise.all([
    db.getAllAsync<ConditionnementSql>(
      'SELECT nom, facteur, prix, prix_gros FROM sous_unite WHERE produit_id = ? ORDER BY facteur',
      id,
    ),
    listerVariantesProduit(id, false),
  ]);
  return { produit, conditionnements, variantes };
}

export default function FicheReferenceQuincaillerie() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const identifiant = Number(id);
  const { boutique } = useSession();
  const [fiche, setFiche] = useState<FicheReference | null>(null);
  const [etat, setEtat] = useState<'chargement'|'pret'|'absent'|'erreur'>('chargement');
  const [message, setMessage] = useState('');

  const charger = useCallback(async () => {
    if (!Number.isInteger(identifiant) || identifiant <= 0) {
      setEtat('absent');
      return;
    }
    setEtat('chargement');
    try {
      const resultat = await chargerReference(identifiant);
      if (!resultat) {
        setEtat('absent');
        return;
      }
      setFiche(resultat);
      setEtat('pret');
      setMessage('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Lecture impossible.');
      setEtat('erreur');
    }
  }, [identifiant]);

  useFocusEffect(useCallback(() => { void charger(); }, [charger]));

  const dimensions = useMemo(() => {
    const resultat = new Map<string, { nom: string; ordre: number; valeurs: Map<string,string> }>();
    for (const variante of fiche?.variantes ?? []) {
      for (const valeur of variante.valeurs) {
        const d = resultat.get(valeur.dimensionCode) ?? {
          nom: valeur.dimensionNom,
          ordre: valeur.dimensionOrdre,
          valeurs: new Map<string,string>(),
        };
        d.valeurs.set(valeur.code, valeur.nom);
        resultat.set(valeur.dimensionCode, d);
      }
    }
    return [...resultat.entries()]
      .sort((a,b) => a[1].ordre - b[1].ordre)
      .map(([code,d]) => ({code, nom:d.nom, valeurs:[...d.valeurs.values()]}));
  }, [fiche]);

  if (etat === 'chargement') return <View style={s.page}><BandeauEtat/><View style={s.centre}><ActivityIndicator color={couleurs.primaire}/></View></View>;
  if (etat === 'absent') return <View style={s.page}><BandeauEtat/><View style={s.centre}><Text style={s.titre}>Référence introuvable</Text><BoutonRetour onPress={() => router.back()}/></View></View>;
  if (etat === 'erreur' || !fiche) return <View style={s.page}><BandeauEtat/><View style={s.centre}><Text style={s.erreur}>{message}</Text><Pressable style={s.bouton} onPress={() => void charger()}><Text style={s.boutonTexte}>Réessayer</Text></Pressable></View></View>;

  const p = fiche.produit;
  const image = uriImage(p.chemin_image);
  const stockVariantes = fiche.variantes.filter(v => v.actif).reduce((t,v) => t + v.stockActuel, 0);
  const stock = fiche.variantes.some(v => v.actif) ? stockVariantes : p.quantite_base;

  return <View style={s.page}>
    <BandeauEtat/>
    <View style={s.entete}>
      <Pressable style={s.icone} onPress={() => router.back()} accessibilityLabel="Retour"><Icone nom="retour" taille={22} couleur={couleurs.texte}/></Pressable>
      <View style={s.flex}><Text style={s.titre} numberOfLines={1}>{p.nom}</Text><Text style={s.muted}>Référence Quincaillerie</Text></View>
      <Pressable style={s.icone} onPress={() => router.push({pathname:'/produit/modifier/[id]',params:{id:String(p.id)}})} accessibilityLabel="Modifier la référence"><Icone nom="crayon" taille={21} couleur={couleurs.primaire}/></Pressable>
    </View>

    <ScrollView contentContainerStyle={s.contenu}>
      <View style={s.carte}>
        <View style={s.identite}>
          {image ? <Image source={{uri:image}} style={s.photo}/> : <View style={[s.photo,s.photoVide]}><Icone nom="stock" taille={42} couleur={couleurs.texteEteint}/></View>}
          <View style={s.flex}>
            <Text style={s.nom}>{p.nom}</Text>
            <Text style={s.muted}>{p.categorie || 'Sans rayon'}</Text>
            {p.marque ? <Text style={s.meta}>Marque · {p.marque}</Text> : null}
            {p.reference_fabricant ? <Text style={s.meta}>Réf. fabricant · {p.reference_fabricant}</Text> : null}
            {p.code_barre ? <Text style={s.meta}>Code-barres · {p.code_barre}</Text> : null}
          </View>
        </View>
      </View>

      <View style={s.stats}>
        <Stat label="Prix détail" value={formaterMontant(p.prix_unitaire,boutique.devise)}/>
        <Stat label="Prix gros" value={p.prix_gros > 0 ? formaterMontant(p.prix_gros,boutique.devise) : 'Non défini'}/>
        <Stat label="Stock" value={p.gestion_stock ? `${formaterQuantite(stock)} ${p.unite_base}` : 'Non suivi'}/>
      </View>

      {dimensions.length > 0 ? <View style={s.carte}>
        <Text style={s.sectionTitre}>Caractéristiques techniques</Text>
        {dimensions.map((d) => <View key={d.code} style={s.ligne}><Text style={s.ligneLabel}>{d.nom}</Text><Text style={s.ligneValeur}>{d.valeurs.join(' · ')}</Text></View>)}
      </View> : null}

      <View style={s.carte}>
        <Text style={s.sectionTitre}>Unités & conditionnements</Text>
        <View style={s.ligne}><Text style={s.ligneLabel}>{p.unite_base}</Text><View style={s.prixBloc}><Text style={s.ligneValeur}>Détail {formaterMontant(p.prix_unitaire,boutique.devise)}</Text>{p.prix_gros > 0 ? <Text style={s.muted}>Gros {formaterMontant(p.prix_gros,boutique.devise)}</Text> : null}</View></View>
        {fiche.conditionnements.map((su) => {
          const detail = su.prix > 0 ? su.prix : p.prix_unitaire * su.facteur;
          const gros = su.prix_gros > 0 ? su.prix_gros : p.prix_gros > 0 ? p.prix_gros * su.facteur : 0;
          return <View key={su.nom} style={s.ligne}><View style={s.flex}><Text style={s.ligneLabel}>{su.nom}</Text><Text style={s.muted}>1 {su.nom} = {formaterQuantite(su.facteur)} {p.unite_base}</Text></View><View style={s.prixBloc}><Text style={s.ligneValeur}>Détail {formaterMontant(detail,boutique.devise)}</Text>{gros > 0 ? <Text style={s.muted}>Gros {formaterMontant(gros,boutique.devise)}</Text> : null}</View></View>;
        })}
      </View>

      {fiche.variantes.length > 0 ? <View style={s.carte}>
        <Text style={s.sectionTitre}>Variantes techniques ({fiche.variantes.length})</Text>
        {fiche.variantes.map(v => <View key={v.idLocal} style={[s.ligne,!v.actif && s.inactif]}>
          <View style={s.flex}><Text style={s.ligneLabel}>{libelleVariante(v)}</Text><Text style={s.muted}>{v.sku}</Text></View>
          <View style={s.prixBloc}><Text style={s.ligneValeur}>{formaterQuantite(v.stockActuel)} {p.unite_base}</Text>{v.prixOverride != null && v.prixOverride > 0 ? <Text style={s.muted}>Détail {formaterMontant(v.prixOverride,boutique.devise)}</Text> : null}</View>
        </View>)}
      </View> : null}

      <View style={s.carte}>
        <Text style={s.sectionTitre}>Informations commerciales</Text>
        <Info label="Prix d’achat" value={formaterMontant(p.prix_achat,boutique.devise)}/>
        <Info label="Stock minimum" value={`${formaterQuantite(p.stock_min)} ${p.unite_base}`}/>
        <Info label="Statut" value={p.actif ? 'Active' : 'Inactive'}/>
      </View>

      <View style={s.carte}>
        <Action label="Modifier la référence" detail="Marque, prix, unités et conditionnements" icon="crayon" onPress={() => router.push({pathname:'/produit/modifier/[id]',params:{id:String(p.id)}})}/>
        <Action label="Mouvements de stock" detail="Entrées, sorties et corrections" icon="mouvements" onPress={() => router.push({pathname:'/stock/mouvements',params:{produit:String(p.id)}})}/>
        <Action label="Ajuster le stock" detail="Enregistrer une entrée ou une sortie" icon="inventaire" onPress={() => router.push({pathname:'/stock/ajustement',params:{produit:String(p.id)}})}/>
      </View>
    </ScrollView>
  </View>;
}

function BoutonRetour({onPress}:{onPress:()=>void}){return <Pressable style={s.bouton} onPress={onPress}><Text style={s.boutonTexte}>Retour</Text></Pressable>;}
function Stat({label,value}:{label:string;value:string}){return <View style={s.stat}><Text style={s.muted}>{label}</Text><Text style={s.statValeur}>{value}</Text></View>;}
function Info({label,value}:{label:string;value:string}){return <View style={s.ligne}><Text style={s.ligneLabel}>{label}</Text><Text style={s.ligneValeur}>{value}</Text></View>;}
function Action({label,detail,icon,onPress}:{label:string;detail:string;icon:'crayon'|'mouvements'|'inventaire';onPress:()=>void}){return <Pressable style={s.action} onPress={onPress}><Icone nom={icon} taille={20} couleur={couleurs.primaire}/><View style={s.flex}><Text style={s.ligneLabel}>{label}</Text><Text style={s.muted}>{detail}</Text></View><Icone nom="chevron" taille={16} couleur={couleurs.texteEteint}/></Pressable>;}

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:couleurs.fond}, flex:{flex:1,minWidth:0},
  entete:{flexDirection:'row',alignItems:'center',gap:10,padding:12,backgroundColor:couleurs.surface,borderBottomWidth:1,borderBottomColor:couleurs.bordure},
  icone:{width:48,height:48,alignItems:'center',justifyContent:'center'}, titre:{fontSize:20,fontWeight:'800',color:couleurs.texte}, muted:{fontSize:12,lineHeight:18,color:couleurs.texteFaible},
  contenu:{padding:16,paddingBottom:40,gap:14}, carte:{backgroundColor:couleurs.surface,borderWidth:1,borderColor:couleurs.bordure,borderRadius:rayons.l,overflow:'hidden'},
  identite:{flexDirection:'row',alignItems:'center',gap:14,padding:14}, photo:{width:96,height:96,borderRadius:12}, photoVide:{backgroundColor:couleurs.surfaceDouce,alignItems:'center',justifyContent:'center'},
  nom:{fontSize:19,fontWeight:'800',color:couleurs.texte}, meta:{fontSize:13,color:couleurs.texte,marginTop:4},
  stats:{flexDirection:'row',flexWrap:'wrap',gap:10}, stat:{flexGrow:1,minWidth:105,backgroundColor:couleurs.surface,borderWidth:1,borderColor:couleurs.bordure,borderRadius:12,padding:12},
  statValeur:{fontSize:15,fontWeight:'800',color:couleurs.primaire,marginTop:4}, sectionTitre:{fontSize:15,fontWeight:'800',color:couleurs.texte,padding:14,paddingBottom:6},
  ligne:{minHeight:56,paddingHorizontal:14,paddingVertical:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:couleurs.bordure},
  ligneLabel:{fontSize:14,fontWeight:'700',color:couleurs.texte}, ligneValeur:{fontSize:14,fontWeight:'700',color:couleurs.texte,textAlign:'right'}, prixBloc:{alignItems:'flex-end'}, inactif:{opacity:.5},
  action:{minHeight:64,padding:14,flexDirection:'row',alignItems:'center',gap:12,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:couleurs.bordure},
  centre:{flex:1,alignItems:'center',justifyContent:'center',gap:14,padding:24}, erreur:{color:couleurs.danger,fontSize:14,textAlign:'center'}, bouton:{minHeight:48,paddingHorizontal:18,borderRadius:12,backgroundColor:couleurs.primaire,alignItems:'center',justifyContent:'center'},boutonTexte:{color:'#fff',fontWeight:'800'},
});
