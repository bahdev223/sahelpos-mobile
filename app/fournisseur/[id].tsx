/**
 * Fiche fournisseur : coordonnees, dette et historique des achats.
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
  calculerSoldeFournisseur,
  modifierFournisseur,
  obtenirFournisseur,
  supprimerFournisseur,
  type Fournisseur,
  type SoldeFournisseur,
} from '../../src/db/repositories/fournisseur';
import { listerAchats, type AchatResume } from '../../src/services/achat';

function dateCourte(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function EcranFicheFournisseur() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const fournisseurId = Number(id);

  const [fournisseur, setFournisseur] = useState<Fournisseur | null>(null);
  const [solde, setSolde] = useState<SoldeFournisseur | null>(null);
  const [achats, setAchats] = useState<AchatResume[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [modifie, setModifie] = useState(false);
  const [nom, setNom] = useState('');
  const [contact, setContact] = useState('');
  const [telephone, setTelephone] = useState('');
  const [adresse, setAdresse] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const f = await obtenirFournisseur(fournisseurId);
      if (!f) {
        setErreur('Ce fournisseur est introuvable.');
        return;
      }
      setFournisseur(f);
      setNom(f.nom);
      setContact(f.contact ?? '');
      setTelephone(f.telephone ?? '');
      setAdresse(f.adresse ?? '');
      const [s, a] = await Promise.all([
        calculerSoldeFournisseur(fournisseurId),
        listerAchats({ fournisseurId, limite: 100 }),
      ]);
      setSolde(s);
      setAchats(a);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture du fournisseur impossible.');
    } finally {
      setChargement(false);
    }
  }, [fournisseurId]);

  useFocusEffect(
    useCallback(() => {
      setChargement(true);
      charger();
    }, [charger]),
  );

  const enregistrer = useCallback(async () => {
    if (!nom.trim()) {
      Alert.alert('Nom manquant', 'Le nom du fournisseur est obligatoire.');
      return;
    }
    setEnCours(true);
    try {
      await modifierFournisseur(fournisseurId, { nom, contact, telephone, adresse });
      setModifie(false);
      await charger();
    } catch (e) {
      Alert.alert('Enregistrement impossible', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setEnCours(false);
    }
  }, [fournisseurId, nom, contact, telephone, adresse, charger]);

  const demanderSuppression = useCallback(() => {
    Alert.alert('Supprimer ce fournisseur ?', 'Cette operation ne peut pas etre defaite.', [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setEnCours(true);
          try {
            const supprime = await supprimerFournisseur(fournisseurId);
            if (supprime) {
              router.back();
            } else {
              Alert.alert(
                'Suppression refusee',
                'Ce fournisseur a des achats enregistres. Le supprimer rendrait ces achats orphelins et la dette introuvable.',
              );
            }
          } catch (e) {
            Alert.alert('Erreur', e instanceof Error ? e.message : 'Erreur inconnue.');
          } finally {
            setEnCours(false);
          }
        },
      },
    ]);
  }, [fournisseurId, router]);

  if (chargement) return <Chargement message="Lecture de la fiche..." />;
  if (erreur || !fournisseur) {
    return (
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: 'Fournisseur' }} />
        <Erreur
          message={erreur ?? 'Fournisseur introuvable.'}
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
      <Stack.Screen options={{ headerShown: true, title: fournisseur.nom }} />
      <ScrollView contentContainerStyle={styles.contenu}>
        {solde ? (
          <Carte>
            <Text style={styles.detteLibelle}>
              {solde.resteDu > 0 ? 'Vous devez a ce fournisseur' : 'Vous etes a jour'}
            </Text>
            <Montant
              valeur={solde.resteDu}
              taille="grand"
              couleur={solde.resteDu > 0 ? couleurs.danger : couleurs.primaire}
            />
            <View style={styles.soldeDetail}>
              <Text style={styles.soldeTexte}>
                {solde.nbAchats} achat{solde.nbAchats > 1 ? 's' : ''} pour{' '}
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
                valeur={contact}
                onChangeText={setContact}
                label="Personne a contacter"
                placeholder="Facultatif"
              />
              <Champ
                valeur={telephone}
                onChangeText={setTelephone}
                label="Telephone"
                clavier="phone-pad"
              />
              <Champ
                valeur={adresse}
                onChangeText={setAdresse}
                label="Adresse"
                placeholder="Elle figure sur le bon de commande"
              />
              <View style={styles.actionsEnLigne}>
                <Bouton
                  titre="Annuler"
                  onPress={() => {
                    setNom(fournisseur.nom);
                    setContact(fournisseur.contact ?? '');
                    setTelephone(fournisseur.telephone ?? '');
                    setAdresse(fournisseur.adresse ?? '');
                    setModifie(false);
                  }}
                  variante="secondaire"
                />
                <Bouton titre="Enregistrer" onPress={() => void enregistrer()} enCours={enCours} />
              </View>
            </>
          ) : (
            <>
              <Ligne libelle="Nom" valeur={fournisseur.nom} />
              <Ligne libelle="Contact" valeur={fournisseur.contact ?? '-'} />
              <Ligne libelle="Telephone" valeur={fournisseur.telephone ?? '-'} />
              <Bouton
                titre="Modifier"
                onPress={() => setModifie(true)}
                variante="secondaire"
                style={styles.boutonModifier}
              />
            </>
          )}
        </Carte>

        <Carte titre={`Achats (${achats.length})`}>
          {achats.length === 0 ? (
            <Text style={styles.vide}>Aucun achat aupres de ce fournisseur.</Text>
          ) : (
            achats.map((a) => {
              const reste = Math.max(0, a.total - a.montantPaye);
              return (
                <Pressable
                  key={a.id}
                  onPress={() => router.push(`/achats/${a.id}`)}
                  style={({ pressed }) => [styles.achatLigne, pressed && styles.achatPresse]}
                >
                  <View style={styles.achatGauche}>
                    <Text style={styles.achatNumero}>{a.numero}</Text>
                    <Text style={styles.achatDate}>{dateCourte(a.dateAchat)}</Text>
                  </View>
                  <View style={styles.achatDroite}>
                    <Text style={styles.achatTotal}>{formaterMontant(a.total)}</Text>
                    {reste > 0 && a.statut !== 'ANNULE' ? (
                      <Text style={styles.achatReste}>reste {formaterMontant(reste)}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </Carte>

        <Bouton
          titre="Supprimer ce fournisseur"
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

  detteLibelle: { fontSize: 13, color: couleurs.texteFaible, marginBottom: 4 },
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
  achatLigne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: espaces.s,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  achatPresse: { opacity: 0.6 },
  achatGauche: { flex: 1 },
  achatDroite: { alignItems: 'flex-end' },
  achatNumero: { fontSize: 14, fontWeight: '600', color: couleurs.texte },
  achatDate: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  achatTotal: { fontSize: 14, fontWeight: '600', color: couleurs.texte },
  achatReste: { fontSize: 12, color: couleurs.danger, marginTop: 2 },
});
