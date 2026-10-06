import { useSession } from '../_layout';
import { InventaireVariantes } from '../../src/profile-ui/variants/InventaireVariantes';

export default function InventaireElectricite() {
  const { profilCommerce, revisionSynchronisation, synchroniserMaintenant } = useSession();
  return <InventaireVariantes
    secteur={profilCommerce?.secteur ?? 'ELECTRICITE'}
    revisionSynchronisation={revisionSynchronisation}
    synchroniserMaintenant={synchroniserMaintenant}
  />;
}
