/**
 * Creation d'un produit, et formulaire partage avec l'ecran de modification.
 *
 * POURQUOI LE FORMULAIRE VIT ICI
 * ------------------------------
 * Creation et modification manipulent exactement les memes champs. Sur le
 * poste de bureau, les deux ecrans ont ete ecrits separement et ont diverge :
 * le formulaire de creation refuse une marge negative que l'ecran d'edition
 * accepte, l'edition ne montre pas les sous-unites existantes et les efface en
 * silence, et le code-barres n'est modifiable par aucun des deux. On ecrit donc
 * ici UN seul formulaire, que `produit/[id].tsx` reutilise : une regle changee
 * s'applique aux deux ecrans, sans possibilite de divergence.
 */
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as SelecteurImage from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { obtenirBase } from '../../src/db/database';
import { genererIdLocal } from '../../src/db/repositories/base';
import { marquerChangement } from '../../src/services/synchronisation';

// --------------------------------------------------------------------------
// Palette
// --------------------------------------------------------------------------

// Le theme n'est plus defini ici : un fichier d'ecran n'a pas a etre la
// source des couleurs de l'application. Il vient de src/ui/theme.
import { C } from '../../src/ui/theme';
import { BandeauEtat, uriImage } from '../../src/ui/components';
import { couleurs } from '../../src/ui/theme';
import { Icone } from '../../src/ui/icones';
export { C };

// --------------------------------------------------------------------------
// Constantes metier
// --------------------------------------------------------------------------

/** Unites de base proposees. La saisie libre reste possible via "Autre". */
export const UNITES_BASE = ['Unite', 'Kg', 'Litre', 'Boite', 'Carton', 'Sac'] as const;

const TYPES_CODE_BARRE = [
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

/** Sous-dossier des photos, sous le repertoire de documents de l'application. */
const DOSSIER_IMAGES = 'produits';

// --------------------------------------------------------------------------
// Types de saisie
// --------------------------------------------------------------------------

export interface SaisieSousUnite {
  /** Cle stable de rendu : l'index bouge quand on supprime une ligne. */
  cle: string;
  nom: string;
  facteur: string;
  prix: string;
}

export interface SaisieProduit {
  nom: string;
  categorie: string;
  codeBarre: string;
  prixAchat: string;
  prixUnitaire: string;
  uniteBase: string;
  stockMin: string;
  /** Uniquement a la creation : quantite en unite de base a l'ouverture. */
  stockInitial: string;
  gestionStock: boolean;
  actif: boolean;
  /** Chemin RELATIF au repertoire de documents, ou null. */
  cheminImage: string | null;
  sousUnites: SaisieSousUnite[];
}

export interface SousUniteValide {
  nom: string;
  facteur: number;
  prix: number;
}

export interface ProduitValide {
  nom: string;
  categorie: string | null;
  codeBarre: string | null;
  prixAchat: number;
  prixUnitaire: number;
  uniteBase: string;
  stockMin: number;
  stockInitial: number;
  gestionStock: boolean;
  actif: boolean;
  cheminImage: string | null;
  sousUnites: SousUniteValide[];
}

interface Erreurs {
  champs: Partial<Record<keyof SaisieProduit, string>>;
  sousUnites: Record<number, string>;
}

// --------------------------------------------------------------------------
// Utilitaires
// --------------------------------------------------------------------------

export function saisieVide(): SaisieProduit {
  return {
    nom: '',
    categorie: '',
    codeBarre: '',
    prixAchat: '',
    prixUnitaire: '',
    uniteBase: 'Unite',
    stockMin: '10',
    stockInitial: '',
    gestionStock: true,
    actif: true,
    cheminImage: null,
    sousUnites: [],
  };
}

export function nouvelleCle(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Accepte la virgule decimale et les espaces de milliers : sur un telephone
 * malien le clavier numerique produit une virgule, pas un point.
 */
export function analyserNombre(texte: string): number | null {
  const nettoye = texte.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (nettoye === '') return null;
  const valeur = Number(nettoye);
  return Number.isFinite(valeur) ? valeur : null;
}

/** Le franc CFA n'a pas de sous-unite : tout montant est un entier de francs. */
export function formaterFrancs(valeur: number): string {
  return Math.round(valeur).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ') + ' F';
}

export function formaterQuantite(valeur: number): string {
  return Number.isInteger(valeur) ? String(valeur) : valeur.toFixed(2);
}

// `uriImage` vit desormais dans les briques partagees : la caisse, le stock et
// le catalogue en ont besoin autant que ce formulaire. Reexporte ici pour ne
// pas casser les neuf ecrans qui l'importent de ce fichier.
export { uriImage };

function messageErreur(erreur: unknown): string {
  const texte = erreur instanceof Error ? erreur.message : String(erreur);
  if (/UNIQUE.*code_barre/i.test(texte)) {
    return 'Ce code-barres est deja utilise par un autre produit.';
  }
  if (/UNIQUE/i.test(texte)) {
    return 'Un produit identique existe deja en base.';
  }
  return texte;
}

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

/**
 * Une seule regle de validation pour la creation ET la modification.
 * La marge negative n'est pas bloquee ici : elle est signalee a l'utilisateur
 * qui confirme. Une boutique solde parfois a perte, et un refus sec au moment
 * d'enregistrer fait perdre toute la saisie.
 */
export function validerSaisie(saisie: SaisieProduit, creation: boolean): {
  erreurs: Erreurs;
  valide: ProduitValide | null;
} {
  const erreurs: Erreurs = { champs: {}, sousUnites: {} };

  const nom = saisie.nom.trim();
  if (nom === '') erreurs.champs.nom = 'Le nom est obligatoire.';

  const prixAchat = analyserNombre(saisie.prixAchat) ?? 0;
  if (prixAchat < 0) erreurs.champs.prixAchat = "Le prix d'achat ne peut pas etre negatif.";

  const prixVente = analyserNombre(saisie.prixUnitaire);
  if (prixVente === null || prixVente <= 0) {
    erreurs.champs.prixUnitaire = 'Le prix de vente doit etre superieur a 0.';
  }

  const uniteBase = saisie.uniteBase.trim();
  if (uniteBase === '') erreurs.champs.uniteBase = "L'unite de base est obligatoire.";

  const stockMin = analyserNombre(saisie.stockMin) ?? 0;
  if (stockMin < 0) erreurs.champs.stockMin = 'Le stock minimum ne peut pas etre negatif.';

  const stockInitial = creation ? (analyserNombre(saisie.stockInitial) ?? 0) : 0;
  if (stockInitial < 0) erreurs.champs.stockInitial = 'Le stock initial ne peut pas etre negatif.';

  const sousUnites: SousUniteValide[] = [];
  const nomsVus = new Set<string>([uniteBase.toLowerCase()]);

  saisie.sousUnites.forEach((ligne, index) => {
    const nomSu = ligne.nom.trim();
    const facteur = analyserNombre(ligne.facteur);
    const prix = analyserNombre(ligne.prix) ?? 0;

    // Une ligne entierement vide est simplement ignoree : l'utilisateur a
    // ajoute une ligne puis change d'avis, ce n'est pas une erreur.
    if (nomSu === '' && ligne.facteur.trim() === '' && ligne.prix.trim() === '') return;

    if (nomSu === '') {
      erreurs.sousUnites[index] = 'Nom manquant.';
      return;
    }
    if (facteur === null || facteur <= 0) {
      erreurs.sousUnites[index] = 'Le facteur doit etre superieur a 0.';
      return;
    }
    if (nomsVus.has(nomSu.toLowerCase())) {
      erreurs.sousUnites[index] = 'Cette unite est deja definie.';
      return;
    }
    if (prix < 0) {
      erreurs.sousUnites[index] = 'Le prix ne peut pas etre negatif.';
      return;
    }
    nomsVus.add(nomSu.toLowerCase());
    // Prix laisse a 0 : la caisse appliquera prix de base x facteur.
    sousUnites.push({ nom: nomSu, facteur, prix: Math.round(prix) });
  });

  const enErreur =
    Object.keys(erreurs.champs).length > 0 || Object.keys(erreurs.sousUnites).length > 0;
  if (enErreur || prixVente === null) return { erreurs, valide: null };

  const categorie = saisie.categorie.trim();
  const codeBarre = saisie.codeBarre.trim();

  return {
    erreurs,
    valide: {
      nom,
      categorie: categorie === '' ? null : categorie,
      // Chaine vide interdite : la colonne est UNIQUE, et SQLite accepte
      // plusieurs NULL mais une seule chaine vide.
      codeBarre: codeBarre === '' ? null : codeBarre,
      prixAchat: Math.round(prixAchat),
      prixUnitaire: Math.round(prixVente),
      uniteBase,
      stockMin,
      stockInitial,
      gestionStock: saisie.gestionStock,
      actif: saisie.actif,
      cheminImage: saisie.cheminImage,
      sousUnites,
    },
  };
}

// --------------------------------------------------------------------------
// Acces aux donnees
// --------------------------------------------------------------------------

/** Categories deja utilisees, pour proposer plutot que de faire ressaisir. */
export async function chargerCategories(): Promise<string[]> {
  const db = await obtenirBase();
  const lignes = await db.getAllAsync<{ categorie: string | null }>(
    `SELECT DISTINCT categorie FROM produit
      WHERE categorie IS NOT NULL AND TRIM(categorie) <> ''
      ORDER BY categorie COLLATE NOCASE`,
  );
  return lignes.map((l) => (l.categorie ?? '').trim()).filter((c) => c !== '');
}

/**
 * Insere le produit, ses sous-unites et son stock d'ouverture dans UNE seule
 * transaction : un produit enregistre sans ses sous-unites serait vendu a la
 * mauvaise unite des la premiere vente.
 */
export async function creerProduit(valide: ProduitValide): Promise<number> {
  const db = await obtenirBase();
  const maintenant = new Date().toISOString();
  let identifiant = 0;

  await db.withTransactionAsync(async () => {
    const idLocal = genererIdLocal();
    const insertion = await db.runAsync(
      `INSERT INTO produit (id_local, nom, categorie, code_barre, prix_unitaire,
                            prix_achat, unite_base, quantite_base, stock_min,
                            gestion_stock, chemin_image, actif, date_creation)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      idLocal,
      valide.nom,
      valide.categorie,
      valide.codeBarre,
      valide.prixUnitaire,
      valide.prixAchat,
      valide.uniteBase,
      valide.stockMin,
      valide.gestionStock ? 1 : 0,
      valide.cheminImage,
      valide.actif ? 1 : 0,
      maintenant,
    );
    identifiant = insertion.lastInsertRowId;

    for (const su of valide.sousUnites) {
      await db.runAsync(
        'INSERT INTO sous_unite (produit_id, nom, facteur, prix) VALUES (?, ?, ?, ?)',
        identifiant,
        su.nom,
        su.facteur,
        su.prix,
      );
    }

    if (valide.stockInitial > 0) {
      await db.runAsync(
        'UPDATE produit SET quantite_base = ?, date_modification = ? WHERE id = ?',
        valide.stockInitial,
        maintenant,
        identifiant,
      );
      await db.runAsync(
        `INSERT INTO mouvement_stock (id_local, produit_id, nature, source_operation, quantite,
                                      unite, quantite_base, stock_avant, stock_apres,
                                      prix_unitaire, motif, date_mouvement)
         VALUES (lower(hex(randomblob(16))), ?, 'ENTREE', 'INITIALISATION', ?, ?, ?, 0, ?, ?, ?, ?)`,
        identifiant,
        valide.stockInitial,
        valide.uniteBase,
        valide.stockInitial,
        valide.stockInitial,
        valide.prixAchat,
        'Stock initial',
        maintenant,
      );
    }
    await marquerChangement('produit', idLocal);
  });

  if (identifiant === 0) throw new Error("Le produit n'a pas pu etre enregistre.");
  return identifiant;
}

// --------------------------------------------------------------------------
// Photo
// --------------------------------------------------------------------------

/**
 * Recopie la photo prise (elle est dans le cache, que le systeme peut vider)
 * vers le repertoire de documents, et rend le chemin RELATIF a stocker.
 */
async function rangerPhoto(uriSource: string): Promise<string> {
  const dossier = new Directory(Paths.document, DOSSIER_IMAGES);
  if (!dossier.exists) dossier.create({ intermediates: true });

  const nomFichier = `${nouvelleCle()}.jpg`;
  const source = new File(uriSource);
  const destination = new File(dossier, nomFichier);
  await source.copy(destination);

  return `${DOSSIER_IMAGES}/${nomFichier}`;
}

/** Efface l'ancienne photo pour ne pas laisser grossir le stockage a chaque retouche. */
function effacerPhoto(cheminRelatif: string | null): void {
  if (!cheminRelatif || !cheminRelatif.startsWith(`${DOSSIER_IMAGES}/`)) return;
  try {
    const fichier = new File(Paths.document, cheminRelatif);
    if (fichier.exists) fichier.delete();
  } catch {
    // Une photo qu'on n'arrive pas a effacer ne doit pas empecher d'enregistrer.
  }
}

// --------------------------------------------------------------------------
// Composants de saisie
// --------------------------------------------------------------------------

interface ProprietesChamp {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  erreur?: string;
  indication?: string;
  clavier?: 'default' | 'numeric';
  suffixe?: string;
  multiligne?: boolean;
}

function Champ(p: ProprietesChamp) {
  return (
    <View style={s.champ}>
      <Text style={s.libelle}>{p.libelle}</Text>
      <View style={[s.zoneSaisie, p.erreur ? s.zoneSaisieErreur : null]}>
        <TextInput
          style={s.saisie}
          value={p.valeur}
          onChangeText={p.onChange}
          placeholder={p.indication}
          placeholderTextColor={C.texteFaible}
          keyboardType={p.clavier === 'numeric' ? 'numeric' : 'default'}
          multiline={p.multiligne}
        />
        {p.suffixe ? <Text style={s.suffixe}>{p.suffixe}</Text> : null}
      </View>
      {p.erreur ? <Text style={s.messageErreur}>{p.erreur}</Text> : null}
    </View>
  );
}

function Puce(p: { texte: string; actif: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={p.onPress}
      style={[s.puce, p.actif ? s.puceActive : null]}
      accessibilityRole="button">
      <Text style={[s.puceTexte, p.actif ? s.puceTexteActif : null]}>{p.texte}</Text>
    </Pressable>
  );
}

function Bascule(p: {
  libelle: string;
  explication: string;
  valeur: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={s.bascule}>
      <View style={s.basculeTextes}>
        <Text style={s.libelle}>{p.libelle}</Text>
        <Text style={s.explication}>{p.explication}</Text>
      </View>
      <Switch value={p.valeur} onValueChange={p.onChange} />
    </View>
  );
}

/**
 * Camera plein ecran, utilisee pour la lecture du code-barres et pour la photo.
 * Les deux usages partagent la meme gestion de permission : la refuser doit
 * afficher une explication, jamais un ecran noir.
 */
function ModaleCamera(p: {
  visible: boolean;
  mode: 'code-barre' | 'photo';
  onFermer: () => void;
  onCodeBarre: (code: string) => void;
  onPhoto: (uri: string) => void;
}) {
  const [permission, demanderPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);
  const [occupe, setOccupe] = useState(false);
  const dejaLu = useRef(false);

  useEffect(() => {
    if (p.visible) dejaLu.current = false;
  }, [p.visible]);

  const surCodeBarre = useCallback(
    (resultat: BarcodeScanningResult) => {
      // La camera emet plusieurs fois le meme code par seconde : sans ce
      // verrou, on ferme la modale puis on ecrase la saisie en boucle.
      if (dejaLu.current) return;
      dejaLu.current = true;
      p.onCodeBarre(resultat.data);
    },
    [p],
  );

  const prendrePhoto = useCallback(async () => {
    if (!camera.current || occupe) return;
    setOccupe(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.5 });
      p.onPhoto(photo.uri);
    } catch (erreur) {
      Alert.alert('Photo', messageErreur(erreur));
    } finally {
      setOccupe(false);
    }
  }, [occupe, p]);

  return (
    <Modal visible={p.visible} animationType="slide" onRequestClose={p.onFermer}>
      <View style={s.camera}>
        {!permission ? (
          <View style={s.cameraMessage}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : !permission.granted ? (
          <View style={s.cameraMessage}>
            <Text style={s.cameraTexte}>
              L&apos;application a besoin de la camera pour
              {p.mode === 'photo' ? ' photographier le produit.' : ' lire le code-barres.'}
            </Text>
            <Pressable style={s.boutonClair} onPress={() => void demanderPermission()}>
              <Text style={s.boutonClairTexte}>Autoriser la camera</Text>
            </Pressable>
            <Pressable style={s.boutonFantome} onPress={p.onFermer}>
              <Text style={s.boutonFantomeTexte}>Saisir a la main</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView
            ref={camera}
            style={s.cameraVue}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...TYPES_CODE_BARRE] }}
            onBarcodeScanned={p.mode === 'code-barre' ? surCodeBarre : undefined}>
            <View style={s.cameraBarre}>
              <Text style={s.cameraTexte}>
                {p.mode === 'code-barre'
                  ? 'Presentez le code-barres devant la camera'
                  : 'Cadrez le produit'}
              </Text>
            </View>
            <View style={s.cameraActions}>
              <Pressable style={s.boutonFantome} onPress={p.onFermer}>
                <Text style={s.boutonFantomeTexte}>Annuler</Text>
              </Pressable>
              {p.mode === 'photo' ? (
                <Pressable style={s.boutonClair} onPress={() => void prendrePhoto()} disabled={occupe}>
                  <Text style={s.boutonClairTexte}>{occupe ? 'Patientez...' : 'Prendre la photo'}</Text>
                </Pressable>
              ) : null}
            </View>
          </CameraView>
        )}
      </View>
    </Modal>
  );
}

// --------------------------------------------------------------------------
// Formulaire partage
// --------------------------------------------------------------------------

export interface ProprietesFormulaire {
  saisieInitiale: SaisieProduit;
  creation: boolean;
  /** Rendu sous le formulaire : suppression, stock courant, etc. */
  complement?: React.ReactNode;
  libelleValider: string;
  onValider: (valide: ProduitValide, saisie: SaisieProduit) => Promise<void>;
  onAnnuler: () => void;
}

export function FormulaireProduit(p: ProprietesFormulaire) {
  const [saisie, setSaisie] = useState<SaisieProduit>(p.saisieInitiale);
  const [erreurs, setErreurs] = useState<Erreurs>({ champs: {}, sousUnites: {} });
  const [categories, setCategories] = useState<string[]>([]);
  const [uniteLibre, setUniteLibre] = useState(
    !UNITES_BASE.includes(p.saisieInitiale.uniteBase as (typeof UNITES_BASE)[number]),
  );
  const [uniteMenuOuvert, setUniteMenuOuvert] = useState(false);
  const [camera, setCamera] = useState<'code-barre' | 'photo' | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    chargerCategories()
      .then((liste) => {
        if (vivant) setCategories(liste);
      })
      .catch(() => {
        // Les suggestions de categorie sont un confort : leur absence ne doit
        // pas empecher de creer un produit.
      });
    return () => {
      vivant = false;
    };
  }, []);

  const modifier = useCallback(<K extends keyof SaisieProduit>(cle: K, valeur: SaisieProduit[K]) => {
    setSaisie((precedent) => ({ ...precedent, [cle]: valeur }));
  }, []);

  const modifierSousUnite = useCallback(
    (index: number, cle: keyof SaisieSousUnite, valeur: string) => {
      setSaisie((precedent) => {
        const copie = precedent.sousUnites.slice();
        const ligne = copie[index];
        if (!ligne) return precedent;
        copie[index] = { ...ligne, [cle]: valeur };
        return { ...precedent, sousUnites: copie };
      });
    },
    [],
  );

  const supprimerSousUnite = useCallback((index: number) => {
    // On filtre sur la cle et non sur l'index capture a la construction :
    // sur le poste de bureau, l'index fige faisait supprimer la mauvaise ligne
    // des la deuxieme suppression.
    setSaisie((precedent) => ({
      ...precedent,
      sousUnites: precedent.sousUnites.filter((_, i) => i !== index),
    }));
    setErreurs((precedent) => ({ ...precedent, sousUnites: {} }));
  }, []);

  const ajouterSousUnite = useCallback(() => {
    setSaisie((precedent) => ({
      ...precedent,
      sousUnites: [...precedent.sousUnites, { cle: nouvelleCle(), nom: '', facteur: '', prix: '' }],
    }));
  }, []);

  /**
   * Choisir une photo deja presente sur le telephone.
   *
   * Un commercant a souvent deja photographie ses articles, ou recu les photos
   * du fournisseur par WhatsApp : l'obliger a tout refaire a l'appareil photo
   * n'a pas de sens.
   */
  const surGalerie = useCallback(async () => {
    try {
      const permission = await SelecteurImage.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Acces aux photos',
          "Autorisez l'acces aux photos pour en choisir une, ou prenez la photo avec l'appareil.",
        );
        return;
      }
      const resultat = await SelecteurImage.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (resultat.canceled || !resultat.assets?.[0]) return;

      const ancien = saisie.cheminImage;
      const chemin = await rangerPhoto(resultat.assets[0].uri);
      effacerPhoto(ancien);
      modifier('cheminImage', chemin);
    } catch (erreur) {
      Alert.alert('Photo', messageErreur(erreur));
    }
  }, [modifier, saisie.cheminImage]);

  const surPhoto = useCallback(
    async (uri: string) => {
      setCamera(null);
      try {
        const ancien = saisie.cheminImage;
        const chemin = await rangerPhoto(uri);
        effacerPhoto(ancien);
        modifier('cheminImage', chemin);
      } catch (erreur) {
        Alert.alert('Photo', messageErreur(erreur));
      }
    },
    [modifier, saisie.cheminImage],
  );

  const enregistrer = useCallback(async () => {
    const { erreurs: trouvees, valide } = validerSaisie(saisie, p.creation);
    setErreurs(trouvees);
    setErreurGlobale(null);

    if (!valide) {
      Alert.alert('Formulaire incomplet', 'Corrigez les champs signales en rouge.');
      return;
    }

    const margeNegative = valide.prixAchat > 0 && valide.prixUnitaire <= valide.prixAchat;
    if (margeNegative) {
      const perte = valide.prixAchat - valide.prixUnitaire;
      const confirme = await new Promise<boolean>((resoudre) => {
        Alert.alert(
          'Marge nulle ou negative',
          `Le prix de vente (${formaterFrancs(valide.prixUnitaire)}) ne couvre pas le prix ` +
            `d'achat (${formaterFrancs(valide.prixAchat)}). Perte de ${formaterFrancs(perte)} ` +
            'par unite vendue. Enregistrer quand meme ?',
          [
            { text: 'Corriger', style: 'cancel', onPress: () => resoudre(false) },
            { text: 'Enregistrer', onPress: () => resoudre(true) },
          ],
        );
      });
      if (!confirme) return;
    }

    setEnregistrement(true);
    try {
      await p.onValider(valide, saisie);
    } catch (erreur) {
      setErreurGlobale(messageErreur(erreur));
    } finally {
      setEnregistrement(false);
    }
  }, [p, saisie]);

  const apercu = uriImage(saisie.cheminImage);

  return (
    <KeyboardAvoidingView
      style={s.plein}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled">
        {erreurGlobale ? (
          <View style={s.banniereErreur}>
            <Text style={s.banniereErreurTexte}>{erreurGlobale}</Text>
          </View>
        ) : null}

        {/* ---- Identite ---- */}
        <View style={s.carte}>
          <Text style={s.titreSection}>Identite</Text>

          <View style={s.ligneImage}>
            {apercu ? (
              <Image source={{ uri: apercu }} style={s.apercuImage} resizeMode="cover" />
            ) : (
              <View style={[s.apercuImage, s.apercuVide]}>
                <Text style={s.apercuVideTexte}>Pas de photo</Text>
              </View>
            )}
            <View style={s.ligneImageActions}>
              <Pressable style={s.boutonSecondaire} onPress={() => setCamera('photo')}>
                <Text style={s.boutonSecondaireTexte}>Appareil photo</Text>
              </Pressable>
              <Pressable style={s.boutonSecondaire} onPress={() => void surGalerie()}>
                <Text style={s.boutonSecondaireTexte}>Galerie</Text>
              </Pressable>
              {saisie.cheminImage ? (
                <Pressable
                  style={s.boutonSecondaire}
                  onPress={() => {
                    effacerPhoto(saisie.cheminImage);
                    modifier('cheminImage', null);
                  }}>
                  <Text style={[s.boutonSecondaireTexte, { color: C.rouge }]}>Retirer</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Champ
            libelle="Nom du produit"
            valeur={saisie.nom}
            onChange={(v) => modifier('nom', v)}
            erreur={erreurs.champs.nom}
            indication="Riz Royal 50 kg"
          />

          <Champ
            libelle="Categorie"
            valeur={saisie.categorie}
            onChange={(v) => modifier('categorie', v)}
            indication="Alimentaire"
          />
          {categories.length > 0 ? (
            <View style={s.puces}>
              {categories.slice(0, 12).map((c) => (
                <Puce
                  key={c}
                  texte={c}
                  actif={saisie.categorie.trim().toLowerCase() === c.toLowerCase()}
                  onPress={() => modifier('categorie', saisie.categorie.trim() === c ? '' : c)}
                />
              ))}
            </View>
          ) : null}

          <View style={s.champ}>
            <Text style={s.libelle}>Code-barres</Text>
            <View style={s.ligneCodeBarre}>
              <View style={[s.zoneSaisie, s.plein]}>
                <TextInput
                  style={s.saisie}
                  value={saisie.codeBarre}
                  onChangeText={(v) => modifier('codeBarre', v)}
                  placeholder="Optionnel"
                  placeholderTextColor={C.texteFaible}
                  keyboardType="default"
                  autoCapitalize="none"
                />
              </View>
              <Pressable style={s.boutonScanner} onPress={() => setCamera('code-barre')}>
                <Text style={s.boutonScannerTexte}>Scanner</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ---- Prix ---- */}
        <View style={s.carte}>
          <Text style={s.titreSection}>Prix</Text>
          <Champ
            libelle="Prix d'achat"
            valeur={saisie.prixAchat}
            onChange={(v) => modifier('prixAchat', v)}
            erreur={erreurs.champs.prixAchat}
            clavier="numeric"
            indication="0"
            suffixe="F"
          />
          <Champ
            libelle="Prix de vente"
            valeur={saisie.prixUnitaire}
            onChange={(v) => modifier('prixUnitaire', v)}
            erreur={erreurs.champs.prixUnitaire}
            clavier="numeric"
            indication="0"
            suffixe="F"
          />
          <Text style={s.explication}>
            Prix pour une {saisie.uniteBase.trim() === '' ? 'unite' : saisie.uniteBase}. Les
            sous-unites ci-dessous peuvent avoir leur propre prix.
          </Text>
        </View>

        {/* ---- Unites ---- */}
        <View style={s.carte}>
          <Text style={s.titreSection}>Unite de base</Text>
          <Pressable
            style={[s.selecteurUnite, erreurs.champs.uniteBase ? s.zoneSaisieErreur : null]}
            onPress={() => setUniteMenuOuvert(true)}
          >
            <Text style={s.selecteurUniteTexte}>
              {uniteLibre ? 'Autre unite' : saisie.uniteBase || 'Choisir'}
            </Text>
            <Text style={s.selecteurUniteChevron}>⌄</Text>
          </Pressable>
          <Modal
            visible={uniteMenuOuvert}
            transparent
            animationType="fade"
            onRequestClose={() => setUniteMenuOuvert(false)}
          >
            <Pressable style={s.voileSelecteur} onPress={() => setUniteMenuOuvert(false)}>
              <View style={s.menuUnite} onStartShouldSetResponder={() => true}>
                <Text style={s.menuUniteTitre}>Unite de base</Text>
                {[...UNITES_BASE, 'Autre'].map((u) => (
                  <Pressable
                    key={u}
                    style={s.menuUniteOption}
                    onPress={() => {
                      if (u === 'Autre') {
                        setUniteLibre(true);
                        modifier('uniteBase', '');
                      } else {
                        setUniteLibre(false);
                        modifier('uniteBase', u);
                      }
                      setUniteMenuOuvert(false);
                    }}
                  >
                    <Text style={s.menuUniteOptionTexte}>{u}</Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Modal>
          {uniteLibre ? (
            <Champ
              libelle="Nom de l'unite"
              valeur={saisie.uniteBase}
              onChange={(v) => modifier('uniteBase', v)}
              erreur={erreurs.champs.uniteBase}
              indication="Bidon"
            />
          ) : erreurs.champs.uniteBase ? (
            <Text style={s.messageErreur}>{erreurs.champs.uniteBase}</Text>
          ) : null}
        </View>

        {/* ---- Sous-unites ---- */}
        <View style={s.carte}>
          <Text style={s.titreSection}>Sous-unites</Text>
          <Text style={s.explication}>
            Une sous-unite vaut "facteur" fois l&apos;unite de base. Un sac de 50 kg pour un
            produit en Kg : facteur 50. Prix laisse a 0 : la caisse applique le prix de base
            multiplie par le facteur.
          </Text>

          {saisie.sousUnites.length === 0 ? (
            <Text style={s.vide}>Aucune sous-unite. Le produit se vend uniquement en{' '}
              {saisie.uniteBase.trim() === '' ? 'unite' : saisie.uniteBase}.</Text>
          ) : null}

          {saisie.sousUnites.map((ligne, index) => (
            <View key={ligne.cle} style={s.sousUnite}>
              <View style={s.sousUniteLigne}>
                <View style={[s.zoneSaisie, s.sousUniteNom]}>
                  <TextInput
                    style={s.saisie}
                    value={ligne.nom}
                    onChangeText={(v) => modifierSousUnite(index, 'nom', v)}
                    placeholder="Sac"
                    placeholderTextColor={C.texteFaible}
                  />
                </View>
                <View style={[s.zoneSaisie, s.sousUniteNombre]}>
                  <Text style={s.prefixe}>x</Text>
                  <TextInput
                    style={s.saisie}
                    value={ligne.facteur}
                    onChangeText={(v) => modifierSousUnite(index, 'facteur', v)}
                    placeholder="50"
                    placeholderTextColor={C.texteFaible}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[s.zoneSaisie, s.sousUniteNombre]}>
                  <TextInput
                    style={s.saisie}
                    value={ligne.prix}
                    onChangeText={(v) => modifierSousUnite(index, 'prix', v)}
                    placeholder="0"
                    placeholderTextColor={C.texteFaible}
                    keyboardType="numeric"
                  />
                  <Text style={s.suffixe}>F</Text>
                </View>
                <Pressable style={s.boutonRetirer} onPress={() => supprimerSousUnite(index)}>
                  <Text style={s.boutonRetirerTexte}>Retirer</Text>
                </Pressable>
              </View>
              {erreurs.sousUnites[index] ? (
                <Text style={s.messageErreur}>{erreurs.sousUnites[index]}</Text>
              ) : null}
            </View>
          ))}

          <Pressable style={s.boutonSecondaire} onPress={ajouterSousUnite}>
            <Text style={s.boutonSecondaireTexte}>Ajouter une sous-unite</Text>
          </Pressable>
        </View>

        {/* ---- Stock ---- */}
        <View style={s.carte}>
          <Text style={s.titreSection}>Stock</Text>
          <Bascule
            libelle="Suivre le stock"
            explication="Desactive, le produit se vend sans jamais decompter de quantite."
            valeur={saisie.gestionStock}
            onChange={(v) => modifier('gestionStock', v)}
          />
          {saisie.gestionStock ? (
            <>
              <Champ
                libelle="Stock minimum (alerte)"
                valeur={saisie.stockMin}
                onChange={(v) => modifier('stockMin', v)}
                erreur={erreurs.champs.stockMin}
                clavier="numeric"
                indication="0"
                suffixe={saisie.uniteBase}
              />
              {p.creation ? (
                <Champ
                  libelle="Stock initial"
                  valeur={saisie.stockInitial}
                  onChange={(v) => modifier('stockInitial', v)}
                  erreur={erreurs.champs.stockInitial}
                  clavier="numeric"
                  indication="0"
                  suffixe={saisie.uniteBase}
                />
              ) : null}
            </>
          ) : null}
          <Bascule
            libelle="Produit actif"
            explication="Un produit inactif reste en base mais n'apparait plus a la caisse."
            valeur={saisie.actif}
            onChange={(v) => modifier('actif', v)}
          />
        </View>

        {p.complement}

        <View style={s.actionsBas}>
          <Pressable style={s.boutonFantomeSombre} onPress={p.onAnnuler} disabled={enregistrement}>
            <Text style={s.boutonFantomeSombreTexte}>Annuler</Text>
          </Pressable>
          <Pressable
            style={[s.boutonPrincipal, enregistrement ? s.boutonDesactive : null]}
            onPress={() => void enregistrer()}
            disabled={enregistrement}>
            {enregistrement ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={s.boutonPrincipalTexte}>{p.libelleValider}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>

      <ModaleCamera
        visible={camera !== null}
        mode={camera ?? 'code-barre'}
        onFermer={() => setCamera(null)}
        onCodeBarre={(code) => {
          setCamera(null);
          modifier('codeBarre', code);
        }}
        onPhoto={(uri) => void surPhoto(uri)}
      />
    </KeyboardAvoidingView>
  );
}

// --------------------------------------------------------------------------
// Ecran
// --------------------------------------------------------------------------

export default function NouveauProduit() {
  const router = useRouter();

  const valider = useCallback(
    async (valide: ProduitValide) => {
      const identifiant = await creerProduit(valide);
      // On remplace l'ecran de creation par la fiche : revenir en arriere doit
      // ramener au catalogue, pas a un formulaire deja enregistre.
      router.replace({ pathname: '/produit/[id]', params: { id: String(identifiant) } });
    },
    [router],
  );

  return (
    <View style={s.plein}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} style={s.retour}>
          <Icone nom="retour" taille={17} couleur={couleurs.primaire} />
          <Text style={s.retourTexte}>Retour</Text>
        </Pressable>
        <Text style={s.titre}>Nouveau produit</Text>
      </View>
      <FormulaireProduit
        saisieInitiale={saisieVide()}
        creation
        libelleValider="Creer le produit"
        onValider={valider}
        onAnnuler={() => router.back()}
      />
    </View>
  );
}

// --------------------------------------------------------------------------
// Styles
// --------------------------------------------------------------------------

export const s = StyleSheet.create({
  plein: { flex: 1, backgroundColor: C.fond },
  contenu: { padding: 12, paddingBottom: 40, gap: 12 },

  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: C.carte,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.bordure,
  },
  retour: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingRight: 4,
  },
  retourTexte: { color: C.accent, fontSize: 15, fontWeight: '600' },
  titre: { fontSize: 18, fontWeight: '700', color: C.texte, flexShrink: 1 },

  carte: {
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    padding: 12,
    gap: 10,
  },
  titreSection: { fontSize: 15, fontWeight: '700', color: C.texte },

  champ: { gap: 6 },
  libelle: { fontSize: 13, fontWeight: '600', color: C.texte },
  explication: { fontSize: 12, color: C.texteFaible, lineHeight: 17 },
  vide: { fontSize: 13, color: C.texteFaible, fontStyle: 'italic' },

  zoneSaisie: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.bordure,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    minHeight: 44,
  },
  zoneSaisieErreur: { borderColor: C.rouge },
  saisie: { flex: 1, fontSize: 15, color: C.texte, paddingVertical: 8 },
  suffixe: { fontSize: 13, color: C.texteFaible, marginLeft: 6 },
  prefixe: { fontSize: 13, color: C.texteFaible, marginRight: 4 },
  messageErreur: { fontSize: 12, color: C.rouge },
  selecteurUnite: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: C.bordure,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selecteurUniteTexte: { fontSize: 15, fontWeight: '600', color: C.texte },
  selecteurUniteChevron: { fontSize: 20, color: C.texteFaible },
  voileSelecteur: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  menuUnite: {
    backgroundColor: C.carte,
    borderRadius: 16,
    padding: 10,
    gap: 2,
  },
  menuUniteTitre: {
    fontSize: 16,
    fontWeight: '800',
    color: C.texte,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  menuUniteOption: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  menuUniteOptionTexte: { fontSize: 16, color: C.texte, fontWeight: '600' },

  banniereErreur: {
    backgroundColor: couleurs.dangerDouce,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: couleurs.dangerBordure,
  },
  banniereErreurTexte: { color: couleurs.dangerFonce, fontSize: 13 },

  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puce: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.bordure,
    backgroundColor: '#FFFFFF',
  },
  puceActive: { backgroundColor: C.accent, borderColor: C.accent },
  puceTexte: { fontSize: 13, color: C.texte },
  puceTexteActif: { color: '#FFFFFF', fontWeight: '600' },

  bascule: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  basculeTextes: { flex: 1, gap: 2 },

  ligneImage: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  ligneImageActions: { flex: 1, gap: 8 },
  apercuImage: { width: 88, height: 88, borderRadius: 8, backgroundColor: C.fond },
  apercuVide: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.bordure,
    borderStyle: 'dashed',
  },
  apercuVideTexte: { fontSize: 11, color: C.texteFaible, textAlign: 'center' },

  ligneCodeBarre: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  boutonScanner: {
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 8,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonScannerTexte: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },

  sousUnite: { gap: 6 },
  sousUniteLigne: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  sousUniteNom: { flexGrow: 1, flexBasis: 110 },
  sousUniteNombre: { flexGrow: 1, flexBasis: 74 },
  boutonRetirer: { paddingHorizontal: 8, paddingVertical: 10 },
  boutonRetirerTexte: { color: C.rouge, fontSize: 13, fontWeight: '600' },

  boutonSecondaire: {
    borderWidth: 1,
    borderColor: C.bordure,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  boutonSecondaireTexte: { color: C.accent, fontWeight: '600', fontSize: 14 },

  actionsBas: { flexDirection: 'row', gap: 10 },
  boutonPrincipal: {
    flex: 2,
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  boutonPrincipalTexte: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  boutonDesactive: { opacity: 0.6 },
  boutonFantomeSombre: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.bordure,
    backgroundColor: '#FFFFFF',
  },
  boutonFantomeSombreTexte: { color: C.texteFaible, fontWeight: '600', fontSize: 15 },

  camera: { flex: 1, backgroundColor: '#000000' },
  cameraVue: { flex: 1, justifyContent: 'space-between' },
  cameraMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  cameraTexte: { color: '#FFFFFF', fontSize: 15, textAlign: 'center' },
  cameraBarre: { padding: 20, backgroundColor: 'rgba(0,0,0,0.45)' },
  cameraActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  boutonClair: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
    flex: 1,
  },
  boutonClairTexte: { color: C.texte, fontWeight: '700', fontSize: 15 },
  boutonFantome: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
    flex: 1,
  },
  boutonFantomeTexte: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});
