import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { obtenirBase } from '../../src/db/database';
import { useSession } from '../_layout';
import { BandeauEtat, espaces, formaterMontant, rayons } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { HABILLEMENT_MOBILE_THEME as H } from '../../src/profile-ui/habillement/theme';

type Filtre = 'TOUS' | 'ACTIFS' | 'BIENTOT' | 'EXPIRES';

interface LotRecu {
  id: number;
  numeroLot: string;
  produitNom: string;
  varianteNom: string;
  quantite: number;
  datePeremption: string | null;
  cout: number;
  arrivageId: number;
  arrivageNumero: string;
  dateReception: string | null;
  lotServeurId: number | null;
}

async function chargerLots(): Promise<LotRecu[]> {
  const db = await obtenirBase();
  return db.getAllAsync<LotRecu>(
    `SELECT la.id,
            la.numero_lot AS numeroLot,
            la.produit_nom_snapshot AS produitNom,
            la.variante_nom_snapshot AS varianteNom,
            la.quantite_recue AS quantite,
            la.date_peremption AS datePeremption,
            la.cout_revient_unitaire AS cout,
            a.id AS arrivageId,
            a.numero AS arrivageNumero,
            a.date_reception_reelle AS dateReception,
            la.lot_serveur_id AS lotServeurId
       FROM ligne_arrivage la
       JOIN arrivage a ON a.id = la.arrivage_id
      WHERE a.statut = 'RECEPTIONNE'
        AND la.supprime_le IS NULL
        AND TRIM(la.numero_lot) <> ''
      ORDER BY COALESCE(la.date_peremption, '9999-12-31'), a.date_reception_reelle DESC`,
  );
}

function etatLot(date: string | null): 'ACTIF' | 'BIENTOT' | 'EXPIRE' | 'SANS_DATE' {
  if (!date) return 'SANS_DATE';
  const fin = new Date(date + 'T23:59:59');
  const maintenant = new Date();
  if (fin.getTime() < maintenant.getTime()) return 'EXPIRE';
  const trente = new Date(maintenant);
  trente.setDate(trente.getDate() + 30);
  return fin.getTime() <= trente.getTime() ? 'BIENTOT' : 'ACTIF';
}

export default function LotsHabillement() {
  const router = useRouter();
  const { boutique, revisionSynchronisation } = useSession();
  const [lots, setLots] = useState<LotRecu[]>([]);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('TOUS');

  const charger = useCallback(async () => setLots(await chargerLots()), []);
  useFocusEffect(useCallback(() => { void charger(); }, [charger, revisionSynchronisation]));

  const visibles = useMemo(() => {
    const q = recherche.trim().toLocaleLowerCase('fr');
    return lots.filter((lot) => {
      const etat = etatLot(lot.datePeremption);
      if (filtre === 'ACTIFS' && !(etat === 'ACTIF' || etat === 'SANS_DATE')) return false;
      if (filtre === 'BIENTOT' && etat !== 'BIENTOT') return false;
      if (filtre === 'EXPIRES' && etat !== 'EXPIRE') return false;
      if (!q) return true;
      return [lot.numeroLot, lot.produitNom, lot.varianteNom, lot.arrivageNumero]
        .some((valeur) => valeur.toLocaleLowerCase('fr').includes(q));
    });
  }, [filtre, lots, recherche]);

  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icone nom="retour" taille={23} couleur={H.texte} />
        </Pressable>
        <View style={s.enteteTextes}>
          <Text style={s.titre}>Lots & péremptions</Text>
          <Text style={s.sous}>Traçabilité des lots reçus</Text>
        </View>
      </View>

      <View style={s.recherche}>
        <Icone nom="recherche" taille={18} couleur={H.texteFaible} />
        <TextInput
          value={recherche}
          onChangeText={setRecherche}
          placeholder="Lot, modèle, variante ou arrivage"
          placeholderTextColor={H.texteEteint}
          style={s.champ}
        />
      </View>

      <View style={s.filtres}>
        {([['TOUS', 'Tous'], ['ACTIFS', 'Actifs'], ['BIENTOT', '≤ 30 j'], ['EXPIRES', 'Expirés']] as Array<[Filtre, string]>).map(([valeur, libelle]) => (
          <Pressable
            key={valeur}
            style={[s.filtre, filtre === valeur && s.filtreActif]}
            onPress={() => setFiltre(valeur)}
          >
            <Text style={[s.filtreTexte, filtre === valeur && s.filtreTexteActif]}>{libelle}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(lot) => String(lot.id)}
        contentContainerStyle={s.liste}
        renderItem={({ item }) => {
          const etat = etatLot(item.datePeremption);
          const couleur = etat === 'EXPIRE' ? H.danger : etat === 'BIENTOT' ? H.avertissement : H.succes;
          const expiration = item.datePeremption ? 'Exp. ' + item.datePeremption : 'Sans péremption';
          return (
            <Pressable
              style={s.carte}
              onPress={() => router.push({ pathname: '/habillement/arrivages/[id]', params: { id: String(item.arrivageId) } })}
            >
              <View style={s.haut}>
                <Text style={s.lot}>{item.numeroLot}</Text>
                <View style={[s.badge, { borderColor: couleur }]}>
                  <Text style={[s.badgeTexte, { color: couleur }]}>{etat.replace('_', ' ')}</Text>
                </View>
              </View>
              <Text style={s.produit}>{item.produitNom}</Text>
              {item.varianteNom ? <Text style={s.variante}>{item.varianteNom}</Text> : null}
              <View style={s.metaLigne}>
                <Text style={s.meta}>{item.quantite} reçu(s)</Text>
                <Text style={s.meta}>{expiration}</Text>
              </View>
              <View style={s.metaLigne}>
                <Text style={s.meta}>Arrivage {item.arrivageNumero}</Text>
                <Text style={s.cout}>{formaterMontant(item.cout, boutique.devise)} / u.</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={s.vide}>
            <Icone nom="etiquette" taille={34} couleur={H.texteEteint} />
            <Text style={s.videTitre}>Aucun lot</Text>
            <Text style={s.videTexte}>Les lots apparaissent après réception définitive d’un arrivage.</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: H.fond },
  entete: { flexDirection: 'row', alignItems: 'center', gap: espaces.m, padding: espaces.m, backgroundColor: H.surface, borderBottomWidth: 1, borderBottomColor: H.bordure },
  enteteTextes: { flex: 1 },
  titre: { fontSize: 19, fontWeight: '900', color: H.texte },
  sous: { fontSize: 11, color: H.texteFaible, marginTop: 2 },
  recherche: { margin: espaces.m, marginBottom: espaces.s, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: rayons.m, borderWidth: 1, borderColor: H.bordure, backgroundColor: H.surface },
  champ: { flex: 1, color: H.texte, fontSize: 13 },
  filtres: { flexDirection: 'row', gap: 7, paddingHorizontal: espaces.m, paddingBottom: espaces.m },
  filtre: { minHeight: 34, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: H.bordure, backgroundColor: H.surface },
  filtreActif: { backgroundColor: H.primaire, borderColor: H.primaire },
  filtreTexte: { fontSize: 10, fontWeight: '800', color: H.texteFaible },
  filtreTexteActif: { color: '#fff' },
  liste: { paddingHorizontal: espaces.m, paddingBottom: 90, gap: espaces.s },
  carte: { padding: espaces.m, borderRadius: rayons.m, borderWidth: 1, borderColor: H.bordure, backgroundColor: H.surface },
  haut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lot: { fontSize: 12, fontWeight: '900', color: H.primaire },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderRadius: 999 },
  badgeTexte: { fontSize: 8, fontWeight: '900' },
  produit: { marginTop: 8, fontSize: 14, fontWeight: '900', color: H.texte },
  variante: { marginTop: 2, fontSize: 11, fontWeight: '800', color: H.primaire },
  metaLigne: { marginTop: 7, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  meta: { fontSize: 10, color: H.texteFaible },
  cout: { fontSize: 10, fontWeight: '900', color: H.texte },
  vide: { padding: espaces.xl, alignItems: 'center', gap: 8 },
  videTitre: { fontSize: 16, fontWeight: '900', color: H.texte },
  videTexte: { fontSize: 11, textAlign: 'center', color: H.texteFaible },
});