/**
 * Categories de produits.
 *
 * Il n'y a pas de table "categorie" : la categorie est un texte porte par
 * chaque produit. C'est volontaire — un commercant en cree deux ou trois et n'a
 * aucune envie de gerer un referentiel. Renommer une categorie revient donc a
 * mettre a jour tous les produits qui la portent.
 */
import { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';

import {
  Bouton,
  Champ,
  Chargement,
  Erreur,
  ListeVide,
  couleurs,
  espaces,
  rayons,
} from '../src/ui/components';
import { listerCategories } from '../src/db/repositories/produit';
import { executer, lireTout } from '../src/db/repositories/base';

interface CategorieAffichee {
  nom: string;
  nbProduits: number;
}

export default function EcranCategories() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategorieAffichee[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [ancienNom, setAncienNom] = useState<string | null>(null);
  const [nouveauNom, setNouveauNom] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const noms = await listerCategories();
      const comptes = await lireTout<{ categorie: string; n: number }>(
        `SELECT categorie, COUNT(*) AS n FROM produit
         WHERE categorie IS NOT NULL AND categorie <> ''
         GROUP BY categorie`,
      );
      const parNom = new Map(comptes.map((c) => [c.categorie, c.n]));
      setCategories(noms.map((nom) => ({ nom, nbProduits: parNom.get(nom) ?? 0 })));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture des categories impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger]),
  );

  const renommer = useCallback(async () => {
    const cible = nouveauNom.trim();
    if (!ancienNom || !cible) {
      Alert.alert('Nom manquant', 'Saisissez le nouveau nom de la categorie.');
      return;
    }
    setEnCours(true);
    try {
      // Renommer vers une categorie existante revient a fusionner les deux.
      // C'est le comportement attendu : le commercant qui corrige "Elec" en
      // "Electricite" veut que tout se retrouve au meme endroit.
      await executer(
        'UPDATE produit SET categorie = ? WHERE categorie = ?',
        cible,
        ancienNom,
      );
      setAncienNom(null);
      setNouveauNom('');
      await charger();
    } catch (e) {
      Alert.alert('Renommage impossible', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setEnCours(false);
    }
  }, [ancienNom, nouveauNom, charger]);

  const vider = useCallback(
    (categorie: CategorieAffichee) => {
      Alert.alert(
        `Retirer "${categorie.nom}" ?`,
        `${categorie.nbProduits} produit(s) resteront, mais sans categorie. Aucun produit n'est supprime.`,
        [
          { text: 'Non', style: 'cancel' },
          {
            text: 'Retirer',
            style: 'destructive',
            onPress: async () => {
              try {
                await executer(
                  'UPDATE produit SET categorie = NULL WHERE categorie = ?',
                  categorie.nom,
                );
                await charger();
              } catch (e) {
                Alert.alert('Erreur', e instanceof Error ? e.message : 'Erreur inconnue.');
              }
            },
          },
        ],
      );
    },
    [charger],
  );

  if (chargement) return <Chargement message="Lecture des categories..." />;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Categories' }} />

      {erreur ? (
        <Erreur message={erreur} onReessayer={charger} />
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(c) => c.nom}
          contentContainerStyle={
            categories.length === 0 ? styles.videConteneur : styles.liste
          }
          ListHeaderComponent={
            categories.length > 0 ? (
              <Text style={styles.aide}>
                Une categorie se cree en la saisissant sur une fiche produit.
                Ici, vous pouvez la renommer ou la retirer.
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <ListeVide
              titre="Aucune categorie"
              message="Les categories apparaissent des que vous en saisissez une sur une fiche produit."
              actionTitre="Aller au catalogue"
              onAction={() => router.push('/catalogue')}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.ligne}>
              <View style={styles.ligneGauche}>
                <Text style={styles.nom}>{item.nom}</Text>
                <Text style={styles.compte}>
                  {item.nbProduits} produit{item.nbProduits > 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => {
                    setAncienNom(item.nom);
                    setNouveauNom(item.nom);
                  }}
                  style={styles.action}
                >
                  <Text style={styles.actionTexte}>Renommer</Text>
                </Pressable>
                <Pressable onPress={() => vider(item)} style={styles.action}>
                  <Text style={[styles.actionTexte, styles.actionDanger]}>Retirer</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Modal
        visible={ancienNom !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setAncienNom(null)}
      >
        <View style={styles.voile}>
          <View style={styles.feuille}>
            <Text style={styles.feuilleTitre}>Renommer la categorie</Text>
            <Champ
              valeur={nouveauNom}
              onChangeText={setNouveauNom}
              label="Nouveau nom"
              autoFocus
              aide="Si ce nom existe deja, les deux categories fusionnent."
            />
            <View style={styles.feuilleActions}>
              <Bouton
                titre="Annuler"
                onPress={() => setAncienNom(null)}
                variante="secondaire"
              />
              <Bouton titre="Renommer" onPress={() => void renommer()} enCours={enCours} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  liste: { padding: espaces.l },
  videConteneur: { flexGrow: 1, justifyContent: 'center' },
  aide: {
    fontSize: 13,
    color: couleurs.texteFaible,
    marginBottom: espaces.m,
    lineHeight: 18,
  },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.s,
    marginBottom: espaces.s,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  ligneGauche: { flex: 1, marginRight: espaces.s },
  nom: { fontSize: 16, fontWeight: '600', color: couleurs.texte },
  compte: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  actions: { flexDirection: 'row', gap: espaces.xs },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: espaces.s },
  actionTexte: { fontSize: 13, fontWeight: '600', color: couleurs.primaire },
  actionDanger: { color: couleurs.danger },

  voile: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  feuille: {
    backgroundColor: couleurs.surface,
    borderTopLeftRadius: rayons.l,
    borderTopRightRadius: rayons.l,
    padding: espaces.l,
    gap: espaces.s,
  },
  feuilleTitre: { fontSize: 18, fontWeight: '700', color: couleurs.texte },
  feuilleActions: { flexDirection: 'row', gap: espaces.s, marginTop: espaces.s },
});
