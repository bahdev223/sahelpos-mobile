/**
 * Fiche d'un produit existant : consultation et modification.
 *
 * Le formulaire vient de `produit/nouveau.tsx` : creation et modification
 * partagent le meme composant, donc les memes regles de validation et les
 * memes champs. C'est volontaire - sur le poste de bureau les deux ecrans
 * avaient diverge au point que le code-barres etait saisissable a la creation
 * et modifiable nulle part.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { obtenirBase } from '../../../src/db/database';
import { seuilAlerteStock } from '../../../src/domain/stock';
import {
  C,
  FormulaireProduit,
  formaterFrancs,
  formaterQuantite,
  nouvelleCle,
  s,
  type ProduitValide,
  type SaisieProduit,
} from '../nouveau';
import { BandeauEtat } from '../../../src/ui/components';
import { Icone } from '../../../src/ui/icones';
import { couleurs } from '../../../src/ui/theme';

// --------------------------------------------------------------------------
// Acces aux donnees
// --------------------------------------------------------------------------

interface LigneProduit {
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
}

interface LigneSousUnite {
  nom: string;
  facteur: number;
  prix: number;
}

interface FicheProduit {
  produit: LigneProduit;
  sousUnites: LigneSousUnite[];
  nbLignesVente: number;
  nbLignesInventaire: number;
}

async function chargerFiche(identifiant: number): Promise<FicheProduit | null> {
  const db = await obtenirBase();

  const produit = await db.getFirstAsync<LigneProduit>(
    `SELECT id, nom, categorie, code_barre, prix_unitaire, prix_achat, unite_base,
            quantite_base, stock_min, gestion_stock, chemin_image, actif
       FROM produit WHERE id = ?`,
    identifiant,
  );
  if (!produit) return null;

  const sousUnites = await db.getAllAsync<LigneSousUnite>(
    'SELECT nom, facteur, prix FROM sous_unite WHERE produit_id = ? ORDER BY facteur',
    identifiant,
  );

  // Sert a decider si la suppression est possible : ligne_vente et
  // ligne_inventaire referencent le produit SANS cascade, donc SQLite
  // refuserait la suppression avec une erreur incomprehensible pour le
  // commercant. Mieux vaut lui proposer la desactivation.
  const ventes = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM ligne_vente WHERE produit_id = ?',
    identifiant,
  );
  const inventaires = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM ligne_inventaire WHERE produit_id = ?',
    identifiant,
  );

  return {
    produit,
    sousUnites,
    nbLignesVente: ventes?.n ?? 0,
    nbLignesInventaire: inventaires?.n ?? 0,
  };
}

/**
 * Met a jour le produit et remplace ses sous-unites, en une transaction.
 *
 * Le remplacement complet est sur : le formulaire affiche TOUJOURS les
 * sous-unites existantes, ce qu'il renvoie est donc l'etat voulu en entier.
 */
async function mettreAJourProduit(identifiant: number, valide: ProduitValide): Promise<void> {
  const db = await obtenirBase();
  const maintenant = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE produit
          SET nom = ?, categorie = ?, code_barre = ?, prix_unitaire = ?, prix_achat = ?,
              unite_base = ?, stock_min = ?, gestion_stock = ?, chemin_image = ?,
              actif = ?, date_modification = ?
        WHERE id = ?`,
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
      identifiant,
    );

    await db.runAsync('DELETE FROM sous_unite WHERE produit_id = ?', identifiant);
    for (const su of valide.sousUnites) {
      await db.runAsync(
        'INSERT INTO sous_unite (produit_id, nom, facteur, prix) VALUES (?, ?, ?, ?)',
        identifiant,
        su.nom,
        su.facteur,
        su.prix,
      );
    }
  });
}

export async function desactiverProduit(identifiant: number): Promise<void> {
  const db = await obtenirBase();
  await db.runAsync(
    'UPDATE produit SET actif = 0, date_modification = ? WHERE id = ?',
    new Date().toISOString(),
    identifiant,
  );
}

/** Suppression definitive : emporte les sous-unites et tout l'historique de stock. */
export async function supprimerProduit(identifiant: number): Promise<void> {
  const db = await obtenirBase();
  await db.runAsync('DELETE FROM produit WHERE id = ?', identifiant);
}

// --------------------------------------------------------------------------
// Conversion base -> formulaire
// --------------------------------------------------------------------------

function versSaisie(fiche: FicheProduit): SaisieProduit {
  const p = fiche.produit;
  return {
    nom: p.nom,
    categorie: p.categorie ?? '',
    codeBarre: p.code_barre ?? '',
    prixAchat: String(Math.round(p.prix_achat)),
    prixUnitaire: String(Math.round(p.prix_unitaire)),
    uniteBase: p.unite_base,
    stockMin: formaterQuantite(p.stock_min),
    stockInitial: '',
    gestionStock: p.gestion_stock !== 0,
    actif: p.actif !== 0,
    cheminImage: p.chemin_image,
    sousUnites: fiche.sousUnites.map((su) => ({
      cle: nouvelleCle(),
      nom: su.nom,
      facteur: formaterQuantite(su.facteur),
      prix: String(Math.round(su.prix)),
    })),
  };
}

// --------------------------------------------------------------------------
// Ecran
// --------------------------------------------------------------------------

type Etat =
  | { phase: 'chargement' }
  | { phase: 'erreur'; message: string }
  | { phase: 'introuvable' }
  | { phase: 'pret'; fiche: FicheProduit; saisie: SaisieProduit };

export default function FicheProduitEcran() {
  const router = useRouter();
  const parametres = useLocalSearchParams<{ id?: string }>();
  const identifiant = Number(parametres.id);
  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' });

  const charger = useCallback(async () => {
    if (!Number.isInteger(identifiant) || identifiant <= 0) {
      setEtat({ phase: 'introuvable' });
      return;
    }
    setEtat({ phase: 'chargement' });
    try {
      const fiche = await chargerFiche(identifiant);
      if (!fiche) {
        setEtat({ phase: 'introuvable' });
        return;
      }
      setEtat({ phase: 'pret', fiche, saisie: versSaisie(fiche) });
    } catch (erreur) {
      setEtat({
        phase: 'erreur',
        message: erreur instanceof Error ? erreur.message : String(erreur),
      });
    }
  }, [identifiant]);

  // Rechargement a chaque retour sur l'ecran : le stock a pu bouger entre
  // temps (une vente, un inventaire) et afficher une valeur perimee sur une
  // fiche produit est trompeur.
  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger]),
  );

  const enregistrer = useCallback(
    async (valide: ProduitValide) => {
      await mettreAJourProduit(identifiant, valide);
      Alert.alert('Enregistre', `${valide.nom} a ete mis a jour.`);
      await charger();
    },
    [charger, identifiant],
  );

  const demanderSuppression = useCallback(
    (fiche: FicheProduit) => {
      const lie = fiche.nbLignesVente > 0 || fiche.nbLignesInventaire > 0;

      if (lie) {
        Alert.alert(
          'Suppression impossible',
          `${fiche.produit.nom} apparait dans ${fiche.nbLignesVente} ligne(s) de vente et ` +
            `${fiche.nbLignesInventaire} ligne(s) d'inventaire. Le supprimer effacerait ces ` +
            'historiques. Vous pouvez le desactiver : il disparait de la caisse et les ventes ' +
            'passees restent lisibles.',
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Desactiver',
              onPress: () => {
                void desactiverProduit(fiche.produit.id)
                  .then(charger)
                  .catch((erreur: unknown) =>
                    Alert.alert(
                      'Erreur',
                      erreur instanceof Error ? erreur.message : String(erreur),
                    ),
                  );
              },
            },
          ],
        );
        return;
      }

      Alert.alert(
        'Supprimer ce produit',
        `${fiche.produit.nom} et tout son historique de mouvements de stock seront effaces ` +
          'definitivement. Cette action est irreversible.',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: () => {
              void supprimerProduit(fiche.produit.id)
                .then(() => router.back())
                .catch((erreur: unknown) =>
                  Alert.alert('Erreur', erreur instanceof Error ? erreur.message : String(erreur)),
                );
            },
          },
        ],
      );
    },
    [charger, router],
  );

  return (
    <View style={s.plein}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} style={s.retour}>
          <Icone nom="retour" taille={17} couleur={couleurs.primaire} />
          <Text style={s.retourTexte}>Retour</Text>
        </Pressable>
        <Text style={s.titre} numberOfLines={1}>
          {etat.phase === 'pret' ? etat.fiche.produit.nom : 'Fiche produit'}
        </Text>
      </View>

      {etat.phase === 'chargement' ? (
        <View style={sl.centre}>
          <ActivityIndicator color={C.accent} />
          <Text style={sl.centreTexte}>Chargement de la fiche...</Text>
        </View>
      ) : etat.phase === 'introuvable' ? (
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>Produit introuvable</Text>
          <Text style={sl.centreTexte}>
            Il a peut-etre ete supprime depuis un autre ecran.
          </Text>
          <Pressable style={s.boutonSecondaire} onPress={() => router.back()}>
            <Text style={s.boutonSecondaireTexte}>Revenir au catalogue</Text>
          </Pressable>
        </View>
      ) : etat.phase === 'erreur' ? (
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>Lecture impossible</Text>
          <Text style={sl.centreTexte}>{etat.message}</Text>
          <Pressable style={s.boutonSecondaire} onPress={() => void charger()}>
            <Text style={s.boutonSecondaireTexte}>Reessayer</Text>
          </Pressable>
        </View>
      ) : (
        <FormulaireProduit
          // Remonter le formulaire apres un rechargement : sans cette cle, les
          // champs garderaient l'ancienne saisie interne apres enregistrement.
          key={`${etat.fiche.produit.id}-${etat.saisie.nom}-${etat.fiche.produit.quantite_base}`}
          saisieInitiale={etat.saisie}
          creation={false}
          libelleValider="Enregistrer"
          onValider={enregistrer}
          onAnnuler={() => router.back()}
          complement={
            <>
              <View style={s.carte}>
                <Text style={s.titreSection}>Etat actuel</Text>
                <Ligne
                  libelle="Stock"
                  valeur={
                    etat.fiche.produit.gestion_stock === 0
                      ? 'Non suivi'
                      : `${formaterQuantite(etat.fiche.produit.quantite_base)} ${etat.fiche.produit.unite_base}`
                  }
                  couleur={
                    etat.fiche.produit.gestion_stock === 0
                      ? C.texteFaible
                      : etat.fiche.produit.quantite_base <= 0
                        ? C.rouge
                        : etat.fiche.produit.quantite_base <=
                            seuilAlerteStock(etat.fiche.produit.stock_min)
                          ? C.orange
                          : C.vert
                  }
                />
                <Ligne
                  libelle="Valeur au prix d'achat"
                  valeur={formaterFrancs(
                    etat.fiche.produit.quantite_base * etat.fiche.produit.prix_achat,
                  )}
                />
                <Ligne
                  libelle="Marge par unite"
                  valeur={formaterFrancs(
                    etat.fiche.produit.prix_unitaire - etat.fiche.produit.prix_achat,
                  )}
                  couleur={
                    etat.fiche.produit.prix_unitaire - etat.fiche.produit.prix_achat < 0
                      ? C.rouge
                      : C.texte
                  }
                />
                <Ligne libelle="Vendu dans" valeur={`${etat.fiche.nbLignesVente} ligne(s)`} />
                <Text style={s.explication}>
                  Le stock se corrige par un mouvement d&apos;entree, de sortie ou par un
                  inventaire, jamais en reecrivant la quantite ici : sans mouvement, l&apos;ecart
                  serait invisible dans le journal.
                </Text>
              </View>

              <View style={s.carte}>
                <Text style={s.titreSection}>Zone dangereuse</Text>
                <Pressable
                  style={sl.boutonSupprimer}
                  onPress={() => demanderSuppression(etat.fiche)}>
                  <Text style={sl.boutonSupprimerTexte}>Supprimer ce produit</Text>
                </Pressable>
              </View>
            </>
          }
        />
      )}
    </View>
  );
}

function Ligne(p: { libelle: string; valeur: string; couleur?: string }) {
  return (
    <View style={sl.ligne}>
      <Text style={sl.ligneLibelle}>{p.libelle}</Text>
      <Text style={[sl.ligneValeur, p.couleur ? { color: p.couleur } : null]}>{p.valeur}</Text>
    </View>
  );
}

const sl = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centreTitre: { fontSize: 16, fontWeight: '700', color: C.texte },
  centreTexte: { fontSize: 13, color: C.texteFaible, textAlign: 'center' },

  ligne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  ligneLibelle: { fontSize: 13, color: C.texteFaible, flexShrink: 1 },
  ligneValeur: { fontSize: 14, fontWeight: '700', color: C.texte },

  boutonSupprimer: {
    borderWidth: 1,
    borderColor: C.rouge,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  boutonSupprimerTexte: { color: C.rouge, fontWeight: '700', fontSize: 14 },
});
