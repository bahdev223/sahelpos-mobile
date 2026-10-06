import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSession } from '../../_layout';
import { libelleReferenceTechnique, routeCaracteristiquesTechniques } from '../../../src/domain/presentation-commerce';
import { obtenirBase } from '../../../src/db/database';
import {
  genererMatriceVariantesLocale,
  libelleVariante,
  listerVariantesProduit,
  optionsMatriceProduit,
  type OptionMatriceMobile,
  type VarianteMobile,
} from '../../../src/db/repositories/variante';
import { BandeauEtat, formaterMontant, formaterQuantite, uriImage } from '../../../src/ui/components';
import { prixConditionnement, prixGrosConditionnement } from '../../../src/domain/quincaillerie';
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
  const { boutique, profilCommerce, synchroniserMaintenant } = useSession();
  const [fiche, setFiche] = useState<FicheReference | null>(null);
  const [etat, setEtat] = useState<'chargement'|'pret'|'absent'|'erreur'>('chargement');
  const [message, setMessage] = useState('');
  const [matriceOuverte, setMatriceOuverte] = useState(false);

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
      <View style={s.flex}><Text style={s.titre} numberOfLines={1}>{p.nom}</Text><Text style={s.muted}>{libelleReferenceTechnique(profilCommerce)}</Text></View>
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
          const detail = prixConditionnement(p.prix_unitaire, su.prix, su.facteur);
          const gros = prixGrosConditionnement(p.prix_gros, su.prix_gros, su.facteur);
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
        <Action label="Gérer les caractéristiques" detail="Diamètre, section, capacité, tension, couleur…" icon="etiquette" onPress={() => router.push(routeCaracteristiquesTechniques(profilCommerce, p.id))}/>
        <Action label="Ajouter des caractéristiques" detail="Diamètre, section, capacité, tension, couleur…" icon="etiquette" onPress={() => setMatriceOuverte(true)}/>
        <Action label="Mouvements de stock" detail="Entrées, sorties et corrections" icon="mouvements" onPress={() => router.push({pathname:'/stock/mouvements',params:{produit:String(p.id)}})}/>
        <Action label="Ajuster le stock" detail="Enregistrer une entrée ou une sortie" icon="inventaire" onPress={() => router.push({pathname:'/stock/ajustement',params:{produit:String(p.id)}})}/>
      </View>
    </ScrollView>
    <MatriceTechnique
      visible={matriceOuverte}
      produitId={p.id}
      onFermer={() => setMatriceOuverte(false)}
      onCree={async () => {
        setMatriceOuverte(false);
        await charger();
        void synchroniserMaintenant().catch(() => {});
      }}
    />
  </View>;
}


function MatriceTechnique({
  visible,
  produitId,
  onFermer,
  onCree,
}: {
  visible: boolean;
  produitId: number;
  onFermer: () => void;
  onCree: () => Promise<void>;
}) {
  const [dimensions, setDimensions] = useState<Array<{
    code: string; nom: string; ordre: number; valeurs: OptionMatriceMobile[];
  }>>([]);
  const [selection, setSelection] = useState<Record<string, OptionMatriceMobile[]>>({});
  const [chargement, setChargement] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState('');

  useFocusEffect(useCallback(() => {
    if (!visible) return;
    let vivant = true;
    setChargement(true);
    setErreur('');
    setSelection({});
    void optionsMatriceProduit()
      .then((liste) => {
        if (!vivant) return;
        setDimensions(liste.filter((d) => d.valeurs.length > 0));
      })
      .catch((e) => {
        if (vivant) setErreur(e instanceof Error ? e.message : 'Référentiel technique indisponible.');
      })
      .finally(() => { if (vivant) setChargement(false); });
    return () => { vivant = false; };
  }, [visible]));

  const nombre = useMemo(() => {
    const groupes = Object.values(selection).filter((valeurs) => valeurs.length > 0);
    if (!groupes.length) return 0;
    return groupes.reduce((total, valeurs) => total * valeurs.length, 1);
  }, [selection]);

  const basculer = (dimension: string, valeur: OptionMatriceMobile) => {
    setSelection((actuel) => {
      const groupe = actuel[dimension] ?? [];
      const presente = groupe.some((v) => v.valeurServeurId === valeur.valeurServeurId);
      return {
        ...actuel,
        [dimension]: presente
          ? groupe.filter((v) => v.valeurServeurId !== valeur.valeurServeurId)
          : [...groupe, valeur],
      };
    });
  };

  const generer = async () => {
    if (enregistrement || nombre <= 0) return;
    if (nombre > 240) {
      setErreur('Réduisez la sélection : 240 variantes maximum en une opération.');
      return;
    }
    setEnregistrement(true);
    setErreur('');
    try {
      await genererMatriceVariantesLocale(produitId, selection);
      await onCree();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Création des variantes impossible.');
    } finally {
      setEnregistrement(false);
    }
  };

  return <Modal visible={visible} animationType="slide" onRequestClose={() => !enregistrement && onFermer()}>
    <View style={s.page}>
      <View style={s.entete}>
        <Pressable style={s.icone} disabled={enregistrement} onPress={onFermer} accessibilityLabel="Fermer">
          <Icone nom="fermer" taille={22} couleur={couleurs.texte}/>
        </Pressable>
        <View style={s.flex}>
          <Text style={s.titre}>Caractéristiques techniques</Text>
          <Text style={s.muted}>Sélectionnez uniquement les axes qui décrivent cette référence.</Text>
        </View>
      </View>
      {chargement ? <View style={s.centre}><ActivityIndicator color={couleurs.primaire}/></View> :
        <ScrollView contentContainerStyle={s.contenu}>
          {erreur ? <Text style={s.erreur}>{erreur}</Text> : null}
          {dimensions.map((dimension) => <View key={dimension.code} style={s.carte}>
            <Text style={s.sectionTitre}>{dimension.nom}</Text>
            <View style={s.optionsTechniques}>
              {dimension.valeurs.map((valeur) => {
                const actif=(selection[dimension.code] ?? []).some((v) => v.valeurServeurId === valeur.valeurServeurId);
                return <Pressable key={valeur.valeurServeurId}
                  accessibilityRole="checkbox"
                  accessibilityState={{checked:actif, disabled:enregistrement}}
                  disabled={enregistrement}
                  onPress={() => basculer(dimension.code,valeur)}
                  style={[s.optionTechnique,actif && s.optionTechniqueActive]}>
                  {valeur.codeHex && /^#[0-9a-f]{6}$/i.test(valeur.codeHex) ? <View style={[s.pastille,{backgroundColor:valeur.codeHex}]}/> : null}
                  <Text style={[s.optionTechniqueTexte,actif && s.optionTechniqueTexteActive]}>{actif ? '✓ ' : ''}{valeur.nom}</Text>
                </Pressable>;
              })}
            </View>
          </View>)}
          {!dimensions.length && !erreur ? <View style={s.carte}><Text style={s.muted}>Aucune caractéristique synchronisée. Lancez une synchronisation puis réessayez.</Text></View> : null}
          <View style={s.resumeMatrice}>
            <Text style={s.ligneLabel}>{nombre} variante(s) à créer ou retrouver</Text>
            <Text style={s.muted}>Exemple : 3 sections × 2 couleurs = 6 variantes. Les doublons existants ne seront pas recréés.</Text>
          </View>
        </ScrollView>}
      <View style={s.piedModal}>
        <Pressable style={[s.boutonSecondaireModal,enregistrement && s.inactif]} disabled={enregistrement} onPress={onFermer}><Text style={s.boutonSecondaireTexte}>Annuler</Text></Pressable>
        <Pressable style={[s.bouton,nombre<=0 && s.inactif]} disabled={enregistrement || nombre<=0} onPress={() => void generer()}>
          {enregistrement ? <ActivityIndicator color="#fff"/> : <Text style={s.boutonTexte}>Créer les variantes</Text>}
        </Pressable>
      </View>
    </View>
  </Modal>;
}

function BoutonRetour({onPress}:{onPress:()=>void}){return <Pressable style={s.bouton} onPress={onPress}><Text style={s.boutonTexte}>Retour</Text></Pressable>;}
function Stat({label,value}:{label:string;value:string}){return <View style={s.stat}><Text style={s.muted}>{label}</Text><Text style={s.statValeur}>{value}</Text></View>;}
function Info({label,value}:{label:string;value:string}){return <View style={s.ligne}><Text style={s.ligneLabel}>{label}</Text><Text style={s.ligneValeur}>{value}</Text></View>;}
function Action({label,detail,icon,onPress}:{label:string;detail:string;icon:'crayon'|'mouvements'|'inventaire'|'etiquette';onPress:()=>void}){return <Pressable style={s.action} onPress={onPress}><Icone nom={icon} taille={20} couleur={couleurs.primaire}/><View style={s.flex}><Text style={s.ligneLabel}>{label}</Text><Text style={s.muted}>{detail}</Text></View><Icone nom="chevron" taille={16} couleur={couleurs.texteEteint}/></Pressable>;}

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
  optionsTechniques:{flexDirection:'row',flexWrap:'wrap',gap:8,padding:14,paddingTop:6},
  optionTechnique:{minHeight:46,paddingHorizontal:12,paddingVertical:9,borderRadius:10,borderWidth:1,borderColor:couleurs.bordure,backgroundColor:couleurs.surface,flexDirection:'row',alignItems:'center',gap:7},
  optionTechniqueActive:{backgroundColor:couleurs.primaireDouce,borderColor:couleurs.primaire},
  optionTechniqueTexte:{fontSize:13,fontWeight:'700',color:couleurs.texte},
  optionTechniqueTexteActive:{color:couleurs.primaire},
  pastille:{width:18,height:18,borderRadius:9,borderWidth:1,borderColor:couleurs.bordure},
  resumeMatrice:{padding:14,borderRadius:12,backgroundColor:couleurs.primaireDouce,gap:5},
  piedModal:{padding:16,flexDirection:'row',gap:10,backgroundColor:couleurs.surface,borderTopWidth:1,borderTopColor:couleurs.bordure},
  boutonSecondaireModal:{flex:1,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:12,borderWidth:1,borderColor:couleurs.bordure},
  boutonSecondaireTexte:{color:couleurs.texte,fontWeight:'800'},
  centre:{flex:1,alignItems:'center',justifyContent:'center',gap:14,padding:24}, erreur:{color:couleurs.danger,fontSize:14,textAlign:'center'}, bouton:{minHeight:48,paddingHorizontal:18,borderRadius:12,backgroundColor:couleurs.primaire,alignItems:'center',justifyContent:'center'},boutonTexte:{color:'#fff',fontWeight:'800'},
});
