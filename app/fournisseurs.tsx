/**
 * Liste des fournisseurs, avec ce qu'on doit a chacun.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';

import {
  Bouton,
  Champ,
  Chargement,
  Erreur,
  ListeVide,
  couleurs,
  espaces,
  formaterMontant,
  rayons,
} from '../src/ui/components';
import {
  calculerSoldeFournisseur,
  creerFournisseur,
  listerFournisseurs,
  type Fournisseur,
} from '../src/db/repositories/fournisseur';

interface FournisseurAffiche extends Fournisseur {
  resteDu: number;
  nbAchats: number;
}

export default function EcranFournisseurs() {
  const router = useRouter();
  const [recherche, setRecherche] = useState('');
  const [fournisseurs, setFournisseurs] = useState<FournisseurAffiche[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [adresse, setAdresse] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const liste = await listerFournisseurs(recherche);
      const avecSolde = await Promise.all(
        liste.map(async (f) => {
          const s = await calculerSoldeFournisseur(f.id);
          return { ...f, resteDu: s.resteDu, nbAchats: s.nbAchats };
        }),
      );
      setFournisseurs(avecSolde);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture des fournisseurs impossible.');
    } finally {
      setChargement(false);
    }
  }, [recherche]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger]),
  );

  useEffect(() => {
    const minuteur = setTimeout(() => {
      charger();
    }, 250);
    return () => clearTimeout(minuteur);
  }, [recherche, charger]);

  const creer = useCallback(async () => {
    if (!nom.trim()) {
      Alert.alert('Nom manquant', 'Saisissez au moins le nom du fournisseur.');
      return;
    }
    setEnCours(true);
    try {
      await creerFournisseur({ nom, telephone, adresse });
      setNom('');
      setTelephone('');
      setAdresse('');
      setOuvert(false);
      await charger();
    } catch (e) {
      Alert.alert('Creation impossible', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setEnCours(false);
    }
  }, [nom, telephone, charger]);

  if (chargement) return <Chargement message="Lecture des fournisseurs..." />;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Fournisseurs' }} />

      <View style={styles.entete}>
        <Champ
          valeur={recherche}
          onChangeText={setRecherche}
          placeholder="Chercher un fournisseur"
        />
      </View>

      {erreur ? (
        <Erreur message={erreur} onReessayer={charger} />
      ) : (
        <FlatList
          data={fournisseurs}
          keyExtractor={(f) => String(f.id)}
          contentContainerStyle={
            fournisseurs.length === 0 ? styles.videConteneur : styles.liste
          }
          ListEmptyComponent={
            <ListeVide
              titre={recherche ? 'Aucun resultat' : 'Aucun fournisseur'}
              message={
                recherche
                  ? 'Aucun fournisseur ne correspond a cette recherche.'
                  : 'Ajoutez vos fournisseurs pour suivre vos achats et vos dettes.'
              }
              actionTitre="Ajouter un fournisseur"
              onAction={() => setOuvert(true)}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/fournisseur/${item.id}`)}
              style={({ pressed }) => [styles.ligne, pressed && styles.lignePressee]}
            >
              <View style={styles.ligneGauche}>
                <Text style={styles.nom}>{item.nom}</Text>
                <Text style={styles.detail}>
                  {item.telephone ? `${item.telephone} · ` : ''}
                  {item.nbAchats} achat{item.nbAchats > 1 ? 's' : ''}
                </Text>
              </View>
              {item.resteDu > 0 ? (
                <View style={styles.dette}>
                  <Text style={styles.detteLibelle}>Vous devez</Text>
                  <Text style={styles.detteMontant}>{formaterMontant(item.resteDu)}</Text>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      )}

      <View style={styles.pied}>
        <Bouton titre="Ajouter un fournisseur" onPress={() => setOuvert(true)} grand />
      </View>

      <Modal visible={ouvert} animationType="slide" transparent onRequestClose={() => setOuvert(false)}>
        <View style={styles.voile}>
          <View style={styles.feuille}>
            <Text style={styles.feuilleTitre}>Nouveau fournisseur</Text>
            <Champ valeur={nom} onChangeText={setNom} label="Nom" autoFocus />
            <Champ
              valeur={telephone}
              onChangeText={setTelephone}
              label="Telephone"
              placeholder="Facultatif"
              clavier="phone-pad"
            />
            <Champ
              valeur={adresse}
              onChangeText={setAdresse}
              label="Adresse"
              placeholder="Elle figure sur le bon de commande"
            />
            <View style={styles.feuilleActions}>
              <Bouton titre="Annuler" onPress={() => setOuvert(false)} variante="secondaire" />
              <Bouton titre="Enregistrer" onPress={() => void creer()} enCours={enCours} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  entete: { padding: espaces.l, paddingBottom: espaces.s },
  liste: { paddingHorizontal: espaces.l, paddingBottom: espaces.l },
  videConteneur: { flexGrow: 1, justifyContent: 'center' },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  nom: { fontSize: 16, fontWeight: '600', color: couleurs.texte },
  detail: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },

  dette: { alignItems: 'flex-end' },
  detteLibelle: { fontSize: 11, color: couleurs.texteFaible },
  detteMontant: { fontSize: 15, fontWeight: '700', color: couleurs.danger },

  pied: {
    padding: espaces.l,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },

  voile: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  feuille: {
    backgroundColor: couleurs.surface,
    borderTopLeftRadius: rayons.l,
    borderTopRightRadius: rayons.l,
    padding: espaces.l,
    gap: espaces.s,
  },
  feuilleTitre: { fontSize: 18, fontWeight: '700', color: couleurs.texte },
  feuilleActions: { flexDirection: 'row', gap: espaces.s, marginTop: espaces.s },
});
