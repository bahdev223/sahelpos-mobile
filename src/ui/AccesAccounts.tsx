import { useRef, useState } from "react";
import {
  Modal,
  Image,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import {
  accountsRequest,
  ouvrirAccounts,
  preparerProfil,
  resoudreQr,
  type AccountsSession,
  type QrInfo,
} from "../services/accounts";
import { initialiserPinAccounts } from "../services/auth";
import type { Utilisateur } from "../domain/types";
import { Bouton, Erreur, couleurs, espaces } from "./components";
import {
  CLES_PARAMETRES,
  ecrireParametres,
  useSession,
} from "../../app/_layout";
import { BOUTIQUE_INITIALE, donneesBoutiqueAccounts, validerBoutique, type DonneesBoutique } from "../domain/inscription";
import { ActivitesInscription } from './inscription/Activites';
import { ActionCreation, ChampsBoutiqueCreation, PanneauCreation, ProgressionCreation, s as creationStyles } from './inscription/Champs';

export default function AccesAccounts({ boutiqueInitiale, inscription = false, desactive = false }: {
  boutiqueInitiale?: DonneesBoutique; inscription?: boolean; desactive?: boolean;
} = {}) {
  const { recharger, ouvrirSession } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [open, setOpen] = useState(false),
    [camera, setCamera] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [qr, setQr] = useState<{ token: string; info: QrInfo } | null>(null),
    [session, setSession] = useState<AccountsSession | null>(null),
    [prepared, setPrepared] = useState<{
      user: Utilisateur;
      needsPin: boolean;
    } | null>(null);
  const [approved, setApproved] = useState(false),
    [pin, setPin] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [business, setBusiness] = useState(() => donneesBoutiqueAccounts(boutiqueInitiale ?? BOUTIQUE_INITIALE));
  const [etapeBoutique, setEtapeBoutique] = useState<1 | 2>(boutiqueInitiale?.secteur ? 2 : 1);
  const [erreursBoutique, setErreursBoutique] = useState<Record<string,string>>({});
  const creationEnCours = useRef(false);
  const [key, setKey] = useState("");
  const scanLatch = useRef(false);
  function reset() {
    setBusiness(donneesBoutiqueAccounts(boutiqueInitiale ?? BOUTIQUE_INITIALE));
    setEtapeBoutique(boutiqueInitiale?.secteur ? 2 : 1);
    setErreursBoutique({});
    setError("");
    setQr(null);
    setSession(null);
    setPrepared(null);
    setApproved(false);
    setPin("");
    setConfirmation("");
    setKey(
      Array.from(Crypto.getRandomBytes(16), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join(""),
    );
  }
  async function scan() {
    scanLatch.current = false;
    reset();
    setOpen(true);
    setCamera(true);
    if (!permission?.granted) await requestPermission();
  }
  async function scanned(text: string) {
    if (!camera || busy || scanLatch.current) return;
    scanLatch.current = true;
    setCamera(false);
    setBusy(true);
    setError("");
    try {
      const result = await resoudreQr(text);
      setQr({ token: result.reference.token, info: result.info });
    } catch (e) {
      setError(e instanceof Error ? e.message : "QR code invalide.");
    } finally {
      setBusy(false);
    }
  }
  async function finish(user: Utilisateur) {
    await ecrireParametres({
      [CLES_PARAMETRES.installation]: "1",
      [CLES_PARAMETRES.dernierUtilisateur]: String(user.id),
    });
    await recharger();
    setOpen(false);
    setSession(null);
    ouvrirSession(user);
  }
  async function provision(s: AccountsSession, id: number) {
    setBusy(true);
    setError("");
    try {
      const result = await preparerProfil(s, id);
      setPrepared(result);
      if (!result.needsPin) await finish(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrôlement impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function enter(s: AccountsSession) {
    setSession(s);
    if (s.utilisateur.boutiques.length === 1)
      await provision(s, s.utilisateur.boutiques[0].id);
  }
  async function auth(provider: "google" | "accounts", fresh = false) {
    if (fresh) reset();
    setOpen(true);
    setCamera(false);
    setBusy(true);
    setError("");
    try {
      const result = await ouvrirAccounts(
        provider,
        qr?.info.type === "INVITATION" && !fresh ? qr.token : undefined,
      );
      if (!result) return;
      setSession(result);
      if (qr?.info.type !== "LOGIN" || fresh) await enter(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function approve() {
    if (!session || !qr) return;
    setBusy(true);
    setError("");
    try {
      await accountsRequest(`/public/qr/${qr.token}/approve/`, session, {
        confirm: true,
      });
      setApproved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Autorisation impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function createShop() {
    if (!session || creationEnCours.current) return;
    const erreurs = validerBoutique(business);
    setErreursBoutique(erreurs);
    if (Object.keys(erreurs).length) {
      setError(Object.values(erreurs)[0]);
      if (erreurs.secteur) setEtapeBoutique(1);
      return;
    }
    creationEnCours.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await accountsRequest<{
        utilisateur: AccountsSession["utilisateur"];
      }>("/auth/onboarding/", session, { ...donneesBoutiqueAccounts(business), key });
      await enter({ ...session, utilisateur: result.utilisateur });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible.");
    } finally {
      creationEnCours.current = false;
      setBusy(false);
    }
  }
  async function setupPin() {
    if (!prepared) return;
    if (pin !== confirmation) {
      setError("Les deux PIN ne correspondent pas.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await finish(await initialiserPinAccounts(prepared.user.idLocal, pin));
    } catch (e) {
      setError(e instanceof Error ? e.message : "PIN invalide.");
    } finally {
      setBusy(false);
    }
  }
  const needsShop =
    session && !prepared && (qr?.info.type !== "LOGIN" || approved);
  return (
    <View style={styles.buttons}>
      <Bouton
        titre="Continuer avec Google"
        icone={<Image source={require('../../assets/google-g.png')} style={{ width: 20, height: 20 }} accessible={false} />}
        variante="secondaire"
        grand
        enCours={busy}
        desactive={desactive}
        onPress={() => void auth("google", true)}
      />
      {!inscription ? <Bouton
        titre="▣  Scanner un QR code"
        grand
        variante="secondaire"
        desactive={busy}
        onPress={() => void scan()}
      /> : null}
      <Bouton
        titre="Identifiant et mot de passe SahelTech"
        variante="discret"
        desactive={busy || desactive}
        onPress={() => void auth("accounts", true)}
      />
      {!inscription ? <Text style={styles.or}>ou utilisez votre profil et PIN habituels</Text> : null}
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => {
          if (!busy) {
            setOpen(false);
            setCamera(false);
            setSession(null);
          }
        }}
      >
        <SafeAreaView style={styles.screen}>
          <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>
              {camera
                ? "Scanner un QR code"
                : prepared
                  ? "Votre code local"
                  : qr?.info.type === "INVITATION"
                    ? `${qr.info.boutique} vous invite`
                    : "Connexion SahelTech"}
            </Text>
            <Erreur message={error} />
            {camera &&
              (permission?.granted ? (
                <>
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={(result) => void scanned(result.data)}
                  />
                  <Text>Placez le QR code SahelPOS dans le cadre.</Text>
                </>
              ) : (
                <>
                  <Text>
                    Autorisez la caméra pour scanner une invitation ou une
                    connexion.
                  </Text>
                  <Bouton
                    titre="Autoriser la caméra"
                    onPress={() => void requestPermission()}
                  />
                </>
              ))}
            {qr?.info.type === "INVITATION" && !prepared && (
              <Text>
                Vous rejoindrez cette boutique comme{" "}
                {qr.info.role === "gerant" ? "Gérant" : "Vendeur"}. Utilisez le
                compte correspondant à l’email invité.
              </Text>
            )}
            {!session && !camera && (
              <>
                <Bouton
                  titre="Continuer avec Google"
                  icone={<Image source={require('../../assets/google-g.png')} style={{ width: 20, height: 20 }} accessible={false} />}
                  variante="secondaire"
                  enCours={busy}
                  onPress={() => void auth("google")}
                />
                <Bouton
                  titre="Se connecter avec SahelTech"
                  variante="secondaire"
                  desactive={busy}
                  onPress={() => void auth("accounts")}
                />
              </>
            )}
            {session && qr?.info.type === "LOGIN" && !approved && (
              <>
                <Text>
                  Autorisez uniquement une session que vous avez vous-même
                  ouverte. Le code affiché sur l’autre appareil doit être{" "}
                  {qr.info.confirmation_code}.
                </Text>
                <Text>Compte : {session.utilisateur.email}</Text>
                <Bouton
                  titre="Autoriser cette session"
                  enCours={busy}
                  onPress={() => void approve()}
                />
              </>
            )}
            {approved && (
              <Text>Session autorisée. Continuez sur l’autre appareil.</Text>
            )}
            {needsShop && session.utilisateur.boutiques.length > 0 && (
              <>
                <Text>Choisissez la boutique de ce téléphone.</Text>
                {session.utilisateur.boutiques.map((shop) => (
                  <Bouton
                    key={shop.id}
                    titre={`${shop.nom} · ${shop.role}`}
                    desactive={busy}
                    onPress={() => void provision(session, shop.id)}
                  />
                ))}
              </>
            )}
            {needsShop && session.utilisateur.boutiques.length === 0 && (
              <View style={creationStyles.carte}>
                <ProgressionCreation etape={etapeBoutique}/>
                <Text style={creationStyles.titre} accessibilityRole="header">{etapeBoutique === 1 ? 'Quel commerce créez-vous ?' : 'Finalisez la création de votre boutique'}</Text>
                {etapeBoutique === 1 ? <>
                  <ActivitesInscription valeur={business.secteur} surChoisir={secteur => setBusiness({...business,secteur})} disabled={busy}/>
                  <ActionCreation titre="Continuer" disabled={!business.secteur || busy} onPress={() => setEtapeBoutique(2)}/>
                </> : <View style={{gap:14}}>
                  <ChampsBoutiqueCreation data={business} onChange={setBusiness} surActivite={() => setEtapeBoutique(1)} disabled={busy} erreurs={erreursBoutique}/>
                  <PanneauCreation titre="Mon compte">
                    <Text style={creationStyles.label}>{session.utilisateur.nom || session.utilisateur.email}</Text>
                    <Text style={creationStyles.aide}>Votre compte est connecté. Aucun mot de passe supplémentaire n’est nécessaire.</Text>
                  </PanneauCreation>
                  <Text style={creationStyles.aide}>14 jours d’essai gratuit · Sans paiement à l’ouverture</Text>
                  <ActionCreation titre="Retour" secondaire disabled={busy} onPress={() => setEtapeBoutique(1)}/>
                  <ActionCreation titre="Créer ma boutique" busy={busy} onPress={() => void createShop()}/>
                </View>}
              </View>
            )}
            {prepared?.needsPin && (
              <>
                <Text>
                  {prepared.user.nom || prepared.user.login} · Ce PIN servira à
                  ouvrir la caisse hors ligne.
                </Text>
                <TextInput
                  style={styles.input}
                  accessibilityLabel="PIN local"
                  placeholder="PIN : 4 à 9 chiffres"
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={9}
                  value={pin}
                  onChangeText={setPin}
                />
                <TextInput
                  style={styles.input}
                  accessibilityLabel="Confirmer le PIN"
                  placeholder="Confirmer le PIN"
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={9}
                  value={confirmation}
                  onChangeText={setConfirmation}
                />
                <Bouton
                  titre="Ouvrir SahelPOS"
                  enCours={busy}
                  desactive={pin.length < 4 || busy}
                  onPress={() => void setupPin()}
                />
              </>
            )}
            <Bouton
              titre="Fermer"
              variante="discret"
              desactive={busy}
              onPress={() => {
                setOpen(false);
                setCamera(false);
                setSession(null);
              }}
            />
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  buttons: { gap: 10, marginVertical: 12 },
  or: { textAlign: "center", color: couleurs.texteFaible },
  screen: { flex: 1, backgroundColor: couleurs.fond },
  content: { padding: espaces.l, gap: 14 },
  title: { fontSize: 24, fontWeight: "700", color: couleurs.texte },
  camera: { height: 360, borderRadius: 16 },
  input: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: 14,
    borderRadius: 12,
    color: couleurs.texte,
  },
});
