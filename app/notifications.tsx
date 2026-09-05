/**
 * Le centre de notifications.
 *
 * POURQUOI CET ECRAN REMPLACE « ALERTES DE STOCK »
 * ------------------------------------------------
 * L'ancien ecran recalculait la liste des produits sous le seuil a chaque
 * ouverture. Il repondait donc a « qu'est-ce qui va mal MAINTENANT », jamais a
 * « que s'est-il passé pendant que je servais un client ». Ici, chaque
 * evenement est enregistre au moment ou il survient : le commercant retrouve
 * le soir la rupture de 14 h, meme si le produit a ete reapprovisionne depuis.
 *
 * L'ecran des alertes de stock reste accessible depuis le menu : il repond a
 * une autre question — « que dois-je commander ? » — et garde son utilite.
 */
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';

import { Bouton, couleurs, espaces, rayons } from '../src/ui/components';
import { Icone, type NomIcone } from '../src/ui/icones';
import {
  lister,
  marquerLue,
  purger,
  rafraichirPastille,
  toutMarquerLu,
  type Gravite,
  type Notification,
} from '../src/services/notifications';

/** Le pictogramme dit le genre d'evenement, la couleur en dit l'urgence. */
const ICONE: Record<string, NomIcone> = {
  rupture: 'alerte',
  seuil: 'alerte',
  seuil_groupe: 'stock',
  abonnement: 'document',
  ardoise: 'clients',
  dette: 'fournisseurs',
  annonce: 'cloche',
};

const TEINTE: Record<Gravite, string> = {
  urgent: couleurs.danger,
  attention: couleurs.avertissement,
  info: couleurs.primaire,
};

const FOND: Record<Gravite, string> = {
  urgent: couleurs.dangerDouce,
  attention: couleurs.avertissementDouce,
  info: couleurs.primaireDouce,
};

/** `il y a 3 h`, `hier`, `le 02/09`. Une heure exacte n'apporte rien ici. */
function ilYA(iso: string): string {
  const alors = new Date(iso).getTime();
  if (Number.isNaN(alors)) return '';
  const minutes = Math.floor((Date.now() - alors) / 60000);
  if (minutes < 1) return "a l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  if (heures < 48) return 'hier';
  const d = new Date(alors);
  return `le ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function EcranNotifications() {
  const router = useRouter();
  const [avis, setAvis] = useState<Notification[]>([]);
  const [charge, setCharge] = useState(false);

  const charger = useCallback(async () => {
    setAvis(await lister());
    setCharge(true);
    await rafraichirPastille();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger]),
  );

  const ouvrir = useCallback(
    async (n: Notification) => {
      // Marquer lu AVANT de naviguer : si la navigation echoue, la
      // notification a quand meme ete vue, et la recompter serait faux.
      await marquerLue(n.cle);
      await rafraichirPastille();
      if (n.chemin) router.push(n.chemin as never);
      else void charger();
    },
    [charger, router],
  );

  const toutLire = useCallback(async () => {
    await toutMarquerLu();
    // On profite du geste pour faire le menage des vieilles notifications
    // deja lues. Les non lues ne sont jamais touchees, quel que soit leur age.
    await purger(30);
    await charger();
  }, [charger]);

  const nonLues = avis.filter((n) => !n.lue).length;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Notifications' }} />

      <FlatList
        data={avis}
        keyExtractor={(n) => n.cle}
        contentContainerStyle={avis.length === 0 ? styles.videConteneur : styles.liste}
        ListHeaderComponent={
          nonLues > 0 ? (
            <View style={styles.barre}>
              <Text style={styles.barreTexte}>
                {nonLues} non lue{nonLues > 1 ? 's' : ''}
              </Text>
              <Bouton
                titre="Tout marquer lu"
                onPress={() => void toutLire()}
                variante="discret"
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          charge ? (
            <View style={styles.vide}>
              <Icone nom="cloche" taille={40} couleur={couleurs.texteEteint} />
              <Text style={styles.videTitre}>Rien a signaler</Text>
              <Text style={styles.videTexte}>
                Vous serez prevenu ici quand un produit sera epuise ou passera
                sous son seuil.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void ouvrir(item)}
            style={({ pressed }) => [
              styles.carte,
              !item.lue && styles.carteNonLue,
              pressed && styles.cartePressee,
            ]}
          >
            <View style={[styles.pastille, { backgroundColor: FOND[item.gravite] }]}>
              <Icone
                nom={ICONE[item.genre] ?? 'cloche'}
                taille={20}
                couleur={TEINTE[item.gravite]}
              />
            </View>
            <View style={styles.texte}>
              <Text style={[styles.titre, !item.lue && styles.titreNonLu]} numberOfLines={2}>
                {item.titre}
              </Text>
              {item.corps ? (
                <Text style={styles.corps} numberOfLines={3}>
                  {item.corps}
                </Text>
              ) : null}
              <Text style={styles.quand}>{ilYA(item.dateRappel ?? item.dateCreation)}</Text>
            </View>
            {!item.lue ? <View style={styles.point} /> : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  liste: { padding: espaces.m, gap: espaces.s },
  videConteneur: { flexGrow: 1, padding: espaces.l },

  barre: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: espaces.s,
  },
  barreTexte: { fontSize: 13, color: couleurs.texteFaible, fontWeight: '600' },

  carte: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaces.m,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espaces.m,
    // Cible large : on lit ses notifications debout, souvent d'une main.
    minHeight: 76,
  },
  carteNonLue: { borderColor: couleurs.primaireBordure },
  cartePressee: { backgroundColor: couleurs.fond },

  pastille: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texte: { flex: 1 },
  titre: { fontSize: 15, color: couleurs.texte, marginBottom: 2 },
  titreNonLu: { fontWeight: '700' },
  corps: { fontSize: 13, color: couleurs.texteFaible, lineHeight: 18 },
  quand: { fontSize: 11, color: couleurs.texteEteint, marginTop: 4 },

  point: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: couleurs.primaire,
    marginTop: 6,
  },

  vide: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaces.s },
  videTitre: { fontSize: 17, fontWeight: '700', color: couleurs.texte },
  videTexte: {
    fontSize: 13,
    color: couleurs.texteFaible,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
});
