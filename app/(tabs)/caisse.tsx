/**
 * Ecran de caisse : l'ecran ouvert cent fois par jour.
 *
 * PARTI PRIS DE DISPOSITION
 * -------------------------
 * La liste des produits occupe tout l'ecran et le panier se resume a une barre
 * basse portant le total en gros caracteres. Sur un telephone, afficher les deux
 * cote a cote donne deux listes trop courtes pour etre utiles. Le panier
 * s'ouvre en pleine page quand on veut le corriger.
 *
 * REGLES METIER REPRISES DU POSTE DE BUREAU
 * -----------------------------------------
 * 1. Prix d'une sous-unite = son prix propre s'il est renseigne, sinon le prix
 *    de l'unite de base multiplie par le facteur. Le poste de bureau connait la
 *    regle mais ne l'applique pas en caisse : il facture le prix du kilo pour un
 *    sac de 50 kg. Elle est appliquee ici.
 * 2. Stock disponible dans une unite = quantite_base / facteur. Le poste de
 *    bureau contient les deux formules (division et multiplication) selon les
 *    ecrans ; seule la division est coherente avec le destockage.
 * 3. Le total est la somme des lignes DEJA arrondies (`calculerTotal`), sinon
 *    le ticket imprime ne correspond pas a ce qu'affiche l'ecran.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import { useFocusEffect } from 'expo-router';

import { obtenirBase } from '../../src/db/database';
import { obtenirProduit } from '../../src/db/repositories/produit';
import {
  libelleVariante,
  listerVariantesProduit,
  trouverVarianteParCodeBarre,
  type VarianteMobile,
} from '../../src/db/repositories/variante';
import { seuilAlerteStock } from '../../src/domain/stock';
import { prixConditionnement, prixGrosConditionnement } from '../../src/domain/quincaillerie';
import type {
  Client,
  LigneVente,
  ModePaiement,
  Produit,
  SousUnite,
  Vente,
} from '../../src/domain/types';
import {
  calculerLigne,
  calculerTotal,
  enregistrerVente,
  StockInsuffisant,
} from '../../src/services/vente';
import type { ArticlePanier, ResultatVente } from '../../src/services/vente';
import { construireRecu, construireRecuAvecLogo } from '../../src/services/impression/recu';
import { serviceImpression } from '../../src/services/impression/imprimante';
import {
  BARRE_HORIZONTALE,
  Bouton,
  Carte,
  Champ,
  Chargement,
  CIBLE_MIN,
  Erreur,
  ListeVide,
  Montant,
  Vignette,
  couleurs,
  espaces,
  formaterMontant,
  formaterQuantite,
  rayons,
} from '../../src/ui/components';

import { useSession } from '../_layout';
import { Icone } from '../../src/ui/icones';
import { BoutonMenu } from '../../src/ui/tiroir';
import { HABILLEMENT_MOBILE_THEME as H } from '../../src/profile-ui/habillement/theme';

// --- Acces aux donnees ------------------------------------------------------

interface LigneProduitSql {
  id: number;
  id_local: string;
  nom: string;
  categorie: string | null;
  marque: string;
  reference_fabricant: string;
  code_barre: string | null;
  prix_unitaire: number;
  prix_gros: number;
  prix_achat: number;
  unite_base: string;
  quantite_base: number;
  stock_min: number;
  gestion_stock: number;
  chemin_image: string | null;
  actif: number;
}

const COLONNES_PRODUIT = `id, id_local, nom, categorie, marque, reference_fabricant,
  code_barre, prix_unitaire, prix_gros, prix_achat, unite_base, quantite_base,
  stock_min, gestion_stock, chemin_image, actif`;

function versProduit(ligne: LigneProduitSql): Produit {
  return {
    id: ligne.id,
    idLocal: ligne.id_local,
    nom: ligne.nom,
    categorie: ligne.categorie,
    marque: ligne.marque,
    referenceFabricant: ligne.reference_fabricant,
    codeBarre: ligne.code_barre,
    prixUnitaire: ligne.prix_unitaire,
    prixGros: ligne.prix_gros,
    prixAchat: ligne.prix_achat,
    uniteBase: ligne.unite_base,
    quantiteBase: ligne.quantite_base,
    stockMin: ligne.stock_min,
    gestionStock: ligne.gestion_stock === 1,
    cheminImage: ligne.chemin_image,
    actif: ligne.actif === 1,
  };
}

async function rechercherProduits(terme: string): Promise<Produit[]> {
  const db = await obtenirBase();
  const propre = terme.trim();
  if (propre.length === 0) {
    const lignes = await db.getAllAsync<LigneProduitSql>(
      `SELECT ${COLONNES_PRODUIT} FROM produit WHERE actif = 1 ORDER BY nom LIMIT 80`,
    );
    return lignes.map(versProduit);
  }
  const motif = `%${propre}%`;
  const lignes = await db.getAllAsync<LigneProduitSql>(
    `SELECT ${COLONNES_PRODUIT} FROM produit
     WHERE actif = 1 AND (
       nom LIKE ? OR code_barre LIKE ? OR categorie LIKE ?
       OR marque LIKE ? OR reference_fabricant LIKE ?
     )
     ORDER BY nom LIMIT 80`,
    motif,
    motif,
    motif,
    motif,
    motif,
  );
  return lignes.map(versProduit);
}

async function produitParCode(code: string): Promise<Produit | null> {
  const db = await obtenirBase();
  const ligne = await db.getFirstAsync<LigneProduitSql>(
    `SELECT ${COLONNES_PRODUIT} FROM produit WHERE code_barre = ? AND actif = 1`,
    code,
  );
  return ligne ? versProduit(ligne) : null;
}

async function chargerSousUnites(produitId: number): Promise<SousUnite[]> {
  const db = await obtenirBase();
  const lignes = await db.getAllAsync<{
    id: number;
    produit_id: number;
    nom: string;
    facteur: number;
    prix: number;
    prix_gros: number;
  }>(
    'SELECT id, produit_id, nom, facteur, prix, prix_gros FROM sous_unite WHERE produit_id = ? ORDER BY facteur',
    produitId,
  );
  // Un facteur nul ou negatif rendrait toute conversion absurde (division par
  // zero pour le stock disponible) : ces lignes sont ecartees a la lecture.
  return lignes
    .filter((l) => l.facteur > 0)
    .map((l) => ({
      id: l.id,
      produitId: l.produit_id,
      nom: l.nom,
      facteur: l.facteur,
      prix: l.prix,
      prixGros: l.prix_gros,
    }));
}

async function chargerClients(): Promise<Client[]> {
  const db = await obtenirBase();
  const lignes = await db.getAllAsync<{
    id: number;
    id_local: string;
    nom: string;
    telephone: string | null;
    email: string | null;
    adresse: string | null;
    chemin_photo: string | null;
  }>('SELECT id, id_local, nom, telephone, email, adresse, chemin_photo FROM client ORDER BY nom LIMIT 200');
  return lignes.map((l) => ({
    id: l.id,
    idLocal: l.id_local,
    nom: l.nom,
    telephone: l.telephone,
    email: l.email,
    adresse: l.adresse,
    cheminPhoto: l.chemin_photo,
  }));
}

// --- Unites et prix ---------------------------------------------------------

interface OptionUnite {
  nom: string;
  facteur: number;
  prix: number;
  prixGros: number;
}

function optionsUnites(produit: Produit, sousUnites: SousUnite[]): OptionUnite[] {
  const base: OptionUnite = {
    nom: produit.uniteBase,
    facteur: 1,
    prix: Math.round(produit.prixUnitaire),
    prixGros: Math.round(produit.prixGros ?? 0),
  };
  const autres = sousUnites.map<OptionUnite>((su) => ({
    nom: su.nom,
    facteur: su.facteur,
    prix: prixConditionnement(produit.prixUnitaire, su.prix, su.facteur),
    prixGros: prixGrosConditionnement(produit.prixGros ?? 0, su.prixGros, su.facteur),
  }));
  return [base, ...autres];
}

/** Stock exprime dans l'unite demandee. Voir la regle 2 en tete de fichier. */
function stockDansUnite(produit: Produit, facteur: number): number {
  return facteur > 0 ? produit.quantiteBase / facteur : produit.quantiteBase;
}

function quantiteBaseAuPanier(panier: ArticlePanier[], produitId: number): number {
  return panier
    .filter((article) => article.produit.id === produitId)
    .reduce((somme, article) => somme + article.quantite * article.facteur, 0);
}

// --- Ecran ------------------------------------------------------------------

interface ChoixProduit {
  produit: Produit;
  unites: OptionUnite[];
  variantes: VarianteMobile[];
  varianteInitialeId?: number | null;
}

interface VenteTerminee {
  resultat: ResultatVente;
  modePaiement: ModePaiement;
  /** Ce qui est reellement encaisse, donc enregistre en base. */
  montantPaye: number;
  /**
   * Ce que le client a tendu. Distinct du precedent : enregistrer le billet de
   * 10 000 pour un achat de 7 300 gonflerait la caisse du jour, mais le recu
   * doit bien montrer la monnaie rendue.
   */
  montantRecu: number;
  clientId: number | null;
  dateVente: string;
}

type EtatListe = 'chargement' | 'pret' | 'erreur';

export default function EcranCaisse() {
  const { boutique, utilisateur, revisionSynchronisation, profilCommerce } = useSession();
  const habillement = profilCommerce?.secteur === 'HABILLEMENT';
  const quincaillerie = profilCommerce?.secteur === 'QUINCAILLERIE';
  const variantesActives = profilCommerce?.capabilities_effectives.includes('PRODUCT_VARIANTS') ?? false;

  const [recherche, setRecherche] = useState('');
  const [categorie, setCategorie] = useState<string | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [etatListe, setEtatListe] = useState<EtatListe>('chargement');
  const [erreurListe, setErreurListe] = useState('');
  const [catalogueVide, setCatalogueVide] = useState(false);

  const [panier, setPanier] = useState<ArticlePanier[]>([]);
  const [choix, setChoix] = useState<ChoixProduit | null>(null);
  const [scanOuvert, setScanOuvert] = useState(false);
  const [panierOuvert, setPanierOuvert] = useState(false);
  const [paiementOuvert, setPaiementOuvert] = useState(false);
  const [venteTerminee, setVenteTerminee] = useState<VenteTerminee | null>(null);
  const [alertePanier, setAlertePanier] = useState<string | null>(null);

  const totalPanier = useMemo(() => calculerTotal(panier), [panier]);
  const nbArticles = panier.length;

  // Les categories viennent des produits eux-memes : une liste figee finirait
  // par proposer des rayons vides, ou par oublier ceux qu'on vient de creer.
  const categories = useMemo(() => {
    const vues = new Set<string>();
    for (const produit of produits) {
      if (produit.categorie) vues.add(produit.categorie);
    }
    return Array.from(vues).sort((a, b) => a.localeCompare(b));
  }, [produits]);

  const produitsAffiches = useMemo(
    () => (categorie ? produits.filter((p) => p.categorie === categorie) : produits),
    [produits, categorie],
  );

  // Un rayon qui disparait (dernier produit vendu, recherche affinee) ne doit
  // pas laisser un filtre actif sur une liste vide.
  useEffect(() => {
    if (categorie && !categories.includes(categorie)) setCategorie(null);
  }, [categories, categorie]);

  // Numero de la derniere recherche lancee. Deux requetes peuvent revenir dans
  // le desordre : sans ce compteur, une recherche abandonnee qui repond en
  // retard remplace le resultat de la recherche en cours.
  const numeroRecherche = useRef(0);

  const charger = useCallback(async (terme: string) => {
    const numero = ++numeroRecherche.current;
    try {
      const trouves = await rechercherProduits(terme);
      if (numero !== numeroRecherche.current) return;
      setProduits(trouves);
      if (terme.trim().length === 0) setCatalogueVide(trouves.length === 0);
      setEtatListe('pret');
    } catch (erreur) {
      if (numero !== numeroRecherche.current) return;
      setErreurListe(
        erreur instanceof Error ? erreur.message : 'Le catalogue est illisible.',
      );
      setEtatListe('erreur');
    }
  }, []);

  // Recherche differee : relancer une requete a chaque lettre fait clignoter la
  // liste et gele la frappe sur les appareils lents.
  useEffect(() => {
    const minuteur = setTimeout(() => void charger(recherche), 220);
    return () => clearTimeout(minuteur);
  }, [recherche, charger]);

  // Le stock a pu bouger pendant qu'on etait sur un autre onglet. Le terme
  // recherche passe par une reference : le mettre en dependance relancerait
  // cet effet a chaque lettre tapee, en doublon de la recherche differee.
  const termeCourant = useRef(recherche);
  termeCourant.current = recherche;

  useFocusEffect(
    useCallback(() => {
      void charger(termeCourant.current);
    }, [charger, revisionSynchronisation]),
  );

  const ouvrirChoix = useCallback(async (
    produit: Produit,
    varianteInitiale?: VarianteMobile | null,
  ) => {
    let sousUnites: SousUnite[] = [];
    let variantes: VarianteMobile[] = [];
    try {
      sousUnites = await chargerSousUnites(produit.id);
    } catch {
      // Sans ses sous-unites le produit reste vendable a l'unite de base.
      sousUnites = [];
    }
    if (variantesActives) {
      try {
        variantes = await listerVariantesProduit(produit.id);
      } catch {
        variantes = [];
      }
    }
    setChoix({
      produit,
      unites: optionsUnites(produit, sousUnites),
      variantes,
      varianteInitialeId: varianteInitiale?.id ?? null,
    });
  }, [variantesActives]);

  const ajouterAuPanier = useCallback(
    (
      produit: Produit,
      unite: OptionUnite,
      quantite: number,
      variante?: VarianteMobile | null,
    ) => {
      setPanier((actuel) => {
        const index = actuel.findIndex(
          (article) =>
            article.produit.id === produit.id &&
            article.unite === unite.nom &&
            (article.variante?.id ?? null) === (variante?.id ?? null),
        );
        if (index >= 0) {
          const copie = [...actuel];
          copie[index] = {
            ...copie[index],
            quantite: copie[index].quantite + quantite,
          };
          return copie;
        }
        return [
          ...actuel,
          {
            produit,
            variante: variante ?? null,
            unite: unite.nom,
            facteur: unite.facteur,
            quantite,
            prixUnitaire: unite.prix,
          },
        ];
      });
      setChoix(null);
    },
    [],
  );

  const modifierQuantite = useCallback(
    (index: number, delta: number) => {
      const article = panier[index];
      if (!article) return;
      const nouvelle = Math.round((article.quantite + delta) * 1000) / 1000;
      if (nouvelle <= 0) return;

      // Le plafond est verifie ici et pas seulement a l'enregistrement :
      // decouvrir le manque de stock apres avoir annonce le total au client
      // oblige a refaire le ticket devant lui.
      if (article.produit.gestionStock) {
        const autresLignes = panier.reduce(
          (somme, ligne, i) =>
            i !== index && ligne.produit.id === article.produit.id
              ? somme + ligne.quantite * ligne.facteur
              : somme,
          0,
        );
        if (autresLignes + nouvelle * article.facteur > article.produit.quantiteBase) {
          setAlertePanier(`Stock insuffisant pour ${article.produit.nom}.`);
          return;
        }
      }

      setAlertePanier(null);
      setPanier((actuel) =>
        actuel.map((ligne, i) => (i === index ? { ...ligne, quantite: nouvelle } : ligne)),
      );
    },
    [panier],
  );

  const retirerLigne = useCallback((index: number) => {
    setAlertePanier(null);
    setPanier((actuel) => actuel.filter((rien, i) => i !== index));
  }, []);

  const viderPanier = useCallback(() => {
    setPanier([]);
    setAlertePanier(null);
    setPanierOuvert(false);
  }, []);

  const surCodeScanne = useCallback(
    async (code: string): Promise<string | null> => {
      if (variantesActives) {
        const variante = await trouverVarianteParCodeBarre(code);
        if (variante) {
          const produit = await obtenirProduit(variante.produitId);
          if (!produit) return `Le modèle de la variante ${code} est introuvable.`;
          setScanOuvert(false);
          await ouvrirChoix(produit, variante);
          return null;
        }
      }
      const produit = await produitParCode(code);
      if (!produit) return `Aucun produit ne porte le code ${code}.`;
      setScanOuvert(false);
      await ouvrirChoix(produit);
      return null;
    },
    [ouvrirChoix, variantesActives],
  );

  const surVenteEnregistree = useCallback(
    (terminee: VenteTerminee) => {
      setVenteTerminee(terminee);
      setPaiementOuvert(false);
      setPanierOuvert(false);
      setPanier([]);
      void charger(recherche);
    },
    [charger, recherche],
  );

  const rendu = () => {
    if (etatListe === 'chargement') {
      return <Chargement message="Lecture du catalogue..." />;
    }
    if (etatListe === 'erreur') {
      return (
        <Erreur
          titre="Catalogue indisponible"
          message={erreurListe}
          onReessayer={() => {
            setEtatListe('chargement');
            void charger(recherche);
          }}
        />
      );
    }
    if (produits.length === 0) {
      return catalogueVide ? (
        <ListeVide
          titre="Aucun produit enregistre"
          message="Ajoutez vos articles depuis l'onglet Catalogue, puis revenez encaisser."
        />
      ) : (
        <ListeVide
          titre="Aucun resultat"
          message={`Rien ne correspond a "${recherche.trim()}".`}
          actionTitre="Effacer la recherche"
          onAction={() => setRecherche('')}
        />
      );
    }
    return (
      <FlatList
        data={produitsAffiches}
        keyExtractor={(produit) => String(produit.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.grille}
        // Trois par ligne : au-dela la photo devient trop petite pour
        // reconnaitre un article d'un coup d'oeil, en deca on fait trop
        // defiler pendant qu'un client attend.
        numColumns={3}
        columnWrapperStyle={styles.grilleLigne}
        ListHeaderComponent={
          categories.length > 0 ? (
            <FiltresCategorie
              categories={categories}
              active={categorie}
              onChoisir={setCategorie}
            />
          ) : null
        }
        ListEmptyComponent={
          <ListeVide
            titre="Rayon vide"
            message={`Aucun produit dans "${categorie ?? ''}" pour cette recherche.`}
            actionTitre="Voir tous les rayons"
            onAction={() => setCategorie(null)}
          />
        }
        renderItem={({ item }) => (
          <CarteProduit
            produit={item}
            devise={boutique.devise}
            habillement={habillement}
            onPress={() => void ouvrirChoix(item)}
          />
        )}
      />
    );
  };

  return (
    <SafeAreaView
      style={[styles.ecran, habillement && { backgroundColor: H.fond }]}
      edges={['top']}
    >
      <View style={[
        styles.enteteCaisse,
        habillement && { backgroundColor: H.primaire, paddingBottom: espaces.s },
      ]}>
        <BoutonMenu couleur={habillement ? '#FFFFFF' : couleurs.texte} />
        <View style={{ flex: 1 }}>
          <Text style={[
            styles.enteteCaisseTitre,
            habillement && { color: '#FFFFFF', fontWeight: '900' },
          ]}>
            {habillement ? 'Caisse Mode' : 'Caisse'}
          </Text>
          {habillement ? (
            <Text style={{ color: H.primaireClair, fontSize: 10, marginTop: 1 }}>
              Modèles · tailles · couleurs
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.barreRecherche}>
        <Champ
          valeur={recherche}
          onChangeText={setRecherche}
          placeholder="Nom, categorie ou code-barres"
          retourClavier="search"
          style={styles.champRecherche}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scanner un code-barres"
          onPress={() => setScanOuvert(true)}
          style={({ pressed }) => [
            styles.boutonScan,
            habillement && { backgroundColor: H.primaire },
            pressed && styles.presse,
          ]}
        >
          <Icone nom="codeBarres" taille={18} couleur={couleurs.texteInverse} />
          <Text style={styles.boutonScanTexte}>Scanner</Text>
        </Pressable>
      </View>

      {rendu()}

      <BarrePanier
        nbArticles={nbArticles}
        total={totalPanier}
        devise={boutique.devise}
        habillement={habillement}
        onVoirPanier={() => setPanierOuvert(true)}
        onEncaisser={() => setPaiementOuvert(true)}
      />

      {choix ? (
        <ModaleUnite
          choix={choix}
          panier={panier}
          devise={boutique.devise}
          quincaillerie={quincaillerie}
          onAnnuler={() => setChoix(null)}
          onAjouter={ajouterAuPanier}
        />
      ) : null}

      <ModaleScan
        visible={scanOuvert}
        onFermer={() => setScanOuvert(false)}
        onCode={surCodeScanne}
      />

      <ModalePanier
        visible={panierOuvert}
        panier={panier}
        devise={boutique.devise}
        total={totalPanier}
        alerte={alertePanier}
        onFermer={() => {
          setAlertePanier(null);
          setPanierOuvert(false);
        }}
        onModifier={modifierQuantite}
        onRetirer={retirerLigne}
        onVider={viderPanier}
        onEncaisser={() => {
          setPanierOuvert(false);
          setPaiementOuvert(true);
        }}
      />

      <ModalePaiement
        visible={paiementOuvert && panier.length > 0}
        panier={panier}
        total={totalPanier}
        devise={boutique.devise}
        utilisateurId={utilisateur ? utilisateur.id : null}
        onFermer={() => setPaiementOuvert(false)}
        onTerminee={surVenteEnregistree}
      />

      {venteTerminee ? (
        <ModaleRecu
          terminee={venteTerminee}
          onFermer={() => setVenteTerminee(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

// --- Ligne du catalogue -----------------------------------------------------

/**
 * Filtres par rayon, au-dessus de la grille.
 *
 * "Toutes" en premier et toujours present : c'est l'etat de repos, celui ou le
 * commercant doit pouvoir revenir sans reflechir.
 */
function FiltresCategorie({
  categories,
  active,
  onChoisir,
}: {
  categories: string[];
  active: string | null;
  onChoisir: (categorie: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      style={BARRE_HORIZONTALE}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filtres}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        onPress={() => onChoisir(null)}
        style={[styles.puceRayon, active === null && styles.puceRayonActive]}
      >
        <Text style={[styles.puceRayonTexte, active === null && styles.puceRayonTexteActive]}>
          Toutes
        </Text>
      </Pressable>
      {categories.map((nom) => (
        <Pressable
          key={nom}
          onPress={() => onChoisir(nom)}
          style={[styles.puceRayon, active === nom && styles.puceRayonActive]}
        >
          <Text style={[styles.puceRayonTexte, active === nom && styles.puceRayonTexteActive]}>
            {nom}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/**
 * Un produit dans la grille de la caisse.
 *
 * POURQUOI UNE PHOTO PLUTOT QU'UNE LIGNE DE TEXTE : en caisse on cherche un
 * article, on ne lit pas un tableau. Une photo se reconnait sans lire, ce qui
 * compte quand quelqu'un attend devant le comptoir. Les articles sans photo
 * gardent la meme place, avec leurs initiales, pour que la grille reste
 * alignee.
 *
 * POURQUOI LA RUPTURE RESTE VISIBLE ET TOUCHABLE : un produit en rupture doit
 * se voir, mais rien n'interdit de le vendre — le stock du telephone n'est pas
 * toujours a jour de ce qui est reellement en rayon.
 */
function CarteProduit({
  produit,
  devise,
  habillement,
  onPress,
}: {
  produit: Produit;
  devise: string;
  habillement: boolean;
  onPress: () => void;
}) {
  const rupture = produit.gestionStock && produit.quantiteBase <= 0;
  const bas =
    produit.gestionStock &&
    produit.quantiteBase > 0 &&
    produit.quantiteBase <= seuilAlerteStock(produit.stockMin);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.carte,
        habillement && { backgroundColor: H.surface, borderColor: H.bordure },
        pressed && styles.presse,
      ]}
    >
      <View style={styles.cartePhoto}>
        <Vignette chemin={produit.cheminImage} nom={produit.nom} taille={72} />
        {rupture ? (
          <View style={[styles.pastille, styles.pastilleRupture]}>
            <Text style={styles.pastilleTexte}>Rupture</Text>
          </View>
        ) : bas ? (
          <View style={[styles.pastille, styles.pastilleBas]}>
            <Text style={styles.pastilleTexte}>Bas</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.carteNom} numberOfLines={2}>
        {produit.nom}
      </Text>
      <Text
        style={[styles.cartePrix, habillement && { color: H.primaire }]}
        numberOfLines={1}
      >
        {formaterMontant(produit.prixUnitaire, devise)}
      </Text>
    </Pressable>
  );
}

// --- Barre basse ------------------------------------------------------------

function BarrePanier({
  nbArticles,
  total,
  devise,
  habillement,
  onVoirPanier,
  onEncaisser,
}: {
  nbArticles: number;
  total: number;
  devise: string;
  habillement: boolean;
  onVoirPanier: () => void;
  onEncaisser: () => void;
}) {
  const vide = nbArticles === 0;
  return (
    <View style={[
      styles.barrePanier,
      habillement && { backgroundColor: H.surface, borderTopColor: H.bordure },
    ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voir le panier"
        disabled={vide}
        onPress={onVoirPanier}
        style={({ pressed }) => [styles.zoneTotal, pressed && styles.presse]}
      >
        <Text style={styles.zoneTotalLibelle}>
          {vide
            ? 'Panier vide'
            : `${nbArticles} ligne${nbArticles > 1 ? 's' : ''} - modifier`}
        </Text>
        <Montant valeur={total} devise={devise} taille="grand" />
      </Pressable>
      <Bouton
        titre="Encaisser"
        onPress={onEncaisser}
        desactive={vide}
        style={styles.boutonEncaisser}
      />
    </View>
  );
}

// --- Entete commune aux modales ---------------------------------------------

function EnteteModale({ titre, onFermer }: { titre: string; onFermer: () => void }) {
  return (
    <View style={styles.enteteModale}>
      <Text style={styles.titreModale} numberOfLines={1}>
        {titre}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fermer"
        onPress={onFermer}
        style={({ pressed }) => [styles.fermer, pressed && styles.presse]}
      >
        <Text style={styles.fermerTexte}>Fermer</Text>
      </Pressable>
    </View>
  );
}

// --- Choix de l'unite et de la quantite -------------------------------------

function ModaleUnite({
  choix,
  panier,
  devise,
  quincaillerie,
  onAnnuler,
  onAjouter,
}: {
  choix: ChoixProduit;
  panier: ArticlePanier[];
  devise: string;
  quincaillerie: boolean;
  onAnnuler: () => void;
  onAjouter: (
    produit: Produit,
    unite: OptionUnite,
    quantite: number,
    variante?: VarianteMobile | null,
  ) => void;
}) {
  const indexInitial = choix.varianteInitialeId
    ? choix.variantes.findIndex((v) => v.id === choix.varianteInitialeId)
    : -1;
  const [indexVariante, setIndexVariante] = useState(indexInitial);
  const [indexUnite, setIndexUnite] = useState(0);
  const [quantiteTexte, setQuantiteTexte] = useState('1');
  const [tarif, setTarif] = useState<'detail' | 'gros'>('detail');

  const variante = indexVariante >= 0 ? choix.variantes[indexVariante] : null;
  const unite = choix.unites[indexUnite] ?? choix.unites[0];
  const prixDetail = variante?.prixOverride ?? unite?.prix ?? 0;
  const prixGros = unite?.prixGros ?? 0;
  const prixDefaut = tarif === 'gros' && prixGros > 0 ? prixGros : prixDetail;
  const [prixTexte, setPrixTexte] = useState(String(prixDefaut));

  const quantite = lireNombre(quantiteTexte);
  const prixUnitaire = lireNombre(prixTexte);
  const produit = choix.produit;
  const exigeVariante = choix.variantes.length > 0;

  const dejaAuPanier = panier
    .filter((article) =>
      article.produit.id === produit.id &&
      (article.variante?.id ?? null) === (variante?.id ?? null))
    .reduce((somme, article) => somme + article.quantite * article.facteur, 0);

  const disponibleBase = variante ? variante.stockActuel : produit.quantiteBase;
  const disponible = unite.facteur > 0 ? disponibleBase / unite.facteur : disponibleBase;
  const resteApresPanier = disponible - dejaAuPanier / unite.facteur;

  const ligne =
    quantite > 0
      ? calculerLigne({
          produit,
          variante,
          unite: unite.nom,
          facteur: unite.facteur,
          quantite,
          prixUnitaire,
        })
      : null;

  let refus: string | null = null;
  if (exigeVariante && !variante) {
    refus = 'Choisissez la taille et la couleur avant d ajouter au panier.';
  } else if (quantite <= 0) {
    refus = 'Indiquez une quantite superieure a zero.';
  } else if (prixUnitaire <= 0) {
    refus = "Ce modele n'a pas de prix de vente pour cette variante.";
  } else if (produit.gestionStock && quantite > resteApresPanier) {
    refus = `Stock insuffisant : ${formaterQuantite(
      Math.max(0, Math.round(resteApresPanier * 1000) / 1000),
    )} ${unite.nom} disponible(s).`;
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onAnnuler}>
      <View style={styles.voile}>
        <View style={styles.feuille}>
          <EnteteModale titre={produit.nom} onFermer={onAnnuler} />

          <ScrollView
            contentContainerStyle={styles.contenuFeuille}
            keyboardShouldPersistTaps="handled"
          >
            {quincaillerie ? (
              <View style={styles.tarifs}>
                <Pressable
                  style={[styles.tarifChoix, tarif === 'detail' && styles.tarifChoixActif]}
                  onPress={() => {
                    setTarif('detail');
                    setPrixTexte(String(prixDetail));
                  }}
                >
                  <Text style={[styles.tarifTexte, tarif === 'detail' && styles.tarifTexteActif]}>
                    Détail · {formaterMontant(prixDetail, devise)}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={prixGros <= 0}
                  style={[
                    styles.tarifChoix,
                    tarif === 'gros' && styles.tarifChoixActif,
                    prixGros <= 0 && styles.tarifChoixInactif,
                  ]}
                  onPress={() => {
                    if (prixGros <= 0) return;
                    setTarif('gros');
                    setPrixTexte(String(prixGros));
                  }}
                >
                  <Text style={[styles.tarifTexte, tarif === 'gros' && styles.tarifTexteActif]}>
                    {prixGros > 0 ? `Gros · ${formaterMontant(prixGros, devise)}` : 'Gros non défini'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {choix.variantes.length > 0 ? (
              <View>
                <Text style={styles.sousLabel}>
                  {quincaillerie ? 'Caractéristiques / variante' : 'Taille / couleur'}
                </Text>
                <View style={styles.grilleVariantes}>
                  {choix.variantes.map((option, index) => {
                    const actif = index === indexVariante;
                    const couleur = option.valeurs.find((v) => v.codeHex)?.codeHex ?? null;
                    return (
                      <Pressable
                        key={option.idLocal}
                        accessibilityRole="button"
                        accessibilityState={{ selected: actif }}
                        onPress={() => {
                          setIndexVariante(index);
                          const u = choix.unites[indexUnite] ?? choix.unites[0];
                          const detail = option.prixOverride ?? u?.prix ?? produit.prixUnitaire;
                          const gros = u?.prixGros ?? 0;
                          setPrixTexte(String(tarif === 'gros' && gros > 0 ? gros : detail));
                        }}
                        style={[
                          styles.varianteChoix,
                          choix.variantes.length > 0 && {
                            borderColor: H.bordure,
                            backgroundColor: H.surface,
                          },
                          actif && [
                            styles.varianteChoixActive,
                            { backgroundColor: H.primaire, borderColor: H.primaire },
                          ],
                          option.stockActuel <= 0 && styles.varianteChoixRupture,
                        ]}
                      >
                        <View style={styles.varianteChoixHaut}>
                          {couleur ? (
                            <View style={[styles.pastilleCouleur, { backgroundColor: couleur }]} />
                          ) : null}
                          <Text
                            style={[styles.varianteChoixNom, actif && styles.puceNomActive]}
                            numberOfLines={2}
                          >
                            {libelleVariante(option)}
                          </Text>
                        </View>
                        <Text style={[styles.varianteChoixStock, actif && styles.puceDetailActive]}>
                          {option.stockActuel > 0
                            ? `Stock ${formaterQuantite(option.stockActuel)}`
                            : 'Rupture'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {choix.unites.length > 1 ? (
              <View>
                <Text style={styles.sousLabel}>Unite de vente</Text>
                <View style={styles.grilleChoix}>
                  {choix.unites.map((option, index) => {
                    const actif = index === indexUnite;
                    return (
                      <Pressable
                        key={option.nom}
                        accessibilityRole="button"
                        accessibilityState={{ selected: actif }}
                        onPress={() => {
                          setIndexUnite(index);
                          const detail = variante?.prixOverride ??
                            (option.prix > 0 ? option.prix : produit.prixUnitaire * option.facteur);
                          const gros = option.prixGros ?? 0;
                          if (tarif === 'gros' && gros <= 0) setTarif('detail');
                          setPrixTexte(String(tarif === 'gros' && gros > 0 ? gros : detail));
                        }}
                        style={[styles.puce, actif && styles.puceActive]}
                      >
                        <Text style={[styles.puceNom, actif && styles.puceNomActive]}>
                          {option.nom}
                        </Text>
                        <Text style={[styles.puceDetail, actif && styles.puceDetailActive]}>
                          {formaterMontant(option.prix, devise)}
                          {option.facteur !== 1
                            ? ` - ${formaterQuantite(option.facteur)} ${produit.uniteBase}`
                            : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Text style={styles.sousLabel}>Quantite</Text>
            <View style={styles.compteur}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retirer un"
                onPress={() =>
                  setQuantiteTexte(String(Math.max(1, Math.round((quantite - 1) * 1000) / 1000)))
                }
                style={({ pressed }) => [styles.pas, pressed && styles.presse]}
              >
                <Text style={styles.pasTexte}>-</Text>
              </Pressable>
              <Champ
                valeur={quantiteTexte}
                onChangeText={setQuantiteTexte}
                clavier="decimal-pad"
                alignerADroite
                style={styles.champQuantite}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ajouter un"
                onPress={() =>
                  setQuantiteTexte(String(Math.round((quantite + 1) * 1000) / 1000))
                }
                style={({ pressed }) => [styles.pas, pressed && styles.presse]}
              >
                <Text style={styles.pasTexte}>+</Text>
              </Pressable>
            </View>

            <Champ
              valeur={prixTexte}
              onChangeText={setPrixTexte}
              label="Prix unitaire"
              clavier="numeric"
              alignerADroite
              style={styles.champEspace}
            />

            <Carte style={styles.resume}>
              {variante ? (
                <LigneResume libelle="Variante" valeur={libelleVariante(variante)} />
              ) : null}
              <LigneResume
                libelle="Prix unitaire"
                valeur={formaterMontant(prixUnitaire, devise)}
              />
              <LigneResume
                libelle="Disponible"
                valeur={
                  produit.gestionStock
                    ? `${formaterQuantite(Math.round(disponible * 1000) / 1000)} ${unite.nom}`
                    : 'Stock non suivi'
                }
              />
              <LigneResume
                libelle="Total de la ligne"
                valeur={formaterMontant(ligne ? ligne.total : 0, devise)}
                fort
              />
            </Carte>

            {refus ? <Text style={styles.refus}>{refus}</Text> : null}
          </ScrollView>

          <View style={styles.piedFeuille}>
            <Bouton
              titre="Ajouter au panier"
              onPress={() =>
                onAjouter(
                  produit,
                  { ...unite, prix: prixUnitaire },
                  quantite,
                  variante,
                )
              }
              desactive={refus !== null}
              grand
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LigneResume({
  libelle,
  valeur,
  fort,
}: {
  libelle: string;
  valeur: string;
  fort?: boolean;
}) {
  return (
    <View style={styles.ligneResume}>
      <Text style={styles.ligneResumeLibelle}>{libelle}</Text>
      <Text style={[styles.ligneResumeValeur, fort && styles.ligneResumeValeurForte]}>
        {valeur}
      </Text>
    </View>
  );
}

// --- Panier -----------------------------------------------------------------

function ModalePanier({
  visible,
  panier,
  devise,
  total,
  alerte,
  onFermer,
  onModifier,
  onRetirer,
  onVider,
  onEncaisser,
}: {
  visible: boolean;
  panier: ArticlePanier[];
  devise: string;
  total: number;
  alerte: string | null;
  onFermer: () => void;
  onModifier: (index: number, delta: number) => void;
  onRetirer: (index: number) => void;
  onVider: () => void;
  onEncaisser: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
        <EnteteModale titre="Panier" onFermer={onFermer} />

        {panier.length === 0 ? (
          <ListeVide
            titre="Le panier est vide"
            message="Touchez un produit de la liste pour l'ajouter."
          />
        ) : (
          <FlatList
            data={panier}
            keyExtractor={(article, index) => `${article.produit.id}-${article.unite}-${index}`}
            contentContainerStyle={styles.liste}
            renderItem={({ item, index }) => {
              const ligne = calculerLigne(item);
              return (
                <View style={styles.lignePanier}>
                  <View style={styles.lignePanierHaut}>
                    <Text style={styles.lignePanierNom} numberOfLines={2}>
                      {calculerLigne(item).libelle}
                    </Text>
                    <Montant valeur={ligne.total} devise={devise} taille="moyen" />
                  </View>
                  <Text style={styles.lignePanierDetail}>
                    {formaterQuantite(item.quantite)} {item.unite} x{' '}
                    {formaterMontant(item.prixUnitaire, devise)}
                  </Text>
                  <View style={styles.lignePanierActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Diminuer la quantite"
                      disabled={item.quantite <= 1}
                      onPress={() => onModifier(index, -1)}
                      style={({ pressed }) => [
                        styles.pas,
                        item.quantite <= 1 && styles.pasInactif,
                        pressed && styles.presse,
                      ]}
                    >
                      <Text style={styles.pasTexte}>-</Text>
                    </Pressable>
                    <Text style={styles.quantiteAffichee}>
                      {formaterQuantite(item.quantite)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Augmenter la quantite"
                      onPress={() => onModifier(index, 1)}
                      style={({ pressed }) => [styles.pas, pressed && styles.presse]}
                    >
                      <Text style={styles.pasTexte}>+</Text>
                    </Pressable>
                    <Bouton
                      titre="Retirer"
                      variante="discret"
                      onPress={() => onRetirer(index)}
                      style={styles.boutonRetirer}
                    />
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={styles.piedPanier}>
          {alerte ? <Text style={styles.refusCompact}>{alerte}</Text> : null}
          <View style={styles.piedPanierTotal}>
            <Text style={styles.zoneTotalLibelle}>Total</Text>
            <Montant valeur={total} devise={devise} taille="grand" />
          </View>
          <View style={styles.piedPanierBoutons}>
            <Bouton
              titre="Vider"
              variante="secondaire"
              onPress={onVider}
              desactive={panier.length === 0}
              style={styles.piedPanierVider}
            />
            <Bouton
              titre="Encaisser"
              onPress={onEncaisser}
              desactive={panier.length === 0}
              grand
              style={styles.piedPanierEncaisser}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// --- Scan du code-barres ----------------------------------------------------

const TYPES_CODES = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code39',
  'code93',
  'code128',
  'itf14',
  'codabar',
  'qr',
] as const;

function ModaleScan({
  visible,
  onFermer,
  onCode,
}: {
  visible: boolean;
  onFermer: () => void;
  onCode: (code: string) => Promise<string | null>;
}) {
  const [permission, demanderPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const dernierCode = useRef<string | null>(null);

  useEffect(() => {
    if (visible) {
      dernierCode.current = null;
      setMessage(null);
      setOccupe(false);
    }
  }, [visible]);

  const surLecture = useCallback(
    (resultat: BarcodeScanningResult) => {
      // La camera emet plusieurs fois par seconde tant que le code reste dans
      // le cadre : sans ce garde-fou le meme article est ajoute en rafale.
      if (occupe || dernierCode.current === resultat.data) return;
      dernierCode.current = resultat.data;
      setOccupe(true);
      void onCode(resultat.data)
        .then((erreur) => {
          setMessage(erreur);
          setOccupe(false);
        })
        .catch((erreur: unknown) => {
          setMessage(
            erreur instanceof Error ? erreur.message : 'La lecture a echoue.',
          );
          setOccupe(false);
        });
    },
    [occupe, onCode],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.ecranNoir} edges={['top', 'bottom']}>
        <View style={styles.enteteScan}>
          <Text style={styles.titreScan}>Scanner un code-barres</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer le scanner"
            onPress={onFermer}
            style={({ pressed }) => [styles.fermerScan, pressed && styles.presse]}
          >
            <Text style={styles.fermerScanTexte}>Fermer</Text>
          </Pressable>
        </View>

        {!permission ? (
          <Chargement message="Verification de la camera..." />
        ) : !permission.granted ? (
          <View style={styles.blocPermission}>
            <Text style={styles.textePermission}>
              La camera est necessaire pour lire les codes-barres. Rien n'est
              enregistre ni envoye : l'image sert uniquement a decoder le code.
            </Text>
            <Bouton
              titre="Autoriser la camera"
              onPress={() => void demanderPermission()}
              grand
            />
            <Bouton
              titre="Saisir le code a la main"
              variante="secondaire"
              onPress={onFermer}
              style={styles.boutonSecours}
            />
          </View>
        ) : (
          <View style={styles.zoneCamera}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...TYPES_CODES] }}
              onBarcodeScanned={surLecture}
            />
            <View pointerEvents="none" style={styles.cadre} />
            <View style={styles.piedScan}>
              {message ? (
                <View style={styles.messageScan}>
                  <Text style={styles.messageScanTexte}>{message}</Text>
                  <Bouton
                    titre="Scanner un autre code"
                    variante="secondaire"
                    onPress={() => {
                      dernierCode.current = null;
                      setMessage(null);
                    }}
                  />
                </View>
              ) : (
                <Text style={styles.consigneScan}>
                  Placez le code dans le cadre
                </Text>
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// --- Encaissement -----------------------------------------------------------

const MODES: { valeur: ModePaiement; libelle: string }[] = [
  { valeur: 'especes', libelle: 'Especes' },
  { valeur: 'mobile_money', libelle: 'Mobile Money' },
  { valeur: 'credit', libelle: 'Credit' },
];

function ModalePaiement({
  visible,
  panier,
  total,
  devise,
  utilisateurId,
  onFermer,
  onTerminee,
}: {
  visible: boolean;
  panier: ArticlePanier[];
  total: number;
  devise: string;
  utilisateurId: number | null;
  onFermer: () => void;
  onTerminee: (terminee: VenteTerminee) => void;
}) {
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [recuTexte, setRecuTexte] = useState(String(total));
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMode('especes');
    setRecuTexte(String(total));
    setRefus(null);
    setEnCours(false);
    setClientId(null);
    void chargerClients()
      .then(setClients)
      .catch(() => setClients([]));
  }, [visible, total]);

  const recu = lireNombre(recuTexte);
  const montantPaye =
    mode === 'especes' ? Math.min(recu, total) : mode === 'mobile_money' ? total : recu;
  const monnaie = mode === 'especes' ? Math.max(0, Math.round(recu - total)) : 0;
  const reste = Math.max(0, Math.round(total - montantPaye));

  let blocage: string | null = null;
  if (mode === 'especes' && recu < total) {
    blocage = 'Le montant recu est inferieur au total.';
  } else if (mode === 'credit' && clientId === null) {
    blocage = 'Choisissez un client : une dette sans nom est introuvable ensuite.';
  } else if (mode === 'credit' && recu > total) {
    blocage = 'Le versement depasse le total de la vente.';
  }

  const valider = useCallback(async () => {
    setEnCours(true);
    setRefus(null);
    try {
      const resultat = await enregistrerVente({
        articles: panier,
        modePaiement: mode,
        montantPaye,
        clientId,
        utilisateurId,
      });
      onTerminee({
        resultat,
        modePaiement: mode,
        montantPaye,
        montantRecu: mode === 'especes' ? Math.round(recu) : montantPaye,
        clientId,
        dateVente: new Date().toISOString(),
      });
    } catch (erreur) {
      setRefus(
        erreur instanceof StockInsuffisant
          ? erreur.message
          : erreur instanceof Error
            ? erreur.message
            : "La vente n'a pas pu etre enregistree.",
      );
      setEnCours(false);
    }
  }, [panier, mode, montantPaye, recu, clientId, utilisateurId, onTerminee]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
        <EnteteModale titre="Encaissement" onFermer={onFermer} />
        <KeyboardAvoidingView
          style={styles.ecran}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.contenuFeuille}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.blocTotal}>
              <Text style={styles.zoneTotalLibelle}>Total a payer</Text>
              <Montant valeur={total} devise={devise} taille="grand" />
            </View>

            <Text style={styles.sousLabel}>Mode de paiement</Text>
            <View style={styles.grilleChoix}>
              {MODES.map((option) => {
                const actif = option.valeur === mode;
                return (
                  <Pressable
                    key={option.valeur}
                    accessibilityRole="button"
                    accessibilityState={{ selected: actif }}
                    onPress={() => {
                      setMode(option.valeur);
                      setRefus(null);
                      setRecuTexte(option.valeur === 'credit' ? '0' : String(total));
                    }}
                    style={[styles.puce, actif && styles.puceActive]}
                  >
                    <Text style={[styles.puceNom, actif && styles.puceNomActive]}>
                      {option.libelle}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {mode === 'especes' ? (
              <View>
                <Champ
                  label="Montant recu"
                  valeur={recuTexte}
                  onChangeText={setRecuTexte}
                  clavier="number-pad"
                  alignerADroite
                  style={styles.champEspace}
                />
                <View style={styles.blocMonnaie}>
                  <Text style={styles.blocMonnaieLibelle}>Monnaie a rendre</Text>
                  <Montant
                    valeur={monnaie}
                    devise={devise}
                    taille="grand"
                    couleur={couleurs.primaire}
                  />
                </View>
              </View>
            ) : null}

            {mode === 'mobile_money' ? (
              <Carte style={styles.resume}>
                <LigneResume
                  libelle="Montant encaisse"
                  valeur={formaterMontant(total, devise)}
                  fort
                />
                <Text style={styles.note}>
                  La vente est enregistree comme payee en totalite. Verifiez la
                  reception du transfert avant de laisser partir le client.
                </Text>
              </Carte>
            ) : null}

            {mode === 'credit' ? (
              <View>
                <Champ
                  label="Versement immediat"
                  valeur={recuTexte}
                  onChangeText={setRecuTexte}
                  clavier="number-pad"
                  alignerADroite
                  aide="Laissez 0 si le client ne verse rien aujourd'hui."
                  style={styles.champEspace}
                />
                <LigneResume
                  libelle="Reste a payer"
                  valeur={formaterMontant(reste, devise)}
                  fort
                />
              </View>
            ) : null}

            <Text style={styles.sousLabel}>Client</Text>
            {clients.length === 0 ? (
              <Text style={styles.note}>
                Aucun client enregistre. Les ventes a credit demandent un client
                nomme : creez-le depuis l'onglet Plus.
              </Text>
            ) : (
              <View style={styles.grilleChoix}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: clientId === null }}
                  onPress={() => setClientId(null)}
                  style={[styles.puce, clientId === null && styles.puceActive]}
                >
                  <Text
                    style={[styles.puceNom, clientId === null && styles.puceNomActive]}
                  >
                    Client de passage
                  </Text>
                </Pressable>
                {clients.map((client) => {
                  const actif = client.id === clientId;
                  return (
                    <Pressable
                      key={client.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: actif }}
                      onPress={() => setClientId(client.id)}
                      style={[styles.puce, actif && styles.puceActive]}
                    >
                      <Text style={[styles.puceNom, actif && styles.puceNomActive]}>
                        {client.nom}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {blocage ? <Text style={styles.refus}>{blocage}</Text> : null}
            {refus ? <Text style={styles.refus}>{refus}</Text> : null}
          </ScrollView>

          <View style={styles.piedFeuille}>
            <Bouton
              titre={`Valider ${formaterMontant(total, devise)}`}
              onPress={() => void valider()}
              desactive={blocage !== null || panier.length === 0}
              enCours={enCours}
              grand
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// --- Recu -------------------------------------------------------------------

function ModaleRecu({
  terminee,
  onFermer,
}: {
  terminee: VenteTerminee;
  onFermer: () => void;
}) {
  const { boutique, utilisateur } = useSession();
  const [impression, setImpression] = useState(false);
  const [messageImpression, setMessageImpression] = useState<string | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);

  const monnaie = Math.max(0, Math.round(terminee.montantRecu - terminee.resultat.total));
  const reste = Math.max(0, Math.round(terminee.resultat.total - terminee.montantPaye));

  const venteTicket = useMemo<Vente>(() => ({
      id: terminee.resultat.venteId,
      idLocal: '',
      numero: terminee.resultat.numero,
      clientId: terminee.clientId,
      utilisateurId: utilisateur ? utilisateur.id : null,
      dateVente: terminee.dateVente,
      total: terminee.resultat.total,
      // Le ticket porte ce que le client a tendu : c'est de cette ligne que
      // `construireRecu` deduit la monnaie rendue a imprimer.
      montantPaye: terminee.montantRecu,
      modePaiement: terminee.modePaiement,
      statut: reste > 0 ? (terminee.montantPaye > 0 ? 'partielle' : 'impayee') : 'payee',
      beneficeTotal: terminee.resultat.lignes.reduce(
        (somme: number, ligne: LigneVente) => somme + ligne.beneficeTotal,
        0,
      ),
    }), [terminee, utilisateur, reste]);

  const enteteTicket = useMemo(() => ({
    nom: boutique.nom,
    adresse: boutique.adresse ?? undefined,
    telephone: boutique.telephone ?? undefined,
    piedDePage: boutique.piedDePage ?? undefined,
    logo: boutique.logo ?? undefined,
  }), [boutique]);

  const ticket = useMemo(() => {
    return construireRecu(
      venteTicket,
      terminee.resultat.lignes,
      enteteTicket,
      boutique.largeurPapier,
    );
  }, [venteTicket, terminee.resultat.lignes, enteteTicket, boutique.largeurPapier]);

  const imprimer = useCallback(async () => {
    setImpression(true);
    setMessageImpression(null);
    try {
      const ticketAvecLogo = await construireRecuAvecLogo(
        venteTicket,
        terminee.resultat.lignes,
        enteteTicket,
        boutique.largeurPapier,
      );
      await serviceImpression.imprimer(ticketAvecLogo);
      setMessageImpression('Recu envoye a l imprimante.');
    } catch (erreur) {
      setMessageImpression(
        erreur instanceof Error
          ? erreur.message
          : "L'impression a echoue. La vente reste enregistree.",
      );
    } finally {
      setImpression(false);
    }
  }, [venteTicket, terminee.resultat.lignes, enteteTicket, boutique.largeurPapier]);

  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.contenuFeuille}>
          <View style={styles.pastilleSucces}>
            <Text style={styles.signeSucces}>OK</Text>
          </View>
          <Text style={styles.titreSucces}>Vente enregistree</Text>
          <Text style={styles.numeroVente}>{terminee.resultat.numero}</Text>

          <Carte style={styles.resume}>
            <LigneResume
              libelle="Total"
              valeur={formaterMontant(terminee.resultat.total, boutique.devise)}
            />
            <LigneResume
              libelle="Recu du client"
              valeur={formaterMontant(terminee.montantRecu, boutique.devise)}
            />
            {reste > 0 ? (
              <LigneResume
                libelle="Reste a payer"
                valeur={formaterMontant(reste, boutique.devise)}
                fort
              />
            ) : (
              <LigneResume
                libelle="Monnaie a rendre"
                valeur={formaterMontant(monnaie, boutique.devise)}
                fort
              />
            )}
          </Carte>

          {monnaie > 0 ? (
            <View style={styles.blocMonnaie}>
              <Text style={styles.blocMonnaieLibelle}>A rendre au client</Text>
              <Montant
                valeur={monnaie}
                devise={boutique.devise}
                taille="geant"
                couleur={couleurs.primaire}
              />
            </View>
          ) : null}

          {messageImpression ? (
            <Text style={styles.note}>{messageImpression}</Text>
          ) : null}

          {apercu ? (
            <Carte titre="Apercu du recu" style={styles.resume}>
              <ScrollView horizontal
          style={BARRE_HORIZONTALE}>
                <Text style={styles.apercu}>{apercu}</Text>
              </ScrollView>
            </Carte>
          ) : null}

          <Bouton
            titre="Imprimer le recu"
            onPress={() => void imprimer()}
            enCours={impression}
            style={styles.champEspace}
          />
          <Bouton
            titre={apercu ? "Masquer l'apercu" : 'Voir le recu sans imprimer'}
            variante="secondaire"
            onPress={() => setApercu(apercu ? null : ticket.apercu())}
            style={styles.champEspace}
          />
        </ScrollView>

        <View style={styles.piedFeuille}>
          <Bouton titre="Nouvelle vente" onPress={onFermer} grand />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// --- Utilitaires ------------------------------------------------------------

/** La virgule est le separateur decimal saisi ici ; le point celui du code. */
function lireNombre(texte: string): number {
  const valeur = Number(texte.replace(',', '.').trim());
  return Number.isFinite(valeur) ? valeur : 0;
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  ecranNoir: { flex: 1, backgroundColor: '#000000' },
  presse: { opacity: 0.65 },

  barreRecherche: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaces.s,
    paddingHorizontal: espaces.l,
    paddingTop: espaces.m,
  },
  champRecherche: { flex: 1, marginBottom: espaces.m },
  boutonScan: {
    flexDirection: 'row',
    gap: espaces.xs,
    minHeight: CIBLE_MIN,
    minWidth: 84,
    paddingHorizontal: espaces.m,
    borderRadius: rayons.m,
    backgroundColor: couleurs.primaire,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enteteCaisse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    paddingHorizontal: espaces.m,
    paddingTop: espaces.s,
  },
  enteteCaisseTitre: { fontSize: 18, fontWeight: '700', color: couleurs.texte },
  boutonScanTexte: {
    color: couleurs.texteInverse,
    fontWeight: '700',
    fontSize: 15,
  },

  liste: { paddingHorizontal: espaces.l, paddingBottom: espaces.xl, gap: espaces.s },
  ligneProduit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    minHeight: 64,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.m,
    borderRadius: rayons.m,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  ligneProduitTexte: { flex: 1 },
  ligneProduitNom: { fontSize: 16, fontWeight: '700', color: couleurs.texte },
  ligneProduitBas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    marginTop: espaces.xs,
  },
  ligneProduitCategorie: { fontSize: 13, color: couleurs.texteFaible, flexShrink: 1 },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: espaces.s,
    paddingVertical: 2,
    borderRadius: rayons.s,
    overflow: 'hidden',
  },
  badgeOk: { color: couleurs.primaire, backgroundColor: couleurs.primaireDouce },
  badgeBas: { color: couleurs.avertissement, backgroundColor: couleurs.avertissementDouce },
  badgeRupture: { color: couleurs.danger, backgroundColor: couleurs.dangerDouce },

  barrePanier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    padding: espaces.l,
    backgroundColor: couleurs.surface,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
  },
  zoneTotal: { flex: 1, minHeight: CIBLE_MIN, justifyContent: 'center' },
  zoneTotalLibelle: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteFaible,
    marginBottom: 2,
  },
  boutonEncaisser: { minWidth: 104 },

  enteteModale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.m,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  titreModale: { flex: 1, fontSize: 17, fontWeight: '800', color: couleurs.texte },
  fermer: {
    minHeight: CIBLE_MIN,
    minWidth: CIBLE_MIN + 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espaces.m,
    borderRadius: rayons.m,
    backgroundColor: couleurs.surfaceDouce,
  },
  fermerTexte: { fontSize: 15, fontWeight: '700', color: couleurs.texte },

  voile: { flex: 1, backgroundColor: 'rgba(15, 30, 43, 0.45)', justifyContent: 'flex-end' },
  feuille: {
    maxHeight: '92%',
    backgroundColor: couleurs.fond,
    borderTopLeftRadius: rayons.l,
    borderTopRightRadius: rayons.l,
    overflow: 'hidden',
  },
  contenuFeuille: { padding: espaces.l, paddingBottom: espaces.xxl },
  piedFeuille: {
    padding: espaces.l,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },

  sousLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.texteFaible,
    marginBottom: espaces.s,
    marginTop: espaces.s,
  },
  grilleChoix: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s },
  puce: {
    minHeight: CIBLE_MIN,
    justifyContent: 'center',
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.s,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  puceMontant: { backgroundColor: couleurs.surfaceDouce },
  puceActive: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  puceNom: { fontSize: 15, fontWeight: '700', color: couleurs.texte },
  puceNomActive: { color: couleurs.texteInverse },
  puceDetail: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  puceDetailActive: { color: couleurs.primaireDouce },

  grilleVariantes: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s },
  varianteChoix: {
    minWidth: '30%',
    maxWidth: '48%',
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  varianteChoixActive: {
    backgroundColor: couleurs.primaire,
    borderColor: couleurs.primaire,
  },
  varianteChoixRupture: { opacity: 0.55 },
  tarifs: { flexDirection: 'row', gap: espaces.s, marginBottom: espaces.m },
  tarifChoix: {
    flex: 1, minHeight: 48, borderRadius: rayons.m, borderWidth: 1,
    borderColor: couleurs.bordure, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: espaces.s, backgroundColor: couleurs.surface,
  },
  tarifChoixActif: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  tarifChoixInactif: { opacity: 0.4 },
  tarifTexte: { color: couleurs.texte, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  tarifTexteActif: { color: couleurs.texteInverse },
  varianteChoixHaut: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  varianteChoixNom: { flexShrink: 1, fontSize: 13, fontWeight: '800', color: couleurs.texte },
  varianteChoixStock: { marginTop: 4, fontSize: 11, color: couleurs.texteFaible },
  pastilleCouleur: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: couleurs.bordure,
  },

  compteur: { flexDirection: 'row', alignItems: 'flex-start', gap: espaces.m },
  champQuantite: { flex: 1, marginBottom: 0 },
  pas: {
    width: 56,
    height: 56,
    borderRadius: rayons.m,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  pasInactif: { opacity: 0.4 },
  pasTexte: { fontSize: 28, fontWeight: '700', color: couleurs.texte },
  quantiteAffichee: {
    minWidth: 56,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: couleurs.texte,
  },

  resume: { marginTop: espaces.l },
  ligneResume: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espaces.s,
  },
  ligneResumeLibelle: { fontSize: 15, color: couleurs.texteFaible },
  ligneResumeValeur: { fontSize: 16, fontWeight: '700', color: couleurs.texte },
  ligneResumeValeurForte: { fontSize: 20, color: couleurs.primaire },
  note: {
    fontSize: 14,
    lineHeight: 20,
    color: couleurs.texteFaible,
    marginTop: espaces.s,
  },
  refus: {
    marginTop: espaces.l,
    padding: espaces.m,
    borderRadius: rayons.m,
    backgroundColor: couleurs.dangerDouce,
    color: couleurs.danger,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  refusCompact: {
    marginBottom: espaces.m,
    padding: espaces.s,
    borderRadius: rayons.s,
    backgroundColor: couleurs.dangerDouce,
    color: couleurs.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  champEspace: { marginTop: espaces.l },

  lignePanier: {
    padding: espaces.l,
    borderRadius: rayons.m,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  lignePanierHaut: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaces.m,
  },
  lignePanierNom: { flex: 1, fontSize: 14, fontWeight: '700', color: couleurs.texte },
  lignePanierDetail: {
    fontSize: 12,
    color: couleurs.texteFaible,
    marginTop: espaces.xs,
  },
  lignePanierActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    marginTop: espaces.m,
  },
  boutonRetirer: { marginLeft: 'auto' },
  piedPanier: {
    padding: espaces.l,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  piedPanierTotal: { marginBottom: espaces.m },
  piedPanierBoutons: { flexDirection: 'row', gap: espaces.m },
  piedPanierVider: { flex: 1 },
  piedPanierEncaisser: { flex: 2 },

  enteteScan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    padding: espaces.l,
  },
  titreScan: { flex: 1, fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  fermerScan: {
    minHeight: CIBLE_MIN,
    minWidth: CIBLE_MIN + 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espaces.m,
    borderRadius: rayons.m,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  fermerScanTexte: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  zoneCamera: { flex: 1 },
  camera: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  cadre: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: '22%',
    height: '32%',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderRadius: rayons.l,
  },
  piedScan: { marginTop: 'auto', padding: espaces.l },
  consigneScan: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  messageScan: {
    padding: espaces.l,
    borderRadius: rayons.m,
    backgroundColor: couleurs.surface,
    gap: espaces.m,
  },
  messageScanTexte: { fontSize: 15, color: couleurs.texte, lineHeight: 21 },
  blocPermission: {
    flex: 1,
    justifyContent: 'center',
    padding: espaces.xl,
    gap: espaces.m,
  },
  textePermission: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: espaces.m,
  },
  boutonSecours: { marginTop: espaces.s },

  blocTotal: {
    padding: espaces.l,
    borderRadius: rayons.l,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    marginBottom: espaces.m,
  },
  blocMonnaie: {
    marginTop: espaces.l,
    padding: espaces.l,
    borderRadius: rayons.l,
    backgroundColor: couleurs.primaireDouce,
  },
  blocMonnaieLibelle: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.primaireFonce,
    marginBottom: 2,
  },

  pastilleSucces: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: couleurs.primaireDouce,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: espaces.l,
  },
  signeSucces: { fontSize: 22, fontWeight: '800', color: couleurs.primaire },
  titreSucces: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: couleurs.texte,
    marginTop: espaces.m,
  },
  numeroVente: {
    textAlign: 'center',
    fontSize: 15,
    color: couleurs.texteFaible,
    marginTop: espaces.xs,
  },
  apercu: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: couleurs.texte,
    lineHeight: 18,
  },

  // --- grille de la caisse -------------------------------------------------
  grille: { padding: espaces.s, paddingBottom: espaces.xxl },
  grilleLigne: { gap: espaces.s, marginBottom: espaces.s, justifyContent: 'flex-start' },

  filtres: { gap: espaces.s, paddingVertical: espaces.s, paddingHorizontal: 2 },
  puceRayon: {
    paddingHorizontal: espaces.m,
    height: 34,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  puceRayonActive: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  puceRayonTexte: { fontSize: 13, fontWeight: '600', color: couleurs.texteFaible },
  puceRayonTexteActive: { color: couleurs.texteInverse },

  carte: {
    flex: 1,
    // Sans borne, FlatList etire l'unique carte d'une rangee sur toute la
    // largeur : trois colonnes ne se voient qu'a partir de trois articles.
    maxWidth: '32%',
    alignItems: 'center',
    gap: 4,
    paddingVertical: espaces.m,
    paddingHorizontal: espaces.s,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
    // Sans minimum, une carte a nom court devient plus basse que ses voisines
    // et la grille se decale.
    minHeight: 150,
  },
  cartePhoto: { position: 'relative' },
  pastille: {
    position: 'absolute',
    bottom: -4,
    right: -6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
  },
  pastilleRupture: { backgroundColor: couleurs.danger },
  pastilleBas: { backgroundColor: couleurs.accent },
  pastilleTexte: { fontSize: 9, fontWeight: '700', color: couleurs.texteInverse },
  carteNom: {
    fontSize: 12,
    fontWeight: '600',
    color: couleurs.texte,
    textAlign: 'center',
  },
  cartePrix: { fontSize: 13, fontWeight: '700', color: couleurs.primaire },
});
