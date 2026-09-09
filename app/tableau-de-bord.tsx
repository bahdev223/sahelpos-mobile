/**
 * Tableau de bord.
 *
 * Il repond a trois questions, dans cet ordre : combien j'ai encaisse, combien
 * j'ai gagne, et qu'est-ce qui va me manquer demain. Tout le reste est du
 * detail qui a sa place dans les autres ecrans.
 */
import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';

import {
  Carte,
  Chargement,
  Erreur,
  Montant,
  couleurs,
  espaces,
  formaterMontant,
  formaterQuantite,
  rayons,
} from '../src/ui/components';
import {
  meilleuresVentes,
  totauxPeriode,
  type ProduitVendu,
  type TotauxPeriode,
} from '../src/db/repositories/vente';
import { listerAlertesStock } from '../src/db/repositories/produit';
import { valeurStock, type ValeurStock } from '../src/db/repositories/stock';
import type { Produit } from '../src/domain/types';

function bornesJour(): { debut: string; fin: string } {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  return { debut: debut.toISOString(), fin: fin.toISOString() };
}

function bornesMois(): { debut: string; fin: string } {
  const debut = new Date();
  debut.setDate(1);
  debut.setHours(0, 0, 0, 0);
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  return { debut: debut.toISOString(), fin: fin.toISOString() };
}

export default function EcranTableauDeBord() {
  const router = useRouter();
  const [jour, setJour] = useState<TotauxPeriode | null>(null);
  const [mois, setMois] = useState<TotauxPeriode | null>(null);
  const [meilleurs, setMeilleurs] = useState<ProduitVendu[]>([]);
  const [alertes, setAlertes] = useState<Produit[]>([]);
  const [stock, setStock] = useState<ValeurStock | null>(null);
  const [chargement, setChargement] = useState(true);
  const [rafraichit, setRafraichit] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const j = bornesJour();
      const m = bornesMois();
      const [tJour, tMois, tops, alertesStock, valeur] = await Promise.all([
        totauxPeriode(j.debut, j.fin),
        totauxPeriode(m.debut, m.fin),
        meilleuresVentes(m.debut, m.fin, 5),
        listerAlertesStock(),
        valeurStock(),
      ]);
      setJour(tJour);
      setMois(tMois);
      setMeilleurs(tops);
      setAlertes(alertesStock);
      setStock(valeur);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture des chiffres impossible.');
    } finally {
      setChargement(false);
      setRafraichit(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setChargement(true);
      charger();
    }, [charger]),
  );

  if (chargement) return <Chargement message="Calcul des chiffres..." />;
  if (erreur) {
    return (
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: 'Tableau de bord' }} />
        <Erreur message={erreur} onReessayer={charger} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Tableau de bord' }} />
      <ScrollView
        contentContainerStyle={styles.contenu}
        refreshControl={
          <RefreshControl
            refreshing={rafraichit}
            onRefresh={() => {
              setRafraichit(true);
              charger();
            }}
          />
        }
      >
        <View style={styles.grilleChiffres}>
          <MiniCarte
            libelle="CA aujourd'hui"
            valeur={formaterMontant(jour?.chiffreAffaires ?? 0)}
            detail={`${jour?.nbVentes ?? 0} vente${(jour?.nbVentes ?? 0) > 1 ? 's' : ''}`}
          />
          <MiniCarte
            libelle="Benefice"
            valeur={formaterMontant(jour?.benefice ?? 0)}
            couleur={couleurs.primaire}
            detail="aujourd'hui"
          />
          <MiniCarte
            libelle="Encaisse"
            valeur={formaterMontant(jour?.encaisse ?? 0)}
            detail="aujourd'hui"
          />
          <MiniCarte
            libelle="CA mois"
            valeur={formaterMontant(mois?.chiffreAffaires ?? 0)}
            detail={`${mois?.nbVentes ?? 0} vente${(mois?.nbVentes ?? 0) > 1 ? 's' : ''}`}
          />
          <MiniCarte
            libelle="Benefice mois"
            valeur={formaterMontant(mois?.benefice ?? 0)}
            couleur={couleurs.primaire}
            detail="depuis le 1er"
          />
          <MiniCarte
            libelle="Stock a surveiller"
            valeur={String(alertes.length)}
            couleur={alertes.length > 0 ? couleurs.danger : couleurs.primaire}
            detail={alertes.length > 0 ? 'a reapprovisionner' : 'stock calme'}
          />
        </View>

        {/* Ce qui est du a la boutique : un credit oublie est de l'argent
            perdu, il doit rester sous les yeux. */}
        {(mois?.resteDu ?? 0) > 0 ? (
          <Pressable onPress={() => router.push('/clients')}>
            <Carte>
              <Text style={styles.creanceLibelle}>Ardoises des clients</Text>
              <Montant valeur={mois?.resteDu ?? 0} taille="moyen" couleur={couleurs.danger} />
              <Text style={styles.lien}>Voir les clients</Text>
            </Carte>
          </Pressable>
        ) : null}

        <Pressable onPress={() => router.push('/stock/alertes')}>
          <Carte titre="Stock">
            <View style={styles.stockLigne}>
              <Text style={styles.stockLibelle}>Valeur en rayon (prix d'achat)</Text>
              <Text style={styles.stockValeur}>
                {formaterMontant(stock?.valeurAchat ?? 0)}
              </Text>
            </View>
            <View style={styles.stockLigne}>
              <Text style={styles.stockLibelle}>Produits suivis</Text>
              <Text style={styles.stockValeur}>{stock?.nbProduits ?? 0}</Text>
            </View>
            <View
              style={[
                styles.alerteBloc,
                alertes.length === 0 && styles.alerteBlocCalme,
              ]}
            >
              <Text
                style={[
                  styles.alerteTexte,
                  alertes.length === 0 && styles.alerteTexteCalme,
                ]}
              >
                {alertes.length === 0
                  ? 'Aucun produit sous le seuil minimum'
                  : `${alertes.length} produit${alertes.length > 1 ? 's' : ''} a reapprovisionner`}
              </Text>
            </View>
          </Carte>
        </Pressable>

        <Carte titre="Meilleures ventes du mois">
          {meilleurs.length === 0 ? (
            <Text style={styles.vide}>Aucune vente ce mois-ci.</Text>
          ) : (
            meilleurs.map((p, rang) => (
              <View key={p.produitId} style={styles.topLigne}>
                <Text style={styles.topRang}>{rang + 1}</Text>
                <View style={styles.topMilieu}>
                  <Text style={styles.topNom} numberOfLines={1}>
                    {p.libelle}
                  </Text>
                  <Text style={styles.topQuantite}>
                    {formaterQuantite(p.quantite)} vendu(s)
                  </Text>
                </View>
                <View style={styles.topDroite}>
                  <Text style={styles.topTotal}>{formaterMontant(p.total)}</Text>
                  <Text style={styles.topBenefice}>
                    +{formaterMontant(p.benefice)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Carte>
      </ScrollView>
    </SafeAreaView>
  );
}

function MiniCarte({
  libelle,
  valeur,
  detail,
  couleur,
}: {
  libelle: string;
  valeur: string;
  detail: string;
  couleur?: string;
}) {
  return (
    <Carte style={styles.miniCarte}>
      <Text style={styles.miniLibelle} numberOfLines={1}>
        {libelle}
      </Text>
      <Text
        style={[styles.miniValeur, couleur ? { color: couleur } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {valeur}
      </Text>
      <Text style={styles.miniDetail} numberOfLines={1}>
        {detail}
      </Text>
    </Carte>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.m, paddingBottom: espaces.xxl, gap: espaces.m },

  grilleChiffres: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaces.s,
  },
  miniCarte: {
    width: '31.5%',
    minWidth: 104,
    flexGrow: 1,
    padding: espaces.m,
  },
  miniLibelle: {
    fontSize: 10,
    fontWeight: '700',
    color: couleurs.texteFaible,
    textTransform: 'uppercase',
  },
  miniValeur: {
    fontSize: 17,
    fontWeight: '800',
    color: couleurs.texte,
    marginTop: 4,
  },
  miniDetail: { fontSize: 11, color: couleurs.texteFaible, marginTop: 2 },

  sousChiffres: {
    flexDirection: 'row',
    marginTop: espaces.m,
    paddingTop: espaces.m,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
  },
  bloc: { flex: 1 },
  blocLibelle: { fontSize: 11, color: couleurs.texteFaible },
  blocValeur: { fontSize: 15, fontWeight: '700', color: couleurs.texte, marginTop: 2 },

  moisLigne: { flexDirection: 'row', justifyContent: 'space-between' },
  moisDroite: { alignItems: 'flex-end' },
  moisLibelle: { fontSize: 12, color: couleurs.texteFaible, marginBottom: 2 },
  moisDetail: { fontSize: 12, color: couleurs.texteFaible, marginTop: espaces.s },

  creanceLibelle: { fontSize: 13, color: couleurs.texteFaible, marginBottom: 4 },
  lien: { fontSize: 13, color: couleurs.primaire, fontWeight: '600', marginTop: espaces.s },

  stockLigne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  stockLibelle: { fontSize: 13, color: couleurs.texteFaible },
  stockValeur: { fontSize: 14, fontWeight: '600', color: couleurs.texte },
  alerteBloc: {
    marginTop: espaces.m,
    padding: espaces.m,
    borderRadius: rayons.s,
    backgroundColor: couleurs.avertissementDouce,
  },
  alerteBlocCalme: { backgroundColor: couleurs.primaireDouce },
  alerteTexte: { fontSize: 13, fontWeight: '600', color: couleurs.avertissement },
  alerteTexteCalme: { color: couleurs.primaire },

  vide: { fontSize: 14, color: couleurs.texteFaible, paddingVertical: espaces.s },
  topLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: espaces.s,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  topRang: {
    width: 24,
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.texteFaible,
  },
  topMilieu: { flex: 1, marginRight: espaces.s },
  topNom: { fontSize: 14, color: couleurs.texte },
  topQuantite: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  topDroite: { alignItems: 'flex-end' },
  topTotal: { fontSize: 14, fontWeight: '600', color: couleurs.texte },
  topBenefice: { fontSize: 12, color: couleurs.primaire, marginTop: 2 },
});
