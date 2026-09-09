/**
 * Saisie d'un achat fournisseur.
 *
 * Le prix d'achat est saisi pour l'UNITE ACHETEE (le carton, le sac), pas pour
 * l'unite de base. C'est ainsi que le commercant lit sa facture. La conversion
 * vers l'unite de base est faite par le service, au moment de la reception.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';

import {
  Bouton,
  Carte,
  Champ,
  ListeVide,
  Montant,
  Vignette,
  couleurs,
  espaces,
  formaterMontant,
  formaterQuantite,
  rayons,
} from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { listerProduits, listerSousUnites } from '../../src/db/repositories/produit';
import { listerFournisseurs, type Fournisseur } from '../../src/db/repositories/fournisseur';
import {
  calculerLigneAchat,
  enregistrerAchat,
  type ArticleAchat,
} from '../../src/services/achat';
import type { Produit, SousUnite } from '../../src/domain/types';

interface UniteChoisie {
  nom: string;
  facteur: number;
  prixIndicatif: number;
}

export default function EcranNouvelAchat() {
  const router = useRouter();

  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [fournisseurId, setFournisseurId] = useState<number | null>(null);
  const [reference, setReference] = useState('');
  const [articles, setArticles] = useState<ArticleAchat[]>([]);
  const [enCours, setEnCours] = useState(false);

  // --- selection d'un produit ---------------------------------------------
  const [choixOuvert, setChoixOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [produits, setProduits] = useState<Produit[]>([]);
  const [produitChoisi, setProduitChoisi] = useState<Produit | null>(null);
  const [unites, setUnites] = useState<UniteChoisie[]>([]);
  const [uniteChoisie, setUniteChoisie] = useState<UniteChoisie | null>(null);
  const [quantite, setQuantite] = useState('1');
  const [prix, setPrix] = useState('');

  useEffect(() => {
    listerFournisseurs().then(setFournisseurs).catch(() => setFournisseurs([]));
  }, []);

  useEffect(() => {
    if (!choixOuvert) return;
    const minuteur = setTimeout(() => {
      listerProduits({ recherche, limite: 60 })
        .then(setProduits)
        .catch(() => setProduits([]));
    }, 200);
    return () => clearTimeout(minuteur);
  }, [recherche, choixOuvert]);

  const total = useMemo(
    () => articles.reduce((s, a) => s + calculerLigneAchat(a).total, 0),
    [articles],
  );

  const ouvrirProduit = useCallback(async (p: Produit) => {
    setProduitChoisi(p);
    const sousUnites: SousUnite[] = await listerSousUnites(p.id);
    // L'unite de base d'abord, puis les conditionnements : on achete plus
    // souvent au carton, mais l'unite reste la reference.
    const liste: UniteChoisie[] = [
      { nom: p.uniteBase, facteur: 1, prixIndicatif: p.prixAchat },
      ...sousUnites.map((su) => ({
        nom: su.nom,
        facteur: su.facteur,
        prixIndicatif: Math.round(p.prixAchat * su.facteur),
      })),
    ];
    setUnites(liste);
    setUniteChoisie(liste[0]);
    setQuantite('1');
    setPrix(String(liste[0].prixIndicatif || ''));
  }, []);

  const ajouterArticle = useCallback(() => {
    if (!produitChoisi || !uniteChoisie) return;
    const q = Number(quantite.replace(',', '.'));
    const p = Number(prix.replace(',', '.'));
    if (!Number.isFinite(q) || q <= 0) {
      Alert.alert('Quantite invalide', 'Saisissez une quantite superieure a zero.');
      return;
    }
    if (!Number.isFinite(p) || p <= 0) {
      Alert.alert('Prix invalide', "Saisissez le prix paye pour une unite achetee.");
      return;
    }
    setArticles((liste) => [
      ...liste,
      {
        produitId: produitChoisi.id,
        libelle: produitChoisi.nom,
        unite: uniteChoisie.nom,
        facteur: uniteChoisie.facteur,
        quantite: q,
        prixUnitaire: p,
      },
    ]);
    setProduitChoisi(null);
    setChoixOuvert(false);
    setRecherche('');
  }, [produitChoisi, uniteChoisie, quantite, prix]);

  const enregistrer = useCallback(
    async (recevoirMaintenant: boolean) => {
      if (articles.length === 0) {
        Alert.alert('Achat vide', 'Ajoutez au moins un produit.');
        return;
      }
      const paye = 0;
      if (paye > total) {
        Alert.alert(
          'Montant trop eleve',
          `Vous ne pouvez pas payer plus que le total de ${formaterMontant(total)}.`,
        );
        return;
      }

      setEnCours(true);
      try {
        const r = await enregistrerAchat({
          fournisseurId,
          reference,
          articles,
          montantPaye: paye,
          recevoirMaintenant,
        });
        Alert.alert(
          recevoirMaintenant ? 'Achat recu' : 'Achat enregistre',
          recevoirMaintenant
            ? `${r.numero} : la marchandise est entree en stock.`
            : `${r.numero} : a recevoir quand la marchandise arrivera.`,
          [{ text: 'Voir', onPress: () => router.replace(`/achats/${r.achatId}`) }],
        );
      } catch (e) {
        Alert.alert(
          'Enregistrement impossible',
          e instanceof Error ? e.message : 'Erreur inconnue.',
        );
      } finally {
        setEnCours(false);
      }
    },
    [articles, fournisseurId, reference, total, router],
  );

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.barre}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.boutonIcone}>
          <Icone nom="retour" taille={23} couleur={couleurs.texte} />
        </Pressable>
        <Text style={styles.titrePage}>Nouvel achat</Text>
        <Text style={styles.badgeBrouillon}>Brouillon</Text>
      </View>

      <ScrollView contentContainerStyle={styles.contenu} showsVerticalScrollIndicator={false}>
        <View style={styles.etapes}>
          <Etape numero="1" titre="Infos" active />
          <View style={styles.traitEtape} />
          <Etape numero="2" titre="Articles" active={articles.length > 0} />
          <View style={styles.traitEtape} />
          <Etape numero="3" titre="Reglement" active={false} />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcone}>
            <Icone nom="fournisseurs" taille={28} couleur={couleurs.primaire} />
          </View>
          <View>
            <Text style={styles.heroTitre}>Achat de marchandise</Text>
            <Text style={styles.heroSousTitre}>Ajoutez les produits, puis enregistrez.</Text>
          </View>
        </View>

        <View style={styles.groupe}>
          <Text style={styles.label}>Fournisseur</Text>
          <View style={styles.fournisseurLigne}>
            <Pressable
              style={styles.select}
              onPress={() => {
                if (fournisseurs.length === 0) return;
                const index = fournisseurs.findIndex((f) => f.id === fournisseurId);
                const prochain = fournisseurs[(index + 1) % fournisseurs.length];
                setFournisseurId(prochain?.id ?? null);
              }}
            >
              <Icone nom="boutique" taille={24} couleur={couleurs.texteFaible} />
              <Text style={styles.selectTexte}>
                {fournisseurs.find((f) => f.id === fournisseurId)?.nom || '- Aucun -'}
              </Text>
              <Icone nom="chevron" taille={18} couleur={couleurs.texte} />
            </Pressable>
            <Pressable style={styles.boutonPlus} onPress={() => router.push('/fournisseurs')}>
              <Icone nom="plus" taille={25} couleur="#fff" />
            </Pressable>
          </View>
          <Text style={styles.info}>Identifiez la facture avant d'ajouter les produits.</Text>
          <Champ
            valeur={reference}
            onChangeText={setReference}
            label="Numero de facture"
            placeholder="Facultatif"
            style={styles.champCompact}
          />
        </View>

        <View style={styles.resumeDeux}>
          <View style={[styles.resumeCarte, styles.resumeVert]}>
            <View style={styles.resumeIconeVert}>
              <Icone nom="caisse" taille={24} couleur="#16a34a" />
            </View>
            <Text style={styles.resumeLibelle}>Total de l'achat</Text>
            <Text style={styles.resumeValeur}>{formaterMontant(total, 'FCFA')}</Text>
          </View>
          <View style={[styles.resumeCarte, styles.resumeRouge]}>
            <View style={styles.resumeIconeRouge}>
              <Icone nom="argent" taille={24} couleur={couleurs.danger} />
            </View>
            <Text style={styles.resumeLibelle}>Reste a payer</Text>
            <Text style={[styles.resumeValeur, styles.resumeDanger]}>{formaterMontant(0, 'FCFA')}</Text>
          </View>
        </View>

        <View style={styles.optionBleue}>
          <View style={styles.optionIcone}>
            <Icone nom="stock" taille={25} couleur={couleurs.primaire} />
          </View>
          <View style={styles.optionTexte}>
            <Text style={styles.optionTitre}>Marchandise arrivee</Text>
            <Text style={styles.optionSousTitre}>Entree en stock immediate.</Text>
          </View>
          <View style={styles.switchActif}>
            <View style={styles.switchBoule} />
          </View>
        </View>

        <View style={styles.sectionArticles}>
          <View style={styles.sectionTitreLigne}>
            <View style={styles.sectionTitreGauche}>
              <View style={styles.sectionIcone}>
                <Icone nom="menu" taille={20} couleur={couleurs.texte} />
              </View>
              <Text style={styles.sectionTitre}>Articles ({articles.length})</Text>
            </View>
            <Pressable style={styles.boutonAjouter} onPress={() => setChoixOuvert(true)}>
              <Icone nom="plus" taille={22} couleur="#fff" />
              <Text style={styles.boutonAjouterTexte}>Ajouter</Text>
            </Pressable>
          </View>

          {articles.length === 0 ? (
            <View style={styles.videArticle}>
              <Icone nom="stock" taille={48} couleur="#9aa8ba" />
              <Text style={styles.videTitre}>Aucun article ajoute</Text>
              <Text style={styles.videTexte}>Cliquez sur "Ajouter" pour commencer.</Text>
            </View>
          ) : (
            articles.map((a, i) => {
              const ligne = calculerLigneAchat(a);
              return (
                <View key={`${a.produitId}-${i}`} style={styles.article}>
                  <View style={styles.articleGauche}>
                    <Text style={styles.articleNom}>{a.libelle}</Text>
                    <Text style={styles.articleDetail}>
                      {formaterQuantite(a.quantite)} {a.unite} x {formaterMontant(a.prixUnitaire, 'FCFA')}
                    </Text>
                  </View>
                  <View style={styles.articleDroite}>
                    <Text style={styles.articleTotal}>{formaterMontant(ligne.total, 'FCFA')}</Text>
                    <Pressable onPress={() => setArticles((liste) => liste.filter((_, j) => j !== i))}>
                      <Text style={styles.retirerTexte}>Retirer</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={styles.actionsBas}>
        <Bouton titre="Annuler" onPress={() => router.back()} variante="secondaire" style={styles.actionSecondaire} />
        <Bouton
          titre="Suivant"
          onPress={() => void enregistrer(true)}
          enCours={enCours}
          desactive={articles.length === 0}
          style={styles.actionPrimaire}
        />
      </View>

      {/* Choix du produit puis de l'unite et du prix. */}
      <Modal
        visible={choixOuvert}
        animationType="slide"
        onRequestClose={() => {
          setChoixOuvert(false);
          setProduitChoisi(null);
        }}
      >
        <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
          <View style={styles.barre}>
            <Pressable
              onPress={() => {
                setChoixOuvert(false);
                setProduitChoisi(null);
              }}
              hitSlop={10}
              style={styles.boutonIcone}
            >
              <Icone nom="retour" taille={23} couleur={couleurs.texte} />
            </Pressable>
            <Text style={styles.titrePage}>Ajouter un article</Text>
          </View>

          <ScrollView contentContainerStyle={styles.contenuModal} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Produit <Text style={styles.requis}>*</Text></Text>
            <View style={styles.rechercheBoite}>
              <Icone nom="recherche" taille={24} couleur={couleurs.texteFaible} />
              <TextInput
                value={recherche}
                onChangeText={(valeur) => {
                  setRecherche(valeur);
                  setProduitChoisi(null);
                }}
                placeholder="Rechercher un produit..."
                placeholderTextColor={couleurs.texteFaible}
                autoFocus
                style={styles.rechercheInput}
              />
              <Icone nom="chevron" taille={18} couleur={couleurs.texte} />
            </View>

            {produitChoisi ? (
              <View style={styles.produitSelectionne}>
                <Vignette chemin={produitChoisi.cheminImage} nom={produitChoisi.nom} taille={82} />
                <View style={styles.produitSelectionneInfos}>
                  <Text style={styles.produitSelectionneNom}>{produitChoisi.nom}</Text>
                  <Text style={styles.detailModal}>Stock actuel : {formaterQuantite(produitChoisi.quantiteBase)}</Text>
                  <Text style={styles.detailModal}>Code : {produitChoisi.codeBarre || '-'}</Text>
                </View>
              </View>
            ) : (
              <FlatList
                data={produits.slice(0, 6)}
                keyExtractor={(p) => String(p.id)}
                scrollEnabled={false}
                contentContainerStyle={produits.length === 0 ? styles.videRecherche : styles.listeProduits}
                ListEmptyComponent={
                  <ListeVide titre="Aucun produit" message="Creez d'abord vos produits dans le catalogue." />
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => void ouvrirProduit(item)}
                    style={({ pressed }) => [styles.produitLigne, pressed && styles.lignePressee]}
                  >
                    <Vignette chemin={item.cheminImage} nom={item.nom} taille={62} />
                    <View style={styles.produitSelectionneInfos}>
                      <Text style={styles.produitSelectionneNom}>{item.nom}</Text>
                      <Text style={styles.detailModal}>
                        Stock actuel : {formaterQuantite(item.quantiteBase)} {item.uniteBase}
                      </Text>
                      <Text style={styles.detailModal}>Code : {item.codeBarre || '-'}</Text>
                    </View>
                  </Pressable>
                )}
              />
            )}

            <Text style={styles.label}>Unite <Text style={styles.requis}>*</Text></Text>
            <Pressable
              style={styles.selectGrand}
              onPress={() => {
                if (unites.length === 0) return;
                const index = unites.findIndex((u) => u.nom === uniteChoisie?.nom);
                const prochain = unites[(index + 1) % unites.length];
                setUniteChoisie(prochain ?? null);
                setPrix(String(prochain?.prixIndicatif || ''));
              }}
            >
              <Text style={styles.selectGrandTexte}>{uniteChoisie?.nom || 'Unite'}</Text>
              <Icone nom="chevron" taille={18} couleur={couleurs.texte} />
            </Pressable>

            <View style={styles.champsDeux}>
              <Champ
                valeur={quantite}
                onChangeText={setQuantite}
                label="Quantite *"
                clavier="numeric"
                style={styles.champDeux}
              />
              <Champ
                valeur={prix}
                onChangeText={setPrix}
                label="Prix unitaire (FCFA) *"
                clavier="numeric"
                aide="Prix du carton, pas de la piece."
                style={styles.champDeux}
              />
            </View>

            <View style={styles.totalModal}>
              <Text style={styles.totalModalTitre}>Total ligne</Text>
              <Text style={styles.totalModalValeur}>
                {formaterMontant(
                  (Number(quantite.replace(',', '.')) || 0) * (Number(prix.replace(',', '.')) || 0),
                  'FCFA',
                )}
              </Text>
            </View>

            <Text style={styles.label}>Informations supplementaires (optionnel)</Text>
            <View style={styles.note}>
              <Icone nom="document" taille={24} couleur={couleurs.texteFaible} />
              <Text style={styles.notePlaceholder}>Note sur cet article...</Text>
            </View>

            <Pressable
              style={[styles.boutonModal, !produitChoisi && styles.boutonModalInactif]}
              disabled={!produitChoisi}
              onPress={ajouterArticle}
            >
              <Icone nom="plus" taille={21} couleur="#fff" />
              <Text style={styles.boutonModalTexte}>Ajouter cet article</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Etape({ numero, titre, active }: { numero: string; titre: string; active: boolean }) {
  return (
    <View style={styles.etape}>
      <View style={[styles.etapeBulle, active && styles.etapeBulleActive]}>
        <Text style={[styles.etapeNumero, active && styles.etapeNumeroActive]}>{numero}</Text>
      </View>
      <Text style={[styles.etapeTitre, active && styles.etapeTitreActive]}>{titre}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fbfdff' },
  barre: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#e5ebf3',
    backgroundColor: '#fff',
  },
  boutonIcone: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titrePage: { flex: 1, fontSize: 24, fontWeight: '900', color: '#07152f' },
  badgeBrouillon: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#eaf3ff',
    color: couleurs.primaire,
    fontSize: 14,
    fontWeight: '800',
  },
  contenu: { padding: 18, paddingBottom: 112, gap: 18 },
  contenuModal: { padding: 22, paddingBottom: 36, gap: 18 },
  etapes: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 4,
  },
  etape: { alignItems: 'center', width: 68 },
  etapeBulle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d8e0eb',
  },
  etapeBulleActive: { backgroundColor: couleurs.primaire },
  etapeNumero: { color: '#64748b', fontWeight: '900', fontSize: 15 },
  etapeNumeroActive: { color: '#fff' },
  etapeTitre: { marginTop: 7, color: couleurs.texteFaible, fontWeight: '700', fontSize: 13 },
  etapeTitreActive: { color: '#07152f' },
  traitEtape: {
    width: 70,
    height: 2,
    borderRadius: 999,
    marginTop: 17,
    backgroundColor: '#dde5ee',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 94,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#eef6ff',
  },
  heroIcone: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe',
  },
  heroTitre: { fontSize: 20, fontWeight: '900', color: '#07152f' },
  heroSousTitre: { marginTop: 4, fontSize: 15, color: couleurs.texteFaible },
  groupe: { gap: 8 },
  label: { fontSize: 16, fontWeight: '800', color: '#334155' },
  requis: { color: couleurs.danger },
  fournisseurLigne: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  select: {
    flex: 1,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#d7e0ea',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  selectTexte: { flex: 1, color: '#07152f', fontSize: 18, fontWeight: '700' },
  boutonPlus: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.primaire,
  },
  info: { color: couleurs.texteFaible, fontSize: 13 },
  champCompact: { marginBottom: 0 },
  resumeDeux: { flexDirection: 'row', gap: 18 },
  resumeCarte: {
    flex: 1,
    minHeight: 150,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e6edf5',
  },
  resumeVert: { backgroundColor: '#f1fff8' },
  resumeRouge: { backgroundColor: '#fff6f7' },
  resumeIconeVert: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcfce7',
  },
  resumeIconeRouge: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffe3e8',
  },
  resumeLibelle: { marginTop: 16, color: couleurs.texteFaible, fontSize: 15, fontWeight: '800' },
  resumeValeur: { marginTop: 8, color: '#07152f', fontSize: 24, fontWeight: '900' },
  resumeDanger: { color: couleurs.danger },
  optionBleue: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#eef6ff',
  },
  optionIcone: {
    width: 50,
    height: 50,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe',
  },
  optionTexte: { flex: 1 },
  optionTitre: { color: '#07152f', fontSize: 18, fontWeight: '900' },
  optionSousTitre: { color: couleurs.texteFaible, fontSize: 14, marginTop: 3 },
  switchActif: {
    width: 58,
    height: 34,
    borderRadius: 999,
    padding: 3,
    alignItems: 'flex-end',
    backgroundColor: couleurs.primaire,
  },
  switchBoule: { width: 28, height: 28, borderRadius: 999, backgroundColor: '#fff' },
  sectionArticles: { gap: 14 },
  sectionTitreLigne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitreGauche: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcone: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  sectionTitre: { color: '#07152f', fontSize: 22, fontWeight: '900' },
  boutonAjouter: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: couleurs.primaire,
  },
  boutonAjouterTexte: { color: '#fff', fontSize: 17, fontWeight: '900' },
  videArticle: {
    minHeight: 176,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    backgroundColor: '#fff',
  },
  videTitre: { marginTop: 14, fontSize: 16, fontWeight: '900', color: couleurs.texteFaible },
  videTexte: { marginTop: 8, fontSize: 14, color: couleurs.texteFaible, textAlign: 'center' },
  article: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    backgroundColor: '#fff',
  },
  articleGauche: { flex: 1 },
  articleDroite: { alignItems: 'flex-end', gap: 8 },
  articleNom: { fontSize: 16, color: '#07152f', fontWeight: '900' },
  articleDetail: { fontSize: 13, color: couleurs.texteFaible, marginTop: 4 },
  articleTotal: { fontSize: 16, fontWeight: '900', color: couleurs.primaire },
  retirerTexte: { fontSize: 13, color: couleurs.danger, fontWeight: '800' },
  actionsBas: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 14,
    padding: 18,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5ebf3',
    backgroundColor: '#fff',
  },
  actionSecondaire: { flex: 0.8 },
  actionPrimaire: { flex: 1.2 },
  rechercheBoite: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#d7e0ea',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  rechercheInput: { flex: 1, minHeight: 58, color: '#07152f', fontSize: 18 },
  produitSelectionne: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    backgroundColor: '#fff',
  },
  produitSelectionneInfos: { flex: 1, gap: 3 },
  produitSelectionneNom: { fontSize: 18, fontWeight: '900', color: '#07152f' },
  detailModal: { fontSize: 15, color: couleurs.texteFaible, marginTop: 2 },
  listeProduits: { gap: 10 },
  videRecherche: { minHeight: 180, justifyContent: 'center' },
  produitLigne: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    backgroundColor: '#fff',
  },
  lignePressee: { opacity: 0.7 },
  selectGrand: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#d7e0ea',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  selectGrandTexte: { color: '#07152f', fontSize: 18, fontWeight: '700' },
  champsDeux: { flexDirection: 'row', gap: 18 },
  champDeux: { flex: 1, marginBottom: 0 },
  totalModal: {
    minHeight: 116,
    justifyContent: 'center',
    padding: 20,
    borderRadius: 14,
    backgroundColor: '#eaf4ff',
  },
  totalModalTitre: { fontSize: 18, fontWeight: '900', color: '#07152f' },
  totalModalValeur: { marginTop: 10, fontSize: 32, fontWeight: '900', color: couleurs.primaire },
  note: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d7e0ea',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  notePlaceholder: { color: couleurs.texteFaible, fontSize: 17 },
  boutonModal: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 12,
    backgroundColor: couleurs.primaire,
  },
  boutonModalInactif: { opacity: 0.45 },
  boutonModalTexte: { color: '#fff', fontSize: 20, fontWeight: '900' },
});
