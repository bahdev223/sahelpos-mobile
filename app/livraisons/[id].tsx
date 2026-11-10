import { useCallback, useRef, useState } from 'react';
import { Alert, AppState, Linking, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Network from 'expo-network';

import { useSession } from '../_layout';
import {
  colisDepuisQr, LIBELLES_MISSION, preparerRemise, preparerRetour, projectionMission, quantiteRestante,
  signatureValide, type ActionMission, type DetailMission, type Signature, type TypeOperationMission,
} from '../../src/domain/livraisons';
import {
  AccesLivreurRefuse, actualiserMission, classerConflitMission, enfilerAction, lireMission, synchroniserLivraisons,
  ouvrirPieceLivraison, type OperationMission, type PieceLivraison,
} from '../../src/services/livraisons';
import { activerGps, arreterGps, gpsPourMission, reconcilierGps } from '../../src/services/livraison-gps';
import { ArticleLivraison, BoutonLivraison, SignatureTactile, stylesLivraison as s, useSessionLivreur } from '../../src/ui/livraisons';

const LIBELLES_ACTION: Record<TypeOperationMission, string> = {
  prendre: 'Prise en charge', partir: 'Départ', livrer: 'Remise signée',
  incident: 'Incident', declarer_retour: 'Déclaration de retour', encaisser: 'Encaissement',
  declarer_fonds: 'Déclaration d’espèces',
};
type Formulaire = 'prendre' | 'livrer' | 'incident' | 'declarer_retour';

export default function FicheMission() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const missionId = /^\d+$/.test(id ?? '') ? Number(id) : 0;
  const router = useRouter();
  const session = useSessionLivreur();
  const { fermerSession } = useSession();
  const [mission, setMission] = useState<DetailMission | null>(null);
  const [operations, setOperations] = useState<OperationMission[]>([]);
  const [attente, setAttente] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [gps, setGps] = useState(false);
  const [gpsChargement, setGpsChargement] = useState(false);
  const [mode, setMode] = useState<Formulaire | null>(null);
  const [pointes, setPointes] = useState<string[]>([]);
  const [signature, setSignature] = useState<Signature>([]);
  const [receptionnaire, setReceptionnaire] = useState('');
  const [motif, setMotif] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [quantites, setQuantites] = useState<Record<number, string>>({});
  const [trace, setTrace] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [pieceAttente, setPieceAttente] = useState(false);
  const verrouScan = useRef(false);
  const [permissionCamera, demanderCamera] = useCameraPermissions();
  const rafraichir = useRef<() => void>(() => {});

  useFocusEffect(useCallback(() => {
    if (!session || !missionId) return;
    let active = true;
    let enCours = false;
    async function charger() {
      if (!session || enCours) return;
      enCours = true;
      if (active) setAttente(true);
      async function lire() {
        if (!session) return;
        const etat = await lireMission(session, missionId);
        if (active) {
          setMission(etat.mission);
          setOperations(etat.operations);
        }
      }
      try {
        await lire();
        await synchroniserLivraisons(session);
        await actualiserMission(session, missionId);
        await lire();
        if (active) setMessage('');
      } catch (error) {
        if (active) {
          if (error instanceof AccesLivreurRefuse) {
            setMission(null);
            setOperations([]);
            setMode(null);
            setScanner(false);
            setMessage(error.message);
          } else {
            await lire().catch(() => { if (active) setMission(null); });
            setMessage('Actualisation indisponible. Vérifiez les opérations en attente.');
          }
        }
      } finally {
        const enService = await gpsPourMission(missionId).catch(() => false);
        enCours = false;
        if (active) {
          setAttente(false);
          setGps(enService);
        }
      }
    }
    rafraichir.current = () => { void charger(); };
    void charger();
    const etat = AppState.addEventListener('change', (value) => { if (value === 'active') void charger(); });
    const reseau = Network.addNetworkStateListener((value) => {
      if (value.isConnected && value.isInternetReachable !== false) void charger();
    });
    const intervalle = setInterval(() => { if (AppState.currentState === 'active') void charger(); }, 60_000);
    return () => {
      active = false;
      rafraichir.current = () => {};
      etat.remove();
      reseau.remove();
      clearInterval(intervalle);
    };
  }, [missionId, session]));

  const projection = mission ? projectionMission(mission, operations) : null;

  function choisir(nouveau: Formulaire | null) {
    setMode(nouveau);
    setErreur('');
    setTrace(false);
    setSignature([]);
    setPointes([]);
    setReceptionnaire('');
    setMotif('');
    setCommentaire('');
    setQuantites(nouveau === 'livrer' && mission
      ? Object.fromEntries(mission.lignes.filter((ligne) => quantiteRestante(ligne) === 0).map(({ id }) => [id, '0']))
      : {});
  }

  async function enregistrer(construire: () => ActionMission) {
    if (!session || !mission || !projection || enregistrement) return;
    setErreur('');
    setEnregistrement(true);
    try {
      const action = construire();
      await enfilerAction(session, mission.id, projection.version, action);
      const etat = await lireMission(session, mission.id);
      setMission(etat.mission);
      setOperations(etat.operations);
      choisir(null);
      if (action.type === 'livrer' || action.type === 'incident') {
        setGps(false);
        await reconcilierGps().catch(() => {});
      }
      rafraichir.current();
    } catch (error) {
      if (error instanceof AccesLivreurRefuse) {
        setMission(null);
        setOperations([]);
      }
      setErreur(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setEnregistrement(false);
    }
  }

  async function ouvrirScanner() {
    setErreur('');
    try {
      const resultat = permissionCamera?.granted ? permissionCamera : await demanderCamera();
      if (!resultat.granted) throw new Error('Autorisez la caméra ou pointez les colis dans la liste.');
      verrouScan.current = false;
      setScanner(true);
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Caméra indisponible.');
    }
  }

  function scannerColis(texte: string) {
    if (!mission || verrouScan.current) return;
    verrouScan.current = true;
    setScanner(false);
    const colis = colisDepuisQr(texte, mission.colis);
    if (!colis) {
      setErreur('Ce QR ne correspond à aucun colis de cette mission.');
      return;
    }
    setErreur('');
    setPointes((avant) => avant.includes(colis) ? avant : [...avant, colis]);
  }

  async function changerGps() {
    if (!session || !mission || gpsChargement) return;
    setGpsChargement(true);
    setErreur('');
    try {
      if (gps) await arreterGps();
      else await activerGps(session, mission.id);
      setGps(await gpsPourMission(mission.id));
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'La localisation est indisponible.');
    } finally {
      setGpsChargement(false);
    }
  }

  async function itineraire(adresse: string) {
    try {
      await Linking.openURL(`geo:0,0?q=${encodeURIComponent(adresse)}`);
    } catch {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`)
        .catch(() => setErreur('Aucune application de navigation disponible.'));
    }
  }

  const revenir = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/livraisons');
  };

  const statut = projection?.statut;
  const retourPossible = mission && !operations.length
    && ['ECHEC', 'LIVREE_PARTIELLEMENT', 'LIVREE'].includes(mission.statut);
  const verrouille = enregistrement || Boolean(projection?.bloquee);
  const documents: Array<{ code: PieceLivraison; titre: string }> = [];
  if (mission?.evenements?.some(({ type }) => type === 'prendre')) documents.push({ code: 'D04', titre: 'Bordereau de chargement' });
  if (mission?.preuve) {
    documents.push({ code: 'D06', titre: 'Bon de livraison' }, { code: 'D07', titre: 'Accusé de réception' });
  }
  if (mission?.evenements?.some(({ type }) => type === 'declarer_retour')) documents.push({ code: 'D09', titre: 'Bon de retour' });
  if (mission?.evenements?.some(({ type }) => type === 'incident')) documents.push({ code: 'D10', titre: 'Constat d’incident' });

  async function ouvrirPiece(code: PieceLivraison, action: 'partager' | 'imprimer') {
    if (!session || !mission || pieceAttente) return;
    setPieceAttente(true);
    setErreur('');
    try {
      await ouvrirPieceLivraison(session, mission.id, code, action);
    } catch (error) {
      if (error instanceof AccesLivreurRefuse) setMission(null);
      setErreur(error instanceof Error ? error.message : 'Document indisponible.');
    } finally {
      setPieceAttente(false);
    }
  }

  function examinerConflit(cle: string) {
    if (!session || !mission) return;
    Alert.alert('Opération refusée', 'Actualisez auprès du responsable. Vous pouvez ensuite classer cette opération et celles qui en dépendent. Elles resteront conservées sur cet appareil.', [
      { text: 'Fermer', style: 'cancel' },
      { text: 'Actualiser et classer', onPress: () => {
        setErreur('');
        void classerConflitMission(session, mission.id, cle)
          .then(() => rafraichir.current(), (error) => setErreur(error instanceof Error ? error.message : 'Actualisation indisponible.'));
      } },
    ]);
  }
  return (
    <SafeAreaView style={s.ecran}>
      <View style={s.entete}>
        <BoutonLivraison titre="‹ Retour" action={revenir} />
        <Text accessibilityRole="header" style={s.titre}>{mission?.numero ?? 'Mission'}</Text>
        <BoutonLivraison titre="Actualiser" action={() => rafraichir.current()} desactive={attente} />
      </View>
      <ScrollView
        style={{ flex: 1 }} contentContainerStyle={s.contenu}
        scrollEnabled={!trace} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={attente && Boolean(missionId)} onRefresh={() => rafraichir.current()} />}
      >
        {message ? <Text accessibilityLiveRegion="polite" style={s.faible}>{message}</Text> : null}
        {erreur ? <Text accessibilityLiveRegion="polite" style={s.erreur}>{erreur}</Text> : null}
        {message.includes('Reconnectez-vous') ? <BoutonLivraison titre="Se reconnecter" action={fermerSession} /> : null}
        {mission && projection ? (
          <>
            <View style={s.bloc}>
              <View style={s.ligne}>
                <Text style={s.soustitre}>{mission.destinataire}</Text>
                <Text style={s.accent}>{LIBELLES_MISSION[mission.statut]}</Text>
              </View>
              <Text style={s.texte}>{mission.adresse}</Text>
              {mission.instructions ? <Text style={s.faible}>{mission.instructions}</Text> : null}
              {mission.creneau_debut ? <Text style={s.faible}>{new Date(mission.creneau_debut).toLocaleString('fr-FR')}</Text> : null}
              <View style={s.actions}>
                {mission.telephone ? <BoutonLivraison titre="Appeler" action={() => {
                  const tel = mission.telephone.replace(/[^0-9+]/g, '');
                  void Linking.openURL(`tel:${tel}`).catch(() => setErreur('Impossible d’ouvrir le téléphone.'));
                }} /> : null}
                <BoutonLivraison titre="Itinéraire" action={() => { void itineraire(mission.adresse); }} />
                {mission.encaissement_autorise ? <BoutonLivraison titre="Encaissement"
                  action={() => router.push({ pathname: '/livraisons/fonds/[id]', params: { id: String(mission.id) } })} /> : null}
              </View>
            </View>

            {operations.length ? <View style={s.bloc}>
              {operations.map((op) => <View key={op.cle} style={s.ligne}>
                <Text style={[op.statut === 'CONFLIT' ? s.erreur : s.attendu, { flex: 1 }]}>
                  {LIBELLES_ACTION[op.type]} · {op.statut === 'CONFLIT' ? (op.erreur || 'À vérifier') : 'À synchroniser'}
                </Text>
                {op.statut === 'CONFLIT' ? <BoutonLivraison titre="Examiner" action={() => examinerConflit(op.cle)} /> : null}
              </View>)}
            </View> : null}

            <View style={s.bloc}>
              <Text style={s.soustitre}>Articles · {mission.colis.length} colis</Text>
              {mission.lignes.map((ligne) => <ArticleLivraison key={ligne.id} ligne={ligne} />)}
              {mission.preuve ? <Text style={s.faible}>
                Remise confirmée à {mission.preuve.receptionnaire} · {new Date(mission.preuve.date).toLocaleString('fr-FR')}
              </Text> : null}
            </View>

            {statut === 'EN_COURS' || gps ? <View style={s.bloc}>
              <View style={s.ligne}>
                <View style={{ flex: 1 }}>
                  <Text style={s.soustitre}>Position de livraison</Text>
                  <Text style={s.faible}>{gps ? 'Suivi activé pour cette mission' : 'Suivi désactivé'}</Text>
                </View>
                <BoutonLivraison titre={gps ? 'Arrêter le GPS' : 'Activer le GPS'} desactive={gpsChargement || (!gps && verrouille)}
                  action={() => { void changerGps(); }} />
              </View>
              {!gps ? <Text style={s.faible}>Votre position est partagée pour cette mission, écran verrouillé compris, avec votre autorisation.</Text> : null}
            </View> : null}

            {!mode ? <View style={s.actions}>
              {statut === 'CHARGEMENT' ? <BoutonLivraison titre="Pointer les colis" principal desactive={verrouille} action={() => choisir('prendre')} /> : null}
              {statut === 'CHARGEE' ? <BoutonLivraison titre="Confirmer le départ" principal desactive={verrouille}
                action={() => { void enregistrer(() => ({ type: 'partir', donnees: {} })); }} /> : null}
              {statut === 'EN_COURS' ? <>
                <BoutonLivraison titre="Remettre la livraison" principal desactive={verrouille} action={() => choisir('livrer')} />
                <BoutonLivraison titre="Signaler un incident" desactive={verrouille} action={() => choisir('incident')} />
              </> : null}
              {retourPossible ? <BoutonLivraison titre="Déclarer un retour" desactive={verrouille} action={() => choisir('declarer_retour')} /> : null}
            </View> : <View style={s.bloc}>
              <View style={s.ligne}>
                <Text style={s.soustitre}>{LIBELLES_ACTION[mode]}</Text>
                <BoutonLivraison titre="Fermer" desactive={enregistrement} action={() => choisir(null)} />
              </View>
              {mode === 'prendre' ? <>
                <BoutonLivraison titre={`Scanner un QR · ${pointes.length}/${mission.colis.length}`} action={() => { void ouvrirScanner(); }} />
                {mission.colis.map((colis) => <Pressable key={colis.id} accessibilityRole="checkbox"
                  accessibilityState={{ checked: pointes.includes(colis.id) }} style={[s.ligne, { minHeight: 44 }]}
                  onPress={() => setPointes((avant) => avant.includes(colis.id)
                    ? avant.filter((idColis) => idColis !== colis.id) : [...avant, colis.id])}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.texte}>Colis {colis.numero}{colis.scelle ? ` · Scellé ${colis.scelle}` : ''}</Text>
                    {Object.entries(colis.contenu).map(([ligneId, quantite]) => <Text key={ligneId} style={s.faible}>
                      {mission.lignes.find(({ id }) => id === Number(ligneId))?.libelle ?? 'Article'} · {quantite}
                    </Text>)}
                  </View>
                  <Text style={s.accent}>{pointes.includes(colis.id) ? 'Pointé' : 'À pointer'}</Text>
                </Pressable>)}
              </> : null}
              {mode === 'livrer' || mode === 'declarer_retour' ? <>
                {mode === 'livrer' ? <TextInput accessibilityLabel="Nom du réceptionnaire" value={receptionnaire}
                  onChangeText={setReceptionnaire} maxLength={150} placeholder="Nom du réceptionnaire" style={s.input} /> : null}
                {mission.lignes.map((ligne) => <View key={ligne.id} style={s.ligne}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.texte}>{ligne.libelle}{ligne.variante ? ` · ${ligne.variante}` : ''} · {ligne.unite}</Text>
                    {mode === 'livrer' ? <Text style={s.faible}>{quantiteRestante(ligne)} à remettre</Text> : null}
                  </View>
                  <TextInput accessibilityLabel={`Quantité réelle · ${ligne.libelle}`} placeholder="Qté" keyboardType="decimal-pad"
                    style={[s.input, { width: 78 }]} value={quantites[ligne.id] ?? ''}
                    onChangeText={(texte) => setQuantites((avant) => ({ ...avant, [ligne.id]: texte }))} />
                </View>)}
              </> : null}
              {mode !== 'prendre' ? <TextInput accessibilityLabel="Motif" value={motif} maxLength={250}
                onChangeText={setMotif} placeholder={mode === 'livrer' ? 'Motif si remise partielle' : 'Motif'} style={s.input} /> : null}
              {mode === 'incident' ? <TextInput accessibilityLabel="Commentaire" value={commentaire}
                onChangeText={setCommentaire} maxLength={500} placeholder="Commentaire facultatif" style={s.input} /> : (
                <SignatureTactile key={mode} valeur={signature} changer={setSignature} tracer={setTrace} />
              )}
              <BoutonLivraison titre="Enregistrer" principal desactive={verrouille} action={() => {
                void enregistrer(() => {
                  if (mode === 'prendre') {
                    if (!signatureValide(signature) || pointes.length !== mission.colis.length) {
                      throw new Error('Pointez tous les colis et signez la prise en charge.');
                    }
                    return { type: mode, donnees: { colis: pointes, signature } };
                  }
                  if (mode === 'livrer') {
                    return { type: mode, donnees: preparerRemise(mission.lignes, quantites, receptionnaire, motif, signature) };
                  }
                  if (mode === 'declarer_retour') {
                    return { type: mode, donnees: preparerRetour(mission.lignes, quantites, motif, signature, mission.statut === 'LIVREE') };
                  }
                  if (!motif.trim()) throw new Error('Indiquez le motif de l’incident.');
                  return { type: mode, donnees: { motif: motif.trim(), commentaire: commentaire.trim() } };
                });
              }} />
            </View>}
            {mission.evenements?.length ? <View style={s.bloc}>
              <Text style={s.soustitre}>Activité confirmée</Text>
              {mission.evenements.slice(-8).reverse().map((evt) => <View key={evt.version} style={s.ligne}>
                <Text style={s.texte}>{LIBELLES_ACTION[evt.type as TypeOperationMission] ?? evt.type.replaceAll('_', ' ')}</Text>
                <Text style={s.faible}>{new Date(evt.date_serveur).toLocaleString('fr-FR')}</Text>
              </View>)}
            </View> : null}
            {documents.length ? <View style={s.bloc}>
              <Text style={s.soustitre}>Documents confirmés</Text>
              {documents.map(({ code, titre }) => <View key={code} style={s.ligne}>
                <Text style={[s.texte, { flex: 1 }]}>{titre}</Text>
                <BoutonLivraison titre="Partager" desactive={pieceAttente} action={() => { void ouvrirPiece(code, 'partager'); }} />
                <BoutonLivraison titre="Imprimer" desactive={pieceAttente} action={() => { void ouvrirPiece(code, 'imprimer'); }} />
              </View>)}
            </View> : null}
          </>
        ) : <Text style={s.faible}>{attente && missionId ? 'Chargement…' : 'Fiche indisponible. Actualisez vos missions.'}</Text>}
      </ScrollView>
      <Modal visible={scanner} onRequestClose={() => setScanner(false)} animationType="slide">
        <SafeAreaView style={s.ecran}>
          <View style={s.entete}>
            <Text style={s.titre}>QR du colis</Text>
            <BoutonLivraison titre="Fermer" action={() => setScanner(false)} />
          </View>
          {scanner ? <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => scannerColis(data)} /> : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
