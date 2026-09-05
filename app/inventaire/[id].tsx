/**
 * Comptage d'un inventaire : un produit par ligne, le stock theorique en
 * regard, le stock reel a saisir, l'ecart calcule pendant la frappe.
 *
 * POURQUOI UN PRODUIT NON COMPTE N'EST PAS UN ZERO
 * -----------------------------------------------
 * Un champ laisse vide veut dire "pas encore compte", jamais "il n'y en a
 * plus". Confondre les deux viderait le stock de tout ce que le commercant
 * n'a pas eu le temps de regarder. Les lignes vides sont donc ignorees a la
 * validation : elles ne produisent aucun ajustement, et le compteur du bas dit
 * en permanence combien de produits restent a voir.
 *
 * POURQUOI L'AJUSTEMENT APPLIQUE L'ECART ET N'ECRASE PAS LE STOCK
 * --------------------------------------------------------------
 * Le comptage se compare au stock fige a l'ouverture de l'inventaire. Si une
 * vente est passee entre le comptage et la validation, ecrire betement le
 * stock compte effacerait cette vente. On applique donc la DIFFERENCE trouvee
 * au stock du moment : quand rien n'a bouge le resultat est identique, et
 * quand quelque chose a bouge la vente est preservee.
 *
 * POURQUOI UN INVENTAIRE SANS ECART EST VALIDABLE
 * ----------------------------------------------
 * Le poste de bureau refusait de valider un comptage conforme et le laissait
 * en brouillon pour toujours : constater que tout est juste n'etait pas
 * tracable. Ici un inventaire conforme se valide et se garde, ecarts a zero.
 */
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { obtenirBase } from '../../src/db/database';
import { useSession } from '../_layout';
import { C, analyserNombre, formaterQuantite, s } from '../produit/nouveau';
import {
  SEUIL_ECART,
  couleurStatut,
  enStatut,
  formaterDate,
  formaterEcartFrancs,
  formaterEcartQuantite,
  libelleStatut,
  messageErreur,
  type StatutInventaire,
} from './index';
import {
  BARRE_HORIZONTALE, BandeauEtat, couleurs } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';

/** Codes lisibles par la camera. Les memes que la fiche produit. */
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
] as const;

// --------------------------------------------------------------------------
// Acces aux donnees
// --------------------------------------------------------------------------

interface EnteteInventaire {
  id: number;
  numero: string;
  statut: string;
  date_creation: string;
  date_validation: string | null;
  utilisateur_nom: string | null;
  nb_produits: number;
  nb_ecarts: number;
  valeur_ecarts: number;
  motif: string | null;
}

interface LigneComptage {
  id: number;
  produit_id: number;
  nom: string;
  categorie: string | null;
  code_barre: string | null;
  unite_base: string;
  stock_theorique: number;
  stock_physique: number | null;
  ecart: number | null;
  valeur_ecart: number | null;
  prix_achat: number;
}

interface Fiche {
  entete: EnteteInventaire;
  lignes: LigneComptage[];
}

async function chargerFiche(identifiant: number): Promise<Fiche | null> {
  const db = await obtenirBase();

  const entete = await db.getFirstAsync<EnteteInventaire>(
    `SELECT id, numero, statut, date_creation, date_validation, utilisateur_nom,
            nb_produits, nb_ecarts, valeur_ecarts, motif
       FROM inventaire WHERE id = ?`,
    identifiant,
  );
  if (!entete) return null;

  const lignes = await db.getAllAsync<LigneComptage>(
    `SELECT li.id, li.produit_id, li.stock_theorique, li.stock_physique,
            li.ecart, li.valeur_ecart, li.prix_achat,
            p.nom, p.categorie, p.code_barre, p.unite_base
       FROM ligne_inventaire li
       JOIN produit p ON p.id = li.produit_id
      WHERE li.inventaire_id = ?
      ORDER BY p.nom COLLATE NOCASE`,
    identifiant,
  );

  return { entete, lignes };
}

/**
 * Ecrit un comptage des que la ligne est quittee.
 *
 * Une caisse est tuee par le systeme sans prevenir quand la memoire manque :
 * garder trente saisies en memoire jusqu'a la validation, c'est accepter de
 * recommencer tout le comptage. Chaque ligne quittee est donc deja en base.
 */
async function enregistrerComptage(
  ligneId: number,
  stockTheorique: number,
  prixAchat: number,
  stockPhysique: number | null,
): Promise<void> {
  const db = await obtenirBase();
  if (stockPhysique === null) {
    await db.runAsync(
      'UPDATE ligne_inventaire SET stock_physique = NULL, ecart = NULL, valeur_ecart = NULL WHERE id = ?',
      ligneId,
    );
    return;
  }
  const ecart = stockPhysique - stockTheorique;
  await db.runAsync(
    'UPDATE ligne_inventaire SET stock_physique = ?, ecart = ?, valeur_ecart = ? WHERE id = ?',
    stockPhysique,
    ecart,
    Math.round(ecart * prixAchat),
    ligneId,
  );
}

interface Comptage {
  ligneId: number;
  produitId: number;
  nom: string;
  uniteBase: string;
  stockTheorique: number;
  prixAchat: number;
  stockPhysique: number | null;
}

interface ResultatValidation {
  nbComptes: number;
  nbEcarts: number;
  valeurEcarts: number;
}

/**
 * Valide l'inventaire : ecrit les lignes, corrige les stocks, journalise.
 *
 * Tout tient dans une seule transaction. Un ajustement ecrit sans que
 * l'inventaire passe en valide laisserait un stock corrige que l'on pourrait
 * corriger une seconde fois en revalidant.
 */
async function validerInventaire(
  inventaireId: number,
  comptages: Comptage[],
  utilisateurNom: string | null,
): Promise<ResultatValidation> {
  const db = await obtenirBase();
  const maintenant = new Date().toISOString();

  let nbComptes = 0;
  let nbEcarts = 0;
  let valeurEcarts = 0;

  await db.withTransactionAsync(async () => {
    nbComptes = 0;
    nbEcarts = 0;
    valeurEcarts = 0;

    const entete = await db.getFirstAsync<{ statut: string; numero: string }>(
      'SELECT statut, numero FROM inventaire WHERE id = ?',
      inventaireId,
    );
    if (!entete) throw new Error('Cet inventaire a disparu.');
    // Revalider un inventaire deja valide rejouerait ses ajustements et
    // doublerait la correction. Le bureau le permettait.
    if (enStatut(entete.statut) !== 'BROUILLON') {
      throw new Error(
        `${entete.numero} est deja ${libelleStatut(enStatut(entete.statut)).toLowerCase()} : il ne peut plus etre valide.`,
      );
    }

    for (const c of comptages) {
      if (c.stockPhysique === null) {
        await db.runAsync(
          'UPDATE ligne_inventaire SET stock_physique = NULL, ecart = NULL, valeur_ecart = NULL WHERE id = ?',
          c.ligneId,
        );
        continue;
      }

      nbComptes++;
      const ecart = c.stockPhysique - c.stockTheorique;
      const valeurEcart = Math.round(ecart * c.prixAchat);
      await db.runAsync(
        'UPDATE ligne_inventaire SET stock_physique = ?, ecart = ?, valeur_ecart = ? WHERE id = ?',
        c.stockPhysique,
        ecart,
        valeurEcart,
        c.ligneId,
      );

      if (Math.abs(ecart) <= SEUIL_ECART) continue;

      nbEcarts++;
      valeurEcarts += valeurEcart;

      const produit = await db.getFirstAsync<{ quantite_base: number }>(
        'SELECT quantite_base FROM produit WHERE id = ?',
        c.produitId,
      );
      if (!produit) throw new Error(`Le produit ${c.nom} a disparu du catalogue.`);

      const avant = produit.quantite_base;
      const apres = avant + ecart;

      await db.runAsync(
        'UPDATE produit SET quantite_base = ?, date_modification = ? WHERE id = ?',
        apres,
        maintenant,
        c.produitId,
      );
      // Sur un ajustement, `quantite` porte ce qui a ete COMPTE, pas l'ecart :
      // c'est la convention que lit le journal de stock. L'ecart, lui, se lit
      // entre stock_avant et stock_apres, qui sont donc obligatoires ici -
      // sans eux la ligne du journal serait indechiffrable.
      await db.runAsync(
        `INSERT INTO mouvement_stock (id_local, produit_id, nature, source_operation, quantite,
                                      unite, quantite_base, stock_avant, stock_apres,
                                      prix_unitaire, reference, motif, utilisateur,
                                      date_mouvement)
         VALUES (lower(hex(randomblob(16))), ?, 'AJUSTEMENT', 'INVENTAIRE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c.produitId,
        c.stockPhysique,
        c.uniteBase,
        c.stockPhysique,
        avant,
        apres,
        c.prixAchat,
        entete.numero,
        `Inventaire ${entete.numero}`,
        utilisateurNom,
        maintenant,
      );
    }

    await db.runAsync(
      `UPDATE inventaire
          SET statut = 'VALIDE', date_validation = ?, nb_ecarts = ?, valeur_ecarts = ?
        WHERE id = ?`,
      maintenant,
      nbEcarts,
      valeurEcarts,
      inventaireId,
    );
  });

  return { nbComptes, nbEcarts, valeurEcarts };
}

/** Abandon d'un comptage : rien n'est efface, rien n'est corrige. */
async function annulerInventaire(
  inventaireId: number,
  utilisateurNom: string | null,
): Promise<void> {
  const db = await obtenirBase();
  const entete = await db.getFirstAsync<{ statut: string }>(
    'SELECT statut FROM inventaire WHERE id = ?',
    inventaireId,
  );
  if (!entete) throw new Error('Cet inventaire a disparu.');
  if (enStatut(entete.statut) !== 'BROUILLON') {
    throw new Error("Seul un comptage en cours peut etre abandonne.");
  }
  await db.runAsync(
    'UPDATE inventaire SET statut = ?, motif = ? WHERE id = ?',
    'ANNULE',
    utilisateurNom ? `Abandonne par ${utilisateurNom}` : 'Abandonne',
    inventaireId,
  );
}

// --------------------------------------------------------------------------
// Analyse d'une ligne saisie
// --------------------------------------------------------------------------

interface AnalyseLigne {
  ligne: LigneComptage;
  texte: string;
  /** null = pas encore compte. */
  physique: number | null;
  /** Saisie illisible ou negative : la ligne bloque la validation. */
  invalide: boolean;
  ecart: number | null;
  valeurEcart: number | null;
}

function analyser(ligne: LigneComptage, texte: string): AnalyseLigne {
  const brut = texte.trim();
  if (brut === '') {
    return { ligne, texte, physique: null, invalide: false, ecart: null, valeurEcart: null };
  }
  const valeur = analyserNombre(brut);
  if (valeur === null || valeur < 0) {
    return { ligne, texte, physique: null, invalide: true, ecart: null, valeurEcart: null };
  }
  const ecart = valeur - ligne.stock_theorique;
  return {
    ligne,
    texte,
    physique: valeur,
    invalide: false,
    ecart,
    valeurEcart: Math.round(ecart * ligne.prix_achat),
  };
}

/** Recherche insensible aux accents : "Cafe" doit trouver "Cafe". */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// --------------------------------------------------------------------------
// Ecran
// --------------------------------------------------------------------------

type Filtre = 'tous' | 'restants' | 'comptes' | 'ecarts';

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'restants', libelle: 'A compter' },
  { cle: 'comptes', libelle: 'Comptes' },
  { cle: 'ecarts', libelle: 'Ecarts' },
];

type Etat =
  | { phase: 'chargement' }
  | { phase: 'erreur'; message: string }
  | { phase: 'absent' }
  | { phase: 'pret'; fiche: Fiche };

export default function EcranInventaire() {
  const parametres = useLocalSearchParams<{ id?: string }>();
  const identifiant = Number(parametres.id);
  const router = useRouter();
  const session = useSession();

  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' });
  const [saisies, setSaisies] = useState<Record<number, string>>({});
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [cible, setCible] = useState<number | null>(null);
  const [scanner, setScanner] = useState(false);
  const [travail, setTravail] = useState(false);
  const [avertissement, setAvertissement] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!Number.isFinite(identifiant)) {
      setEtat({ phase: 'erreur', message: "L'adresse de cet inventaire est incomplete." });
      return;
    }
    setEtat({ phase: 'chargement' });
    try {
      const fiche = await chargerFiche(identifiant);
      if (!fiche) {
        setEtat({ phase: 'absent' });
        return;
      }
      const depart: Record<number, string> = {};
      for (const ligne of fiche.lignes) {
        depart[ligne.id] =
          ligne.stock_physique === null ? '' : formaterQuantite(ligne.stock_physique);
      }
      setSaisies(depart);
      setEtat({ phase: 'pret', fiche });
    } catch (erreur) {
      setEtat({ phase: 'erreur', message: messageErreur(erreur) });
    }
  }, [identifiant]);

  // Volontairement au montage et non a chaque retour de focus : recharger
  // pendant un comptage ecraserait les saisies en cours.
  useEffect(() => {
    void charger();
  }, [charger]);

  const fiche = etat.phase === 'pret' ? etat.fiche : null;
  const statut: StatutInventaire = fiche ? enStatut(fiche.entete.statut) : 'BROUILLON';
  const modifiable = statut === 'BROUILLON';

  const analyses = useMemo<AnalyseLigne[]>(() => {
    if (!fiche) return [];
    return fiche.lignes.map((ligne) => analyser(ligne, saisies[ligne.id] ?? ''));
  }, [fiche, saisies]);

  const bilan = useMemo(() => {
    let comptes = 0;
    let ecarts = 0;
    let valeur = 0;
    let invalides = 0;
    let sansPrix = 0;
    for (const a of analyses) {
      if (a.invalide) {
        invalides++;
        continue;
      }
      if (a.physique === null || a.ecart === null || a.valeurEcart === null) continue;
      comptes++;
      if (Math.abs(a.ecart) <= SEUIL_ECART) continue;
      ecarts++;
      valeur += a.valeurEcart;
      if (a.ligne.prix_achat <= 0) sansPrix++;
    }
    return {
      total: analyses.length,
      comptes,
      restants: analyses.length - comptes - invalides,
      ecarts,
      valeur,
      invalides,
      sansPrix,
    };
  }, [analyses]);

  const filtrees = useMemo(() => {
    if (cible !== null) return analyses.filter((a) => a.ligne.id === cible);
    const terme = normaliser(recherche.trim());
    return analyses.filter((a) => {
      if (filtre === 'restants' && a.physique !== null) return false;
      if (filtre === 'comptes' && a.physique === null) return false;
      if (filtre === 'ecarts' && (a.ecart === null || Math.abs(a.ecart) <= SEUIL_ECART)) {
        return false;
      }
      if (terme === '') return true;
      return (
        normaliser(a.ligne.nom).includes(terme) ||
        normaliser(a.ligne.categorie ?? '').includes(terme) ||
        normaliser(a.ligne.code_barre ?? '').includes(terme)
      );
    });
  }, [analyses, cible, filtre, recherche]);

  const changer = useCallback((ligneId: number, texte: string) => {
    setSaisies((precedent) => ({ ...precedent, [ligneId]: texte }));
  }, []);

  const commiter = useCallback(
    (ligneId: number) => {
      if (!fiche || !modifiable) return;
      const ligne = fiche.lignes.find((l) => l.id === ligneId);
      if (!ligne) return;
      const analyse = analyser(ligne, saisies[ligneId] ?? '');
      if (analyse.invalide) return;
      void enregistrerComptage(
        ligneId,
        ligne.stock_theorique,
        ligne.prix_achat,
        analyse.physique,
      ).catch((erreur: unknown) => {
        setAvertissement(
          `Le comptage de ${ligne.nom} n'a pas pu etre enregistre : ${messageErreur(erreur)}`,
        );
      });
    },
    [fiche, modifiable, saisies],
  );

  const marquerConforme = useCallback(
    (ligne: LigneComptage) => {
      const texte = formaterQuantite(ligne.stock_theorique);
      setSaisies((precedent) => ({ ...precedent, [ligne.id]: texte }));
      void enregistrerComptage(
        ligne.id,
        ligne.stock_theorique,
        ligne.prix_achat,
        ligne.stock_theorique,
      ).catch((erreur: unknown) => {
        setAvertissement(
          `Le comptage de ${ligne.nom} n'a pas pu etre enregistre : ${messageErreur(erreur)}`,
        );
      });
    },
    [],
  );

  const effacerLigne = useCallback((ligne: LigneComptage) => {
    setSaisies((precedent) => ({ ...precedent, [ligne.id]: '' }));
    void enregistrerComptage(ligne.id, ligne.stock_theorique, ligne.prix_achat, null).catch(
      (erreur: unknown) => {
        setAvertissement(
          `Le comptage de ${ligne.nom} n'a pas pu etre efface : ${messageErreur(erreur)}`,
        );
      },
    );
  }, []);

  /** Rend true si le code a ete reconnu : la modale se ferme alors seule. */
  const surCodeBarre = useCallback(
    (code: string): boolean => {
      if (!fiche) return false;
      const propre = code.trim();
      const trouvee = fiche.lignes.find((l) => (l.code_barre ?? '').trim() === propre);
      if (!trouvee) {
        Alert.alert(
          'Code-barres inconnu',
          `Aucun produit suivi en stock ne porte le code ${propre}. Verifiez qu'il est bien enregistre dans le catalogue.`,
        );
        return false;
      }
      setScanner(false);
      setRecherche('');
      setFiltre('tous');
      setCible(trouvee.id);
      return true;
    },
    [fiche],
  );

  const demanderValidation = useCallback(() => {
    if (!fiche || travail) return;

    if (bilan.invalides > 0) {
      Alert.alert(
        'Saisie a corriger',
        `${bilan.invalides} produit(s) ont une quantite illisible ou negative. Corrigez-les avant de valider.`,
      );
      setFiltre('tous');
      setCible(null);
      return;
    }

    if (bilan.comptes === 0) {
      Alert.alert(
        'Rien a valider',
        "Aucun produit n'a encore ete compte. Saisissez au moins une quantite reelle.",
      );
      return;
    }

    const details = [
      `${bilan.comptes} produit(s) compte(s) sur ${bilan.total}.`,
      bilan.restants > 0
        ? `${bilan.restants} produit(s) non compte(s) : leur stock ne sera pas touche.`
        : null,
      bilan.ecarts === 0
        ? 'Aucun ecart : les stocks comptes sont conformes.'
        : `${bilan.ecarts} ecart(s), soit ${formaterEcartFrancs(bilan.valeur)} au prix d'achat.`,
      bilan.ecarts > 0 ? 'Les stocks concernes seront corriges. Cette action est definitive.' : null,
    ]
      .filter((ligne): ligne is string => ligne !== null)
      .join('\n\n');

    Alert.alert('Valider cet inventaire ?', details, [
      { text: 'Continuer le comptage', style: 'cancel' },
      {
        text: 'Valider',
        style: 'destructive',
        onPress: () => {
          setTravail(true);
          const comptages: Comptage[] = analyses.map((a) => ({
            ligneId: a.ligne.id,
            produitId: a.ligne.produit_id,
            nom: a.ligne.nom,
            uniteBase: a.ligne.unite_base,
            stockTheorique: a.ligne.stock_theorique,
            prixAchat: a.ligne.prix_achat,
            stockPhysique: a.physique,
          }));
          validerInventaire(fiche.entete.id, comptages, session.utilisateur?.nom ?? null)
            .then((resultat) => {
              Alert.alert(
                'Inventaire valide',
                resultat.nbEcarts === 0
                  ? `${fiche.entete.numero} : ${resultat.nbComptes} produit(s) comptes, stock conforme.`
                  : `${fiche.entete.numero} : ${resultat.nbEcarts} stock(s) corriges, ${formaterEcartFrancs(resultat.valeurEcarts)}.`,
              );
              void charger();
            })
            .catch((erreur: unknown) => {
              Alert.alert('Validation impossible', messageErreur(erreur));
            })
            .finally(() => setTravail(false));
        },
      },
    ]);
  }, [analyses, bilan, charger, fiche, session.utilisateur, travail]);

  const demanderAnnulation = useCallback(() => {
    if (!fiche || travail) return;
    Alert.alert(
      'Abandonner ce comptage ?',
      `${fiche.entete.numero} sera conserve en historique, mais aucun stock ne sera corrige.`,
      [
        { text: 'Continuer le comptage', style: 'cancel' },
        {
          text: 'Abandonner',
          style: 'destructive',
          onPress: () => {
            setTravail(true);
            annulerInventaire(fiche.entete.id, session.utilisateur?.nom ?? null)
              .then(() => router.back())
              .catch((erreur: unknown) => Alert.alert('Erreur', messageErreur(erreur)))
              .finally(() => setTravail(false));
          },
        },
      ],
    );
  }, [fiche, router, session.utilisateur, travail]);

  // --- rendus d'etat --------------------------------------------------------

  if (etat.phase === 'chargement') {
    return (
      <View style={s.plein}>
        <Entete titre="Inventaire" onRetour={() => router.back()} />
        <View style={sl.centre}>
          <ActivityIndicator color={C.accent} />
          <Text style={sl.centreTexte}>Chargement du comptage...</Text>
        </View>
      </View>
    );
  }

  if (etat.phase === 'absent') {
    return (
      <View style={s.plein}>
        <Entete titre="Inventaire" onRetour={() => router.back()} />
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>Inventaire introuvable</Text>
          <Text style={sl.centreTexte}>
            Il a peut-etre ete supprime depuis une autre fenetre.
          </Text>
          <Pressable style={s.boutonSecondaire} onPress={() => router.back()}>
            <Text style={s.boutonSecondaireTexte}>Retour a la liste</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (etat.phase === 'erreur') {
    return (
      <View style={s.plein}>
        <Entete titre="Inventaire" onRetour={() => router.back()} />
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>Le comptage n&apos;a pas pu etre lu</Text>
          <Text style={sl.centreTexte}>{etat.message}</Text>
          <Pressable style={s.boutonSecondaire} onPress={() => void charger()}>
            <Text style={s.boutonSecondaireTexte}>Reessayer</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const entete = etat.fiche.entete;

  return (
    <View style={s.plein}>
      <Entete
        titre={entete.numero}
        sousTitre={
          statut === 'VALIDE'
            ? `Valide le ${formaterDate(entete.date_validation)}`
            : `Ouvert le ${formaterDate(entete.date_creation)}`
        }
        badge={libelleStatut(statut)}
        couleurBadge={couleurStatut(statut)}
        onRetour={() => router.back()}
      />

      {avertissement ? (
        <Pressable style={sl.banniere} onPress={() => setAvertissement(null)}>
          <Text style={s.banniereErreurTexte}>{avertissement}</Text>
          <Text style={sl.banniereFermer}>Toucher pour masquer</Text>
        </Pressable>
      ) : null}

      {statut === 'ANNULE' ? (
        <View style={sl.bandeauInfo}>
          <Text style={sl.bandeauInfoTexte}>
            Comptage abandonne{entete.motif ? ` - ${entete.motif}` : ''}. Aucun stock n&apos;a ete
            corrige.
          </Text>
        </View>
      ) : null}

      {modifiable ? (
        <View style={sl.outils}>
          <View style={sl.ligneOutils}>
            <View style={[s.zoneSaisie, sl.rechercheZone]}>
              <TextInput
                style={s.saisie}
                value={recherche}
                onChangeText={(texte) => {
                  setRecherche(texte);
                  setCible(null);
                }}
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
            <Pressable
              style={s.boutonScanner}
              onPress={() => setScanner(true)}
              accessibilityRole="button">
              <Text style={s.boutonScannerTexte}>Scanner</Text>
            </Pressable>
          </View>

          {cible !== null ? (
            <View style={sl.bandeauCible}>
              <Text style={sl.bandeauCibleTexte}>Produit scanne</Text>
              <Pressable onPress={() => setCible(null)} hitSlop={8}>
                <Text style={sl.bandeauCibleAction}>Voir tous les produits</Text>
              </Pressable>
            </View>
          ) : (
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
          )}
        </View>
      ) : null}

      <FlatList
        data={filtrees}
        keyExtractor={(a) => String(a.ligne.id)}
        extraData={saisies}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={filtrees.length === 0 ? sl.listeVide : sl.liste}
        ListEmptyComponent={
          <View style={sl.centre}>
            <Text style={sl.centreTitre}>
              {analyses.length === 0 ? 'Aucun produit a compter' : 'Aucun resultat'}
            </Text>
            <Text style={sl.centreTexte}>
              {analyses.length === 0
                ? "Cet inventaire ne porte sur aucun produit. Il a sans doute ete ouvert alors que le catalogue etait vide."
                : 'Aucun produit ne correspond a cette recherche.'}
            </Text>
            {analyses.length > 0 ? (
              <Pressable
                style={s.boutonSecondaire}
                onPress={() => {
                  setRecherche('');
                  setFiltre('tous');
                  setCible(null);
                }}>
                <Text style={s.boutonSecondaireTexte}>Effacer les filtres</Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <LigneInventaire
            analyse={item}
            modifiable={modifiable}
            autoFocus={cible === item.ligne.id}
            onChanger={changer}
            onCommiter={commiter}
            onConforme={marquerConforme}
            onEffacer={effacerLigne}
          />
        )}
      />

      <View style={sl.pied}>
        <View style={sl.bilan}>
          <BlocBilan
            titre="Comptes"
            valeur={`${bilan.comptes} / ${bilan.total}`}
            couleur={bilan.restants > 0 ? C.orange : C.vert}
          />
          <BlocBilan
            titre="Ecarts"
            valeur={String(bilan.ecarts)}
            couleur={bilan.ecarts > 0 ? C.orange : C.vert}
          />
          <BlocBilan
            titre="Valeur"
            valeur={formaterEcartFrancs(bilan.valeur)}
            couleur={bilan.valeur < 0 ? C.rouge : bilan.valeur > 0 ? C.orange : C.texte}
          />
        </View>

        {bilan.invalides > 0 ? (
          <Text style={sl.piedAlerte}>
            {bilan.invalides} saisie(s) illisible(s) ou negative(s) a corriger.
          </Text>
        ) : bilan.sansPrix > 0 ? (
          <Text style={sl.piedNote}>
            {bilan.sansPrix} produit(s) en ecart n&apos;ont pas de prix d&apos;achat : leur perte
            n&apos;est pas chiffree.
          </Text>
        ) : modifiable && bilan.restants > 0 ? (
          <Text style={sl.piedNote}>
            Les produits non comptes gardent leur stock. Vous pouvez reprendre plus tard.
          </Text>
        ) : null}

        {modifiable ? (
          <View style={s.actionsBas}>
            <Pressable
              style={[s.boutonFantomeSombre, travail ? s.boutonDesactive : null]}
              disabled={travail}
              onPress={demanderAnnulation}
              accessibilityRole="button">
              <Text style={s.boutonFantomeSombreTexte}>Abandonner</Text>
            </Pressable>
            <Pressable
              style={[s.boutonPrincipal, travail ? s.boutonDesactive : null]}
              disabled={travail}
              onPress={demanderValidation}
              accessibilityRole="button">
              <Text style={s.boutonPrincipalTexte}>
                {travail ? 'Enregistrement...' : "Valider l'inventaire"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={s.boutonSecondaire} onPress={() => router.back()}>
            <Text style={s.boutonSecondaireTexte}>Retour a la liste</Text>
          </Pressable>
        )}
      </View>

      <ModaleScanner
        visible={scanner}
        onFermer={() => setScanner(false)}
        onCode={surCodeBarre}
      />
    </View>
  );
}

// --------------------------------------------------------------------------
// Entete
// --------------------------------------------------------------------------

function Entete(p: {
  titre: string;
  sousTitre?: string;
  badge?: string;
  couleurBadge?: string;
  onRetour: () => void;
}) {
  return (
    <>
      <BandeauEtat />
      <View style={s.entete}>
      <Pressable onPress={p.onRetour} style={s.retour} hitSlop={8}>
        <Icone nom="retour" taille={17} couleur={couleurs.primaire} />
        <Text style={s.retourTexte}>Retour</Text>
      </Pressable>
      <View style={sl.enteteTextes}>
        <Text style={s.titre} numberOfLines={1}>
          {p.titre}
        </Text>
        {p.sousTitre ? <Text style={sl.enteteSousTitre}>{p.sousTitre}</Text> : null}
      </View>
      {p.badge && p.couleurBadge ? (
        <View style={[sl.badge, { borderColor: p.couleurBadge }]}>
          <Text style={[sl.badgeTexte, { color: p.couleurBadge }]}>{p.badge}</Text>
        </View>
      ) : null}
      </View>
    </>
  );
}

// --------------------------------------------------------------------------
// Ligne de comptage
// --------------------------------------------------------------------------

function LigneInventaire(p: {
  analyse: AnalyseLigne;
  modifiable: boolean;
  autoFocus: boolean;
  onChanger: (ligneId: number, texte: string) => void;
  onCommiter: (ligneId: number) => void;
  onConforme: (ligne: LigneComptage) => void;
  onEffacer: (ligne: LigneComptage) => void;
}) {
  const { analyse, modifiable } = p;
  const ligne = analyse.ligne;
  const theorique = `${formaterQuantite(ligne.stock_theorique)} ${ligne.unite_base}`;

  // Un inventaire fige garde ce qui a ete constate, pas ce qui est saisissable.
  const ecart = modifiable ? analyse.ecart : ligne.ecart;
  const valeurEcart = modifiable ? analyse.valeurEcart : ligne.valeur_ecart;
  const compte = modifiable ? analyse.physique !== null : ligne.stock_physique !== null;

  let couleurEcart: string = C.texteFaible;
  let libelleEcart = 'Pas encore compte';
  if (analyse.invalide) {
    couleurEcart = C.rouge;
    libelleEcart = 'Quantite illisible';
  } else if (compte && ecart !== null) {
    if (Math.abs(ecart) <= SEUIL_ECART) {
      couleurEcart = C.vert;
      libelleEcart = 'Conforme';
    } else if (ecart < 0) {
      couleurEcart = C.rouge;
      libelleEcart = `Manque ${formaterQuantite(Math.abs(ecart))} ${ligne.unite_base}`;
    } else {
      couleurEcart = C.orange;
      libelleEcart = `Excedent ${formaterQuantite(ecart)} ${ligne.unite_base}`;
    }
  }

  return (
    <View style={[sl.carte, analyse.invalide ? sl.carteEnErreur : null]}>
      <Text style={sl.nom} numberOfLines={2}>
        {ligne.nom}
      </Text>
      <Text style={sl.meta} numberOfLines={1}>
        {(ligne.categorie ?? '').trim() === '' ? 'Sans categorie' : ligne.categorie}
        {ligne.code_barre ? ` - ${ligne.code_barre}` : ''}
      </Text>

      <View style={sl.ligneChiffres}>
        <View style={sl.blocTheorique}>
          <Text style={sl.blocTitre}>En caisse</Text>
          <Text style={sl.blocValeur}>{theorique}</Text>
        </View>

        <View style={sl.blocSaisie}>
          <Text style={sl.blocTitre}>Compte</Text>
          {modifiable ? (
            <TextInput
              style={[sl.saisieGrande, analyse.invalide ? sl.saisieGrandeErreur : null]}
              value={analyse.texte}
              onChangeText={(texte) => p.onChanger(ligne.id, texte)}
              // Les deux evenements, parce qu'aucun ne suffit sous Android :
              // fermer le clavier par le bouton retour n'enleve pas toujours
              // le focus, et toucher une autre ligne ne declenche pas toujours
              // la fin d'edition. L'ecriture est idempotente, la faire deux
              // fois ne coute rien - perdre un comptage, si.
              onEndEditing={() => p.onCommiter(ligne.id)}
              onBlur={() => p.onCommiter(ligne.id)}
              placeholder="-"
              placeholderTextColor={C.texteFaible}
              keyboardType="decimal-pad"
              returnKeyType="done"
              autoFocus={p.autoFocus}
              selectTextOnFocus
              accessibilityLabel={`Quantite comptee pour ${ligne.nom}`}
            />
          ) : (
            <Text style={sl.saisieFigee}>
              {ligne.stock_physique === null ? '-' : formaterQuantite(ligne.stock_physique)}
            </Text>
          )}
        </View>
      </View>

      <View style={sl.ligneEcart}>
        <View style={sl.ecartTextes}>
          <Text style={[sl.ecartLibelle, { color: couleurEcart }]}>{libelleEcart}</Text>
          {compte && ecart !== null && Math.abs(ecart) > SEUIL_ECART ? (
            <Text style={sl.ecartDetail}>
              {formaterEcartQuantite(ecart)} {ligne.unite_base}
              {valeurEcart !== null && ligne.prix_achat > 0
                ? ` - ${formaterEcartFrancs(valeurEcart)}`
                : ' - non chiffre'}
            </Text>
          ) : null}
        </View>

        {modifiable ? (
          <View style={sl.actionsLigne}>
            <Pressable
              style={sl.actionLigne}
              onPress={() => p.onConforme(ligne)}
              hitSlop={6}
              accessibilityRole="button">
              <Text style={sl.actionLigneTexte}>Conforme</Text>
            </Pressable>
            {analyse.texte !== '' ? (
              <Pressable
                style={sl.actionLigne}
                onPress={() => p.onEffacer(ligne)}
                hitSlop={6}
                accessibilityRole="button">
                <Text style={[sl.actionLigneTexte, { color: C.texteFaible }]}>Effacer</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function BlocBilan(p: { titre: string; valeur: string; couleur: string }) {
  return (
    <View style={sl.blocBilan}>
      <Text style={sl.blocTitre}>{p.titre}</Text>
      <Text style={[sl.blocBilanValeur, { color: p.couleur }]} numberOfLines={1}>
        {p.valeur}
      </Text>
    </View>
  );
}

// --------------------------------------------------------------------------
// Scanner
// --------------------------------------------------------------------------

/**
 * Camera de lecture des codes-barres.
 *
 * `onCode` rend true quand le produit a ete reconnu : la modale se ferme
 * alors. Sinon elle reste ouverte pour le produit suivant, en memorisant le
 * code refuse - sans cela, la camera relit le meme code dix fois par seconde
 * et empile dix fois la meme alerte.
 */
function ModaleScanner(p: {
  visible: boolean;
  onFermer: () => void;
  onCode: (code: string) => boolean;
}) {
  const [permission, demanderPermission] = useCameraPermissions();
  const verrou = useRef(false);
  const refuse = useRef<string | null>(null);

  useEffect(() => {
    if (p.visible) {
      verrou.current = false;
      refuse.current = null;
    }
  }, [p.visible]);

  const surLecture = useCallback(
    (resultat: BarcodeScanningResult) => {
      if (verrou.current) return;
      if (refuse.current === resultat.data) return;
      verrou.current = true;
      const reconnu = p.onCode(resultat.data);
      if (reconnu) return;
      refuse.current = resultat.data;
      verrou.current = false;
    },
    [p],
  );

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
              L&apos;application a besoin de la camera pour lire les codes-barres pendant le
              comptage.
            </Text>
            <Pressable style={s.boutonClair} onPress={() => void demanderPermission()}>
              <Text style={s.boutonClairTexte}>Autoriser la camera</Text>
            </Pressable>
            <Pressable style={s.boutonFantome} onPress={p.onFermer}>
              <Text style={s.boutonFantomeTexte}>Chercher a la main</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView
            style={s.cameraVue}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...TYPES_CODE_BARRE] }}
            onBarcodeScanned={surLecture}>
            <View style={s.cameraBarre}>
              <Text style={s.cameraTexte}>
                Presentez le code-barres du produit a compter
              </Text>
            </View>
            <View style={s.cameraActions}>
              <Pressable style={s.boutonFantome} onPress={p.onFermer}>
                <Text style={s.boutonFantomeTexte}>Fermer</Text>
              </Pressable>
            </View>
          </CameraView>
        )}
      </View>
    </Modal>
  );
}

// --------------------------------------------------------------------------
// Styles
// --------------------------------------------------------------------------

const sl = StyleSheet.create({
  enteteTextes: { flex: 1, gap: 2 },
  enteteSousTitre: { fontSize: 12, color: C.texteFaible },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  badgeTexte: { fontSize: 11, fontWeight: '700' },

  banniere: {
    margin: 12,
    marginBottom: 0,
    backgroundColor: couleurs.dangerDouce,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: couleurs.dangerBordure,
    gap: 4,
  },
  banniereFermer: { fontSize: 11, color: couleurs.dangerFonce },

  bandeauInfo: {
    margin: 12,
    marginBottom: 0,
    backgroundColor: couleurs.surfaceDouce,
    borderRadius: 8,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
  },
  bandeauInfoTexte: { fontSize: 13, color: C.texteFaible, lineHeight: 18 },

  outils: {
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: C.carte,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.bordure,
  },
  ligneOutils: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  rechercheZone: { flex: 1 },
  effacer: { fontSize: 12, color: C.accent, fontWeight: '600' },
  filtres: { gap: 8, paddingRight: 12, alignItems: 'center' },

  bandeauCible: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: couleurs.primaireDouce,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bandeauCibleTexte: { fontSize: 13, fontWeight: '700', color: C.accent },
  bandeauCibleAction: { fontSize: 13, color: C.accent, fontWeight: '600' },

  liste: { padding: 12, gap: 8 },
  listeVide: { flexGrow: 1, padding: 12 },

  carte: {
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    padding: 12,
    gap: 6,
  },
  carteEnErreur: { borderColor: C.rouge, borderWidth: 1 },
  nom: { fontSize: 15, fontWeight: '700', color: C.texte },
  meta: { fontSize: 12, color: C.texteFaible },

  ligneChiffres: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 2 },
  blocTheorique: { flex: 1, gap: 3 },
  blocSaisie: { gap: 3, alignItems: 'flex-end' },
  blocTitre: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: C.texteFaible,
  },
  blocValeur: { fontSize: 17, fontWeight: '600', color: C.texte },

  saisieGrande: {
    minWidth: 128,
    minHeight: 56,
    borderWidth: 1,
    borderColor: C.bordure,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 24,
    fontWeight: '700',
    color: C.texte,
    textAlign: 'center',
  },
  saisieGrandeErreur: { borderColor: C.rouge, borderWidth: 2 },
  saisieFigee: {
    minWidth: 128,
    fontSize: 22,
    fontWeight: '700',
    color: C.texte,
    textAlign: 'center',
  },

  ligneEcart: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
  },
  ecartTextes: { flexShrink: 1, gap: 2 },
  ecartLibelle: { fontSize: 13, fontWeight: '700' },
  ecartDetail: { fontSize: 12, color: C.texteFaible },
  actionsLigne: { flexDirection: 'row', gap: 6 },
  actionLigne: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.bordure,
    backgroundColor: '#FFFFFF',
  },
  actionLigneTexte: { fontSize: 12, fontWeight: '600', color: C.accent },

  pied: {
    gap: 10,
    padding: 12,
    backgroundColor: C.carte,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.bordure,
  },
  bilan: { flexDirection: 'row', gap: 8 },
  blocBilan: {
    flex: 1,
    backgroundColor: C.fond,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  blocBilanValeur: { fontSize: 16, fontWeight: '700' },
  piedNote: { fontSize: 12, color: C.texteFaible, lineHeight: 17 },
  piedAlerte: { fontSize: 12, color: C.rouge, fontWeight: '600', lineHeight: 17 },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centreTitre: { fontSize: 16, fontWeight: '700', color: C.texte, textAlign: 'center' },
  centreTexte: { fontSize: 13, color: C.texteFaible, textAlign: 'center', lineHeight: 19 },
});
