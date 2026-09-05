/**
 * Premier demarrage : configuration de la boutique et creation du compte
 * administrateur.
 *
 * Equivalent mobile de l'assistant d'installation du poste de bureau. Il est
 * volontairement court : trois etapes, aucune option qui ne serve pas des la
 * premiere vente. Tout le reste se regle plus tard dans l'onglet Plus.
 *
 * L'ecriture finale est faite en une seule transaction : une boutique sans
 * compte, ou un compte sans boutique, produirait une base dans laquelle on ne
 * peut plus entrer.
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
  Bouton,
  Carte,
  Champ,
  couleurs,
  espaces,
  rayons,
} from '../src/ui/components';

import { CLES_PARAMETRES, useSession } from './_layout';

const ETAPES = ['Boutique', 'Recu', 'Compte'] as const;

const LONGUEUR_PIN_MIN = 4;
const LONGUEUR_PIN_MAX = 6;

export function EcranDemarrage() {
  const { ouvrirSession, recharger } = useSession();

  const [etape, setEtape] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);

  const [nomBoutique, setNomBoutique] = useState('');
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');

  const [devise, setDevise] = useState('F');
  const [largeurPapier, setLargeurPapier] = useState<'58mm' | '80mm'>('58mm');
  const [piedDePage, setPiedDePage] = useState('Merci de votre visite');

  const [nomAdmin, setNomAdmin] = useState('');
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirme, setPinConfirme] = useState('');

  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  const validerEtape = useCallback((): boolean => {
    const trouvees: Record<string, string> = {};

    if (etape === 0 && nomBoutique.trim().length === 0) {
      trouvees.nomBoutique = 'Le nom de la boutique est obligatoire.';
    }

    if (etape === 1 && devise.trim().length === 0) {
      trouvees.devise = 'Indiquez au moins un symbole, par exemple F.';
    }

    if (etape === 2) {
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
  }, [etape, nomBoutique, devise, login, pin, pinConfirme]);

  const terminer = useCallback(async () => {
    if (!validerEtape()) return;
    setEnCours(true);
    setErreurGenerale(null);
    try {
      const db = await obtenirBase();
      const maintenant = new Date().toISOString();
      const identifiant = login.trim();

      const existant = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM utilisateur WHERE login = ?',
        identifiant,
      );
      if ((existant?.n ?? 0) > 0) {
        setErreurs({ login: 'Cet identifiant est deja utilise.' });
        setEnCours(false);
        return;
      }

      // Porte-valeur plutot qu'une variable simple : l'identifiant est produit
      // dans la transaction et relu apres, ce qu'une variable capturee rendrait
      // incertaine pour l'analyse de types.
      const cree = { id: 0 };

      await db.withTransactionAsync(async () => {
        const parametres: Record<string, string> = {
          [CLES_PARAMETRES.nom]: nomBoutique.trim(),
          [CLES_PARAMETRES.adresse]: adresse.trim(),
          [CLES_PARAMETRES.telephone]: telephone.trim(),
          [CLES_PARAMETRES.devise]: devise.trim(),
          [CLES_PARAMETRES.piedDePage]: piedDePage.trim(),
          [CLES_PARAMETRES.largeurPapier]: largeurPapier,
          [CLES_PARAMETRES.installation]: '1',
        };

        for (const [cle, valeur] of Object.entries(parametres)) {
          await db.runAsync(
            `INSERT INTO parametre (cle, valeur, date_modification) VALUES (?, ?, ?)
             ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur,
                                            date_modification = excluded.date_modification`,
            cle,
            valeur,
            maintenant,
          );
        }

        // Le code est stocke tel quel : la base est locale au telephone et
        // aucun module de hachage n'est disponible dans les dependances. Un
        // code a quatre chiffres ne protege de toute facon que des erreurs de
        // manipulation entre vendeurs, pas d'un acces physique a l'appareil.
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
          : "L'installation n'a pas pu etre enregistree.",
      );
      setEnCours(false);
    }
  }, [
    validerEtape,
    login,
    nomBoutique,
    adresse,
    telephone,
    devise,
    piedDePage,
    largeurPapier,
    nomAdmin,
    pin,
    recharger,
    ouvrirSession,
  ]);

  const suivant = useCallback(() => {
    if (!validerEtape()) return;
    if (etape < ETAPES.length - 1) {
      setEtape(etape + 1);
      setErreurs({});
    } else {
      void terminer();
    }
  }, [validerEtape, etape, terminer]);

  const precedent = useCallback(() => {
    setErreurs({});
    setEtape((valeur) => Math.max(0, valeur - 1));
  }, []);

  const titreEtape = useMemo(() => {
    if (etape === 0) return 'Votre boutique';
    if (etape === 1) return 'Le recu client';
    return 'Votre compte';
  }, [etape]);

  const sousTitreEtape = useMemo(() => {
    if (etape === 0) return 'Ce nom apparaitra en haut de chaque recu.';
    if (etape === 1) return 'Reglages du ticket imprime. Tout est modifiable ensuite.';
    return "Ce compte pourra creer les autres vendeurs.";
  }, [etape]);

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
          <Text style={styles.accroche}>Installation de la caisse</Text>

          <View style={styles.jauge}>
            {ETAPES.map((nom, index) => (
              <View key={nom} style={styles.jaugeBloc}>
                <View
                  style={[
                    styles.jaugeBarre,
                    index <= etape && styles.jaugeBarreActive,
                  ]}
                />
                <Text
                  style={[
                    styles.jaugeTexte,
                    index === etape && styles.jaugeTexteActif,
                  ]}
                >
                  {nom}
                </Text>
              </View>
            ))}
          </View>

          <Carte style={styles.carte}>
            <Text style={styles.titre}>{titreEtape}</Text>
            <Text style={styles.sousTitre}>{sousTitreEtape}</Text>

            {etape === 0 ? (
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
                  label="Adresse (facultatif)"
                  valeur={adresse}
                  onChangeText={setAdresse}
                  placeholder="Marche de Medina, Bamako"
                />
                <Champ
                  label="Telephone (facultatif)"
                  valeur={telephone}
                  onChangeText={setTelephone}
                  placeholder="76 00 00 00"
                  clavier="phone-pad"
                />
              </View>
            ) : null}

            {etape === 1 ? (
              <View>
                <Champ
                  label="Symbole de la monnaie"
                  valeur={devise}
                  onChangeText={setDevise}
                  placeholder="F"
                  aide="Affiche apres chaque montant. Le franc CFA n'a pas de centimes."
                  erreur={erreurs.devise}
                />

                <Text style={styles.label}>Largeur du papier</Text>
                <View style={styles.choix}>
                  {(['58mm', '80mm'] as const).map((valeur) => (
                    <Bouton
                      key={valeur}
                      titre={valeur}
                      sousTitre={valeur === '58mm' ? '32 caracteres' : '48 caracteres'}
                      variante={largeurPapier === valeur ? 'primaire' : 'secondaire'}
                      onPress={() => setLargeurPapier(valeur)}
                      style={styles.choixBouton}
                    />
                  ))}
                </View>

                <Champ
                  label="Message de bas de recu"
                  valeur={piedDePage}
                  onChangeText={setPiedDePage}
                  placeholder="Merci de votre visite"
                  style={styles.champEspace}
                />
              </View>
            ) : null}

            {etape === 2 ? (
              <View>
                <Champ
                  label="Votre nom"
                  valeur={nomAdmin}
                  onChangeText={setNomAdmin}
                  placeholder="Aminata Diarra"
                  autoFocus
                />
                <Champ
                  label="Identifiant de connexion"
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
            titre={etape === ETAPES.length - 1 ? "Terminer l'installation" : 'Suivant'}
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

export default EcranDemarrage;

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.l, paddingBottom: espaces.xxl },
  marque: {
    fontSize: 30,
    fontWeight: '800',
    color: couleurs.primaire,
    letterSpacing: -0.5,
  },
  accroche: {
    fontSize: 16,
    color: couleurs.texteFaible,
    marginTop: espaces.xs,
    marginBottom: espaces.xl,
  },
  jauge: { flexDirection: 'row', gap: espaces.s, marginBottom: espaces.l },
  jaugeBloc: { flex: 1 },
  jaugeBarre: {
    height: 5,
    borderRadius: 3,
    backgroundColor: couleurs.bordure,
  },
  jaugeBarreActive: { backgroundColor: couleurs.primaire },
  jaugeTexte: {
    marginTop: espaces.xs,
    fontSize: 12,
    fontWeight: '600',
    color: couleurs.texteFaible,
  },
  jaugeTexteActif: { color: couleurs.primaire },
  carte: { marginBottom: espaces.l },
  titre: { fontSize: 22, fontWeight: '800', color: couleurs.texte },
  sousTitre: {
    fontSize: 14,
    color: couleurs.texteFaible,
    marginTop: espaces.xs,
    marginBottom: espaces.l,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.texteFaible,
    marginBottom: espaces.s,
  },
  choix: { flexDirection: 'row', gap: espaces.m },
  choixBouton: { flex: 1 },
  champEspace: { marginTop: espaces.l },
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
