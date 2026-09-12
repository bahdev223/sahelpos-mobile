import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  chargerProduitsStock,
  etatStock,
  type ProduitStock,
} from '../(tabs)/stock';
import { C, formaterFrancs, formaterQuantite, s } from '../produit/nouveau';
import { BandeauEtat, couleurs, Vignette } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { ActionsDocument } from '../../src/ui/ActionsDocument';
import { bonDeCommandeHtml } from '../../src/services/pdf';
import { lireParametres } from '../../src/services/parametres';
import type { AchatResume, LigneAchat } from '../../src/services/achat';

interface LigneCommande {
  produit: ProduitStock;
  quantite: number;
}

export default function ListeCommande() {
  const router = useRouter();
  const [lignes, setLignes] = useState<LigneCommande[]>([]);
  const [chargement, setChargement] = useState(true);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [note, setNote] = useState('');

  const charger = useCallback(async (silencieux: boolean) => {
    if (!silencieux) setChargement(true);
    try {
      const produits = await chargerProduitsStock();
      const alertes = produits.filter((produit) => {
        const cle = etatStock(produit).cle;
        return cle === 'rupture' || cle === 'alerte';
      });
      setLignes(alertes.map((produit) => ({
        produit,
        quantite: Math.max(1, Math.ceil(Math.max(0, produit.stock_min - produit.quantite_base))),
      })));
    } catch {
      setLignes([]);
    } finally {
      setChargement(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void charger(true);
  }, [charger]));

  const rafraichir = useCallback(() => {
    setRafraichissement(true);
    void charger(true).finally(() => setRafraichissement(false));
  }, [charger]);

  const total = useMemo(
    () => lignes.reduce((somme, ligne) => somme + ligne.quantite * ligne.produit.prix_achat, 0),
    [lignes],
  );

  const modifierQuantite = useCallback((id: number, delta: number) => {
    setLignes((actuelles) => actuelles.map((ligne) =>
      ligne.produit.id !== id
        ? ligne
        : { ...ligne, quantite: Math.max(1, ligne.quantite + delta) },
    ));
  }, []);

  const supprimer = useCallback((id: number) => {
    setLignes((actuelles) => actuelles.filter((ligne) => ligne.produit.id !== id));
  }, []);

  const preparerPdf = useCallback(async () => {
    const parametres = await lireParametres();
    const achat: AchatResume = {
      id: 0, numero: `A commander-${new Date().toISOString().slice(0, 10)}`,
      fournisseurId: null, fournisseurNom: null, reference: null,
      dateAchat: new Date().toISOString(), total, montantPaye: 0,
      statut: 'BROUILLON', dateReception: null,
    };
    const articles: LigneAchat[] = lignes.map((ligne) => ({
      produitId: ligne.produit.id, libelle: ligne.produit.nom, unite: ligne.produit.unite_base,
      facteur: 1, quantite: ligne.quantite, quantiteBase: ligne.quantite,
      prixUnitaire: ligne.produit.prix_achat, total: ligne.quantite * ligne.produit.prix_achat,
    }));
    return { html: bonDeCommandeHtml({ achat, lignes: articles, fournisseur: null, parametres }), nom: 'Liste-a-commander' };
  }, [lignes, total]);

  const ouvrirNouvelAchat = useCallback(() => {
    const produits = lignes.map(({ produit, quantite }) => ({ produitId: produit.id, quantite }));
    router.push({ pathname: '/achats/nouveau', params: { commande: JSON.stringify(produits) } });
  }, [lignes, router]);

  return (
    <View style={s.plein}>
      <BandeauEtat />
      <View style={sl.entete}>
        <Pressable onPress={() => router.back()} style={s.retour} hitSlop={8}>
          <Icone nom="retour" taille={20} couleur={couleurs.primaire} />
        </Pressable>
        <Text style={s.titre} numberOfLines={1}>Liste a commander</Text>
        <Pressable style={sl.menu} onPress={() => Alert.alert('Liste a commander', 'La liste est calculee depuis les alertes de stock.') }>
          <Text style={sl.menuTexte}>...</Text>
        </Pressable>
      </View>

      {chargement ? (
        <View style={sl.centre}>
          <ActivityIndicator color={C.accent} />
          <Text style={sl.centreTexte}>Preparation de la commande...</Text>
        </View>
      ) : (
        <FlatList
          data={lignes}
          keyExtractor={(ligne) => String(ligne.produit.id)}
          contentContainerStyle={sl.liste}
          refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={rafraichir} />}
          ListHeaderComponent={
            <>
              <View style={sl.intro}>
                <View style={sl.introIcone}>
                  <Icone nom="achats" taille={28} couleur={C.accent} />
                </View>
                <View style={sl.introTextes}>
                  <Text style={sl.introTitre}>Produits a commander</Text>
                  <Text style={sl.introAide}>Preparez votre prochaine commande fournisseur.</Text>
                </View>
              </View>
              <View style={sl.stats}>
                <View style={sl.stat}>
                  <Text style={sl.statLabel}>Nombre de produits</Text>
                  <Text style={sl.statValue}>{lignes.length}</Text>
                </View>
                <View style={sl.stat}>
                  <Text style={sl.statLabel}>Montant estime</Text>
                  <Text style={sl.statValue}>{formaterFrancs(total)} F</Text>
                </View>
              </View>
              <View style={sl.colonnes}>
                <Text style={sl.colonneProduit}>Produit</Text>
                <Text style={sl.colonneQuantite}>Qte</Text>
                <Text style={sl.colonnePrix}>Sous-total</Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={sl.vide}>
              <Icone nom="coche" taille={32} couleur={C.vert} />
              <Text style={sl.videTitre}>Aucun produit a commander</Text>
              <Text style={sl.centreTexte}>Tous les stocks sont au-dessus de leur seuil.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={sl.ligne}>
              <Vignette chemin={item.produit.chemin_image} nom={item.produit.nom} taille={48} />
              <View style={sl.produit}>
                <Text style={sl.nom} numberOfLines={2}>{item.produit.nom}</Text>
                <Text style={sl.unite}>{item.produit.unite_base}</Text>
              </View>
              <View style={sl.stepper}>
                <Pressable onPress={() => modifierQuantite(item.produit.id, -1)} style={sl.stepButton} hitSlop={5}>
                  <Icone nom="moins" taille={16} couleur={C.accent} />
                </Pressable>
                <Text style={sl.quantite}>{formaterQuantite(item.quantite)}</Text>
                <Pressable onPress={() => modifierQuantite(item.produit.id, 1)} style={sl.stepButton} hitSlop={5}>
                  <Icone nom="plus" taille={16} couleur={C.accent} />
                </Pressable>
              </View>
              <View style={sl.prix}>
                <Text style={sl.prixTexte}>{formaterFrancs(item.quantite * item.produit.prix_achat)} F</Text>
                <Pressable onPress={() => supprimer(item.produit.id)} hitSlop={8}>
                  <Icone nom="corbeille" taille={18} couleur={C.rouge} />
                </Pressable>
              </View>
            </View>
          )}
          ListFooterComponent={
            lignes.length > 0 ? (
              <View style={sl.note}>
                <Text style={sl.noteTitre}>Note (optionnelle)</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Ex : Commander chez le fournisseur habituel..."
                  placeholderTextColor={C.texteFaible}
                  style={sl.noteSaisie}
                  multiline
                />
              </View>
            ) : null
          }
        />
      )}

      <View style={sl.actions}>
        <Pressable style={sl.actionSecondaire} onPress={() => setLignes([])}>
          <Icone nom="corbeille" taille={19} couleur={C.texte} />
          <Text style={sl.actionTexte}>Vider la liste</Text>
        </Pressable>
        <View style={sl.actionDocument}><ActionsDocument preparer={preparerPdf} desactive={!lignes.length} /></View>
        <Pressable style={sl.actionPrincipale} onPress={ouvrirNouvelAchat} disabled={!lignes.length}>
          <Icone nom="achats" taille={19} couleur="#FFFFFF" />
          <Text style={sl.actionPrincipalTexte}>Creer l&apos;achat</Text>
        </Pressable>
      </View>
    </View>
  );
}

const sl = StyleSheet.create({
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.carte, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.bordure },
  menu: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  menuTexte: { fontSize: 22, fontWeight: '800', color: C.texte },
  liste: { padding: 12, paddingBottom: 128, gap: 0 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: couleurs.primaireDouce, borderRadius: 10, padding: 14, marginBottom: 10 },
  introIcone: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#DDEBFF', alignItems: 'center', justifyContent: 'center' },
  introTextes: { flex: 1, gap: 3 },
  introTitre: { fontSize: 16, fontWeight: '700', color: C.texte },
  introAide: { fontSize: 12, color: C.texteFaible, lineHeight: 18 },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stat: { flex: 1, minHeight: 70, justifyContent: 'center', backgroundColor: C.carte, borderWidth: StyleSheet.hairlineWidth, borderColor: C.bordure, borderRadius: 10, paddingHorizontal: 12 },
  statLabel: { fontSize: 11, color: C.texteFaible },
  statValue: { fontSize: 19, fontWeight: '700', color: C.texte, marginTop: 4 },
  colonnes: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 8 },
  colonneProduit: { flex: 1, fontSize: 12, fontWeight: '700', color: C.texteFaible },
  colonneQuantite: { width: 80, textAlign: 'center', fontSize: 12, fontWeight: '700', color: C.texteFaible },
  colonnePrix: { width: 74, textAlign: 'right', fontSize: 12, fontWeight: '700', color: C.texteFaible },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 76, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.bordure },
  produit: { flex: 1, minWidth: 0, gap: 3 },
  nom: { fontSize: 13, fontWeight: '700', color: C.texte },
  unite: { fontSize: 12, color: C.texteFaible },
  stepper: { width: 80, height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: couleurs.primaireDouce, borderRadius: 9 },
  stepButton: { width: 26, height: 38, alignItems: 'center', justifyContent: 'center' },
  quantite: { fontSize: 14, fontWeight: '700', color: C.texte },
  prix: { width: 74, alignItems: 'flex-end', gap: 5 },
  prixTexte: { fontSize: 12, fontWeight: '700', color: C.texte },
  note: { marginTop: 16, gap: 7 },
  noteTitre: { fontSize: 14, fontWeight: '700', color: C.texte },
  noteSaisie: { minHeight: 54, borderWidth: 1, borderColor: C.bordure, borderRadius: 9, padding: 12, color: C.texte, backgroundColor: C.carte, textAlignVertical: 'top' },
  actions: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 7, padding: 12, backgroundColor: C.carte, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.bordure },
  actionSecondaire: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: C.bordure, borderRadius: 9, paddingHorizontal: 5 },
  actionDocument: { flex: 1.55, justifyContent: 'center' },
  actionPrincipale: { flex: 1.15, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: C.accent, borderRadius: 9, paddingHorizontal: 5 },
  actionTexte: { fontSize: 11, fontWeight: '700', color: C.texte },
  actionBleue: { fontSize: 11, fontWeight: '700', color: C.accent },
  actionPrincipalTexte: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centreTexte: { fontSize: 13, color: C.texteFaible, textAlign: 'center', lineHeight: 19 },
  vide: { alignItems: 'center', gap: 10, paddingVertical: 48 },
  videTitre: { fontSize: 16, fontWeight: '700', color: C.texte },
});
