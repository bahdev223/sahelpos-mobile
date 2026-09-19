import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';

import {
  Bouton,
  Carte,
  Chargement,
  Erreur,
  ListeVide,
  Montant,
  couleurs,
  espaces,
  rayons,
} from '../src/ui/components';
import { listerVentes, type VenteResume } from '../src/db/repositories/vente';
import type { StatutVente } from '../src/domain/types';
import { ActionsDocument } from '../src/ui/ActionsDocument';
import { preparerDocumentVente } from '../src/services/document-vente';

const STATUTS: Record<StatutVente, string> = {
  payee: 'Payee',
  partielle: 'Partielle',
  impayee: 'Impayee',
  annulee: 'Annulee',
};

const COULEURS_STATUT: Record<StatutVente, string> = {
  payee: couleurs.primaire,
  partielle: couleurs.avertissement,
  impayee: couleurs.danger,
  annulee: couleurs.texteFaible,
};

function dateLisible(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} ${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

export default function EcranFactures() {
  const router = useRouter();
  const [ventes, setVentes] = useState<VenteResume[]>([]);
  const [chargement, setChargement] = useState(true);
  const [rafraichit, setRafraichit] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setVentes(await listerVentes({ limite: 200 }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture des factures impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  const rafraichir = useCallback(async () => {
    setRafraichit(true);
    try {
      await charger();
    } finally {
      setRafraichit(false);
    }
  }, [charger]);

  useFocusEffect(
    useCallback(() => {
      setChargement(true);
      void charger();
    }, [charger]),
  );

  if (chargement) return <Chargement message="Lecture des factures..." />;
  if (erreur) {
    return (
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: 'Factures' }} />
        <Erreur message={erreur} onReessayer={charger} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Factures' }} />
      <FlatList
        data={ventes}
        keyExtractor={(vente) => String(vente.id)}
        contentContainerStyle={ventes.length ? styles.liste : styles.vide}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={rafraichir} />}
        ListEmptyComponent={
          <ListeVide
            titre="Aucune facture"
            message="Enregistrez une vente pour pouvoir generer une facture PDF."
          />
        }
        renderItem={({ item }) => (
          <Carte style={styles.carte}>
            <View style={styles.entete}>
              <View style={styles.infos}>
                <Text style={styles.numero}>{item.numero}</Text>
                <Text style={styles.detail}>{dateLisible(item.dateVente)}</Text>
                <Text style={styles.detail}>{item.clientNom || 'Client comptoir'}</Text>
              </View>
              <View style={styles.montant}>
                <Montant valeur={item.total} taille="moyen" />
                <Text style={[styles.statut, { color: COULEURS_STATUT[item.statut] }]}>
                  {STATUTS[item.statut]}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <ActionsDocument preparer={() => preparerDocumentVente(item.id)} />
              <Bouton
                titre="Ouvrir la vente"
                variante="secondaire"
                onPress={() => router.push(`/vente/${item.id}`)}
              />
            </View>
          </Carte>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  liste: { padding: espaces.l, paddingBottom: espaces.xxl, gap: espaces.m },
  vide: { flexGrow: 1, justifyContent: 'center' },
  carte: { gap: espaces.m },
  entete: { flexDirection: 'row', justifyContent: 'space-between', gap: espaces.m },
  infos: { flex: 1 },
  numero: { fontSize: 17, fontWeight: '800', color: couleurs.texte },
  detail: { marginTop: 3, fontSize: 13, color: couleurs.texteFaible },
  montant: { alignItems: 'flex-end', minWidth: 110 },
  statut: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: rayons.s,
    backgroundColor: couleurs.fond,
    fontSize: 12,
    fontWeight: '700',
  },
  actions: { gap: espaces.s },
});
