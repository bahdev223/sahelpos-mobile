import { useCallback, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Network from 'expo-network';

import { useSession } from '../_layout';
import { LIBELLES_MISSION, type Mission } from '../../src/domain/livraisons';
import {
  AccesLivreurRefuse, actualiserMission, actualiserMissions, lireMissions, synchroniserLivraisons,
  type VueMission,
} from '../../src/services/livraisons';
import { reconcilierGps } from '../../src/services/livraison-gps';
import { BoutonLivraison, stylesLivraison as s, useSessionLivreur } from '../../src/ui/livraisons';

const FILTRES = ['Toutes', 'Aujourd’hui', 'En cours', 'À confirmer'] as const;
const ETATS_TERMINES = new Set(['LIVREE', 'LIVREE_PARTIELLEMENT', 'RETOUR_RECU', 'ANNULEE']);

export default function MesLivraisons() {
  const router = useRouter();
  const session = useSessionLivreur();
  const { boutique, fermerSession } = useSession();
  const [missions, setMissions] = useState<VueMission[]>([]);
  const [filtre, setFiltre] = useState<(typeof FILTRES)[number]>('Toutes');
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [message, setMessage] = useState('');
  const rafraichir = useRef<() => void>(() => {});

  useFocusEffect(useCallback(() => {
    if (!session) return;
    let active = true;
    let enCours = false;
    async function charger() {
      if (!session || enCours) return;
      enCours = true;
      if (active) setChargement(true);
      try {
        const cache = await lireMissions(session).catch((error) => {
          if (error instanceof AccesLivreurRefuse) return [];
          throw error;
        });
        if (active) setMissions(cache);
        await synchroniserLivraisons(session).catch(() => {});
        const serveur = await actualiserMissions(session);
        if (active) {
          setMissions(await lireMissions(session));
          setMessage('');
        }
        const aPrecharger = serveur.filter(({ statut }) => !ETATS_TERMINES.has(statut));
        for (let i = 0; i < aPrecharger.length && active; i += 4) {
          await Promise.all(aPrecharger.slice(i, i + 4).map(({ id }) => actualiserMission(session, id).catch(() => {})));
        }
        if (active) setMissions(await lireMissions(session));
      } catch (error) {
        if (active) {
          if (error instanceof AccesLivreurRefuse) setMissions([]);
          setMessage(error instanceof AccesLivreurRefuse
            ? error.message
            : 'Actualisation indisponible. Les missions déjà téléchargées restent accessibles.');
        }
      } finally {
        enCours = false;
        if (active) setChargement(false);
        void reconcilierGps().catch(() => {});
      }
    }
    rafraichir.current = () => { void charger(); };
    void charger();
    const etat = AppState.addEventListener('change', (valeur) => { if (valeur === 'active') void charger(); });
    const reseau = Network.addNetworkStateListener((valeur) => {
      if (valeur.isConnected && valeur.isInternetReachable !== false) void charger();
    });
    const intervalle = setInterval(() => { if (AppState.currentState === 'active') void charger(); }, 60_000);
    return () => {
      active = false;
      etat.remove();
      reseau.remove();
      clearInterval(intervalle);
      rafraichir.current = () => {};
    };
  }, [session]));

  const date = new Date().toDateString();
  const aujourdHui = ({ creneau_debut, date_creation }: Mission) => new Date(creneau_debut ?? date_creation).toDateString() === date;
  const resultats = missions.filter(({ mission, enAttente, conflits }) => {
    if (filtre === 'Aujourd’hui' && !aujourdHui(mission)) return false;
    if (filtre === 'En cours' && !['AFFECTEE', 'CHARGEMENT', 'CHARGEE', 'EN_COURS'].includes(mission.statut)) return false;
    if (filtre === 'À confirmer' && !enAttente && !conflits) return false;
    return `${mission.numero} ${mission.destinataire}`.toLocaleLowerCase('fr').includes(recherche.trim().toLocaleLowerCase('fr'));
  });

  return (
    <SafeAreaView style={s.ecran}>
      <View style={s.entete}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={s.titre}>Mes livraisons</Text>
          <Text style={s.faible}>{boutique.nom} · {session?.utilisateur.nom ?? session?.utilisateur.login}</Text>
        </View>
        <BoutonLivraison titre="Mon compte" action={() => router.push('/livraisons/compte')} />
      </View>
      <FlatList
        data={resultats}
        keyExtractor={({ mission }) => String(mission.id)}
        contentContainerStyle={s.contenu}
        refreshControl={<RefreshControl refreshing={chargement} onRefresh={() => rafraichir.current()} />}
        ListHeaderComponent={<View style={{ gap: 8 }}>
          <BoutonLivraison titre="Mes tournées" action={() => router.push('/livraisons/tournees')} />
          <View style={s.ligne}>
            <Text style={s.soustitre}>{missions.filter(({ mission }) => aujourdHui(mission)).length} aujourd’hui</Text>
            <Text style={s.faible}>{missions.filter(({ mission }) => mission.statut === 'EN_COURS').length} en cours · {missions.filter(({ mission }) => ETATS_TERMINES.has(mission.statut)).length} terminée(s)</Text>
          </View>
          <TextInput accessibilityLabel="Rechercher une mission" style={s.input} value={recherche}
            onChangeText={setRecherche} placeholder="Référence ou destinataire" />
          <View style={s.actions}>
            {FILTRES.map((item) => <BoutonLivraison key={item} titre={item} principal={filtre === item} action={() => setFiltre(item)} />)}
          </View>
          {message ? <Text style={s.faible} accessibilityLiveRegion="polite">{message}</Text> : null}
          {message.includes('Reconnectez-vous') ? <BoutonLivraison titre="Se reconnecter" action={fermerSession} /> : null}
        </View>}
        ListEmptyComponent={<Text style={s.faible}>{chargement ? 'Chargement des missions…' : 'Aucune mission à afficher.'}</Text>}
        renderItem={({ item: { mission, enAttente, conflits } }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${mission.numero}, ${mission.destinataire}`}
            onPress={() => router.push({ pathname: '/livraisons/[id]', params: { id: String(mission.id) } })} style={s.bloc}>
            <View style={s.ligne}>
              <Text style={s.soustitre}>{mission.numero}</Text>
              <Text style={s.accent}>{LIBELLES_MISSION[mission.statut]}</Text>
            </View>
            <Text style={s.texte}>{mission.destinataire} · {mission.adresse}</Text>
            {mission.creneau_debut ? <Text style={s.faible}>{new Date(mission.creneau_debut).toLocaleString('fr-FR')}</Text> : null}
            {enAttente > 0 ? <Text style={s.attendu}>{enAttente} opération(s) à synchroniser</Text> : null}
            {conflits > 0 ? <Text style={s.erreur}>À vérifier avec le responsable</Text> : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
