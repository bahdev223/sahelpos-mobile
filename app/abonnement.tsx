/**
 * Activation de l'application et etat de l'abonnement.
 *
 * CE QUE CET ECRAN NE FAIT PAS, ET POURQUOI
 * ------------------------------------------
 * Il n'affiche aucun prix, aucun bouton « s'abonner », aucun lien vers la page
 * de paiement. Ce n'est pas un oubli : les magasins d'applications autorisent
 * a vendre un abonnement ailleurs, mais interdisent de demarcher le client
 * depuis l'application. Une application retiree du magasin est un cout bien
 * superieur au confort d'un bouton.
 *
 * Le commercant s'abonne aupres du commercial ou sur le site, recoit un code,
 * et le saisit ici une fois. Le renouvellement se fait tout seul des que le
 * telephone voit Internet.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';

import { Bouton, Carte, Champ, couleurs, espaces, rayons } from '../src/ui/components';
import {
  activer,
  detacher,
  etatCourant,
  rafraichir,
  type EtatAbonnement,
} from '../src/services/abonnement';

/** `2026-09-22T16:56:25Z` -> `22/09/2026`. */
function dateCourte(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${jj}/${mm}/${d.getFullYear()}`;
}

const NOM_PLAN: Record<string, string> = {
  START: 'Essentiel',
  PRO: 'Boutique',
  BUSINESS: 'Reseau',
};

const NOM_STATUT: Record<string, string> = {
  essai: 'Essai gratuit',
  actif: 'Actif',
  expire: 'Expire',
  suspendu: 'Suspendu',
  resilie: 'Resilie',
};

function texteRestant(jours: number | null, date: string): string {
  if (jours !== null) {
    if (jours === 0) return 'Expire aujourd’hui';
    return `${jours} jour${jours > 1 ? 's' : ''} restant${jours > 1 ? 's' : ''}`;
  }
  const fin = new Date(date).getTime();
  if (!Number.isFinite(fin)) return '—';
  const joursCalcules = Math.max(0, Math.ceil((fin - Date.now()) / 86_400_000));
  return joursCalcules === 0 ? 'Expire aujourd’hui' : `${joursCalcules} jour${joursCalcules > 1 ? 's' : ''} restant${joursCalcules > 1 ? 's' : ''}`;
}

export default function EcranAbonnement() {
  const [etat, setEtat] = useState<EtatAbonnement | null>(null);
  const [code, setCode] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    setEtat(await etatCourant());
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Un droit deja enregistre reste utilisable hors ligne. Des que cet ecran
  // s'ouvre avec Internet, on le renouvelle toutefois afin d'afficher la
  // vraie echeance du forfait sans obliger le commercant a toucher un bouton.
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          setEtat(await rafraichir());
        } catch {
          await charger();
        }
      })();
    }, [charger]),
  );

  const surActiver = useCallback(async () => {
    setEnCours(true);
    try {
      const nouveau = await activer(code);
      setEtat(nouveau);
      setCode('');
      Alert.alert(
        'Application activee',
        nouveau.droit
          ? `${nouveau.droit.nom} — offre ${NOM_PLAN[nouveau.droit.plan] ?? nouveau.droit.plan}.`
          : 'Activation enregistree.',
      );
    } catch (erreur) {
      Alert.alert(
        'Activation impossible',
        erreur instanceof Error ? erreur.message : "Le code n a pas ete accepte.",
      );
    } finally {
      setEnCours(false);
    }
  }, [code]);

  const surRafraichir = useCallback(async () => {
    setEnCours(true);
    try {
      setEtat(await rafraichir());
      Alert.alert('A jour', 'Votre abonnement a ete verifie.');
    } catch (erreur) {
      Alert.alert(
        'Verification impossible',
        erreur instanceof Error ? erreur.message : "Le serveur n a pas repondu.",
      );
    } finally {
      setEnCours(false);
    }
  }, []);

  const surDetacher = useCallback(() => {
    Alert.alert(
      'Detacher ce telephone',
      "L'application redemandera un code d'activation. VOS DONNEES NE SONT PAS " +
        'EFFACEES : ventes, produits, clients et stock restent en place.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Detacher',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await detacher();
              await charger();
            })();
          },
        },
      ],
    );
  }, [charger]);

  const droit = etat?.droit ?? null;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Mon abonnement' }} />
      <ScrollView contentContainerStyle={styles.contenu}>
        {etat?.message ? (
          <View style={[styles.bandeau, etat.active ? styles.bandeauInfo : styles.bandeauAlerte]}>
            <Text style={styles.bandeauTexte}>{etat.message}</Text>
          </View>
        ) : null}

        {droit ? (
          <Carte titre="Votre offre">
            <Ligne libelle="Boutique" valeur={droit.nom} />
            <Ligne libelle="Offre" valeur={NOM_PLAN[droit.plan] ?? droit.plan} />
            <Ligne libelle="Statut" valeur={NOM_STATUT[droit.statut] ?? droit.statut} />
            <Ligne
              libelle="Renouvellement"
              valeur={dateCourte(droit.abonnementExpireLe || droit.expireLe)}
            />
            <Ligne
              libelle="Temps restant"
              valeur={texteRestant(droit.joursRestants, droit.abonnementExpireLe || droit.expireLe)}
            />
            <Ligne
              libelle="Encaissement"
              valeur={droit.peutEcrire ? 'Ouvert' : 'Ferme'}
              alerte={!droit.peutEcrire}
            />
            <Text style={styles.aide}>
              {droit.fonctionnalites.length} fonctionnalite(s) comprise(s) dans
              votre offre.
            </Text>
          </Carte>
        ) : null}

        {!droit ? (
          <Carte titre="Activer l application">
            <Text style={styles.aide}>
              Saisissez le code d activation qui vous a ete remis. Vous ne le
              taperez qu une seule fois : ensuite, l application se verifie
              toute seule des qu elle voit Internet.
            </Text>
            <Champ
              valeur={code}
              // Mise en majuscules a la frappe : les codes sont dictes de vive
              // voix et personne ne pense a la touche majuscule au comptoir.
              onChangeText={(saisie) => setCode(saisie.toUpperCase())}
              label="Code d activation"
              placeholder="SP-XXXX-XXXX-XXXX"
              retourClavier="done"
              onValider={() => void surActiver()}
            />
            <Bouton
              titre="Activer"
              onPress={() => void surActiver()}
              enCours={enCours}
              grand
            />
          </Carte>
        ) : (
          <Carte titre="Verification">
            <Text style={styles.aide}>
              L application verifie votre abonnement toute seule. Ce bouton sert
              si vous venez de renouveler et voulez en profiter tout de suite.
            </Text>
            <Bouton
              titre="Verifier maintenant"
              onPress={() => void surRafraichir()}
              enCours={enCours}
              variante="secondaire"
              grand
            />
          </Carte>
        )}

        <Carte titre="Travailler sans reseau">
          <Text style={styles.aide}>
            Vos ventes, vos produits et vos clients sont dans ce telephone.
            L application fonctionne sans Internet ; la connexion ne sert qu a
            verifier votre abonnement de temps en temps.
          </Text>
        </Carte>

        {droit ? (
          <Carte titre="Changer de telephone">
            <Text style={styles.aide}>
              Detachez ce telephone avant d installer l application sur un autre
              appareil. Vos donnees ne sont pas effacees.
            </Text>
            <Bouton titre="Detacher ce telephone" onPress={surDetacher} variante="danger" />
          </Carte>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Ligne({
  libelle,
  valeur,
  alerte = false,
}: {
  libelle: string;
  valeur: string;
  alerte?: boolean;
}) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.ligneLibelle}>{libelle}</Text>
      <Text style={[styles.ligneValeur, alerte && styles.ligneValeurAlerte]}>
        {valeur || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.l, paddingBottom: espaces.xxl, gap: espaces.l },

  bandeau: {
    borderRadius: rayons.m,
    borderLeftWidth: 3,
    padding: espaces.m,
  },
  bandeauInfo: {
    backgroundColor: couleurs.primaireDouce,
    borderLeftColor: couleurs.primaire,
  },
  bandeauAlerte: {
    backgroundColor: couleurs.avertissementDouce,
    borderLeftColor: couleurs.avertissement,
  },
  bandeauTexte: { fontSize: 13, color: couleurs.texte, lineHeight: 19 },

  ligne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espaces.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: couleurs.bordure,
  },
  ligneLibelle: { fontSize: 14, color: couleurs.texteFaible },
  ligneValeur: { fontSize: 15, fontWeight: '700', color: couleurs.texte },
  ligneValeurAlerte: { color: couleurs.danger },

  aide: {
    fontSize: 13,
    color: couleurs.texteFaible,
    lineHeight: 19,
    marginBottom: espaces.m,
  },
});
