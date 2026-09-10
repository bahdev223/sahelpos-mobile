/** Parcours mobile de creation d'un achat : informations, articles, reglement. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';

import { ListeVide, Vignette, couleurs, formaterMontant, formaterQuantite } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { listerProduits, listerSousUnites } from '../../src/db/repositories/produit';
import { listerFournisseurs, type Fournisseur } from '../../src/db/repositories/fournisseur';
import { useSession } from '../_layout';
import { calculerLigneAchat, enregistrerAchat, type ArticleAchat, type ModePaiementAchat } from '../../src/services/achat';
import type { Produit, SousUnite } from '../../src/domain/types';

type Etape = 1 | 2 | 3;
interface Unite { nom: string; facteur: number; prixIndicatif: number }

const dateAujourdhui = () => new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date());

export default function EcranNouvelAchat() {
  const router = useRouter();
  const { boutique } = useSession();
  const [etape, setEtape] = useState<Etape>(1);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [fournisseurId, setFournisseurId] = useState<number | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [articles, setArticles] = useState<ArticleAchat[]>([]);
  const [recevoirMaintenant, setRecevoirMaintenant] = useState(true);
  const [montantPaye, setMontantPaye] = useState('');
  const [modePaiement, setModePaiement] = useState<ModePaiementAchat>('especes');
  const [saisiePaiement, setSaisiePaiement] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [choixOuvert, setChoixOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [produits, setProduits] = useState<Produit[]>([]);
  const [produitChoisi, setProduitChoisi] = useState<Produit | null>(null);
  const [unites, setUnites] = useState<Unite[]>([]);
  const [uniteChoisie, setUniteChoisie] = useState<Unite | null>(null);
  const [quantite, setQuantite] = useState('1');
  const [prix, setPrix] = useState('');

  useEffect(() => { listerFournisseurs().then(setFournisseurs).catch(() => setFournisseurs([])); }, []);
  useEffect(() => {
    if (!choixOuvert) return;
    const timer = setTimeout(() => {
      listerProduits({ recherche, limite: 60 }).then(setProduits).catch(() => setProduits([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [choixOuvert, recherche]);

  const fournisseur = fournisseurs.find((item) => item.id === fournisseurId) ?? null;
  const total = useMemo(() => articles.reduce((s, item) => s + calculerLigneAchat(item).total, 0), [articles]);
  const paye = Number(montantPaye.replace(',', '.')) || 0;
  const reste = Math.max(0, total - paye);

  const ouvrirProduit = useCallback(async (produit: Produit) => {
    const sousUnites: SousUnite[] = await listerSousUnites(produit.id);
    const liste = [
      { nom: produit.uniteBase, facteur: 1, prixIndicatif: produit.prixAchat },
      ...sousUnites.map((item) => ({
        nom: item.nom, facteur: item.facteur, prixIndicatif: Math.round(produit.prixAchat * item.facteur),
      })),
    ];
    setProduitChoisi(produit);
    setUnites(liste);
    setUniteChoisie(liste[0]);
    setQuantite('1');
    setPrix(String(liste[0].prixIndicatif || ''));
  }, []);

  const ajouterArticle = useCallback(() => {
    const q = Number(quantite.replace(',', '.'));
    const p = Number(prix.replace(',', '.'));
    if (!produitChoisi || !uniteChoisie || !Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p <= 0) {
      Alert.alert('Article incomplet', 'Choisissez un produit, une unité, une quantité et un prix valides.');
      return;
    }
    setArticles((liste) => [...liste, {
      produitId: produitChoisi.id, libelle: produitChoisi.nom, unite: uniteChoisie.nom,
      facteur: uniteChoisie.facteur, quantite: q, prixUnitaire: p,
    }]);
    setProduitChoisi(null); setRecherche(''); setChoixOuvert(false);
  }, [prix, produitChoisi, quantite, uniteChoisie]);

  const suivant = useCallback(async () => {
    if (etape === 1) {
      if (!fournisseurId) {
        Alert.alert('Fournisseur requis', 'Choisissez le fournisseur avant de continuer.');
        return;
      }
      setEtape(2);
      return;
    }
    if (etape === 2) {
      if (!articles.length) {
        Alert.alert('Aucun article', 'Ajoutez au moins un article à cet achat.');
        return;
      }
      setEtape(3);
      return;
    }
    if (paye > total) {
      Alert.alert('Montant trop élevé', `Le paiement ne peut pas dépasser ${formaterMontant(total, boutique.devise)}.`);
      return;
    }
    setEnCours(true);
    try {
      const achat = await enregistrerAchat({
        fournisseurId, reference: reference.trim(), articles, montantPaye: paye,
        modePaiement, recevoirMaintenant,
      });
      Alert.alert(
        recevoirMaintenant ? 'Achat reçu' : 'Achat enregistré',
        recevoirMaintenant ? `${achat.numero} : la marchandise est entrée en stock.` : `${achat.numero} : achat en attente de réception.`,
        [{ text: 'Voir', onPress: () => router.replace(`/achats/${achat.achatId}`) }],
      );
    } catch (erreur) {
      Alert.alert('Enregistrement impossible', erreur instanceof Error ? erreur.message : 'Erreur inconnue.');
    } finally { setEnCours(false); }
  }, [articles, boutique.devise, etape, fournisseurId, modePaiement, paye, recevoirMaintenant, reference, router, total]);

  const retour = () => etape === 1 ? router.back() : setEtape((etape - 1) as Etape);
  return <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.header}>
      <Pressable onPress={retour} style={styles.retour} hitSlop={10}><Icone nom="retour" taille={27} couleur="#061541" /></Pressable>
      <Text style={styles.titre}>Nouvel achat</Text>
      <View style={styles.brouillon}><Icone nom="document" taille={17} couleur={couleurs.primaire} /><Text style={styles.brouillonTexte}>Brouillon</Text></View>
    </View>
    <ScrollView contentContainerStyle={styles.contenu} showsVerticalScrollIndicator={false}>
      <Progression etape={etape} />
      {etape === 1 && <EtapeInformations
        fournisseur={fournisseur} fournisseurs={fournisseurs} reference={reference} note={note}
        onChoisir={() => {
          if (!fournisseurs.length) return;
          const index = fournisseurs.findIndex((item) => item.id === fournisseurId);
          setFournisseurId(fournisseurs[(index + 1) % fournisseurs.length]?.id ?? null);
        }}
        onNouveau={() => router.push('/fournisseurs')} onReference={setReference} onNote={setNote}
      />}
      {etape === 2 && <EtapeArticles
        articles={articles} devise={boutique.devise} total={total} onAjouter={() => setChoixOuvert(true)}
        onRetirer={(index) => setArticles((liste) => liste.filter((_, i) => i !== index))}
      />}
      {etape === 3 && <EtapeReglement
        devise={boutique.devise} total={total} reste={reste} montantPaye={montantPaye}
        modePaiement={modePaiement} saisiePaiement={saisiePaiement} recevoirMaintenant={recevoirMaintenant} note={note}
        onAjouterPaiement={() => setSaisiePaiement((ouverte) => !ouverte)} onMontant={setMontantPaye}
        onMode={() => setModePaiement((mode) => mode === 'especes' ? 'mobile_money' : 'especes')}
        onReception={() => setRecevoirMaintenant((active) => !active)} onNote={setNote}
      />}
    </ScrollView>
    <View style={styles.pied}>
      <Pressable onPress={retour} style={styles.annuler}><Text style={styles.annulerTexte}>Annuler</Text></Pressable>
      <Pressable onPress={() => void suivant()} disabled={enCours} style={[styles.suivant, enCours && styles.desactive]}>
        {etape === 3 && <Icone nom="coche" taille={20} couleur="#fff" epaisseur={3} />}
        <Text style={styles.suivantTexte}>{enCours ? 'Enregistrement...' : etape === 3 ? 'Enregistrer l’achat' : 'Suivant'}</Text>
        {etape !== 3 && <Icone nom="chevron" taille={20} couleur="#fff" />}
      </Pressable>
    </View>
    <AjoutArticle
      visible={choixOuvert} recherche={recherche} produits={produits} produit={produitChoisi}
      unite={uniteChoisie} unites={unites} quantite={quantite} prix={prix} devise={boutique.devise}
      onFermer={() => { setChoixOuvert(false); setProduitChoisi(null); }}
      onRecherche={(valeur) => { setRecherche(valeur); setProduitChoisi(null); }}
      onProduit={(produit) => void ouvrirProduit(produit)}
      onUnite={() => {
        if (!unites.length) return;
        const index = unites.findIndex((item) => item.nom === uniteChoisie?.nom);
        const prochaine = unites[(index + 1) % unites.length];
        setUniteChoisie(prochaine ?? null); setPrix(String(prochaine?.prixIndicatif || ''));
      }}
      onQuantite={setQuantite} onPrix={setPrix} onAjouter={ajouterArticle}
    />
  </SafeAreaView>;
}

function Progression({ etape }: { etape: Etape }) {
  const elements: Array<{ n: Etape; texte: string }> = [
    { n: 1, texte: 'Informations' }, { n: 2, texte: 'Articles' }, { n: 3, texte: 'Règlement' },
  ];
  return <View style={styles.progression}>{elements.map((item, index) => <View style={styles.progressionElement} key={item.n}>
    {index > 0 && <View style={[styles.trait, etape > item.n && styles.traitActif]} />}
    <View style={[styles.bulle, etape >= item.n && styles.bulleActive]}>{etape > item.n ? <Icone nom="coche" taille={18} couleur="#fff" epaisseur={3} /> : <Text style={[styles.bulleTexte, etape >= item.n && styles.bulleTexteActif]}>{item.n}</Text>}</View>
    <Text style={[styles.etapeTexte, etape === item.n && styles.etapeTexteActif]}>{item.texte}</Text>
  </View>)}</View>;
}

function EtapeInformations({ fournisseur, fournisseurs, reference, note, onChoisir, onNouveau, onReference, onNote }: {
  fournisseur: Fournisseur | null; fournisseurs: Fournisseur[]; reference: string; note: string;
  onChoisir: () => void; onNouveau: () => void; onReference: (texte: string) => void; onNote: (texte: string) => void;
}) {
  return <View style={styles.ecran}>
    <View style={styles.hero}><View style={styles.heroIcone}><Icone nom="fournisseurs" taille={31} couleur={couleurs.primaire} /></View><View style={styles.heroTexte}><Text style={styles.heroTitre}>Achat de marchandise</Text><Text style={styles.heroSousTitre}>Enregistrez vos achats fournisseur pour mettre à jour votre stock.</Text></View></View>
    <View style={styles.groupe}><Text style={styles.label}>Fournisseur <Text style={styles.requis}>*</Text></Text><View style={styles.fournisseurLigne}><Pressable style={styles.selecteur} onPress={onChoisir}><Icone nom="boutique" taille={24} couleur="#0c2857" /><Text style={[styles.selecteurTexte, !fournisseur && styles.placeholder]}>{fournisseur?.nom || (fournisseurs.length ? 'Choisir un fournisseur' : 'Aucun fournisseur')}</Text><Icone nom="chevron" taille={18} couleur="#0c2857" /></Pressable><Pressable style={styles.plus} onPress={onNouveau}><Icone nom="plus" taille={27} couleur="#fff" /></Pressable></View></View>
    <Champ label="Numéro de facture" valeur={reference} onChange={onReference} placeholder="FAC-2025-001" />
    <View style={styles.groupe}><Text style={styles.label}>Date d’achat <Text style={styles.requis}>*</Text></Text><View style={styles.lecture}><Icone nom="document" taille={23} couleur="#0c2857" /><Text style={styles.lectureTexte}>{dateAujourdhui()}</Text><Icone nom="chevron" taille={18} couleur="#0c2857" /></View></View>
    <Champ label="Notes (optionnel)" valeur={note} onChange={onNote} placeholder="Une remarque..." />
  </View>;
}

function Champ({ label, valeur, onChange, placeholder }: { label: string; valeur: string; onChange: (valeur: string) => void; placeholder: string }) {
  return <View style={styles.groupe}><Text style={styles.label}>{label}</Text><View style={styles.saisie}><Icone nom="document" taille={23} couleur="#0c2857" /><TextInput value={valeur} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#7185aa" style={styles.input} /></View></View>;
}

function EtapeArticles({ articles, devise, total, onAjouter, onRetirer }: { articles: ArticleAchat[]; devise: string; total: number; onAjouter: () => void; onRetirer: (index: number) => void }) {
  return <View style={styles.ecran}>
    <View style={styles.recherche}><Icone nom="recherche" taille={23} couleur="#09245b" /><Text style={styles.rechercheTexte}>Rechercher un produit...</Text><View style={styles.scan}><Icone nom="codeBarres" taille={21} couleur="#09245b" /></View></View>
    <View style={styles.filtres}><Filtre titre="Tous" actif /><Filtre titre="Alimentaire" /><Filtre titre="Boisson" /><Filtre titre="Hygiène" /><Filtre titre="Autre" /></View>
    <View style={styles.titreSection}><Text style={styles.titreSectionTexte}>Articles ({articles.length})</Text><Pressable onPress={onAjouter} style={styles.ajouter}><Icone nom="plus" taille={20} couleur={couleurs.primaire} /><Text style={styles.ajouterTexte}>Ajouter</Text></Pressable></View>
    {articles.length === 0 ? <View style={styles.vide}><Icone nom="stock" taille={45} couleur="#a2afc1" /><Text style={styles.videTitre}>Aucun article ajouté</Text><Text style={styles.videTexte}>Appuyez sur « Ajouter » pour choisir vos produits.</Text></View> : articles.map((article, index) => <CarteArticle key={`${article.produitId}-${index}`} article={article} devise={devise} onRetirer={() => onRetirer(index)} />)}
    <View style={styles.resumeArticles}><View><Text style={styles.resumeLegende}>Total</Text><Text style={styles.resumeValeur}>{formaterMontant(total, devise)}</Text></View><View style={styles.compteur}><Text style={styles.resumeLegende}>Articles</Text><Text style={styles.resumeValeur}>{articles.length}</Text></View></View>
  </View>;
}

function Filtre({ titre, actif = false }: { titre: string; actif?: boolean }) { return <View style={[styles.filtre, actif && styles.filtreActif]}><Text style={[styles.filtreTexte, actif && styles.filtreTexteActif]}>{titre}</Text></View>; }

function CarteArticle({ article, devise, onRetirer }: { article: ArticleAchat; devise: string; onRetirer: () => void }) {
  const ligne = calculerLigneAchat(article);
  return <View style={styles.carteArticle}><View style={styles.miniature}><Icone nom="stock" taille={26} couleur={couleurs.primaire} /></View><View style={styles.articleCentre}><Text numberOfLines={1} style={styles.articleNom}>{article.libelle}</Text><Text style={styles.articleMeta}>{article.unite}</Text><Text style={styles.articleMeta}>Prix d’achat : {formaterMontant(article.prixUnitaire, devise)}</Text><View style={styles.quantite}><View style={styles.quantiteBouton}><Icone nom="moins" taille={14} couleur={couleurs.primaire} /></View><Text style={styles.quantiteTexte}>{formaterQuantite(article.quantite)}</Text><View style={styles.quantiteBouton}><Icone nom="plus" taille={14} couleur={couleurs.primaire} /></View></View></View><View style={styles.articleDroite}><Pressable onPress={onRetirer} style={styles.corbeille}><Icone nom="corbeille" taille={18} couleur="#ec3047" /></Pressable><Text style={styles.articleMontant}>{formaterMontant(ligne.total, devise)}</Text></View></View>;
}

function EtapeReglement({ devise, total, reste, montantPaye, modePaiement, saisiePaiement, recevoirMaintenant, note, onAjouterPaiement, onMontant, onMode, onReception, onNote }: {
  devise: string; total: number; reste: number; montantPaye: string; modePaiement: ModePaiementAchat; saisiePaiement: boolean; recevoirMaintenant: boolean; note: string;
  onAjouterPaiement: () => void; onMontant: (valeur: string) => void; onMode: () => void; onReception: () => void; onNote: (valeur: string) => void;
}) {
  const paye = Number(montantPaye.replace(',', '.')) || 0;
  const libelleMode = modePaiement === 'mobile_money' ? 'Mobile Money' : 'Espèces';
  return <View style={styles.ecran}>
    <View style={styles.totaux}><BlocTotal titre="Total de l’achat" valeur={formaterMontant(total, devise)} vert /><BlocTotal titre="Reste à payer" valeur={formaterMontant(reste, devise)} /></View>
    <View style={styles.titreSection}><Text style={styles.titreSectionTexte}>Paiements</Text><Pressable onPress={onAjouterPaiement} style={styles.ajouter}><Icone nom="plus" taille={20} couleur={couleurs.primaire} /><Text style={styles.ajouterTexte}>Ajouter un paiement</Text></Pressable></View>
    {saisiePaiement && <View style={styles.saisiePaiement}><Pressable onPress={onMode} style={styles.selectMode}><Text style={styles.selectModeTexte}>{libelleMode}</Text><Icone nom="chevron" taille={17} couleur="#08245b" /></Pressable><TextInput value={montantPaye} onChangeText={onMontant} keyboardType="numeric" placeholder="Montant payé" placeholderTextColor="#7185aa" style={styles.inputPaiement} /></View>}
    {paye > 0 ? <View style={styles.paiementLigne}><View style={styles.paiementIcone}><Icone nom="argent" taille={22} couleur="#0b9c4e" /></View><View style={styles.paiementInfos}><Text style={styles.paiementTitre}>{libelleMode}</Text><Text style={styles.paiementDate}>{dateAujourdhui()}</Text></View><Text style={styles.paiementMontant}>{formaterMontant(paye, devise)}</Text></View> : <View style={styles.aucunPaiement}><Text style={styles.aucunPaiementTexte}>Aucun paiement ajouté</Text></View>}
    <View style={styles.resteBandeau}><Text style={styles.resteTexte}>Reste à payer</Text><Text style={styles.resteMontant}>{formaterMontant(reste, devise)}</Text></View>
    <Pressable onPress={onReception} style={styles.reception}><View style={styles.receptionIcone}><Icone nom="stock" taille={26} couleur={couleurs.primaire} /></View><View style={styles.receptionInfos}><Text style={styles.receptionTitre}>Marchandise arrivée</Text><Text style={styles.receptionSous}>Entrée en stock immédiate.</Text></View><View style={[styles.switch, recevoirMaintenant && styles.switchActif]}><View style={[styles.switchBoule, recevoirMaintenant && styles.switchBouleActive]} /></View></Pressable>
    <Champ label="Note (optionnel)" valeur={note} onChange={onNote} placeholder="Une note sur ce règlement..." />
  </View>;
}

function BlocTotal({ titre, valeur, vert = false }: { titre: string; valeur: string; vert?: boolean }) { return <View style={[styles.blocTotal, vert ? styles.totalVert : styles.totalRouge]}><View style={[styles.totalIcone, vert ? styles.totalIconeVerte : styles.totalIconeRouge]}><Icone nom={vert ? 'caisse' : 'argent'} taille={22} couleur={vert ? '#08944a' : '#e5263c'} /></View><Text style={styles.totalTitre}>{titre}</Text><Text style={[styles.totalMontant, !vert && styles.totalMontantRouge]}>{valeur}</Text></View>; }

function AjoutArticle({ visible, recherche, produits, produit, unite, unites, quantite, prix, devise, onFermer, onRecherche, onProduit, onUnite, onQuantite, onPrix, onAjouter }: {
  visible: boolean; recherche: string; produits: Produit[]; produit: Produit | null; unite: Unite | null; unites: Unite[]; quantite: string; prix: string; devise: string;
  onFermer: () => void; onRecherche: (valeur: string) => void; onProduit: (produit: Produit) => void; onUnite: () => void; onQuantite: (valeur: string) => void; onPrix: (valeur: string) => void; onAjouter: () => void;
}) {
  const total = (Number(quantite.replace(',', '.')) || 0) * (Number(prix.replace(',', '.')) || 0);
  return <Modal visible={visible} animationType="slide" onRequestClose={onFermer}><SafeAreaView style={styles.page} edges={['top', 'bottom']}><View style={styles.header}><Pressable onPress={onFermer} style={styles.retour}><Icone nom="retour" taille={27} couleur="#061541" /></Pressable><Text style={styles.titre}>Ajouter un article</Text><View style={styles.placeholderHeader} /></View><ScrollView contentContainerStyle={styles.modalContenu} showsVerticalScrollIndicator={false}><View style={styles.recherche}><Icone nom="recherche" taille={23} couleur="#09245b" /><TextInput value={recherche} onChangeText={onRecherche} autoFocus placeholder="Rechercher un produit..." placeholderTextColor="#7185aa" style={styles.inputRecherche} /></View>{produit ? <View style={styles.produitChoisi}><Vignette chemin={produit.cheminImage} nom={produit.nom} taille={70} /><View style={styles.produitChoisiInfo}><Text style={styles.articleNom}>{produit.nom}</Text><Text style={styles.articleMeta}>Stock actuel : {formaterQuantite(produit.quantiteBase)} {produit.uniteBase}</Text></View></View> : <FlatList data={produits} scrollEnabled={false} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.listeProduits} ListEmptyComponent={<ListeVide titre="Aucun produit" message="Créez d’abord vos produits dans le catalogue." />} renderItem={({ item }) => <Pressable onPress={() => onProduit(item)} style={styles.produitLigne}><Vignette chemin={item.cheminImage} nom={item.nom} taille={56} /><View style={styles.produitChoisiInfo}><Text style={styles.articleNom}>{item.nom}</Text><Text style={styles.articleMeta}>{item.categorie || item.uniteBase}</Text></View><Icone nom="chevron" taille={18} couleur="#09245b" /></Pressable>} />}{produit && <><Text style={styles.label}>Unité <Text style={styles.requis}>*</Text></Text><Pressable onPress={onUnite} style={styles.lecture}><Text style={styles.lectureTexte}>{unite?.nom || 'Unité'}</Text><Icone nom="chevron" taille={18} couleur="#0c2857" /></Pressable><View style={styles.deuxChamps}><View style={styles.demiChamp}><Text style={styles.label}>Quantité <Text style={styles.requis}>*</Text></Text><TextInput value={quantite} onChangeText={onQuantite} keyboardType="numeric" style={styles.inputSimple} /></View><View style={styles.demiChamp}><Text style={styles.label}>Prix unitaire ({devise}) <Text style={styles.requis}>*</Text></Text><TextInput value={prix} onChangeText={onPrix} keyboardType="numeric" style={styles.inputSimple} /></View></View><View style={styles.totalLigne}><Text style={styles.totalLigneTitre}>Total ligne</Text><Text style={styles.totalLigneValeur}>{formaterMontant(total, devise)}</Text></View><Pressable onPress={onAjouter} style={styles.ajouterArticle}><Icone nom="plus" taille={22} couleur="#fff" /><Text style={styles.ajouterArticleTexte}>Ajouter cet article</Text></Pressable></>}</ScrollView></SafeAreaView></Modal>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fbfdff' },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 17, borderBottomWidth: 1, borderBottomColor: '#edf1f6', backgroundColor: '#fff' },
  retour: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center' }, titre: { flex: 1, color: '#061541', fontSize: 21, fontWeight: '900', textAlign: 'center' }, placeholderHeader: { width: 35 },
  brouillon: { minHeight: 37, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 11, backgroundColor: '#eef5ff' }, brouillonTexte: { color: couleurs.primaire, fontSize: 13, fontWeight: '800' },
  contenu: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 105 }, modalContenu: { padding: 18, paddingBottom: 36, gap: 16 },
  progression: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 24 }, progressionElement: { width: 92, alignItems: 'center', position: 'relative' }, trait: { position: 'absolute', top: 20, right: 72, width: 73, height: 2, backgroundColor: '#dce5f1' }, traitActif: { backgroundColor: couleurs.primaire }, bulle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e6edf6' }, bulleActive: { backgroundColor: couleurs.primaire }, bulleTexte: { color: '#617594', fontSize: 16, fontWeight: '900' }, bulleTexteActif: { color: '#fff' }, etapeTexte: { marginTop: 8, color: '#627696', fontSize: 13, fontWeight: '700', textAlign: 'center' }, etapeTexteActif: { color: '#061541', fontWeight: '900' },
  ecran: { gap: 18 }, hero: { minHeight: 130, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderRadius: 15, backgroundColor: '#edf6ff' }, heroIcone: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 33, backgroundColor: '#dcecff' }, heroTexte: { flex: 1 }, heroTitre: { color: '#061541', fontSize: 18, fontWeight: '900' }, heroSousTitre: { marginTop: 7, color: '#5c7298', fontSize: 15, lineHeight: 22 },
  groupe: { gap: 8 }, label: { color: '#10224a', fontSize: 16, fontWeight: '800' }, requis: { color: '#ed3048' }, fournisseurLigne: { flexDirection: 'row', gap: 11 }, selecteur: { flex: 1, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: '#d2ddeb', borderRadius: 12, backgroundColor: '#fff' }, selecteurTexte: { flex: 1, color: '#10224a', fontSize: 16, fontWeight: '800' }, placeholder: { color: '#7185aa', fontWeight: '500' }, plus: { width: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: couleurs.primaire },
  saisie: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: '#d2ddeb', borderRadius: 12, backgroundColor: '#fff' }, input: { flex: 1, minHeight: 55, color: '#10224a', fontSize: 16 }, lecture: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: '#d2ddeb', borderRadius: 12, backgroundColor: '#fff' }, lectureTexte: { flex: 1, color: '#10224a', fontSize: 16 },
  recherche: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, borderWidth: 1, borderColor: '#d4dfed', borderRadius: 12, backgroundColor: '#fff' }, rechercheTexte: { flex: 1, color: '#7185aa', fontSize: 15 }, scan: { width: 49, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: '#dfe7f1' }, inputRecherche: { flex: 1, minHeight: 51, color: '#10224a', fontSize: 16 },
  filtres: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' }, filtre: { minHeight: 39, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 12, backgroundColor: '#edf2f8' }, filtreActif: { backgroundColor: couleurs.primaire }, filtreTexte: { color: '#587096', fontSize: 13, fontWeight: '800' }, filtreTexteActif: { color: '#fff' },
  titreSection: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, titreSectionTexte: { flexShrink: 1, color: '#061541', fontSize: 20, fontWeight: '900' }, ajouter: { minHeight: 41, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderWidth: 1, borderColor: '#cfe0fe', borderRadius: 12, backgroundColor: '#f6faff' }, ajouterTexte: { color: couleurs.primaire, fontSize: 13, fontWeight: '900' },
  vide: { minHeight: 180, alignItems: 'center', justifyContent: 'center', padding: 22, borderWidth: 1, borderColor: '#e1e8f2', borderRadius: 14, backgroundColor: '#fff' }, videTitre: { marginTop: 12, color: '#536a8f', fontSize: 16, fontWeight: '900' }, videTexte: { marginTop: 5, color: '#7185a5', fontSize: 14, textAlign: 'center' },
  carteArticle: { minHeight: 128, flexDirection: 'row', gap: 11, padding: 12, borderWidth: 1, borderColor: '#e0e8f2', borderRadius: 14, backgroundColor: '#fff' }, miniature: { width: 61, height: 75, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#eef5ff' }, articleCentre: { flex: 1 }, articleNom: { color: '#071a43', fontSize: 16, fontWeight: '900' }, articleMeta: { marginTop: 3, color: '#63779a', fontSize: 13 }, quantite: { height: 34, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', marginTop: 9, borderRadius: 8, backgroundColor: '#f0f6ff' }, quantiteBouton: { width: 33, alignItems: 'center' }, quantiteTexte: { minWidth: 29, textAlign: 'center', color: '#092158', fontSize: 15, fontWeight: '800' }, articleDroite: { alignItems: 'flex-end', justifyContent: 'space-between' }, corbeille: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#fff0f2' }, articleMontant: { color: '#061541', fontSize: 16, fontWeight: '900' },
  resumeArticles: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderTopWidth: 1, borderTopColor: '#e4ebf4' }, compteur: { minWidth: 80, paddingLeft: 19, borderLeftWidth: 1, borderLeftColor: '#e4ebf4' }, resumeLegende: { color: '#607595', fontSize: 13 }, resumeValeur: { marginTop: 3, color: '#061541', fontSize: 20, fontWeight: '900' },
  totaux: { flexDirection: 'row', gap: 12 }, blocTotal: { flex: 1, minHeight: 150, padding: 16, borderRadius: 15, borderWidth: 1 }, totalVert: { borderColor: '#d9f4e4', backgroundColor: '#f0fff7' }, totalRouge: { borderColor: '#ffdce1', backgroundColor: '#fff5f6' }, totalIcone: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 22 }, totalIconeVerte: { backgroundColor: '#d9fae7' }, totalIconeRouge: { backgroundColor: '#ffe0e6' }, totalTitre: { marginTop: 13, color: '#5f7192', fontSize: 14, fontWeight: '800' }, totalMontant: { marginTop: 8, color: '#061541', fontSize: 22, fontWeight: '900' }, totalMontantRouge: { color: '#e42139' },
  saisiePaiement: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderWidth: 1, borderColor: '#d5e2f5', borderRadius: 13, backgroundColor: '#f8fbff' }, selectMode: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 }, selectModeTexte: { color: '#10224a', fontSize: 14, fontWeight: '900' }, inputPaiement: { flex: 1, minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: '#ccdaeb', borderRadius: 9, backgroundColor: '#fff', color: '#10224a', fontSize: 16 }, paiementLigne: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderWidth: 1, borderColor: '#e0e8f2', borderRadius: 13, backgroundColor: '#fff' }, paiementIcone: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#dff8e9' }, paiementInfos: { flex: 1 }, paiementTitre: { color: '#10224a', fontSize: 15, fontWeight: '900' }, paiementDate: { marginTop: 3, color: '#6980a5', fontSize: 13 }, paiementMontant: { color: '#061541', fontSize: 16, fontWeight: '900' }, aucunPaiement: { minHeight: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e1e8f1', borderRadius: 13, backgroundColor: '#fff' }, aucunPaiementTexte: { color: '#7185a5', fontSize: 14, fontWeight: '700' }, resteBandeau: { minHeight: 53, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderRadius: 11, backgroundColor: '#fff0f2' }, resteTexte: { color: '#e42139', fontSize: 15, fontWeight: '900' }, resteMontant: { color: '#e42139', fontSize: 17, fontWeight: '900' },
  reception: { minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#edf6ff' }, receptionIcone: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: '#dceaff' }, receptionInfos: { flex: 1 }, receptionTitre: { color: '#061541', fontSize: 16, fontWeight: '900' }, receptionSous: { marginTop: 3, color: '#647a9d', fontSize: 13 }, switch: { width: 52, height: 30, padding: 3, borderRadius: 15, backgroundColor: '#cad7e6' }, switchActif: { backgroundColor: couleurs.primaire }, switchBoule: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }, switchBouleActive: { alignSelf: 'flex-end' },
  pied: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 80, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#e5ecf4', backgroundColor: '#fff' }, annuler: { flex: 0.75, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#f2f5fa' }, annulerTexte: { color: '#142957', fontSize: 16, fontWeight: '900' }, suivant: { flex: 1.55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 12, backgroundColor: couleurs.primaire }, suivantTexte: { color: '#fff', fontSize: 17, fontWeight: '900' }, desactive: { opacity: 0.6 },
  produitChoisi: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13, borderWidth: 1, borderColor: '#e0e8f2', borderRadius: 13, backgroundColor: '#fff' }, produitChoisiInfo: { flex: 1 }, listeProduits: { gap: 9 }, produitLigne: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 9, borderWidth: 1, borderColor: '#e0e8f2', borderRadius: 12, backgroundColor: '#fff' }, deuxChamps: { flexDirection: 'row', gap: 12 }, demiChamp: { flex: 1, gap: 7 }, inputSimple: { minHeight: 54, paddingHorizontal: 13, borderWidth: 1, borderColor: '#d2ddeb', borderRadius: 11, backgroundColor: '#fff', color: '#10224a', fontSize: 17 }, totalLigne: { minHeight: 97, justifyContent: 'center', padding: 17, borderRadius: 13, backgroundColor: '#edf5ff' }, totalLigneTitre: { color: '#10224a', fontSize: 16, fontWeight: '900' }, totalLigneValeur: { marginTop: 7, color: couleurs.primaire, fontSize: 29, fontWeight: '900' }, ajouterArticle: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 12, backgroundColor: couleurs.primaire }, ajouterArticleTexte: { color: '#fff', fontSize: 18, fontWeight: '900' },
});
