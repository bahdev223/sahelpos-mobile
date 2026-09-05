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
  couleurs,
  espaces,
  formaterMontant,
  formaterQuantite,
  rayons,
} from '../../src/ui/components';
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
  const [montantPaye, setMontantPaye] = useState('');
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
      const paye = Number(montantPaye.replace(',', '.')) || 0;
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
    [articles, fournisseurId, reference, montantPaye, total, router],
  );

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Nouvel achat' }} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <Carte titre="Fournisseur">
          {fournisseurs.length === 0 ? (
            <Text style={styles.aide}>
              Aucun fournisseur enregistre. L achat peut etre saisi sans, mais
              vous ne pourrez pas suivre ce que vous lui devez.
            </Text>
          ) : (
            <View style={styles.puces}>
              {fournisseurs.map((f) => {
                const actif = f.id === fournisseurId;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setFournisseurId(actif ? null : f.id)}
                    style={[styles.puce, actif && styles.puceActive]}
                  >
                    <Text style={[styles.puceTexte, actif && styles.puceTexteActif]}>
                      {f.nom}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Champ
            valeur={reference}
            onChangeText={setReference}
            label="Numero de facture"
            placeholder="Facultatif"
          />
        </Carte>

        <Carte titre={`Produits (${articles.length})`}>
          {articles.length === 0 ? (
            <Text style={styles.aide}>Aucun produit dans cet achat.</Text>
          ) : (
            articles.map((a, i) => {
              const l = calculerLigneAchat(a);
              return (
                <View key={i} style={styles.article}>
                  <View style={styles.articleGauche}>
                    <Text style={styles.articleNom}>{a.libelle}</Text>
                    <Text style={styles.articleDetail}>
                      {formaterQuantite(a.quantite)} {a.unite} x{' '}
                      {formaterMontant(a.prixUnitaire)}
                      {a.facteur > 1 ? `  (${formaterQuantite(l.quantiteBase)} au total)` : ''}
                    </Text>
                  </View>
                  <View style={styles.articleDroite}>
                    <Text style={styles.articleTotal}>{formaterMontant(l.total)}</Text>
                    <Pressable
                      onPress={() =>
                        setArticles((liste) => liste.filter((_, j) => j !== i))
                      }
                      style={styles.retirer}
                    >
                      <Text style={styles.retirerTexte}>Retirer</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
          <Bouton
            titre="Ajouter un produit"
            onPress={() => setChoixOuvert(true)}
            variante="secondaire"
          />
        </Carte>

        <Carte titre="Reglement">
          <View style={styles.totalLigne}>
            <Text style={styles.totalLibelle}>Total de l achat</Text>
            <Montant valeur={total} taille="grand" />
          </View>
          <Champ
            valeur={montantPaye}
            onChangeText={setMontantPaye}
            label="Montant paye maintenant"
            placeholder="0"
            clavier="numeric"
            aide="Laissez a zero si vous payez plus tard : le reste devient une dette."
            alignerADroite
          />
        </Carte>

        <Bouton
          titre="Enregistrer et recevoir"
          sousTitre="La marchandise entre en stock immediatement"
          onPress={() => void enregistrer(true)}
          enCours={enCours}
          desactive={articles.length === 0}
          grand
        />
        <Bouton
          titre="Enregistrer sans recevoir"
          sousTitre="La marchandise n est pas encore arrivee"
          onPress={() => void enregistrer(false)}
          variante="secondaire"
          desactive={articles.length === 0 || enCours}
        />
      </ScrollView>

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
          {produitChoisi ? (
            <ScrollView contentContainerStyle={styles.contenu}>
              <Text style={styles.modalTitre}>{produitChoisi.nom}</Text>

              <Carte titre="Unite achetee">
                {unites.map((u) => {
                  const actif = u.nom === uniteChoisie?.nom;
                  return (
                    <Pressable
                      key={u.nom}
                      onPress={() => {
                        setUniteChoisie(u);
                        setPrix(String(u.prixIndicatif || ''));
                      }}
                      style={[styles.choix, actif && styles.choixActif]}
                    >
                      <View style={styles.choixTexte}>
                        <Text style={[styles.choixTitre, actif && styles.choixTitreActif]}>
                          {u.nom}
                        </Text>
                        {u.facteur > 1 ? (
                          <Text style={styles.choixDetail}>
                            1 {u.nom} = {formaterQuantite(u.facteur)} {produitChoisi.uniteBase}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </Carte>

              <Carte titre="Quantite et prix">
                <Champ
                  valeur={quantite}
                  onChangeText={setQuantite}
                  label={`Combien de ${uniteChoisie?.nom ?? 'unites'}`}
                  clavier="numeric"
                  alignerADroite
                />
                <Champ
                  valeur={prix}
                  onChangeText={setPrix}
                  label={`Prix paye pour 1 ${uniteChoisie?.nom ?? 'unite'}`}
                  clavier="numeric"
                  aide="Le prix tel qu il figure sur la facture du fournisseur."
                  alignerADroite
                />
              </Carte>

              <Bouton titre="Ajouter a l achat" onPress={ajouterArticle} grand />
              <Bouton
                titre="Choisir un autre produit"
                onPress={() => setProduitChoisi(null)}
                variante="secondaire"
              />
            </ScrollView>
          ) : (
            <>
              <View style={styles.entete}>
                <Champ
                  valeur={recherche}
                  onChangeText={setRecherche}
                  placeholder="Chercher un produit"
                  autoFocus
                />
              </View>
              <FlatList
                data={produits}
                keyExtractor={(p) => String(p.id)}
                contentContainerStyle={
                  produits.length === 0 ? styles.videConteneur : styles.liste
                }
                ListEmptyComponent={
                  <ListeVide
                    titre="Aucun produit"
                    message="Creez d abord vos produits dans le catalogue."
                  />
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => void ouvrirProduit(item)}
                    style={({ pressed }) => [styles.ligne, pressed && styles.lignePressee]}
                  >
                    <View style={styles.ligneGauche}>
                      <Text style={styles.nom}>{item.nom}</Text>
                      <Text style={styles.detail}>
                        stock {formaterQuantite(item.quantiteBase)} {item.uniteBase}
                      </Text>
                    </View>
                    <Text style={styles.prixAchat}>
                      {formaterMontant(item.prixAchat)}
                    </Text>
                  </Pressable>
                )}
              />
              <View style={styles.pied}>
                <Bouton
                  titre="Fermer"
                  onPress={() => setChoixOuvert(false)}
                  variante="secondaire"
                />
              </View>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.l, paddingBottom: espaces.xxl, gap: espaces.m },
  entete: { padding: espaces.l, paddingBottom: espaces.s },
  liste: { paddingHorizontal: espaces.l, paddingBottom: espaces.l },
  videConteneur: { flexGrow: 1, justifyContent: 'center' },
  aide: { fontSize: 13, color: couleurs.texteFaible, marginBottom: espaces.m },

  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s, marginBottom: espaces.m },
  puce: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: espaces.m,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  puceActive: { borderColor: couleurs.primaire, backgroundColor: couleurs.primaireDouce },
  puceTexte: { fontSize: 14, color: couleurs.texte },
  puceTexteActif: { color: couleurs.primaire, fontWeight: '600' },

  article: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: espaces.s,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  articleGauche: { flex: 1, marginRight: espaces.m },
  articleDroite: { alignItems: 'flex-end' },
  articleNom: { fontSize: 15, color: couleurs.texte },
  articleDetail: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  articleTotal: { fontSize: 15, fontWeight: '600', color: couleurs.texte },
  retirer: { minHeight: 32, justifyContent: 'center' },
  retirerTexte: { fontSize: 12, color: couleurs.danger, fontWeight: '600' },

  totalLigne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: espaces.m,
  },
  totalLibelle: { fontSize: 15, fontWeight: '600', color: couleurs.texte },

  modalTitre: { fontSize: 20, fontWeight: '700', color: couleurs.texte },
  choix: {
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
    marginBottom: espaces.s,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  choixActif: { borderColor: couleurs.primaire, backgroundColor: couleurs.primaireDouce },
  choixTexte: { flex: 1 },
  choixTitre: { fontSize: 16, fontWeight: '600', color: couleurs.texte },
  choixTitreActif: { color: couleurs.primaire },
  choixDetail: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.m,
    marginBottom: espaces.s,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  lignePressee: { opacity: 0.7 },
  ligneGauche: { flex: 1, marginRight: espaces.m },
  nom: { fontSize: 15, fontWeight: '600', color: couleurs.texte },
  detail: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  prixAchat: { fontSize: 14, fontWeight: '600', color: couleurs.texteFaible },

  pied: {
    padding: espaces.l,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
});
