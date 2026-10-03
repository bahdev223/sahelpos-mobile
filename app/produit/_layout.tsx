import { Redirect, Stack, usePathname } from 'expo-router';
import { useSession } from '../_layout';
import { destinationProduitHabillement } from '../../src/domain/navigation-habillement';

export default function DispositionProduit() {
  const { profilCommerce } = useSession();
  const chemin = usePathname();
  const destination = profilCommerce?.secteur === 'HABILLEMENT' ? destinationProduitHabillement(chemin) : null;
  if (destination && 'creation' in destination) return <Redirect href="/habillement/modele/nouveau" />;
  if (destination && 'id' in destination) {
    return <Redirect href={{ pathname: '/habillement/modele/[id]',
      params: { id: destination.id, modifier: destination.modifier ? '1' : '0' } }} />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
