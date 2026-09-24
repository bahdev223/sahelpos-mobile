/**
 * Connexion par code d'acces.
 *
 * POURQUOI UN PAVE NUMERIQUE ET NON LE CLAVIER DU SYSTEME : le clavier logiciel
 * mange la moitie de l'ecran, met une seconde a apparaitre et propose une
 * correction automatique inutile ici. Un pave dessine dans la page se manipule
 * au pouce, sans regarder.
 *
 * Le code n'est jamais charge en memoire : la verification est faite par la
 * base, qui compare le code saisi a celui du compte choisi.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';

import { obtenirBase } from '../src/db/database';
import type { Utilisateur } from '../src/domain/types';
import {
  BARRE_HORIZONTALE,
  Bouton,
  CIBLE_MIN,
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

interface CompteAffiche {
  id: number;
  login: string;
  nom: string | null;
  role: string;
}

const LONGUEUR_PIN_MIN = 4;
const LONGUEUR_PIN_MAX = 6;

type Etat = 'chargement' | 'pret' | 'erreur';

export function EcranConnexion() {
  const { boutique, ouvrirSession, recharger } = useSession();

  const [etat, setEtat] = useState<Etat>('chargement');
  const [messageErreur, setMessageErreur] = useState('');
  const [comptes, setComptes] = useState<CompteAffiche[]>([]);
  const [compteChoisi, setCompteChoisi] = useState<number | null>(null);
  const [pin, setPin] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [verification, setVerification] = useState(false);
  const [verificationBiometrie, setVerificationBiometrie] = useState(false);
  const [biometrieDisponible, setBiometrieDisponible] = useState(false);
  const [biometrieUtilisateur, setBiometrieUtilisateur] = useState<number | null>(null);
  const [liaisonBiometrie, setLiaisonBiometrie] = useState(false);
  const [nomBiometrie, setNomBiometrie] = useState('empreinte');

  const charger = useCallback(async () => {
    setEtat('chargement');
    try {
      const db = await obtenirBase();
      const lignes = await db.getAllAsync<CompteAffiche>(
        `SELECT id, id_local, login, nom, role, caisse_ouvre_a, caisse_ferme_a FROM utilisateur
         WHERE actif = 1 ORDER BY role = 'admin' DESC, nom, login`,
      );
      const parametres = await lireParametres();
      const utilisateurLie = Number(parametres[CLES_PARAMETRES.biometrieUtilisateur] || 0) || null;
      const compteLieExiste = utilisateurLie !== null && lignes.some((ligne) => ligne.id === utilisateurLie);

      let materielBiometrique = false;
      let biometriqueEnregistre = false;
      let libelleBiometrie = 'empreinte';
      try {
        materielBiometrique = await LocalAuthentication.hasHardwareAsync();
        biometriqueEnregistre = materielBiometrique
          ? await LocalAuthentication.isEnrolledAsync()
          : false;
        const types = materielBiometrique
          ? await LocalAuthentication.supportedAuthenticationTypesAsync()
          : [];
        libelleBiometrie = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
          ? 'biometrie'
          : 'empreinte';
      } catch {
        materielBiometrique = false;
        biometriqueEnregistre = false;
      }

      setComptes(lignes);
      setCompteChoisi(compteLieExiste ? utilisateurLie : lignes.length > 0 ? lignes[0].id : null);
      setBiometrieDisponible(materielBiometrique && biometriqueEnregistre);
      setBiometrieUtilisateur(compteLieExiste ? utilisateurLie : null);
      setLiaisonBiometrie(materielBiometrique && biometriqueEnregistre && !compteLieExiste);
      setNomBiometrie(libelleBiometrie);
      setEtat('pret');
    } catch (erreur) {
      setMessageErreur(
        erreur instanceof Error
          ? erreur.message
          : 'La liste des comptes est illisible.',
      );
      setEtat('erreur');
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

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
    if (compteChoisi === null || pin.length < LONGUEUR_PIN_MIN) return;
    setVerification(true);
    setRefus(null);
    try {
      const db = await obtenirBase();
      const ligne = await db.getFirstAsync<{
        id: number;
        id_local: string;
        login: string;
        nom: string | null;
        role: string;
        caisse_ouvre_a: string | null;
        caisse_ferme_a: string | null;
      }>(
        `SELECT id, id_local, login, nom, role, caisse_ouvre_a, caisse_ferme_a FROM utilisateur
         WHERE id = ? AND code_pin = ? AND actif = 1`,
        compteChoisi,
        pin,
      );

      if (!ligne) {
        setPin('');
        setRefus('Code incorrect.');
        setVerification(false);
        return;
      }

      const compte: Utilisateur = {
        id: ligne.id,
        idLocal: ligne.id_local,
        login: ligne.login,
        nom: ligne.nom,
        role: enRole(ligne.role),
        actif: true,
        caisseOuvreA: ligne.caisse_ouvre_a,
        caisseFermeA: ligne.caisse_ferme_a,
      };
      if (biometrieDisponible && liaisonBiometrie) {
        try {
          await ecrireParametres({
            [CLES_PARAMETRES.biometrieUtilisateur]: String(compte.id),
          });
          setBiometrieUtilisateur(compte.id);
        } catch {
          // Le PIN est correct : une preference biométrique illisible ne doit
          // pas bloquer l'ouverture de la caisse.
        }
      }
      ouvrirSession(compte);
    } catch (erreur) {
      setRefus(
        erreur instanceof Error
          ? erreur.message
          : "La verification du code a echoue.",
      );
      setVerification(false);
    }
  }, [biometrieDisponible, compteChoisi, liaisonBiometrie, pin, ouvrirSession]);

  const validerBiometrie = useCallback(async () => {
    if (!biometrieDisponible || biometrieUtilisateur === null) return;
    setVerificationBiometrie(true);
    setRefus(null);
    try {
      const resultat = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Ouvrir Néré',
        cancelLabel: 'Annuler',
        fallbackLabel: 'Utiliser le code',
        disableDeviceFallback: false,
      });
      if (!resultat.success) {
        setRefus(`${nomBiometrie[0].toUpperCase()}${nomBiometrie.slice(1)} non reconnue.`);
        setVerificationBiometrie(false);
        return;
      }

      const db = await obtenirBase();
      const ligne = await db.getFirstAsync<{
        id: number;
        id_local: string;
        login: string;
        nom: string | null;
        role: string;
        caisse_ouvre_a: string | null;
        caisse_ferme_a: string | null;
      }>(
        `SELECT id, id_local, login, nom, role, caisse_ouvre_a, caisse_ferme_a FROM utilisateur
         WHERE id = ? AND actif = 1`,
        biometrieUtilisateur,
      );

      if (!ligne) {
        await ecrireParametres({ [CLES_PARAMETRES.biometrieUtilisateur]: '0' });
        setBiometrieUtilisateur(null);
        setRefus('Compte introuvable. Utilisez le code.');
        setVerificationBiometrie(false);
        return;
      }

      ouvrirSession({
        id: ligne.id,
        idLocal: ligne.id_local,
        login: ligne.login,
        nom: ligne.nom,
        role: enRole(ligne.role),
        actif: true,
        caisseOuvreA: ligne.caisse_ouvre_a,
        caisseFermeA: ligne.caisse_ferme_a,
      });
    } catch (erreur) {
      setRefus(
        erreur instanceof Error
          ? erreur.message
          : "L'ouverture par biometrie a echoue.",
      );
      setVerificationBiometrie(false);
    }
  }, [biometrieDisponible, biometrieUtilisateur, nomBiometrie, ouvrirSession]);

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
        <Chargement message="Lecture des comptes..." />
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

  if (comptes.length === 0) {
    return (
      <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
        <ListeVide
          titre="Aucun compte actif"
          message="La boutique est configuree mais plus personne ne peut y entrer. Relancez la configuration pour recreer un administrateur."
          actionTitre="Relancer la configuration"
          onAction={() => void reprendreInstallation()}
        />
      </SafeAreaView>
    );
  }

  const pretAValider = pin.length >= LONGUEUR_PIN_MIN && compteChoisi !== null;
  const libelleBiometrie = nomBiometrie === 'empreinte' ? "l'empreinte" : 'la biometrie';

  return (
    <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
      <View style={styles.entete}>
        <Text style={styles.nomBoutique} numberOfLines={1}>
          {boutique.nom}
        </Text>
        <Text style={styles.consigne}>Choisissez votre nom, puis votre code</Text>
      </View>

      {comptes.length > 1 ? (
        <ScrollView
          horizontal
          style={BARRE_HORIZONTALE}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.comptes}
        >
          {comptes.map((compte) => {
            const actif = compte.id === compteChoisi;
            return (
              <Pressable
                key={compte.id}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
                onPress={() => {
                  setCompteChoisi(compte.id);
                  setPin('');
                  setRefus(null);
                  setLiaisonBiometrie(
                    biometrieDisponible &&
                      (biometrieUtilisateur === null || biometrieUtilisateur === compte.id),
                  );
                }}
                style={[styles.compte, actif && styles.compteActif]}
              >
                <Text
                  style={[styles.compteNom, actif && styles.compteNomActif]}
                  numberOfLines={1}
                >
                  {compte.nom || compte.login}
                </Text>
                <Text
                  style={[styles.compteRole, actif && styles.compteRoleActif]}
                >
                  {compte.role}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.compteUnique}>
          <Text style={styles.compteUniqueNom}>
            {comptes[0].nom || comptes[0].login}
          </Text>
        </View>
      )}

      {biometrieDisponible && biometrieUtilisateur === compteChoisi ? (
        <View style={styles.biometrieZone}>
          <Bouton
            titre={`Entrer avec ${libelleBiometrie}`}
            onPress={() => void validerBiometrie()}
            enCours={verificationBiometrie}
          />
        </View>
      ) : null}

      {biometrieDisponible ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: liaisonBiometrie }}
          onPress={() => setLiaisonBiometrie((valeur) => !valeur)}
          style={styles.biometrieOption}
        >
          <View style={[styles.caseBiometrie, liaisonBiometrie && styles.caseBiometrieActive]}>
            <Text style={styles.caseBiometrieTexte}>{liaisonBiometrie ? 'OK' : ''}</Text>
          </View>
          <View style={styles.biometrieTexteBloc}>
            <Text style={styles.biometrieTitre}>
              Utiliser {libelleBiometrie} sur ce telephone
            </Text>
            <Text style={styles.biometrieAide}>
              Apres un code correct, ce compte pourra s'ouvrir plus vite.
            </Text>
          </View>
        </Pressable>
      ) : null}

      <View style={styles.pastilles}>
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

      <View style={styles.clavier}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((chiffre) => (
          <Touche key={chiffre} libelle={chiffre} onPress={() => taper(chiffre)} />
        ))}
        <Touche libelle="C" discrete onPress={toutEffacer} />
        <Touche libelle="0" onPress={() => taper('0')} />
        <Touche libelle="Effacer" petitTexte discrete onPress={effacerDernier} />
      </View>

      <View style={styles.pied}>
        <Bouton
          titre="Ouvrir la caisse"
          onPress={() => void valider()}
          desactive={!pretAValider}
          enCours={verification}
          grand
        />
      </View>
    </SafeAreaView>
  );
}

interface ProprietesTouche {
  libelle: string;
  onPress: () => void;
  discrete?: boolean;
  petitTexte?: boolean;
}

function Touche({ libelle, onPress, discrete, petitTexte }: ProprietesTouche) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      onPress={onPress}
      style={({ pressed }) => [
        styles.touche,
        discrete && styles.toucheDiscrete,
        pressed && styles.touchePressee,
      ]}
    >
      <Text
        style={[
          styles.toucheTexte,
          discrete && styles.toucheTexteDiscret,
          petitTexte && styles.toucheTextePetit,
        ]}
      >
        {libelle}
      </Text>
    </Pressable>
  );
}

export default EcranConnexion;

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  entete: { paddingHorizontal: espaces.l, paddingTop: espaces.l },
  nomBoutique: { fontSize: 22, fontWeight: '800', color: couleurs.texte },
  consigne: {
    fontSize: 15,
    color: couleurs.texteFaible,
    marginTop: espaces.xs,
  },
  comptes: {
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.l,
    gap: espaces.s,
  },
  compte: {
    minHeight: CIBLE_MIN,
    justifyContent: 'center',
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.s,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
    maxWidth: 200,
  },
  compteActif: {
    backgroundColor: couleurs.primaire,
    borderColor: couleurs.primaire,
  },
  compteNom: { fontSize: 16, fontWeight: '700', color: couleurs.texte },
  compteNomActif: { color: couleurs.texteInverse },
  compteRole: { fontSize: 12, color: couleurs.texteFaible },
  compteRoleActif: { color: couleurs.primaireDouce },
  compteUnique: { paddingHorizontal: espaces.l, paddingVertical: espaces.l },
  compteUniqueNom: { fontSize: 16, fontWeight: '700', color: couleurs.texte },
  biometrieZone: {
    paddingHorizontal: espaces.l,
    marginTop: espaces.xs,
  },
  biometrieOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    marginHorizontal: espaces.l,
    marginTop: espaces.m,
    padding: espaces.m,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  caseBiometrie: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: couleurs.bordure,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.surface,
  },
  caseBiometrieActive: {
    borderColor: couleurs.primaire,
    backgroundColor: couleurs.primaire,
  },
  caseBiometrieTexte: {
    color: couleurs.texteInverse,
    fontSize: 12,
    fontWeight: '900',
  },
  biometrieTexteBloc: { flex: 1 },
  biometrieTitre: { fontSize: 14, fontWeight: '800', color: couleurs.texte },
  biometrieAide: {
    marginTop: 2,
    fontSize: 12,
    color: couleurs.texteFaible,
    lineHeight: 17,
  },
  pastilles: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: espaces.m,
    marginTop: espaces.s,
  },
  pastille: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: couleurs.bordure,
    backgroundColor: 'transparent',
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
    fontSize: 15,
    fontWeight: '600',
    color: couleurs.danger,
  },
  refusInvisible: { opacity: 0 },
  clavier: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: espaces.m,
    gap: espaces.s,
    marginTop: espaces.s,
  },
  touche: {
    width: '30%',
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rayons.m,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  toucheDiscrete: { backgroundColor: couleurs.surfaceDouce },
  touchePressee: { opacity: 0.6 },
  toucheTexte: { fontSize: 23, fontWeight: '700', color: couleurs.texte },
  toucheTexteDiscret: { color: couleurs.texteFaible },
  toucheTextePetit: { fontSize: 15, fontWeight: '700' },
  pied: { padding: espaces.l, marginTop: 'auto' },
});
