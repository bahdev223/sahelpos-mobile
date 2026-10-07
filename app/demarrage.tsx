/**
 * Premier demarrage mobile.
 *
 * Le telephone ne cree plus un espace local tout seul. SahelPOS Web est
 * l'autorite : au premier lancement, le commercant se connecte ou cree son
 * compte Web, puis le serveur remet un droit signe utilisable hors ligne.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { KeyboardTypeOptions, ReturnKeyTypeOptions } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Utilisateur } from '../src/domain/types';
import {
  SECTEURS_COMMERCE, MODES_VENTE, MODES_APPROVISIONNEMENT,
  type SecteurCommerce, type ModeVenteCommerce, type ModeApprovisionnementCommerce,
} from '../src/domain/commerce';
import {
  connecterCompteMobile,
  creerBoutiqueDepuisSahelTech,
  creerBoutiqueMobile,
  invitationDepuisQr,
  traiterRetourSahelTech,
  urlConnexionSahelTech,
  type Droit,
} from '../src/services/abonnement';
import {
  initialiserCompteAdministrateur,
  modifierUtilisateur,
  obtenirUtilisateurParId,
  obtenirUtilisateurParIdLocal,
  LONGUEUR_PIN_MAX,
  LONGUEUR_PIN_MIN,
} from '../src/services/auth';
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
import QrInvitationScanner from '../src/ui/QrInvitationScanner';

import { CLES_PARAMETRES, ecrireParametres, lireParametres, useSession } from './_layout';

type ModeConnexion = 'connexion' | 'creation' | 'creation_sso';
type VueDepart = 'accueil' | 'formulaire';

export function EcranDemarrage() {
  const { ouvrirSession, recharger } = useSession();

  const [etape, setEtape] = useState(0);
  const [vueDepart, setVueDepart] = useState<VueDepart>('accueil');
  const [enCours, setEnCours] = useState(false);
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const [droit, setDroit] = useState<Droit | null>(null);
  const [mode, setMode] = useState<ModeConnexion>('connexion');
  const [scannerQr, setScannerQr] = useState(false);
  const [setupSahelTech, setSetupSahelTech] = useState<string | null>(null);
  const [utilisateurProvisionne, setUtilisateurProvisionne] = useState<Utilisateur | null>(null);

  const [nomBoutique, setNomBoutique] = useState('');
  const [nomAdmin, setNomAdmin] = useState('');
  const [telephone, setTelephone] = useState('');
  const [ville, setVille] = useState('Bamako');
  const [devise, setDevise] = useState('FCFA');
  const [typeCommerce, setTypeCommerce] = useState<SecteurCommerce>('ALIMENTATION');
  const [modeVente, setModeVente] = useState<ModeVenteCommerce>('DETAIL');
  const [modeApprovisionnement, setModeApprovisionnement] = useState<ModeApprovisionnementCommerce>('CLASSIQUE');
  const [motDePasseWeb, setMotDePasseWeb] = useState('');
  const [motDePasseWebConfirme, setMotDePasseWebConfirme] = useState('');
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirme, setPinConfirme] = useState('');
  const [memoriser, setMemoriser] = useState(true);

  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  const titreEtape = useMemo(() => {
    if (etape === 0) {
      if (mode === 'connexion') return 'Connexion';
      if (mode === 'creation_sso') return 'Configurer mon commerce';
      return 'Creer mon espace';
    }
    return 'Code local';
  }, [etape, mode]);

  const sousTitreEtape = useMemo(() => {
    if (etape === 0) {
      if (mode === 'connexion') return 'Accedez a votre espace SahelPOS';
      if (mode === 'creation_sso') return 'Votre compte SahelTech est deja pret.';
      return 'Configurez votre espace SahelPOS';
    }
    return 'Protegez la caisse sur ce telephone.';
  }, [etape, mode]);

  const validerEtape = useCallback((): boolean => {
    const trouvees: Record<string, string> = {};

    if (etape === 0 && mode === 'connexion') {
      if (login.trim().length === 0) trouvees.login = "L'identifiant Web est obligatoire.";
      if (motDePasseWeb.length === 0) trouvees.motDePasseWeb = 'Le mot de passe est obligatoire.';
    }

    if (etape === 0 && mode === 'creation_sso') {
      if (nomBoutique.trim().length === 0) {
        trouvees.nomBoutique = "Le nom de l'entreprise est obligatoire.";
      }
    }

    if (etape === 0 && mode === 'creation') {
      if (nomBoutique.trim().length === 0) trouvees.nomBoutique = "Le nom de l'entreprise est obligatoire.";
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
      let etat: Awaited<ReturnType<typeof connecterCompteMobile>>;
      let membreIdLocal = '';

      if (mode === 'creation_sso') {
        if (!setupSahelTech) throw new Error('La session SahelTech a expire.');
        const resultat = await creerBoutiqueDepuisSahelTech(
          setupSahelTech,
          {
            nomBoutique,
            telephone,
            ville,
            secteur: typeCommerce,
            modeVente,
            modeApprovisionnement,
            devise,
          },
          'Telephone principal',
        );
        etat = resultat.etat;
        membreIdLocal = resultat.membreIdLocal;
      } else if (mode === 'connexion') {
        etat = await connecterCompteMobile(login, motDePasseWeb, 'Telephone principal');
      } else {
        etat = await creerBoutiqueMobile(
          {
            nomBoutique,
            nomPatron: nomAdmin,
            login,
            motDePasse: motDePasseWeb,
            telephone,
            ville,
            secteur: typeCommerce,
            modeVente,
            modeApprovisionnement,
            devise,
            plan: 'START',
          },
          'Telephone principal',
        );
      }

      if (!etat.droit) throw new Error("Le serveur n'a pas renvoye l'espace SahelPOS.");
      if (!etat.droit.peutEntrer) throw new Error(etat.droit.raison || "Cet espace SahelPOS n'est pas actif.");
      await bootstrapInitial(etat.droit.boutique);
      setDroit(etat.droit);

      if (membreIdLocal) {
        const membre = await obtenirUtilisateurParIdLocal(membreIdLocal);
        if (!membre) throw new Error("Le profil SahelTech n'a pas ete synchronise sur ce telephone.");
        setUtilisateurProvisionne(membre);
        setNomAdmin(membre.nom || membre.login);
        setLogin(membre.login);
      } else {
        setUtilisateurProvisionne(null);
        setNomAdmin((valeur) => valeur || (mode === 'creation' ? nomAdmin : login) || 'Gerant');
        setLogin((valeur) => valeur || normaliserLogin(etat.droit?.nom || 'gerant'));
      }

      if (mode !== 'connexion') {
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
  }, [devise, login, mode, motDePasseWeb, nomAdmin, nomBoutique, telephone, ville,
    typeCommerce, modeVente, modeApprovisionnement, setupSahelTech, validerEtape]);

  const terminer = useCallback(async () => {
    if (!droit) {
      setEtape(0);
      return;
    }
    if (!validerEtape()) return;
    setEnCours(true);
    setErreurGenerale(null);
    try {
      const identifiant = login.trim();
      const nomCompte = nomAdmin.trim() || identifiant;
      let utilisateurId: number;
      if (utilisateurProvisionne) {
        utilisateurId = utilisateurProvisionne.id;
        await modifierUtilisateur(utilisateurId, { pin });
      } else {
        utilisateurId = await initialiserCompteAdministrateur({
          login: identifiant,
          nom: nomCompte,
          pin: pin,
          role: 'admin',
        });
      }
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

      await proposerBiometrieSysteme(utilisateurId);

      const compte = await obtenirUtilisateurParId(utilisateurId);
      if (!compte) throw new Error("Le profil local n'a pas pu etre relu apres creation du PIN.");

      await recharger();
      ouvrirSession(compte);
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : "L'acces local n'a pas pu etre enregistre.";
      if (/deja utilise/i.test(message)) {
        setErreurs({ login: message });
      } else {
        setErreurGenerale(message);
      }
      setEnCours(false);
    }
  }, [droit, login, nomAdmin, ouvrirSession, pin, recharger, utilisateurProvisionne, validerEtape]);

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

  const appliquerRetourSahelTech = useCallback(async (url: string) => {
    if (!url.startsWith('sahelpos://sso')) return;
    setEnCours(true);
    setErreurGenerale(null);
    try {
      const retour = await traiterRetourSahelTech(url, 'Telephone principal');
      if (retour.type === 'setup') {
        setSetupSahelTech(retour.setup);
        setUtilisateurProvisionne(null);
        setMode('creation_sso');
        setVueDepart('formulaire');
        setEtape(0);
        return;
      }

      const etat = retour.etat;
      if (!etat.droit) throw new Error("Le serveur n'a pas renvoye l'espace SahelPOS.");
      if (!etat.droit.peutEntrer) throw new Error(etat.droit.raison || "Cet espace n'est pas actif.");
      await bootstrapInitial(etat.droit.boutique);
      const membre = await obtenirUtilisateurParIdLocal(retour.membreIdLocal);
      if (!membre) throw new Error("Le profil SahelTech n'a pas ete synchronise sur ce telephone.");

      setDroit(etat.droit);
      setUtilisateurProvisionne(membre);
      setNomAdmin(membre.nom || membre.login);
      setLogin(membre.login);
      setPin('');
      setPinConfirme('');
      setVueDepart('formulaire');
      setEtape(1);
    } catch (erreur) {
      setErreurGenerale(
        erreur instanceof Error ? erreur.message : 'Connexion SahelTech impossible.',
      );
    } finally {
      setEnCours(false);
    }
  }, []);

  useEffect(() => {
    const abonnement = Linking.addEventListener('url', ({ url }) => {
      void appliquerRetourSahelTech(url);
    });
    void Linking.getInitialURL().then((url) => {
      if (url) void appliquerRetourSahelTech(url);
    });
    return () => abonnement.remove();
  }, [appliquerRetourSahelTech]);

  const continuerAvecGoogle = useCallback(async (invitation?: string) => {
    setErreurGenerale(null);
    await Linking.openURL(urlConnexionSahelTech(invitation));
  }, []);

  const traiterQr = useCallback((valeur: string) => {
    const invitation = invitationDepuisQr(valeur);
    if (!invitation) {
      setScannerQr(false);
      setErreurGenerale("Ce QR n'est pas une invitation SahelPOS valide.");
      return;
    }
    setScannerQr(false);
    void continuerAvecGoogle(invitation);
  }, [continuerAvecGoogle]);

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

          <Pressable
            style={styles.boutonPrimaire}
            onPress={() => void continuerAvecGoogle()}
            disabled={enCours}
          >
            <Text style={styles.boutonPrimaireTexte}>G  Continuer avec Google</Text>
            <Icone nom="chevron" taille={22} couleur={couleurs.texteInverse} />
          </Pressable>
          <Pressable style={styles.boutonBlanc} onPress={() => setScannerQr(true)}>
            <Icone nom="codeBarres" taille={24} couleur={couleurs.texte} />
            <Text style={styles.boutonBlancTexte}>Scanner un QR code</Text>
          </Pressable>
          <Pressable style={styles.boutonBlanc} onPress={() => afficherFormulaire('connexion')}>
            <Icone nom="clients" taille={24} couleur={couleurs.texte} />
            <Text style={styles.boutonBlancTexte}>Identifiant et mot de passe</Text>
          </Pressable>
          <Pressable style={styles.boutonBlanc} onPress={() => afficherFormulaire('creation')}>
            <Icone nom="boutique" taille={24} couleur={couleurs.texte} />
            <Text style={styles.boutonBlancTexte}>Creer mon espace</Text>
          </Pressable>
          <Pressable onPress={() => afficherFormulaire('creation')}>
            <Text style={styles.essai}>Essayer gratuitement pendant 14 jours</Text>
          </Pressable>
        </ScrollView>
        <QrInvitationScanner
          visible={scannerQr}
          onClose={() => setScannerQr(false)}
          onValue={traiterQr}
        />
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

                  <Pressable style={styles.googleBouton} onPress={() => void continuerAvecGoogle()}>
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
                    <Text style={styles.creerBas}>Pas encore de compte ? <Text style={styles.creerBasLien}>Creer mon espace</Text></Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.creationCarte}>
                  {mode === 'creation' ? <EtapesCreation /> : null}

                  <Text style={styles.creationTitre}>
                    {mode === 'creation_sso' ? 'Votre commerce' : 'Votre entreprise'}
                  </Text>
                  <Text style={styles.creationSousTitre}>
                    {mode === 'creation_sso'
                      ? 'Votre identité SahelTech est déjà créée. Il ne reste que les informations métier.'
                      : 'Configurez votre espace de vente en quelques minutes.'}
                  </Text>

                  <ChampMaquette icone="boutique" label="Nom de l'entreprise" valeur={nomBoutique} onChangeText={setNomBoutique} placeholder="Diarra Commerce" erreur={erreurs.nomBoutique} autoFocus />
                  <Text style={styles.exempleChamp}>Ex : Diarra Commerce, Alimentation Fatoumata, Quincaillerie du Marche...</Text>

                  <View style={styles.ligneDeuxColonnes}>
                    <View style={styles.colonneChamp}>
                      <ChampMaquette icone="etiquette" label="Ville" valeur={ville} onChangeText={setVille} placeholder="Bamako" />
                    </View>
                    <View style={styles.colonneChamp}>
                      <ChampMaquette icone="argent" label="Devise" valeur={devise} onChangeText={setDevise} placeholder="FCFA" />
                    </View>
                  </View>

                  {mode === 'creation_sso' ? (
                    <ChampMaquette
                      icone="reseau"
                      label="Téléphone professionnel"
                      valeur={telephone}
                      onChangeText={setTelephone}
                      placeholder="76 00 00 00"
                      clavier="phone-pad"
                    />
                  ) : null}

                  <View style={styles.infoCreation}>
                    <View style={styles.infoPastille}>
                      <Text style={styles.infoPastilleTexte}>i</Text>
                    </View>
                    <Text style={styles.infoCreationTexte}>Vous pourrez ajouter d'autres informations (adresse, logo, etc.) plus tard dans les parametres.</Text>
                  </View>

                  <Text style={styles.commerceLabel}>Votre premier point de vente</Text>
                  <Text style={styles.pointVenteAide}>Secteur d'activite</Text>
                  <View style={styles.commerceGrille}>
                    {SECTEURS_COMMERCE.map((item) => (
                      <CarteCommerce
                        key={item.code}
                        actif={typeCommerce === item.code}
                        icone={item.icone}
                        titre={item.titre}
                        onPress={() => setTypeCommerce(item.code)}
                      />
                    ))}
                  </View>
                  <ChoixCommerce titre="Mode de vente" valeur={modeVente} choix={MODES_VENTE} onChange={setModeVente} />
                  <ChoixCommerce titre="Approvisionnement" valeur={modeApprovisionnement} choix={MODES_APPROVISIONNEMENT} onChange={setModeApprovisionnement} />
                  <Text style={styles.pointVenteAide}>Catalogue simple sur mobile. Les variantes, lots, numeros de serie et fonctions avancees restent disponibles sur le Web uniquement.</Text>

                  {mode === 'creation' ? (
                    <>
                      <View style={styles.creationSeparateur} />
                      <Text style={styles.creationCompteTitre}>Compte administrateur</Text>
                  <Text style={styles.creationCompteTexte}>
                    Ce compte servira a gerer l'entreprise, les points de vente et les vendeurs.
                  </Text>

                  <ChampMaquette icone="utilisateurs" label="Votre nom" valeur={nomAdmin} onChangeText={setNomAdmin} placeholder="Fatoumata Traore" erreur={erreurs.nomAdmin} />
                  <ChampMaquette icone="reseau" label="Telephone" valeur={telephone} onChangeText={setTelephone} placeholder="76 00 00 00" clavier="phone-pad" />
                  <ChampMaquette icone="document" label="Identifiant" valeur={login} onChangeText={setLogin} placeholder="fatoumata" erreur={erreurs.login} />
                  <ChampMaquette icone="caisse" label="Mot de passe" valeur={motDePasseWeb} onChangeText={setMotDePasseWeb} placeholder="Minimum 6 caracteres" secret erreur={erreurs.motDePasseWeb} />
                  <ChampMaquette icone="caisse" label="Confirmez le mot de passe" valeur={motDePasseWebConfirme} onChangeText={setMotDePasseWebConfirme} placeholder="Minimum 6 caracteres" secret erreur={erreurs.motDePasseWebConfirme} />
                    </>
                  ) : null}

                  <View style={styles.creationBasSecurise}>
                    <Icone nom="coche" taille={24} couleur={couleurs.primaire} />
                    <Text style={styles.creationBasTexte}>Vos donnees sont securisees et ne seront jamais partagees.</Text>
                  </View>
                  <Pressable style={[styles.boutonPrimaire, enCours && styles.boutonInactif]} onPress={suivant} disabled={enCours}>
                    <Text style={styles.boutonPrimaireTexte}>{enCours ? 'Creation...' : 'Continuer'}</Text>
                    <Icone nom="chevron" taille={22} couleur={couleurs.texteInverse} />
                  </Pressable>
                  <Pressable onPress={() => {
                    setSetupSahelTech(null);
                    afficherFormulaire('connexion');
                  }}>
                    <Text style={styles.creerBas}>
                      {mode === 'creation_sso' ? 'Changer de méthode' : <>Deja un compte ? <Text style={styles.creerBasLien}>Se connecter</Text></>}
                    </Text>
                  </Pressable>
                </View>
              )}

              {erreurGenerale ? <BandeauErreur message={erreurGenerale} /> : null}
            </View>
          ) : null}

          {etape === 1 ? (
            <Carte style={styles.carteCode}>
              <View style={styles.boutiqueConnectee}>
                <Text style={styles.boutiqueLibelle}>Espace connecte</Text>
                <Text style={styles.boutiqueNom}>{droit?.nom || 'SahelPOS'}</Text>
                <Text style={styles.boutiqueDetail}>Plan {droit?.plan || '-'} recu depuis SahelPOS Web.</Text>
                <Text style={styles.boutiqueDetail}>{droit?.commerce?.secteur_libelle || 'Profil a verifier'}</Text>
              </View>
              {!droit?.commerce || droit.commerce.ecritures_autorisees.length === 0 ? (
                <BandeauErreur message={droit?.commerce?.raison || 'Connectez-vous pour verifier le profil commerce.'} />
              ) : !droit.commerce.compatible && droit.commerce.raison ? (
                <View style={styles.infoCreation}>
                  <View style={styles.infoPastille}><Text style={styles.infoPastilleTexte}>i</Text></View>
                  <Text style={styles.infoCreationTexte}>{droit.commerce.raison}</Text>
                </View>
              ) : null}
              {utilisateurProvisionne ? (
                <View style={styles.infoCreation}>
                  <View style={styles.infoPastille}><Text style={styles.infoPastilleTexte}>✓</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.creationCompteTitre}>{utilisateurProvisionne.nom || utilisateurProvisionne.login}</Text>
                    <Text style={styles.infoCreationTexte}>
                      Profil {utilisateurProvisionne.role} synchronisé depuis SahelPOS. Définissez seulement le PIN de ce téléphone.
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  <Champ label="Votre nom" valeur={nomAdmin} onChangeText={setNomAdmin} placeholder="Aminata Diarra" autoFocus />
                  <Champ label="Identifiant local" valeur={login} onChangeText={setLogin} placeholder="aminata" erreur={erreurs.login} />
                </>
              )}
              <Champ label={`Code d'acces (${LONGUEUR_PIN_MIN} a ${LONGUEUR_PIN_MAX} chiffres)`} valeur={pin} onChangeText={(valeur) => setPin(chiffresSeuls(valeur))} placeholder="0000" clavier="number-pad" secret erreur={erreurs.pin} />
              <Champ label="Confirmez le code" valeur={pinConfirme} onChangeText={(valeur) => setPinConfirme(chiffresSeuls(valeur))} placeholder="0000" clavier="number-pad" secret erreur={erreurs.pinConfirme} />
              {erreurGenerale ? <BandeauErreur message={erreurGenerale} /> : null}
              <View style={styles.piedCode}>
                <Bouton titre="Retour" variante="secondaire" onPress={precedent} style={styles.piedRetour} />
                <Bouton
                  titre={droit?.commerce?.ecritures_autorisees.length ? 'Entrer dans SahelPOS' : 'Consulter mon espace'}
                  onPress={suivant}
                  enCours={enCours}
                  grand
                  style={styles.piedSuivant}
                />
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
      accessibilityRole="radio"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={titre}
      style={[styles.commerceCarte, actif && styles.commerceCarteActive]}
    >
      <Icone nom={icone} taille={27} couleur={actif ? couleurs.primaire : couleurs.texte} />
      <Text style={[styles.commerceTitre, actif && styles.commerceTitreActive]}>{titre}</Text>
    </Pressable>
  );
}

function ChoixCommerce<T extends string>({ titre, valeur, choix, onChange }: {
  titre: string;
  valeur: T;
  choix: ReadonlyArray<{ code: T; titre: string }>;
  onChange: (code: T) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  return <View style={styles.champBloc}>
    <Text style={styles.champLabel}>{titre}</Text>
    <Pressable style={styles.choixChamp} onPress={() => setOuvert(true)} accessibilityRole="button"
      accessibilityLabel={`${titre} : ${choix.find(item => item.code === valeur)?.titre}`} accessibilityState={{ expanded: ouvert }}>
      <Text style={styles.choixTexte}>{choix.find(item => item.code === valeur)?.titre}</Text>
      <Icone nom="chevron" taille={20} />
    </Pressable>
    <Modal visible={ouvert} transparent animationType="fade" onRequestClose={() => setOuvert(false)}>
      <View style={styles.choixFond}>
        <View style={styles.choixDialogue} accessibilityViewIsModal>
          <View style={styles.choixEntete}>
            <Text style={styles.commerceLabel}>{titre}</Text>
            <Pressable onPress={() => setOuvert(false)} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.retour}>
              <Icone nom="fermer" taille={22} />
            </Pressable>
          </View>
          <ScrollView>
            {choix.map(item => <Pressable key={item.code} style={styles.choixChamp}
              accessibilityRole="radio" accessibilityState={{ selected: item.code === valeur }}
              onPress={() => { onChange(item.code); setOuvert(false); }}>
              <Text style={styles.choixTexte}>{item.titre}</Text>
              {item.code === valeur ? <Icone nom="coche" couleur={couleurs.primaire} taille={22} /> : null}
            </Pressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
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

async function proposerBiometrieSysteme(utilisateurId: number): Promise<void> {
  try {
    const materiel = await LocalAuthentication.hasHardwareAsync();
    if (!materiel) return;
    const enrole = await LocalAuthentication.isEnrolledAsync();
    if (!enrole) return;

    const resultat = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Activer la biometrie SahelPOS',
      cancelLabel: 'Plus tard',
      fallbackLabel: 'Code PIN',
      disableDeviceFallback: false,
    });
    if (!resultat.success) return;

    await ecrireParametres({
      [CLES_PARAMETRES.biometrieUtilisateur]: String(utilisateurId),
    });
  } catch {
    // Le PIN local reste la voie principale si Android refuse ou annule le prompt.
  }
}

export default EcranDemarrage;

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#f6fbff' },
  accueilContenu: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16 },
  accueilHaut: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logoAccueil: { width: 144, height: 48 },
  langue: { minHeight: 38, minWidth: 58, borderRadius: 12, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  langueTexte: { fontSize: 15, fontWeight: '800', color: couleurs.texte },
  heroTitre: { marginTop: 14, fontSize: 34, lineHeight: 38, fontWeight: '900', color: couleurs.texte, letterSpacing: 0 },
  heroSahel: { color: '#0b77ff' },
  heroPos: { color: '#ff970f' },
  heroTexte: { marginTop: 10, fontSize: 16, lineHeight: 21, color: '#516484', fontWeight: '500' },
  fonctions: { marginTop: 14, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.88)', borderWidth: 1, borderColor: 'rgba(220,231,244,0.9)', flexDirection: 'row', justifyContent: 'space-between', shadowColor: '#0c2857', shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 },
  miniFonction: { width: '24%', alignItems: 'center' },
  miniIcone: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  miniTitre: { fontSize: 12, fontWeight: '900', color: couleurs.texte, textAlign: 'center' },
  miniSousTitre: { marginTop: 2, fontSize: 10, lineHeight: 12, color: '#405273', textAlign: 'center' },
  photoBloc: { marginTop: 12, height: 280, borderRadius: 18, overflow: 'hidden', backgroundColor: '#dbeafe' },
  photoMarchande: { width: '100%', height: '100%' },
  photoVoile: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(4,35,83,0.10)' },
  noteManuscrite: { position: 'absolute', left: 26, top: 36, color: '#fff', fontSize: 18, lineHeight: 24, fontWeight: '800', transform: [{ rotate: '-8deg' }] },
  boutonPrimaire: { marginTop: 14, minHeight: 56, borderRadius: 15, backgroundColor: couleurs.primaire, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: couleurs.primaire, shadowOpacity: 0.22, shadowRadius: 14, elevation: 4 },
  boutonInactif: { opacity: 0.65 },
  boutonPrimaireTexte: { color: couleurs.texteInverse, fontSize: 18, fontWeight: '900' },
  boutonBlanc: { marginTop: 12, minHeight: 54, borderRadius: 15, borderWidth: 1, borderColor: '#b6cdf0', backgroundColor: couleurs.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  boutonBlancTexte: { fontSize: 16, fontWeight: '900', color: couleurs.texte },
  essai: { marginTop: 14, textAlign: 'center', fontSize: 15, fontWeight: '800', color: couleurs.primaire },
  formContenu: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 },
  formHaut: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  retour: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  retourFantome: { width: 44 },
  logoForm: { width: 164, height: 56 },
  formTitre: { marginTop: 10, fontSize: 32, lineHeight: 38, textAlign: 'center', fontWeight: '900', color: couleurs.texte },
  formSousTitre: { marginTop: 4, marginBottom: 20, textAlign: 'center', fontSize: 17, lineHeight: 22, color: '#60708e', fontWeight: '500' },
  formBloc: { paddingBottom: 12 },
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
  champBloc: { marginBottom: 12 },
  champMaquette: { minHeight: 70, borderRadius: 15, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  champErreur: { borderColor: couleurs.danger, borderWidth: 2 },
  champTexte: { flex: 1 },
  champLabel: { fontSize: 14, fontWeight: '800', color: couleurs.texte, marginBottom: 1 },
  champSaisie: { minHeight: 30, padding: 0, fontSize: 16, color: couleurs.texte },
  erreurChamp: { marginTop: 6, color: couleurs.danger, fontSize: 13, fontWeight: '700' },
  ligneOptions: { marginTop: 0, marginBottom: 0, gap: 8 },
  memoire: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  caseMemoire: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: couleurs.bordure, alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.surface },
  caseMemoireActive: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  memoireTitre: { fontSize: 15, fontWeight: '800', color: couleurs.texte },
  memoireTexte: { marginTop: 1, fontSize: 12, color: '#60708e' },
  lienBleu: { alignSelf: 'flex-end', fontSize: 14, fontWeight: '800', color: couleurs.primaire },
  separateur: { marginVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  trait: { flex: 1, height: 1, backgroundColor: couleurs.bordure },
  separateurTexte: { color: '#60708e', fontSize: 15, fontWeight: '700' },
  googleBouton: { minHeight: 54, borderRadius: 15, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  googleG: { fontSize: 24, fontWeight: '900', color: '#4285f4' },
  googleTexte: { fontSize: 16, fontWeight: '900', color: couleurs.texte },
  securite: { marginTop: 18, borderRadius: 15, padding: 14, backgroundColor: '#eaf5ff', flexDirection: 'row', alignItems: 'center', gap: 12 },
  securiteTexteBloc: { flex: 1 },
  securiteTitre: { fontSize: 14, fontWeight: '900', color: couleurs.texte },
  securiteTexte: { marginTop: 3, fontSize: 12, lineHeight: 17, color: '#60708e' },
  creerBas: { marginTop: 18, textAlign: 'center', fontSize: 14, color: '#60708e' },
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
  pointVenteAide: {
    marginTop: -6,
    marginBottom: 12,
    color: '#60708e',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  commerceFacultatif: { color: '#60708e', fontWeight: '700' },
  commerceGrille: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  commerceCarte: {
    width: '47%',
    minHeight: 82,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  commerceCarteActive: {
    borderColor: couleurs.primaire,
    borderWidth: 2,
    backgroundColor: '#f7fbff',
  },
  commerceTitre: { fontSize: 14, fontWeight: '800', color: couleurs.texte, textAlign: 'center' },
  choixChamp: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 8, marginTop: 6 },
  choixTexte: { flex: 1, color: couleurs.texte, fontSize: 15 },
  choixFond: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.4)' },
  choixDialogue: { backgroundColor: couleurs.surface, borderRadius: 8, padding: 16, maxHeight: '80%' },
  choixEntete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
