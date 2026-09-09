/**
 * Premier demarrage mobile.
 *
 * Le telephone ne cree plus une boutique locale tout seul. SahelPOS Web est
 * l'autorite : au premier lancement, le commercant se connecte ou cree son
 * compte Web, puis le serveur remet un droit signe utilisable hors ligne.
 *
 * Ensuite seulement on cree le code d'acces local du gerant. Ce code protege la
 * caisse quand plusieurs vendeurs se passent le telephone ; il ne remplace pas
 * l'activation serveur.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { obtenirBase } from '../src/db/database';
import type { Utilisateur } from '../src/domain/types';
import {
  connecterCompteMobile,
  creerBoutiqueMobile,
  type Droit,
} from '../src/services/abonnement';
import {
  Bouton,
  Carte,
  Champ,
  couleurs,
  espaces,
  rayons,
} from '../src/ui/components';

import { CLES_PARAMETRES, ecrireParametres, useSession } from './_layout';

const LONGUEUR_PIN_MIN = 4;
const LONGUEUR_PIN_MAX = 6;
type ModeConnexion = 'connexion' | 'creation';

export function EcranDemarrage() {
  const { ouvrirSession, recharger } = useSession();

  const [etape, setEtape] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const [droit, setDroit] = useState<Droit | null>(null);
  const [mode, setMode] = useState<ModeConnexion>('connexion');

  const [nomBoutique, setNomBoutique] = useState('');
  const [nomAdmin, setNomAdmin] = useState('');
  const [telephone, setTelephone] = useState('');
  const [motDePasseWeb, setMotDePasseWeb] = useState('');
  const [motDePasseWebConfirme, setMotDePasseWebConfirme] = useState('');
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirme, setPinConfirme] = useState('');

  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  const titreEtape = useMemo(() => {
    if (etape === 0) return mode === 'connexion' ? 'Se connecter' : 'Creer un compte';
    return 'Code local';
  }, [etape, mode]);

  const sousTitreEtape = useMemo(() => {
    if (etape === 0) {
      return "Internet requis au premier lancement.";
    }
    return "Protegez la caisse sur ce telephone.";
  }, [etape]);

  const validerEtape = useCallback((): boolean => {
    const trouvees: Record<string, string> = {};

    if (etape === 0 && mode === 'connexion') {
      if (login.trim().length === 0) {
        trouvees.login = "L'identifiant Web est obligatoire.";
      }
      if (motDePasseWeb.length === 0) {
        trouvees.motDePasseWeb = 'Le mot de passe est obligatoire.';
      }
    }

    if (etape === 0 && mode === 'creation') {
      if (nomBoutique.trim().length === 0) {
        trouvees.nomBoutique = 'Le nom de la boutique est obligatoire.';
      }
      if (nomAdmin.trim().length === 0) {
        trouvees.nomAdmin = 'Votre nom est obligatoire.';
      }
      if (login.trim().length === 0) {
        trouvees.login = "L'identifiant Web est obligatoire.";
      } else if (/\s/.test(login.trim())) {
        trouvees.login = "L'identifiant ne doit pas contenir d'espace.";
      }
      if (motDePasseWeb.length < 6) {
        trouvees.motDePasseWeb = 'Le mot de passe Web doit faire au moins 6 caracteres.';
      }
      if (motDePasseWebConfirme !== motDePasseWeb) {
        trouvees.motDePasseWebConfirme = 'Les deux mots de passe ne sont pas identiques.';
      }
    }

    if (etape === 1) {
      if (login.trim().length === 0) {
        trouvees.login = "L'identifiant est obligatoire.";
      } else if (/\s/.test(login.trim())) {
        trouvees.login = "L'identifiant ne doit pas contenir d'espace.";
      }
      if (pin.length < LONGUEUR_PIN_MIN) {
        trouvees.pin = `Le code doit avoir au moins ${LONGUEUR_PIN_MIN} chiffres.`;
      }
      if (pinConfirme !== pin) {
        trouvees.pinConfirme = 'Les deux codes ne sont pas identiques.';
      }
    }

    setErreurs(trouvees);
    return Object.keys(trouvees).length === 0;
  }, [
    etape,
    mode,
    nomBoutique,
    nomAdmin,
    login,
    motDePasseWeb,
    motDePasseWebConfirme,
    pin,
    pinConfirme,
  ]);

  const connecterBoutique = useCallback(async () => {
    if (!validerEtape()) return;
    setEnCours(true);
    setErreurGenerale(null);
    try {
      const etat =
        mode === 'connexion'
          ? await connecterCompteMobile(login, motDePasseWeb, 'Telephone principal')
          : await creerBoutiqueMobile(
              {
                nomBoutique,
                nomPatron: nomAdmin,
                login,
                motDePasse: motDePasseWeb,
                telephone,
                devise: 'FCFA',
                plan: 'START',
              },
              'Telephone principal',
            );
      if (!etat.droit) {
        throw new Error("Le serveur n'a pas renvoye la boutique.");
      }
      if (!etat.droit.peutEntrer) {
        throw new Error(etat.droit.raison || "Cette boutique n'est pas active.");
      }
      setDroit(etat.droit);
      setNomAdmin((valeur) => valeur || (mode === 'creation' ? nomAdmin : login) || 'Gerant');
      setLogin((valeur) => valeur || normaliserLogin(etat.droit?.nom || 'gerant'));
      if (mode === 'creation') {
        setPin('');
        setPinConfirme('');
      }
      setEtape(1);
      setErreurs({});
    } catch (erreur) {
      setErreurGenerale(
        erreur instanceof Error
          ? erreur.message
          : 'Connexion impossible. Verifiez Internet et reessayez.',
      );
    } finally {
      setEnCours(false);
    }
  }, [
    login,
    mode,
    motDePasseWeb,
    nomAdmin,
    nomBoutique,
    telephone,
    validerEtape,
  ]);

  const terminer = useCallback(async () => {
    if (!droit) {
      setEtape(0);
      return;
    }
    if (!validerEtape()) return;
    setEnCours(true);
    setErreurGenerale(null);
    try {
      const db = await obtenirBase();
      const identifiant = login.trim();
      const maintenant = new Date().toISOString();

      const existant = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM utilisateur WHERE login = ?',
        identifiant,
      );
      if ((existant?.n ?? 0) > 0) {
        setErreurs({ login: 'Cet identifiant est deja utilise.' });
        setEnCours(false);
        return;
      }

      const cree = { id: 0 };
      await ecrireParametres({
        [CLES_PARAMETRES.nom]: droit.nom || 'Boutique',
        [CLES_PARAMETRES.adresse]: '',
        [CLES_PARAMETRES.telephone]: '',
        [CLES_PARAMETRES.devise]: 'F',
        [CLES_PARAMETRES.piedDePage]: 'Merci de votre visite',
        [CLES_PARAMETRES.largeurPapier]: '58mm',
        [CLES_PARAMETRES.installation]: '1',
      });

      await db.withTransactionAsync(async () => {
        const insertion = await db.runAsync(
          `INSERT INTO utilisateur (login, nom, code_pin, role, actif, date_creation)
           VALUES (?, ?, ?, 'admin', 1, ?)`,
          identifiant,
          nomAdmin.trim() || identifiant,
          pin,
          maintenant,
        );
        cree.id = insertion.lastInsertRowId;
      });

      const compte: Utilisateur = {
        id: cree.id,
        login: identifiant,
        nom: nomAdmin.trim() || identifiant,
        role: 'admin',
        actif: true,
      };

      await recharger();
      ouvrirSession(compte);
    } catch (erreur) {
      setErreurGenerale(
        erreur instanceof Error
          ? erreur.message
          : "L'acces local n'a pas pu etre enregistre.",
      );
      setEnCours(false);
    }
  }, [droit, login, nomAdmin, ouvrirSession, pin, recharger, validerEtape]);

  const suivant = useCallback(() => {
    if (etape === 0) {
      void connecterBoutique();
      return;
    }
    void terminer();
  }, [connecterBoutique, etape, terminer]);

  const precedent = useCallback(() => {
    setErreurs({});
    setErreurGenerale(null);
    setEtape(0);
  }, []);

  return (
    <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.ecran}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.contenu}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.marque}>SahelPOS</Text>
          <Text style={styles.accroche}>
            {mode === 'creation' ? "Essai gratuit 14 jours." : 'Connectez-vous a votre boutique.'}
          </Text>

          <Carte style={styles.carte}>
            <Text style={styles.titre}>{titreEtape}</Text>
            <Text style={styles.sousTitre}>{sousTitreEtape}</Text>

            {etape === 0 ? (
              <View>
                {mode === 'connexion' ? (
                  <View>
                    <Champ
                      label="Identifiant"
                      valeur={login}
                      onChangeText={setLogin}
                      placeholder="aminata"
                      erreur={erreurs.login}
                      autoFocus
                    />
                    <Champ
                      label="Mot de passe"
                      valeur={motDePasseWeb}
                      onChangeText={setMotDePasseWeb}
                      placeholder="Votre mot de passe"
                      retourClavier="done"
                      onValider={() => void connecterBoutique()}
                      secret
                      erreur={erreurs.motDePasseWeb}
                    />
                    <Bouton
                      titre="Creer un compte"
                      variante="secondaire"
                      onPress={() => {
                        setMode('creation');
                        setErreurs({});
                        setErreurGenerale(null);
                      }}
                      style={styles.actionSecondaire}
                    />
                  </View>
                ) : (
                  <View>
                    <Champ
                      label="Nom de la boutique"
                      valeur={nomBoutique}
                      onChangeText={setNomBoutique}
                      placeholder="Alimentation Diarra"
                      erreur={erreurs.nomBoutique}
                      autoFocus
                    />
                    <Champ
                      label="Votre nom"
                      valeur={nomAdmin}
                      onChangeText={setNomAdmin}
                      placeholder="Aminata Diarra"
                      erreur={erreurs.nomAdmin}
                    />
                    <Champ
                      label="Telephone"
                      valeur={telephone}
                      onChangeText={setTelephone}
                      placeholder="76 00 00 00"
                      clavier="phone-pad"
                    />
                    <Champ
                      label="Identifiant"
                      valeur={login}
                      onChangeText={setLogin}
                      placeholder="aminata"
                      erreur={erreurs.login}
                    />
                    <Champ
                      label="Mot de passe"
                      valeur={motDePasseWeb}
                      onChangeText={setMotDePasseWeb}
                      placeholder="Minimum 6 caracteres"
                      secret
                      erreur={erreurs.motDePasseWeb}
                    />
                    <Champ
                      label="Confirmez le mot de passe"
                      valeur={motDePasseWebConfirme}
                      onChangeText={setMotDePasseWebConfirme}
                      placeholder="Minimum 6 caracteres"
                      secret
                      erreur={erreurs.motDePasseWebConfirme}
                    />
                    <Bouton
                      titre="J'ai deja un compte"
                      variante="secondaire"
                      onPress={() => {
                        setMode('connexion');
                        setErreurs({});
                        setErreurGenerale(null);
                      }}
                      style={styles.actionSecondaire}
                    />
                  </View>
                )}
              </View>
            ) : null}

            {etape === 1 ? (
              <View>
                <View style={styles.boutiqueConnectee}>
                  <Text style={styles.boutiqueLibelle}>Boutique connectee</Text>
                  <Text style={styles.boutiqueNom}>{droit?.nom || 'Boutique'}</Text>
                  <Text style={styles.boutiqueDetail}>
                    Plan {droit?.plan || '-'} recu depuis SahelPOS Web.
                  </Text>
                </View>
                <Champ
                  label="Votre nom"
                  valeur={nomAdmin}
                  onChangeText={setNomAdmin}
                  placeholder="Aminata Diarra"
                  autoFocus
                />
                <Champ
                  label="Identifiant local"
                  valeur={login}
                  onChangeText={setLogin}
                  placeholder="aminata"
                  erreur={erreurs.login}
                />
                <Champ
                  label={`Code d'acces (${LONGUEUR_PIN_MIN} a ${LONGUEUR_PIN_MAX} chiffres)`}
                  valeur={pin}
                  onChangeText={(valeur) => setPin(chiffresSeuls(valeur))}
                  placeholder="0000"
                  clavier="number-pad"
                  secret
                  erreur={erreurs.pin}
                />
                <Champ
                  label="Confirmez le code"
                  valeur={pinConfirme}
                  onChangeText={(valeur) => setPinConfirme(chiffresSeuls(valeur))}
                  placeholder="0000"
                  clavier="number-pad"
                  secret
                  erreur={erreurs.pinConfirme}
                />
              </View>
            ) : null}

            {erreurGenerale ? (
              <View style={styles.bandeauErreur}>
                <Text style={styles.bandeauErreurTexte}>{erreurGenerale}</Text>
              </View>
            ) : null}
          </Carte>
        </ScrollView>

        <View style={styles.pied}>
          {etape > 0 ? (
            <Bouton
              titre="Retour"
              variante="secondaire"
              onPress={precedent}
              style={styles.piedRetour}
            />
          ) : null}
          <Bouton
            titre={etape === 0 ? 'Continuer' : 'Entrer dans la caisse'}
            onPress={suivant}
            enCours={enCours}
            grand
            style={styles.piedSuivant}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function chiffresSeuls(valeur: string): string {
  return valeur.replace(/\D/g, '').slice(0, LONGUEUR_PIN_MAX);
}

function normaliserLogin(valeur: string): string {
  const sansAccents = valeur.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const propre = sansAccents.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return propre || 'gerant';
}

export default EcranDemarrage;

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.l, paddingBottom: espaces.xxl },
  marque: {
    fontSize: 30,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  accroche: {
    fontSize: 16,
    color: couleurs.texteFaible,
    marginTop: espaces.xs,
    marginBottom: espaces.xl,
    lineHeight: 22,
  },
  carte: { marginBottom: espaces.l },
  titre: { fontSize: 22, fontWeight: '800', color: couleurs.texte },
  sousTitre: {
    fontSize: 14,
    color: couleurs.texteFaible,
    marginTop: espaces.xs,
    marginBottom: espaces.l,
    lineHeight: 20,
  },
  actionSecondaire: { marginTop: espaces.s },
  boutiqueConnectee: {
    padding: espaces.m,
    borderRadius: rayons.m,
    backgroundColor: couleurs.succesDouce,
    marginBottom: espaces.l,
  },
  boutiqueLibelle: {
    color: couleurs.texteFaible,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  boutiqueNom: {
    color: couleurs.texte,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  boutiqueDetail: {
    color: couleurs.texteFaible,
    fontSize: 13,
    marginTop: 4,
  },
  bandeauErreur: {
    marginTop: espaces.l,
    padding: espaces.m,
    borderRadius: rayons.m,
    backgroundColor: couleurs.dangerDouce,
  },
  bandeauErreurTexte: { color: couleurs.danger, fontSize: 14, lineHeight: 20 },
  pied: {
    flexDirection: 'row',
    gap: espaces.m,
    padding: espaces.l,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  piedRetour: { flex: 1 },
  piedSuivant: { flex: 2 },
});
