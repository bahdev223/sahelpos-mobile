import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  FormulaireProduit,
  creerProduit,
  s as stylesProduit,
  type ProduitValide,
} from '../../produit/nouveau';
import {
  genererMatriceVariantesLocale,
  optionsMatriceProduit,
  type OptionMatriceMobile,
} from '../../../src/db/repositories/variante';
import { BandeauEtat, Bouton, couleurs, espaces, rayons } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';
import { useSession } from '../../_layout';
import { HABILLEMENT_MOBILE_THEME as H } from '../../../src/profile-ui/habillement/theme';

type Etape = 'modele' | 'variantes';

export default function NouveauModeleHabillement() {
  const router = useRouter();
  const { synchroniserMaintenant } = useSession();
  const [etape, setEtape] = useState<Etape>('modele');
  const [produitId, setProduitId] = useState<number | null>(null);
  const [nomModele, setNomModele] = useState('');
  const [dimensions, setDimensions] = useState<
    Awaited<ReturnType<typeof optionsMatriceProduit>>
  >([]);
  const [selection, setSelection] = useState<Record<string, Set<number>>>({});
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const chargerReferentiel = useCallback(async () => {
    const valeurs = await optionsMatriceProduit();
    setDimensions(valeurs);
    setSelection((actuel) => {
      const suivant: Record<string, Set<number>> = {};
      for (const dimension of valeurs) {
        suivant[dimension.code] = actuel[dimension.code] ?? new Set<number>();
      }
      return suivant;
    });
  }, []);

  useEffect(() => {
    void chargerReferentiel();
  }, [chargerReferentiel]);

  const creerModele = useCallback(async (valide: ProduitValide) => {
    const id = await creerProduit({
      ...valide,
      // Le stock Habillement appartient aux variantes. Le modèle parent ne
      // reçoit jamais un stock initial artificiel.
      stockInitial: 0,
    });
    setProduitId(id);
    setNomModele(valide.nom);
    setEtape('variantes');
    setMessage(null);
    await chargerReferentiel();
  }, [chargerReferentiel]);

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

  const selectionsCompletes = useMemo(() => {
    const sortie: Record<string, OptionMatriceMobile[]> = {};
    for (const dimension of dimensions) {
      const ids = selection[dimension.code] ?? new Set<number>();
      sortie[dimension.code] = dimension.valeurs.filter((v) => ids.has(v.valeurServeurId));
    }
    return sortie;
  }, [dimensions, selection]);

  const nbCombinaisons = useMemo(() => {
    const groupes = Object.values(selectionsCompletes).filter((g) => g.length > 0);
    if (groupes.length === 0) return 0;
    return groupes.reduce((total, groupe) => total * groupe.length, 1);
  }, [selectionsCompletes]);

  const generer = useCallback(async () => {
    if (!produitId || nbCombinaisons === 0) return;
    setEnCours(true);
    setMessage(null);
    try {
      const variantes = await genererMatriceVariantesLocale(produitId, selectionsCompletes);
      setMessage(`${variantes.length} variante(s) préparée(s).`);
      router.replace({ pathname: '/habillement/modele/[id]', params: { id: String(produitId) } });
    } catch (erreur) {
      setMessage(erreur instanceof Error ? erreur.message : 'La matrice n a pas pu être générée.');
    } finally {
      setEnCours(false);
    }
  }, [nbCombinaisons, produitId, router, selectionsCompletes]);

  const synchroniserReferentiel = useCallback(async () => {
    setEnCours(true);
    setMessage(null);
    try {
      await synchroniserMaintenant();
      await chargerReferentiel();
    } catch (erreur) {
      setMessage(erreur instanceof Error ? erreur.message : 'Synchronisation impossible.');
    } finally {
      setEnCours(false);
    }
  }, [chargerReferentiel, synchroniserMaintenant]);

  if (etape === 'modele') {
    return (
      <View style={stylesProduit.plein}>
        <BandeauEtat />
        <View style={s.entete}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Icone nom="retour" taille={23} couleur={H.texte} />
          </Pressable>
          <View style={s.enteteTextes}>
            <Text style={s.titre}>Nouveau modèle</Text>
            <Text style={s.sousTitre}>Étape 1 sur 2 · informations générales</Text>
          </View>
        </View>
        <FormulaireProduit
          saisieInitiale={{
            nom: '',
            categorie: '',
            codeBarre: '',
            prixAchat: '',
            prixUnitaire: '',
            uniteBase: 'Unite',
            stockMin: '0',
            stockInitial: '0',
            gestionStock: true,
            actif: true,
            cheminImage: null,
            sousUnites: [],
          }}
          creation
          libelleValider="Continuer vers les tailles et couleurs"
          onValider={creerModele}
          onAnnuler={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View style={s.page}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => setEtape('modele')} hitSlop={10}>
          <Icone nom="retour" taille={23} couleur={H.texte} />
        </Pressable>
        <View style={s.enteteTextes}>
          <Text style={s.titre}>Tailles & couleurs</Text>
          <Text style={s.sousTitre}>Étape 2 sur 2 · {nomModele}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.contenu}>
        <View style={s.info}>
          <Text style={s.infoTitre}>Construire la matrice</Text>
          <Text style={s.infoTexte}>
            Choisissez les valeurs disponibles. SahelPOS générera automatiquement toutes les
            combinaisons vendables du modèle.
          </Text>
        </View>

        {dimensions.length === 0 ? (
          <View style={s.vide}>
            <Text style={s.videTitre}>Référentiel non synchronisé</Text>
            <Text style={s.videTexte}>
              Synchronisez une fois pour récupérer les tailles et couleurs Habillement du serveur.
            </Text>
            <Bouton
              titre="Synchroniser le référentiel"
              onPress={() => void synchroniserReferentiel()}
              enCours={enCours}
              grand
            />
          </View>
        ) : (
          dimensions.map((dimension) => (
            <View key={dimension.code} style={s.carte}>
              <View style={s.carteEntete}>
                <Text style={s.dimension}>{dimension.nom}</Text>
                <Text style={s.compteur}>
                  {(selection[dimension.code] ?? new Set()).size} sélectionnée(s)
                </Text>
              </View>
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
                      {actif ? <Icone nom="coche" taille={15} couleur={'#FFFFFF'} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}

        {dimensions.length > 0 ? (
          <View style={s.resume}>
            <Text style={s.resumeTitre}>Matrice à créer</Text>
            <Text style={s.resumeValeur}>{nbCombinaisons} variante(s)</Text>
            <Text style={s.resumeTexte}>
              Exemple : 3 tailles × 4 couleurs = 12 variantes.
            </Text>
          </View>
        ) : null}

        {message ? <Text style={s.message}>{message}</Text> : null}
      </ScrollView>

      {dimensions.length > 0 ? (
        <View style={s.pied}>
          <Bouton
            titre={nbCombinaisons > 0 ? `Créer ${nbCombinaisons} variante(s)` : 'Choisissez les options'}
            onPress={() => void generer()}
            desactive={nbCombinaisons === 0}
            enCours={enCours}
            grand
          />
        </View>
      ) : null}
    </View>
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
  contenu: { padding: espaces.m, paddingBottom: 120, gap: espaces.m },
  info: {
    padding: espaces.m,
    borderRadius: rayons.l,
    backgroundColor: H.primaireClair,
  },
  infoTitre: { fontSize: 15, fontWeight: '900', color: H.primaireFonce },
  infoTexte: { marginTop: 5, fontSize: 12, lineHeight: 18, color: H.texte },
  carte: {
    padding: espaces.m,
    borderRadius: rayons.l,
    borderWidth: 1,
    borderColor: H.bordure,
    backgroundColor: H.surface,
  },
  carteEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dimension: { fontSize: 15, fontWeight: '900', color: H.texte },
  compteur: { fontSize: 10, fontWeight: '700', color: H.texteFaible },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s, marginTop: espaces.m },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: H.bordure,
    backgroundColor: H.fond,
  },
  optionActive: { backgroundColor: H.primaire, borderColor: H.primaire },
  optionTexte: { fontSize: 12, fontWeight: '800', color: H.texte },
  optionTexteActive: { color: '#FFFFFF' },
  couleur: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: H.bordure,
  },
  resume: {
    padding: espaces.l,
    borderRadius: rayons.l,
    backgroundColor: H.surface,
    borderWidth: 1,
    borderColor: H.bordure,
  },
  resumeTitre: { fontSize: 12, color: H.texteFaible, fontWeight: '700' },
  resumeValeur: { marginTop: 4, fontSize: 26, fontWeight: '900', color: H.primaire },
  resumeTexte: { marginTop: 4, fontSize: 11, color: H.texteFaible },
  vide: { gap: espaces.m, padding: espaces.l, alignItems: 'stretch' },
  videTitre: { textAlign: 'center', fontSize: 16, fontWeight: '900', color: H.texte },
  videTexte: { textAlign: 'center', fontSize: 12, lineHeight: 18, color: H.texteFaible },
  message: {
    padding: espaces.m,
    borderRadius: rayons.m,
    backgroundColor: H.surface,
    color: H.texte,
  },
  pied: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    padding: espaces.m,
    backgroundColor: H.surface,
    borderTopWidth: 1,
    borderTopColor: H.bordure,
  },
});
