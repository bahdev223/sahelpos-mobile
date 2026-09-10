/**
 * Catalogue : la liste de tous les produits, avec recherche et filtre par
 * categorie.
 *
 * C'est l'ecran par lequel on arrive a tout le reste du domaine produit
 * (fiche, creation, categories, import). Il est charge en memoire d'un seul
 * bloc puis filtre localement : une boutique gere quelques centaines de
 * references, et filtrer sans aller-retour SQL rend la recherche instantanee
 * meme sur un telephone d'entree de gamme.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { obtenirBase } from '../../src/db/database';
import { seuilAlerteStock } from '../../src/domain/stock';
import { C, formaterFrancs, formaterQuantite, s, uriImage } from '../produit/nouveau';
import { lireParametres } from '../../src/services/parametres';
import { catalogueHtml, genererEtPartager } from '../../src/services/pdf';
import { BandeauEtat, BARRE_HORIZONTALE, couleurs } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { BoutonMenu } from '../../src/ui/tiroir';
import { useSession } from '../_layout';

// --------------------------------------------------------------------------
// Acces aux donnees
// --------------------------------------------------------------------------

interface LigneCatalogue {
  id: number;
  nom: string;
  categorie: string | null;
  code_barre: string | null;
  prix_unitaire: number;
  prix_achat: number;
  unite_base: string;
  quantite_base: number;
  stock_min: number;
  gestion_stock: number;
  chemin_image: string | null;
  actif: number;
  sous_unites: string | null;
}

async function chargerCatalogue(): Promise<LigneCatalogue[]> {
  const db = await obtenirBase();
  return db.getAllAsync<LigneCatalogue>(
    `SELECT p.id, p.nom, p.categorie, p.code_barre, p.prix_unitaire, p.prix_achat,
            p.unite_base, p.quantite_base, p.stock_min, p.gestion_stock,
            p.chemin_image, p.actif,
            (SELECT GROUP_CONCAT(su.nom, ' / ')
               FROM sous_unite su WHERE su.produit_id = p.id) AS sous_unites
       FROM produit p
      ORDER BY p.nom COLLATE NOCASE`,
  );
}

// --------------------------------------------------------------------------
// Filtrage
// --------------------------------------------------------------------------

/** Recherche insensible aux accents : "Cafe" doit trouver "Cafe". */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const SANS_CATEGORIE = 'Sans categorie';

interface EtatStock {
  texte: string;
  couleur: string;
}

/**
 * Une seule regle de seuil pour tout l'ecran. Le poste de bureau en avait
 * trois (0/5 en dur ici, `stock_min` la, `== 0` ailleurs) et deux ecrans
 * pouvaient designer des produits differents comme "en alerte".
 */
function etatStock(p: LigneCatalogue): EtatStock {
  if (p.gestion_stock === 0) return { texte: 'Stock non suivi', couleur: C.texteFaible };
  if (p.quantite_base <= 0) return { texte: 'Rupture', couleur: C.rouge };
  const quantite = `${formaterQuantite(p.quantite_base)} ${p.unite_base}`;
  if (p.quantite_base <= seuilAlerteStock(p.stock_min)) {
    return { texte: quantite, couleur: C.orange };
  }
  return { texte: quantite, couleur: C.vert };
}

// --------------------------------------------------------------------------
// Ecran
// --------------------------------------------------------------------------

type Etat =
  | { phase: 'chargement' }
  | { phase: 'erreur'; message: string }
  | { phase: 'pret'; produits: LigneCatalogue[] };

export default function Catalogue() {
  const router = useRouter();
  const { revisionSynchronisation, synchroniserMaintenant } = useSession();
  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' });
  const [recherche, setRecherche] = useState('');
  const [categorie, setCategorie] = useState<string | null>(null);
  const [inclureInactifs, setInclureInactifs] = useState(false);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);

  const charger = useCallback(async (silencieux: boolean) => {
    if (!silencieux) setEtat({ phase: 'chargement' });
    try {
      const produits = await chargerCatalogue();
      setEtat({ phase: 'pret', produits });
    } catch (erreur) {
      setEtat({
        phase: 'erreur',
        message: erreur instanceof Error ? erreur.message : String(erreur),
      });
    }
  }, []);

  // Le catalogue se recharge a chaque retour : creation, import et inventaire
  // modifient la liste, et laisser une liste perimee ferait vendre un produit
  // au mauvais prix.
  useFocusEffect(
    useCallback(() => {
      void charger(true);
    }, [charger, revisionSynchronisation]),
  );

  const rafraichir = useCallback(async () => {
    setRafraichissement(true);
    try {
      await synchroniserMaintenant();
      await charger(true);
    } finally {
      setRafraichissement(false);
    }
  }, [charger, synchroniserMaintenant]);

  const produits = etat.phase === 'pret' ? etat.produits : [];

  const categories = useMemo(() => {
    const vues = new Set<string>();
    let sansCategorie = false;
    for (const p of produits) {
      const c = (p.categorie ?? '').trim();
      if (c === '') sansCategorie = true;
      else vues.add(c);
    }
    const liste = Array.from(vues).sort((a, b) => a.localeCompare(b, 'fr'));
    return sansCategorie ? [...liste, SANS_CATEGORIE] : liste;
  }, [produits]);

  const filtres = useMemo(() => {
    const terme = normaliser(recherche.trim());
    return produits.filter((p) => {
      if (!inclureInactifs && p.actif === 0) return false;

      if (categorie !== null) {
        const c = (p.categorie ?? '').trim();
        const correspond = categorie === SANS_CATEGORIE ? c === '' : c === categorie;
        if (!correspond) return false;
      }

      if (terme === '') return true;
      // Le code-barres est reellement cherche ici : sur le poste de bureau le
      // champ le promettait dans son texte d'aide sans jamais le faire.
      return (
        normaliser(p.nom).includes(terme) ||
        normaliser(p.categorie ?? '').includes(terme) ||
        normaliser(p.code_barre ?? '').includes(terme)
      );
    });
  }, [categorie, inclureInactifs, produits, recherche]);

  const exporterPdf = useCallback(async () => {
    setExportEnCours(true);
    try {
      const parametres = await lireParametres();
      const html = catalogueHtml({
        parametres,
        filtre: categorie ?? (recherche.trim() ? `Recherche : ${recherche.trim()}` : undefined),
        produits: filtres.map((p) => ({
          nom: p.nom,
          categorie: p.categorie,
          codeBarre: p.code_barre,
          uniteBase: p.unite_base,
          quantiteBase: p.quantite_base,
          prixUnitaire: p.prix_unitaire,
          gestionStock: p.gestion_stock === 1,
        })),
      });
      const partage = await genererEtPartager(
        html,
        'Catalogue-produits',
        'Envoyer le catalogue',
      );
      if (!partage) {
        Alert.alert(
          'Partage indisponible',
          "Ce telephone ne propose pas de partage de fichier.",
        );
      }
    } catch (e) {
      Alert.alert(
        'Export impossible',
        e instanceof Error ? e.message : "Le catalogue n a pas pu etre prepare.",
      );
    } finally {
      setExportEnCours(false);
    }
  }, [categorie, filtres, recherche]);

  const nbInactifs = useMemo(() => produits.filter((p) => p.actif === 0).length, [produits]);

  return (
    <View style={s.plein}>
      <BandeauEtat />
      <View style={sl.entete}>
        <BoutonMenu />
        <Text style={sl.titreEcran}>Catalogue</Text>
        <View style={sl.enteteActions}>
          <Pressable
            style={sl.actionEntete}
            onPress={() => router.push('/categories')}
            accessibilityLabel="Rayons du catalogue"
          >
            <Icone nom="etiquette" taille={20} couleur={couleurs.primaire} />
          </Pressable>
          <Pressable
            style={sl.actionEntete}
            onPress={() => router.push('/import-produits')}
            accessibilityLabel="Importer des produits"
          >
            <Icone nom="sauvegarde" taille={20} couleur={couleurs.primaire} />
          </Pressable>
          <Pressable
            style={sl.actionEntete}
            onPress={exporterPdf}
            disabled={exportEnCours}
            accessibilityLabel="Exporter le catalogue en PDF"
          >
            {exportEnCours ? (
              <ActivityIndicator size="small" color={couleurs.primaire} />
            ) : (
              <Icone nom="document" taille={20} couleur={couleurs.primaire} />
            )}
          </Pressable>
        </View>
      </View>

      <View style={sl.barreRecherche}>
        <View style={[s.zoneSaisie, s.plein]}>
          <TextInput
            style={s.saisie}
            value={recherche}
            onChangeText={setRecherche}
            placeholder="Nom, categorie ou code-barres"
            placeholderTextColor={C.texteFaible}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {recherche !== '' ? (
            <Pressable onPress={() => setRecherche('')} hitSlop={10}>
              <Text style={sl.effacer}>Effacer</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[BARRE_HORIZONTALE, sl.barreFiltres]}
          contentContainerStyle={sl.filtres}>
          <Pressable
            style={[s.puce, categorie === null ? s.puceActive : null]}
            onPress={() => setCategorie(null)}>
            <Text style={[s.puceTexte, categorie === null ? s.puceTexteActif : null]}>Toutes</Text>
          </Pressable>
          {categories.map((c) => (
            <Pressable
              key={c}
              style={[s.puce, categorie === c ? s.puceActive : null]}
              onPress={() => setCategorie(categorie === c ? null : c)}>
              <Text style={[s.puceTexte, categorie === c ? s.puceTexteActif : null]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {etat.phase === 'chargement' ? (
        <View style={sl.centre}>
          <ActivityIndicator color={C.accent} />
          <Text style={sl.centreTexte}>Chargement du catalogue...</Text>
        </View>
      ) : etat.phase === 'erreur' ? (
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>Le catalogue n&apos;a pas pu etre lu</Text>
          <Text style={sl.centreTexte}>{etat.message}</Text>
          <Pressable style={s.boutonSecondaire} onPress={() => void charger(false)}>
            <Text style={s.boutonSecondaireTexte}>Reessayer</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtres}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={filtres.length === 0 ? sl.listeVide : sl.liste}
          refreshControl={
            <RefreshControl refreshing={rafraichissement} onRefresh={rafraichir} />
          }
          ListEmptyComponent={
            <View style={sl.centre}>
              {produits.length === 0 ? (
                <>
                  <Text style={sl.centreTitre}>Aucun produit</Text>
                  <Text style={sl.centreTexte}>
                    Creez votre premier produit, ou importez votre catalogue depuis un fichier
                    CSV.
                  </Text>
                  <Pressable
                    style={s.boutonSecondaire}
                    onPress={() => router.push('/import-produits')}>
                    <Text style={s.boutonSecondaireTexte}>Importer un fichier CSV</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={sl.centreTitre}>Aucun resultat</Text>
                  <Text style={sl.centreTexte}>
                    Aucun produit ne correspond a cette recherche.
                  </Text>
                  <Pressable
                    style={s.boutonSecondaire}
                    onPress={() => {
                      setRecherche('');
                      setCategorie(null);
                    }}>
                    <Text style={s.boutonSecondaireTexte}>Effacer les filtres</Text>
                  </Pressable>
                </>
              )}
            </View>
          }
          ListFooterComponent={
            filtres.length > 0 ? (
              <View style={sl.pied}>
                <Text style={sl.piedTexte}>
                  {filtres.length === produits.length
                    ? `${produits.length} produit(s)`
                    : `${filtres.length} sur ${produits.length} produit(s)`}
                </Text>
                {nbInactifs > 0 ? (
                  <Pressable onPress={() => setInclureInactifs(!inclureInactifs)}>
                    <Text style={sl.piedLien}>
                      {inclureInactifs
                        ? 'Masquer les produits inactifs'
                        : `Afficher les ${nbInactifs} produit(s) inactif(s)`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <CarteProduit
              produit={item}
              onPress={() =>
                router.push({ pathname: '/produit/[id]', params: { id: String(item.id) } })
              }
            />
          )}
        />
      )}

      <Pressable
        style={sl.boutonFlottant}
        onPress={() => router.push('/produit/nouveau')}
        accessibilityLabel="Nouveau produit"
      >
        <Icone nom="plus" taille={28} couleur={couleurs.texteInverse} />
      </Pressable>
    </View>
  );
}

// --------------------------------------------------------------------------
// Ligne de la liste
// --------------------------------------------------------------------------

function CarteProduit(p: { produit: LigneCatalogue; onPress: () => void }) {
  const image = uriImage(p.produit.chemin_image);
  const stock = etatStock(p.produit);
  const categorie = (p.produit.categorie ?? '').trim();

  return (
    <Pressable style={sl.carte} onPress={p.onPress} accessibilityRole="button">
      {image ? (
        <Image source={{ uri: image }} style={sl.vignette} resizeMode="cover" />
      ) : (
        <View style={[sl.vignette, sl.vignetteVide]}>
          <Text style={sl.vignetteInitiale}>{p.produit.nom.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}

      <View style={sl.corps}>
        <View style={sl.ligneTitre}>
          <Text style={sl.nom} numberOfLines={2}>
            {p.produit.nom}
          </Text>
          {p.produit.actif === 0 ? (
            <View style={sl.etiquetteInactif}>
              <Text style={sl.etiquetteInactifTexte}>Inactif</Text>
            </View>
          ) : null}
        </View>

        <Text style={sl.meta} numberOfLines={1}>
          {categorie === '' ? SANS_CATEGORIE : categorie}
          {' - '}
          {p.produit.unite_base}
          {p.produit.sous_unites ? ` / ${p.produit.sous_unites}` : ''}
        </Text>

        <View style={sl.ligneBas}>
          <Text style={sl.prix}>{formaterFrancs(p.produit.prix_unitaire)}</Text>
          <Text style={[sl.stock, { color: stock.couleur }]}>{stock.texte}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// --------------------------------------------------------------------------
// Styles
// --------------------------------------------------------------------------

const sl = StyleSheet.create({
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: C.carte,
  },
  titreEcran: { fontSize: 20, fontWeight: '700', color: C.texte },
  enteteActions: { flexDirection: 'row', gap: 8 },
  actionEntete: {
    // Carre de 40 : trois libelles ne tenaient pas a cote du titre, le
    // troisieme sortait de l'ecran. Le pictogramme seul tient, et le libelle
    // reste accessible aux lecteurs d'ecran.
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.bordure,
  },
  actionEnteteTexte: { fontSize: 13, color: C.accent, fontWeight: '600' },

  barreRecherche: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: C.carte,
  },
  effacer: { fontSize: 12, color: C.accent, fontWeight: '600' },

  // La contrainte de hauteur vient de BARRE_HORIZONTALE ; ici, juste le fond.
  barreFiltres: { backgroundColor: C.carte },
  filtres: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: C.carte,
    alignItems: 'center',
  },

  liste: { padding: 12, paddingBottom: 96, gap: 8 },
  listeVide: { flexGrow: 1, padding: 12, paddingBottom: 96 },

  carte: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    padding: 10,
    alignItems: 'center',
  },
  vignette: { width: 56, height: 56, borderRadius: 8, backgroundColor: C.fond },
  vignetteVide: { alignItems: 'center', justifyContent: 'center' },
  vignetteInitiale: { fontSize: 22, fontWeight: '700', color: C.texteFaible },

  corps: { flex: 1, gap: 3 },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nom: { flex: 1, fontSize: 15, fontWeight: '600', color: C.texte },
  etiquetteInactif: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: couleurs.dangerDouce,
  },
  etiquetteInactifTexte: { fontSize: 10, color: couleurs.dangerFonce, fontWeight: '700' },
  meta: { fontSize: 12, color: C.texteFaible },
  ligneBas: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  prix: { fontSize: 15, fontWeight: '700', color: C.texte },
  stock: { fontSize: 12, fontWeight: '600' },

  pied: { paddingVertical: 16, gap: 6, alignItems: 'center' },
  piedTexte: { fontSize: 12, color: C.texteFaible },
  piedLien: { fontSize: 12, color: C.accent, fontWeight: '600' },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centreTitre: { fontSize: 16, fontWeight: '700', color: C.texte },
  centreTexte: { fontSize: 13, color: C.texteFaible, textAlign: 'center', lineHeight: 19 },

  boutonFlottant: {
    // Pastille ronde en bas a droite plutot qu'une barre pleine largeur : la
    // barre mangeait le dernier produit de la liste et attirait l'oeil plus
    // que le catalogue lui-meme.
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: couleurs.primaire,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
