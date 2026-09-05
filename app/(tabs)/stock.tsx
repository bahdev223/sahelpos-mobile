/**
 * Stock actuel : ce qui reste, produit par produit.
 *
 * POURQUOI LE DOMAINE STOCK VIT DANS CE FICHIER
 * ---------------------------------------------
 * Les cinq autres ecrans de stock (journal, alertes, lots, ajustement, mise en
 * route) partagent les memes regles : conversion vers l'unite de base, seuil
 * d'alerte, ecriture d'un mouvement. Le poste de bureau les avait reecrites a
 * la main dans chaque ecran, et elles avaient diverge au point que deux ecrans
 * repondaient differemment a "combien de cartons me reste-t-il ?". Ici la regle
 * est ecrite une fois, exportee, et les autres ecrans l'importent. C'est la
 * meme convention que `produit/nouveau.tsx`, qui porte deja la palette et le
 * formulaire partages du domaine produit.
 *
 * LE SENS DE LA CONVERSION EST TRANCHE ICI
 * ----------------------------------------
 * Un facteur dit combien d'unites de base vaut une sous-unite : 1 sac = 50 kg.
 * Donc on MULTIPLIE pour aller vers la base (4 sacs = 200 kg) et on DIVISE pour
 * en revenir (200 kg = 4 sacs). Le poste de bureau avait les deux formules dans
 * le meme fichier, et affichait 288 cartons la ou il en restait 2.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { C, formaterFrancs, formaterQuantite, s } from '../produit/nouveau';
import {
  BARRE_HORIZONTALE, BandeauEtat, Vignette } from '../../src/ui/components';
import { couleurs } from '../../src/ui/theme';
import { Icone } from '../../src/ui/icones';
import { BoutonMenu } from '../../src/ui/tiroir';
import { verifierStock } from '../../src/services/notifications';

// --------------------------------------------------------------------------
// Vocabulaire du domaine
// --------------------------------------------------------------------------

export type NatureMouvement = 'ENTREE' | 'SORTIE' | 'AJUSTEMENT';

export type SourceOperation =
  | 'VENTE'
  | 'ACHAT'
  | 'INVENTAIRE'
  | 'INITIALISATION'
  | 'CASSE'
  | 'RETOUR'
  | 'CORRECTION';

export const NATURES: readonly NatureMouvement[] = ['ENTREE', 'SORTIE', 'AJUSTEMENT'];

export const SOURCES: readonly SourceOperation[] = [
  'VENTE',
  'ACHAT',
  'INVENTAIRE',
  'INITIALISATION',
  'CASSE',
  'RETOUR',
  'CORRECTION',
];

export const LIBELLE_NATURE: Record<NatureMouvement, string> = {
  ENTREE: 'Entree',
  SORTIE: 'Sortie',
  AJUSTEMENT: 'Ajustement',
};

export const LIBELLE_SOURCE: Record<SourceOperation, string> = {
  VENTE: 'Vente',
  ACHAT: 'Achat',
  INVENTAIRE: 'Inventaire',
  INITIALISATION: 'Mise en route',
  CASSE: 'Casse ou perte',
  RETOUR: 'Retour',
  CORRECTION: 'Correction',
};

export const COULEUR_NATURE: Record<NatureMouvement, string> = {
  ENTREE: C.vert,
  SORTIE: C.rouge,
  AJUSTEMENT: C.orange,
};

/** Une unite proposee a la saisie : l'unite de base, ou une sous-unite. */
export interface UniteDisponible {
  nom: string;
  /** Combien d'unites de base vaut une unite de celle-ci. La base vaut 1. */
  facteur: number;
}

// --------------------------------------------------------------------------
// Conversions et arrondis
// --------------------------------------------------------------------------

/**
 * Les quantites sont des REAL en base : 0.1 + 0.2 y vaut 0.30000000000000004.
 * Sans ce rabotage a trois decimales, une sortie de tout le stock laisserait un
 * residu invisible et le produit ne tomberait jamais a zero. Trois decimales
 * suffisent : on vend au gramme, pas au milligramme.
 */
export function arrondirQuantite(valeur: number): number {
  return Math.round(valeur * 1000) / 1000;
}

export function convertirVersBase(quantite: number, facteur: number): number {
  return arrondirQuantite(quantite * facteur);
}

export function convertirDepuisBase(quantiteBase: number, facteur: number): number {
  if (facteur <= 0) return quantiteBase;
  return arrondirQuantite(quantiteBase / facteur);
}

/**
 * Ecrit un stock en clair : "2 Sac, 1 Carton, 12 Kg" plutot que "137 Kg".
 * Les paliers a zero sont tus, le reste tombe dans l'unite de base.
 */
export function decomposerStock(
  quantiteBase: number,
  uniteBase: string,
  sousUnites: UniteDisponible[],
): string {
  if (quantiteBase <= 0 || sousUnites.length === 0) {
    return `${formaterQuantite(quantiteBase)} ${uniteBase}`;
  }

  const paliers = [...sousUnites].sort((a, b) => b.facteur - a.facteur);
  const morceaux: string[] = [];
  let reste = quantiteBase;

  for (const palier of paliers) {
    if (palier.facteur <= 0) continue;
    const nombre = Math.floor(reste / palier.facteur);
    if (nombre <= 0) continue;
    morceaux.push(`${nombre} ${palier.nom}`);
    reste = arrondirQuantite(reste - nombre * palier.facteur);
  }

  if (reste > 0 || morceaux.length === 0) {
    morceaux.push(`${formaterQuantite(reste)} ${uniteBase}`);
  }
  return morceaux.join(', ');
}

// --------------------------------------------------------------------------
// Etat d'un produit au regard de son stock
// --------------------------------------------------------------------------

export type CleEtatStock = 'non_suivi' | 'rupture' | 'alerte' | 'ok';

export interface EtatStock {
  cle: CleEtatStock;
  libelle: string;
  couleur: string;
}

export interface ProduitStock {
  id: number;
  nom: string;
  categorie: string | null;
  code_barre: string | null;
  unite_base: string;
  quantite_base: number;
  stock_min: number;
  prix_achat: number;
  prix_unitaire: number;
  gestion_stock: number;
  actif: number;
  chemin_image: string | null;
  sous_unites: string | null;
  nb_mouvements: number;
}

/**
 * Une seule regle de seuil pour toute l'application, la meme que le catalogue.
 * Le poste de bureau en avait trois (0 et 5 en dur ici, `stock_min` la, `== 0`
 * ailleurs) : deux ecrans pouvaient donc designer des produits differents comme
 * etant en alerte, et l'utilisateur ne savait plus lequel croire.
 */
export function etatStock(produit: {
  gestion_stock: number;
  quantite_base: number;
  stock_min: number;
  unite_base: string;
}): EtatStock {
  if (produit.gestion_stock === 0) {
    return { cle: 'non_suivi', libelle: 'Stock non suivi', couleur: C.texteFaible };
  }
  if (produit.quantite_base <= 0) {
    return { cle: 'rupture', libelle: 'Rupture', couleur: C.rouge };
  }
  const quantite = `${formaterQuantite(produit.quantite_base)} ${produit.unite_base}`;
  if (produit.quantite_base <= produit.stock_min) {
    return { cle: 'alerte', libelle: quantite, couleur: C.orange };
  }
  return { cle: 'ok', libelle: quantite, couleur: C.vert };
}

// --------------------------------------------------------------------------
// Lecture
// --------------------------------------------------------------------------

/**
 * Les sous-unites sont ramenees en une seule chaine "nom:facteur|nom:facteur"
 * plutot qu'en une requete par produit : une liste de trois cents references
 * ferait sinon trois cents allers-retours SQLite a chaque affichage.
 */
export function analyserSousUnites(brut: string | null): UniteDisponible[] {
  if (!brut) return [];
  const unites: UniteDisponible[] = [];
  for (const morceau of brut.split('|')) {
    const separateur = morceau.lastIndexOf(':');
    if (separateur <= 0) continue;
    const facteur = Number(morceau.slice(separateur + 1));
    if (!Number.isFinite(facteur) || facteur <= 0) continue;
    unites.push({ nom: morceau.slice(0, separateur), facteur });
  }
  return unites.sort((a, b) => b.facteur - a.facteur);
}

const SELECTION_PRODUIT_STOCK = `
  SELECT p.id, p.nom, p.categorie, p.code_barre, p.unite_base, p.quantite_base,
         p.stock_min, p.prix_achat, p.prix_unitaire, p.gestion_stock, p.actif,
         p.chemin_image,
         (SELECT GROUP_CONCAT(su.nom || ':' || su.facteur, '|')
            FROM sous_unite su WHERE su.produit_id = p.id) AS sous_unites,
         (SELECT COUNT(*) FROM mouvement_stock m WHERE m.produit_id = p.id) AS nb_mouvements
    FROM produit p`;

export async function chargerProduitsStock(): Promise<ProduitStock[]> {
  const db = await obtenirBase();
  return db.getAllAsync<ProduitStock>(
    `${SELECTION_PRODUIT_STOCK} WHERE p.actif = 1 ORDER BY p.nom COLLATE NOCASE`,
  );
}

export async function chargerProduitStock(identifiant: number): Promise<ProduitStock | null> {
  const db = await obtenirBase();
  return db.getFirstAsync<ProduitStock>(`${SELECTION_PRODUIT_STOCK} WHERE p.id = ?`, identifiant);
}

/** Unites proposees a la saisie : l'unite de base d'abord, puis les sous-unites. */
export function unitesDisponibles(produit: ProduitStock): UniteDisponible[] {
  return [
    { nom: produit.unite_base, facteur: 1 },
    ...analyserSousUnites(produit.sous_unites),
  ];
}

// --------------------------------------------------------------------------
// Ecriture d'un mouvement
// --------------------------------------------------------------------------

export class StockInsuffisant extends Error {
  constructor(
    readonly produit: string,
    readonly demande: number,
    readonly disponible: number,
  ) {
    super(
      `Stock insuffisant pour ${produit} : ${formaterQuantite(demande)} demande(s), ` +
        `${formaterQuantite(disponible)} en stock.`,
    );
    this.name = 'StockInsuffisant';
  }
}

export class MouvementImpossible extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MouvementImpossible';
  }
}

export interface DemandeMouvement {
  produitId: number;
  nature: NatureMouvement;
  source: SourceOperation;
  /**
   * Quantite saisie, dans l'unite choisie. Pour un AJUSTEMENT c'est le stock
   * PHYSIQUE compte, pas l'ecart : c'est ce qu'on sait quand on a fini de
   * compter, et l'ecart s'en deduit.
   */
  quantite: number;
  unite: string;
  facteur: number;
  motif: string | null;
  reference?: string | null;
  /** Prix d'achat unitaire, en francs entiers. Renseigne sur les entrees. */
  prixUnitaire?: number | null;
  utilisateur?: string | null;
}

export interface ResultatMouvement {
  stockAvant: number;
  stockApres: number;
  quantiteBase: number;
}

/**
 * Le seul chemin d'ecriture du stock hors vente.
 *
 * Le stock est relu DANS la transaction, comme a la vente : le lire avant
 * laisserait une fenetre ou une vente encaissee entre-temps serait effacee par
 * l'ajustement. Produit et journal sont ecrits ensemble, ou pas du tout - un
 * stock modifie sans trace dans le journal est indefendable devant le patron.
 */
export async function ecrireMouvement(demande: DemandeMouvement): Promise<ResultatMouvement> {
  if (!Number.isFinite(demande.quantite) || demande.quantite < 0) {
    throw new MouvementImpossible('La quantite doit etre un nombre positif.');
  }
  if (demande.nature !== 'AJUSTEMENT' && demande.quantite <= 0) {
    throw new MouvementImpossible('La quantite doit etre superieure a zero.');
  }
  if (demande.facteur <= 0) {
    throw new MouvementImpossible(`L'unite "${demande.unite}" n'a pas de facteur valide.`);
  }

  const db = await obtenirBase();
  const maintenant = new Date().toISOString();
  let resultat: ResultatMouvement | null = null;

  await db.withTransactionAsync(async () => {
    const produit = await db.getFirstAsync<{
      nom: string;
      quantite_base: number;
      gestion_stock: number;
    }>('SELECT nom, quantite_base, gestion_stock FROM produit WHERE id = ?', demande.produitId);

    if (!produit) {
      throw new MouvementImpossible('Ce produit a ete supprime entre-temps.');
    }
    // Le poste de bureau laissait sortir du stock d'un produit declare sans
    // suivi : le mouvement partait au journal et le stock ne bougeait pas.
    if (produit.gestion_stock === 0) {
      throw new MouvementImpossible(
        `${produit.nom} n'est pas suivi en stock. Activez le suivi sur sa fiche avant ` +
          "d'enregistrer un mouvement.",
      );
    }

    const quantiteBase = convertirVersBase(demande.quantite, demande.facteur);
    const stockAvant = produit.quantite_base;
    let stockApres: number;

    if (demande.nature === 'ENTREE') {
      stockApres = arrondirQuantite(stockAvant + quantiteBase);
    } else if (demande.nature === 'SORTIE') {
      if (quantiteBase > stockAvant) {
        throw new StockInsuffisant(produit.nom, quantiteBase, stockAvant);
      }
      stockApres = arrondirQuantite(stockAvant - quantiteBase);
    } else {
      stockApres = quantiteBase;
    }

    await db.runAsync(
      'UPDATE produit SET quantite_base = ?, date_modification = ? WHERE id = ?',
      stockApres,
      maintenant,
      demande.produitId,
    );

    // Sur un AJUSTEMENT, `quantite` et `quantite_base` portent le stock compte,
    // pas l'ecart : c'est la convention du poste de bureau, gardee pour qu'un
    // futur export tombe juste. L'ecart se lit toujours stock_apres moins
    // stock_avant, et c'est ainsi que le journal l'affiche.
    await db.runAsync(
      `INSERT INTO mouvement_stock (id_local, produit_id, nature, source_operation, quantite,
                                    unite, quantite_base, stock_avant, stock_apres,
                                    prix_unitaire, reference, motif, utilisateur,
                                    date_mouvement)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      demande.produitId,
      demande.nature,
      demande.source,
      demande.quantite,
      demande.unite,
      quantiteBase,
      stockAvant,
      stockApres,
      demande.prixUnitaire ?? null,
      demande.reference ?? null,
      demande.motif,
      demande.utilisateur ?? null,
      maintenant,
    );

    resultat = { stockAvant, stockApres, quantiteBase };
  });

  if (!resultat) throw new MouvementImpossible("Le mouvement n'a pas pu etre enregistre.");

  // Meme reaffirmation de type qu'ailleurs : l'affectation a lieu dans la
  // transaction, et l'analyse de flux de TypeScript ne la suit pas.
  const applique: ResultatMouvement = resultat;

  // Une entree, une sortie ou un ajustement changent le stock d'un produit :
  // c'est le troisieme chemin par lequel une rupture peut apparaitre ou
  // disparaitre, apres la vente et la reception d'achat.
  void verifierStock([demande.produitId]);

  return applique;
}

export interface LigneStockInitial {
  produitId: number;
  quantite: number;
  unite: string;
  facteur: number;
  /**
   * Prix d'achat d'une unite de BASE, en francs entiers, ou null pour garder
   * celui de la fiche produit.
   */
  prixAchat: number | null;
}

/**
 * Mise en route : tout est ecrit en UNE transaction. Un enregistrement a moitie
 * pose, c'est un inventaire de depart faux, et plus personne ne sait quels
 * produits ont ete saisis.
 */
export async function ecrireStockInitial(lignes: LigneStockInitial[]): Promise<number> {
  const retenues = lignes.filter((l) => l.quantite > 0 && l.facteur > 0);
  if (retenues.length === 0) return 0;

  const db = await obtenirBase();
  const maintenant = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (const ligne of retenues) {
      const produit = await db.getFirstAsync<{ nom: string; gestion_stock: number }>(
        'SELECT nom, gestion_stock FROM produit WHERE id = ?',
        ligne.produitId,
      );
      if (!produit) continue;
      if (produit.gestion_stock === 0) continue;

      const quantiteBase = convertirVersBase(ligne.quantite, ligne.facteur);

      if (ligne.prixAchat !== null) {
        await db.runAsync(
          'UPDATE produit SET quantite_base = ?, prix_achat = ?, date_modification = ? WHERE id = ?',
          quantiteBase,
          Math.round(ligne.prixAchat),
          maintenant,
          ligne.produitId,
        );
      } else {
        await db.runAsync(
          'UPDATE produit SET quantite_base = ?, date_modification = ? WHERE id = ?',
          quantiteBase,
          maintenant,
          ligne.produitId,
        );
      }

      // `prix_unitaire` vaut toujours le prix d'UNE unite de celle notee dans la
      // colonne `unite` de la meme ligne. Le prix saisi est celui de l'unite de
      // base : entrer 4 sacs a 500 F le kilo doit inscrire 25 000 F le sac, pas
      // 500, sinon la valeur de la reception est cinquante fois trop basse.
      await db.runAsync(
        `INSERT INTO mouvement_stock (id_local, produit_id, nature, source_operation, quantite,
                                      unite, quantite_base, stock_avant, stock_apres,
                                      prix_unitaire, motif, date_mouvement)
         VALUES (lower(hex(randomblob(16))), ?, 'ENTREE', 'INITIALISATION', ?, ?, ?, 0, ?, ?, ?, ?)`,
        ligne.produitId,
        ligne.quantite,
        ligne.unite,
        quantiteBase,
        quantiteBase,
        ligne.prixAchat === null ? null : Math.round(ligne.prixAchat * ligne.facteur),
        'Stock initial',
        maintenant,
      );
    }
  });

  return retenues.length;
}

// --------------------------------------------------------------------------
// Dates
// --------------------------------------------------------------------------

/** Les dates sont stockees en ISO : "2026-08-27T10:38:00.000Z". */
export function formaterDateHeure(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const deux = (n: number) => String(n).padStart(2, '0');
  return (
    `${deux(date.getDate())}/${deux(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${deux(date.getHours())}:${deux(date.getMinutes())}`
  );
}

export function formaterJour(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(date.getDate())}/${deux(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Recherche insensible aux accents : taper "cafe" doit trouver un produit dont
 * le nom a ete saisi avec un accent aigu.
 *
 * Le tri des diacritiques est ecrit avec des bornes numeriques plutot qu'une
 * classe de caracteres : le bloc combinant U+0300..U+036F est invisible dans un
 * editeur, et une chaine d'outils qui reencode le fichier peut le remplacer
 * sans que personne ne s'en apercoive.
 */
export function normaliser(texte: string): string {
  let sortie = '';
  for (const caractere of texte.normalize('NFD')) {
    const code = caractere.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue;
    sortie += caractere;
  }
  return sortie.toLowerCase();
}

export function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

// --------------------------------------------------------------------------
// Ecran
// --------------------------------------------------------------------------

type Etat =
  | { phase: 'chargement' }
  | { phase: 'erreur'; message: string }
  | { phase: 'pret'; produits: ProduitStock[] };

type Filtre = 'tous' | 'alerte' | 'rupture' | 'non_suivi';

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'alerte', libelle: 'En alerte' },
  { cle: 'rupture', libelle: 'Rupture' },
  { cle: 'non_suivi', libelle: 'Non suivis' },
];

export default function Stock() {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' });
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(async (silencieux: boolean) => {
    if (!silencieux) setEtat({ phase: 'chargement' });
    try {
      setEtat({ phase: 'pret', produits: await chargerProduitsStock() });
    } catch (erreur) {
      setEtat({ phase: 'erreur', message: messageDe(erreur) });
    }
  }, []);

  // Une vente, un ajustement ou une mise en route changent le stock : revenir
  // sur cet ecran doit montrer l'etat reel, pas celui d'il y a dix minutes.
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

  const bilan = useMemo(() => {
    let valeurAchat = 0;
    let valeurVente = 0;
    let ruptures = 0;
    let alertes = 0;
    let aInitialiser = 0;

    for (const p of produits) {
      if (p.gestion_stock === 0) continue;
      valeurAchat += p.quantite_base * p.prix_achat;
      valeurVente += p.quantite_base * p.prix_unitaire;
      const cle = etatStock(p).cle;
      if (cle === 'rupture') ruptures += 1;
      if (cle === 'alerte') alertes += 1;
      if (p.nb_mouvements === 0) aInitialiser += 1;
    }
    return { valeurAchat, valeurVente, ruptures, alertes, aInitialiser };
  }, [produits]);

  const filtres = useMemo(() => {
    const terme = normaliser(recherche.trim());
    return produits.filter((p) => {
      if (filtre !== 'tous' && etatStock(p).cle !== filtre) return false;
      if (terme === '') return true;
      return (
        normaliser(p.nom).includes(terme) ||
        normaliser(p.categorie ?? '').includes(terme) ||
        normaliser(p.code_barre ?? '').includes(terme)
      );
    });
  }, [filtre, produits, recherche]);

  return (
    <View style={s.plein}>
      <BandeauEtat />
      <View style={sl.entete}>
        <BoutonMenu />
        <Text style={sl.titreEcran}>Stock</Text>
        <View style={sl.enteteActions}>
          <Pressable style={sl.actionEntete} onPress={() => router.push('/stock/mouvements')}>
            <Icone nom="mouvements" taille={18} couleur={couleurs.primaire} />
            <Text style={sl.actionEnteteTexte}>Journal</Text>
          </Pressable>
          <Pressable style={sl.actionEntete} onPress={() => router.push('/stock/lots')}>
            <Icone nom="achats" taille={18} couleur={couleurs.primaire} />
            <Text style={sl.actionEnteteTexte}>Receptions</Text>
          </Pressable>
        </View>
      </View>

      {etat.phase === 'chargement' ? (
        <View style={sl.centre}>
          <ActivityIndicator color={C.accent} />
          <Text style={sl.centreTexte}>Lecture du stock...</Text>
        </View>
      ) : etat.phase === 'erreur' ? (
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>Le stock n&apos;a pas pu etre lu</Text>
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
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={rafraichissement} onRefresh={rafraichir} />
          }
          ListHeaderComponent={
            <View style={sl.tete}>
              <View style={sl.cartes}>
                <Carte
                  titre="Valeur d'achat"
                  valeur={formaterFrancs(bilan.valeurAchat)}
                  aide="Ce que le stock a coute"
                />
                <Carte
                  titre="Valeur de vente"
                  valeur={formaterFrancs(bilan.valeurVente)}
                  aide="Ce qu'il rapporterait"
                />
              </View>

              {bilan.ruptures > 0 || bilan.alertes > 0 ? (
                <Pressable style={sl.banniere} onPress={() => router.push('/stock/alertes')}>
                  <View style={sl.banniereTextes}>
                    <Text style={sl.banniereTitre}>
                      {bilan.ruptures} rupture(s), {bilan.alertes} stock(s) bas
                    </Text>
                    <Text style={sl.banniereAide}>Voir ce qu&apos;il faut racheter</Text>
                  </View>
                  <Text style={sl.banniereFleche}>{'>'}</Text>
                </Pressable>
              ) : null}

              {bilan.aInitialiser > 0 ? (
                <Pressable style={sl.banniereDouce} onPress={() => router.push('/stock/initial')}>
                  <View style={sl.banniereTextes}>
                    <Text style={sl.banniereDouceTitre}>
                      {bilan.aInitialiser} produit(s) sans stock de depart
                    </Text>
                    <Text style={sl.banniereAide}>
                      Renseignez ce que vous avez en boutique pour que le suivi commence juste
                    </Text>
                  </View>
                  <Text style={sl.banniereFleche}>{'>'}</Text>
                </Pressable>
              ) : null}

              <View style={[s.zoneSaisie, sl.recherche]}>
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

              <ScrollView
                horizontal
                style={BARRE_HORIZONTALE}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={sl.puces}
                keyboardShouldPersistTaps="handled">
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
                  <Text style={sl.centreTitre}>Aucun produit actif</Text>
                  <Text style={sl.centreTexte}>
                    Le stock se remplit a partir du catalogue. Creez d&apos;abord vos produits.
                  </Text>
                  <Pressable
                    style={s.boutonSecondaire}
                    onPress={() => router.push('/(tabs)/catalogue')}>
                    <Text style={s.boutonSecondaireTexte}>Ouvrir le catalogue</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={sl.centreTitre}>Aucun resultat</Text>
                  <Text style={sl.centreTexte}>
                    Aucun produit ne correspond a cette recherche ni a ce filtre.
                  </Text>
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
          ListFooterComponent={
            filtres.length > 0 ? (
              <Text style={sl.pied}>
                {filtres.length === produits.length
                  ? `${produits.length} produit(s)`
                  : `${filtres.length} sur ${produits.length} produit(s)`}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <LigneProduitStock
              produit={item}
              onOuvrir={() =>
                router.push({
                  pathname: '/produit/[id]',
                  params: { id: String(item.id) },
                })
              }
              onAjuster={() =>
                router.push({
                  pathname: '/stock/ajustement',
                  params: { produit: String(item.id) },
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

      <Pressable style={sl.boutonFlottant} onPress={() => router.push('/stock/ajustement')}>
        <Text style={sl.boutonFlottantTexte}>Entree / Sortie / Ajustement</Text>
      </Pressable>
    </View>
  );
}

function Carte(p: { titre: string; valeur: string; aide: string }) {
  return (
    <View style={sl.carteStat}>
      <Text style={sl.carteTitre}>{p.titre}</Text>
      <Text style={sl.carteValeur} numberOfLines={1} adjustsFontSizeToFit>
        {p.valeur}
      </Text>
      <Text style={sl.carteAide}>{p.aide}</Text>
    </View>
  );
}

function LigneProduitStock(p: {
  produit: ProduitStock;
  onOuvrir: () => void;
  onAjuster: () => void;
  onJournal: () => void;
}) {
  const etat = etatStock(p.produit);
  const sousUnites = analyserSousUnites(p.produit.sous_unites);
  const detail =
    p.produit.gestion_stock === 1 && sousUnites.length > 0 && p.produit.quantite_base > 0
      ? decomposerStock(p.produit.quantite_base, p.produit.unite_base, sousUnites)
      : null;

  return (
    <View style={sl.carteProduit}>
      <Pressable style={sl.carteProduitHaut} onPress={p.onOuvrir} accessibilityRole="button">
        <Vignette chemin={p.produit.chemin_image} nom={p.produit.nom} />
        <View style={sl.carteProduitTextes}>
          <Text style={sl.nom} numberOfLines={2}>
            {p.produit.nom}
          </Text>
          {detail ? (
            <Text style={sl.detail} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
          {p.produit.gestion_stock === 1 && p.produit.stock_min > 0 ? (
            <Text style={sl.meta}>
              Seuil d&apos;alerte : {formaterQuantite(p.produit.stock_min)}{' '}
              {p.produit.unite_base}
            </Text>
          ) : null}
          {p.produit.gestion_stock === 1 && p.produit.nb_mouvements === 0 ? (
            <Text style={sl.metaAlerte}>Stock de depart jamais renseigne</Text>
          ) : null}
        </View>
        <View style={sl.carteProduitDroite}>
          <Text style={[sl.stock, { color: etat.couleur }]} numberOfLines={1}>
            {etat.libelle}
          </Text>
          <Text style={sl.valeur}>
            {formaterFrancs(p.produit.quantite_base * p.produit.prix_achat)}
          </Text>
        </View>
      </Pressable>

      <View style={sl.carteProduitBas}>
        <Pressable style={sl.lien} onPress={p.onJournal} hitSlop={6}>
          <Text style={sl.lienTexte}>Journal</Text>
        </Pressable>
        <Pressable style={sl.lien} onPress={p.onAjuster} hitSlop={6}>
          <Text style={sl.lienTexte}>Mouvement</Text>
        </Pressable>
      </View>
    </View>
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
    paddingBottom: 10,
    backgroundColor: C.carte,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.bordure,
  },
  titreEcran: { fontSize: 20, fontWeight: '700', color: C.texte },
  enteteActions: { flexDirection: 'row', gap: 8 },
  actionEntete: {
    // Pictogramme puis libelle : le premier se reconnait de loin, le second
    // leve le doute.
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.bordure,
  },
  actionEnteteTexte: { fontSize: 13, color: C.accent, fontWeight: '600' },

  tete: { gap: 10, paddingBottom: 4 },
  cartes: { flexDirection: 'row', gap: 8 },
  carteStat: {
    flex: 1,
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    padding: 10,
    gap: 2,
  },
  carteTitre: { fontSize: 11, color: C.texteFaible, fontWeight: '600' },
  carteValeur: { fontSize: 17, fontWeight: '700', color: C.texte },
  carteAide: { fontSize: 10, color: C.texteFaible },

  banniere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: couleurs.avertissementDouce,
    borderWidth: 1,
    borderColor: couleurs.avertissementBordure,
    borderRadius: 10,
    padding: 12,
  },
  banniereDouce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: couleurs.primaireDouce,
    borderWidth: 1,
    borderColor: couleurs.primaireBordure,
    borderRadius: 10,
    padding: 12,
  },
  banniereTextes: { flex: 1, gap: 2 },
  banniereTitre: { fontSize: 14, fontWeight: '700', color: couleurs.avertissementFonce },
  banniereDouceTitre: { fontSize: 14, fontWeight: '700', color: couleurs.primaire },
  banniereAide: { fontSize: 12, color: C.texteFaible, lineHeight: 17 },
  banniereFleche: { fontSize: 18, color: C.texteFaible, fontWeight: '700' },

  recherche: { backgroundColor: C.carte },
  effacer: { fontSize: 12, color: C.accent, fontWeight: '600' },
  puces: { gap: 8, paddingVertical: 2, alignItems: 'center' },

  liste: { padding: 12, paddingBottom: 96, gap: 8 },
  listeVide: { flexGrow: 1, padding: 12, paddingBottom: 96 },

  carteProduit: {
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    overflow: 'hidden',
  },
  carteProduitHaut: { flexDirection: 'row', gap: 10, padding: 10, alignItems: 'flex-start' },
  carteProduitTextes: { flex: 1, gap: 3 },
  carteProduitDroite: { alignItems: 'flex-end', gap: 3, maxWidth: 130 },
  nom: { fontSize: 15, fontWeight: '600', color: C.texte },
  detail: { fontSize: 12, color: C.texte },
  meta: { fontSize: 11, color: C.texteFaible },
  metaAlerte: { fontSize: 11, color: C.orange, fontWeight: '600' },
  stock: { fontSize: 14, fontWeight: '700' },
  valeur: { fontSize: 11, color: C.texteFaible },

  carteProduitBas: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.bordure,
  },
  lien: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  lienTexte: { fontSize: 13, color: C.accent, fontWeight: '600' },

  pied: { paddingVertical: 16, fontSize: 12, color: C.texteFaible, textAlign: 'center' },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centreTitre: { fontSize: 16, fontWeight: '700', color: C.texte },
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
