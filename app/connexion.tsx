/**
 * Connexion multi-profils.
 *
 * Le téléphone conserve plusieurs comptes locaux, mais une seule identité est
 * active à la fois. Changer de profil exige toujours son propre PIN (ou la
 * biométrie uniquement si elle est explicitement liée à ce profil).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  connecter,
  listerComptesConnexion,
  LONGUEUR_PIN_MAX,
  LONGUEUR_PIN_MIN,
  type CompteConnexion,
} from '../src/services/auth';
import { comptesPourConnexion, libelleRole } from '../src/domain/session';
import {
  Bouton,
  Chargement,
  Erreur,
  ListeVide,
  couleurs,
  espaces,
  rayons,
} from '../src/ui/components';

import {
  CLES_PARAMETRES,
  ecrireParametres,
  lireParametres,
  useSession,
} from './_layout';

type Etat = 'chargement' | 'pret' | 'erreur';

export function EcranConnexion() {
  const { boutique, ouvrirSession, recharger } = useSession();

  const [etat, setEtat] = useState<Etat>('chargement');
  const [messageErreur, setMessageErreur] = useState('');
  const [comptes, setComptes] = useState<CompteConnexion[]>([]);
  const [selection, setSelection] = useState<number | null>(null);
  const [pin, setPin] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [verification, setVerification] = useState(false);
  const [verificationBiometrie, setVerificationBiometrie] = useState(false);
  const [biometrieUtilisateurId, setBiometrieUtilisateurId] = useState<number | null>(null);
  const [biometrieDisponible, setBiometrieDisponible] = useState(false);
  const promptDemarre = useRef(false);

  const compte = comptes.find((item) => item.id === selection) ?? null;

  const charger = useCallback(async () => {
    setEtat('chargement');
    setMessageErreur('');
    setRefus(null);
    setPin('');
    promptDemarre.current = false;
    try {
      const [listeBrute, parametres] = await Promise.all([
        listerComptesConnexion(),
        lireParametres(),
      ]);
      const liste = comptesPourConnexion(listeBrute) as CompteConnexion[];
      const dernierId = Number(parametres[CLES_PARAMETRES.dernierUtilisateur] || 0) || null;
      const biometrieId = Number(parametres[CLES_PARAMETRES.biometrieUtilisateur] || 0) || null;

      let materiel = false;
      let enregistre = false;
      try {
        materiel = await LocalAuthentication.hasHardwareAsync();
        enregistre = materiel ? await LocalAuthentication.isEnrolledAsync() : false;
      } catch {
        materiel = false;
        enregistre = false;
      }

      const choisi =
        liste.find((u) => u.id === dernierId) ??
        liste.find((u) => u.id === biometrieId) ??
        liste[0] ??
        null;

      // Une association biométrique vers un compte supprimé/désactivé devient
      // invalide, mais ne touche pas aux autres profils.
      if (biometrieId && !liste.some((u) => u.id === biometrieId)) {
        await ecrireParametres({ [CLES_PARAMETRES.biometrieUtilisateur]: '0' }).catch(() => {});
      }

      setComptes(liste);
      setSelection(choisi?.id ?? null);
      setBiometrieUtilisateurId(
        biometrieId && liste.some((u) => u.id === biometrieId) ? biometrieId : null,
      );
      setBiometrieDisponible(materiel && enregistre);
      setEtat('pret');
    } catch (erreur) {
      setMessageErreur(
        erreur instanceof Error ? erreur.message : 'Les profils de ce terminal sont illisibles.',
      );
      setEtat('erreur');
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const selectionner = useCallback((id: number) => {
    setSelection(id);
    setPin('');
    setRefus(null);
    promptDemarre.current = false;
  }, []);

  const ouvrirParBiometrie = useCallback(async () => {
    if (
      !compte ||
      !biometrieDisponible ||
      biometrieUtilisateurId !== compte.id ||
      promptDemarre.current
    ) return;
    promptDemarre.current = true;
    setVerificationBiometrie(true);
    setRefus(null);
    try {
      const resultat = await LocalAuthentication.authenticateAsync({
        promptMessage: `Ouvrir le profil ${compte.nom || compte.login}`,
        cancelLabel: 'Code PIN',
        fallbackLabel: 'Code PIN',
        disableDeviceFallback: false,
      });
      if (!resultat.success) {
        setRefus('Saisissez le code PIN de ce profil.');
        return;
      }
      await ecrireParametres({
        [CLES_PARAMETRES.dernierUtilisateur]: String(compte.id),
      }).catch(() => {});
      ouvrirSession(compte);
    } catch (erreur) {
      setRefus(
        erreur instanceof Error
          ? erreur.message
          : "La biométrie Android n'a pas pu ouvrir ce profil.",
      );
    } finally {
      setVerificationBiometrie(false);
    }
  }, [biometrieDisponible, biometrieUtilisateurId, compte, ouvrirSession]);

  useEffect(() => {
    if (etat !== 'pret') return;
    void ouvrirParBiometrie();
  }, [etat, compte?.id, ouvrirParBiometrie]);

  const taper = useCallback((chiffre: string) => {
    if (!compte?.aCodeLocal) return;
    setRefus(null);
    setPin((valeur) =>
      valeur.length >= LONGUEUR_PIN_MAX ? valeur : valeur + chiffre,
    );
  }, [compte?.aCodeLocal]);

  const effacerDernier = useCallback(() => {
    setRefus(null);
    setPin((valeur) => valeur.slice(0, -1));
  }, []);

  const toutEffacer = useCallback(() => {
    setRefus(null);
    setPin('');
  }, []);

  const valider = useCallback(async () => {
    if (!compte || !compte.aCodeLocal || pin.length < LONGUEUR_PIN_MIN) return;
    setVerification(true);
    setRefus(null);
    try {
      // connecter() relit le rôle et actif directement depuis SQLite. On
      // n'ouvre jamais la session avec la copie de la carte affichée.
      const authentifie = await connecter(compte.login, pin);
      await ecrireParametres({
        [CLES_PARAMETRES.dernierUtilisateur]: String(authentifie.id),
      }).catch(() => {});
      ouvrirSession(authentifie);
    } catch (erreur) {
      setPin('');
      setRefus(erreur instanceof Error ? erreur.message : 'Code incorrect.');
    } finally {
      setVerification(false);
    }
  }, [compte, ouvrirSession, pin]);

  const reprendreInstallation = useCallback(async () => {
    try {
      await ecrireParametres({ [CLES_PARAMETRES.installation]: '0' });
      await recharger();
    } catch (erreur) {
      setRefus(
        erreur instanceof Error
          ? erreur.message
          : "La configuration n'a pas pu être relancée.",
      );
    }
  }, [recharger]);

  if (etat === 'chargement') {
    return (
      <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
        <Chargement message="Préparation des profils..." />
      </SafeAreaView>
    );
  }

  if (etat === 'erreur') {
    return (
      <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
        <Erreur message={messageErreur} onReessayer={() => void charger()} />
      </SafeAreaView>
    );
  }

  if (!comptes.length || !compte) {
    return (
      <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
        <ListeVide
          titre="Aucun profil actif"
          message="Cet espace SahelPOS ne contient aucun compte local actif."
          actionTitre="Relancer la configuration"
          onAction={() => void reprendreInstallation()}
        />
      </SafeAreaView>
    );
  }

  const pretAValider = compte.aCodeLocal && pin.length >= LONGUEUR_PIN_MIN;

  return (
    <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
      <View style={styles.contenu}>
        <View style={styles.entete}>
          <View style={styles.logoRang}>
            <View style={styles.logoPastille}>
              <Text style={styles.logoTexte}>S</Text>
            </View>
            <Text style={styles.marque}>SahelPOS</Text>
          </View>
          <Text style={styles.nomBoutique} numberOfLines={1}>{boutique.nom}</Text>
        </View>

        <Text style={styles.profilsTitre}>Choisir un profil</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.profils}
        >
          {comptes.map((u) => {
            const actif = u.id === compte.id;
            return (
              <Pressable
                key={u.idLocal}
                onPress={() => selectionner(u.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
                accessibilityLabel={`${u.nom || u.login}, ${libelleRole(u.role)}`}
                style={[styles.profil, actif && styles.profilActif]}
              >
                <View style={[styles.avatar, actif && styles.avatarActif]}>
                  <Text style={[styles.avatarTexte, actif && styles.avatarTexteActif]}>
                    {(u.nom || u.login).slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.profilNom, actif && styles.profilNomActif]} numberOfLines={1}>
                  {u.nom || u.login}
                </Text>
                <Text style={[styles.profilRole, actif && styles.profilRoleActif]}>
                  {libelleRole(u.role)}
                </Text>
                {!u.aCodeLocal ? (
                  <Text style={styles.profilSansCode}>Code à définir</Text>
                ) : biometrieUtilisateurId === u.id && biometrieDisponible ? (
                  <Text style={styles.profilBiometrie}>Biométrie</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.blocCentral}>
          <Text style={styles.titre}>{compte.nom || compte.login}</Text>
          <Text style={styles.sousTitre}>
            {verificationBiometrie
              ? 'Authentification Android...'
              : compte.aCodeLocal
                ? `Saisissez le PIN · ${libelleRole(compte.role)}`
                : 'Ce profil existe mais aucun PIN local n’est encore défini.'}
          </Text>

          {compte.aCodeLocal ? (
            <View style={styles.pastilles} accessibilityLabel={`${pin.length} chiffres saisis`}>
              {Array.from({ length: LONGUEUR_PIN_MAX }, (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.pastille,
                    index < pin.length && styles.pastillePleine,
                    index >= LONGUEUR_PIN_MIN && styles.pastilleFacultative,
                  ]}
                />
              ))}
            </View>
          ) : (
            <View style={styles.infoSansCode}>
              <Text style={styles.infoSansCodeTexte}>
                Un administrateur doit attribuer un code à ce profil dans Utilisateurs avant sa première connexion sur ce téléphone.
              </Text>
            </View>
          )}

          <Text style={[styles.refus, !refus && styles.refusInvisible]}>{refus ?? ' '}</Text>
        </View>

        <View style={[styles.clavier, !compte.aCodeLocal && styles.clavierInactif]}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((chiffre) => (
            <Touche key={chiffre} libelle={chiffre} onPress={() => taper(chiffre)} />
          ))}
          <Touche libelle="C" secondaire onPress={toutEffacer} />
          <Touche libelle="0" onPress={() => taper('0')} />
          <Touche libelle="⌫" secondaire onPress={effacerDernier} />
        </View>

        <Bouton
          titre="Ouvrir ce profil"
          onPress={() => void valider()}
          desactive={!pretAValider}
          enCours={verification}
          grand
          style={styles.action}
        />
      </View>
    </SafeAreaView>
  );
}

interface ProprietesTouche {
  libelle: string;
  onPress: () => void;
  secondaire?: boolean;
}

function Touche({ libelle, onPress, secondaire }: ProprietesTouche) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle === '⌫' ? 'Effacer' : libelle}
      onPress={onPress}
      style={({ pressed }) => [
        styles.touche,
        secondaire && styles.toucheSecondaire,
        pressed && styles.touchePressee,
      ]}
    >
      <Text style={[styles.toucheTexte, secondaire && styles.toucheTexteSecondaire]}>
        {libelle}
      </Text>
    </Pressable>
  );
}

export default EcranConnexion;

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { flex: 1, paddingHorizontal: espaces.l, paddingTop: espaces.l, paddingBottom: espaces.l },
  entete: { gap: espaces.xs },
  logoRang: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  logoPastille: {
    width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: couleurs.primaire,
  },
  logoTexte: { color: couleurs.texteInverse, fontSize: 19, fontWeight: '900' },
  marque: { fontSize: 23, fontWeight: '900', color: couleurs.texte },
  nomBoutique: { fontSize: 15, fontWeight: '700', color: couleurs.texteFaible },
  profilsTitre: { marginTop: espaces.l, marginBottom: espaces.s, color: couleurs.texte, fontSize: 14, fontWeight: '800' },
  profils: { gap: espaces.s, paddingRight: espaces.l },
  profil: {
    width: 132, minHeight: 118, borderRadius: rayons.l, borderWidth: 1,
    borderColor: couleurs.bordure, backgroundColor: couleurs.surface,
    padding: espaces.m, alignItems: 'center',
  },
  profilActif: { borderColor: couleurs.primaire, backgroundColor: couleurs.primaireDouce },
  avatar: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: couleurs.surfaceDouce,
  },
  avatarActif: { backgroundColor: couleurs.primaire },
  avatarTexte: { color: couleurs.texte, fontWeight: '900', fontSize: 17 },
  avatarTexteActif: { color: couleurs.texteInverse },
  profilNom: { marginTop: 7, color: couleurs.texte, fontWeight: '800', fontSize: 13 },
  profilNomActif: { color: couleurs.primaireFonce },
  profilRole: { marginTop: 2, color: couleurs.texteFaible, fontSize: 10 },
  profilRoleActif: { color: couleurs.primaireFonce },
  profilSansCode: { marginTop: 5, color: couleurs.danger, fontSize: 9, fontWeight: '700' },
  profilBiometrie: { marginTop: 5, color: couleurs.primaire, fontSize: 9, fontWeight: '700' },
  blocCentral: { alignItems: 'center', marginTop: espaces.l, marginBottom: espaces.s },
  titre: { fontSize: 21, fontWeight: '900', color: couleurs.texte, textAlign: 'center' },
  sousTitre: { marginTop: 4, fontSize: 13, color: couleurs.texteFaible, textAlign: 'center' },
  pastilles: { flexDirection: 'row', justifyContent: 'center', gap: espaces.s, marginTop: espaces.m },
  pastille: {
    width: 13, height: 13, borderRadius: 7, borderWidth: 2,
    borderColor: couleurs.bordure, backgroundColor: couleurs.surface,
  },
  pastilleFacultative: { opacity: 0.45 },
  pastillePleine: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire, opacity: 1 },
  infoSansCode: {
    marginTop: espaces.m, borderRadius: rayons.m, padding: espaces.m,
    backgroundColor: couleurs.avertissementDouce,
  },
  infoSansCodeTexte: { color: couleurs.texte, textAlign: 'center', fontSize: 12, lineHeight: 18 },
  refus: {
    textAlign: 'center', marginTop: espaces.s, minHeight: 20, fontSize: 12,
    fontWeight: '700', color: couleurs.danger,
  },
  refusInvisible: { opacity: 0 },
  clavier: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: espaces.s, marginTop: 'auto',
  },
  clavierInactif: { opacity: 0.3 },
  touche: {
    width: '30%', height: 52, alignItems: 'center', justifyContent: 'center',
    borderRadius: rayons.l, backgroundColor: couleurs.surface,
    borderWidth: 1, borderColor: couleurs.bordure,
  },
  toucheSecondaire: { backgroundColor: couleurs.surfaceDouce },
  touchePressee: { opacity: 0.65 },
  toucheTexte: { fontSize: 22, fontWeight: '800', color: couleurs.texte },
  toucheTexteSecondaire: { color: couleurs.texteFaible },
  action: { marginTop: espaces.m },
});
