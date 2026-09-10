/**
 * Reglages de la boutique.
 *
 * Ces champs ne sont pas decoratifs : ils composent l'en-tete du recu remis au
 * client. Une boutique sans nom ni telephone imprime un ticket anonyme, sur
 * lequel le client n'a aucun moyen de revenir en cas de probleme.
 */
import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import * as SelecteurImage from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

import { Bouton, Carte, Champ, Chargement, couleurs, espaces, rayons, uriImage } from '../../src/ui/components';
import {
  ecrireParametres,
  lireParametres,
  type Parametres,
} from '../../src/services/parametres';
import { marquerBoutiqueModifiee } from '../../src/services/synchronisation';
import { useSession } from '../_layout';

const DOSSIER_LOGO = 'boutique';

async function rangerLogo(uriSource: string): Promise<string> {
  const dossier = new Directory(Paths.document, DOSSIER_LOGO);
  if (!dossier.exists) dossier.create({ intermediates: true });

  const destination = new File(dossier, `logo-${Date.now().toString(36)}.jpg`);
  await new File(uriSource).copy(destination);
  return `${DOSSIER_LOGO}/${destination.name}`;
}

function effacerLogo(chemin: string): void {
  if (!chemin.startsWith(`${DOSSIER_LOGO}/`)) return;
  try {
    const fichier = new File(Paths.document, chemin);
    if (fichier.exists) fichier.delete();
  } catch {
    // L'ancien fichier ne doit jamais empecher l'enregistrement des reglages.
  }
}

export default function EcranBoutique() {
  const { recharger } = useSession();
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [initial, setInitial] = useState<Parametres | null>(null);

  const [nom, setNom] = useState('');
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [logo, setLogo] = useState('');
  const [logoSauvegarde, setLogoSauvegarde] = useState('');
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
        setLogo(p.boutiqueLogo);
        setLogoSauvegarde(p.boutiqueLogo);
        setDevise(p.devise);
        setPiedDePage(p.recuPiedDePage);
        setChargement(false);
      })();
      return () => {
        vivant = false;
      };
    }, []),
  );

  const choisirLogo = useCallback(async () => {
    try {
      const permission = await SelecteurImage.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Accès aux photos', 'Autorisez les photos pour choisir le logo de la boutique.');
        return;
      }
      const resultat = await SelecteurImage.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (resultat.canceled || !resultat.assets?.[0]) return;

      const nouveau = await rangerLogo(resultat.assets[0].uri);
      // L'ancien logo n'est retire qu'apres « Enregistrer » : quitter cette
      // page sans sauver ne doit jamais casser les factures existantes.
      setLogo(nouveau);
    } catch (erreur) {
      Alert.alert('Logo impossible', erreur instanceof Error ? erreur.message : 'Erreur.');
    }
  }, [logo]);

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
        boutiqueLogo: logo,
        devise: devise.trim() || 'F',
        recuPiedDePage: piedDePage.trim(),
      });
      await marquerBoutiqueModifiee();
      await recharger();
      if (logoSauvegarde && logoSauvegarde !== logo) effacerLogo(logoSauvegarde);
      setLogoSauvegarde(logo);
      Alert.alert('Enregistre', 'Les prochains recus utiliseront ces informations.');
    } catch (e) {
      Alert.alert('Enregistrement impossible', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setEnregistrement(false);
    }
  }, [nom, adresse, telephone, logo, logoSauvegarde, devise, piedDePage, recharger]);

  if (chargement || !initial) return <Chargement message="Lecture des reglages..." />;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Boutique' }} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <Carte titre="Identite">
          <View style={styles.logoLigne}>
            <Pressable style={styles.logoCadre} onPress={() => void choisirLogo()}>
              {uriImage(logo) ? (
                <Image source={{ uri: uriImage(logo)! }} style={styles.logoImage} resizeMode="contain" />
              ) : (
                <Text style={styles.logoInitiales}>LOGO</Text>
              )}
            </Pressable>
            <View style={styles.logoTextes}>
              <Text style={styles.logoTitre}>Logo de la boutique</Text>
              <Text style={styles.logoAide}>Il apparaîtra sur vos factures PDF et bons de commande.</Text>
              <View style={styles.logoActions}>
                <Pressable style={styles.logoBouton} onPress={() => void choisirLogo()}>
                  <Text style={styles.logoBoutonTexte}>{logo ? 'Changer' : 'Choisir un logo'}</Text>
                </Pressable>
                {logo ? (
                  <Pressable
                    style={styles.logoSupprimer}
                    onPress={() => {
                      setLogo('');
                    }}
                  >
                    <Text style={styles.logoSupprimerTexte}>Retirer</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
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
            <Text style={styles.apercuLigne}>TOTAL{'          '}12 500 {devise || 'F'}</Text>
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
  logoLigne: { flexDirection: 'row', gap: espaces.m, alignItems: 'center' },
  logoCadre: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rayons.m,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: couleurs.primaireBordure,
    backgroundColor: couleurs.surfaceDouce,
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%' },
  logoInitiales: { color: couleurs.primaire, fontSize: 12, fontWeight: '800' },
  logoTextes: { flex: 1, gap: 3 },
  logoTitre: { color: couleurs.texte, fontSize: 15, fontWeight: '700' },
  logoAide: { color: couleurs.texteFaible, fontSize: 12, lineHeight: 17 },
  logoActions: { flexDirection: 'row', alignItems: 'center', gap: espaces.m, marginTop: 4 },
  logoBouton: { paddingVertical: 5 },
  logoBoutonTexte: { color: couleurs.primaire, fontSize: 13, fontWeight: '700' },
  logoSupprimer: { paddingVertical: 5 },
  logoSupprimerTexte: { color: couleurs.dangerFonce, fontSize: 13, fontWeight: '700' },
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
