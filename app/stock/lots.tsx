/**
 * Receptions : d'ou vient le stock, reception par reception.
 *
 * CE QUE CET ECRAN N'EST PAS, ET POURQUOI
 * ---------------------------------------
 * Le poste de bureau suit des LOTS : chaque arrivage devient une ligne avec son
 * numero, son fournisseur, son prix d'achat propre et sa date de peremption, et
 * les ventes puisent dedans du plus ancien au plus recent (FIFO). Le schema du
 * mobile n'a volontairement pas de table `lot` - la decision est ecrite dans
 * `src/db/schema.ts` : tenir des lots a la main sur un telephone, entre deux
 * clients, coute plus cher que ce que ca rapporte, et le stock est donc suivi
 * au produit.
 *
 * Il n'y a donc ici NI numero de lot, NI date de peremption, NI FIFO : les
 * inventer a l'ecran ferait croire a une tracabilite qui n'existe pas, et c'est
 * exactement le genre de promesse qui se paie le jour d'un rappel produit.
 *
 * Ce que cet ecran montre est reel : chaque ENTREE de stock enregistree, avec sa
 * date, son origine, sa reference de bon de livraison et son prix. C'est ce qui
 * repond aux vraies questions du quotidien - "quand ai-je recu ce sac de riz ?",
 * "a combien l'avais-je paye la derniere fois ?", "qui me l'a livre ?".
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { obtenirBase } from '../../src/db/database';
import { C, formaterFrancs, formaterQuantite, s } from '../produit/nouveau';
import {
  LIBELLE_SOURCE,
  formaterDateHeure,
  messageDe,
  normaliser,
  type SourceOperation,
} from '../(tabs)/stock';
import {
  BARRE_HORIZONTALE, BandeauEtat, couleurs } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';

const LIMITE = 200;

interface Reception {
  id: number;
  produit_id: number;
  produit_nom: string | null;
  quantite: number;
  unite: string | null;
  quantite_base: number;
  unite_base: string | null;
  prix_unitaire: number | null;
  reference: string | null;
  motif: string | null;
  source_operation: string;
  date_mouvement: string;
}

/**
 * Seules les ENTREE sont chargees : une sortie de casse ou une vente ne sont
 * pas des receptions. La limite tient l'ecran reactif sur un vieux telephone -
 * au-dela, c'est le journal filtre qu'il faut ouvrir.
 */
async function chargerReceptions(): Promise<Reception[]> {
  const db = await obtenirBase();
  return db.getAllAsync<Reception>(
    `SELECT m.id, m.produit_id, m.quantite, m.unite, m.quantite_base,
            m.prix_unitaire, m.reference, m.motif, m.source_operation,
            m.date_mouvement, p.nom AS produit_nom, p.unite_base
       FROM mouvement_stock m
       LEFT JOIN produit p ON p.id = m.produit_id
      WHERE m.nature = 'ENTREE'
      ORDER BY m.date_mouvement DESC, m.id DESC
      LIMIT ?`,
    LIMITE,
  );
}

type Etat =
  | { phase: 'chargement' }
  | { phase: 'erreur'; message: string }
  | { phase: 'pret'; receptions: Reception[] };

const ORIGINES: { cle: SourceOperation | null; libelle: string }[] = [
  { cle: null, libelle: 'Toutes' },
  { cle: 'ACHAT', libelle: 'Achat' },
  { cle: 'INITIALISATION', libelle: 'Mise en route' },
  { cle: 'RETOUR', libelle: 'Retour' },
  { cle: 'CORRECTION', libelle: 'Correction' },
];

export default function Receptions() {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' });
  const [recherche, setRecherche] = useState('');
  const [origine, setOrigine] = useState<SourceOperation | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(async (silencieux: boolean) => {
    if (!silencieux) setEtat({ phase: 'chargement' });
    try {
      setEtat({ phase: 'pret', receptions: await chargerReceptions() });
    } catch (probleme) {
      setEtat({ phase: 'erreur', message: messageDe(probleme) });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void charger(true);
    }, [charger]),
  );

  const rafraichir = useCallback(() => {
    setRafraichissement(true);
    void charger(true).finally(() => setRafraichissement(false));
  }, [charger]);

  const receptions = etat.phase === 'pret' ? etat.receptions : [];

  const filtrees = useMemo(() => {
    const terme = normaliser(recherche.trim());
    return receptions.filter((r) => {
      if (origine !== null && r.source_operation !== origine) return false;
      if (terme === '') return true;
      return (
        normaliser(r.produit_nom ?? '').includes(terme) ||
        normaliser(r.reference ?? '').includes(terme) ||
        normaliser(r.motif ?? '').includes(terme)
      );
    });
  }, [origine, receptions, recherche]);

  const valeurTotale = useMemo(
    () =>
      filtrees.reduce(
        (somme, r) => somme + (r.prix_unitaire !== null ? r.quantite * r.prix_unitaire : 0),
        0,
      ),
    [filtrees],
  );

  const sansPrix = useMemo(
    () => filtrees.filter((r) => r.prix_unitaire === null || r.prix_unitaire <= 0).length,
    [filtrees],
  );

  return (
    <View style={s.plein}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} style={s.retour}>
          <Icone nom="retour" taille={17} couleur={couleurs.primaire} />
          <Text style={s.retourTexte}>Retour</Text>
        </Pressable>
        <Text style={s.titre}>Receptions de stock</Text>
      </View>

      {etat.phase === 'chargement' ? (
        <View style={sl.centre}>
          <ActivityIndicator color={C.accent} />
          <Text style={sl.centreTexte}>Lecture des receptions...</Text>
        </View>
      ) : etat.phase === 'erreur' ? (
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>Les receptions n&apos;ont pas pu etre lues</Text>
          <Text style={sl.centreTexte}>{etat.message}</Text>
          <Pressable style={s.boutonSecondaire} onPress={() => void charger(false)}>
            <Text style={s.boutonSecondaireTexte}>Reessayer</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtrees}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={filtrees.length === 0 ? sl.listeVide : sl.liste}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={rafraichissement} onRefresh={rafraichir} />
          }
          ListHeaderComponent={
            <View style={sl.tete}>
              <View style={sl.avis}>
                <Text style={sl.avisTitre}>Suivi au produit, pas au lot</Text>
                <Text style={sl.avisTexte}>
                  Cette version mobile suit le stock produit par produit. Il n&apos;y a ni numero
                  de lot ni date de peremption : ce que vous voyez ici, ce sont les entrees de
                  stock reellement enregistrees, de la plus recente a la plus ancienne.
                </Text>
              </View>

              <View style={[s.zoneSaisie, sl.recherche]}>
                <TextInput
                  style={s.saisie}
                  value={recherche}
                  onChangeText={setRecherche}
                  placeholder="Produit, fournisseur ou reference"
                  placeholderTextColor={C.texteFaible}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {recherche !== '' ? (
                  <Pressable onPress={() => setRecherche('')} hitSlop={10}>
                    <Text style={sl.effacer}>Effacer</Text>
                  </Pressable>
                ) : null}
              </View>

              <ScrollView
                horizontal
                style={BARRE_HORIZONTALE}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={sl.puces}
                keyboardShouldPersistTaps="handled">
                {ORIGINES.map((o) => (
                  <Pressable
                    key={o.cle ?? 'toutes'}
                    style={[s.puce, origine === o.cle ? s.puceActive : null]}
                    onPress={() => setOrigine(o.cle)}>
                    <Text style={[s.puceTexte, origine === o.cle ? s.puceTexteActif : null]}>
                      {o.libelle}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {filtrees.length > 0 ? (
                <View style={sl.bilan}>
                  <Text style={sl.bilanTitre}>
                    {filtrees.length} reception(s) - {formaterFrancs(valeurTotale)}
                  </Text>
                  {sansPrix > 0 ? (
                    <Text style={sl.bilanAide}>
                      {sansPrix} reception(s) sans prix saisi ne sont pas comptees dans ce total.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={sl.centre}>
              <Text style={sl.centreTitre}>Aucune reception</Text>
              <Text style={sl.centreTexte}>
                {receptions.length === 0
                  ? "Aucune entree de stock n'a encore ete enregistree. Elles apparaitront ici " +
                    'des la premiere reception saisie.'
                  : 'Aucune reception ne correspond a cette recherche.'}
              </Text>
              {receptions.length === 0 ? (
                <Pressable
                  style={s.boutonSecondaire}
                  onPress={() =>
                    router.push({
                      pathname: '/stock/ajustement',
                      params: { nature: 'ENTREE' },
                    })
                  }>
                  <Text style={s.boutonSecondaireTexte}>Saisir une entree</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={s.boutonSecondaire}
                  onPress={() => {
                    setRecherche('');
                    setOrigine(null);
                  }}>
                  <Text style={s.boutonSecondaireTexte}>Effacer les filtres</Text>
                </Pressable>
              )}
            </View>
          }
          ListFooterComponent={
            filtrees.length >= LIMITE ? (
              <View style={sl.pied}>
                <Text style={sl.piedTexte}>
                  Seules les {LIMITE} dernieres receptions sont affichees.
                </Text>
                <Pressable
                  style={s.boutonSecondaire}
                  onPress={() =>
                    router.push({ pathname: '/stock/mouvements', params: { nature: 'ENTREE' } })
                  }>
                  <Text style={s.boutonSecondaireTexte}>Ouvrir le journal complet</Text>
                </Pressable>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <CarteReception
              reception={item}
              onProduit={() =>
                router.push({
                  pathname: '/stock/mouvements',
                  params: { produit: String(item.produit_id) },
                })
              }
            />
          )}
        />
      )}
    </View>
  );
}

function CarteReception(p: { reception: Reception; onProduit: () => void }) {
  const r = p.reception;
  const unite = r.unite ?? r.unite_base ?? '';
  const valeur = r.prix_unitaire !== null ? r.quantite * r.prix_unitaire : null;
  const source =
    r.source_operation in LIBELLE_SOURCE
      ? LIBELLE_SOURCE[r.source_operation as SourceOperation]
      : r.source_operation;

  // Le fournisseur est saisi dans le motif : le schema n'a pas de colonne pour
  // lui, et en inventer une pour un seul ecran couterait une migration.
  const origine = (r.motif ?? '').trim();

  return (
    <Pressable style={sl.carte} onPress={p.onProduit} accessibilityRole="button">
      <View style={sl.carteHaut}>
        <Text style={sl.produit} numberOfLines={2}>
          {r.produit_nom ?? 'Produit supprime'}
        </Text>
        <Text style={sl.quantite}>
          +{formaterQuantite(r.quantite)} {unite}
        </Text>
      </View>

      <View style={sl.badges}>
        <View style={sl.badge}>
          <Text style={sl.badgeTexte}>{source}</Text>
        </View>
        <Text style={sl.date}>{formaterDateHeure(r.date_mouvement)}</Text>
      </View>

      {origine !== '' ? (
        <Text style={sl.origine} numberOfLines={2}>
          {origine}
        </Text>
      ) : null}

      <View style={sl.carteBas}>
        {r.reference ? (
          <Text style={sl.reference} numberOfLines={1}>
            {r.reference}
          </Text>
        ) : null}
        {r.prix_unitaire !== null && r.prix_unitaire > 0 ? (
          <Text style={sl.prix}>
            {formaterFrancs(r.prix_unitaire)} / {unite}
            {valeur !== null ? ` - total ${formaterFrancs(valeur)}` : ''}
          </Text>
        ) : (
          <Text style={sl.prixAbsent}>Prix non saisi</Text>
        )}
      </View>

      {r.unite_base && unite !== r.unite_base ? (
        <Text style={sl.enBase}>
          Soit {formaterQuantite(r.quantite_base)} {r.unite_base}
        </Text>
      ) : null}
    </Pressable>
  );
}

const sl = StyleSheet.create({
  tete: { gap: 10, paddingBottom: 4 },
  avis: {
    backgroundColor: couleurs.primaireDouce,
    borderWidth: 1,
    borderColor: couleurs.primaireBordure,
    borderRadius: 10,
    padding: 12,
    gap: 3,
  },
  avisTitre: { fontSize: 13, fontWeight: '700', color: couleurs.primaire },
  avisTexte: { fontSize: 12, color: couleurs.primaire, lineHeight: 18 },

  recherche: { backgroundColor: C.carte },
  effacer: { fontSize: 12, color: C.accent, fontWeight: '600' },
  puces: { gap: 8, paddingVertical: 2, alignItems: 'center' },

  bilan: {
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    padding: 10,
    gap: 2,
  },
  bilanTitre: { fontSize: 14, fontWeight: '700', color: C.texte },
  bilanAide: { fontSize: 11, color: C.texteFaible, lineHeight: 16 },

  liste: { padding: 12, paddingBottom: 32, gap: 8 },
  listeVide: { flexGrow: 1, padding: 12 },

  carte: {
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    padding: 10,
    gap: 5,
  },
  carteHaut: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  produit: { flex: 1, fontSize: 15, fontWeight: '600', color: C.texte },
  quantite: { fontSize: 15, fontWeight: '700', color: C.vert },

  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: C.fond,
  },
  badgeTexte: { fontSize: 10, color: C.texteFaible, fontWeight: '700' },
  date: { fontSize: 11, color: C.texteFaible },

  origine: { fontSize: 13, color: C.texte },
  carteBas: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  reference: { fontSize: 11, color: C.accent, fontWeight: '600' },
  prix: { fontSize: 11, color: C.texteFaible },
  prixAbsent: { fontSize: 11, color: C.texteFaible, fontStyle: 'italic' },
  enBase: { fontSize: 11, color: C.texteFaible },

  pied: { paddingVertical: 16, gap: 10, alignItems: 'center' },
  piedTexte: { fontSize: 12, color: C.texteFaible, textAlign: 'center' },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centreTitre: { fontSize: 16, fontWeight: '700', color: C.texte },
  centreTexte: { fontSize: 13, color: C.texteFaible, textAlign: 'center', lineHeight: 19 },
});
