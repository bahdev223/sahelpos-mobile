/**
 * Fiche client : coordonnees, ardoise et historique d'achats.
 *
 * L'ardoise (le reste du) est la premiere chose affichee, en gros : c'est ce
 * que le commercant vient verifier quand un client se presente au comptoir.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as SelecteurImage from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import {
  Bouton,
  Carte,
  Champ,
  Chargement,
  Erreur,
  Montant,
  Vignette,
  couleurs,
  espaces,
  formaterMontant,
  rayons,
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

const DOSSIER_CLIENTS = 'clients';

function dateCourte(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function nouvelleCle(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function rangerPhotoClient(uriSource: string): Promise<string> {
  const dossier = new Directory(Paths.document, DOSSIER_CLIENTS);
  if (!dossier.exists) dossier.create({ intermediates: true });
  const nomFichier = `${nouvelleCle()}.jpg`;
  const destination = new File(dossier, nomFichier);
  await new File(uriSource).copy(destination);
  return `${DOSSIER_CLIENTS}/${nomFichier}`;
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
  const [cheminPhoto, setCheminPhoto] = useState<string | null>(null);
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
      setCheminPhoto(c.cheminPhoto);
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
      await modifierClient(clientId, { nom, telephone, adresse, cheminPhoto });
      setModifie(false);
      await charger();
    } catch (e) {
      Alert.alert('Enregistrement impossible', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setEnCours(false);
    }
  }, [clientId, nom, telephone, adresse, cheminPhoto, charger]);

  const choisirPhoto = useCallback(async () => {
    const permission = await SelecteurImage.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Acces aux photos', "Autorisez l'acces aux photos pour choisir le profil du client.");
      return;
    }
    const resultat = await SelecteurImage.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.72,
    });
    if (resultat.canceled || !resultat.assets?.[0]) return;
    setCheminPhoto(await rangerPhotoClient(resultat.assets[0].uri));
  }, []);

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
        <View style={styles.resumeClient}>
          <Vignette chemin={cheminPhoto} nom={client.nom} taille={82} />
          <View style={styles.resumeTexte}>
            <Text style={styles.resumeNom}>{client.nom}</Text>
            {client.telephone ? <Text style={styles.resumeMeta}>{client.telephone}</Text> : null}
            {client.adresse ? <Text style={styles.resumeMeta}>{client.adresse}</Text> : null}
          </View>
        </View>

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
              <Pressable onPress={() => void choisirPhoto()} style={styles.photoClient}>
                <Vignette chemin={cheminPhoto} nom={nom} taille={68} />
                <View style={styles.photoTexteBloc}>
                  <Text style={styles.photoTitre}>Photo ou logo</Text>
                  <Text style={styles.photoTexte}>Optionnel, visible dans la fiche et la liste.</Text>
                </View>
              </Pressable>
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
                    setCheminPhoto(client.cheminPhoto);
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

  resumeClient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    padding: espaces.l,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.l,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  resumeTexte: { flex: 1 },
  resumeNom: { fontSize: 20, fontWeight: '800', color: couleurs.texte },
  resumeMeta: { fontSize: 13, color: couleurs.texteFaible, marginTop: 3 },

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
  photoClient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    padding: espaces.s,
    marginBottom: espaces.s,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.m,
    backgroundColor: couleurs.surfaceDouce,
  },
  photoTexteBloc: { flex: 1 },
  photoTitre: { fontSize: 15, fontWeight: '700', color: couleurs.texte },
  photoTexte: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },

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
