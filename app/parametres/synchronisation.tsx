/** Etat et relance manuelle de la replication Web <-> mobile. */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';

import { Bouton, Carte, couleurs, espaces, rayons } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import { useSession } from '../_layout';

function dateLisible(valeur: string | null): string {
  if (!valeur) return 'Jamais';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime())
    ? valeur
    : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default function EcranSynchronisation() {
  const { etatSynchronisation, synchroniserMaintenant } = useSession();
  const [enCours, setEnCours] = useState(false);
  const enErreur = Boolean(etatSynchronisation.derniereErreur);
  const enAttente = etatSynchronisation.enAttente > 0;

  const lancer = async () => {
    setEnCours(true);
    try {
      await synchroniserMaintenant();
    } finally {
      setEnCours(false);
    }
  };

  return <SafeAreaView style={styles.page} edges={['bottom']}>
    <Stack.Screen options={{ headerShown: true, title: 'Synchronisation' }} />
    <ScrollView contentContainerStyle={styles.contenu}>
      <View style={[styles.etat, enErreur ? styles.etatErreur : enAttente ? styles.etatAttente : styles.etatOk]}>
        <View style={[styles.icone, enErreur ? styles.iconeErreur : enAttente ? styles.iconeAttente : styles.iconeOk]}>
          <Icone nom={enErreur ? 'alerte' : 'reseau'} taille={27} couleur={enErreur ? couleurs.danger : enAttente ? '#b45309' : '#07924a'} />
        </View>
        <View style={styles.etatTextes}>
          <Text style={styles.etatTitre}>{enErreur ? 'Synchronisation à reprendre' : enAttente ? `${etatSynchronisation.enAttente} opération(s) en attente` : 'Synchronisé'}</Text>
          <Text style={styles.etatSousTitre}>
            {enErreur
              ? 'Les opérations restent enregistrées sur ce téléphone et seront renvoyées dès la prochaine réussite.'
              : enAttente
                ? 'Les données restent locales et seront envoyées dès que le serveur sera joignable.'
                : 'Les écritures restent utilisables sans Internet et sont rapprochées avec SahelPOS Web.'}
          </Text>
        </View>
      </View>

      <Carte titre="Dernière activité">
        <Ligne titre="Dernier succès" valeur={dateLisible(etatSynchronisation.dernierSucces)} />
        <Ligne titre="Dernière tentative" valeur={dateLisible(etatSynchronisation.derniereTentative)} />
        <Ligne titre="Dernier push" valeur={dateLisible(etatSynchronisation.dernierPush)} />
        <Ligne titre="Objets envoyes" valeur={etatSynchronisation.dernierNombrePush === null ? 'Jamais' : String(etatSynchronisation.dernierNombrePush)} />
        <Ligne titre="Dernier pull" valeur={dateLisible(etatSynchronisation.dernierPull)} />
        <Ligne titre="Objets recus" valeur={etatSynchronisation.dernierNombrePull === null ? 'Jamais' : String(etatSynchronisation.dernierNombrePull)} />
        <Ligne titre="Opérations en attente" valeur={String(etatSynchronisation.enAttente)} />
        <Ligne titre="Curseur" valeur={etatSynchronisation.cursor ?? 'Initialisation'} />
        {enErreur ? <View style={styles.erreur}><Text style={styles.erreurTitre}>À vérifier</Text><Text style={styles.erreurTexte}>{etatSynchronisation.derniereErreur}</Text></View> : null}
      </Carte>

      <Carte titre="Ce qui est synchronisé">
        <Text style={styles.texte}>Produits et stock, clients, fournisseurs, ventes, achats, paiements d’achat et identité de boutique.</Text>
      </Carte>

      <Bouton titre="Synchroniser maintenant" onPress={() => void lancer()} enCours={enCours} grand />
      <Text style={styles.aide}>La synchronisation se relance aussi à la reconnexion Internet, au retour dans l’application et après une nouvelle opération.</Text>
    </ScrollView>
  </SafeAreaView>;
}

function Ligne({ titre, valeur }: { titre: string; valeur: string }) {
  return <View style={styles.ligne}><Text style={styles.ligneTitre}>{titre}</Text><Text style={styles.ligneValeur}>{valeur}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.l, paddingBottom: espaces.xxl, gap: espaces.m },
  etat: { flexDirection: 'row', gap: espaces.m, padding: espaces.l, borderRadius: rayons.m, borderWidth: 1 },
  etatOk: { backgroundColor: '#f0fff7', borderColor: '#d4f3df' },
  etatAttente: { backgroundColor: '#fff9ed', borderColor: '#fbe1b4' },
  etatErreur: { backgroundColor: '#fff5f6', borderColor: '#ffd8df' },
  icone: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  iconeOk: { backgroundColor: '#d9fae7' }, iconeErreur: { backgroundColor: '#ffe0e6' },
  iconeAttente: { backgroundColor: '#ffefc7' },
  etatTextes: { flex: 1 }, etatTitre: { color: couleurs.texte, fontSize: 17, fontWeight: '800' },
  etatSousTitre: { marginTop: 4, color: couleurs.texteFaible, fontSize: 13, lineHeight: 19 },
  ligne: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaces.m, borderBottomWidth: 1, borderBottomColor: couleurs.bordure },
  ligneTitre: { color: couleurs.texteFaible, fontSize: 14 }, ligneValeur: { flexShrink: 1, color: couleurs.texte, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  erreur: { marginTop: espaces.m, padding: espaces.m, borderRadius: rayons.s, backgroundColor: '#fff0f2' },
  erreurTitre: { color: couleurs.danger, fontSize: 14, fontWeight: '800' }, erreurTexte: { marginTop: 3, color: couleurs.dangerFonce, fontSize: 13, lineHeight: 18 },
  texte: { color: couleurs.texteFaible, fontSize: 14, lineHeight: 21 },
  aide: { color: couleurs.texteFaible, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
