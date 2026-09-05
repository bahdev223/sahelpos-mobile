/**
 * Comptes utilisateurs.
 *
 * Chaque vendeur a son compte : c'est ce qui permet de savoir qui a encaisse
 * quoi. Sans cela, un ecart de caisse en fin de journee n'est imputable a
 * personne.
 */
import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';

import {
  Bouton,
  Carte,
  Champ,
  Chargement,
  Erreur,
  couleurs,
  espaces,
  rayons,
} from '../../src/ui/components';
import {
  creerUtilisateur,
  desactiverUtilisateur,
  listerUtilisateurs,
  modifierUtilisateur,
} from '../../src/services/auth';
import type { Role, Utilisateur } from '../../src/domain/types';

const ROLES: Array<{ cle: Role; libelle: string; detail: string }> = [
  { cle: 'admin', libelle: 'Administrateur', detail: 'Acces complet, y compris les reglages' },
  { cle: 'gerant', libelle: 'Gerant', detail: 'Ventes, stock, achats, rapports' },
  { cle: 'vendeur', libelle: 'Vendeur', detail: 'Vente et clients uniquement' },
];

const LIBELLE_ROLE: Record<Role, string> = {
  admin: 'Administrateur',
  gerant: 'Gerant',
  vendeur: 'Vendeur',
};

export default function EcranUtilisateurs() {
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [ouvert, setOuvert] = useState(false);
  const [login, setLogin] = useState('');
  const [nom, setNom] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<Role>('vendeur');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setUtilisateurs(await listerUtilisateurs());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture des comptes impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger]),
  );

  const creer = useCallback(async () => {
    setEnCours(true);
    try {
      await creerUtilisateur({ login, nom, pin, role });
      setLogin('');
      setNom('');
      setPin('');
      setRole('vendeur');
      setOuvert(false);
      await charger();
    } catch (e) {
      Alert.alert('Creation impossible', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setEnCours(false);
    }
  }, [login, nom, pin, role, charger]);

  const basculerActif = useCallback(
    async (u: Utilisateur) => {
      try {
        if (u.actif) {
          // Le service refuse de desactiver le dernier administrateur : sans
          // lui, plus personne ne peut creer de compte.
          await desactiverUtilisateur(u.id);
        } else {
          await modifierUtilisateur(u.id, { actif: true });
        }
        await charger();
      } catch (e) {
        Alert.alert('Operation refusee', e instanceof Error ? e.message : 'Erreur.');
      }
    },
    [charger],
  );

  const changerCode = useCallback(
    (u: Utilisateur) => {
      Alert.prompt?.(
        `Nouveau code pour ${u.login}`,
        'Entre 4 et 8 chiffres.',
        async (saisie) => {
          try {
            await modifierUtilisateur(u.id, { pin: saisie });
            Alert.alert('Code change', `Le code de ${u.login} a ete mis a jour.`);
          } catch (e) {
            Alert.alert('Code refuse', e instanceof Error ? e.message : 'Erreur.');
          }
        },
        'plain-text',
      );
      // Alert.prompt n'existe que sur iOS. Sur Android, on oriente vers une
      // action possible plutot que de laisser un bouton sans effet.
      if (!Alert.prompt) {
        Alert.alert(
          'Changer le code',
          `Pour changer le code de ${u.login}, supprimez ce compte et recreez-le avec un nouveau code.`,
        );
      }
    },
    [],
  );

  if (chargement) return <Chargement message="Lecture des comptes..." />;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Utilisateurs' }} />
      <ScrollView contentContainerStyle={styles.contenu}>
        {erreur ? <Erreur message={erreur} onReessayer={charger} /> : null}

        <Carte titre={`Comptes (${utilisateurs.length})`}>
          {utilisateurs.map((u) => (
            <View key={u.id} style={styles.ligne}>
              <View style={styles.ligneGauche}>
                <Text style={[styles.nom, !u.actif && styles.nomInactif]}>
                  {u.nom || u.login}
                </Text>
                <Text style={styles.detail}>
                  {u.login} · {LIBELLE_ROLE[u.role]}
                  {u.actif ? '' : ' · desactive'}
                </Text>
              </View>
              <View style={styles.ligneActions}>
                <Pressable onPress={() => changerCode(u)} style={styles.action}>
                  <Text style={styles.actionTexte}>Code</Text>
                </Pressable>
                <Pressable onPress={() => void basculerActif(u)} style={styles.action}>
                  <Text
                    style={[
                      styles.actionTexte,
                      u.actif ? styles.actionDanger : styles.actionPrimaire,
                    ]}
                  >
                    {u.actif ? 'Desactiver' : 'Activer'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </Carte>

        <Bouton titre="Ajouter un compte" onPress={() => setOuvert(true)} grand />
      </ScrollView>

      <Modal visible={ouvert} animationType="slide" transparent onRequestClose={() => setOuvert(false)}>
        <View style={styles.voile}>
          <ScrollView contentContainerStyle={styles.feuille}>
            <Text style={styles.feuilleTitre}>Nouveau compte</Text>
            <Champ valeur={login} onChangeText={setLogin} label="Identifiant" autoFocus />
            <Champ valeur={nom} onChangeText={setNom} label="Nom complet" placeholder="Facultatif" />
            <Champ
              valeur={pin}
              onChangeText={setPin}
              label="Code"
              clavier="number-pad"
              secret
              aide="4 a 8 chiffres. Un code court se tape vite en caisse."
            />

            <Text style={styles.sousTitre}>Role</Text>
            {ROLES.map((r) => {
              const actif = r.cle === role;
              return (
                <Pressable
                  key={r.cle}
                  onPress={() => setRole(r.cle)}
                  style={[styles.choix, actif && styles.choixActif]}
                >
                  <View style={styles.choixTexte}>
                    <Text style={[styles.choixTitre, actif && styles.choixTitreActif]}>
                      {r.libelle}
                    </Text>
                    <Text style={styles.choixDetail}>{r.detail}</Text>
                  </View>
                </Pressable>
              );
            })}

            <View style={styles.feuilleActions}>
              <Bouton titre="Annuler" onPress={() => setOuvert(false)} variante="secondaire" />
              <Bouton titre="Creer" onPress={() => void creer()} enCours={enCours} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.l, paddingBottom: espaces.xxl, gap: espaces.m },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingVertical: espaces.s,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  ligneGauche: { flex: 1, marginRight: espaces.s },
  nom: { fontSize: 15, fontWeight: '600', color: couleurs.texte },
  nomInactif: { color: couleurs.texteFaible },
  detail: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  ligneActions: { flexDirection: 'row', gap: espaces.s },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: espaces.s },
  actionTexte: { fontSize: 13, fontWeight: '600', color: couleurs.texteFaible },
  actionDanger: { color: couleurs.danger },
  actionPrimaire: { color: couleurs.primaire },

  voile: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  feuille: {
    backgroundColor: couleurs.surface,
    borderTopLeftRadius: rayons.l,
    borderTopRightRadius: rayons.l,
    padding: espaces.l,
    gap: espaces.s,
  },
  feuilleTitre: { fontSize: 18, fontWeight: '700', color: couleurs.texte },
  sousTitre: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.texteFaible,
    marginTop: espaces.s,
  },
  choix: {
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  choixActif: { borderColor: couleurs.primaire, backgroundColor: couleurs.primaireDouce },
  choixTexte: { flex: 1 },
  choixTitre: { fontSize: 15, fontWeight: '600', color: couleurs.texte },
  choixTitreActif: { color: couleurs.primaire },
  choixDetail: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  feuilleActions: { flexDirection: 'row', gap: espaces.s, marginTop: espaces.m },
});
