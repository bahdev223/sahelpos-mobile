import { useSession } from '../_layout';
import { InventaireVariantes } from '../../src/profile-ui/variants/InventaireVariantes';

export default function InventaireQuincaillerie() {
  const { profilCommerce, revisionSynchronisation, synchroniserMaintenant } = useSession();
  return <InventaireVariantes
    secteur={profilCommerce?.secteur ?? 'QUINCAILLERIE'}
    revisionSynchronisation={revisionSynchronisation}
    synchroniserMaintenant={synchroniserMaintenant}
  />;
}
