import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { obtenirProduit } from '../../../src/db/repositories/produit';
import {
  changerEtatVariante,
  genererMatriceVariantesLocale,
  libelleVariante,
  listerVariantesProduit,
  optionsMatriceProduit,
  type OptionMatriceMobile,
  type VarianteMobile,
} from '../../../src/db/repositories/variante';
import type { Produit } from '../../../src/domain/types';
import { BandeauEtat, Bouton, couleurs, espaces, rayons } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';

export default function GererVariantesHabillement() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const produitId = Number(id);

  const [produit, setProduit] = useState<Produit | null>(null);
  const [variantes, setVariantes] = useState<VarianteMobile[]>([]);
  const [dimensions, setDimensions] = useState<Awaited<ReturnType<typeof optionsMatriceProduit>>>([]);
  const [selection, setSelection] = useState<Record<string, Set<number>>>({});
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!Number.isInteger(produitId) || produitId <= 0) return;
    const [p, v, d] = await Promise.all([
      obtenirProduit(produitId),
      listerVariantesProduit(produitId, false),
      optionsMatriceProduit(),
    ]);
    setProduit(p);
    setVariantes(v);
    setDimensions(d);
    setSelection((actuel) => {
      const suivant: Record<string, Set<number>> = {};
      for (const dimension of d) {
        suivant[dimension.code] = actuel[dimension.code] ?? new Set<number>();
      }
      return suivant;
    });
  }, [produitId]);

  useFocusEffect(useCallback(() => { void charger(); }, [charger]));

  const selections = useMemo(() => {
    const sortie: Record<string, OptionMatriceMobile[]> = {};
    for (const dimension of dimensions) {
      const ids = selection[dimension.code] ?? new Set<number>();
      sortie[dimension.code] = dimension.valeurs.filter((v) => ids.has(v.valeurServeurId));
    }
    return sortie;
  }, [dimensions, selection]);

  const nb = useMemo(() => {
    const groupes = Object.values(selections).filter((g) => g.length > 0);
    return groupes.length === 0 ? 0 : groupes.reduce((t, g) => t * g.length, 1);
  }, [selections]);

  const basculer = useCallback((dimensionCode: string, option: OptionMatriceMobile) => {
    setSelection((actuel) => {
      const suivant = { ...actuel };
      const valeurs = new Set(suivant[dimensionCode] ?? []);
      if (valeurs.has(option.valeurServeurId)) valeurs.delete(option.valeurServeurId);
      else valeurs.add(option.valeurServeurId);
      suivant[dimensionCode] = valeurs;
      return suivant;
    });
  }, []);

  const generer = useCallback(async () => {
    if (!produit || nb === 0) return;
    setEnCours(true);
    try {
      const crees = await genererMatriceVariantesLocale(produit.id, selections);
      setAjoutOuvert(false);
      setSelection({});
      await charger();
      Alert.alert('Variantes mises à jour', `${crees.length} combinaison(s) disponible(s).`);
    } catch (erreur) {
      Alert.alert('Impossible', erreur instanceof Error ? erreur.message : String(erreur));
    } finally {
      setEnCours(false);
    }
  }, [charger, nb, produit, selections]);

  const changerEtat = useCallback(async (variante: VarianteMobile) => {
    setEnCours(true);
    try {
      await changerEtatVariante(variante.id, !variante.actif);
      await charger();
    } catch (erreur) {
      Alert.alert('Impossible', erreur instanceof Error ? erreur.message : String(erreur));
    } finally {
      setEnCours(false);
    }
  }, [charger]);

  if (!produit) {
    return (
      <View style={s.page}>
        <BandeauEtat />
        <View style={s.vide}><Text style={s.videTexte}>Chargement du modèle...</Text></View>
      </View>
    );
  }

  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icone nom="retour" taille={23} couleur={couleurs.texte} />
        </Pressable>
        <View style={s.enteteTextes}>
          <Text style={s.titre}>Gérer les variantes</Text>
          <Text style={s.sousTitre}>{produit.nom}</Text>
        </View>
        <Pressable style={s.action} onPress={() => setAjoutOuvert((v) => !v)}>
          <Icone nom={ajoutOuvert ? 'fermer' : 'plus'} taille={19} couleur={couleurs.primaire} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.contenu}>
        {ajoutOuvert ? (
          <View style={s.blocAjout}>
            <Text style={s.blocTitre}>Ajouter des combinaisons</Text>
            <Text style={s.blocSousTitre}>
              Sélectionnez les tailles et couleurs à rendre disponibles pour ce modèle.
            </Text>

            {dimensions.map((dimension) => (
              <View key={dimension.code} style={s.dimensionBloc}>
                <Text style={s.dimensionTitre}>{dimension.nom}</Text>
                <View style={s.options}>
                  {dimension.valeurs.map((option) => {
                    const actif = selection[dimension.code]?.has(option.valeurServeurId) ?? false;
                    return (
                      <Pressable
                        key={option.valeurServeurId}
                        onPress={() => basculer(dimension.code, option)}
                        style={[s.option, actif && s.optionActive]}
                      >
                        {option.codeHex ? (
                          <View style={[s.couleur, { backgroundColor: option.codeHex }]} />
                        ) : null}
                        <Text style={[s.optionTexte, actif && s.optionTexteActive]}>
                          {option.nom}
                        </Text>
                        {actif ? <Icone nom="coche" taille={14} couleur="#fff" /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <View style={s.genererResume}>
              <Text style={s.genererTexte}>{nb} combinaison(s)</Text>
              <Bouton
                titre="Générer"
                onPress={() => void generer()}
                desactive={nb === 0}
                enCours={enCours}
              />
            </View>
          </View>
        ) : null}

        <View style={s.sectionEntete}>
          <Text style={s.sectionTitre}>Variantes du modèle</Text>
          <Text style={s.sectionCompteur}>{variantes.length}</Text>
        </View>

        {variantes.map((variante) => (
          <View key={variante.idLocal} style={[s.variante, !variante.actif && s.varianteInactive]}>
            <View style={s.varianteInfos}>
              <View style={s.varianteNomLigne}>
                {variante.valeurs.find((v) => v.codeHex)?.codeHex ? (
                  <View
                    style={[
                      s.couleur,
                      { backgroundColor: variante.valeurs.find((v) => v.codeHex)?.codeHex ?? undefined },
                    ]}
                  />
                ) : null}
                <Text style={s.varianteNom}>{libelleVariante(variante)}</Text>
              </View>
              <Text style={s.varianteMeta}>
                {variante.sku} · stock {variante.stockActuel}
              </Text>
              <Text style={s.varianteEtat}>
                {variante.actif ? 'Active en caisse' : 'Désactivée'}
              </Text>
            </View>
            <Pressable
              onPress={() => void changerEtat(variante)}
              style={[s.boutonEtat, variante.actif && s.boutonEtatDanger]}
              disabled={enCours}
            >
              <Text style={[s.boutonEtatTexte, variante.actif && s.boutonEtatTexteDanger]}>
                {variante.actif ? 'Désactiver' : 'Réactiver'}
              </Text>
            </Pressable>
          </View>
        ))}

        {variantes.length === 0 ? (
          <View style={s.vide}>
            <Text style={s.videTitre}>Aucune variante</Text>
            <Text style={s.videTexte}>Ajoutez des tailles et couleurs avec le bouton +.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  entete: {
    flexDirection: 'row', alignItems: 'center', gap: espaces.m,
    padding: espaces.m, backgroundColor: couleurs.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: couleurs.bordure,
  },
  enteteTextes: { flex: 1 },
  titre: { fontSize: 19, fontWeight: '900', color: couleurs.texte },
  sousTitre: { marginTop: 2, fontSize: 11, color: couleurs.texteFaible },
  action: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: rayons.m, borderWidth: 1, borderColor: couleurs.bordure,
  },
  contenu: { padding: espaces.m, paddingBottom: espaces.xxl },
  blocAjout: {
    padding: espaces.m, borderRadius: rayons.l, backgroundColor: couleurs.surface,
    borderWidth: 1, borderColor: couleurs.bordure,
  },
  blocTitre: { fontSize: 15, fontWeight: '900', color: couleurs.texte },
  blocSousTitre: { marginTop: 4, fontSize: 11, lineHeight: 17, color: couleurs.texteFaible },
  dimensionBloc: { marginTop: espaces.l },
  dimensionTitre: { fontSize: 13, fontWeight: '900', color: couleurs.texte },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s, marginTop: espaces.s },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 11, paddingVertical: 8, borderRadius: 18,
    borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.fond,
  },
  optionActive: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  optionTexte: { fontSize: 11, fontWeight: '800', color: couleurs.texte },
  optionTexteActive: { color: '#fff' },
  couleur: { width: 17, height: 17, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: couleurs.bordure },
  genererResume: {
    marginTop: espaces.l, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: espaces.m,
  },
  genererTexte: { fontSize: 13, fontWeight: '900', color: couleurs.primaire },
  sectionEntete: {
    marginTop: espaces.xl, marginBottom: espaces.s, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  sectionTitre: { fontSize: 15, fontWeight: '900', color: couleurs.texte },
  sectionCompteur: { fontSize: 12, fontWeight: '900', color: couleurs.primaire },
  variante: {
    flexDirection: 'row', alignItems: 'center', gap: espaces.m,
    padding: espaces.m, marginBottom: espaces.s, borderRadius: rayons.m,
    backgroundColor: couleurs.surface, borderWidth: 1, borderColor: couleurs.bordure,
  },
  varianteInactive: { opacity: 0.62 },
  varianteInfos: { flex: 1, minWidth: 0 },
  varianteNomLigne: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  varianteNom: { flex: 1, fontSize: 13, fontWeight: '900', color: couleurs.texte },
  varianteMeta: { marginTop: 3, fontSize: 10, color: couleurs.texteFaible },
  varianteEtat: { marginTop: 4, fontSize: 10, fontWeight: '800', color: couleurs.primaire },
  boutonEtat: {
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: rayons.s,
    backgroundColor: couleurs.primaireDouce,
  },
  boutonEtatDanger: { backgroundColor: couleurs.dangerDouce },
  boutonEtatTexte: { fontSize: 10, fontWeight: '900', color: couleurs.primaire },
  boutonEtatTexteDanger: { color: couleurs.danger },
  vide: { padding: espaces.xl, alignItems: 'center' },
  videTitre: { fontSize: 16, fontWeight: '900', color: couleurs.texte },
  videTexte: { marginTop: 7, textAlign: 'center', color: couleurs.texteFaible },
});
