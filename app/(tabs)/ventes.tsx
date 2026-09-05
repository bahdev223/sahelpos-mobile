/**
 * Journal des ventes.
 *
 * L'ecran s'ouvre sur la JOURNEE EN COURS et non sur tout l'historique : la
 * question qu'un commercant se pose vingt fois par jour est "combien j'ai fait
 * aujourd'hui", pas "qu'ai-je vendu le mois dernier".
 */
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  Carte,
  Chargement,
  Erreur,
  ListeVide,
  Montant,
  couleurs,
  espaces,
  formaterMontant,
  rayons,
} from '../../src/ui/components';
import {
  listerVentes,
  totauxPeriode,
  type TotauxPeriode,
  type VenteResume,
} from '../../src/db/repositories/vente';
import type { StatutVente } from '../../src/domain/types';

type Periode = 'jour' | 'semaine' | 'mois';

const PERIODES: Array<{ cle: Periode; libelle: string }> = [
  { cle: 'jour', libelle: "Aujourd'hui" },
  { cle: 'semaine', libelle: '7 jours' },
  { cle: 'mois', libelle: '30 jours' },
];

/** Bornes ISO de la periode, du premier instant au dernier. */
function bornes(periode: Periode): { debut: string; fin: string } {
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  if (periode === 'semaine') debut.setDate(debut.getDate() - 6);
  if (periode === 'mois') debut.setDate(debut.getDate() - 29);
  return { debut: debut.toISOString(), fin: fin.toISOString() };
}

const LIBELLE_STATUT: Record<StatutVente, string> = {
  payee: 'Payee',
  partielle: 'Partielle',
  impayee: 'Impayee',
  annulee: 'Annulee',
};

const COULEUR_STATUT: Record<StatutVente, string> = {
  payee: couleurs.primaire,
  partielle: couleurs.avertissement,
  impayee: couleurs.danger,
  annulee: couleurs.texteFaible,
};

function heure(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)} ${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

export default function EcranVentes() {
  const router = useRouter();
  const [periode, setPeriode] = useState<Periode>('jour');
  const [ventes, setVentes] = useState<VenteResume[]>([]);
  const [totaux, setTotaux] = useState<TotauxPeriode | null>(null);
  const [chargement, setChargement] = useState(true);
  const [rafraichit, setRafraichit] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const { debut, fin } = bornes(periode);
      const [liste, t] = await Promise.all([
        listerVentes({ debut, fin, limite: 300 }),
        totauxPeriode(debut, fin),
      ]);
      setVentes(liste);
      setTotaux(t);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture des ventes impossible.');
    } finally {
      setChargement(false);
      setRafraichit(false);
    }
  }, [periode]);

  useFocusEffect(
    useCallback(() => {
      setChargement(true);
      charger();
    }, [charger]),
  );

  if (chargement) return <Chargement message="Lecture des ventes..." />;
  if (erreur) {
    return (
      <SafeAreaView style={styles.page} edges={['top']}>
        <Erreur message={erreur} onReessayer={charger} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <View style={styles.onglets}>
        {PERIODES.map((p) => {
          const actif = p.cle === periode;
          return (
            <Pressable
              key={p.cle}
              onPress={() => setPeriode(p.cle)}
              style={[styles.onglet, actif && styles.ongletActif]}
            >
              <Text style={[styles.ongletTexte, actif && styles.ongletTexteActif]}>
                {p.libelle}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {totaux ? (
        <Carte style={styles.resume}>
          <View style={styles.resumeHaut}>
            <View>
              <Text style={styles.resumeLibelle}>Chiffre d'affaires</Text>
              <Montant valeur={totaux.chiffreAffaires} taille="grand" />
            </View>
            <View style={styles.resumeDroite}>
              <Text style={styles.resumeLibelle}>
                {totaux.nbVentes} vente{totaux.nbVentes > 1 ? 's' : ''}
              </Text>
              <Text style={styles.benefice}>
                Benefice {formaterMontant(totaux.benefice)}
              </Text>
            </View>
          </View>

          {/* Le reste du n'apparait que s'il y en a : afficher "0 F" en
              permanence habituerait l'oeil a ignorer la ligne. */}
          {totaux.resteDu > 0 ? (
            <View style={styles.resteDu}>
              <Text style={styles.resteDuTexte}>
                Reste du par les clients : {formaterMontant(totaux.resteDu)}
              </Text>
            </View>
          ) : null}
        </Carte>
      ) : null}

      <FlatList
        data={ventes}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={ventes.length === 0 ? styles.videConteneur : styles.liste}
        refreshControl={
          <RefreshControl
            refreshing={rafraichit}
            onRefresh={() => {
              setRafraichit(true);
              charger();
            }}
          />
        }
        ListEmptyComponent={
          <ListeVide
            titre="Aucune vente"
            message={
              periode === 'jour'
                ? "Aucune vente enregistree aujourd'hui."
                : 'Aucune vente sur cette periode.'
            }
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/vente/${item.id}`)}
            style={({ pressed }) => [styles.ligne, pressed && styles.lignePressee]}
          >
            <View style={styles.ligneGauche}>
              <Text style={styles.numero}>{item.numero}</Text>
              <Text style={styles.details}>
                {heure(item.dateVente)}
                {item.clientNom ? `  ${item.clientNom}` : ''}
              </Text>
            </View>
            <View style={styles.ligneDroite}>
              <Montant valeur={item.total} taille="moyen" />
              <Text style={[styles.statut, { color: COULEUR_STATUT[item.statut] }]}>
                {LIBELLE_STATUT[item.statut]}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  onglets: {
    flexDirection: 'row',
    paddingHorizontal: espaces.l,
    paddingTop: espaces.s,
    gap: espaces.s,
  },
  onglet: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rayons.m,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  ongletActif: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  ongletTexte: { fontSize: 14, fontWeight: '600', color: couleurs.texteFaible },
  ongletTexteActif: { color: couleurs.texteInverse },

  resume: { margin: espaces.l, marginBottom: espaces.s },
  resumeHaut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  resumeDroite: { alignItems: 'flex-end' },
  resumeLibelle: { fontSize: 12, color: couleurs.texteFaible, marginBottom: 2 },
  benefice: { fontSize: 14, fontWeight: '600', color: couleurs.primaire, marginTop: 4 },
  resteDu: {
    marginTop: espaces.m,
    paddingTop: espaces.s,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
  },
  resteDuTexte: { fontSize: 13, color: couleurs.avertissement, fontWeight: '600' },

  liste: { paddingHorizontal: espaces.l, paddingBottom: espaces.xl },
  videConteneur: { flexGrow: 1, justifyContent: 'center' },
  ligne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.m,
    marginBottom: espaces.s,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  lignePressee: { opacity: 0.7 },
  ligneGauche: { flex: 1, marginRight: espaces.m },
  ligneDroite: { alignItems: 'flex-end' },
  numero: { fontSize: 15, fontWeight: '600', color: couleurs.texte },
  details: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  statut: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
