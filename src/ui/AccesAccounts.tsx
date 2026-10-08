import { useRef, useState } from "react";
import {
  Modal,
  Image,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
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
import { SECTEURS_COMMERCE } from "../domain/commerce";

export default function AccesAccounts() {
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
  const [business, setBusiness] = useState({
    nom_boutique: "",
    telephone: "",
    ville: "",
    secteur: "COMMERCE_GENERAL",
  });
  const [key, setKey] = useState("");
  const scanLatch = useRef(false);
  function reset() {
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
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const result = await accountsRequest<{
        utilisateur: AccountsSession["utilisateur"];
      }>("/auth/onboarding/", session, { ...business, key });
      await enter({ ...session, utilisateur: result.utilisateur });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible.");
    } finally {
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
        onPress={() => void auth("google", true)}
      />
      <Bouton
        titre="▣  Scanner un QR code"
        grand
        variante="secondaire"
        desactive={busy}
        onPress={() => void scan()}
      />
      <Bouton
        titre="Identifiant et mot de passe SahelTech"
        variante="discret"
        desactive={busy}
        onPress={() => void auth("accounts", true)}
      />
      <Text style={styles.or}>ou utilisez votre profil et PIN habituels</Text>
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
              <>
                <Text>
                  Votre identité est prête. Complétez uniquement les
                  informations du commerce. Essai gratuit : 14 jours.
                </Text>
                <TextInput
                  style={styles.input}
                  accessibilityLabel="Nom de la boutique"
                  placeholder="Nom de la boutique"
                  value={business.nom_boutique}
                  onChangeText={(value) =>
                    setBusiness({ ...business, nom_boutique: value })
                  }
                />
                <TextInput
                  style={styles.input}
                  accessibilityLabel="Téléphone professionnel"
                  placeholder="Téléphone professionnel"
                  keyboardType="phone-pad"
                  value={business.telephone}
                  onChangeText={(value) =>
                    setBusiness({ ...business, telephone: value })
                  }
                />
                <TextInput
                  style={styles.input}
                  accessibilityLabel="Ville"
                  placeholder="Ville"
                  value={business.ville}
                  onChangeText={(value) =>
                    setBusiness({ ...business, ville: value })
                  }
                />
                <Text>Profil commerce</Text>
                {SECTEURS_COMMERCE.map((item) => (
                  <Bouton
                    key={item.code}
                    titre={`${business.secteur === item.code ? "✓ " : ""}${item.titre}`}
                    variante="secondaire"
                    onPress={() =>
                      setBusiness({ ...business, secteur: item.code })
                    }
                  />
                ))}
                <Bouton
                  titre="Créer ma boutique"
                  desactive={!business.nom_boutique.trim() || busy}
                  enCours={busy}
                  onPress={() => void createShop()}
                />
              </>
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
