/**
 * Liste des achats fournisseur.
 *
 * La dette totale est affichee en haut : c'est la question que le commercant
 * se pose en ouvrant cet ecran, avant meme de regarder le detail des achats.
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
  formaterMontant,
  rayons,
} from '../../src/ui/components';
import { listerAchats, type AchatResume, type StatutAchat } from '../../src/services/achat';
import { detteTotale } from '../../src/db/repositories/fournisseur';

const LIBELLE_STATUT: Record<StatutAchat, string> = {
  BROUILLON: 'A recevoir',
  RECU: 'Recu',
  ANNULE: 'Annule',
};

const COULEUR_STATUT: Record<StatutAchat, string> = {
  BROUILLON: couleurs.avertissement,
  RECU: couleurs.primaire,
  ANNULE: couleurs.texteFaible,
};

function dateCourte(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function EcranAchats() {
  const router = useRouter();
  const [achats, setAchats] = useState<AchatResume[]>([]);
  const [dette, setDette] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [rafraichit, setRafraichit] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const [liste, d] = await Promise.all([listerAchats({ limite: 200 }), detteTotale()]);
      setAchats(liste);
      setDette(d);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture des achats impossible.');
    } finally {
      setChargement(false);
      setRafraichit(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger]),
  );

  if (chargement) return <Chargement message="Lecture des achats..." />;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Achats' }} />

      {erreur ? (
        <Erreur message={erreur} onReessayer={charger} />
      ) : (
        <FlatList
          data={achats}
          keyExtractor={(a) => String(a.id)}
          contentContainerStyle={
            achats.length === 0 ? styles.videConteneur : styles.liste
          }
          refreshControl={
            <RefreshControl
              refreshing={rafraichit}
              onRefresh={() => {
                setRafraichit(true);
                charger();
              }}
            />
          }
          ListHeaderComponent={
            achats.length > 0 ? (
              <Carte style={styles.resume}>
                <Text style={styles.resumeLibelle}>
                  {dette > 0 ? 'Vous devez a vos fournisseurs' : 'Aucune dette fournisseur'}
                </Text>
                <Montant
                  valeur={dette}
                  taille="grand"
                  couleur={dette > 0 ? couleurs.danger : couleurs.primaire}
                />
                <Pressable onPress={() => router.push('/fournisseurs')}>
                  <Text style={styles.lien}>Voir les fournisseurs</Text>
                </Pressable>
              </Carte>
            ) : null
          }
          ListEmptyComponent={
            <ListeVide
              titre="Aucun achat"
              message="Enregistrez vos achats fournisseur pour faire entrer la marchandise en stock et suivre ce que vous devez."
              actionTitre="Enregistrer un achat"
              onAction={() => router.push('/achats/nouveau')}
            />
          }
          renderItem={({ item }) => {
            const reste = Math.max(0, item.total - item.montantPaye);
            return (
              <Pressable
                onPress={() => router.push(`/achats/${item.id}`)}
                style={({ pressed }) => [styles.ligne, pressed && styles.lignePressee]}
              >
                <View style={styles.ligneGauche}>
                  <Text style={styles.numero}>{item.numero}</Text>
                  <Text style={styles.details}>
                    {dateCourte(item.dateAchat)}
                    {item.fournisseurNom ? `  ${item.fournisseurNom}` : ''}
                  </Text>
                  {reste > 0 && item.statut !== 'ANNULE' ? (
                    <Text style={styles.resteLigne}>
                      reste {formaterMontant(reste)}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.ligneDroite}>
                  <Montant valeur={item.total} taille="moyen" />
                  <Text style={[styles.statut, { color: COULEUR_STATUT[item.statut] }]}>
                    {LIBELLE_STATUT[item.statut]}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <View style={styles.pied}>
        <Bouton
          titre="Enregistrer un achat"
          onPress={() => router.push('/achats/nouveau')}
          grand
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  liste: { padding: espaces.l },
  videConteneur: { flexGrow: 1, justifyContent: 'center' },

  resume: { marginBottom: espaces.m },
  resumeLibelle: { fontSize: 13, color: couleurs.texteFaible, marginBottom: 4 },
  lien: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.primaire,
    marginTop: espaces.s,
    minHeight: 24,
  },

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
  resteLigne: { fontSize: 12, color: couleurs.danger, marginTop: 2 },
  statut: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  pied: {
    padding: espaces.l,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
});
