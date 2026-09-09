/**
 * Fiche d'un produit : ce qu'on voit AVANT de decider quoi que ce soit.
 *
 * POURQUOI CET ECRAN EXISTE
 * -------------------------
 * Toucher un produit dans une liste ouvrait directement le formulaire de
 * modification. Le commercant qui voulait simplement verifier un prix se
 * retrouvait donc dans un ecran de saisie, avec le risque de modifier par
 * megarde ce qu'il venait seulement consulter. Consulter et modifier sont deux
 * intentions differentes : cet ecran porte la premiere, et mene explicitement a
 * la seconde.
 *
 * POURQUOI LE STOCK N'EST PAS MODIFIABLE ICI
 * ------------------------------------------
 * Le stock ne se corrige que par un mouvement d'entree, de sortie ou par un
 * inventaire. Le reecrire directement laisserait un ecart invisible dans le
 * journal, et un ecart invisible est un ecart qu'on ne retrouve jamais.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { obtenirBase } from '../../src/db/database';
import { seuilAlerteStock } from '../../src/domain/stock';
import { BandeauEtat } from '../../src/ui/components';
import { C, formaterFrancs, formaterQuantite, s, uriImage } from './nouveau';
import { desactiverProduit, supprimerProduit } from './modifier/[id]';
import { Icone, IconePastille } from '../../src/ui/icones';
import type { NomIcone } from '../../src/ui/icones';
import { couleurs } from '../../src/ui/theme';

// --------------------------------------------------------------------------
// Acces aux donnees
// --------------------------------------------------------------------------

interface LigneFiche {
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

interface Fiche {
  produit: LigneFiche;
  sousUnites: LigneSousUnite[];
  nbLignesVente: number;
  nbLignesInventaire: number;
  quantiteVendue: number;
}

async function chargerFiche(identifiant: number): Promise<Fiche | null> {
  const db = await obtenirBase();

  const produit = await db.getFirstAsync<LigneFiche>(
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

  // Les memes comptages que le formulaire : ils decident si la suppression est
  // possible, car ligne_vente et ligne_inventaire referencent le produit sans
  // cascade.
  const ventes = await db.getFirstAsync<{ n: number; q: number | null }>(
    'SELECT COUNT(*) AS n, SUM(quantite_base) AS q FROM ligne_vente WHERE produit_id = ?',
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
    quantiteVendue: ventes?.q ?? 0,
  };
}

// --------------------------------------------------------------------------
// Ecran
// --------------------------------------------------------------------------

type Etat =
  | { phase: 'chargement' }
  | { phase: 'absent' }
  | { phase: 'pret'; fiche: Fiche };

export default function FicheProduitEcran() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const identifiant = Number(id);
  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' });

  // useFocusEffect et non useEffect : en revenant du formulaire de
  // modification ou d'un mouvement de stock, la fiche doit montrer les
  // nouvelles valeurs, pas celles d'avant.
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      (async () => {
        if (!Number.isFinite(identifiant)) {
          if (vivant) setEtat({ phase: 'absent' });
          return;
        }
        const fiche = await chargerFiche(identifiant);
        if (!vivant) return;
        setEtat(fiche ? { phase: 'pret', fiche } : { phase: 'absent' });
      })();
      return () => {
        vivant = false;
      };
    }, [identifiant]),
  );

  const demanderSuppression = useCallback(
    (fiche: Fiche) => {
      const lie = fiche.nbLignesVente > 0 || fiche.nbLignesInventaire > 0;

      if (lie) {
        Alert.alert(
          'Ce produit a un historique',
          `Il apparait dans ${fiche.nbLignesVente} ligne(s) de vente et ` +
            `${fiche.nbLignesInventaire} ligne(s) d'inventaire. Le supprimer effacerait ces ` +
            'historiques. Vous pouvez le desactiver : il disparait de la caisse et les ventes ' +
            'passees restent justes.',
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Desactiver',
              onPress: () =>
                void desactiverProduit(fiche.produit.id)
                  .then(() => router.back())
                  .catch((e: unknown) =>
                    Alert.alert('Echec', e instanceof Error ? e.message : String(e)),
                  ),
            },
          ],
        );
        return;
      }

      Alert.alert(
        'Supprimer ce produit',
        `"${fiche.produit.nom}" sera efface definitivement.`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: () =>
              void supprimerProduit(fiche.produit.id)
                .then(() => router.back())
                .catch((e: unknown) =>
                  Alert.alert('Echec', e instanceof Error ? e.message : String(e)),
                ),
          },
        ],
      );
    },
    [router],
  );

  if (etat.phase === 'chargement') {
    return (
      <View style={s.plein}>
        <BandeauEtat />
        <View style={s.entete}>
          <Pressable onPress={() => router.back()} style={s.retour} hitSlop={8}>
            <Icone nom="retour" taille={17} couleur={couleurs.primaire} />
            <Text style={s.retourTexte}>Retour</Text>
          </Pressable>
          <Text style={s.titre}>Fiche produit</Text>
        </View>
        <View style={sl.centre}>
          <ActivityIndicator color={C.accent} />
        </View>
      </View>
    );
  }

  if (etat.phase === 'absent') {
    return (
      <View style={s.plein}>
        <BandeauEtat />
        <View style={s.entete}>
          <Pressable onPress={() => router.back()} style={s.retour} hitSlop={8}>
            <Icone nom="retour" taille={17} couleur={couleurs.primaire} />
            <Text style={s.retourTexte}>Retour</Text>
          </Pressable>
          <Text style={s.titre}>Fiche produit</Text>
        </View>
        <View style={sl.centre}>
          <Text style={sl.centreTexte}>Ce produit n&apos;existe plus.</Text>
        </View>
      </View>
    );
  }

  const { fiche } = etat;
  const p = fiche.produit;
  const image = uriImage(p.chemin_image);
  const marge = p.prix_unitaire - p.prix_achat;
  const seuilStock = seuilAlerteStock(p.stock_min);
  const enRupture = p.gestion_stock === 1 && p.quantite_base <= 0;
  const sousLeSeuil =
    p.gestion_stock === 1 && p.quantite_base > 0 && p.quantite_base <= seuilStock;

  const couleurStock = enRupture ? C.rouge : sousLeSeuil ? C.orange : C.vert;
  const mentionStock = enRupture ? 'Rupture' : sousLeSeuil ? 'Stock faible' : 'En stock';

  return (
    <View style={s.plein}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} style={s.retour} hitSlop={8}>
          <Icone nom="retour" taille={17} couleur={couleurs.primaire} />
          <Text style={s.retourTexte}>Retour</Text>
        </Pressable>
        <Text style={s.titre} numberOfLines={1}>
          Detail de l&apos;article
        </Text>
      </View>

      <ScrollView contentContainerStyle={sl.contenu}>
        {/* --- identite ---------------------------------------------------- */}
        <View style={sl.carte}>
          <View style={sl.identite}>
            {image ? (
              <Image source={{ uri: image }} style={sl.photo} resizeMode="cover" />
            ) : (
              <View style={[sl.photo, sl.photoVide]}>
                <Text style={sl.photoVideTexte}>Pas de{'\n'}photo</Text>
              </View>
            )}
            <View style={sl.identiteTextes}>
              <Text style={sl.nom}>{p.nom}</Text>
              <Text style={sl.categorie}>{p.categorie || 'Sans categorie'}</Text>
              <Text style={sl.prix}>{formaterFrancs(p.prix_unitaire)}</Text>
              {p.actif === 0 ? (
                <View style={sl.etiquetteInactif}>
                  <Text style={sl.etiquetteInactifTexte}>INACTIF</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* --- informations ------------------------------------------------ */}
        <View style={sl.carte}>
          <Text style={sl.carteTitre}>Informations</Text>

          {p.gestion_stock === 1 ? (
            <>
              <Ligne
                libelle="Stock actuel"
                valeur={`${formaterQuantite(p.quantite_base)} ${p.unite_base}`}
                couleur={couleurStock}
                mention={mentionStock}
              />
              <Ligne
                libelle="Stock minimum"
                valeur={`${formaterQuantite(seuilStock)} ${p.unite_base}`}
              />
            </>
          ) : (
            <Ligne libelle="Stock" valeur="Non suivi" />
          )}

          <Ligne libelle="Prix d'achat" valeur={formaterFrancs(p.prix_achat)} />
          <Ligne libelle="Prix de vente" valeur={formaterFrancs(p.prix_unitaire)} />
          <Ligne
            libelle="Marge par unite"
            valeur={formaterFrancs(marge)}
            couleur={marge > 0 ? C.vert : marge < 0 ? C.rouge : undefined}
          />
          <Ligne libelle="Unite de base" valeur={p.unite_base} />
          {p.code_barre ? <Ligne libelle="Code-barres" valeur={p.code_barre} /> : null}
          {p.gestion_stock === 1 ? (
            <Ligne
              libelle="Valeur au prix d'achat"
              valeur={formaterFrancs(p.quantite_base * p.prix_achat)}
            />
          ) : null}
          <Ligne
            libelle="Deja vendu"
            valeur={`${formaterQuantite(fiche.quantiteVendue)} ${p.unite_base}`}
            derniere
          />
        </View>

        {/* --- sous-unites -------------------------------------------------- */}
        {fiche.sousUnites.length > 0 ? (
          <View style={sl.carte}>
            <Text style={sl.carteTitre}>Autres conditionnements</Text>
            {fiche.sousUnites.map((su, i) => (
              <Ligne
                key={su.nom}
                libelle={`${su.nom} (${formaterQuantite(su.facteur)} ${p.unite_base})`}
                valeur={formaterFrancs(su.prix)}
                derniere={i === fiche.sousUnites.length - 1}
              />
            ))}
          </View>
        ) : null}

        {/* --- actions ------------------------------------------------------ */}
        <View style={sl.carte}>
          <Action
            libelle="Mouvements de stock"
            icone="mouvements"
            aide="Entrees, sorties et corrections"
            onPress={() =>
              router.push({
                pathname: '/stock/mouvements',
                params: { produit: String(p.id) },
              })
            }
          />
          <Action
            libelle="Ajuster le stock"
            icone="inventaire"
            aide="Enregistrer une entree ou une sortie"
            onPress={() =>
              router.push({
                pathname: '/stock/ajustement',
                params: { produit: String(p.id) },
              })
            }
          />
          <Action
            libelle="Modifier l'article"
            icone="crayon"
            aide="Nom, prix, unites, photo"
            onPress={() =>
              router.push({
                pathname: '/produit/modifier/[id]',
                params: { id: String(p.id) },
              })
            }
            derniere
          />
        </View>

        <Pressable style={sl.supprimer} onPress={() => demanderSuppression(fiche)}>
          <Icone nom="corbeille" taille={18} couleur={couleurs.danger} />
          <Text style={sl.supprimerTexte}>Supprimer ce produit</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// --------------------------------------------------------------------------
// Briques locales
// --------------------------------------------------------------------------

function Ligne(p: {
  libelle: string;
  valeur: string;
  couleur?: string;
  mention?: string;
  derniere?: boolean;
}) {
  return (
    <View style={[sl.ligne, p.derniere && sl.ligneDerniere]}>
      <Text style={sl.ligneLibelle}>{p.libelle}</Text>
      <View style={sl.ligneDroite}>
        {p.mention ? (
          <View style={[sl.mention, { borderColor: p.couleur ?? C.bordure }]}>
            <Text style={[sl.mentionTexte, { color: p.couleur ?? C.texteFaible }]}>
              {p.mention}
            </Text>
          </View>
        ) : null}
        <Text style={[sl.ligneValeur, p.couleur ? { color: p.couleur } : null]}>
          {p.valeur}
        </Text>
      </View>
    </View>
  );
}

function Action(p: {
  libelle: string;
  aide: string;
  icone: NomIcone;
  onPress: () => void;
  derniere?: boolean;
}) {
  return (
    <Pressable
      onPress={p.onPress}
      style={({ pressed }) => [
        sl.action,
        p.derniere && sl.ligneDerniere,
        pressed && sl.actionPressee,
      ]}
    >
      <IconePastille nom={p.icone} />
      <View style={sl.actionTextes}>
        <Text style={sl.actionLibelle}>{p.libelle}</Text>
        <Text style={sl.actionAide}>{p.aide}</Text>
      </View>
      <Icone nom="chevron" taille={16} couleur={couleurs.texteEteint} />
    </Pressable>
  );
}

const sl = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centreTexte: { color: C.texteFaible, fontSize: 14 },

  contenu: { padding: 12, paddingBottom: 32, gap: 12 },

  carte: {
    backgroundColor: C.carte,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.bordure,
    overflow: 'hidden',
  },
  carteTitre: {
    fontSize: 15,
    fontWeight: '700',
    color: C.texte,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },

  identite: { flexDirection: 'row', gap: 14, padding: 14, alignItems: 'center' },
  photo: { width: 92, height: 92, borderRadius: 10, backgroundColor: C.fond },
  photoVide: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.bordure,
  },
  photoVideTexte: { fontSize: 11, color: C.texteFaible, textAlign: 'center' },
  identiteTextes: { flex: 1, gap: 2 },
  nom: { fontSize: 19, fontWeight: '700', color: C.texte },
  categorie: { fontSize: 13, color: C.texteFaible },
  prix: { fontSize: 18, fontWeight: '700', color: C.accent, marginTop: 4 },
  etiquetteInactif: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: C.rouge,
  },
  etiquetteInactifTexte: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.bordure,
  },
  ligneDerniere: { borderBottomWidth: 0 },
  ligneLibelle: { fontSize: 14, color: C.texteFaible, flexShrink: 1 },
  ligneDroite: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ligneValeur: { fontSize: 15, fontWeight: '600', color: C.texte },
  mention: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  mentionTexte: { fontSize: 11, fontWeight: '700' },

  action: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    // Cible tactile large : on consulte souvent debout, une main occupee.
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.bordure,
  },
  actionPressee: { backgroundColor: C.fond },
  actionTextes: { flex: 1, gap: 2 },
  actionLibelle: { fontSize: 15, fontWeight: '600', color: C.texte },
  actionAide: { fontSize: 12, color: C.texteFaible },
  chevron: { fontSize: 26, color: C.texteFaible, marginLeft: 8 },

  supprimer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.rouge,
    backgroundColor: C.carte,
  },
  supprimerTexte: { color: C.rouge, fontWeight: '700', fontSize: 15 },
});
