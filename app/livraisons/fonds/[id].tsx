import { useCallback, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { useSession } from '../../_layout';
import { type Signature } from '../../../src/domain/livraisons';
import {
  AccesLivreurRefuse, actualiserFonds, actualiserMission, enfilerAction,
  enfilerDeclarationFonds, lireFonds, ouvrirPieceLivraison, synchroniserLivraisons, type PieceLivraison,
} from '../../../src/services/livraisons';
import { BoutonLivraison, SignatureTactile, stylesLivraison as s, useSessionLivreur } from '../../../src/ui/livraisons';

type Donnees = Awaited<ReturnType<typeof lireFonds>>;
type Mode = 'especes' | 'mobile_money' | 'declaration';
const LIBELLES: Record<string, string> = {
  A_REVERSER: 'À reverser',
  EN_ATTENTE_CONFIRMATION: 'En attente de confirmation',
  REVERSE: 'Reversé',
  REVERSEE: 'Reversée',
  DECLAREE: 'Déclarée au bureau',
  A_RECOMPTER: 'À recompter',
  A_REDECLARER: 'À redéclarer',
  ECART: 'Écart à traiter',
};

export default function FondsMission() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const missionId = /^\d+$/.test(id ?? '') ? Number(id) : 0;
  const router = useRouter();
  const session = useSessionLivreur();
  const { boutique, fermerSession } = useSession();
  const [etat, setEtat] = useState<Donnees | null>(null);
  const [attente, setAttente] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [montant, setMontant] = useState('');
  const [signature, setSignature] = useState<Signature>([]);
  const [trace, setTrace] = useState(false);
  const [message, setMessage] = useState('');
  const [refuse, setRefuse] = useState(false);
  const [pieceAttente, setPieceAttente] = useState(false);

  const charger = useCallback(async (active: () => boolean = () => true) => {
    if (!session || !missionId) return;
    setAttente(true);
    try {
      const cache = await lireFonds(session, missionId);
      if (active()) setEtat(cache);
      await synchroniserLivraisons(session);
      await actualiserMission(session, missionId);
      await actualiserFonds(session, missionId);
      const donnees = await lireFonds(session, missionId);
      if (active()) {
        setEtat(donnees);
        setMessage('');
        setRefuse(false);
      }
    } catch (erreur) {
      if (!active()) return;
      if (erreur instanceof AccesLivreurRefuse) {
        setEtat(null);
        setRefuse(true);
        setMessage(erreur.message);
      } else {
        const cache = await lireFonds(session, missionId).catch(() => null);
        if (active()) {
          setEtat(cache);
          setMessage('Fonds non actualisés. Les écritures restent à confirmer par le serveur.');
        }
      }
    } finally {
      if (active()) setAttente(false);
    }
  }, [missionId, session]);

  useFocusEffect(useCallback(() => {
    let actif = true;
    void charger(() => actif);
    return () => { actif = false; };
  }, [charger]));

  function choisir(nouveau: Mode | null) {
    setMode(nouveau);
    setMontant('');
    setSignature([]);
    setTrace(false);
  }

  async function enregistrer() {
    if (!session || !etat?.fonds || !mode || attente) return;
    const valeur = montant.trim().replace(',', '.');
    setAttente(true);
    setMessage('');
    try {
      if (mode === 'declaration') {
        await enfilerDeclarationFonds(session, missionId, etat.fonds.version, valeur, signature);
      } else {
        await enfilerAction(session, missionId, etat.fonds.version, {
          type: 'encaisser', donnees: { montant: valeur, mode },
        });
      }
      choisir(null);
      await charger();
    } catch (erreur) {
      if (erreur instanceof AccesLivreurRefuse) {
        setEtat(null);
        setRefuse(true);
      }
      setMessage(erreur instanceof Error ? erreur.message : 'Enregistrement impossible.');
      setAttente(false);
    }
  }

  const fonds = etat?.fonds;
  const versionConfirmee = Boolean(fonds && fonds.version === etat?.versionMission && !etat?.operations.length);
  const formater = (valeur: string) => `${valeur.replace('.', ',')} ${boutique.devise}`;
  const revenir = () => router.canGoBack() ? router.back() : router.replace('/livraisons');

  async function partager(code: PieceLivraison) {
    if (!session || pieceAttente) return;
    setPieceAttente(true);
    try {
      await ouvrirPieceLivraison(session, missionId, code, 'partager');
    } catch (erreur) {
      if (erreur instanceof AccesLivreurRefuse) {
        setEtat(null);
        setRefuse(true);
      }
      setMessage(erreur instanceof Error ? erreur.message : 'Document indisponible.');
    } finally {
      setPieceAttente(false);
    }
  }

  return (
    <SafeAreaView style={s.ecran}>
      <View style={s.entete}>
        <BoutonLivraison titre="‹ Retour" action={revenir} />
        <Text accessibilityRole="header" style={s.titre}>Encaissement</Text>
        <BoutonLivraison titre="Actualiser" desactive={attente} action={() => { void charger(); }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.contenu} scrollEnabled={!trace} keyboardShouldPersistTaps="handled">
        {message ? <Text style={s.faible} accessibilityLiveRegion="polite">{message}</Text> : null}
        {refuse ? <BoutonLivraison titre="Se reconnecter" action={fermerSession} /> : null}
        {!fonds ? <Text style={s.faible}>{attente ? 'Chargement…' : 'Les fonds de cette mission sont indisponibles.'}</Text> : <>
          <View style={s.bloc}>
            <Text style={s.soustitre}>Montants confirmés</Text>
            <View style={s.ligne}><Text style={s.texte}>Reste dû</Text><Text style={s.soustitre}>{formater(fonds.reste_du)}</Text></View>
            <View style={s.ligne}><Text style={s.texte}>À percevoir</Text><Text style={s.soustitre}>{formater(fonds.a_percevoir)}</Text></View>
            <View style={s.ligne}><Text style={s.texte}>Espèces à reverser</Text><Text style={s.soustitre}>{formater(fonds.a_reverser)}</Text></View>
          </View>
          {etat?.operations.length ? <View style={s.bloc}>
            {etat.operations.map((operation) => <Text key={operation.cle} style={operation.statut === 'CONFLIT' ? s.erreur : s.attendu}>
              {operation.type === 'declarer_fonds' ? 'Déclaration d’espèces' : 'Opération de mission'}
              {' · '}{operation.statut === 'CONFLIT' ? (operation.erreur ?? 'À vérifier') : 'À synchroniser'}
            </Text>)}
          </View> : null}
          {mode ? <View style={s.bloc}>
            <View style={s.ligne}>
              <Text style={s.soustitre}>{mode === 'declaration' ? 'Remise d’espèces' : mode === 'especes' ? 'Espèces reçues' : 'Mobile Money'}</Text>
              <BoutonLivraison titre="Fermer" desactive={attente} action={() => choisir(null)} />
            </View>
            <TextInput accessibilityLabel="Montant" placeholder="Montant" value={montant} onChangeText={setMontant}
              keyboardType="decimal-pad" style={s.input} maxLength={15} />
            {mode === 'declaration' ? <>
              <Text style={s.faible}>Le caissier comptera et confirmera la remise au bureau.</Text>
              <SignatureTactile valeur={signature} changer={setSignature} tracer={setTrace} />
            </> : null}
            {mode === 'mobile_money' ? <Text style={s.faible}>La déclaration restera en attente de confirmation du paiement.</Text> : null}
            <BoutonLivraison titre="Enregistrer" principal desactive={attente || !versionConfirmee}
              action={() => { void enregistrer(); }} />
          </View> : <View style={s.actions}>
            {fonds.peut_encaisser ? <>
              <BoutonLivraison titre="Saisir des espèces" principal desactive={!versionConfirmee} action={() => choisir('especes')} />
              <BoutonLivraison titre="Déclarer Mobile Money" desactive={!versionConfirmee} action={() => choisir('mobile_money')} />
            </> : null}
            {fonds.peut_declarer ? <BoutonLivraison titre="Déclarer la remise" desactive={!versionConfirmee}
              action={() => choisir('declaration')} /> : null}
          </View>}
          {fonds.encaissements.length || fonds.remises.length ? <View style={s.bloc}>
            <Text style={s.soustitre}>Historique confirmé</Text>
            {fonds.encaissements.map((item) => <View key={item.id} style={s.ligne}>
              <Text style={s.texte}>{formater(item.montant)} · {item.mode === 'especes' ? 'Espèces' : 'Mobile Money'}</Text>
              <Text style={s.faible}>{LIBELLES[item.statut] ?? item.statut}</Text>
            </View>)}
            {fonds.remises.map((item) => <View key={item.id} style={s.ligne}>
              <Text style={s.texte}>Remise · {formater(item.montant_declare)}</Text>
              <Text style={s.faible}>{LIBELLES[item.statut] ?? item.statut}</Text>
            </View>)}
            <View style={s.actions}>
              {fonds.encaissements.some((item) => item.mode === 'especes' && item.statut !== 'EN_ATTENTE_CONFIRMATION')
                ? <BoutonLivraison titre="Partager le reçu" desactive={pieceAttente} action={() => { void partager('D08'); }} /> : null}
              {fonds.remises.length ? <BoutonLivraison titre="Partager le bordereau" desactive={pieceAttente}
                action={() => { void partager('D11'); }} /> : null}
            </View>
          </View> : null}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}
