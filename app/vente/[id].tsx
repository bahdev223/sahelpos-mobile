/**
 * Detail d'une vente : ses lignes, son reglement, et les deux actions qui
 * comptent apres coup — encaisser le reste du, ou annuler.
 *
 * L'annulation remet le stock : c'est le depot qui s'en charge, dans une
 * transaction. L'ecran ne fait que demander confirmation, car l'operation est
 * irreversible et se declenche souvent par erreur sur un telephone.
 */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  formaterQuantite,
  rayons,
} from '../../src/ui/components';
import {
  annulerVente,
  encaisser,
  listerLignes,
  obtenirVente,
  type VenteResume,
} from '../../src/db/repositories/vente';
import type { LigneVente, StatutVente } from '../../src/domain/types';
import { construireRecu } from '../../src/services/impression/recu';
import { serviceImpression } from '../../src/services/impression/imprimante';
import { enteteRecu, lireParametres } from '../../src/services/parametres';

const LIBELLE_STATUT: Record<StatutVente, string> = {
  payee: 'Payee',
  partielle: 'Partiellement payee',
  impayee: 'Impayee',
  annulee: 'Annulee',
};

const COULEUR_STATUT: Record<StatutVente, string> = {
  payee: couleurs.primaire,
  partielle: couleurs.avertissement,
  impayee: couleurs.danger,
  annulee: couleurs.texteFaible,
};

const LIBELLE_PAIEMENT: Record<string, string> = {
  especes: 'Especes',
  mobile_money: 'Mobile Money',
  credit: 'Credit',
};

function dateLisible(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} a ${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

export default function EcranDetailVente() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const venteId = Number(id);

  const [vente, setVente] = useState<VenteResume | null>(null);
  const [lignes, setLignes] = useState<LigneVente[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [saisieEncaissement, setSaisieEncaissement] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const v = await obtenirVente(venteId);
      if (!v) {
        setErreur('Cette vente est introuvable.');
        return;
      }
      setVente(v);
      setLignes(await listerLignes(venteId));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture de la vente impossible.');
    } finally {
      setChargement(false);
    }
  }, [venteId]);

  useFocusEffect(
    useCallback(() => {
      setChargement(true);
      charger();
    }, [charger]),
  );

  const reste = vente ? Math.max(0, vente.total - vente.montantPaye) : 0;

  const encaisserReste = useCallback(async () => {
    if (!vente) return;
    const montant = Number(saisieEncaissement.replace(',', '.'));
    if (!Number.isFinite(montant) || montant <= 0) {
      Alert.alert('Montant invalide', 'Saisissez le montant recu du client.');
      return;
    }
    setEnCours(true);
    try {
      await encaisser(vente.id, montant);
      setSaisieEncaissement('');
      await charger();
    } catch (e) {
      Alert.alert('Encaissement refuse', e instanceof Error ? e.message : 'Erreur inconnue.');
    } finally {
      setEnCours(false);
    }
  }, [vente, saisieEncaissement, charger]);

  const demanderAnnulation = useCallback(() => {
    if (!vente) return;
    Alert.alert(
      `Annuler ${vente.numero} ?`,
      'Les produits vendus retournent en stock. Cette operation ne peut pas etre defaite.',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            setEnCours(true);
            try {
              await annulerVente(vente.id, 'Annulee depuis le detail de la vente');
              await charger();
            } catch (e) {
              Alert.alert(
                'Annulation impossible',
                e instanceof Error ? e.message : 'Erreur inconnue.',
              );
            } finally {
              setEnCours(false);
            }
          },
        },
      ],
    );
  }, [vente, charger]);

  const reimprimer = useCallback(async () => {
    if (!vente) return;
    try {
      const [entete, parametres] = await Promise.all([enteteRecu(), lireParametres()]);
      const papier = parametres.imprimantePapier === '80mm' ? '80mm' : '58mm';
      const ticket = construireRecu(
        {
          id: vente.id,
          idLocal: '',
          numero: vente.numero,
          clientId: vente.clientId,
          utilisateurId: null,
          dateVente: vente.dateVente,
          total: vente.total,
          montantPaye: vente.montantPaye,
          modePaiement: vente.modePaiement,
          statut: vente.statut,
          beneficeTotal: vente.beneficeTotal,
        },
        lignes,
        entete,
        papier,
      );
      await serviceImpression.imprimer(ticket);
    } catch (e) {
      Alert.alert(
        'Impression impossible',
        e instanceof Error
          ? e.message
          : "Verifiez que l'imprimante est allumee et connectee.",
      );
    }
  }, [vente, lignes]);

  if (chargement) return <Chargement message="Lecture de la vente..." />;
  if (erreur || !vente) {
    return (
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: 'Vente' }} />
        <Erreur
          message={erreur ?? 'Vente introuvable.'}
          onReessayer={() => {
            setChargement(true);
            charger();
          }}
        />
      </SafeAreaView>
    );
  }

  const annulee = vente.statut === 'annulee';

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: vente.numero }} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <Carte>
          <View style={styles.enteteLigne}>
            <Text style={styles.numero}>{vente.numero}</Text>
            <Text style={[styles.statut, { color: COULEUR_STATUT[vente.statut] }]}>
              {LIBELLE_STATUT[vente.statut]}
            </Text>
          </View>
          <Text style={styles.date}>{dateLisible(vente.dateVente)}</Text>
          {vente.clientNom ? (
            <Text style={styles.client}>Client : {vente.clientNom}</Text>
          ) : null}
        </Carte>

        <Carte titre="Articles">
          {lignes.map((l, i) => (
            <View key={`${l.produitId}-${i}`} style={styles.article}>
              <View style={styles.articleGauche}>
                <Text style={styles.articleNom}>{l.libelle}</Text>
                <Text style={styles.articleDetail}>
                  {formaterQuantite(l.quantite)} {l.unite} x {formaterMontant(l.prixUnitaire)}
                </Text>
              </View>
              <Text style={styles.articleTotal}>{formaterMontant(l.total)}</Text>
            </View>
          ))}
        </Carte>

        <Carte titre="Reglement">
          <View style={styles.ligneTotal}>
            <Text style={styles.totalLibelle}>Total</Text>
            <Montant valeur={vente.total} taille="grand" />
          </View>
          <View style={styles.ligneReglement}>
            <Text style={styles.reglementLibelle}>
              Paye ({LIBELLE_PAIEMENT[vente.modePaiement] ?? vente.modePaiement})
            </Text>
            <Text style={styles.reglementValeur}>{formaterMontant(vente.montantPaye)}</Text>
          </View>
          {reste > 0 && !annulee ? (
            <View style={styles.ligneReglement}>
              <Text style={[styles.reglementLibelle, styles.resteLibelle]}>Reste du</Text>
              <Text style={[styles.reglementValeur, styles.resteValeur]}>
                {formaterMontant(reste)}
              </Text>
            </View>
          ) : null}
          {/* Le benefice n'est pas imprime sur le recu du client : il ne
              regarde que le commercant. */}
          <View style={styles.ligneReglement}>
            <Text style={styles.reglementLibelle}>Benefice</Text>
            <Text style={styles.reglementValeur}>{formaterMontant(vente.beneficeTotal)}</Text>
          </View>
        </Carte>

        {reste > 0 && !annulee ? (
          <Carte titre="Encaisser le reste">
            <Champ
              valeur={saisieEncaissement}
              onChangeText={setSaisieEncaissement}
              placeholder={String(reste)}
              clavier="numeric"
              aide={`Reste a payer : ${formaterMontant(reste)}`}
              alignerADroite
            />
            <Bouton
              titre="Enregistrer le paiement"
              onPress={() => void encaisserReste()}
              enCours={enCours}
              grand
            />
          </Carte>
        ) : null}

        <View style={styles.actions}>
          <Bouton titre="Reimprimer le recu" onPress={() => void reimprimer()} variante="secondaire" />
          {!annulee ? (
            <Bouton
              titre="Annuler cette vente"
              sousTitre="Les produits retournent en stock"
              onPress={demanderAnnulation}
              variante="danger"
              desactive={enCours}
            />
          ) : null}
          <Bouton titre="Retour" onPress={() => router.back()} variante="secondaire" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.l, paddingBottom: espaces.xxl, gap: espaces.m },

  enteteLigne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { fontSize: 18, fontWeight: '700', color: couleurs.texte },
  statut: { fontSize: 13, fontWeight: '700' },
  date: { fontSize: 13, color: couleurs.texteFaible, marginTop: 4 },
  client: { fontSize: 14, color: couleurs.texte, marginTop: 4 },

  article: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: espaces.s,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  articleGauche: { flex: 1, marginRight: espaces.m },
  articleNom: { fontSize: 15, color: couleurs.texte },
  articleDetail: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  articleTotal: { fontSize: 15, fontWeight: '600', color: couleurs.texte },

  ligneTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: espaces.s,
  },
  totalLibelle: { fontSize: 16, fontWeight: '700', color: couleurs.texte },
  ligneReglement: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  reglementLibelle: { fontSize: 14, color: couleurs.texteFaible },
  reglementValeur: { fontSize: 14, fontWeight: '600', color: couleurs.texte },
  resteLibelle: { color: couleurs.danger },
  resteValeur: { color: couleurs.danger },

  actions: { gap: espaces.s, marginTop: espaces.s },
});
