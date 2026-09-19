/**
 * Comptes utilisateurs.
 *
 * Chaque vendeur a son compte : c'est ce qui permet de savoir qui a encaisse
 * quoi. Sans cela, un ecart de caisse en fin de journee n'est imputable a
 * personne.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

const HEURES_CAISSE = Array.from({ length: 48 }, (_, index) => {
  const heure = Math.floor(index / 2);
  const minute = index % 2 === 0 ? '00' : '30';
  return `${String(heure).padStart(2, '0')}:${minute}`;
});

export default function EcranUtilisateurs() {
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [ouvert, setOuvert] = useState(false);
  const [login, setLogin] = useState('');
  const [nom, setNom] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<Role>('vendeur');
  const [caisseOuvreA, setCaisseOuvreA] = useState('');
  const [caisseFermeA, setCaisseFermeA] = useState('');
  const [selecteur, setSelecteur] = useState<'role' | 'ouverture' | 'fermeture' | null>(null);
  const [enCours, setEnCours] = useState(false);

  const roleChoisi = ROLES.find((r) => r.cle === role) ?? ROLES[2];

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
      const ouverture = role === 'vendeur' ? caisseOuvreA : '';
      const fermeture = role === 'vendeur' ? caisseFermeA : '';
      if ((ouverture || fermeture) && (!/^\d{2}:\d{2}$/.test(ouverture) || !/^\d{2}:\d{2}$/.test(fermeture))) {
        throw new Error("Indiquez les deux horaires au format 08:00.");
      }
      await creerUtilisateur({
        login, nom, pin, role,
        caisseOuvreA: ouverture || null,
        caisseFermeA: fermeture || null,
      });
      setLogin('');
      setNom('');
      setPin('');
      setRole('vendeur');
      setCaisseOuvreA('');
      setCaisseFermeA('');
      setSelecteur(null);
      setOuvert(false);
      await charger();
    } catch (e) {
      Alert.alert('Creation impossible', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setEnCours(false);
    }
  }, [caisseFermeA, caisseOuvreA, login, nom, pin, role, charger]);

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
                {u.caisseOuvreA && u.caisseFermeA ? (
                  <Text style={styles.horaire}>Caisse : {u.caisseOuvreA} - {u.caisseFermeA}</Text>
                ) : null}
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

        <Bouton
          titre="Ajouter un compte"
          onPress={() => {
            setSelecteur(null);
            setOuvert(true);
          }}
          grand
        />
      </ScrollView>

      {ouvert ? (
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
            <Pressable
              onPress={() => setSelecteur(selecteur === 'role' ? null : 'role')}
              style={styles.selecteur}
            >
              <View style={styles.choixTexte}>
                <Text style={styles.choixTitre}>{roleChoisi.libelle}</Text>
                <Text style={styles.choixDetail}>{roleChoisi.detail}</Text>
              </View>
              <Text style={styles.chevron}>v</Text>
            </Pressable>
            {selecteur === 'role' ? (
              <View style={styles.menu}>
                {ROLES.map((r) => {
                  const actif = r.cle === role;
                  return (
                    <Pressable
                      key={r.cle}
                      onPress={() => {
                        setRole(r.cle);
                        setSelecteur(null);
                      }}
                      style={[styles.option, actif && styles.optionActive]}
                    >
                      <Text style={[styles.optionTitre, actif && styles.optionTitreActive]}>
                        {r.libelle}
                      </Text>
                      <Text style={styles.choixDetail}>{r.detail}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {role === 'vendeur' ? (
              <View style={styles.horaires}>
                <Pressable
                  style={styles.champHoraire}
                  onPress={() => setSelecteur(selecteur === 'ouverture' ? null : 'ouverture')}
                >
                  <Text style={styles.labelHoraire}>Caisse ouverte a</Text>
                  <Text style={styles.valeurHoraire}>{caisseOuvreA || 'Choisir'}</Text>
                </Pressable>
                <Pressable
                  style={styles.champHoraire}
                  onPress={() => setSelecteur(selecteur === 'fermeture' ? null : 'fermeture')}
                >
                  <Text style={styles.labelHoraire}>Caisse ferme a</Text>
                  <Text style={styles.valeurHoraire}>{caisseFermeA || 'Choisir'}</Text>
                </Pressable>
              </View>
            ) : null}

            {selecteur === 'ouverture' || selecteur === 'fermeture' ? (
              <View style={styles.menuTemps}>
                <ScrollView nestedScrollEnabled style={styles.menuTempsListe}>
                  {HEURES_CAISSE.map((heure) => {
                    const actif = heure === (selecteur === 'ouverture' ? caisseOuvreA : caisseFermeA);
                    return (
                      <Pressable
                        key={heure}
                        onPress={() => {
                          if (selecteur === 'ouverture') setCaisseOuvreA(heure);
                          if (selecteur === 'fermeture') setCaisseFermeA(heure);
                          setSelecteur(null);
                        }}
                        style={[styles.optionTemps, actif && styles.optionActive]}
                      >
                        <Text style={[styles.optionTitre, actif && styles.optionTitreActive]}>
                          {heure}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.feuilleActions}>
              <Bouton
                titre="Annuler"
                onPress={() => {
                  setSelecteur(null);
                  setOuvert(false);
                }}
                variante="secondaire"
              />
              <Bouton titre="Creer" onPress={() => void creer()} enCours={enCours} />
            </View>
          </ScrollView>
        </View>
      ) : null}
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
  horaire: { fontSize: 12, color: couleurs.primaire, marginTop: 3 },
  ligneActions: { flexDirection: 'row', gap: espaces.s },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: espaces.s },
  actionTexte: { fontSize: 13, fontWeight: '600', color: couleurs.texteFaible },
  actionDanger: { color: couleurs.danger },
  actionPrimaire: { color: couleurs.primaire },

  voile: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  feuille: {
    backgroundColor: couleurs.surface,
    borderTopLeftRadius: rayons.l,
    borderTopRightRadius: rayons.l,
    padding: espaces.l,
    gap: espaces.s,
    maxHeight: '92%',
  },
  feuilleTitre: { fontSize: 18, fontWeight: '700', color: couleurs.texte },
  sousTitre: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.texteFaible,
    marginTop: espaces.s,
  },
  selecteur: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
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
  chevron: { color: couleurs.texteFaible, fontSize: 14, fontWeight: '700' },
  menu: {
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  optionActive: { backgroundColor: couleurs.primaireDouce },
  optionTitre: { color: couleurs.texte, fontSize: 14, fontWeight: '600' },
  optionTitreActive: { color: couleurs.primaire },
  horaires: { flexDirection: 'row', gap: espaces.s },
  champHoraire: {
    flex: 1,
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: espaces.m,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  labelHoraire: { color: couleurs.texteFaible, fontSize: 12, fontWeight: '600' },
  valeurHoraire: { color: couleurs.texte, fontSize: 16, fontWeight: '700', marginTop: 4 },
  menuTemps: {
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    overflow: 'hidden',
  },
  menuTempsListe: { maxHeight: 180 },
  optionTemps: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: espaces.m,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  feuilleActions: { flexDirection: 'row', gap: espaces.s, marginTop: espaces.m },
});
