/**
 * Premier demarrage mobile.
 *
 * Le telephone ne cree plus une boutique locale tout seul. SahelPOS Web est
 * l'autorite : au premier lancement, le commercant se connecte ou cree son
 * compte Web, puis le serveur remet un droit signe utilisable hors ligne.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { KeyboardTypeOptions, ReturnKeyTypeOptions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { obtenirBase } from '../src/db/database';
import { genererIdLocal } from '../src/db/repositories/base';
import type { Utilisateur } from '../src/domain/types';
import {
  connecterCompteMobile,
  creerBoutiqueMobile,
  type Droit,
} from '../src/services/abonnement';
import { bootstrapInitial } from '../src/services/synchronisation';
import {
  Bouton,
  Carte,
  Champ,
  couleurs,
  espaces,
  rayons,
} from '../src/ui/components';
import { Icone } from '../src/ui/icones';

import { CLES_PARAMETRES, ecrireParametres, lireParametres, useSession } from './_layout';

const LONGUEUR_PIN_MIN = 4;
const LONGUEUR_PIN_MAX = 6;
type ModeConnexion = 'connexion' | 'creation';
type VueDepart = 'accueil' | 'formulaire';
type TypeCommerce = 'alimentaire' | 'quincaillerie' | 'pharmacie' | 'autre';

const TYPES_COMMERCE: Array<{
  id: TypeCommerce;
  titre: string;
  icone: Parameters<typeof Icone>[0]['nom'];
}> = [
  { id: 'alimentaire', titre: 'Alimentaire', icone: 'caisse' },
  { id: 'quincaillerie', titre: 'Quincaillerie', icone: 'mouvements' },
  { id: 'pharmacie', titre: 'Pharmacie', icone: 'plus' },
  { id: 'autre', titre: 'Autre', icone: 'menu' },
];

export function EcranDemarrage() {
  const { ouvrirSession, recharger } = useSession();

  const [etape, setEtape] = useState(0);
  const [vueDepart, setVueDepart] = useState<VueDepart>('accueil');
  const [enCours, setEnCours] = useState(false);
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const [droit, setDroit] = useState<Droit | null>(null);
  const [mode, setMode] = useState<ModeConnexion>('connexion');

  const [nomBoutique, setNomBoutique] = useState('');
  const [nomAdmin, setNomAdmin] = useState('');
  const [telephone, setTelephone] = useState('');
  const [ville, setVille] = useState('Bamako');
  const [devise, setDevise] = useState('FCFA');
  const [typeCommerce, setTypeCommerce] = useState<TypeCommerce>('alimentaire');
  const [motDePasseWeb, setMotDePasseWeb] = useState('');
  const [motDePasseWebConfirme, setMotDePasseWebConfirme] = useState('');
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirme, setPinConfirme] = useState('');
  const [memoriser, setMemoriser] = useState(true);

  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  const titreEtape = useMemo(() => {
    if (etape === 0) return mode === 'connexion' ? 'Connexion' : 'Creer ma boutique';
    return 'Code local';
  }, [etape, mode]);

  const sousTitreEtape = useMemo(() => {
    if (etape === 0) {
      return mode === 'connexion'
        ? 'Accedez a votre espace SahelPOS'
        : 'Configurez votre espace SahelPOS';
    }
    return 'Protegez la caisse sur ce telephone.';
  }, [etape, mode]);

  const validerEtape = useCallback((): boolean => {
    const trouvees: Record<string, string> = {};

    if (etape === 0 && mode === 'connexion') {
      if (login.trim().length === 0) trouvees.login = "L'identifiant Web est obligatoire.";
      if (motDePasseWeb.length === 0) trouvees.motDePasseWeb = 'Le mot de passe est obligatoire.';
    }

    if (etape === 0 && mode === 'creation') {
      if (nomBoutique.trim().length === 0) trouvees.nomBoutique = 'Le nom de la boutique est obligatoire.';
      if (nomAdmin.trim().length === 0) trouvees.nomAdmin = 'Votre nom est obligatoire.';
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
      if (pin.length < LONGUEUR_PIN_MIN) trouvees.pin = `Le code doit avoir au moins ${LONGUEUR_PIN_MIN} chiffres.`;
      if (pinConfirme !== pin) trouvees.pinConfirme = 'Les deux codes ne sont pas identiques.';
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
                devise,
                plan: 'START',
              },
              'Telephone principal',
            );
      if (!etat.droit) throw new Error("Le serveur n'a pas renvoye la boutique.");
      if (!etat.droit.peutEntrer) throw new Error(etat.droit.raison || "Cette boutique n'est pas active.");
      await bootstrapInitial(etat.droit.boutique);
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
  }, [devise, login, mode, motDePasseWeb, nomAdmin, nomBoutique, telephone, validerEtape]);

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
      const parametresSynchronises = await lireParametres();
      await ecrireParametres({
        [CLES_PARAMETRES.nom]: parametresSynchronises[CLES_PARAMETRES.nom] || droit.nom || 'Boutique',
        [CLES_PARAMETRES.adresse]: parametresSynchronises[CLES_PARAMETRES.adresse] || '',
        [CLES_PARAMETRES.telephone]: parametresSynchronises[CLES_PARAMETRES.telephone] || '',
        [CLES_PARAMETRES.devise]: parametresSynchronises[CLES_PARAMETRES.devise] || 'F',
        [CLES_PARAMETRES.piedDePage]: parametresSynchronises[CLES_PARAMETRES.piedDePage] || 'Merci de votre visite',
        [CLES_PARAMETRES.largeurPapier]: parametresSynchronises[CLES_PARAMETRES.largeurPapier] || '58mm',
        [CLES_PARAMETRES.installation]: '1',
      });

      await db.withTransactionAsync(async () => {
        const insertion = await db.runAsync(
          `INSERT INTO utilisateur (id_local, login, nom, code_pin, role, actif, date_creation, date_modification)
           VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)`,
          genererIdLocal(),
          identifiant,
          nomAdmin.trim() || identifiant,
          pin,
          maintenant,
          maintenant,
        );
        cree.id = insertion.lastInsertRowId;
      });

      const compte: Utilisateur = {
        id: cree.id,
        idLocal: '',
        login: identifiant,
        nom: nomAdmin.trim() || identifiant,
        role: 'admin',
        actif: true,
        caisseOuvreA: null,
        caisseFermeA: null,
      };

      await recharger();
      ouvrirSession(compte);
    } catch (erreur) {
      setErreurGenerale(
        erreur instanceof Error ? erreur.message : "L'acces local n'a pas pu etre enregistre.",
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
    if (etape > 0) {
      setEtape(0);
      setVueDepart('formulaire');
      return;
    }
    if (vueDepart === 'formulaire') setVueDepart('accueil');
  }, [etape, vueDepart]);

  const afficherFormulaire = useCallback((prochainMode: ModeConnexion) => {
    setMode(prochainMode);
    setVueDepart('formulaire');
    setErreurs({});
    setErreurGenerale(null);
  }, []);

  if (etape === 0 && vueDepart === 'accueil') {
    return (
      <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.accueilContenu}>
          <View style={styles.accueilHaut}>
            <Image source={require('../assets/logo.png')} style={styles.logoAccueil} resizeMode="contain" />
            <Pressable style={styles.langue}>
              <Text style={styles.langueTexte}>FR</Text>
              <Icone nom="chevron" taille={16} couleur={couleurs.texte} />
            </Pressable>
          </View>

          <Text style={styles.heroTitre}>
            Connectez-vous{'\n'}a votre espace{'\n'}
            <Text style={styles.heroSahel}>Sahel</Text>
            <Text style={styles.heroPos}>POS</Text>
          </Text>
          <Text style={styles.heroTexte}>Gerez votre caisse, votre stock et vos ventes, ou que vous soyez.</Text>

          <View style={styles.fonctions}>
            <MiniFonction icone="boutique" titre="Vente" sousTitre="simple et rapide" fond="#dcfce7" couleur="#16a34a" />
            <MiniFonction icone="stock" titre="Stock" sousTitre="en temps reel" fond="#ffedd5" couleur="#f97316" />
            <MiniFonction icone="clients" titre="Clients" sousTitre="et ardoises" fond="#e0f2fe" couleur="#0b77ff" />
            <MiniFonction icone="graphique" titre="Tableau" sousTitre="clair et complet" fond="#ede9fe" couleur="#7c3aed" />
          </View>

          <View style={styles.photoBloc}>
            <Image source={require('../assets/login-merchant.png')} style={styles.photoMarchande} resizeMode="cover" />
            <View style={styles.photoVoile} />
            <Text style={styles.noteManuscrite}>Mon commerce{'\n'}en main !</Text>
          </View>

          <Pressable style={styles.boutonPrimaire} onPress={() => afficherFormulaire('connexion')}>
            <Text style={styles.boutonPrimaireTexte}>Se connecter</Text>
            <Icone nom="chevron" taille={22} couleur={couleurs.texteInverse} />
          </Pressable>
          <Pressable style={styles.boutonBlanc} onPress={() => afficherFormulaire('creation')}>
            <Icone nom="boutique" taille={24} couleur={couleurs.texte} />
            <Text style={styles.boutonBlancTexte}>Creer une nouvelle boutique</Text>
          </Pressable>
          <Pressable onPress={() => afficherFormulaire('creation')}>
            <Text style={styles.essai}>Essayer gratuitement pendant 14 jours</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.ecran} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.formContenu} keyboardShouldPersistTaps="handled">
          <View style={styles.formHaut}>
            <Pressable onPress={precedent} hitSlop={10} style={styles.retour}>
              <Icone nom="retour" taille={26} couleur={couleurs.texte} />
            </Pressable>
            <Image source={require('../assets/logo.png')} style={styles.logoForm} resizeMode="contain" />
            <View style={styles.retourFantome} />
          </View>

          <Text style={styles.formTitre}>{titreEtape}</Text>
          <Text style={styles.formSousTitre}>{sousTitreEtape}</Text>

          {etape === 0 ? (
            <View style={styles.formBloc}>
              {mode === 'connexion' ? (
                <View>
                  <ChampMaquette icone="document" label="Identifiant" valeur={login} onChangeText={setLogin} placeholder="Email ou numero de telephone" erreur={erreurs.login} autoFocus />
                  <ChampMaquette icone="caisse" label="Mot de passe" valeur={motDePasseWeb} onChangeText={setMotDePasseWeb} placeholder="Votre mot de passe" retourClavier="done" onValider={() => void connecterBoutique()} secret erreur={erreurs.motDePasseWeb} />

                  <View style={styles.ligneOptions}>
                    <Pressable style={styles.memoire} onPress={() => setMemoriser((actif) => !actif)}>
                      <View style={[styles.caseMemoire, memoriser && styles.caseMemoireActive]}>
                        {memoriser ? <Icone nom="coche" taille={18} couleur="#fff" /> : null}
                      </View>
                      <View>
                        <Text style={styles.memoireTitre}>Se souvenir de moi</Text>
                        <Text style={styles.memoireTexte}>Restez connecte plus longtemps</Text>
                      </View>
                    </Pressable>
                    <Pressable hitSlop={8}>
                      <Text style={styles.lienBleu}>Mot de passe oublie ?</Text>
                    </Pressable>
                  </View>

                  <Pressable style={[styles.boutonPrimaire, enCours && styles.boutonInactif]} onPress={suivant} disabled={enCours}>
                    <Text style={styles.boutonPrimaireTexte}>{enCours ? 'Connexion...' : 'Se connecter'}</Text>
                    <Icone nom="chevron" taille={22} couleur={couleurs.texteInverse} />
                  </Pressable>

                  <View style={styles.separateur}>
                    <View style={styles.trait} />
                    <Text style={styles.separateurTexte}>ou</Text>
                    <View style={styles.trait} />
                  </View>

                  <Pressable style={styles.googleBouton}>
                    <Text style={styles.googleG}>G</Text>
                    <Text style={styles.googleTexte}>Continuer avec Google</Text>
                  </Pressable>

                  <View style={styles.securite}>
                    <Icone nom="coche" taille={28} couleur={couleurs.primaire} />
                    <View style={styles.securiteTexteBloc}>
                      <Text style={styles.securiteTitre}>Vos donnees sont securisees</Text>
                      <Text style={styles.securiteTexte}>Chiffrement et protection de niveau professionnel</Text>
                    </View>
                  </View>

                  <Pressable onPress={() => afficherFormulaire('creation')}>
                    <Text style={styles.creerBas}>Pas encore de compte ? <Text style={styles.creerBasLien}>Creer ma boutique</Text></Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.creationCarte}>
                  <EtapesCreation />

                  <Text style={styles.creationTitre}>Parlez-nous de votre boutique</Text>
                  <Text style={styles.creationSousTitre}>
                    Ces informations nous permettent de configurer votre espace.
                  </Text>

                  <ChampMaquette icone="boutique" label="Nom de la boutique" valeur={nomBoutique} onChangeText={setNomBoutique} placeholder="Alimentation Fatoumata" erreur={erreurs.nomBoutique} autoFocus />
                  <Text style={styles.exempleChamp}>Ex : Alimentation Fatoumata, Quincaillerie du Marche, ...</Text>

                  <View style={styles.ligneDeuxColonnes}>
                    <View style={styles.colonneChamp}>
                      <ChampMaquette icone="etiquette" label="Ville" valeur={ville} onChangeText={setVille} placeholder="Bamako" />
                    </View>
                    <View style={styles.colonneChamp}>
                      <ChampMaquette icone="argent" label="Devise" valeur={devise} onChangeText={setDevise} placeholder="FCFA" />
                    </View>
                  </View>

                  <View style={styles.infoCreation}>
                    <View style={styles.infoPastille}>
                      <Text style={styles.infoPastilleTexte}>i</Text>
                    </View>
                    <Text style={styles.infoCreationTexte}>Vous pourrez ajouter d'autres informations (adresse, logo, etc.) plus tard dans les parametres.</Text>
                  </View>

                  <Text style={styles.commerceLabel}>Quel type de commerce ? <Text style={styles.commerceFacultatif}>(facultatif)</Text></Text>
                  <View style={styles.commerceGrille}>
                    {TYPES_COMMERCE.map((item) => (
                      <CarteCommerce
                        key={item.id}
                        actif={typeCommerce === item.id}
                        icone={item.icone}
                        titre={item.titre}
                        onPress={() => setTypeCommerce(item.id)}
                      />
                    ))}
                  </View>

                  <View style={styles.creationSeparateur} />
                  <Text style={styles.creationCompteTitre}>Compte administrateur</Text>
                  <Text style={styles.creationCompteTexte}>
                    Ce compte servira a gerer la boutique et a creer les vendeurs.
                  </Text>

                  <ChampMaquette icone="utilisateurs" label="Votre nom" valeur={nomAdmin} onChangeText={setNomAdmin} placeholder="Fatoumata Traore" erreur={erreurs.nomAdmin} />
                  <ChampMaquette icone="reseau" label="Telephone" valeur={telephone} onChangeText={setTelephone} placeholder="76 00 00 00" clavier="phone-pad" />
                  <ChampMaquette icone="document" label="Identifiant" valeur={login} onChangeText={setLogin} placeholder="fatoumata" erreur={erreurs.login} />
                  <ChampMaquette icone="caisse" label="Mot de passe" valeur={motDePasseWeb} onChangeText={setMotDePasseWeb} placeholder="Minimum 6 caracteres" secret erreur={erreurs.motDePasseWeb} />
                  <ChampMaquette icone="caisse" label="Confirmez le mot de passe" valeur={motDePasseWebConfirme} onChangeText={setMotDePasseWebConfirme} placeholder="Minimum 6 caracteres" secret erreur={erreurs.motDePasseWebConfirme} />

                  <View style={styles.creationBasSecurise}>
                    <Icone nom="coche" taille={24} couleur={couleurs.primaire} />
                    <Text style={styles.creationBasTexte}>Vos donnees sont securisees et ne seront jamais partagees.</Text>
                  </View>
                  <Pressable style={[styles.boutonPrimaire, enCours && styles.boutonInactif]} onPress={suivant} disabled={enCours}>
                    <Text style={styles.boutonPrimaireTexte}>{enCours ? 'Creation...' : 'Continuer'}</Text>
                    <Icone nom="chevron" taille={22} couleur={couleurs.texteInverse} />
                  </Pressable>
                  <Pressable onPress={() => afficherFormulaire('connexion')}>
                    <Text style={styles.creerBas}>Deja un compte ? <Text style={styles.creerBasLien}>Se connecter</Text></Text>
                  </Pressable>
                </View>
              )}

              {erreurGenerale ? <BandeauErreur message={erreurGenerale} /> : null}
            </View>
          ) : null}

          {etape === 1 ? (
            <Carte style={styles.carteCode}>
              <View style={styles.boutiqueConnectee}>
                <Text style={styles.boutiqueLibelle}>Boutique connectee</Text>
                <Text style={styles.boutiqueNom}>{droit?.nom || 'Boutique'}</Text>
                <Text style={styles.boutiqueDetail}>Plan {droit?.plan || '-'} recu depuis SahelPOS Web.</Text>
              </View>
              <Champ label="Votre nom" valeur={nomAdmin} onChangeText={setNomAdmin} placeholder="Aminata Diarra" autoFocus />
              <Champ label="Identifiant local" valeur={login} onChangeText={setLogin} placeholder="aminata" erreur={erreurs.login} />
              <Champ label={`Code d'acces (${LONGUEUR_PIN_MIN} a ${LONGUEUR_PIN_MAX} chiffres)`} valeur={pin} onChangeText={(valeur) => setPin(chiffresSeuls(valeur))} placeholder="0000" clavier="number-pad" secret erreur={erreurs.pin} />
              <Champ label="Confirmez le code" valeur={pinConfirme} onChangeText={(valeur) => setPinConfirme(chiffresSeuls(valeur))} placeholder="0000" clavier="number-pad" secret erreur={erreurs.pinConfirme} />
              {erreurGenerale ? <BandeauErreur message={erreurGenerale} /> : null}
              <View style={styles.piedCode}>
                <Bouton titre="Retour" variante="secondaire" onPress={precedent} style={styles.piedRetour} />
                <Bouton titre="Entrer dans la caisse" onPress={suivant} enCours={enCours} grand style={styles.piedSuivant} />
              </View>
            </Carte>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChampMaquette({
  icone,
  label,
  valeur,
  onChangeText,
  placeholder,
  erreur,
  secret = false,
  autoFocus = false,
  clavier,
  retourClavier,
  onValider,
}: {
  icone: Parameters<typeof Icone>[0]['nom'];
  label: string;
  valeur: string;
  onChangeText: (valeur: string) => void;
  placeholder: string;
  erreur?: string;
  secret?: boolean;
  autoFocus?: boolean;
  clavier?: KeyboardTypeOptions;
  retourClavier?: ReturnKeyTypeOptions;
  onValider?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.champBloc}>
      <View style={[styles.champMaquette, erreur ? styles.champErreur : null]}>
        <Icone nom={icone} taille={28} couleur={couleurs.texte} />
        <View style={styles.champTexte}>
          <Text style={styles.champLabel}>{label}</Text>
          <TextInput
            value={valeur}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#7383a1"
            keyboardType={clavier}
            returnKeyType={retourClavier}
            onSubmitEditing={onValider}
            secureTextEntry={secret && !visible}
            autoFocus={autoFocus}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.champSaisie}
          />
        </View>
        {secret ? (
          <Pressable onPress={() => setVisible((actif) => !actif)} hitSlop={8}>
            <Icone nom={visible ? 'oeilFerme' : 'oeil'} taille={24} couleur="#7383a1" />
          </Pressable>
        ) : null}
      </View>
      {erreur ? <Text style={styles.erreurChamp}>{erreur}</Text> : null}
    </View>
  );
}

function MiniFonction({ icone, titre, sousTitre, fond, couleur }: {
  icone: Parameters<typeof Icone>[0]['nom'];
  titre: string;
  sousTitre: string;
  fond: string;
  couleur: string;
}) {
  return (
    <View style={styles.miniFonction}>
      <View style={[styles.miniIcone, { backgroundColor: fond }]}>
        <Icone nom={icone} taille={25} couleur={couleur} />
      </View>
      <Text style={styles.miniTitre}>{titre}</Text>
      <Text style={styles.miniSousTitre}>{sousTitre}</Text>
    </View>
  );
}

function EtapesCreation() {
  return (
    <View style={styles.etapes}>
      <View style={styles.etapeItem}>
        <View style={[styles.etapeCercle, styles.etapeCercleActive]}>
          <Text style={[styles.etapeNumero, styles.etapeNumeroActive]}>1</Text>
        </View>
        <Text style={[styles.etapeTexte, styles.etapeTexteActive]}>Informations</Text>
      </View>
      <View style={styles.etapeTrait} />
      <View style={styles.etapeItem}>
        <View style={styles.etapeCercle}>
          <Text style={styles.etapeNumero}>2</Text>
        </View>
        <Text style={styles.etapeTexte}>Compte</Text>
      </View>
      <View style={styles.etapeTrait} />
      <View style={styles.etapeItem}>
        <View style={styles.etapeCercle}>
          <Text style={styles.etapeNumero}>3</Text>
        </View>
        <Text style={styles.etapeTexte}>C'est parti !</Text>
      </View>
    </View>
  );
}

function CarteCommerce({
  actif,
  icone,
  titre,
  onPress,
}: {
  actif: boolean;
  icone: Parameters<typeof Icone>[0]['nom'];
  titre: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.commerceCarte, actif && styles.commerceCarteActive]}
    >
      <Icone nom={icone} taille={27} couleur={actif ? couleurs.primaire : couleurs.texte} />
      <Text style={[styles.commerceTitre, actif && styles.commerceTitreActive]}>{titre}</Text>
    </Pressable>
  );
}

function BandeauErreur({ message }: { message: string }) {
  return (
    <View style={styles.bandeauErreur}>
      <Text style={styles.bandeauErreurTexte}>{message}</Text>
    </View>
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
  ecran: { flex: 1, backgroundColor: '#f6fbff' },
  accueilContenu: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 28 },
  accueilHaut: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logoAccueil: { width: 170, height: 60 },
  langue: { minHeight: 42, minWidth: 64, borderRadius: 13, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  langueTexte: { fontSize: 16, fontWeight: '800', color: couleurs.texte },
  heroTitre: { marginTop: 28, fontSize: 43, lineHeight: 48, fontWeight: '900', color: couleurs.texte, letterSpacing: 0 },
  heroSahel: { color: '#0b77ff' },
  heroPos: { color: '#ff970f' },
  heroTexte: { marginTop: 16, fontSize: 20, lineHeight: 27, color: '#516484', fontWeight: '500' },
  fonctions: { marginTop: 22, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.88)', borderWidth: 1, borderColor: 'rgba(220,231,244,0.9)', flexDirection: 'row', justifyContent: 'space-between', shadowColor: '#0c2857', shadowOpacity: 0.08, shadowRadius: 18, elevation: 3 },
  miniFonction: { width: '24%', alignItems: 'center' },
  miniIcone: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  miniTitre: { fontSize: 13, fontWeight: '900', color: couleurs.texte, textAlign: 'center' },
  miniSousTitre: { marginTop: 3, fontSize: 11, lineHeight: 14, color: '#405273', textAlign: 'center' },
  photoBloc: { marginTop: 16, height: 360, borderRadius: 20, overflow: 'hidden', backgroundColor: '#dbeafe' },
  photoMarchande: { width: '100%', height: '100%' },
  photoVoile: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(4,35,83,0.10)' },
  noteManuscrite: { position: 'absolute', left: 28, top: 42, color: '#fff', fontSize: 20, lineHeight: 28, fontWeight: '800', transform: [{ rotate: '-8deg' }] },
  boutonPrimaire: { marginTop: 18, minHeight: 66, borderRadius: 16, backgroundColor: couleurs.primaire, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: couleurs.primaire, shadowOpacity: 0.22, shadowRadius: 14, elevation: 4 },
  boutonInactif: { opacity: 0.65 },
  boutonPrimaireTexte: { color: couleurs.texteInverse, fontSize: 20, fontWeight: '900' },
  boutonBlanc: { marginTop: 16, minHeight: 62, borderRadius: 16, borderWidth: 1, borderColor: '#b6cdf0', backgroundColor: couleurs.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  boutonBlancTexte: { fontSize: 17, fontWeight: '900', color: couleurs.texte },
  essai: { marginTop: 22, textAlign: 'center', fontSize: 17, fontWeight: '800', color: couleurs.primaire },
  formContenu: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 28 },
  formHaut: { height: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  retour: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  retourFantome: { width: 44 },
  logoForm: { width: 190, height: 70 },
  formTitre: { marginTop: 14, fontSize: 38, lineHeight: 44, textAlign: 'center', fontWeight: '900', color: couleurs.texte },
  formSousTitre: { marginTop: 8, marginBottom: 28, textAlign: 'center', fontSize: 20, lineHeight: 27, color: '#60708e', fontWeight: '500' },
  formBloc: { paddingBottom: 20 },
  creationCarte: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(190,210,236,0.9)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    padding: 20,
    shadowColor: '#0c2857',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  etapes: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 28,
  },
  etapeItem: { width: 82, alignItems: 'center' },
  etapeCercle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#b7cef0',
    backgroundColor: couleurs.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etapeCercleActive: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  etapeNumero: { fontSize: 15, fontWeight: '900', color: '#5e7294' },
  etapeNumeroActive: { color: '#fff' },
  etapeTexte: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: '#60708e',
    textAlign: 'center',
  },
  etapeTexteActive: { color: couleurs.texte },
  etapeTrait: {
    flex: 1,
    height: 2,
    marginTop: 16,
    backgroundColor: '#dbe8fb',
    minWidth: 24,
  },
  creationTitre: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    color: couleurs.texte,
  },
  creationSousTitre: {
    marginTop: 8,
    marginBottom: 22,
    fontSize: 16,
    lineHeight: 23,
    color: '#60708e',
    fontWeight: '500',
  },
  exempleChamp: {
    marginTop: -10,
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 17,
    color: '#5d73a0',
  },
  ligneDeuxColonnes: {
    flexDirection: 'row',
    gap: 12,
  },
  colonneChamp: { flex: 1 },
  champBloc: { marginBottom: 16 },
  champMaquette: { minHeight: 82, borderRadius: 16, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 16 },
  champErreur: { borderColor: couleurs.danger, borderWidth: 2 },
  champTexte: { flex: 1 },
  champLabel: { fontSize: 15, fontWeight: '800', color: couleurs.texte, marginBottom: 2 },
  champSaisie: { minHeight: 34, padding: 0, fontSize: 18, color: couleurs.texte },
  erreurChamp: { marginTop: 6, color: couleurs.danger, fontSize: 13, fontWeight: '700' },
  ligneOptions: { marginTop: 2, marginBottom: 2, gap: 12 },
  memoire: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  caseMemoire: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: couleurs.bordure, alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.surface },
  caseMemoireActive: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  memoireTitre: { fontSize: 17, fontWeight: '800', color: couleurs.texte },
  memoireTexte: { marginTop: 2, fontSize: 14, color: '#60708e' },
  lienBleu: { alignSelf: 'flex-end', fontSize: 16, fontWeight: '800', color: couleurs.primaire },
  separateur: { marginVertical: 22, flexDirection: 'row', alignItems: 'center', gap: 14 },
  trait: { flex: 1, height: 1, backgroundColor: couleurs.bordure },
  separateurTexte: { color: '#60708e', fontSize: 15, fontWeight: '700' },
  googleBouton: { minHeight: 60, borderRadius: 16, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  googleG: { fontSize: 26, fontWeight: '900', color: '#4285f4' },
  googleTexte: { fontSize: 17, fontWeight: '900', color: couleurs.texte },
  securite: { marginTop: 26, borderRadius: 16, padding: 18, backgroundColor: '#eaf5ff', flexDirection: 'row', alignItems: 'center', gap: 14 },
  securiteTexteBloc: { flex: 1 },
  securiteTitre: { fontSize: 15, fontWeight: '900', color: couleurs.texte },
  securiteTexte: { marginTop: 4, fontSize: 14, lineHeight: 20, color: '#60708e' },
  creerBas: { marginTop: 26, textAlign: 'center', fontSize: 16, color: '#60708e' },
  creerBasLien: { color: couleurs.primaire, fontWeight: '900' },
  infoCreation: { marginBottom: 18, borderRadius: 14, padding: 14, backgroundColor: '#eaf5ff', flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoPastille: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: couleurs.primaire,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoPastilleTexte: { color: '#fff', fontSize: 15, fontWeight: '900' },
  infoCreationTexte: { flex: 1, fontSize: 14, lineHeight: 19, color: '#31517c', fontWeight: '600' },
  commerceLabel: {
    marginBottom: 12,
    fontSize: 15,
    fontWeight: '900',
    color: couleurs.texte,
  },
  commerceFacultatif: { color: '#60708e', fontWeight: '700' },
  commerceGrille: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  commerceCarte: {
    width: '48%',
    minHeight: 82,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  commerceCarteActive: {
    borderColor: couleurs.primaire,
    borderWidth: 2,
    backgroundColor: '#f7fbff',
  },
  commerceTitre: { fontSize: 14, fontWeight: '800', color: couleurs.texte },
  commerceTitreActive: { color: couleurs.primaire },
  creationSeparateur: {
    height: 1,
    backgroundColor: '#e2eaf5',
    marginBottom: 18,
  },
  creationCompteTitre: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
    color: couleurs.texte,
  },
  creationCompteTexte: {
    marginTop: 4,
    marginBottom: 18,
    fontSize: 14,
    lineHeight: 20,
    color: '#60708e',
  },
  creationBasSecurise: {
    marginTop: 4,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#f1f7ff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  creationBasTexte: { flex: 1, color: '#405273', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  carteCode: { marginTop: 16 },
  boutiqueConnectee: { padding: espaces.m, borderRadius: rayons.m, backgroundColor: couleurs.succesDouce, marginBottom: espaces.l },
  boutiqueLibelle: { color: couleurs.texteFaible, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  boutiqueNom: { color: couleurs.texte, fontSize: 20, fontWeight: '800', marginTop: 4 },
  boutiqueDetail: { color: couleurs.texteFaible, fontSize: 13, marginTop: 4 },
  bandeauErreur: { marginTop: espaces.l, padding: espaces.m, borderRadius: rayons.m, backgroundColor: couleurs.dangerDouce },
  bandeauErreurTexte: { color: couleurs.danger, fontSize: 14, lineHeight: 20 },
  piedCode: { flexDirection: 'row', gap: espaces.m, marginTop: espaces.s },
  piedRetour: { flex: 1 },
  piedSuivant: { flex: 2 },
});
