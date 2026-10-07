import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface Props {
  visible: boolean;
  onClose: () => void;
  onValue: (value: string) => void;
}

export default function QrInvitationScanner({ visible, onClose, onValue }: Props) {
  const [permission, demanderPermission] = useCameraPermissions();
  const [verrouille, setVerrouille] = useState(false);

  useEffect(() => {
    if (visible) setVerrouille(false);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.ecran}>
        <View style={styles.entete}>
          <Text style={styles.titre}>Scanner un QR SahelPOS</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.fermer}>Fermer</Text>
          </Pressable>
        </View>

        {!permission?.granted ? (
          <View style={styles.centre}>
            <Text style={styles.texte}>
              Autorisez la caméra pour lire le QR d'invitation affiché par le patron.
            </Text>
            <Pressable style={styles.bouton} onPress={() => void demanderPermission()}>
              <Text style={styles.boutonTexte}>Autoriser la caméra</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={
                verrouille
                  ? undefined
                  : ({ data }) => {
                      const valeur = String(data ?? '').trim();
                      if (!valeur) return;
                      setVerrouille(true);
                      onValue(valeur);
                    }
              }
            />
            <View style={styles.aide}>
              <Text style={styles.texte}>
                Placez le QR dans le cadre. SahelPOS vérifiera qu'il s'agit bien d'une invitation.
              </Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#07111f' },
  entete: {
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titre: { color: '#fff', fontSize: 20, fontWeight: '800' },
  fermer: { color: '#fff', fontSize: 15, fontWeight: '700' },
  camera: { flex: 1, margin: 18, borderRadius: 24, overflow: 'hidden' },
  centre: { flex: 1, justifyContent: 'center', padding: 28, gap: 18 },
  aide: { paddingHorizontal: 24, paddingBottom: 40 },
  texte: { color: '#d7e0ea', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  bouton: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
  },
  boutonTexte: { color: '#07111f', fontWeight: '800' },
});
