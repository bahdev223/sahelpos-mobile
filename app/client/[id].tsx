/**
 * Fiche client : coordonnees, ardoise et historique d'achats.
 *
 * L'ardoise (le reste du) est la premiere chose affichee, en gros : c'est ce
 * que le commercant vient verifier quand un client se presente au comptoir.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import {
  Bouton,
  Carte,
  Champ,
  Chargement,
  Erreur,
  Montant,
  couleurs,
  espaces,
  formaterMontant,
} from '../../src/ui/components';
import {
  calculerSolde,
  listerVentesClient,
  modifierClient,
  obtenirClient,
  supprimerClient,
  type SoldeClient,
  type VenteClient,
} from '../../src/db/repositories/client';
import type { Client } from '../../src/domain/types';

function dateCourte(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function EcranFicheClient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const clientId = Number(id);

  const [client, setClient] = useState<Client | null>(null);
  const [solde, setSolde] = useState<SoldeClient | null>(null);
  const [ventes, setVentes] = useState<VenteClient[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [modifie, setModifie] = useState(false);
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [adresse, setAdresse] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const c = await obtenirClient(clientId);
      if (!c) {
        setErreur('Ce client est introuvable.');
        return;
      }
      setClient(c);
      setNom(c.nom);
      setTelephone(c.telephone ?? '');
      setAdresse(c.adresse ?? '');
      const [s, v] = await Promise.all([
        calculerSolde(clientId),
        listerVentesClient(clientId),
      ]);
      setSolde(s);
      setVentes(v);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture du client impossible.');
    } finally {
      setChargement(false);
    }
  }, [clientId]);

  useFocusEffect(
    useCallback(() => {
      setChargement(true);
      charger();
    }, [charger]),
  );

  const enregistrer = useCallback(async () => {
    if (!nom.trim()) {
      Alert.alert('Nom manquant', 'Le nom du client est obligatoire.');
      return;
    }
    setEnCours(true);
    try {
      await modifierClient(clientId, { nom, telephone, adresse });
      setModifie(false);
      await charger();
    } catch (e) {
      Alert.alert('Enregistrement impossible', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setEnCours(false);
    }
  }, [clientId, nom, telephone, adresse, charger]);

  const demanderSuppression = useCallback(() => {
    Alert.alert(
      'Supprimer ce client ?',
      'Cette operation ne peut pas etre defaite.',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setEnCours(true);
            try {
              const supprime = await supprimerClient(clientId);
              if (supprime) {
                router.back();
              } else {
                // Le depot refuse : detacher des ventes de leur acheteur
                // rendrait l'ardoise introuvable.
                Alert.alert(
                  'Suppression refusee',
                  'Ce client a des ventes enregistrees. Il ne peut pas etre supprime sans rendre son historique orphelin.',
                );
              }
            } catch (e) {
              Alert.alert('Erreur', e instanceof Error ? e.message : 'Erreur inconnue.');
            } finally {
              setEnCours(false);
            }
          },
        },
      ],
    );
  }, [clientId, router]);

  if (chargement) return <Chargement message="Lecture de la fiche..." />;
  if (erreur || !client) {
    return (
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: 'Client' }} />
        <Erreur
          message={erreur ?? 'Client introuvable.'}
          onReessayer={() => {
            setChargement(true);
            charger();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: client.nom }} />
      <ScrollView contentContainerStyle={styles.contenu}>
        {solde ? (
          <Carte>
            <Text style={styles.ardoiseLibelle}>
              {solde.resteDu > 0 ? 'Ce client vous doit' : 'Ce client est a jour'}
            </Text>
            <Montant
              valeur={solde.resteDu}
              taille="grand"
              couleur={solde.resteDu > 0 ? couleurs.danger : couleurs.primaire}
            />
            <View style={styles.soldeDetail}>
              <Text style={styles.soldeTexte}>
                {solde.nbVentes} achat{solde.nbVentes > 1 ? 's' : ''} pour{' '}
                {formaterMontant(solde.totalAchete)}
              </Text>
              <Text style={styles.soldeTexte}>
                Deja regle : {formaterMontant(solde.totalPaye)}
              </Text>
            </View>
          </Carte>
        ) : null}

        <Carte titre="Coordonnees">
          {modifie ? (
            <>
              <Champ valeur={nom} onChangeText={setNom} label="Nom" />
              <Champ
                valeur={telephone}
                onChangeText={setTelephone}
                label="Telephone"
                clavier="phone-pad"
              />
              <Champ valeur={adresse} onChangeText={setAdresse} label="Adresse" />
              <View style={styles.actionsEnLigne}>
                <Bouton
                  titre="Annuler"
                  onPress={() => {
                    setNom(client.nom);
                    setTelephone(client.telephone ?? '');
                    setAdresse(client.adresse ?? '');
                    setModifie(false);
                  }}
                  variante="secondaire"
                />
                <Bouton titre="Enregistrer" onPress={() => void enregistrer()} enCours={enCours} />
              </View>
            </>
          ) : (
            <>
              <Ligne libelle="Nom" valeur={client.nom} />
              <Ligne libelle="Telephone" valeur={client.telephone ?? '-'} />
              <Ligne libelle="Adresse" valeur={client.adresse ?? '-'} />
              <Bouton
                titre="Modifier"
                onPress={() => setModifie(true)}
                variante="secondaire"
                style={styles.boutonModifier}
              />
            </>
          )}
        </Carte>

        <Carte titre={`Historique (${ventes.length})`}>
          {ventes.length === 0 ? (
            <Text style={styles.vide}>Aucun achat enregistre pour ce client.</Text>
          ) : (
            ventes.map((v) => {
              const reste = Math.max(0, v.total - v.montantPaye);
              return (
                <Pressable
                  key={v.id}
                  onPress={() => router.push(`/vente/${v.id}`)}
                  style={({ pressed }) => [
                    styles.venteLigne,
                    pressed && styles.ventePressee,
                  ]}
                >
                  <View style={styles.venteGauche}>
                    <Text style={styles.venteNumero}>{v.numero}</Text>
                    <Text style={styles.venteDate}>{dateCourte(v.dateVente)}</Text>
                  </View>
                  <View style={styles.venteDroite}>
                    <Text style={styles.venteTotal}>{formaterMontant(v.total)}</Text>
                    {reste > 0 ? (
                      <Text style={styles.venteReste}>
                        reste {formaterMontant(reste)}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </Carte>

        <Bouton
          titre="Supprimer ce client"
          onPress={demanderSuppression}
          variante="danger"
          desactive={enCours}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={styles.infoLigne}>
      <Text style={styles.infoLibelle}>{libelle}</Text>
      <Text style={styles.infoValeur}>{valeur}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.l, paddingBottom: espaces.xxl, gap: espaces.m },

  ardoiseLibelle: { fontSize: 13, color: couleurs.texteFaible, marginBottom: 4 },
  soldeDetail: { marginTop: espaces.s, gap: 2 },
  soldeTexte: { fontSize: 13, color: couleurs.texteFaible },

  infoLigne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: espaces.s,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  infoLibelle: { fontSize: 14, color: couleurs.texteFaible },
  infoValeur: { fontSize: 14, fontWeight: '600', color: couleurs.texte, flexShrink: 1 },
  boutonModifier: { marginTop: espaces.m },
  actionsEnLigne: { flexDirection: 'row', gap: espaces.s, marginTop: espaces.s },

  vide: { fontSize: 14, color: couleurs.texteFaible, paddingVertical: espaces.s },
  venteLigne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: espaces.s,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  ventePressee: { opacity: 0.6 },
  venteGauche: { flex: 1 },
  venteDroite: { alignItems: 'flex-end' },
  venteNumero: { fontSize: 14, fontWeight: '600', color: couleurs.texte },
  venteDate: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  venteTotal: { fontSize: 14, fontWeight: '600', color: couleurs.texte },
  venteReste: { fontSize: 12, color: couleurs.danger, marginTop: 2 },
});
