import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { DialogueModeleHabillement } from '../../../src/profile-ui/habillement/DialogueModele';
import { HABILLEMENT_MOBILE_THEME as H } from '../../../src/profile-ui/habillement/theme';

/** Point d'entrée historique, conservé pour les raccourcis et liens existants. */
export default function NouveauModeleHabillement() {
  const router = useRouter();
  return <View style={{ flex: 1, backgroundColor: H.fond }}>
    <DialogueModeleHabillement visible
      surFermer={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/catalogue')}
      surEnregistre={(id) => router.replace({ pathname: '/habillement/modele/[id]', params: { id: String(id) } })} />
  </View>;
}
