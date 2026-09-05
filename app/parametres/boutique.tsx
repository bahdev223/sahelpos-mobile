/**
 * Reglages de la boutique.
 *
 * Ces champs ne sont pas decoratifs : ils composent l'en-tete du recu remis au
 * client. Une boutique sans nom ni telephone imprime un ticket anonyme, sur
 * lequel le client n'a aucun moyen de revenir en cas de probleme.
 */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';

import { Bouton, Carte, Champ, Chargement, couleurs, espaces, rayons } from '../../src/ui/components';
import {
  ecrireParametres,
  lireParametres,
  type Parametres,
} from '../../src/services/parametres';

export default function EcranBoutique() {
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [initial, setInitial] = useState<Parametres | null>(null);

  const [nom, setNom] = useState('');
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [devise, setDevise] = useState('');
  const [piedDePage, setPiedDePage] = useState('');

  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      (async () => {
        const p = await lireParametres();
        if (!vivant) return;
        setInitial(p);
        setNom(p.boutiqueNom);
        setAdresse(p.boutiqueAdresse);
        setTelephone(p.boutiqueTelephone);
        setDevise(p.devise);
        setPiedDePage(p.recuPiedDePage);
        setChargement(false);
      })();
      return () => {
        vivant = false;
      };
    }, []),
  );

  const enregistrer = useCallback(async () => {
    if (!nom.trim()) {
      Alert.alert('Nom manquant', 'Le nom de la boutique apparait sur chaque recu.');
      return;
    }
    setEnregistrement(true);
    try {
      await ecrireParametres({
        boutiqueNom: nom.trim(),
        boutiqueAdresse: adresse.trim(),
        boutiqueTelephone: telephone.trim(),
        devise: devise.trim() || 'FCFA',
        recuPiedDePage: piedDePage.trim(),
      });
      Alert.alert('Enregistre', 'Les prochains recus utiliseront ces informations.');
    } catch (e) {
      Alert.alert('Enregistrement impossible', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setEnregistrement(false);
    }
  }, [nom, adresse, telephone, devise, piedDePage]);

  if (chargement || !initial) return <Chargement message="Lecture des reglages..." />;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Boutique' }} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <Carte titre="Identite">
          <Champ valeur={nom} onChangeText={setNom} label="Nom de la boutique" />
          <Champ valeur={adresse} onChangeText={setAdresse} label="Adresse" placeholder="Facultatif" />
          <Champ
            valeur={telephone}
            onChangeText={setTelephone}
            label="Telephone"
            clavier="phone-pad"
            placeholder="Facultatif"
            aide="Imprime sur le recu : c'est par la que le client vous rappelle."
          />
        </Carte>

        <Carte titre="Recu">
          <Champ
            valeur={devise}
            onChangeText={setDevise}
            label="Devise"
            aide="Le franc CFA n'a pas de centimes : les montants restent entiers."
          />
          <Champ
            valeur={piedDePage}
            onChangeText={setPiedDePage}
            label="Message de fin de ticket"
            placeholder="Merci de votre visite"
          />
        </Carte>

        <Carte titre="Apercu du recu">
          <View style={styles.apercu}>
            <Text style={styles.apercuTitre}>{(nom || 'MA BOUTIQUE').toUpperCase()}</Text>
            {adresse ? <Text style={styles.apercuLigne}>{adresse}</Text> : null}
            {telephone ? <Text style={styles.apercuLigne}>Tel : {telephone}</Text> : null}
            <Text style={styles.apercuSeparateur}>{'='.repeat(32)}</Text>
            <Text style={styles.apercuLigne}>Recu V-...-0001</Text>
            <Text style={styles.apercuSeparateur}>{'-'.repeat(32)}</Text>
            <Text style={styles.apercuLigne}>TOTAL{'          '}12 500 {devise || 'FCFA'}</Text>
            <Text style={styles.apercuSeparateur}>{'='.repeat(32)}</Text>
            <Text style={styles.apercuLigne}>{piedDePage || 'Merci de votre visite'}</Text>
          </View>
        </Carte>

        <Bouton
          titre="Enregistrer"
          onPress={() => void enregistrer()}
          enCours={enregistrement}
          grand
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.l, paddingBottom: espaces.xxl, gap: espaces.m },
  apercu: {
    backgroundColor: couleurs.surfaceDouce,
    borderRadius: rayons.s,
    padding: espaces.m,
  },
  apercuTitre: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.texte,
    textAlign: 'center',
  },
  apercuLigne: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: couleurs.texte,
    textAlign: 'center',
  },
  apercuSeparateur: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: couleurs.texteFaible,
    textAlign: 'center',
  },
});
