/**
 * Alertes de stock : ce qui manque et ce qui va manquer.
 *
 * Deux familles, volontairement disjointes : ce qui est TOMBE A ZERO, et ce qui
 * est encore la mais sous son seuil. Un produit a zero n'apparait donc qu'en
 * rupture, jamais deux fois - le poste de bureau melangeait les deux dans une
 * seule liste ou l'urgent se noyait dans l'important.
 *
 * LE SEUIL EST CELUI DU PRODUIT, PAS UN CHIFFRE GLOBAL
 * ----------------------------------------------------
 * Un sac de riz et une boite d'allumettes ne se rachetent pas au meme rythme.
 * Le seuil vit donc sur la fiche produit (`stock_min`), et cet ecran ne fait
 * que le lire. Comme le schema le laisse a zero par defaut, un produit dont le
 * seuil n'a jamais ete renseigne ne peut alerter qu'a la rupture : l'ecran le
 * dit en clair plutot que de laisser croire a une surveillance qui n'existe pas.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SectionListData } from 'react-native';

import { C, formaterFrancs, formaterQuantite, s } from '../produit/nouveau';
import {
  arrondirQuantite,
  chargerProduitsStock,
  etatStock,
  messageDe,
  type ProduitStock,
} from '../(tabs)/stock';
import { BandeauEtat, couleurs } from '../../src/ui/components';
import { seuilAlerteStock } from '../../src/domain/stock';
import { Icone } from '../../src/ui/icones';

type Etat =
  | { phase: 'chargement' }
  | { phase: 'erreur'; message: string }
  | { phase: 'pret'; produits: ProduitStock[] };

interface Section {
  titre: string;
  aide: string;
  couleur: string;
  data: ProduitStock[];
}

export default function Alertes() {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' });
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(async (silencieux: boolean) => {
    if (!silencieux) setEtat({ phase: 'chargement' });
    try {
      setEtat({ phase: 'pret', produits: await chargerProduitsStock() });
    } catch (erreur) {
      setEtat({ phase: 'erreur', message: messageDe(erreur) });
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

  const produits = etat.phase === 'pret' ? etat.produits : [];

  const { sections, sansSeuil, aRacheter, coutReassort } = useMemo(() => {
    const ruptures: ProduitStock[] = [];
    const bas: ProduitStock[] = [];
    let nbSansSeuil = 0;
    let cout = 0;

    for (const produit of produits) {
      if (produit.gestion_stock === 0) continue;
      if (produit.stock_min <= 0) nbSansSeuil += 1;
      const cle = etatStock(produit).cle;
      if (cle === 'rupture') ruptures.push(produit);
      else if (cle === 'alerte') bas.push(produit);
      else continue;

      const cible = seuilAlerteStock(produit.stock_min);
      cout += Math.max(0, cible - produit.quantite_base) * produit.prix_achat;
    }

    const construites: Section[] = [];
    if (ruptures.length > 0) {
      construites.push({
        titre: `Rupture (${ruptures.length})`,
        aide: 'Plus rien en boutique : ces produits ne peuvent plus etre vendus.',
        couleur: C.rouge,
        data: ruptures,
      });
    }
    if (bas.length > 0) {
      construites.push({
        titre: `Stock bas (${bas.length})`,
        aide: 'Encore disponibles, mais sous leur seuil de surveillance.',
        couleur: C.orange,
        data: bas,
      });
    }

    return {
      sections: construites,
      sansSeuil: nbSansSeuil,
      aRacheter: ruptures.length + bas.length,
      coutReassort: cout,
    };
  }, [produits]);

  return (
    <View style={s.plein}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} style={s.retour}>
          <Icone nom="retour" taille={17} couleur={couleurs.primaire} />
          <Text style={s.retourTexte}>Retour</Text>
        </Pressable>
        <Text style={s.titre}>Alertes de stock</Text>
      </View>

      {etat.phase === 'chargement' ? (
        <View style={sl.centre}>
          <ActivityIndicator color={C.accent} />
          <Text style={sl.centreTexte}>Verification du stock...</Text>
        </View>
      ) : etat.phase === 'erreur' ? (
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>Les alertes n&apos;ont pas pu etre calculees</Text>
          <Text style={sl.centreTexte}>{etat.message}</Text>
          <Pressable style={s.boutonSecondaire} onPress={() => void charger(false)}>
            <Text style={s.boutonSecondaireTexte}>Reessayer</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(produit) => String(produit.id)}
          contentContainerStyle={sections.length === 0 ? sl.listeVide : sl.liste}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={rafraichissement} onRefresh={rafraichir} />
          }
          ListHeaderComponent={
            sections.length > 0 ? (
              <View style={sl.resume}>
                <Text style={sl.resumeTitre}>
                  {aRacheter} produit(s) a racheter
                </Text>
                <Text style={sl.resumeAide}>
                  Environ {formaterFrancs(coutReassort)} pour revenir au-dessus des seuils, au
                  prix d&apos;achat connu.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={sl.centre}>
              <Text style={sl.pastille}>OK</Text>
              <Text style={sl.centreTitre}>Aucune alerte</Text>
              <Text style={sl.centreTexte}>
                {produits.length === 0
                  ? "Aucun produit actif n'est suivi en stock pour l'instant."
                  : 'Tous les produits suivis sont au-dessus de leur seuil.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            sansSeuil > 0 ? (
              <View style={sl.note}>
                <Text style={sl.noteTitre}>
              {sansSeuil} produit(s) avec le seuil par defaut
            </Text>
            <Text style={sl.noteTexte}>
              Le seuil par defaut est 10. Renseignez un autre seuil sur la fiche du produit
              quand son rythme de vente demande une surveillance differente.
            </Text>
              </View>
            ) : null
          }
          renderSectionHeader={({
            section,
          }: {
            section: SectionListData<ProduitStock, Section>;
          }) => (
            <View style={sl.sectionEntete}>
              <Text style={[sl.sectionTitre, { color: section.couleur }]}>{section.titre}</Text>
              <Text style={sl.sectionAide}>{section.aide}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <LigneAlerte
              produit={item}
              onEntree={() =>
                router.push({
                  pathname: '/stock/ajustement',
                  params: { produit: String(item.id), nature: 'ENTREE' },
                })
              }
              onJournal={() =>
                router.push({
                  pathname: '/stock/mouvements',
                  params: { produit: String(item.id) },
                })
              }
            />
          )}
        />
      )}
    </View>
  );
}

function LigneAlerte(p: {
  produit: ProduitStock;
  onEntree: () => void;
  onJournal: () => void;
}) {
  const rupture = p.produit.quantite_base <= 0;
  const seuil = seuilAlerteStock(p.produit.stock_min);
  const manque = arrondirQuantite(seuil - p.produit.quantite_base);

  return (
    <View style={sl.carte}>
      <View style={sl.carteHaut}>
        <View style={sl.carteTextes}>
          <Text style={sl.nom} numberOfLines={2}>
            {p.produit.nom}
          </Text>
          <Text style={sl.meta}>
            {(p.produit.categorie ?? '').trim() === ''
              ? 'Sans categorie'
              : (p.produit.categorie ?? '').trim()}
          </Text>
          {manque > 0 ? (
            <Text style={sl.manque}>
              Il en manque {formaterQuantite(manque)} {p.produit.unite_base} pour revenir au
              seuil
            </Text>
          ) : null}
        </View>

        <View style={sl.carteChiffres}>
          <Text style={[sl.stock, { color: rupture ? C.rouge : C.orange }]}>
            {rupture
              ? 'Rupture'
              : `${formaterQuantite(p.produit.quantite_base)} ${p.produit.unite_base}`}
          </Text>
          <Text style={sl.seuil}>
            Seuil {formaterQuantite(seuil)} {p.produit.unite_base}
          </Text>
        </View>
      </View>

      <View style={sl.carteBas}>
        <Pressable style={sl.lien} onPress={p.onJournal} hitSlop={6}>
          <Text style={sl.lienTexte}>Journal</Text>
        </Pressable>
        <Pressable style={sl.boutonEntree} onPress={p.onEntree}>
          <Text style={sl.boutonEntreeTexte}>Entree de stock</Text>
        </Pressable>
      </View>
    </View>
  );
}

const sl = StyleSheet.create({
  liste: { padding: 12, paddingBottom: 32, gap: 8 },
  listeVide: { flexGrow: 1, padding: 12 },

  resume: {
    backgroundColor: couleurs.avertissementDouce,
    borderWidth: 1,
    borderColor: couleurs.avertissementBordure,
    borderRadius: 10,
    padding: 12,
    gap: 3,
    marginBottom: 4,
  },
  resumeTitre: { fontSize: 15, fontWeight: '700', color: couleurs.avertissementFonce },
  resumeAide: { fontSize: 12, color: couleurs.avertissementFonce, lineHeight: 17 },

  sectionEntete: { paddingTop: 12, paddingBottom: 4, gap: 2 },
  sectionTitre: { fontSize: 14, fontWeight: '700' },
  sectionAide: { fontSize: 12, color: C.texteFaible, lineHeight: 17 },

  carte: {
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    overflow: 'hidden',
  },
  carteHaut: { flexDirection: 'row', gap: 10, padding: 10 },
  carteTextes: { flex: 1, gap: 3 },
  carteChiffres: { alignItems: 'flex-end', gap: 3, maxWidth: 130 },
  nom: { fontSize: 15, fontWeight: '600', color: C.texte },
  meta: { fontSize: 11, color: C.texteFaible },
  manque: { fontSize: 12, color: C.texte, lineHeight: 17 },
  stock: { fontSize: 15, fontWeight: '700' },
  seuil: { fontSize: 11, color: C.texteFaible },

  carteBas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  lien: { paddingVertical: 8, paddingRight: 8 },
  lienTexte: { fontSize: 13, color: C.accent, fontWeight: '600' },
  boutonEntree: {
    flex: 1,
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  boutonEntreeTexte: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  note: {
    marginTop: 16,
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    padding: 12,
    gap: 4,
  },
  noteTitre: { fontSize: 13, fontWeight: '700', color: C.texte },
  noteTexte: { fontSize: 12, color: C.texteFaible, lineHeight: 18 },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centreTitre: { fontSize: 16, fontWeight: '700', color: C.texte },
  centreTexte: { fontSize: 13, color: C.texteFaible, textAlign: 'center', lineHeight: 19 },
  pastille: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: couleurs.succesDouce,
    color: C.vert,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 52,
    overflow: 'hidden',
  },
});
