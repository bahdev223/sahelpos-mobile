/**
 * Reglage de l'imprimante a tickets.
 *
 * Le commercant ne sait pas — et n'a pas a savoir — si son imprimante est en
 * Bluetooth Classic ou en Bluetooth Low Energy. L'ecran cherche donc sur LES
 * DEUX canaux en meme temps et presente une seule liste : il appuie sur
 * Rechercher, il voit son appareil, il le choisit.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';

import {
  Bouton,
  Carte,
  couleurs,
  espaces,
  rayons,
} from '../../src/ui/components';
import {
  connecterImprimante,
  rechercherImprimantes,
  type ImprimanteTrouvee,
} from '../../src/services/impression/transports';
import { serviceImpression } from '../../src/services/impression/imprimante';
import { Ticket, type LargeurPapier } from '../../src/services/impression/escpos';
import { ajouterEnteteBoutique } from '../../src/services/impression/recu';
import { enteteRecu, ecrireParametres, lireParametres } from '../../src/services/parametres';

const PAPIERS: Array<{ cle: LargeurPapier; libelle: string; detail: string }> = [
  { cle: '58mm', libelle: '58 mm', detail: 'Petites imprimantes de poche' },
  { cle: '80mm', libelle: '80 mm', detail: 'Imprimantes de comptoir' },
];

export default function EcranImprimante() {
  const [papier, setPapier] = useState<LargeurPapier>('58mm');
  const [appareils, setAppareils] = useState<ImprimanteTrouvee[]>([]);
  const [choisi, setChoisi] = useState<string>('');
  const [recherche, setRecherche] = useState(false);
  const [connexion, setConnexion] = useState(false);
  const [connexionId, setConnexionId] = useState<string | null>(null);
  const [impression, setImpression] = useState(false);
  const [messageRecherche, setMessageRecherche] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      (async () => {
        const p = await lireParametres();
        if (!vivant) return;
        setPapier(p.imprimantePapier === '80mm' ? '80mm' : '58mm');
        setChoisi(p.imprimanteAppareil);
      })();
      return () => {
        vivant = false;
      };
    }, []),
  );

  const chercher = useCallback(async () => {
    setRecherche(true);
    setMessageRecherche(null);
    setAppareils([]);
    try {
      const trouves = await rechercherImprimantes();
      setAppareils(trouves);
      if (trouves.length === 0) {
        setMessageRecherche(
          "Aucune imprimante trouvee. Verifiez qu'elle est allumee, que le " +
            'Bluetooth du telephone est actif, et qu elle est appairee dans les ' +
            'reglages Bluetooth d Android.',
        );
      }
    } catch (e) {
      setMessageRecherche(
        e instanceof Error ? e.message : 'La recherche Bluetooth a echoue.',
      );
    } finally {
      setRecherche(false);
    }
  }, []);

  const choisir = useCallback(
    async (appareil: ImprimanteTrouvee) => {
      if (connexion) return;
      setConnexion(true);
      setConnexionId(appareil.id);
      try {
        await connecterImprimante(appareil);
        setChoisi(appareil.id);
        await ecrireParametres({ imprimanteAppareil: appareil.id });
        Alert.alert(
          'Imprimante connectee',
          `${appareil.nom ?? 'Appareil'} est prete. Imprimez un ticket de test pour verifier.`,
        );
      } catch (e) {
        Alert.alert(
          'Connexion impossible',
          e instanceof Error
            ? e.message
            : "L'imprimante n'a pas repondu. Elle est peut-etre eteinte ou deja connectee a un autre telephone.",
        );
      } finally {
        setConnexion(false);
        setConnexionId(null);
      }
    },
    [connexion],
  );

  const changerPapier = useCallback(async (largeur: LargeurPapier) => {
    setPapier(largeur);
    await ecrireParametres({ imprimantePapier: largeur });
  }, []);

  const imprimerTest = useCallback(async () => {
    setImpression(true);
    try {
      const t = new Ticket(papier);
      // Le ticket de test doit verifier le vrai en-tete de la boutique, pas
      // seulement la liaison Bluetooth et la largeur du papier.
      ajouterEnteteBoutique(t, await enteteRecu());
      t.separateur('=');
      t.ligne('Si vous lisez cette ligne en entier,');
      t.ligne('la largeur du papier est correcte.');
      t.separateur('-');
      // Une regle graduee : si le papier est plus etroit que le reglage, la
      // ligne est coupee et le commercant le voit immediatement.
      t.ligne('1234567890'.repeat(5).slice(0, t.largeur));
      t.ligneDouble('Gauche', 'Droite');
      t.ligneLarge('TOTAL', '12 345 F');
      t.separateur('=');
      t.ligne('Accents : e a u i o c');
      t.couper();
      await serviceImpression.imprimer(t);
    } catch (e) {
      Alert.alert(
        'Impression impossible',
        e instanceof Error
          ? e.message
          : 'Choisissez d abord une imprimante dans la liste.',
      );
    } finally {
      setImpression(false);
    }
  }, [papier]);

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Imprimante' }} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <Carte titre="Largeur du papier">
          {PAPIERS.map((p) => {
            const actif = p.cle === papier;
            return (
              <Pressable
                key={p.cle}
                onPress={() => void changerPapier(p.cle)}
                style={[styles.choix, actif && styles.choixActif]}
              >
                <View style={styles.choixTexte}>
                  <Text style={[styles.choixTitre, actif && styles.choixTitreActif]}>
                    {p.libelle}
                  </Text>
                  <Text style={styles.choixDetail}>{p.detail}</Text>
                </View>
                {actif ? <Text style={styles.coche}>Choisi</Text> : null}
              </Pressable>
            );
          })}
        </Carte>

        <Carte titre="Appareil">
          <Text style={styles.aide}>
            L application cherche sur les deux types de Bluetooth. Vous n avez
            pas besoin de connaitre le modele de votre imprimante.
          </Text>

          <Bouton
            titre={recherche ? 'Recherche en cours...' : 'Rechercher les imprimantes'}
            onPress={() => void chercher()}
            enCours={recherche}
            grand
          />

          {messageRecherche ? (
            <Text style={styles.messageRecherche}>{messageRecherche}</Text>
          ) : null}

          {appareils.map((a) => {
            const actif = a.id === choisi;
            return (
              <Pressable
                key={`${a.canal}-${a.id}`}
                onPress={() => void choisir(a)}
                disabled={connexion}
                style={[styles.appareil, actif && styles.appareilActif]}
              >
                <View style={styles.choixTexte}>
                  <Text style={styles.appareilNom}>{a.nom ?? 'Appareil sans nom'}</Text>
                  <Text style={styles.appareilDetail}>
                    {a.canal === 'classic' ? 'Bluetooth Classic' : 'Bluetooth LE'}
                  </Text>
                </View>
                {connexion && connexionId === a.id ? (
                  <View style={styles.connexionEnCours}>
                    <ActivityIndicator size="small" color={couleurs.primaire} />
                    <Text style={styles.coche}>Connexion...</Text>
                  </View>
                ) : actif ? <Text style={styles.coche}>Connectee</Text> : null}
              </Pressable>
            );
          })}
        </Carte>

        <Carte titre="Verification">
          <Text style={styles.aide}>
            Le ticket de test imprime une regle graduee. Si elle est coupee, la
            largeur de papier choisie ne correspond pas a votre imprimante.
          </Text>
          <Bouton
            titre="Imprimer un ticket de test"
            onPress={() => void imprimerTest()}
            enCours={impression}
            variante="secondaire"
          />
        </Carte>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.l, paddingBottom: espaces.xxl, gap: espaces.m },

  aide: { fontSize: 13, color: couleurs.texteFaible, marginBottom: espaces.m },

  choix: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
    marginBottom: espaces.s,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  choixActif: { borderColor: couleurs.primaire, backgroundColor: couleurs.primaireDouce },
  choixTexte: { flex: 1, marginRight: espaces.s },
  choixTitre: { fontSize: 16, fontWeight: '600', color: couleurs.texte },
  choixTitreActif: { color: couleurs.primaire },
  choixDetail: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  coche: { fontSize: 12, fontWeight: '700', color: couleurs.primaire },

  messageRecherche: {
    fontSize: 13,
    color: couleurs.avertissement,
    marginTop: espaces.m,
    lineHeight: 18,
  },

  appareil: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
    marginTop: espaces.s,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  appareilActif: { borderColor: couleurs.primaire, backgroundColor: couleurs.primaireDouce },
  appareilNom: { fontSize: 15, fontWeight: '600', color: couleurs.texte },
  appareilDetail: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  connexionEnCours: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
