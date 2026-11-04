import { useSession } from '../_layout';
import { InventaireVariantes } from '../../src/profile-ui/variants/InventaireVariantes';

export default function InventaireHabillement() {
  const { revisionSynchronisation, synchroniserMaintenant } = useSession();
  return <InventaireVariantes
    secteur="HABILLEMENT"
    revisionSynchronisation={revisionSynchronisation}
    synchroniserMaintenant={synchroniserMaintenant}
  />;
}
