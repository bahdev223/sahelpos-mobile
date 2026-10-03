/**
 * Connexion caisse liee au terminal.
 *
 * Le telephone ne presente pas la liste des utilisateurs avant authentification:
 * le terminal connait deja le compte local a ouvrir. Si la biometrie Android est
 * disponible pour ce terminal, le prompt systeme s'ouvre automatiquement. Le PIN
 * reste le secours fiable quand le prompt est annule ou indisponible.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';

import { obtenirBase } from '../src/db/database';
import type { Utilisateur } from '../src/domain/types';
import {
  connecter,
  LONGUEUR_PIN_MAX,
  LONGUEUR_PIN_MIN,
} from '../src/services/auth';
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
  enRole,
  lireParametres,
  useSession,
} from './_layout';

interface CompteTerminal {
  id: number;
  id_local: string;
  login: string;
  nom: string | null;
  role: string;
  caisse_ouvre_a: string | null;
  caisse_ferme_a: string | null;
}

type Etat = 'chargement' | 'pret' | 'erreur';

function depuisLigne(ligne: CompteTerminal): Utilisateur {
  return {
    id: ligne.id,
    idLocal: ligne.id_local,
    login: ligne.login,
    nom: ligne.nom,
    role: enRole(ligne.role),
    actif: true,
    caisseOuvreA: ligne.caisse_ouvre_a,
    caisseFermeA: ligne.caisse_ferme_a,
  };
}

export function EcranConnexion() {
  const { boutique, ouvrirSession, recharger } = useSession();

  const [etat, setEtat] = useState<Etat>('chargement');
  const [messageErreur, setMessageErreur] = useState('');
  const [compteTerminal, setCompteTerminal] = useState<CompteTerminal | null>(null);
  const [aucunCompte, setAucunCompte] = useState(false);
  const [pin, setPin] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [verification, setVerification] = useState(false);
  const [verificationBiometrie, setVerificationBiometrie] = useState(false);
  const [biometrieActive, setBiometrieActive] = useState(false);
  const promptDemarre = useRef(false);

  const charger = useCallback(async () => {
    setEtat('chargement');
    promptDemarre.current = false;
    try {
      const db = await obtenirBase();
      const parametres = await lireParametres();
      const idLocal = Number(parametres[CLES_PARAMETRES.biometrieUtilisateur] || 0) || null;

      let compte: CompteTerminal | null = null;
      if (idLocal) {
        compte = await db.getFirstAsync<CompteTerminal>(
          `SELECT id, id_local, login, nom, role, caisse_ouvre_a, caisse_ferme_a
           FROM utilisateur
           WHERE id = ? AND actif = 1`,
          idLocal,
        );
        if (!compte) {
          await ecrireParametres({ [CLES_PARAMETRES.biometrieUtilisateur]: '0' });
        }
      }

      if (!compte) {
        compte = await db.getFirstAsync<CompteTerminal>(
          `SELECT id, id_local, login, nom, role, caisse_ouvre_a, caisse_ferme_a
           FROM utilisateur
           WHERE actif = 1
           ORDER BY role = 'admin' DESC, nom, login
           LIMIT 1`,
        );
      }

      let materielBiometrique = false;
      let biometriqueEnregistre = false;
      try {
        materielBiometrique = await LocalAuthentication.hasHardwareAsync();
        biometriqueEnregistre = materielBiometrique
          ? await LocalAuthentication.isEnrolledAsync()
          : false;
      } catch {
        materielBiometrique = false;
        biometriqueEnregistre = false;
      }

      setCompteTerminal(compte);
      setAucunCompte(!compte);
      setBiometrieActive(Boolean(compte && idLocal === compte.id && materielBiometrique && biometriqueEnregistre));
      setEtat('pret');
    } catch (erreur) {
      setMessageErreur(
        erreur instanceof Error
          ? erreur.message
          : 'Le terminal de caisse est illisible.',
      );
      setEtat('erreur');
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const ouvrirParBiometrie = useCallback(async () => {
    if (!compteTerminal || !biometrieActive || promptDemarre.current) return;
    promptDemarre.current = true;
    setVerificationBiometrie(true);
    setRefus(null);
    try {
      const resultat = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Ouvrir SahelPOS',
        cancelLabel: 'Code PIN',
        fallbackLabel: 'Code PIN',
        disableDeviceFallback: false,
      });

      if (!resultat.success) {
        setRefus('Saisissez votre code PIN.');
        return;
      }

      ouvrirSession(depuisLigne(compteTerminal));
    } catch (erreur) {
      setRefus(
        erreur instanceof Error
          ? erreur.message
          : "La biometrie Android n'a pas pu ouvrir la caisse.",
      );
    } finally {
      setVerificationBiometrie(false);
    }
  }, [biometrieActive, compteTerminal, ouvrirSession]);

  useEffect(() => {
    if (etat !== 'pret') return;
    void ouvrirParBiometrie();
  }, [etat, ouvrirParBiometrie]);

  const taper = useCallback((chiffre: string) => {
    setRefus(null);
    setPin((valeur) =>
      valeur.length >= LONGUEUR_PIN_MAX ? valeur : valeur + chiffre,
    );
  }, []);

  const effacerDernier = useCallback(() => {
    setRefus(null);
    setPin((valeur) => valeur.slice(0, -1));
  }, []);

  const toutEffacer = useCallback(() => {
    setRefus(null);
    setPin('');
  }, []);

  const valider = useCallback(async () => {
    if (!compteTerminal || pin.length < LONGUEUR_PIN_MIN) return;
    setVerification(true);
    setRefus(null);
    try {
      const compte = await connecter(compteTerminal.login, pin);
      if (!biometrieActive) {
        await ecrireParametres({
          [CLES_PARAMETRES.biometrieUtilisateur]: String(compte.id),
        }).catch(() => {});
      }
      ouvrirSession(compte);
    } catch (erreur) {
      setPin('');
      setRefus(
        erreur instanceof Error
          ? erreur.message
          : 'Code incorrect.',
      );
      setVerification(false);
    }
  }, [biometrieActive, compteTerminal, ouvrirSession, pin]);

  const reprendreInstallation = useCallback(async () => {
    try {
      await ecrireParametres({ [CLES_PARAMETRES.installation]: '0' });
      await recharger();
    } catch (erreur) {
      setRefus(
        erreur instanceof Error
          ? erreur.message
          : "La configuration n'a pas pu etre relancee.",
      );
    }
  }, [recharger]);

  if (etat === 'chargement') {
    return (
      <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
        <Chargement message="Preparation de la caisse..." />
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

  if (aucunCompte || !compteTerminal) {
    return (
      <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
        <ListeVide
          titre="Aucun compte actif"
          message="Cet espace SahelPOS est configure mais aucun compte local ne peut ouvrir la caisse."
          actionTitre="Relancer la configuration"
          onAction={() => void reprendreInstallation()}
        />
      </SafeAreaView>
    );
  }

  const pretAValider = pin.length >= LONGUEUR_PIN_MIN;

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
          <Text style={styles.nomBoutique} numberOfLines={1}>
            {boutique.nom}
          </Text>
        </View>

        <View style={styles.blocCentral}>
          <Text style={styles.titre}>Connexion caisse</Text>
          <Text style={styles.sousTitre}>
            {verificationBiometrie ? 'Authentification Android...' : 'Saisissez le code PIN du terminal.'}
          </Text>

          <View style={styles.pastilles} accessibilityLabel={`${pin.length} chiffres saisis`}>
            {Array.from({ length: LONGUEUR_PIN_MAX }, (rien, index) => (
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

          <Text style={[styles.refus, !refus && styles.refusInvisible]}>
            {refus ?? ' '}
          </Text>
        </View>

        <View style={styles.clavier}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((chiffre) => (
            <Touche key={chiffre} libelle={chiffre} onPress={() => taper(chiffre)} />
          ))}
          <Touche libelle="C" secondaire onPress={toutEffacer} />
          <Touche libelle="0" onPress={() => taper('0')} />
          <Touche libelle="⌫" secondaire onPress={effacerDernier} />
        </View>

        <Bouton
          titre="Ouvrir la caisse"
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
  contenu: {
    flex: 1,
    paddingHorizontal: espaces.xl,
    paddingTop: espaces.xl,
    paddingBottom: espaces.l,
  },
  entete: { gap: espaces.s },
  logoRang: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  logoPastille: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.primaire,
  },
  logoTexte: { color: couleurs.texteInverse, fontSize: 20, fontWeight: '900' },
  marque: { fontSize: 25, fontWeight: '900', color: couleurs.texte },
  nomBoutique: { fontSize: 17, fontWeight: '700', color: couleurs.texteFaible },
  blocCentral: {
    alignItems: 'center',
    marginTop: espaces.xxl,
    marginBottom: espaces.l,
  },
  titre: {
    fontSize: 25,
    fontWeight: '900',
    color: couleurs.texte,
    textAlign: 'center',
  },
  sousTitre: {
    marginTop: espaces.s,
    fontSize: 15,
    color: couleurs.texteFaible,
    textAlign: 'center',
  },
  pastilles: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: espaces.m,
    marginTop: espaces.xl,
  },
  pastille: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  pastilleFacultative: { opacity: 0.45 },
  pastillePleine: {
    backgroundColor: couleurs.primaire,
    borderColor: couleurs.primaire,
    opacity: 1,
  },
  refus: {
    textAlign: 'center',
    marginTop: espaces.m,
    minHeight: 22,
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.danger,
  },
  refusInvisible: { opacity: 0 },
  clavier: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: espaces.s,
    marginTop: 'auto',
  },
  touche: {
    width: '30%',
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rayons.l,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  toucheSecondaire: { backgroundColor: couleurs.surfaceDouce },
  touchePressee: { opacity: 0.65 },
  toucheTexte: { fontSize: 24, fontWeight: '800', color: couleurs.texte },
  toucheTexteSecondaire: { color: couleurs.texteFaible },
  action: { marginTop: espaces.l },
});
