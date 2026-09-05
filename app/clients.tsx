/**
 * Liste des clients.
 *
 * Le commercant ne consulte cette liste que pour deux raisons : retrouver qui
 * lui doit de l'argent, ou ajouter un nouveau client au moment d'une vente a
 * credit. Le RESTE DU est donc affiche directement dans la liste, sans avoir a
 * ouvrir chaque fiche.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  calculerSolde,
  creerClient,
  listerClients,
} from '../src/db/repositories/client';
import type { Client } from '../src/domain/types';

interface ClientAffiche extends Client {
  resteDu: number;
}

export default function EcranClients() {
  const router = useRouter();
  const [recherche, setRecherche] = useState('');
  const [clients, setClients] = useState<ClientAffiche[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauTelephone, setNouveauTelephone] = useState('');
  const [nouvelleAdresse, setNouvelleAdresse] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const liste = await listerClients(recherche);
      // Le solde n'est pas stocke : il se recalcule depuis les ventes, sinon il
      // finit par diverger des qu'une vente est annulee.
      const avecSolde = await Promise.all(
        liste.map(async (c) => ({
          ...c,
          resteDu: (await calculerSolde(c.id)).resteDu,
        })),
      );
      setClients(avecSolde);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture des clients impossible.');
    } finally {
      setChargement(false);
    }
  }, [recherche]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger]),
  );

  // La recherche se relance a la frappe, avec un court delai : interroger la
  // base a chaque lettre ferait clignoter la liste.
  useEffect(() => {
    const minuteur = setTimeout(() => {
      charger();
    }, 250);
    return () => clearTimeout(minuteur);
  }, [recherche, charger]);

  const enregistrerNouveau = useCallback(async () => {
    if (!nouveauNom.trim()) {
      Alert.alert('Nom manquant', 'Saisissez au moins le nom du client.');
      return;
    }
    setEnregistrement(true);
    try {
      await creerClient({
        nom: nouveauNom,
        telephone: nouveauTelephone,
        adresse: nouvelleAdresse,
      });
      setNouveauNom('');
      setNouveauTelephone('');
      setNouvelleAdresse('');
      setFormulaireOuvert(false);
      await charger();
    } catch (e) {
      Alert.alert('Creation impossible', e instanceof Error ? e.message : 'Erreur inconnue.');
    } finally {
      setEnregistrement(false);
    }
  }, [nouveauNom, nouveauTelephone, nouvelleAdresse, charger]);

  if (chargement) return <Chargement message="Lecture des clients..." />;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Clients' }} />

      <View style={styles.entete}>
        <Champ
          valeur={recherche}
          onChangeText={setRecherche}
          placeholder="Chercher un nom ou un telephone"
        />
      </View>

      {erreur ? (
        <Erreur message={erreur} onReessayer={charger} />
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={
            clients.length === 0 ? styles.videConteneur : styles.liste
          }
          ListEmptyComponent={
            <ListeVide
              titre={recherche ? 'Aucun resultat' : 'Aucun client'}
              message={
                recherche
                  ? 'Aucun client ne correspond a cette recherche.'
                  : 'Ajoutez un client pour suivre ses achats et son ardoise.'
              }
              actionTitre="Ajouter un client"
              onAction={() => setFormulaireOuvert(true)}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/client/${item.id}`)}
              style={({ pressed }) => [styles.ligne, pressed && styles.lignePressee]}
            >
              <View style={styles.ligneGauche}>
                <Text style={styles.nom}>{item.nom}</Text>
                {item.telephone ? (
                  <Text style={styles.telephone}>{item.telephone}</Text>
                ) : null}
              </View>
              {item.resteDu > 0 ? (
                <View style={styles.ardoise}>
                  <Text style={styles.ardoiseLibelle}>Doit</Text>
                  <Text style={styles.ardoiseMontant}>{formaterMontant(item.resteDu)}</Text>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      )}

      <View style={styles.pied}>
        <Bouton titre="Ajouter un client" onPress={() => setFormulaireOuvert(true)} grand />
      </View>

      <Modal
        visible={formulaireOuvert}
        animationType="slide"
        transparent
        onRequestClose={() => setFormulaireOuvert(false)}
      >
        <View style={styles.voile}>
          <View style={styles.feuille}>
            <Text style={styles.feuilleTitre}>Nouveau client</Text>
            <Champ
              valeur={nouveauNom}
              onChangeText={setNouveauNom}
              label="Nom"
              placeholder="Nom du client"
              autoFocus
            />
            <Champ
              valeur={nouveauTelephone}
              onChangeText={setNouveauTelephone}
              label="Telephone"
              placeholder="Facultatif"
              clavier="phone-pad"
            />
            <Champ
              valeur={nouvelleAdresse}
              onChangeText={setNouvelleAdresse}
              label="Adresse"
              placeholder="Quartier, rue, reperes"
            />
            <View style={styles.feuilleActions}>
              <Bouton
                titre="Annuler"
                onPress={() => setFormulaireOuvert(false)}
                variante="secondaire"
              />
              <Bouton
                titre="Enregistrer"
                onPress={() => void enregistrerNouveau()}
                enCours={enregistrement}
              />
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
  telephone: { fontSize: 13, color: couleurs.texteFaible, marginTop: 2 },

  ardoise: { alignItems: 'flex-end' },
  ardoiseLibelle: { fontSize: 11, color: couleurs.texteFaible },
  ardoiseMontant: { fontSize: 15, fontWeight: '700', color: couleurs.danger },

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
  feuilleTitre: {
    fontSize: 18,
    fontWeight: '700',
    color: couleurs.texte,
    marginBottom: espaces.s,
  },
  feuilleActions: { flexDirection: 'row', gap: espaces.s, marginTop: espaces.s },
});
