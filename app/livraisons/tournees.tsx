import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LIBELLES_MISSION, type TourneeLivreur } from '../../src/domain/livraisons';
import { AccesLivreurRefuse, agirSurTournee, lireTournees } from '../../src/services/livraisons';
import { reconcilierGps } from '../../src/services/livraison-gps';
import { BoutonLivraison, stylesLivraison as s, useSessionLivreur } from '../../src/ui/livraisons';

const ETATS: Record<TourneeLivreur['statut'], string> = {
  PLANIFIEE: 'Planifiée', EN_COURS: 'En cours', CLOTUREE: 'Clôturée', ANNULEE: 'Annulée',
};

export default function MesTournees() {
  const router = useRouter();
  const session = useSessionLivreur();
  const [tournees, setTournees] = useState<TourneeLivreur[]>([]);
  const [attente, setAttente] = useState(false);
  const [message, setMessage] = useState('');
  const [cache, setCache] = useState(false);

  const charger = useCallback(async (actif: () => boolean = () => true) => {
    if (!session) return;
    setAttente(true);
    try {
      const resultat = await lireTournees(session);
      if (actif()) {
        setTournees(resultat.tournees);
        setCache(resultat.cache);
        setMessage(resultat.cache ? 'Tournées téléchargées. Le départ et la clôture nécessitent une connexion.' : '');
      }
    } catch (erreur) {
      if (actif()) {
        setTournees([]);
        setCache(false);
        setMessage(erreur instanceof AccesLivreurRefuse ? erreur.message : 'Actualisation des tournées indisponible.');
      }
    } finally {
      if (actif()) setAttente(false);
    }
  }, [session]);

  useFocusEffect(useCallback(() => {
    let actif = true;
    void charger(() => actif);
    return () => { actif = false; };
  }, [charger]));

  async function agir(tournee: TourneeLivreur, type: 'partir' | 'cloturer') {
    if (!session || attente) return;
    setAttente(true);
    setMessage('');
    try {
      await agirSurTournee(session, tournee.id, type);
      await charger();
      if (type === 'cloturer') await reconcilierGps().catch(() => {});
    } catch (erreur) {
      if (erreur instanceof AccesLivreurRefuse) setTournees([]);
      setMessage(erreur instanceof Error ? erreur.message : 'Action indisponible. Actualisez avant de réessayer.');
      setAttente(false);
    }
  }

  return (
    <SafeAreaView style={s.ecran}>
      <View style={s.entete}>
        <BoutonLivraison titre="‹ Missions" action={() => router.replace('/livraisons')} />
        <Text accessibilityRole="header" style={s.titre}>Tournées</Text>
        <BoutonLivraison titre="Actualiser" desactive={attente} action={() => { void charger(); }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.contenu}
        refreshControl={<RefreshControl refreshing={attente} onRefresh={() => { void charger(); }} />}>
        {message ? <Text accessibilityLiveRegion="polite" style={s.faible}>{message}</Text> : null}
        {tournees.map((tournee) => <View key={tournee.id} style={s.bloc}>
          <View style={s.ligne}>
            <Text style={s.soustitre}>{tournee.nom}</Text>
            <Text style={s.accent}>{ETATS[tournee.statut]}</Text>
          </View>
          {tournee.arrets.map((arret) => <Pressable key={arret.livraison} accessibilityRole="button"
            style={[s.ligne, { minHeight: 44 }]} onPress={() => router.push({
              pathname: '/livraisons/[id]', params: { id: String(arret.livraison) },
            })}>
            <View style={{ flex: 1 }}>
              <Text style={s.texte}>{arret.ordre}. {arret.numero} · {arret.destinataire}</Text>
              <Text style={s.faible}>{arret.adresse}</Text>
            </View>
            <Text style={s.faible}>{LIBELLES_MISSION[arret.statut]}</Text>
          </Pressable>)}
          {tournee.statut === 'PLANIFIEE' ? <BoutonLivraison titre="Démarrer la tournée" desactive={attente || cache} principal
            action={() => { void agir(tournee, 'partir'); }} /> : null}
          {tournee.statut === 'EN_COURS' ? <BoutonLivraison titre="Clôturer la tournée" desactive={attente || cache}
            action={() => { void agir(tournee, 'cloturer'); }} /> : null}
        </View>)}
        {!tournees.length && !message && !attente ? <Text style={s.faible}>Aucune tournée affectée.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
