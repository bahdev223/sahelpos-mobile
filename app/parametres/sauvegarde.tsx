/**
 * Sauvegarde et restauration.
 *
 * Ce n'est pas un ecran de confort. Les donnees vivent dans le stockage prive
 * de l'application : elles disparaissent avec la desinstallation, et un
 * telephone perdu ou vole emporte toute la caisse avec lui. La sauvegarde doit
 * donc SORTIR du telephone — d'ou le partage plutot qu'un simple fichier local.
 */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';

import { Bouton, Carte, couleurs, espaces, rayons } from '../../src/ui/components';
import {
  exporterBase,
  partagerSauvegarde,
  type ResumeSauvegarde,
} from '../../src/services/sauvegarde';

function tailleLisible(octets: number): string {
  if (octets < 1024) return `${octets} octets`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function EcranSauvegarde() {
  const [enCours, setEnCours] = useState(false);
  const [derniere, setDerniere] = useState<ResumeSauvegarde | null>(null);

  const sauvegarder = useCallback(async () => {
    setEnCours(true);
    try {
      const resume = await exporterBase();
      setDerniere(resume);

      // On enchaine tout de suite sur le partage : une sauvegarde qui reste
      // dans le telephone ne protege de rien.
      const partage = await partagerSauvegarde(resume.chemin);
      if (!partage) {
        Alert.alert(
          'Sauvegarde creee',
          `${resume.nomFichier} est enregistre dans le telephone, mais le partage ` +
            "n'est pas disponible ici. Copiez le fichier ailleurs des que possible.",
        );
      }
    } catch (e) {
      Alert.alert(
        'Sauvegarde impossible',
        e instanceof Error ? e.message : 'Erreur inconnue.',
      );
    } finally {
      setEnCours(false);
    }
  }, []);

  const expliquerRestauration = useCallback(() => {
    Alert.alert(
      'Restaurer une sauvegarde',
      'La restauration REMPLACE toutes les donnees actuelles par celles du ' +
        'fichier : ventes, produits, stock et clients enregistres depuis la ' +
        'sauvegarde seront perdus.\n\n' +
        'Faites d abord une sauvegarde de l etat actuel, puis contactez votre ' +
        'revendeur pour etre accompagne.',
      [{ text: "J'ai compris" }],
    );
  }, []);

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Sauvegarde' }} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <View style={styles.avertissement}>
          <Text style={styles.avertissementTitre}>Pourquoi sauvegarder</Text>
          <Text style={styles.avertissementTexte}>
            Vos donnees sont dans ce telephone, et nulle part ailleurs. Si vous
            le perdez, s il tombe en panne, ou si l application est
            desinstallee, tout disparait. Une sauvegarde reguliere envoyee sur
            WhatsApp ou par mail est votre seule protection.
          </Text>
        </View>

        <Carte titre="Creer une sauvegarde">
          <Text style={styles.aide}>
            Le fichier est copie puis propose au partage : envoyez-le vous par
            WhatsApp, par mail, ou copiez-le sur un ordinateur.
          </Text>
          <Bouton
            titre="Sauvegarder maintenant"
            onPress={() => void sauvegarder()}
            enCours={enCours}
            grand
          />

          {derniere ? (
            <View style={styles.resume}>
              <Text style={styles.resumeTitre}>Derniere sauvegarde</Text>
              <Ligne libelle="Fichier" valeur={derniere.nomFichier} />
              <Ligne libelle="Taille" valeur={tailleLisible(derniere.tailleOctets)} />
              <Ligne libelle="Produits" valeur={String(derniere.nbProduits)} />
              <Ligne libelle="Ventes" valeur={String(derniere.nbVentes)} />
            </View>
          ) : null}
        </Carte>

        <Carte titre="Restaurer">
          <Text style={styles.aide}>
            Remplacer les donnees actuelles par une sauvegarde. Operation
            delicate : elle efface tout ce qui a ete enregistre depuis.
          </Text>
          <Bouton
            titre="Comment restaurer"
            onPress={expliquerRestauration}
            variante="secondaire"
          />
        </Carte>
      </ScrollView>
    </SafeAreaView>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.ligneLibelle}>{libelle}</Text>
      <Text style={styles.ligneValeur} numberOfLines={1}>
        {valeur}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.l, paddingBottom: espaces.xxl, gap: espaces.m },

  avertissement: {
    backgroundColor: couleurs.avertissementDouce,
    borderRadius: rayons.m,
    padding: espaces.l,
  },
  avertissementTitre: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.avertissement,
    marginBottom: espaces.s,
  },
  avertissementTexte: { fontSize: 13, color: couleurs.texte, lineHeight: 19 },

  aide: { fontSize: 13, color: couleurs.texteFaible, marginBottom: espaces.m },

  resume: {
    marginTop: espaces.l,
    paddingTop: espaces.m,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
  },
  resumeTitre: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.texte,
    marginBottom: espaces.s,
  },
  ligne: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  ligneLibelle: { fontSize: 13, color: couleurs.texteFaible },
  ligneValeur: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texte,
    flexShrink: 1,
    marginLeft: espaces.m,
  },
});
