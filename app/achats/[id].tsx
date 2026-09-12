/**
 * Detail d'un achat : ses lignes, ses reglements, et les actions selon l'etat.
 *
 * Un achat BROUILLON peut etre recu ou annule. Un achat RECU ne peut plus
 * qu'etre paye : la marchandise est en rayon, revenir dessus se fait par un
 * ajustement de stock qui laisse une trace.
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
} from '../../src/ui/components';
import {
  annulerAchat,
  listerLignesAchat,
  listerPaiements,
  obtenirAchat,
  payerAchat,
  recevoirAchat,
  type AchatResume,
  type LigneAchat,
  type PaiementAchat,
  type StatutAchat,
} from '../../src/services/achat';
import { obtenirFournisseur } from '../../src/db/repositories/fournisseur';
import { lireParametres } from '../../src/services/parametres';
import { bonDeCommandeHtml, genererEtPartager } from '../../src/services/pdf';
import { ActionsDocument } from '../../src/ui/ActionsDocument';
import { preparerDocumentAchat } from '../../src/services/document-achat';

const LIBELLE_STATUT: Record<StatutAchat, string> = {
  BROUILLON: 'A recevoir',
  RECU: 'Recu en stock',
  ANNULE: 'Annule',
};

const COULEUR_STATUT: Record<StatutAchat, string> = {
  BROUILLON: couleurs.avertissement,
  RECU: couleurs.primaire,
  ANNULE: couleurs.texteFaible,
};

function dateLisible(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function EcranDetailAchat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const achatId = Number(id);

  const [achat, setAchat] = useState<AchatResume | null>(null);
  const [lignes, setLignes] = useState<LigneAchat[]>([]);
  const [paiements, setPaiements] = useState<PaiementAchat[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [saisiePaiement, setSaisiePaiement] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const a = await obtenirAchat(achatId);
      if (!a) {
        setErreur('Cet achat est introuvable.');
        return;
      }
      setAchat(a);
      const [l, p] = await Promise.all([
        listerLignesAchat(achatId),
        listerPaiements(achatId),
      ]);
      setLignes(l);
      setPaiements(p);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture de l achat impossible.');
    } finally {
      setChargement(false);
    }
  }, [achatId]);

  useFocusEffect(
    useCallback(() => {
      setChargement(true);
      charger();
    }, [charger]),
  );

  const reste = achat ? Math.max(0, achat.total - achat.montantPaye) : 0;

  const recevoir = useCallback(() => {
    if (!achat) return;
    Alert.alert(
      `Recevoir ${achat.numero} ?`,
      'La marchandise va entrer en stock et les prix d achat des produits seront mis a jour.',
      [
        { text: 'Pas encore', style: 'cancel' },
        {
          text: 'Recevoir',
          onPress: async () => {
            setEnCours(true);
            try {
              await recevoirAchat(achat.id);
              await charger();
            } catch (e) {
              Alert.alert('Reception impossible', e instanceof Error ? e.message : 'Erreur.');
            } finally {
              setEnCours(false);
            }
          },
        },
      ],
    );
  }, [achat, charger]);

  const payer = useCallback(async () => {
    if (!achat) return;
    const montant = Number(saisiePaiement.replace(',', '.'));
    if (!Number.isFinite(montant) || montant <= 0) {
      Alert.alert('Montant invalide', 'Saisissez le montant verse au fournisseur.');
      return;
    }
    setEnCours(true);
    try {
      await payerAchat(achat.id, montant);
      setSaisiePaiement('');
      await charger();
    } catch (e) {
      Alert.alert('Paiement refuse', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setEnCours(false);
    }
  }, [achat, saisiePaiement, charger]);

  const annuler = useCallback(() => {
    if (!achat) return;
    Alert.alert(
      `Annuler ${achat.numero} ?`,
      'Cet achat sera marque comme annule.',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Annuler l achat',
          style: 'destructive',
          onPress: async () => {
            setEnCours(true);
            try {
              await annulerAchat(achat.id, 'Annule depuis le detail');
              await charger();
            } catch (e) {
              Alert.alert('Annulation refusee', e instanceof Error ? e.message : 'Erreur.');
            } finally {
              setEnCours(false);
            }
          },
        },
      ],
    );
  }, [achat, charger]);

  const envoyer = useCallback(async () => {
    if (!achat) return;
    setEnvoiEnCours(true);
    try {
      const [fournisseur, parametres] = await Promise.all([
        achat.fournisseurId ? obtenirFournisseur(achat.fournisseurId) : Promise.resolve(null),
        lireParametres(),
      ]);
      const html = bonDeCommandeHtml({ achat, lignes, fournisseur, parametres });
      const partage = await genererEtPartager(
        html,
        `Commande-${achat.numero}`,
        'Envoyer le bon de commande',
      );
      if (!partage) {
        Alert.alert(
          'Partage indisponible',
          "Ce telephone ne propose pas de partage de fichier. Le document n a pas pu etre envoye.",
        );
      }
    } catch (e) {
      Alert.alert(
        'Envoi impossible',
        e instanceof Error ? e.message : "Le bon de commande n a pas pu etre prepare.",
      );
    } finally {
      setEnvoiEnCours(false);
    }
  }, [achat, lignes]);

  if (chargement) return <Chargement message="Lecture de l achat..." />;
  if (erreur || !achat) {
    return (
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: 'Achat' }} />
        <Erreur
          message={erreur ?? 'Achat introuvable.'}
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
      <Stack.Screen options={{ headerShown: true, title: achat.numero }} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <Carte>
          <View style={styles.enteteLigne}>
            <Text style={styles.numero}>{achat.numero}</Text>
            <Text style={[styles.statut, { color: COULEUR_STATUT[achat.statut] }]}>
              {LIBELLE_STATUT[achat.statut]}
            </Text>
          </View>
          <Text style={styles.date}>{dateLisible(achat.dateAchat)}</Text>
          {achat.fournisseurNom ? (
            <Text style={styles.fournisseur}>Fournisseur : {achat.fournisseurNom}</Text>
          ) : null}
          {achat.reference ? (
            <Text style={styles.reference}>Facture n° {achat.reference}</Text>
          ) : null}
        </Carte>

        <Carte titre="Produits">
          {lignes.map((l, i) => (
            <View key={`${l.produitId}-${i}`} style={styles.article}>
              <View style={styles.articleGauche}>
                <Text style={styles.articleNom}>{l.libelle}</Text>
                <Text style={styles.articleDetail}>
                  {formaterQuantite(l.quantite)} {l.unite} x {formaterMontant(l.prixUnitaire)}
                  {l.facteur > 1
                    ? `  (${formaterQuantite(l.quantiteBase)} unites)`
                    : ''}
                </Text>
              </View>
              <Text style={styles.articleTotal}>{formaterMontant(l.total)}</Text>
            </View>
          ))}
        </Carte>

        <Carte titre="Reglement">
          <View style={styles.totalLigne}>
            <Text style={styles.totalLibelle}>Total</Text>
            <Montant valeur={achat.total} taille="grand" />
          </View>
          <View style={styles.ligneReglement}>
            <Text style={styles.reglementLibelle}>Deja paye</Text>
            <Text style={styles.reglementValeur}>{formaterMontant(achat.montantPaye)}</Text>
          </View>
          {reste > 0 && achat.statut !== 'ANNULE' ? (
            <View style={styles.ligneReglement}>
              <Text style={[styles.reglementLibelle, styles.resteLibelle]}>
                Vous devez encore
              </Text>
              <Text style={[styles.reglementValeur, styles.resteValeur]}>
                {formaterMontant(reste)}
              </Text>
            </View>
          ) : null}

          {paiements.length > 0 ? (
            <View style={styles.paiements}>
              <Text style={styles.paiementsTitre}>Versements</Text>
              {paiements.map((p) => (
                <View key={p.id} style={styles.paiement}>
                  <Text style={styles.paiementDate}>{dateLisible(p.datePaiement)}</Text>
                  <Text style={styles.paiementMontant}>{formaterMontant(p.montant)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Carte>

        {reste > 0 && achat.statut !== 'ANNULE' ? (
          <Carte titre="Payer le fournisseur">
            <Champ
              valeur={saisiePaiement}
              onChangeText={setSaisiePaiement}
              placeholder={String(reste)}
              clavier="numeric"
              aide={`Reste a payer : ${formaterMontant(reste)}`}
              alignerADroite
            />
            <Bouton
              titre="Enregistrer le versement"
              onPress={() => void payer()}
              enCours={enCours}
              grand
            />
          </Carte>
        ) : null}

        <View style={styles.actions}>
          <ActionsDocument preparer={() => preparerDocumentAchat(achat.id)} />
          {achat.statut === 'BROUILLON' ? (
            <>
              <Bouton
                titre="Recevoir la marchandise"
                sousTitre="Entree en stock et mise a jour des prix d achat"
                onPress={recevoir}
                enCours={enCours}
                grand
              />
              <Bouton
                titre="Annuler cet achat"
                onPress={annuler}
                variante="danger"
                desactive={enCours}
              />
            </>
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
  fournisseur: { fontSize: 14, color: couleurs.texte, marginTop: 4 },
  reference: { fontSize: 13, color: couleurs.texteFaible, marginTop: 2 },

  article: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: espaces.s,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  articleGauche: { flex: 1, marginRight: espaces.m },
  articleNom: { fontSize: 15, color: couleurs.texte },
  articleDetail: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  articleTotal: { fontSize: 15, fontWeight: '600', color: couleurs.texte },

  totalLigne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: espaces.s,
  },
  totalLibelle: { fontSize: 16, fontWeight: '700', color: couleurs.texte },
  ligneReglement: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  reglementLibelle: { fontSize: 14, color: couleurs.texteFaible },
  reglementValeur: { fontSize: 14, fontWeight: '600', color: couleurs.texte },
  resteLibelle: { color: couleurs.danger },
  resteValeur: { color: couleurs.danger },

  paiements: {
    marginTop: espaces.m,
    paddingTop: espaces.s,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
  },
  paiementsTitre: {
    fontSize: 12,
    fontWeight: '700',
    color: couleurs.texteFaible,
    marginBottom: espaces.xs,
  },
  paiement: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  paiementDate: { fontSize: 13, color: couleurs.texteFaible },
  paiementMontant: { fontSize: 13, fontWeight: '600', color: couleurs.texte },

  actions: { gap: espaces.s, marginTop: espaces.s },
});
