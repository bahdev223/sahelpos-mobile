import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { useSession } from '../_layout';
import { libelleRole } from '../../src/domain/session';
import { arreterGps, gpsPourMission } from '../../src/services/livraison-gps';
import { lireAutorisationGps, lireMissions } from '../../src/services/livraisons';
import { BoutonLivraison, stylesLivraison as s, useSessionLivreur } from '../../src/ui/livraisons';

export default function CompteLivreur() {
  const { boutique, fermerSession } = useSession();
  const session = useSessionLivreur();
  const router = useRouter();
  const [gps, setGps] = useState(false);
  const [attente, setAttente] = useState<number | null>(null);
  const [erreur, setErreur] = useState('');

  useFocusEffect(useCallback(() => {
    if (!session) return;
    let active = true;
    void (async () => {
      try {
        const missions = await lireMissions(session);
        const grant = await lireAutorisationGps();
        const gpsActif = grant ? await gpsPourMission(grant.mission) : false;
        if (active) {
          setAttente(missions.reduce((total, mission) => total + mission.enAttente + mission.conflits, 0));
          setGps(gpsActif);
        }
      } catch {
        if (active) setAttente(null);
      }
    })();
    return () => { active = false; };
  }, [session]));

  return (
    <SafeAreaView style={s.ecran}>
      <View style={s.entete}>
        <BoutonLivraison titre="‹ Missions" action={() => router.replace('/livraisons')} />
        <Text accessibilityRole="header" style={s.titre}>Mon compte</Text>
        <View />
      </View>
      <View style={s.contenu}>
        <View style={s.bloc}>
          <Text style={s.soustitre}>{session?.utilisateur.nom || session?.utilisateur.login}</Text>
          <Text style={s.texte}>{boutique.nom}</Text>
          {session ? <Text style={s.faible}>{libelleRole(session.utilisateur.role)}</Text> : null}
          {attente === null ? null : <Text style={s.faible}>{attente} opération(s) à synchroniser ou à vérifier</Text>}
        </View>
        <View style={s.bloc}>
          <Text style={s.soustitre}>Position</Text>
          <Text style={s.faible}>{gps ? 'Suivi en cours pour une mission' : 'Aucun suivi de mission actif'}</Text>
          {gps ? <BoutonLivraison titre="Arrêter le GPS" action={() => {
            void arreterGps().then(() => setGps(false), () => setErreur('Impossible d’arrêter le GPS. Réessayez.'));
          }} /> : null}
        </View>
        {erreur ? <Text style={s.erreur}>{erreur}</Text> : null}
        <BoutonLivraison titre="Se déconnecter" action={fermerSession} />
      </View>
    </SafeAreaView>
  );
}
