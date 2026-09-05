/**
 * Entree, sortie et ajustement manuels du stock.
 *
 * Les trois tiennent dans un seul ecran parce que c'est une seule question -
 * "qu'est-ce qui a bouge et pourquoi ?" - et que separer les formulaires
 * revient a demander a l'utilisateur de choisir un ecran avant de savoir ce
 * qu'il veut dire.
 *
 * ENTREE ET SORTIE COMPTENT UN ECART, L'AJUSTEMENT COMPTE UN TOTAL
 * ---------------------------------------------------------------
 * On saisit "j'ai recu 3 sacs" ou "2 sacs sont tombes", mais "j'ai compte 47
 * kg". C'est la difference de nature entre les deux gestes : dans un cas on
 * connait le mouvement, dans l'autre on connait le resultat. L'ecran le dit
 * explicitement a chaque fois, parce qu'une confusion ici efface du stock.
 *
 * POURQUOI LE PRIX D'ACHAT DU PRODUIT N'EST PAS MODIFIE ICI
 * --------------------------------------------------------
 * Le prix saisi sur une entree est garde sur le MOUVEMENT, comme trace de ce
 * qu'a coute cette reception. Il ne remonte pas sur la fiche produit : un
 * reassort a prix casse changerait sinon silencieusement la valorisation de
 * tout le stock. Les prix se modifient sur la fiche, ou on les voit.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { C, analyserNombre, formaterFrancs, formaterQuantite, s } from '../produit/nouveau';
import {
  LIBELLE_SOURCE,
  MouvementImpossible,
  StockInsuffisant,
  arrondirQuantite,
  chargerProduitStock,
  chargerProduitsStock,
  convertirVersBase,
  decomposerStock,
  ecrireMouvement,
  analyserSousUnites,
  messageDe,
  normaliser,
  unitesDisponibles,
  type NatureMouvement,
  type ProduitStock,
  type SourceOperation,
  type UniteDisponible,
} from '../(tabs)/stock';
import { BandeauEtat, couleurs } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';

// --------------------------------------------------------------------------
// Motifs proposes selon la nature
// --------------------------------------------------------------------------

interface Motif {
  source: SourceOperation;
  libelle: string;
}

const MOTIFS: Record<NatureMouvement, Motif[]> = {
  ENTREE: [
    { source: 'ACHAT', libelle: 'Achat / reception' },
    { source: 'RETOUR', libelle: 'Retour client' },
    { source: 'CORRECTION', libelle: 'Correction' },
  ],
  SORTIE: [
    { source: 'CASSE', libelle: 'Casse ou perte' },
    { source: 'RETOUR', libelle: 'Retour fournisseur' },
    { source: 'CORRECTION', libelle: 'Correction' },
  ],
  AJUSTEMENT: [
    { source: 'INVENTAIRE', libelle: 'Comptage' },
    { source: 'CORRECTION', libelle: 'Correction' },
  ],
};

const NATURES_ONGLETS: { cle: NatureMouvement; libelle: string; aide: string }[] = [
  { cle: 'ENTREE', libelle: 'Entree', aide: 'Ce que vous avez recu, en plus du stock actuel.' },
  { cle: 'SORTIE', libelle: 'Sortie', aide: 'Ce qui est parti sans etre vendu : casse, perte, retour.' },
  {
    cle: 'AJUSTEMENT',
    libelle: 'Ajustement',
    aide: 'Ce que vous avez COMPTE en rayon. Le stock sera remis a ce total.',
  },
];

function estNature(valeur: string | undefined): valeur is NatureMouvement {
  return valeur === 'ENTREE' || valeur === 'SORTIE' || valeur === 'AJUSTEMENT';
}

// --------------------------------------------------------------------------
// Ecran
// --------------------------------------------------------------------------

type Phase = 'chargement' | 'erreur' | 'pret';

export default function Ajustement() {
  const router = useRouter();
  const parametres = useLocalSearchParams<{ produit?: string; nature?: string }>();

  const [phase, setPhase] = useState<Phase>('chargement');
  const [messageChargement, setMessageChargement] = useState('');
  const [catalogue, setCatalogue] = useState<ProduitStock[]>([]);
  const [produit, setProduit] = useState<ProduitStock | null>(null);

  const natureInitiale: NatureMouvement = estNature(parametres.nature)
    ? parametres.nature
    : 'ENTREE';
  const [nature, setNature] = useState<NatureMouvement>(natureInitiale);
  // Le motif par defaut suit la nature : arriver en "Sortie" avec un motif
  // d'achat selectionne n'afficherait aucune puce active, et enregistrerait une
  // sortie etiquetee "achat" dans le journal.
  const [source, setSource] = useState<SourceOperation>(MOTIFS[natureInitiale][0].source);
  const [uniteNom, setUniteNom] = useState<string | null>(null);
  const [quantiteTexte, setQuantiteTexte] = useState('');
  const [motifTexte, setMotifTexte] = useState('');
  const [referenceTexte, setReferenceTexte] = useState('');
  const [prixTexte, setPrixTexte] = useState('');

  const [recherche, setRecherche] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const identifiantDemande = Number(parametres.produit);

  const charger = useCallback(async () => {
    setPhase('chargement');
    try {
      const produits = await chargerProduitsStock();
      setCatalogue(produits);
      if (Number.isInteger(identifiantDemande) && identifiantDemande > 0) {
        const trouve =
          produits.find((p) => p.id === identifiantDemande) ??
          (await chargerProduitStock(identifiantDemande));
        if (trouve) {
          setProduit(trouve);
          setUniteNom(trouve.unite_base);
        }
      }
      setPhase('pret');
    } catch (probleme) {
      setMessageChargement(messageDe(probleme));
      setPhase('erreur');
    }
  }, [identifiantDemande]);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger]),
  );

  const unites = useMemo<UniteDisponible[]>(
    () => (produit ? unitesDisponibles(produit) : []),
    [produit],
  );

  const unite = useMemo<UniteDisponible | null>(() => {
    if (unites.length === 0) return null;
    return unites.find((u) => u.nom === uniteNom) ?? unites[0];
  }, [unites, uniteNom]);

  const quantite = analyserNombre(quantiteTexte);
  const prix = analyserNombre(prixTexte);

  /** Ce que l'enregistrement ferait au stock, calcule a chaque frappe. */
  const apercu = useMemo(() => {
    if (!produit || !unite || quantite === null || quantite < 0) return null;
    const quantiteBase = convertirVersBase(quantite, unite.facteur);
    const avant = produit.quantite_base;

    if (nature === 'ENTREE') {
      return { avant, apres: arrondirQuantite(avant + quantiteBase), ecart: quantiteBase };
    }
    if (nature === 'SORTIE') {
      return { avant, apres: arrondirQuantite(avant - quantiteBase), ecart: -quantiteBase };
    }
    return {
      avant,
      apres: quantiteBase,
      ecart: arrondirQuantite(quantiteBase - avant),
    };
  }, [nature, produit, quantite, unite]);

  const problemeSaisie = useMemo(() => {
    if (!produit) return 'Choisissez un produit.';
    if (quantiteTexte.trim() === '') return null;
    if (quantite === null) return 'Quantite illisible. Utilisez des chiffres, la virgule est acceptee.';
    if (quantite < 0) return 'La quantite ne peut pas etre negative.';
    if (nature !== 'AJUSTEMENT' && quantite === 0) return 'La quantite doit etre superieure a zero.';
    if (apercu && apercu.apres < 0) {
      return `Il n'y a que ${formaterQuantite(produit.quantite_base)} ${produit.unite_base} en stock.`;
    }
    return null;
  }, [apercu, nature, produit, quantite, quantiteTexte]);

  const peutEnregistrer =
    produit !== null &&
    unite !== null &&
    quantite !== null &&
    problemeSaisie === null &&
    (nature === 'AJUSTEMENT' ? quantite >= 0 : quantite > 0) &&
    !enregistrement;

  const changerNature = useCallback((nouvelle: NatureMouvement) => {
    setNature(nouvelle);
    setSource(MOTIFS[nouvelle][0].source);
    setErreur(null);
    setSucces(null);
  }, []);

  const choisirProduit = useCallback((choisi: ProduitStock) => {
    setProduit(choisi);
    setUniteNom(choisi.unite_base);
    setQuantiteTexte('');
    setRecherche('');
    setErreur(null);
    setSucces(null);
  }, []);

  const enregistrer = useCallback(async () => {
    if (!produit || !unite || quantite === null) return;
    setErreur(null);
    setSucces(null);
    setEnregistrement(true);
    try {
      const resultat = await ecrireMouvement({
        produitId: produit.id,
        nature,
        source,
        quantite,
        unite: unite.nom,
        facteur: unite.facteur,
        motif: motifTexte.trim() === '' ? LIBELLE_SOURCE[source] : motifTexte.trim(),
        reference: referenceTexte.trim() === '' ? null : referenceTexte.trim(),
        prixUnitaire: nature === 'ENTREE' && prix !== null && prix > 0 ? Math.round(prix) : null,
      });

      // Le produit est relu plutot que devine : c'est la base qui fait foi, et
      // une vente a pu passer entre l'ouverture de l'ecran et l'enregistrement.
      const rafraichi = await chargerProduitStock(produit.id);
      if (rafraichi) setProduit(rafraichi);

      setQuantiteTexte('');
      setMotifTexte('');
      setReferenceTexte('');
      setPrixTexte('');
      setSucces(
        `Stock de ${produit.nom} : ${formaterQuantite(resultat.stockAvant)} vers ` +
          `${formaterQuantite(resultat.stockApres)} ${produit.unite_base}.`,
      );
    } catch (probleme) {
      if (probleme instanceof StockInsuffisant || probleme instanceof MouvementImpossible) {
        setErreur(probleme.message);
      } else {
        setErreur(messageDe(probleme));
      }
    } finally {
      setEnregistrement(false);
    }
  }, [motifTexte, nature, prix, produit, quantite, referenceTexte, source, unite]);

  const confirmer = useCallback(() => {
    if (!produit || !unite || quantite === null || !apercu) return;
    const onglet = NATURES_ONGLETS.find((o) => o.cle === nature);
    Alert.alert(
      onglet ? onglet.libelle : 'Mouvement',
      `${produit.nom}\n\n` +
        `${formaterQuantite(quantite)} ${unite.nom}\n` +
        `Stock : ${formaterQuantite(apercu.avant)} vers ${formaterQuantite(apercu.apres)} ` +
        `${produit.unite_base}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Enregistrer', onPress: () => void enregistrer() },
      ],
    );
  }, [apercu, enregistrer, nature, produit, quantite, unite]);

  const suggestions = useMemo(() => {
    const terme = normaliser(recherche.trim());
    const suivis = catalogue.filter((p) => p.gestion_stock === 1);
    if (terme === '') return suivis.slice(0, 30);
    return suivis
      .filter(
        (p) =>
          normaliser(p.nom).includes(terme) ||
          normaliser(p.categorie ?? '').includes(terme) ||
          normaliser(p.code_barre ?? '').includes(terme),
      )
      .slice(0, 30);
  }, [catalogue, recherche]);

  // ------------------------------------------------------------------------

  if (phase === 'chargement') {
    return (
      <View style={s.plein}>
        <Entete onRetour={() => router.back()} />
        <View style={sl.centre}>
          <ActivityIndicator color={C.accent} />
          <Text style={sl.centreTexte}>Chargement...</Text>
        </View>
      </View>
    );
  }

  if (phase === 'erreur') {
    return (
      <View style={s.plein}>
        <Entete onRetour={() => router.back()} />
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>Le catalogue n&apos;a pas pu etre lu</Text>
          <Text style={sl.centreTexte}>{messageChargement}</Text>
          <Pressable style={s.boutonSecondaire} onPress={() => void charger()}>
            <Text style={s.boutonSecondaireTexte}>Reessayer</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!produit) {
    return (
      <View style={s.plein}>
        <Entete onRetour={() => router.back()} />
        <View style={sl.blocRecherche}>
          <Text style={s.libelle}>Sur quel produit ?</Text>
          <View style={s.zoneSaisie}>
            <TextInput
              style={s.saisie}
              value={recherche}
              onChangeText={setRecherche}
              placeholder="Nom, categorie ou code-barres"
              placeholderTextColor={C.texteFaible}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
          </View>
        </View>

        <ScrollView contentContainerStyle={sl.listeProduits} keyboardShouldPersistTaps="handled">
          {suggestions.length === 0 ? (
            <View style={sl.centre}>
              <Text style={sl.centreTitre}>Aucun produit suivi en stock</Text>
              <Text style={sl.centreTexte}>
                {catalogue.length === 0
                  ? 'Creez vos produits depuis le catalogue avant de saisir des mouvements.'
                  : "Aucun produit ne correspond, ou aucun n'a le suivi de stock active."}
              </Text>
            </View>
          ) : (
            suggestions.map((candidat) => {
              const sousUnites = analyserSousUnites(candidat.sous_unites);
              return (
                <Pressable
                  key={candidat.id}
                  style={sl.ligneProduit}
                  onPress={() => choisirProduit(candidat)}>
                  <View style={sl.ligneProduitTextes}>
                    <Text style={sl.ligneProduitNom} numberOfLines={2}>
                      {candidat.nom}
                    </Text>
                    <Text style={sl.ligneProduitMeta}>
                      {decomposerStock(candidat.quantite_base, candidat.unite_base, sousUnites)}
                    </Text>
                  </View>
                  <Text style={sl.ligneProduitFleche}>{'>'}</Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  const ongletActif = NATURES_ONGLETS.find((o) => o.cle === nature);
  const sousUnitesProduit = analyserSousUnites(produit.sous_unites);

  return (
    <View style={s.plein}>
      <Entete onRetour={() => router.back()} />

      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled">
        <View style={s.carte}>
          <View style={sl.produitEntete}>
            <View style={sl.produitTextes}>
              <Text style={sl.produitNom} numberOfLines={2}>
                {produit.nom}
              </Text>
              <Text style={sl.produitStock}>
                En stock : {decomposerStock(produit.quantite_base, produit.unite_base, sousUnitesProduit)}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setProduit(null);
                setSucces(null);
                setErreur(null);
              }}
              hitSlop={8}>
              <Text style={sl.changer}>Changer</Text>
            </Pressable>
          </View>
        </View>

        <View style={sl.onglets}>
          {NATURES_ONGLETS.map((onglet) => (
            <Pressable
              key={onglet.cle}
              style={[sl.onglet, nature === onglet.cle ? sl.ongletActif : null]}
              onPress={() => changerNature(onglet.cle)}>
              <Text
                style={[sl.ongletTexte, nature === onglet.cle ? sl.ongletTexteActif : null]}>
                {onglet.libelle}
              </Text>
            </Pressable>
          ))}
        </View>
        {ongletActif ? <Text style={s.explication}>{ongletActif.aide}</Text> : null}

        {succes ? (
          <View style={sl.banniereSucces}>
            <Text style={sl.banniereSuccesTexte}>{succes}</Text>
          </View>
        ) : null}
        {erreur ? (
          <View style={s.banniereErreur}>
            <Text style={s.banniereErreurTexte}>{erreur}</Text>
          </View>
        ) : null}

        <View style={s.carte}>
          <Text style={s.titreSection}>
            {nature === 'AJUSTEMENT' ? 'Quantite comptee' : 'Quantite'}
          </Text>

          {unites.length > 1 ? (
            <View style={s.champ}>
              <Text style={s.libelle}>Unite</Text>
              <View style={s.puces}>
                {unites.map((u) => (
                  <Pressable
                    key={u.nom}
                    style={[s.puce, unite?.nom === u.nom ? s.puceActive : null]}
                    onPress={() => setUniteNom(u.nom)}>
                    <Text
                      style={[s.puceTexte, unite?.nom === u.nom ? s.puceTexteActif : null]}>
                      {u.nom}
                      {u.facteur !== 1 ? ` (${formaterQuantite(u.facteur)} ${produit.unite_base})` : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={s.champ}>
            <Text style={s.libelle}>
              {nature === 'AJUSTEMENT'
                ? `Combien en avez-vous compte ? (en ${unite?.nom ?? produit.unite_base})`
                : `Combien ? (en ${unite?.nom ?? produit.unite_base})`}
            </Text>
            <View style={[s.zoneSaisie, problemeSaisie ? s.zoneSaisieErreur : null]}>
              <TextInput
                style={s.saisie}
                value={quantiteTexte}
                onChangeText={(valeur) => {
                  setQuantiteTexte(valeur);
                  setSucces(null);
                  setErreur(null);
                }}
                placeholder="0"
                placeholderTextColor={C.texteFaible}
                keyboardType="decimal-pad"
              />
              <Text style={s.suffixe}>{unite?.nom ?? produit.unite_base}</Text>
            </View>
            {problemeSaisie ? <Text style={s.messageErreur}>{problemeSaisie}</Text> : null}
          </View>

          {apercu && quantiteTexte.trim() !== '' && problemeSaisie === null ? (
            <View style={sl.apercu}>
              <Text style={sl.apercuTitre}>Apres enregistrement</Text>
              <Text style={sl.apercuLigne}>
                {formaterQuantite(apercu.avant)} vers{' '}
                <Text style={sl.apercuFort}>{formaterQuantite(apercu.apres)}</Text>{' '}
                {produit.unite_base}
              </Text>
              {nature === 'AJUSTEMENT' ? (
                <Text
                  style={[
                    sl.apercuEcart,
                    {
                      color:
                        apercu.ecart === 0 ? C.texteFaible : apercu.ecart > 0 ? C.vert : C.rouge,
                    },
                  ]}>
                  {apercu.ecart === 0
                    ? 'Aucun ecart : le stock etait juste.'
                    : apercu.ecart > 0
                      ? `Excedent de ${formaterQuantite(apercu.ecart)} ${produit.unite_base}`
                      : `Manquant de ${formaterQuantite(Math.abs(apercu.ecart))} ${produit.unite_base}`}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={s.carte}>
          <Text style={s.titreSection}>Motif</Text>
          <View style={s.puces}>
            {MOTIFS[nature].map((motif) => (
              <Pressable
                key={motif.source}
                style={[s.puce, source === motif.source ? s.puceActive : null]}
                onPress={() => setSource(motif.source)}>
                <Text
                  style={[s.puceTexte, source === motif.source ? s.puceTexteActif : null]}>
                  {motif.libelle}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={s.champ}>
            <Text style={s.libelle}>
              {nature === 'ENTREE' && source === 'ACHAT'
                ? 'Fournisseur ou origine (facultatif)'
                : 'Precision (facultatif)'}
            </Text>
            <View style={s.zoneSaisie}>
              <TextInput
                style={s.saisie}
                value={motifTexte}
                onChangeText={setMotifTexte}
                placeholder={
                  nature === 'ENTREE'
                    ? 'Grossiste du marche, livraison du matin...'
                    : nature === 'SORTIE'
                      ? 'Sac perce, produit abime...'
                      : 'Comptage du soir, erreur de saisie...'
                }
                placeholderTextColor={C.texteFaible}
              />
            </View>
            <Text style={s.explication}>
              Sans precision, le journal retiendra : {LIBELLE_SOURCE[source]}.
            </Text>
          </View>

          {nature === 'ENTREE' ? (
            <>
              <View style={s.champ}>
                <Text style={s.libelle}>Reference (facultatif)</Text>
                <View style={s.zoneSaisie}>
                  <TextInput
                    style={s.saisie}
                    value={referenceTexte}
                    onChangeText={setReferenceTexte}
                    placeholder="Bon de livraison, numero de facture"
                    placeholderTextColor={C.texteFaible}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <View style={s.champ}>
                <Text style={s.libelle}>
                  Prix d&apos;achat par {unite?.nom ?? produit.unite_base} (facultatif)
                </Text>
                <View style={s.zoneSaisie}>
                  <TextInput
                    style={s.saisie}
                    value={prixTexte}
                    onChangeText={setPrixTexte}
                    placeholder="0"
                    placeholderTextColor={C.texteFaible}
                    keyboardType="number-pad"
                  />
                  <Text style={s.suffixe}>F</Text>
                </View>
                <Text style={s.explication}>
                  Garde sur le mouvement comme trace de cette reception. Le prix d&apos;achat de
                  la fiche produit ({formaterFrancs(produit.prix_achat)} par {produit.unite_base})
                  n&apos;est pas modifie.
                </Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={s.actionsBas}>
          <Pressable style={s.boutonFantomeSombre} onPress={() => router.back()}>
            <Text style={s.boutonFantomeSombreTexte}>Terminer</Text>
          </Pressable>
          <Pressable
            style={[s.boutonPrincipal, !peutEnregistrer ? s.boutonDesactive : null]}
            disabled={!peutEnregistrer}
            onPress={confirmer}>
            {enregistrement ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={s.boutonPrincipalTexte}>Enregistrer</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Entete({ onRetour }: { onRetour: () => void }) {
  return (
    <>
      <BandeauEtat />
      <View style={s.entete}>
      <Pressable onPress={onRetour} style={s.retour}>
        <Icone nom="retour" taille={17} couleur={couleurs.primaire} />
        <Text style={s.retourTexte}>Retour</Text>
      </Pressable>
        <Text style={s.titre}>Mouvement de stock</Text>
      </View>
    </>
  );
}

const sl = StyleSheet.create({
  blocRecherche: { padding: 12, gap: 8, backgroundColor: C.carte },
  listeProduits: { padding: 12, gap: 8, flexGrow: 1 },
  ligneProduit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    padding: 12,
    minHeight: 56,
  },
  ligneProduitTextes: { flex: 1, gap: 2 },
  ligneProduitNom: { fontSize: 15, fontWeight: '600', color: C.texte },
  ligneProduitMeta: { fontSize: 12, color: C.texteFaible },
  ligneProduitFleche: { fontSize: 16, color: C.texteFaible, fontWeight: '700' },

  produitEntete: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  produitTextes: { flex: 1, gap: 3 },
  produitNom: { fontSize: 16, fontWeight: '700', color: C.texte },
  produitStock: { fontSize: 13, color: C.texteFaible },
  changer: { fontSize: 13, color: C.accent, fontWeight: '600' },

  onglets: {
    flexDirection: 'row',
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    overflow: 'hidden',
  },
  onglet: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  ongletActif: { backgroundColor: C.accent },
  ongletTexte: { fontSize: 14, fontWeight: '600', color: C.texte },
  ongletTexteActif: { color: '#FFFFFF', fontWeight: '700' },

  banniereSucces: {
    backgroundColor: couleurs.succesDouce,
    borderWidth: 1,
    borderColor: couleurs.succesBordure,
    borderRadius: 8,
    padding: 12,
  },
  banniereSuccesTexte: { color: couleurs.succesFonce, fontSize: 13, lineHeight: 18 },

  apercu: {
    backgroundColor: C.fond,
    borderRadius: 8,
    padding: 10,
    gap: 3,
  },
  apercuTitre: { fontSize: 11, color: C.texteFaible, fontWeight: '600' },
  apercuLigne: { fontSize: 15, color: C.texte },
  apercuFort: { fontWeight: '800' },
  apercuEcart: { fontSize: 13, fontWeight: '600' },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centreTitre: { fontSize: 16, fontWeight: '700', color: C.texte },
  centreTexte: { fontSize: 13, color: C.texteFaible, textAlign: 'center', lineHeight: 19 },
});
