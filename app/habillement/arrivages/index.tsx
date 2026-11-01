import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';

import {
  listerArrivages,
  type ArrivageLocal,
  type StatutArrivage,
} from '../../../src/services/arrivage';
import { useSession } from '../../_layout';
import { BandeauEtat, espaces, rayons } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';
import { HABILLEMENT_MOBILE_THEME as H } from '../../../src/profile-ui/habillement/theme';

const LIBELLES: Record<StatutArrivage, string> = {
  BROUILLON: 'Brouillon',
  EN_TRANSIT: 'En transit',
  EN_COURS_RECEPTION: 'Réception',
  RECEPTIONNE: 'Réceptionné',
  ANNULE: 'Annulé',
};

const COULEURS: Record<StatutArrivage, string> = {
  BROUILLON: H.texteFaible,
  EN_TRANSIT: H.primaire,
  EN_COURS_RECEPTION: '#B45309',
  RECEPTIONNE: '#15803D',
  ANNULE: H.danger,
};

export default function ArrivagesHabillement() {
  const router = useRouter();
  const { revisionSynchronisation, synchroniserMaintenant, profilCommerce } = useSession();
  const [arrivages, setArrivages] = useState<ArrivageLocal[]>([]);
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState<StatutArrivage | 'TOUS'>('TOUS');
  const [rafraichit, setRafraichit] = useState(false);

  const autorise =
    profilCommerce?.capabilities_effectives.includes('ARRIVAL_MANAGEMENT') ||
    profilCommerce?.capabilities_effectives.includes('ARRIVALS');

  const charger = useCallback(async () => {
    setArrivages(await listerArrivages());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger, revisionSynchronisation]),
  );

  const visibles = useMemo(() => {
    const q = recherche.trim().toLocaleLowerCase('fr');
    return arrivages.filter((a) => {
      if (statut !== 'TOUS' && a.statut !== statut) return false;
      if (!q) return true;
      return [a.numero, a.titre, a.transporteur, a.trackingNumber]
        .some((v) => v.toLocaleLowerCase('fr').includes(q));
    });
  }, [arrivages, recherche, statut]);

  const rafraichir = useCallback(async () => {
    setRafraichit(true);
    try {
      try { await synchroniserMaintenant(); } catch { /* offline: garder SQLite */ }
      await charger();
    } finally {
      setRafraichit(false);
    }
  }, [charger, synchroniserMaintenant]);

  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icone nom="retour" taille={23} couleur={H.texte} />
        </Pressable>
        <View style={s.enteteTextes}>
          <Text style={s.titre}>Arrivages & transit</Text>
          <Text style={s.sousTitre}>Expéditions · réception · coût rendu</Text>
        </View>
        {autorise ? (
          <Pressable
            style={s.nouveau}
            onPress={() => router.push('/habillement/arrivages/nouveau')}
            accessibilityLabel="Nouvel arrivage"
          >
            <Icone nom="plus" taille={22} couleur="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>

      <View style={s.recherche}>
        <Icone nom="recherche" taille={18} couleur={H.texteFaible} />
        <TextInput
          value={recherche}
          onChangeText={setRecherche}
          style={s.rechercheTexte}
          placeholder="N°, titre, transporteur ou tracking"
          placeholderTextColor={H.texteFaible}
        />
      </View>

      <View style={s.filtres}>
        {([
          ['TOUS', 'Tous'],
          ['BROUILLON', 'Brouillons'],
          ['EN_TRANSIT', 'Transit'],
          ['EN_COURS_RECEPTION', 'Réception'],
          ['RECEPTIONNE', 'Reçus'],
        ] as const).map(([valeur, libelle]) => (
          <Pressable
            key={valeur}
            style={[s.filtre, statut === valeur && s.filtreActif]}
            onPress={() => setStatut(valeur)}
          >
            <Text style={[s.filtreTexte, statut === valeur && s.filtreTexteActif]}>
              {libelle}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(item) => item.idLocal}
        contentContainerStyle={s.liste}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={rafraichir} />}
        renderItem={({ item }) => (
          <Pressable
            style={s.carte}
            onPress={() =>
              router.push({
                pathname: '/habillement/arrivages/[id]',
                params: { id: String(item.id) },
              })
            }
          >
            <View style={s.carteHaut}>
              <Text style={s.numero}>{item.numero}</Text>
              <View style={[s.badge, { borderColor: COULEURS[item.statut] }]}>
                <Text style={[s.badgeTexte, { color: COULEURS[item.statut] }]}>
                  {LIBELLES[item.statut]}
                </Text>
              </View>
            </View>
            <Text style={s.carteTitre}>{item.titre}</Text>
            <Text style={s.meta}>
              {[item.transporteur, item.trackingNumber].filter(Boolean).join(' · ') || 'Transport non renseigné'}
            </Text>
            <View style={s.chiffres}>
              <Text style={s.chiffre}>{item.totalPiecesPrevues} prévues</Text>
              <Text style={s.chiffre}>{item.totalPiecesRecues} reçues</Text>
              {item.totalFrais > 0 ? (
                <Text style={s.chiffre}>
                  {Math.round(item.totalFrais).toLocaleString('fr-FR')} F frais
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={s.vide}>
            <Icone nom="achats" taille={34} couleur={H.texteEteint} />
            <Text style={s.videTitre}>Aucun arrivage</Text>
            <Text style={s.videTexte}>
              Suivez ici vos colis, camions, conteneurs et réceptions fournisseurs.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  page:{flex:1,backgroundColor:H.fond},
  entete:{flexDirection:'row',alignItems:'center',gap:espaces.m,padding:espaces.m,backgroundColor:H.surface,borderBottomWidth:1,borderBottomColor:H.bordure},
  enteteTextes:{flex:1},titre:{fontSize:19,fontWeight:'900',color:H.texte},sousTitre:{marginTop:2,fontSize:11,color:H.texteFaible},
  nouveau:{width:42,height:42,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:H.primaire},
  recherche:{margin:espaces.m,marginBottom:espaces.s,minHeight:46,flexDirection:'row',alignItems:'center',gap:espaces.s,paddingHorizontal:espaces.m,borderRadius:rayons.m,borderWidth:1,borderColor:H.bordure,backgroundColor:H.surface},
  rechercheTexte:{flex:1,fontSize:13,color:H.texte},
  filtres:{flexDirection:'row',flexWrap:'wrap',gap:6,paddingHorizontal:espaces.m,paddingBottom:espaces.m},
  filtre:{minHeight:34,paddingHorizontal:10,alignItems:'center',justifyContent:'center',borderRadius:18,borderWidth:1,borderColor:H.bordure,backgroundColor:H.surface},
  filtreActif:{backgroundColor:H.primaire,borderColor:H.primaire},filtreTexte:{fontSize:10,fontWeight:'800',color:H.texteFaible},filtreTexteActif:{color:'#FFFFFF'},
  liste:{paddingHorizontal:espaces.m,paddingBottom:90,gap:espaces.s},
  carte:{padding:espaces.m,borderRadius:rayons.m,borderWidth:1,borderColor:H.bordure,backgroundColor:H.surface},
  carteHaut:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  numero:{fontSize:11,fontWeight:'900',color:H.primaire},badge:{paddingHorizontal:8,paddingVertical:3,borderRadius:999,borderWidth:1},badgeTexte:{fontSize:9,fontWeight:'900'},
  carteTitre:{marginTop:7,fontSize:15,fontWeight:'900',color:H.texte},meta:{marginTop:3,fontSize:10,color:H.texteFaible},
  chiffres:{marginTop:10,flexDirection:'row',flexWrap:'wrap',gap:7},chiffre:{fontSize:10,fontWeight:'700',color:H.texteCorps,backgroundColor:H.fondSecondaire,paddingHorizontal:8,paddingVertical:4,borderRadius:999},
  vide:{padding:espaces.xl,alignItems:'center',gap:8},videTitre:{fontSize:16,fontWeight:'900',color:H.texte},videTexte:{fontSize:12,lineHeight:18,textAlign:'center',color:H.texteFaible},
});
