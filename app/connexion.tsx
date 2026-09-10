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

import { CLES_PARAMETRES, ecrireParametres, enRole, useSession } from './_layout';

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

  const charger = useCallback(async () => {
    setEtat('chargement');
    try {
      const db = await obtenirBase();
      const lignes = await db.getAllAsync<CompteAffiche>(
        `SELECT id, login, nom, role FROM utilisateur
         WHERE actif = 1 ORDER BY role = 'admin' DESC, nom, login`,
      );
      setComptes(lignes);
      setCompteChoisi(lignes.length > 0 ? lignes[0].id : null);
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
        login: string;
        nom: string | null;
        role: string;
      }>(
        `SELECT id, login, nom, role FROM utilisateur
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
        login: ligne.login,
        nom: ligne.nom,
        role: enRole(ligne.role),
        actif: true,
      };
      ouvrirSession(compte);
    } catch (erreur) {
      setRefus(
        erreur instanceof Error
          ? erreur.message
          : "La verification du code a echoue.",
      );
      setVerification(false);
    }
  }, [compteChoisi, pin, ouvrirSession]);

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
