import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { obtenirBase } from '../../src/db/database';
import { useSession } from '../_layout';
import { HABILLEMENT_MOBILE_THEME as H } from '../../src/profile-ui/habillement/theme';
import { Icone } from '../../src/ui/icones';
import { espaces, rayons } from '../../src/ui/components';

interface Rapport {
  ca: number;
  ventes: number;
  benefice: number;
  pieces: number;
  arrivagesRecus: number;
  fraisApproche: number;
  valeurRendue: number;
  tops: Array<{ nom: string; qte: number; ca: number }>;
  variantes: Array<{ libelle: string; qte: number }>;
}

async function charger(): Promise<Rapport> {
  const db = await obtenirBase();
  const debut = new Date();
  debut.setDate(debut.getDate() - 29);
  debut.setHours(0, 0, 0, 0);
  const depuis = debut.toISOString();

  const totaux = await db.getFirstAsync<{ ca: number; ventes: number; benefice: number }>(
    "SELECT COALESCE(SUM(total), 0) AS ca, COUNT(*) AS ventes, COALESCE(SUM(benefice_total), 0) AS benefice FROM vente WHERE date_vente >= ? AND statut <> 'annulee'",
    depuis,
  );
  const pieces = await db.getFirstAsync<{ pieces: number }>(
    "SELECT COALESCE(SUM(lv.quantite), 0) AS pieces FROM ligne_vente lv JOIN vente v ON v.id = lv.vente_id WHERE v.date_vente >= ? AND v.statut <> 'annulee'",
    depuis,
  );
  const tops = await db.getAllAsync<{ nom: string; qte: number; ca: number }>(
    "SELECT p.nom, COALESCE(SUM(lv.quantite), 0) AS qte, COALESCE(SUM(lv.total), 0) AS ca FROM ligne_vente lv JOIN produit p ON p.id = lv.produit_id JOIN vente v ON v.id = lv.vente_id WHERE v.date_vente >= ? AND v.statut <> 'annulee' GROUP BY p.id, p.nom ORDER BY qte DESC LIMIT 6",
    depuis,
  );
  const variantes = await db.getAllAsync<{ libelle: string; qte: number }>(
    "SELECT lv.libelle, COALESCE(SUM(lv.quantite), 0) AS qte FROM ligne_vente lv JOIN vente v ON v.id = lv.vente_id WHERE v.date_vente >= ? AND v.statut <> 'annulee' AND lv.variante_id IS NOT NULL GROUP BY lv.libelle ORDER BY qte DESC LIMIT 8",
    depuis,
  );
  const logistique = await db.getFirstAsync<{
    arrivagesRecus: number;
    fraisApproche: number;
    valeurRendue: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM arrivage a
         WHERE a.statut = 'RECEPTIONNE'
           AND COALESCE(a.date_reception_reelle, a.date_creation) >= ?) AS arrivagesRecus,
       COALESCE((
         SELECT SUM(f.montant)
           FROM frais_arrivage f
           JOIN arrivage a ON a.id = f.arrivage_id
          WHERE a.statut = 'RECEPTIONNE'
            AND f.supprime_le IS NULL
            AND COALESCE(a.date_reception_reelle, a.date_creation) >= ?
       ), 0) AS fraisApproche,
       COALESCE((
         SELECT SUM(la.cout_revient_unitaire * la.quantite_recue)
           FROM ligne_arrivage la
           JOIN arrivage a ON a.id = la.arrivage_id
          WHERE a.statut = 'RECEPTIONNE'
            AND la.supprime_le IS NULL
            AND la.quantite_recue > 0
            AND COALESCE(a.date_reception_reelle, a.date_creation) >= ?
       ), 0) AS valeurRendue`,
    depuis, depuis, depuis,
  );

  return {
    ca: totaux?.ca ?? 0,
    ventes: totaux?.ventes ?? 0,
    benefice: totaux?.benefice ?? 0,
    pieces: pieces?.pieces ?? 0,
    arrivagesRecus: logistique?.arrivagesRecus ?? 0,
    fraisApproche: logistique?.fraisApproche ?? 0,
    valeurRendue: logistique?.valeurRendue ?? 0,
    tops,
    variantes,
  };
}

export default function RapportsMode() {
  const router = useRouter();
  const { boutique, revisionSynchronisation } = useSession();
  const [rapport, setRapport] = useState<Rapport>({
    ca: 0, ventes: 0, benefice: 0, pieces: 0,
    arrivagesRecus: 0, fraisApproche: 0, valeurRendue: 0,
    tops: [], variantes: [],
  });

  useFocusEffect(useCallback(() => {
    void charger().then(setRapport);
  }, [revisionSynchronisation]));

  const money = (v: number) =>
    Math.round(v).toLocaleString('fr-FR') + ' ' + boutique.devise;

  return (
    <View style={s.page}>
      <View style={s.entete}>
        <Pressable onPress={() => router.back()}>
          <Icone nom="retour" taille={23} couleur={H.texte} />
        </Pressable>
        <View>
          <Text style={s.titre}>Rapports Mode</Text>
          <Text style={s.sous}>30 derniers jours</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.contenu}>
        <View style={s.grille}>
          <Kpi label="Chiffre d’affaires" value={money(rapport.ca)} />
          <Kpi label="Bénéfice" value={money(rapport.benefice)} />
          <Kpi label="Ventes" value={String(rapport.ventes)} />
          <Kpi label="Pièces vendues" value={String(rapport.pieces)} />
          <Kpi label="Arrivages reçus" value={String(rapport.arrivagesRecus)} />
          <Kpi label="Frais d’approche" value={money(rapport.fraisApproche)} />
          <Kpi label="Valeur rendue reçue" value={money(rapport.valeurRendue)} />
        </View>

        <Text style={s.section}>Modèles les plus vendus</Text>
        <View style={s.carte}>
          {rapport.tops.map((x, i) => (
            <View key={x.nom} style={s.ligne}>
              <Text style={s.rang}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.nom}>{x.nom}</Text>
                <Text style={s.meta}>{x.qte} pièce(s)</Text>
              </View>
              <Text style={s.montant}>{money(x.ca)}</Text>
            </View>
          ))}
          {!rapport.tops.length ? (
            <Text style={s.vide}>Pas encore de ventes sur cette période.</Text>
          ) : null}
        </View>

        <Text style={s.section}>Variantes les plus demandées</Text>
        <View style={s.carte}>
          {rapport.variantes.map((x, i) => (
            <View key={x.libelle} style={s.ligne}>
              <Text style={s.rang}>{i + 1}</Text>
              <Text style={[s.nom, { flex: 1 }]}>{x.libelle}</Text>
              <Text style={s.badge}>{x.qte}</Text>
            </View>
          ))}
          {!rapport.variantes.length ? (
            <Text style={s.vide}>Aucune variante vendue.</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: H.fond },
  entete: {
    flexDirection: 'row', alignItems: 'center', gap: espaces.m, padding: espaces.m,
    backgroundColor: H.surface, borderBottomWidth: 1, borderBottomColor: H.bordure,
  },
  titre: { fontSize: 19, fontWeight: '900', color: H.texte },
  sous: { marginTop: 2, fontSize: 11, color: H.texteFaible },
  contenu: { padding: espaces.m, paddingBottom: espaces.xxl },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: {
    width: '47%', flexGrow: 1, minHeight: 96, padding: 13, borderRadius: rayons.m,
    backgroundColor: H.surface, borderWidth: 1, borderColor: H.bordure,
  },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: H.texteFaible },
  kpiValue: { marginTop: 8, fontSize: 20, fontWeight: '900', color: H.primaire },
  section: { marginTop: 22, marginBottom: 8, fontSize: 15, fontWeight: '900', color: H.texte },
  carte: {
    borderRadius: rayons.m, overflow: 'hidden', backgroundColor: H.surface,
    borderWidth: 1, borderColor: H.bordure,
  },
  ligne: {
    minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: H.bordure,
  },
  rang: { width: 24, fontSize: 12, fontWeight: '900', color: H.primaire },
  nom: { fontSize: 12, fontWeight: '800', color: H.texte },
  meta: { marginTop: 2, fontSize: 9, color: H.texteFaible },
  montant: { fontSize: 11, fontWeight: '900', color: H.texte },
  badge: {
    minWidth: 30, textAlign: 'center', paddingVertical: 4, paddingHorizontal: 7,
    borderRadius: 12, backgroundColor: H.primaireClair, color: H.primaire,
    fontSize: 11, fontWeight: '900',
  },
  vide: { padding: 18, textAlign: 'center', color: H.texteFaible, fontSize: 11 },
});
