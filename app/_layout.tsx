/**
 * Racine de l'application : ouverture de la base, puis aiguillage.
 *
 * POURQUOI UN AIGUILLAGE PAR RENDU ET NON PAR NAVIGATION
 * ------------------------------------------------------
 * Tant que la boutique n'est pas configuree ou que personne n'est connecte, la
 * pile de navigation n'est tout simplement pas montee : on affiche directement
 * l'ecran de demarrage ou celui de connexion. Rediriger apres coup ferait
 * apparaitre un ecran d'onglets vide le temps d'une image, et surtout laisserait
 * la caisse accessible par un retour arriere.
 *
 * L'etat de session vit ici parce que c'est le seul point de l'application
 * traverse par tous les ecrans. Il n'est volontairement pas persiste : fermer
 * l'application redemande le code, ce qui est le comportement attendu d'une
 * caisse que plusieurs vendeurs se passent.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Network from 'expo-network';

import { obtenirBase } from '../src/db/database';
import {
  etatCourant as etatAbonnementCourant,
  rafraichir as rafraichirAbonnement,
} from '../src/services/abonnement';
import { verifierStock } from '../src/services/notifications';
import {
  bootstrapInitial,
  ecouterChangementSynchronisation,
  lireEtatSynchronisation,
  type EtatSynchronisation,
} from '../src/services/synchronisation';
import type { Role, Utilisateur } from '../src/domain/types';
import type { LargeurPapier } from '../src/services/impression/escpos';
import { Chargement, Erreur, couleurs } from '../src/ui/components';
import { FournisseurTiroir } from '../src/ui/tiroir';

import { EcranConnexion } from './connexion';
import { EcranDemarrage } from './demarrage';

/** Cles de la table `parametre`. Ecrites par l'assistant de premier demarrage. */
export const CLES_PARAMETRES = {
  installation: 'installation_terminee',
  nom: 'boutique_nom',
  adresse: 'boutique_adresse',
  telephone: 'boutique_telephone',
  logo: 'boutique_logo',
  devise: 'devise',
  piedDePage: 'recu_pied_de_page',
  largeurPapier: 'recu_largeur_papier',
} as const;

export interface Boutique {
  nom: string;
  adresse: string | null;
  telephone: string | null;
  logo: string | null;
  /** Symbole affiche apres les montants. Le CFA n'a pas de sous-unite. */
  devise: string;
  piedDePage: string | null;
  largeurPapier: LargeurPapier;
}

export const BOUTIQUE_PAR_DEFAUT: Boutique = {
  nom: 'Ma boutique',
  adresse: null,
  telephone: null,
  logo: null,
  devise: 'F',
  piedDePage: 'Merci de votre visite',
  largeurPapier: '58mm',
};

export interface ValeurSession {
  utilisateur: Utilisateur | null;
  boutique: Boutique;
  installe: boolean;
  ouvrirSession: (utilisateur: Utilisateur) => void;
  fermerSession: () => void;
  /** A appeler apres avoir modifie les parametres ou les comptes. */
  recharger: () => Promise<void>;
  /** Change apres une synchronisation distante appliquee dans SQLite. */
  revisionSynchronisation: number;
  /** Etat durable, utile pour indiquer au commercant si le dernier pull a echoue. */
  etatSynchronisation: EtatSynchronisation;
  /** Synchronisation manuelle : le geste actualiser ne doit jamais rester local. */
  synchroniserMaintenant: () => Promise<void>;
}

const ContexteSession = createContext<ValeurSession | null>(null);

export function useSession(): ValeurSession {
  const valeur = useContext(ContexteSession);
  if (!valeur) {
    throw new Error("useSession est appele hors de l'application.");
  }
  return valeur;
}

export async function lireParametres(): Promise<Record<string, string>> {
  const db = await obtenirBase();
  const lignes = await db.getAllAsync<{ cle: string; valeur: string | null }>(
    'SELECT cle, valeur FROM parametre',
  );
  const table: Record<string, string> = {};
  for (const ligne of lignes) {
    if (ligne.valeur !== null) table[ligne.cle] = ligne.valeur;
  }
  return table;
}

export async function ecrireParametres(valeurs: Record<string, string>): Promise<void> {
  const db = await obtenirBase();
  const maintenant = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const [cle, valeur] of Object.entries(valeurs)) {
      await db.runAsync(
        `INSERT INTO parametre (cle, valeur, date_modification) VALUES (?, ?, ?)
         ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur,
                                        date_modification = excluded.date_modification`,
        cle,
        valeur,
        maintenant,
      );
    }
  });
}

export function enRole(valeur: string | null): Role {
  return valeur === 'admin' || valeur === 'gerant' ? valeur : 'vendeur';
}

function fabriquerBoutique(table: Record<string, string>): Boutique {
  const largeur = table[CLES_PARAMETRES.largeurPapier];
  return {
    nom: table[CLES_PARAMETRES.nom] || BOUTIQUE_PAR_DEFAUT.nom,
    adresse: table[CLES_PARAMETRES.adresse] || null,
    telephone: table[CLES_PARAMETRES.telephone] || null,
    logo: table[CLES_PARAMETRES.logo] || null,
    devise: table[CLES_PARAMETRES.devise] || BOUTIQUE_PAR_DEFAUT.devise,
    piedDePage: table[CLES_PARAMETRES.piedDePage] || BOUTIQUE_PAR_DEFAUT.piedDePage,
    largeurPapier: largeur === '80mm' ? '80mm' : '58mm',
  };
}

type EtatDemarrage = 'chargement' | 'pret' | 'erreur';

export default function DispositionRacine() {
  const [etat, setEtat] = useState<EtatDemarrage>('chargement');
  const [messageErreur, setMessageErreur] = useState('');
  const [installe, setInstalle] = useState(false);
  const [boutique, setBoutique] = useState<Boutique>(BOUTIQUE_PAR_DEFAUT);
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [revisionSynchronisation, setRevisionSynchronisation] = useState(0);
  const [etatSynchronisation, setEtatSynchronisation] = useState<EtatSynchronisation>({
    derniereTentative: null,
    dernierSucces: null,
    derniereErreur: null,
    dernierPush: null,
    dernierPull: null,
    dernierNombrePush: null,
    dernierNombrePull: null,
    enAttente: 0,
    cursor: null,
  });
  // Toutes les sources (retour du reseau, reprise de l'app, ecriture locale
  // et geste tirer-pour-actualiser) partagent cette meme promesse. Ainsi un
  // rafraichissement manuel attend une synchro deja lancee au lieu de relire
  // SQLite trop tot et de donner l'impression que rien ne s'est passe.
  const synchronisationEnCours = useRef<Promise<void> | null>(null);

  const charger = useCallback(async () => {
    setEtat('chargement');
    try {
      const db = await obtenirBase();
      const table = await lireParametres();
      // L'installation n'est reputee faite que si un compte existe reellement :
      // un parametre pose sans compte laisserait une base ou personne ne peut
      // plus entrer.
      const comptes = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM utilisateur WHERE actif = 1',
      );
      setBoutique(fabriquerBoutique(table));
      setInstalle(table[CLES_PARAMETRES.installation] === '1' && (comptes?.n ?? 0) > 0);
      setEtat('pret');
    } catch (erreur) {
      setMessageErreur(
        erreur instanceof Error
          ? erreur.message
          : "La base locale n'a pas pu etre ouverte.",
      );
      setEtat('erreur');
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    void lireEtatSynchronisation().then(setEtatSynchronisation).catch(() => {});
  }, []);

  // Renouvellement silencieux du droit d'acces.
  //
  // Il ne bloque RIEN : l'application demarre sur le droit deja installe, et
  // celui-ci n'est remplace que si le serveur repond. Un echec est ignore sans
  // bruit — le commercant ouvre sa caisse le matin, parfois sans reseau, et
  // n'a pas a etre averti que la verification attendra.
  useEffect(() => {
    void rafraichirAbonnement().catch(() => {});
  }, []);

  const ouvrirSession = useCallback((compte: Utilisateur) => {
    setUtilisateur(compte);
  }, []);

  const fermerSession = useCallback(() => {
    setUtilisateur(null);
  }, []);

  /**
   * Le premier pull peut finir APRES l'affichage de l'accueil. Sans ce signal,
   * la caisse, le catalogue et le tableau de bord conserveraient leur lecture
   * vide jusqu'a ce que la personne change elle-meme d'onglet. Chaque ecran
   * ecoute donc `revisionSynchronisation` et relit SQLite des que le pull est
   * applique.
   */
  const synchroniserDonnees = useCallback(async () => {
    if (synchronisationEnCours.current) {
      return synchronisationEnCours.current;
    }

    const execution = (async () => {
      try {
        const abonnement = await etatAbonnementCourant();
        const boutiqueId = abonnement.droit?.boutique;
        if (!boutiqueId) return;

        await bootstrapInitial(boutiqueId);
        await verifierStock();
        // La synchronisation peut mettre a jour l'identite de la boutique. On
        // relit ces seuls parametres sans repasser la racine en ecran de
        // chargement et sans interrompre la vente en cours.
        setBoutique(fabriquerBoutique(await lireParametres()));
        setRevisionSynchronisation((precedente) => precedente + 1);
      } finally {
        setEtatSynchronisation(await lireEtatSynchronisation().catch(() => ({
        derniereTentative: null, dernierSucces: null, derniereErreur: null,
        dernierPush: null, dernierPull: null, dernierNombrePush: null,
        dernierNombrePull: null, enAttente: 0, cursor: null,
        })));
      }
    })();

    synchronisationEnCours.current = execution;
    try {
      await execution;
    } finally {
      if (synchronisationEnCours.current === execution) {
        synchronisationEnCours.current = null;
      }
    }
  }, [charger]);

  // Les synchronisations declenchees par le systeme ne doivent jamais creer
  // de rejet non gere. Le geste manuel, lui, conserve l'erreur : l'ecran qui
  // l'a demande ne doit pas afficher un faux succes.
  const synchroniserSansBruit = useCallback(() => {
    void synchroniserDonnees().catch(() => {});
  }, [synchroniserDonnees]);

  const valeur = useMemo<ValeurSession>(
    () => ({
      utilisateur,
      boutique,
      installe,
      ouvrirSession,
      fermerSession,
      recharger: charger,
      revisionSynchronisation,
      etatSynchronisation,
      synchroniserMaintenant: synchroniserDonnees,
    }),
    [
      utilisateur,
      boutique,
      installe,
      ouvrirSession,
      fermerSession,
      charger,
      revisionSynchronisation,
      etatSynchronisation,
      synchroniserDonnees,
    ],
  );

  const pileMontee = etat === 'pret' && installe && utilisateur !== null;

  // Premier examen du stock a l'ouverture, meme si l'appareil n'a pas encore
  // de droit distant (mode hors connexion).
  useEffect(() => {
    if (!pileMontee) return;
    void verifierStock();
  }, [pileMontee]);

  // Une synchronisation finalisee reveille les ecrans qui lisent SQLite, ce
  // qui evite le faux tableau de bord vide juste apres une connexion Web.
  useEffect(() => {
    if (!pileMontee) return;
    synchroniserSansBruit();
  }, [pileMontee, synchroniserSansBruit]);

  // Le retour du reseau est un evenement distinct du retour au premier plan :
  // un vendeur peut activer ses donnees mobiles sans quitter la caisse.
  useEffect(() => {
    if (!pileMontee) return;
    const abonnement = Network.addNetworkStateListener((reseau) => {
      if (reseau.isConnected && reseau.isInternetReachable !== false) {
        synchroniserSansBruit();
      }
    });
    void Network.getNetworkStateAsync().then((reseau) => {
      if (reseau.isConnected && reseau.isInternetReachable !== false) {
        synchroniserSansBruit();
      }
    }).catch(() => {});
    return () => abonnement.remove();
  }, [pileMontee, synchroniserSansBruit]);

  // Toute ecriture met l'objet dans la file SQLite puis reveille la racine.
  // Le push n'est donc plus conditionne a un redemarrage ou a un changement
  // d'onglet.
  useEffect(() => {
    if (!pileMontee) return;
    return ecouterChangementSynchronisation(() => {
      // Certains services marquent l'outbox dans leur transaction SQLite. On
      // laisse le commit finir avant de lire cette file et de la pousser.
      setTimeout(synchroniserSansBruit, 250);
    });
  }, [pileMontee, synchroniserSansBruit]);

  // Filet de securite pour un reseau qui change d'etat sans emettre
  // d'evenement natif (certains Android apres une coupure prolongée).
  useEffect(() => {
    if (!pileMontee) return;
    const intervalle = setInterval(synchroniserSansBruit, 120000);
    return () => clearInterval(intervalle);
  }, [pileMontee, synchroniserSansBruit]);

  // Quand le telephone revient de veille ou retrouve le premier plan, on
  // relit le serveur. C'est ce cas qui etait laisse de cote : les mises a jour
  // du Web existaient, mais le mobile restait sur son cache jusqu'a redemarrage.
  useEffect(() => {
    if (!pileMontee) return;
    const abonnement = AppState.addEventListener('change', (etatApp) => {
      if (etatApp === 'active') synchroniserSansBruit();
    });
    return () => abonnement.remove();
  }, [pileMontee, synchroniserSansBruit]);

  // L'aiguillage de la racine est fait par app/index.tsx, qui redirige vers
  // la caisse. Aucun effet de navigation ici : celui qui s'y trouvait
  // ramenait a la caisse tout ecran ouvert hors des onglets.

  let contenu;
  if (etat === 'chargement') {
    contenu = <Chargement message="Ouverture de la caisse..." />;
  } else if (etat === 'erreur') {
    contenu = (
      <Erreur
        titre="La caisse n'a pas pu demarrer"
        message={messageErreur}
        onReessayer={() => void charger()}
      />
    );
  } else if (!installe) {
    contenu = <EcranDemarrage />;
  } else if (!utilisateur) {
    contenu = <EcranConnexion />;
  } else {
    // Le tiroir n'enveloppe QUE la pile : ni l'assistant de premier demarrage
    // ni l'ecran de connexion ne doivent donner acces aux reglages.
    contenu = (
      <FournisseurTiroir
        infos={{
          boutique: boutique.nom,
          utilisateur: utilisateur.nom || utilisateur.login,
          role: utilisateur.role,
          onDeconnexion: fermerSession,
        }}
      >
        <Stack
          screenOptions={{
            // Par defaut chaque ecran dessine son propre en-tete. Ceux qui
            // preferent celui du systeme le redemandent avec
            // `headerShown: true` dans leur `Stack.Screen`, et heritent alors
            // du style ci-dessous.
            headerShown: false,
            headerStyle: { backgroundColor: couleurs.surface },
            headerTintColor: couleurs.primaire,
            headerTitleStyle: { color: couleurs.texte, fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: couleurs.fond },
          }}
        />
      </FournisseurTiroir>
    );
  }

  return (
    <SafeAreaProvider>
      <ContexteSession.Provider value={valeur}>
        <StatusBar style="dark" />
        <View style={{ flex: 1, backgroundColor: couleurs.fond }}>{contenu}</View>
      </ContexteSession.Provider>
    </SafeAreaProvider>
  );
}
