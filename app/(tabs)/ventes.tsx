/**
 * Journal des ventes.
 *
 * L'ecran s'ouvre sur la JOURNEE EN COURS et non sur tout l'historique : la
 * question qu'un commercant se pose vingt fois par jour est "combien j'ai fait
 * aujourd'hui", pas "qu'ai-je vendu le mois dernier".
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  SectionList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  Carte,
  Chargement,
  Erreur,
  ListeVide,
  Montant,
  couleurs,
  espaces,
  formaterMontant,
  rayons,
} from '../../src/ui/components';
import {
  listerVentes,
  totauxPeriode,
  type TotauxPeriode,
  type VenteResume,
} from '../../src/db/repositories/vente';
import type { StatutVente } from '../../src/domain/types';
import { useSession } from '../_layout';
import { calculerPeriode, cleGroupe, libelleGroupe, type ModePeriode } from '../../src/domain/periodes';
import { SelecteurPeriode } from '../../src/ui/SelecteurPeriode';

const TAILLE_PAGE = 100;

const LIBELLE_STATUT: Record<StatutVente, string> = {
  payee: 'Payee',
  partielle: 'Partielle',
  impayee: 'Impayee',
  annulee: 'Annulee',
};

const COULEUR_STATUT: Record<StatutVente, string> = {
  payee: couleurs.primaire,
  partielle: couleurs.avertissement,
  impayee: couleurs.danger,
  annulee: couleurs.texteFaible,
};

function heure(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)} ${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

export default function EcranVentes() {
  const router = useRouter();
  const { synchroniserMaintenant, revisionSynchronisation, utilisateur, boutique } = useSession();
  const utilisateurId = utilisateur?.role === 'vendeur' ? utilisateur.id : undefined;
  const [periode, setPeriode] = useState<ModePeriode>('jour');
  const [decalage, setDecalage] = useState(0);
  const plage = calculerPeriode(periode, decalage);
  const { debut, fin } = plage;
  const cle = [debut, fin, utilisateurId ?? 'tous'].join('/');
  const periodeActive = useRef(cle);
  periodeActive.current = cle;
  const [ventes, setVentes] = useState<VenteResume[]>([]);
  const [totaux, setTotaux] = useState<TotauxPeriode | null>(null);
  const [chargement, setChargement] = useState(true);
  const [rafraichit, setRafraichit] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [suite, setSuite] = useState(false);
  const [chargeSuite, setChargeSuite] = useState(false);
  const lecture = useRef(0);
  const pagination = useRef(false);

  const charger = useCallback(async () => {
    if (periodeActive.current !== cle) return;
    const requete = ++lecture.current;
    pagination.current = false;
    setChargeSuite(false);
    setErreur(null);
    try {
      const [liste, t] = await Promise.all([
        listerVentes({ debut, fin, limite: TAILLE_PAGE + 1, utilisateurId }),
        totauxPeriode(debut, fin, utilisateurId),
      ]);
      if (requete !== lecture.current) return;
      setVentes(liste.slice(0, TAILLE_PAGE));
      setSuite(liste.length > TAILLE_PAGE);
      setTotaux(t);
    } catch (e) {
      if (requete === lecture.current) setErreur(e instanceof Error ? e.message : 'Lecture des ventes impossible.');
    } finally {
      if (requete === lecture.current) setChargement(false);
    }
  }, [debut, fin, utilisateurId, cle]);

  const chargerSuite = useCallback(async () => {
    if (!suite || chargement || rafraichit || pagination.current || !ventes.length) return;
    const requete = lecture.current;
    pagination.current = true;
    setChargeSuite(true);
    try {
      const liste = await listerVentes({ debut, fin, utilisateurId, limite: TAILLE_PAGE + 1, avant: ventes[ventes.length - 1] });
      if (requete !== lecture.current) return;
      setVentes((actuelles) => [...actuelles, ...liste.slice(0, TAILLE_PAGE)]);
      setSuite(liste.length > TAILLE_PAGE);
    } catch {
      // La page deja chargee reste consultable; le bouton permet de reessayer.
    } finally {
      if (requete === lecture.current) { pagination.current = false; setChargeSuite(false); }
    }
  }, [suite, chargement, rafraichit, ventes, debut, fin, utilisateurId]);

  const sections = useMemo(() => {
    const groupes = new Map<string, VenteResume[]>();
    for (const vente of ventes) {
      const cle = cleGroupe(new Date(vente.dateVente), periode === 'annee');
      const groupe = groupes.get(cle);
      if (groupe) groupe.push(vente);
      else groupes.set(cle, [vente]);
    }
    return [...groupes].map(([cle, data]) => ({ titre: libelleGroupe(cle), data }));
  }, [ventes, periode]);

  const rafraichir = useCallback(async () => {
    setRafraichit(true);
    try {
      try { await synchroniserMaintenant(); } catch { /* Consultation locale disponible hors ligne. */ }
      await charger();
    } finally {
      setRafraichit(false);
    }
  }, [charger, synchroniserMaintenant]);

  useFocusEffect(
    useCallback(() => {
      setChargement(true);
      void charger();
      return () => { lecture.current += 1; };
    }, [charger, revisionSynchronisation]),
  );

  if (chargement) return <Chargement message="Lecture des ventes..." />;
  if (erreur) {
    return (
      <SafeAreaView style={styles.page} edges={['top']}>
        <Erreur message={erreur} onReessayer={charger} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <SelecteurPeriode mode={periode} decalage={decalage} libelle={plage.libelle} onMode={(mode) => { setPeriode(mode); setDecalage(0); }} onDecalage={setDecalage} />

      {totaux ? (
        <Carte style={styles.resume}>
          <View style={styles.resumeHaut}>
            <View>
              <Text style={styles.resumeLibelle}>Chiffre d'affaires</Text>
              <Montant valeur={totaux.chiffreAffaires} taille="grand" />
            </View>
            <View style={styles.resumeDroite}>
              <Text style={styles.resumeLibelle}>
                {totaux.nbVentes} vente{totaux.nbVentes > 1 ? 's' : ''}
              </Text>
              <Text style={styles.benefice}>
                Benefice {formaterMontant(totaux.benefice, boutique.devise)}
              </Text>
            </View>
          </View>

          {/* Le reste du n'apparait que s'il y en a : afficher "0 F" en
              permanence habituerait l'oeil a ignorer la ligne. */}
          {totaux.resteDu > 0 ? (
            <View style={styles.resteDu}>
              <Text style={styles.resteDuTexte}>
                Reste du par les clients : {formaterMontant(totaux.resteDu)}
              </Text>
            </View>
          ) : null}
        </Carte>
      ) : null}

      <SectionList
        sections={sections}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <Text style={styles.groupe}>{section.titre}</Text>}
        onEndReached={() => void chargerSuite()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={suite ? <Pressable style={styles.suite} disabled={chargeSuite} onPress={() => void chargerSuite()}><Text style={styles.benefice}>{chargeSuite ? 'Chargement...' : 'Charger la suite'}</Text></Pressable> : null}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={ventes.length === 0 ? styles.videConteneur : styles.liste}
        refreshControl={
          <RefreshControl
            refreshing={rafraichit}
            onRefresh={rafraichir}
          />
        }
        ListEmptyComponent={
          <ListeVide
            titre="Aucune vente"
            message={
              periode === 'jour' && decalage === 0
                ? "Aucune vente enregistree aujourd'hui."
                : 'Aucune vente sur cette periode.'
            }
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/vente/${item.id}`)}
            style={({ pressed }) => [styles.ligne, pressed && styles.lignePressee]}
          >
            <View style={styles.ligneGauche}>
              <Text style={styles.numero}>{item.numero}</Text>
              <Text style={styles.details}>
                {heure(item.dateVente)}
                {item.clientNom ? `  ${item.clientNom}` : ''}
              </Text>
            </View>
            <View style={styles.ligneDroite}>
              <Montant valeur={item.total} taille="moyen" />
              <Text style={[styles.statut, { color: COULEUR_STATUT[item.statut] }]}>
                {LIBELLE_STATUT[item.statut]}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  groupe: { fontSize: 13, fontWeight: '700', color: couleurs.texteFaible, paddingVertical: 10 },
  suite: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  page: { flex: 1, backgroundColor: couleurs.fond },
  onglets: {
    flexDirection: 'row',
    paddingHorizontal: espaces.l,
    paddingTop: espaces.s,
    gap: espaces.s,
  },
  onglet: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rayons.m,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  ongletActif: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  ongletTexte: { fontSize: 14, fontWeight: '600', color: couleurs.texteFaible },
  ongletTexteActif: { color: couleurs.texteInverse },

  resume: { margin: espaces.l, marginBottom: espaces.s },
  resumeHaut: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'flex-start' },
  resumeDroite: { alignItems: 'flex-end' },
  resumeLibelle: { fontSize: 12, color: couleurs.texteFaible, marginBottom: 2 },
  benefice: { fontSize: 14, fontWeight: '600', color: couleurs.primaire, marginTop: 4 },
  resteDu: {
    marginTop: espaces.m,
    paddingTop: espaces.s,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
  },
  resteDuTexte: { fontSize: 13, color: couleurs.avertissement, fontWeight: '600' },

  liste: { paddingHorizontal: espaces.l, paddingBottom: espaces.xl },
  videConteneur: { flexGrow: 1, justifyContent: 'center' },
  ligne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.m,
    marginBottom: espaces.s,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  lignePressee: { opacity: 0.7 },
  ligneGauche: { flex: 1, marginRight: espaces.m },
  ligneDroite: { alignItems: 'flex-end' },
  numero: { fontSize: 15, fontWeight: '600', color: couleurs.texte },
  details: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  statut: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
