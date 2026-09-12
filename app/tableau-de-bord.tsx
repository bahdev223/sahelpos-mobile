import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSession } from './_layout';
import { Carte, Chargement, couleurs, formaterMontant, formaterQuantite } from '../src/ui/components';
import { SelecteurPeriode } from '../src/ui/SelecteurPeriode';
import { calculerPeriode, type ModePeriode } from '../src/domain/periodes';
import { meilleuresVentes, regrouperVentes, totauxPeriode, type GroupeVentes, type ProduitVendu, type TotauxPeriode } from '../src/db/repositories/vente';
import { listerAlertesStock } from '../src/db/repositories/produit';
import { valeurStock, type ValeurStock } from '../src/db/repositories/stock';

interface Rapport {
  cle: string;
  totaux: TotauxPeriode;
  groupes: GroupeVentes[];
  meilleurs: ProduitVendu[];
  nbAlertes: number;
  stock: ValeurStock;
}

export default function EcranTableauDeBord() {
  const router = useRouter();
  const { utilisateur, boutique, synchroniserMaintenant, revisionSynchronisation } = useSession();
  const utilisateurId = utilisateur?.role === 'vendeur' ? utilisateur.id : undefined;
  const [mode, setMode] = useState<ModePeriode>('mois');
  const [decalage, setDecalage] = useState(0);
  const plage = calculerPeriode(mode, decalage);
  const { debut, fin, mensuel } = plage;
  const cle = [debut, fin, utilisateurId ?? 'tous'].join('/');
  const periodeActive = useRef(cle);
  periodeActive.current = cle;
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [rafraichit, setRafraichit] = useState(false);
  const [lectureEnCours, setLectureEnCours] = useState(true);
  const lecture = useRef(0);

  const charger = useCallback(async () => {
    if (periodeActive.current !== cle) return;
    const requete = ++lecture.current;
    setLectureEnCours(true);
    try {
      const [totaux, groupes, meilleurs, alertes, stock] = await Promise.all([
        totauxPeriode(debut, fin, utilisateurId),
        regrouperVentes(debut, fin, mensuel, utilisateurId),
        meilleuresVentes(debut, fin, 5, utilisateurId),
        listerAlertesStock(), valeurStock(),
      ]);
      if (requete === lecture.current) setRapport({ cle, totaux, groupes, meilleurs, nbAlertes: alertes.length, stock });
    } catch {
      // Une lecture echouee conserve le dernier rapport de la meme periode.
    } finally {
      if (requete === lecture.current) setLectureEnCours(false);
    }
  }, [debut, fin, mensuel, utilisateurId, cle]);

  useFocusEffect(useCallback(() => {
    void charger();
    return () => { lecture.current += 1; };
  }, [charger, revisionSynchronisation]));

  const rafraichir = useCallback(async () => {
    setRafraichit(true);
    try {
      try { await synchroniserMaintenant(); } catch { /* Lecture hors ligne. */ }
      await charger();
    } finally { setRafraichit(false); }
  }, [charger, synchroniserMaintenant]);

  const actif = rapport?.cle === cle ? rapport : null;
  const montant = (n: number) => formaterMontant(n, boutique.devise);
  return <SafeAreaView style={s.page} edges={['bottom']}>
    <Stack.Screen options={{ headerShown: true, title: 'Tableau de bord' }} />
    <SelecteurPeriode mode={mode} decalage={decalage} libelle={plage.libelle} onMode={(valeur) => { setMode(valeur); setDecalage(0); }} onDecalage={setDecalage} />
    {!actif ? lectureEnCours ? <Chargement message="Calcul des chiffres..." /> : <Pressable style={s.reessayer} onPress={() => void charger()}><Text style={s.lien}>Réessayer</Text></Pressable> :
      <ScrollView contentContainerStyle={s.contenu} refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={rafraichir} />}>
        <View style={s.grille}>
          <MiniCarte libelle="Chiffre d'affaires" valeur={montant(actif.totaux.chiffreAffaires)} detail={String(actif.totaux.nbVentes) + ' ventes'} />
          <MiniCarte libelle="Bénéfice" valeur={montant(actif.totaux.benefice)} detail="Sur la période" vert />
          <MiniCarte libelle="Encaissé" valeur={montant(actif.totaux.encaisse)} detail="Sur la période" />
          <MiniCarte libelle="Panier moyen" valeur={montant(actif.totaux.nbVentes ? Math.round(actif.totaux.chiffreAffaires / actif.totaux.nbVentes) : 0)} detail="Hors annulations" />
        </View>
        {actif.totaux.resteDu > 0 && <Pressable onPress={() => router.push('/clients')}><Carte><Text style={s.libelle}>Créances de la période</Text><Text style={s.valeur}>{montant(actif.totaux.resteDu)}</Text><Text style={s.lien}>Voir les clients</Text></Carte></Pressable>}
        <Carte titre={mensuel ? 'Ventes par mois' : 'Ventes par jour'}>
          {plage.groupes.map((g) => {
            const total = actif.groupes.find((ligne) => ligne.cle === g.cle);
            return <View style={s.ligne} key={g.cle}>
              <View style={s.milieu}><Text style={s.nom}>{g.libelle}</Text><Text style={s.detail}>{total?.nbVentes ?? 0} ventes</Text></View>
              <View style={s.droite}><Text style={s.total}>{montant(total?.chiffreAffaires ?? 0)}</Text><Text style={s.detail}>Bénéfice {montant(total?.benefice ?? 0)}</Text></View>
            </View>;
          })}
        </Carte>
        <Carte titre="Meilleures ventes de la période">
          {actif.meilleurs.length === 0 ? <Text style={s.detail}>Aucune vente sur cette période.</Text> : actif.meilleurs.map((p, i) => <View key={String(p.produitId) + p.libelle} style={s.ligne}>
            <Text style={s.rang}>{i + 1}</Text><View style={s.milieu}><Text style={s.nom}>{p.libelle}</Text><Text style={s.detail}>{formaterQuantite(p.quantite)} vendu(s)</Text></View><Text style={s.total}>{montant(p.total)}</Text>
          </View>)}
        </Carte>
        <Pressable onPress={() => router.push('/stock/alertes')}><Carte titre="Stock actuel">
          <View style={s.ligne}><Text style={s.milieu}>Valeur au prix d'achat</Text><Text style={s.total}>{montant(actif.stock.valeurAchat)}</Text></View>
          <Text style={s.detail}>{actif.stock.nbProduits} produits suivis</Text>
          <Text style={s.lien}>{actif.nbAlertes} produits à surveiller</Text>
        </Carte></Pressable>
      </ScrollView>}
  </SafeAreaView>;
}

function MiniCarte({ libelle, valeur, detail, vert }: { libelle: string; valeur: string; detail: string; vert?: boolean }) {
  return <Carte style={s.mini}><Text style={s.libelle}>{libelle}</Text><Text style={[s.valeur, vert && { color: couleurs.succesFonce }]} numberOfLines={1} adjustsFontSizeToFit>{valeur}</Text><Text style={s.detail}>{detail}</Text></Carte>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond }, contenu: { padding: 12, paddingBottom: 32, gap: 12 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, mini: { width: '47%', flexGrow: 1, minWidth: 0, padding: 12 },
  libelle: { fontSize: 12, color: couleurs.texteFaible }, valeur: { fontSize: 19, fontWeight: '800', color: couleurs.texte, marginVertical: 5 },
  detail: { fontSize: 11, color: couleurs.texteFaible, marginTop: 3 }, lien: { fontSize: 13, fontWeight: '600', color: couleurs.primaire, marginTop: 8 },
  ligne: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: couleurs.bordure },
  milieu: { flex: 1, minWidth: 90 }, droite: { alignItems: 'flex-end', maxWidth: '60%' }, nom: { fontSize: 13, color: couleurs.texte },
  total: { fontSize: 13, color: couleurs.texte, fontWeight: '700', flexShrink: 1 }, rang: { width: 20, color: couleurs.texteFaible }, reessayer: { padding: 24, alignItems: 'center' },
});
