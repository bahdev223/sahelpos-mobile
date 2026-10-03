import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  echangerVarianteLocal,
  listerLignesEchangeables,
  variantesDeRemplacement,
  type LigneEchangeable,
} from '../../src/services/echange';
import {
  libelleVariante,
  type VarianteMobile,
} from '../../src/db/repositories/variante';
import { useSession } from '../_layout';
import { BandeauEtat, Bouton, couleurs, espaces, rayons } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { HABILLEMENT_MOBILE_THEME as H } from '../../src/profile-ui/habillement/theme';

function dateCourte(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export default function EchangesHabillement() {
  const router = useRouter();
  const { revisionSynchronisation } = useSession();
  const [lignes, setLignes] = useState<LigneEchangeable[]>([]);
  const [recherche, setRecherche] = useState('');
  const [choix, setChoix] = useState<LigneEchangeable | null>(null);

  const charger = useCallback(async () => {
    setLignes(await listerLignesEchangeables(200));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger, revisionSynchronisation]),
  );

  const visibles = useMemo(() => {
    const q = recherche.trim().toLocaleLowerCase('fr');
    if (!q) return lignes;
    return lignes.filter((ligne) =>
      ligne.numeroVente.toLocaleLowerCase('fr').includes(q) ||
      ligne.produitNom.toLocaleLowerCase('fr').includes(q) ||
      ligne.varianteNom.toLocaleLowerCase('fr').includes(q)
    );
  }, [lignes, recherche]);

  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icone nom="retour" taille={23} couleur={H.texte} />
        </Pressable>
        <View style={s.enteteTextes}>
          <Text style={s.titre}>Échanges taille / couleur</Text>
          <Text style={s.sousTitre}>Ventes synchronisées uniquement</Text>
        </View>
      </View>

      <View style={s.recherche}>
        <Icone nom="recherche" taille={18} couleur={H.texteFaible} />
        <TextInput
          value={recherche}
          onChangeText={setRecherche}
          style={s.rechercheTexte}
          placeholder="Vente, modèle, taille ou couleur"
          placeholderTextColor={H.texteFaible}
        />
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(item) => String(item.ligneId)}
        contentContainerStyle={s.liste}
        renderItem={({ item }) => (
          <Pressable style={s.carte} onPress={() => setChoix(item)}>
            <View style={s.carteHaut}>
              <View style={s.venteBadge}>
                <Text style={s.venteBadgeTexte}>{item.numeroVente}</Text>
              </View>
              <Text style={s.date}>{dateCourte(item.dateVente)}</Text>
            </View>
            <Text style={s.modele}>{item.produitNom}</Text>
            <Text style={s.variante}>{item.varianteNom}</Text>
            <View style={s.carteBas}>
              <Text style={s.quantite}>
                {item.quantite} {item.unite}
              </Text>
              <Text style={s.prix}>
                {Math.round(item.prixUnitaire).toLocaleString('fr-FR')} F
              </Text>
              <Icone nom="chevron" taille={16} couleur={H.texteFaible} />
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={s.vide}>
            <Text style={s.videTitre}>Aucune ligne échangeable</Text>
            <Text style={s.videTexte}>
              Les ventes Habillement apparaissent ici après leur première synchronisation avec le serveur.
            </Text>
          </View>
        }
      />

      {choix ? (
        <ModaleEchange
          ligne={choix}
          onFermer={() => setChoix(null)}
          onTermine={async () => {
            setChoix(null);
            await charger();
          }}
        />
      ) : null}
    </View>
  );
}

function ModaleEchange({
  ligne,
  onFermer,
  onTermine,
}: {
  ligne: LigneEchangeable;
  onFermer: () => void;
  onTermine: () => Promise<void>;
}) {
  const [variantes, setVariantes] = useState<VarianteMobile[]>([]);
  const [nouvelle, setNouvelle] = useState<VarianteMobile | null>(null);
  const [quantite, setQuantite] = useState('1');
  const [note, setNote] = useState('');
  const [enCours, setEnCours] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void variantesDeRemplacement(ligne)
        .then(setVariantes)
        .catch(() => setVariantes([]));
    }, [ligne]),
  );

  const q = Number(quantite.replace(',', '.')) || 0;
  const valide = nouvelle !== null && q > 0 && q <= ligne.quantite;

  const confirmer = useCallback(async () => {
    if (!nouvelle || !valide) return;
    setEnCours(true);
    try {
      const resultat = await echangerVarianteLocal(ligne, nouvelle, q, note);
      const difference = resultat.differencePrix;
      Alert.alert(
        'Échange enregistré',
        difference === 0
          ? 'Aucune différence de prix.'
          : difference > 0
            ? `Le nouveau total augmente de ${difference.toLocaleString('fr-FR')} F.`
            : `Le nouveau total baisse de ${Math.abs(difference).toLocaleString('fr-FR')} F.`,
        [{ text: 'OK', onPress: () => void onTermine() }],
      );
    } catch (erreur) {
      Alert.alert(
        'Échange impossible',
        erreur instanceof Error ? erreur.message : String(erreur),
      );
    } finally {
      setEnCours(false);
    }
  }, [ligne, nouvelle, note, onTermine, q, valide]);

  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={s.page}>
        <View style={s.entete}>
          <Pressable onPress={onFermer} hitSlop={10}>
            <Icone nom="retour" taille={23} couleur={H.texte} />
          </Pressable>
          <View style={s.enteteTextes}>
            <Text style={s.titre}>Remplacer la variante</Text>
            <Text style={s.sousTitre}>{ligne.numeroVente} · {ligne.produitNom}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.modalContenu}>
          <View style={s.resume}>
            <Text style={s.resumeLabel}>Variante rapportée</Text>
            <Text style={s.resumeValeur}>{ligne.varianteNom}</Text>
            <Text style={s.resumeMeta}>
              {ligne.quantite} {ligne.unite} vendu(s) · ligne serveur #{ligne.ligneServeurId}
            </Text>
          </View>

          <Text style={s.sectionTitre}>Nouvelle taille / couleur</Text>
          <View style={s.options}>
            {variantes.map((variante) => {
              const actif = nouvelle?.id === variante.id;
              const couleur = variante.valeurs.find((v) => v.codeHex)?.codeHex ?? null;
              return (
                <Pressable
                  key={variante.idLocal}
                  onPress={() => setNouvelle(variante)}
                  style={[s.option, actif && s.optionActive]}
                >
                  {couleur ? (
                    <View style={[s.couleur, { backgroundColor: couleur }]} />
                  ) : null}
                  <View style={s.optionTextes}>
                    <Text style={[s.optionNom, actif && s.optionNomActive]}>
                      {libelleVariante(variante)}
                    </Text>
                    <Text style={[s.optionStock, actif && s.optionStockActive]}>
                      Stock {variante.stockActuel}
                    </Text>
                  </View>
                  {actif ? <Icone nom="coche" taille={16} couleur="#fff" /> : null}
                </Pressable>
              );
            })}
          </View>

          {variantes.length === 0 ? (
            <Text style={s.aucuneOption}>
              Aucune autre variante en stock pour ce modèle.
            </Text>
          ) : null}

          <Text style={s.sectionTitre}>Quantité à échanger</Text>
          <TextInput
            value={quantite}
            onChangeText={setQuantite}
            keyboardType="decimal-pad"
            style={s.champ}
          />
          <Text style={s.aide}>Maximum : {ligne.quantite} {ligne.unite}</Text>

          <Text style={s.sectionTitre}>Note</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Ex. client change L noir contre XL noir"
            placeholderTextColor={H.texteFaible}
            style={[s.champ, s.champNote]}
          />
        </ScrollView>

        <View style={s.pied}>
          <Bouton
            titre="Valider l’échange"
            onPress={() => void confirmer()}
            desactive={!valide}
            enCours={enCours}
            grand
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: H.fond },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    padding: espaces.m,
    backgroundColor: H.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: H.bordure,
  },
  enteteTextes: { flex: 1 },
  titre: { fontSize: 19, fontWeight: '900', color: H.texte },
  sousTitre: { marginTop: 2, fontSize: 11, color: H.texteFaible },
  recherche: {
    minHeight: 46,
    margin: espaces.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    paddingHorizontal: espaces.m,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: H.bordure,
    backgroundColor: H.surface,
  },
  rechercheTexte: { flex: 1, color: H.texte, fontSize: 13 },
  liste: { paddingHorizontal: espaces.m, paddingBottom: espaces.xxl, gap: espaces.s },
  carte: {
    padding: espaces.m,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: H.bordure,
    backgroundColor: H.surface,
  },
  carteHaut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  venteBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10, backgroundColor: H.primaireClair },
  venteBadgeTexte: { fontSize: 10, fontWeight: '900', color: H.primaire },
  date: { fontSize: 10, color: H.texteFaible },
  modele: { marginTop: 10, fontSize: 14, fontWeight: '900', color: H.texte },
  variante: { marginTop: 3, fontSize: 12, fontWeight: '800', color: H.primaire },
  carteBas: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  quantite: { flex: 1, fontSize: 11, color: H.texteFaible },
  prix: { fontSize: 12, fontWeight: '900', color: H.texte },
  vide: { alignItems: 'center', padding: espaces.xl },
  videTitre: { fontSize: 16, fontWeight: '900', color: H.texte },
  videTexte: { marginTop: 7, textAlign: 'center', lineHeight: 18, color: H.texteFaible },
  modalContenu: { padding: espaces.m, paddingBottom: 120 },
  resume: { padding: espaces.m, borderRadius: rayons.m, backgroundColor: H.primaireClair },
  resumeLabel: { fontSize: 10, fontWeight: '700', color: H.texteFaible },
  resumeValeur: { marginTop: 4, fontSize: 17, fontWeight: '900', color: H.texte },
  resumeMeta: { marginTop: 4, fontSize: 10, color: H.texteFaible },
  sectionTitre: { marginTop: espaces.l, marginBottom: espaces.s, fontSize: 13, fontWeight: '900', color: H.texte },
  options: { gap: espaces.s },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    minHeight: 58,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: H.bordure,
    backgroundColor: H.surface,
  },
  optionActive: { backgroundColor: H.primaire, borderColor: H.primaire },
  couleur: { width: 20, height: 20, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: H.bordure },
  optionTextes: { flex: 1 },
  optionNom: { fontSize: 13, fontWeight: '900', color: H.texte },
  optionNomActive: { color: '#fff' },
  optionStock: { marginTop: 2, fontSize: 10, color: H.texteFaible },
  optionStockActive: { color: '#dceaff' },
  aucuneOption: { color: H.texteFaible, fontSize: 12, fontStyle: 'italic' },
  champ: {
    minHeight: 48,
    paddingHorizontal: espaces.m,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: H.bordure,
    backgroundColor: H.surface,
    color: H.texte,
    fontSize: 14,
  },
  champNote: { minHeight: 88, paddingTop: espaces.m, textAlignVertical: 'top' },
  aide: { marginTop: 4, fontSize: 10, color: H.texteFaible },
  pied: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    padding: espaces.m,
    backgroundColor: H.surface,
    borderTopWidth: 1,
    borderTopColor: H.bordure,
  },
});
