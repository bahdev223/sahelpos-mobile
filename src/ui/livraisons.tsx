import { useMemo, useRef, useState } from 'react';
import {
  Image, Pressable, StyleSheet, Text, View,
  type GestureResponderEvent, type StyleProp, type ViewStyle,
} from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { useSession } from '../../app/_layout';
import { estLivreur } from '../domain/accounts';
import type { LigneMission, Signature } from '../domain/livraisons';
import { ACCOUNTS_SERVEUR } from '../services/accounts';
import { creerSessionLivreur } from '../services/livraisons';
import { couleurs } from './components';
import { Icone } from './icones';

export function useSessionLivreur() {
  const { utilisateur } = useSession();
  return useMemo(() => utilisateur && estLivreur(utilisateur.role) ? creerSessionLivreur(utilisateur) : null, [utilisateur]);
}

export function BoutonLivraison({ titre, action, principal = false, desactive = false, style }: {
  titre: string; action: () => void; principal?: boolean; desactive?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: desactive }}
      disabled={desactive}
      onPress={action}
      style={({ pressed }) => [styles.bouton, principal && styles.boutonPrincipal, style, (pressed || desactive) && styles.diminue]}
    >
      <Text style={[styles.boutonTexte, principal && styles.boutonTextePrincipal]}>{titre}</Text>
    </Pressable>
  );
}

export function ArticleLivraison({ ligne }: { ligne: LigneMission }) {
  const [echec, setEchec] = useState(false);
  const uri = ligne.image?.startsWith('/media/') ? ACCOUNTS_SERVEUR + ligne.image : null;
  return (
    <View style={stylesLivraison.ligne}>
      <View style={styles.miniature}>
        {uri && !echec ? <Image source={{ uri }} onError={() => setEchec(true)} style={styles.miniature} />
          : <Icone nom="stock" taille={17} couleur={couleurs.texteFaible} />}
      </View>
      <Text style={[stylesLivraison.texte, { flex: 1 }]}>{ligne.libelle}{ligne.variante ? ` · ${ligne.variante}` : ''}</Text>
      <Text style={stylesLivraison.faible}>{Number(ligne.quantite_preparee)} {ligne.unite} préparé(s)</Text>
    </View>
  );
}

export function SignatureTactile({ valeur, changer, tracer }: {
  valeur: Signature; changer: (signature: Signature) => void; tracer: (active: boolean) => void;
}) {
  const dimensions = useRef({ largeur: 1, hauteur: 1 });
  const courant = useRef<Signature>(valeur);
  const active = useRef(false);

  function point(event: GestureResponderEvent): [number, number] {
    const { locationX, locationY } = event.nativeEvent;
    const { largeur, hauteur } = dimensions.current;
    const normaliser = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 1000);
    return [normaliser(locationX / largeur), normaliser(locationY / hauteur)];
  }

  function commencer(event: GestureResponderEvent) {
    if (courant.current.length >= 64 || courant.current.reduce((n, trait) => n + trait.length, 0) >= 4096) return;
    active.current = true;
    tracer(true);
    courant.current = [...courant.current, [point(event)]];
    changer(courant.current);
  }

  function continuer(event: GestureResponderEvent) {
    if (!active.current) return;
    const traits = courant.current;
    const trait = traits[traits.length - 1];
    if (!trait || trait.length >= 512 || traits.reduce((n, t) => n + t.length, 0) >= 4096) return;
    const suivant = point(event);
    const precedent = trait[trait.length - 1];
    if (Math.hypot(suivant[0] - precedent[0], suivant[1] - precedent[1]) < 3) return;
    courant.current = [...traits.slice(0, -1), [...trait, suivant]];
    changer(courant.current);
  }

  function finir() {
    active.current = false;
    tracer(false);
  }

  return (
    <>
      <View style={styles.signatureEntete}>
        <Text style={styles.libelle}>Signature au doigt</Text>
        <BoutonLivraison titre="Effacer" desactive={!valeur.length} action={() => {
          courant.current = [];
          changer([]);
        }} />
      </View>
      <View
        accessibilityLabel="Zone de signature tactile"
        style={styles.signature}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          dimensions.current = { largeur: width, hauteur: height };
        }}
        onStartShouldSetResponder={() => true}
        onResponderGrant={commencer}
        onResponderMove={continuer}
        onResponderRelease={finir}
        onResponderTerminate={finir}
        onResponderTerminationRequest={() => false}
      >
        {valeur.length ? (
          <Svg viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" pointerEvents="none">
            {valeur.map((trait, index) => <Polyline key={index} points={trait.map(([x, y]) => `${x},${y}`).join(' ')}
              stroke={couleurs.texte} strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" fill="none" />)}
          </Svg>
        ) : <Text pointerEvents="none" style={styles.secondaire}>Signez ici</Text>}
      </View>
    </>
  );
}

export const stylesLivraison = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  entete: { minHeight: 60, paddingHorizontal: 14, paddingVertical: 6, gap: 8, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', backgroundColor: couleurs.surface },
  titre: { fontSize: 21, fontWeight: '800', color: couleurs.texte },
  soustitre: { fontSize: 15, fontWeight: '700', color: couleurs.texte },
  texte: { fontSize: 14, color: couleurs.texte },
  faible: { fontSize: 12, color: couleurs.texteFaible },
  erreur: { fontSize: 13, color: couleurs.danger },
  accent: { color: couleurs.primaire, fontSize: 12, fontWeight: '700' },
  attendu: { color: '#854d0e', fontSize: 12, fontWeight: '700' },
  contenu: { padding: 12, paddingBottom: 24, gap: 10 },
  bloc: { padding: 12, borderRadius: 10, backgroundColor: couleurs.surface, borderColor: couleurs.bordure, borderWidth: 1, gap: 8 },
  ligne: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  input: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: couleurs.bordure, paddingHorizontal: 10,
    paddingVertical: 8, backgroundColor: couleurs.surface, color: couleurs.texte, fontSize: 15 },
});

const styles = StyleSheet.create({
  bouton: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: couleurs.bordure, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, backgroundColor: couleurs.surface },
  boutonPrincipal: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  boutonTexte: { color: couleurs.primaire, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  boutonTextePrincipal: { color: '#fff' },
  diminue: { opacity: 0.55 },
  miniature: { height: 32, width: 32, borderRadius: 6, backgroundColor: couleurs.surfaceDouce,
    alignItems: 'center', justifyContent: 'center' },
  signatureEntete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  libelle: { fontSize: 14, fontWeight: '600', color: couleurs.texte },
  secondaire: { color: couleurs.texteFaible },
  signature: { height: 145, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 8, alignItems: 'center',
    justifyContent: 'center', backgroundColor: '#fff', overflow: 'hidden' },
});
