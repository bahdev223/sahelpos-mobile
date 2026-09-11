/**
 * Inventaires : la liste, et les regles partagees avec l'ecran de comptage.
 *
 * POURQUOI LE STOCK THEORIQUE EST FIGE A LA CREATION
 * --------------------------------------------------
 * Sur le poste de bureau, le stock theorique etait relu depuis le produit a
 * chaque ouverture de l'ecran : entre le comptage et la validation, une vente
 * pouvait changer la reference, et l'ecart affiche ne correspondait plus a ce
 * que le commercant avait compte. Ici, creer un inventaire prend une PHOTO du
 * stock de chaque produit suivi, ecrite dans `ligne_inventaire`. Le comptage se
 * compare toujours a ce qu'on lui a promis, meme repris le lendemain.
 *
 * POURQUOI UN INVENTAIRE ANNULE RESTE VISIBLE
 * -------------------------------------------
 * Le bureau filtrait les listes sur BROUILLON et VALIDE : un inventaire annule
 * disparaissait de l'application sans etre efface. Un comptage abandonne est
 * une information (on a compte, puis renonce), il est donc liste ici, grise.
 */
import type * as SQLite from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useSession } from '../_layout';
import { C, formaterFrancs, formaterQuantite, s } from '../produit/nouveau';
import {
  BARRE_HORIZONTALE, BandeauEtat, Vignette } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { couleurs } from '../../src/ui/theme';
import {
  chargerProduitsStock,
  type ProduitStock,
} from '../(tabs)/stock';

// --------------------------------------------------------------------------
// Regles partagees
// --------------------------------------------------------------------------

export type StatutInventaire = 'BROUILLON' | 'VALIDE' | 'ANNULE';

/**
 * En dessous de ce seuil, un ecart n'en est pas un : c'est le residu des
 * flottants (0.30000000000000004 kg). Aucun ajustement n'est ecrit pour lui.
 */
export const SEUIL_ECART = 0.001;

export function enStatut(valeur: string): StatutInventaire {
  return valeur === 'VALIDE' || valeur === 'ANNULE' ? valeur : 'BROUILLON';
}

export function libelleStatut(statut: StatutInventaire): string {
  if (statut === 'VALIDE') return 'Valide';
  if (statut === 'ANNULE') return 'Annule';
  return 'En cours';
}

export function couleurStatut(statut: StatutInventaire): string {
  if (statut === 'VALIDE') return C.vert;
  if (statut === 'ANNULE') return C.texteFaible;
  return C.orange;
}

/** Dates stockees en ISO : lisibles par SQLite, illisibles par un commercant. */
export function formaterDate(iso: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(date.getDate())}/${deux(date.getMonth() + 1)}/${date.getFullYear()} a ${deux(
    date.getHours(),
  )}h${deux(date.getMinutes())}`;
}

/** Un ecart se lit d'abord a son signe : le "+" est donc toujours ecrit. */
export function formaterEcartFrancs(valeur: number): string {
  const arrondi = Math.round(valeur);
  return arrondi > 0 ? `+${formaterFrancs(arrondi)}` : formaterFrancs(arrondi);
}

export function formaterEcartQuantite(valeur: number): string {
  return valeur > 0 ? `+${formaterQuantite(valeur)}` : formaterQuantite(valeur);
}

export function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

// --------------------------------------------------------------------------
// Acces aux donnees
// --------------------------------------------------------------------------

export interface LigneListeInventaire {
  id: number;
  numero: string;
  statut: string;
  date_creation: string;
  date_validation: string | null;
  utilisateur_nom: string | null;
  nb_produits: number;
  nb_ecarts: number;
  valeur_ecarts: number;
  nb_lignes: number;
  nb_comptes: number;
}

async function chargerInventaires(): Promise<LigneListeInventaire[]> {
  const db = await obtenirBase();
  return db.getAllAsync<LigneListeInventaire>(
    `SELECT i.id, i.numero, i.statut, i.date_creation, i.date_validation,
            i.utilisateur_nom, i.nb_produits, i.nb_ecarts, i.valeur_ecarts,
            (SELECT COUNT(*) FROM ligne_inventaire li
              WHERE li.inventaire_id = i.id) AS nb_lignes,
            (SELECT COUNT(*) FROM ligne_inventaire li
              WHERE li.inventaire_id = i.id AND li.stock_physique IS NOT NULL) AS nb_comptes
       FROM inventaire i
      ORDER BY i.date_creation DESC`,
  );
}

function genererIdLocal(): string {
  const hasard = Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${hasard}`;
}

/**
 * Numero lisible et trie : INV-2026-0004. La sequence repart a 1 chaque annee.
 * Elle est calculee DANS la transaction de creation, sans quoi deux ouvertures
 * simultanees viseraient le meme numero - que la contrainte UNIQUE refuserait
 * en renvoyant une erreur SQLite incomprehensible pour le commercant.
 */
async function genererNumero(db: SQLite.SQLiteDatabase, annee: number): Promise<string> {
  const prefixe = `INV-${annee}-`;
  const dernier = await db.getFirstAsync<{ numero: string }>(
    'SELECT numero FROM inventaire WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1',
    `${prefixe}%`,
  );
  const sequence = dernier ? Number(dernier.numero.slice(prefixe.length)) : 0;
  const suivant = Number.isFinite(sequence) ? sequence + 1 : 1;
  return prefixe + String(suivant).padStart(4, '0');
}

/**
 * Cree un brouillon et fige la photo du stock.
 *
 * Le perimetre est le meme que celui du bureau : les produits actifs dont le
 * stock est suivi. Un produit hors stock (un service, une prestation) n'a rien
 * a faire dans un comptage physique.
 */
export async function creerInventaire(utilisateurNom: string | null): Promise<number> {
  const db = await obtenirBase();
  const maintenant = new Date().toISOString();

  let identifiant = 0;

  await db.withTransactionAsync(async () => {
    const numero = await genererNumero(db, new Date().getFullYear());

    // La photo du stock est prise dans la transaction : un produit cree
    // pendant la lecture ne peut pas se retrouver hors du comptage tout en
    // etant compte dans `nb_produits`.
    const produits = await db.getAllAsync<{
      id: number;
      quantite_base: number;
      prix_achat: number;
    }>(
      `SELECT id, quantite_base, prix_achat
         FROM produit
        WHERE gestion_stock = 1 AND actif = 1
        ORDER BY nom COLLATE NOCASE`,
    );
    if (produits.length === 0) {
      throw new Error(
        "Aucun produit actif n'est suivi en stock : il n'y a rien a compter. Activez le suivi de stock sur au moins un produit.",
      );
    }

    const insertion = await db.runAsync(
      `INSERT INTO inventaire (id_local, numero, statut, date_creation, utilisateur_nom, nb_produits)
       VALUES (?, ?, 'BROUILLON', ?, ?, ?)`,
      genererIdLocal(),
      numero,
      maintenant,
      utilisateurNom,
      produits.length,
    );
    identifiant = insertion.lastInsertRowId;

    for (const produit of produits) {
      await db.runAsync(
        `INSERT INTO ligne_inventaire (inventaire_id, produit_id, stock_theorique,
                                       stock_physique, ecart, valeur_ecart, prix_achat)
         VALUES (?, ?, ?, NULL, NULL, NULL, ?)`,
        identifiant,
        produit.id,
        produit.quantite_base,
        produit.prix_achat,
      );
    }
  });

  if (identifiant === 0) throw new Error("L'inventaire n'a pas pu etre cree.");
  return identifiant;
}

// --------------------------------------------------------------------------
// Ecran
// --------------------------------------------------------------------------

type Filtre = 'tous' | 'nonComptes' | 'ecarts';

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'nonComptes', libelle: 'Non comptes' },
  { cle: 'ecarts', libelle: 'Ecarts' },
];

type Etat =
  | { phase: 'chargement' }
  | { phase: 'erreur'; message: string }
  | { phase: 'pret'; inventaires: LigneListeInventaire[]; produits: ProduitStock[] };

export default function ListeInventaires() {
  const router = useRouter();
  const session = useSession();
  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' });
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [recherche, setRecherche] = useState('');
  const [rafraichissement, setRafraichissement] = useState(false);
  const [creation, setCreation] = useState(false);

  const charger = useCallback(async (silencieux: boolean) => {
    if (!silencieux) setEtat({ phase: 'chargement' });
    try {
      const [inventaires, produits] = await Promise.all([
        chargerInventaires(),
        chargerProduitsStock(),
      ]);
      setEtat({ phase: 'pret', inventaires, produits });
    } catch (erreur) {
      setEtat({ phase: 'erreur', message: messageErreur(erreur) });
    }
  }, []);

  // Un comptage valide ailleurs change les compteurs de cette liste : on
  // recharge a chaque retour plutot que de laisser des chiffres perimes.
  useFocusEffect(
    useCallback(() => {
      void charger(true);
    }, [charger]),
  );

  const rafraichir = useCallback(() => {
    setRafraichissement(true);
    void charger(true).finally(() => setRafraichissement(false));
  }, [charger]);

  const inventaires = etat.phase === 'pret' ? etat.inventaires : [];
  const produits = etat.phase === 'pret' ? etat.produits : [];

  const ouvrir = useCallback(
    (identifiant: number) => {
      router.push({ pathname: '/inventaire/[id]', params: { id: String(identifiant) } });
    },
    [router],
  );

  const creer = useCallback(async () => {
    if (creation) return;
    setCreation(true);
    try {
      const identifiant = await creerInventaire(session.utilisateur?.nom ?? null);
      ouvrir(identifiant);
    } catch (erreur) {
      Alert.alert('Nouvel inventaire', messageErreur(erreur));
    } finally {
      setCreation(false);
    }
  }, [creation, ouvrir, session.utilisateur]);

  const demanderCreation = useCallback(() => {
    const enCours = inventaires.find((i) => enStatut(i.statut) === 'BROUILLON');
    if (!enCours) {
      void creer();
      return;
    }
    // Ouvrir un second comptage pendant qu'un premier traine produit deux
    // photos du meme stock : la seconde validee ecraserait le travail de la
    // premiere. On propose donc d'abord de reprendre.
    Alert.alert(
      'Un comptage est deja en cours',
      `${enCours.numero} a ete ouvert le ${formaterDate(enCours.date_creation)} et n'est pas valide.`,
      [
        { text: 'Reprendre', onPress: () => ouvrir(enCours.id) },
        { text: 'En creer un autre', style: 'destructive', onPress: () => void creer() },
        { text: 'Annuler', style: 'cancel' },
      ],
    );
  }, [creer, inventaires, ouvrir]);

  const statistiques = useMemo(() => {
    const enCours = inventaires.find((i) => enStatut(i.statut) === 'BROUILLON');
    const comptes = enCours?.nb_comptes ?? 0;
    return {
      total: produits.length,
      comptes,
      restants: Math.max(0, produits.length - comptes),
      ecarts: enCours?.nb_ecarts ?? 0,
    };
  }, [inventaires, produits]);

  const produitsFiltres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return produits.filter((produit) => {
      if (filtre === 'ecarts' && produit.quantite_base <= 0) return false;
      if (filtre === 'nonComptes' && statistiques.comptes >= produits.length) return false;
      if (terme === '') return true;
      return (
        produit.nom.toLowerCase().includes(terme) ||
        (produit.categorie ?? '').toLowerCase().includes(terme) ||
        (produit.code_barre ?? '').toLowerCase().includes(terme)
      );
    });
  }, [filtre, produits, recherche, statistiques.comptes]);

  const ouvrirProduit = useCallback(
    (_produit: ProduitStock) => {
      const enCours = inventaires.find((i) => enStatut(i.statut) === 'BROUILLON');
      if (enCours) {
        ouvrir(enCours.id);
        return;
      }
      void demanderCreation();
    },
    [demanderCreation, inventaires, ouvrir],
  );

  return (
    <View style={s.plein}>
      <BandeauEtat />
      <View style={s.entete}>
        {router.canGoBack() ? (
          <Pressable onPress={() => router.back()} style={s.retour} hitSlop={8}>
            <Icone nom="retour" taille={17} couleur={couleurs.primaire} />
            <Text style={s.retourTexte}>Retour</Text>
          </Pressable>
        ) : null}
        <Text style={s.titre}>Inventaire</Text>
      </View>

      {etat.phase === 'chargement' ? (
        <View style={sl.centre}>
          <ActivityIndicator color={C.accent} />
          <Text style={sl.centreTexte}>Chargement des inventaires...</Text>
        </View>
      ) : etat.phase === 'erreur' ? (
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>La liste n&apos;a pas pu etre lue</Text>
          <Text style={sl.centreTexte}>{etat.message}</Text>
          <Pressable style={s.boutonSecondaire} onPress={() => void charger(false)}>
            <Text style={s.boutonSecondaireTexte}>Reessayer</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={produitsFiltres}
          keyExtractor={(produit) => String(produit.id)}
          contentContainerStyle={produitsFiltres.length === 0 ? sl.listeVide : sl.liste}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={rafraichissement} onRefresh={rafraichir} />
          }
          ListHeaderComponent={
            <View style={sl.tete}>
              <View style={sl.intro}>
                <View style={sl.introIcone}>
                  <Icone nom="stock" taille={28} couleur={C.accent} />
                </View>
                <View style={sl.introTextes}>
                  <Text style={sl.introTitre}>Inventaire general</Text>
                  <Text style={sl.introAide}>
                    Verifiez les quantites reelles pour comparer avec le stock theorique.
                  </Text>
                </View>
              </View>
              <View style={sl.cartesStats}>
                <CarteStat titre="Total produits" valeur={String(statistiques.total)} couleur={C.vert} />
                <CarteStat titre="Comptes" valeur={String(statistiques.comptes)} couleur={C.vert} />
                <CarteStat titre="Restants" valeur={String(statistiques.restants)} couleur={C.accent} />
              </View>

              <View style={[s.zoneSaisie, sl.recherche]}>
                <TextInput
                  style={s.saisie}
                  value={recherche}
                  onChangeText={setRecherche}
                  placeholder="Rechercher un produit, un code..."
                  placeholderTextColor={C.texteFaible}
                  autoCapitalize="characters"
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
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={sl.filtres}>
                {FILTRES.map((f) => (
                  <Pressable
                    key={f.cle}
                    style={[s.puce, filtre === f.cle ? s.puceActive : null]}
                    onPress={() => setFiltre(f.cle)}>
                    <Text style={[s.puceTexte, filtre === f.cle ? s.puceTexteActif : null]}>
                      {f.libelle}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          }
          ListEmptyComponent={
            <View style={sl.centre}>
              {produits.length === 0 ? (
                <>
                  <Text style={sl.centreTitre}>Aucun produit a compter</Text>
                  <Text style={sl.centreTexte}>
                    Ajoutez d abord des produits au catalogue pour commencer un inventaire.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={sl.centreTitre}>Aucun resultat</Text>
                  <Text style={sl.centreTexte}>Aucun inventaire ne correspond a ce filtre.</Text>
                  <Pressable
                    style={s.boutonSecondaire}
                    onPress={() => {
                      setRecherche('');
                      setFiltre('tous');
                    }}>
                    <Text style={s.boutonSecondaireTexte}>Effacer les filtres</Text>
                  </Pressable>
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <LigneProduitInventaire produit={item} onPress={() => ouvrirProduit(item)} />
          )}
        />
      )}

      <Pressable
        style={[sl.boutonFlottant, creation ? s.boutonDesactive : null]}
        disabled={creation}
        onPress={demanderCreation}
        accessibilityRole="button">
        <Icone nom="codeBarres" taille={23} couleur="#FFFFFF" />
        <Text style={sl.boutonFlottantTexte}>
          {creation ? 'Preparation...' : 'Scanner un produit'}
        </Text>
      </Pressable>
    </View>
  );
}

// --------------------------------------------------------------------------
// Elements de la liste
// --------------------------------------------------------------------------

function CarteStat(p: { titre: string; valeur: string; couleur?: string; aide?: string }) {
  return (
    <View style={sl.carteStat}>
      <Text style={sl.carteStatTitre}>{p.titre}</Text>
      <Text style={[sl.carteStatValeur, p.couleur ? { color: p.couleur } : null]} numberOfLines={1}>
        {p.valeur}
      </Text>
      {p.aide ? <Text style={sl.carteStatAide}>{p.aide}</Text> : null}
    </View>
  );
}

function LigneProduitInventaire(p: { produit: ProduitStock; onPress: () => void }) {
  return (
    <Pressable style={sl.produitCarte} onPress={p.onPress} accessibilityRole="button">
      <Vignette chemin={p.produit.chemin_image} nom={p.produit.nom} taille={58} />
      <View style={sl.produitTextes}>
        <Text style={sl.produitNom} numberOfLines={2}>{p.produit.nom}</Text>
        <Text style={sl.produitCode} numberOfLines={1}>
          {p.produit.code_barre || p.produit.categorie || 'Produit catalogue'}
        </Text>
        <View style={sl.nonCompte}>
          <Text style={sl.nonCompteTexte}>Non compte</Text>
        </View>
      </View>
      <Icone nom="chevron" taille={21} couleur={C.texte} />
    </Pressable>
  );
}

function CarteInventaire(p: { inventaire: LigneListeInventaire; onPress: () => void }) {
  const statut = enStatut(p.inventaire.statut);
  const couleur = couleurStatut(statut);
  const restants = p.inventaire.nb_lignes - p.inventaire.nb_comptes;

  return (
    <Pressable style={sl.carte} onPress={p.onPress} accessibilityRole="button">
      <View style={sl.carteTete}>
        <Text style={sl.numero}>{p.inventaire.numero}</Text>
        <View style={[sl.badge, { borderColor: couleur }]}>
          <Text style={[sl.badgeTexte, { color: couleur }]}>{libelleStatut(statut)}</Text>
        </View>
      </View>

      <Text style={sl.meta}>
        {statut === 'VALIDE'
          ? `Valide le ${formaterDate(p.inventaire.date_validation)}`
          : `Ouvert le ${formaterDate(p.inventaire.date_creation)}`}
        {p.inventaire.utilisateur_nom ? ` - ${p.inventaire.utilisateur_nom}` : ''}
      </Text>

      {statut === 'BROUILLON' ? (
        <View style={sl.carteBas}>
          <Text style={sl.detail}>
            {p.inventaire.nb_comptes} / {p.inventaire.nb_lignes} produit(s) compte(s)
          </Text>
          <Text style={[sl.detailFort, { color: restants > 0 ? C.orange : C.vert }]}>
            {restants > 0 ? `${restants} a compter` : 'Comptage termine'}
          </Text>
        </View>
      ) : statut === 'VALIDE' ? (
        <View style={sl.carteBas}>
          <Text style={sl.detail}>
            {p.inventaire.nb_produits} produit(s) - {p.inventaire.nb_ecarts} ecart(s)
          </Text>
          <Text
            style={[
              sl.detailFort,
              {
                color:
                  p.inventaire.nb_ecarts === 0
                    ? C.vert
                    : p.inventaire.valeur_ecarts < 0
                      ? C.rouge
                      : C.orange,
              },
            ]}>
            {p.inventaire.nb_ecarts === 0
              ? 'Stock conforme'
              : formaterEcartFrancs(p.inventaire.valeur_ecarts)}
          </Text>
        </View>
      ) : (
        <View style={sl.carteBas}>
          <Text style={sl.detail}>Comptage abandonne, stock inchange</Text>
        </View>
      )}
    </Pressable>
  );
}

// --------------------------------------------------------------------------
// Styles
// --------------------------------------------------------------------------

const sl = StyleSheet.create({
  tete: { gap: 10, paddingBottom: 4 },

  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: couleurs.primaireDouce,
    borderRadius: 10,
    padding: 14,
  },
  introIcone: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DDEBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTextes: { flex: 1, gap: 3 },
  introTitre: { fontSize: 16, fontWeight: '700', color: C.texte },
  introAide: { fontSize: 12, color: C.texteFaible, lineHeight: 18 },

  cartesStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  carteStat: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    padding: 10,
    gap: 2,
  },
  carteStatTitre: { fontSize: 12, color: C.texteFaible },
  carteStatValeur: { fontSize: 19, fontWeight: '700', color: C.texte },
  carteStatAide: { fontSize: 11, color: C.texteFaible },

  produitCarte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    padding: 10,
    minHeight: 82,
  },
  produitTextes: { flex: 1, minWidth: 0, gap: 3 },
  produitNom: { fontSize: 15, fontWeight: '700', color: C.texte },
  produitCode: { fontSize: 12, color: C.texteFaible },
  nonCompte: {
    alignSelf: 'flex-start',
    backgroundColor: couleurs.surfaceDouce,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  nonCompteTexte: { fontSize: 11, color: C.texteFaible, fontWeight: '600' },

  recherche: { backgroundColor: C.carte },
  effacer: { fontSize: 12, color: C.accent, fontWeight: '600' },
  filtres: { gap: 8, paddingRight: 12, alignItems: 'center' },

  liste: { padding: 12, paddingBottom: 96, gap: 8 },
  listeVide: { flexGrow: 1, padding: 12, paddingBottom: 96, gap: 8 },

  carte: {
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    padding: 12,
    gap: 6,
  },
  carteTete: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numero: { flex: 1, fontSize: 16, fontWeight: '700', color: C.texte },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  badgeTexte: { fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 12, color: C.texteFaible },
  carteBas: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
  },
  detail: { fontSize: 13, color: C.texte, flexShrink: 1 },
  detailFort: { fontSize: 13, fontWeight: '700' },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centreTitre: { fontSize: 16, fontWeight: '700', color: C.texte, textAlign: 'center' },
  centreTexte: { fontSize: 13, color: C.texteFaible, textAlign: 'center', lineHeight: 19 },

  boutonFlottant: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    elevation: 3,
  },
  boutonFlottantTexte: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
