/**
 * L'abonnement de la boutique, vu du telephone.
 *
 * CE QUE CE MODULE GARANTIT
 * --------------------------
 * 1. On peut travailler sans reseau. Le droit est garde en local et verifie
 *    hors ligne ; l'application n'appelle le serveur que pour se rafraichir.
 * 2. Une expiration ne detruit JAMAIS les donnees du commercant. Elle ferme
 *    des fonctionnalites, elle ne supprime pas une vente, un produit ni un
 *    client. Ce logiciel tient sa comptabilite : lui retirer ses chiffres
 *    parce qu'une facture est en retard serait indefendable.
 * 3. L'application ne vend rien. Elle n'affiche ni prix, ni bouton
 *    « s'abonner », ni lien vers la page de paiement. C'est ce qui la met en
 *    regle avec la politique des magasins d'applications : vendre ailleurs est
 *    permis, demarcher depuis l'application ne l'est pas.
 *
 * LE CODE D'ACTIVATION NE PORTE AUCUN DROIT
 * ------------------------------------------
 * Il designe une boutique, rien de plus. Le droit est lu sur l'abonnement au
 * moment de l'appel, puis signe par le serveur. Un client qui passe de START a
 * PRO n'a donc pas besoin d'un nouveau code : son prochain rafraichissement
 * suffit.
 */
import { executer, lireTout } from '../../db/repositories/base';
import { Droit, LicenceInvalide, droitPerime, lireDroit } from './licence';

export type { Droit } from './licence';
export { LicenceInvalide } from './licence';

/**
 * Adresse du serveur.
 *
 * Une seule ligne a changer le jour du deploiement. Elle n'est pas dans un
 * fichier de configuration : ce reglage ne doit PAS etre modifiable par
 * l'utilisateur, sinon un telephone pourrait etre pointe vers un faux serveur.
 * La signature l'empecherait d'obtenir un droit valide, mais autant fermer la
 * porte plutot que de compter dessus.
 */
const SERVEUR = 'https://sahelpos.saheltech.tech';

/** Au-dela, on renonce : le commercant attend devant son comptoir. */
const DELAI_RESEAU = 15000;

const CLE_LICENCE = 'abonnement.licence';
const CLE_APPAREIL = 'abonnement.jeton_appareil';
const CLE_EMPREINTE = 'abonnement.empreinte';
const CLE_DERNIER_CONTACT = 'abonnement.dernier_contact';

// --- rangement local ------------------------------------------------------

async function lireCle(cle: string): Promise<string> {
  const lignes = await lireTout<{ valeur: string | null }>(
    'SELECT valeur FROM parametre WHERE cle = ?',
    cle,
  );
  return lignes[0]?.valeur ?? '';
}

async function ecrireCle(cle: string, valeur: string): Promise<void> {
  await executer(
    `INSERT INTO parametre (cle, valeur, date_modification) VALUES (?, ?, ?)
     ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur,
                                    date_modification = excluded.date_modification`,
    cle,
    valeur,
    new Date().toISOString(),
  );
}

/**
 * Identifiant de CETTE installation.
 *
 * Volontairement tire au hasard et non lu sur le materiel : aucun IMEI, aucun
 * identifiant publicitaire, rien qui suive le commercant ailleurs. Effacer les
 * donnees de l'application en genere un nouveau et demande une reactivation —
 * c'est le comportement voulu.
 */
export async function empreinteAppareil(): Promise<string> {
  const existante = await lireCle(CLE_EMPREINTE);
  if (existante) return existante;

  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let empreinte = '';
  for (let i = 0; i < 32; i++) {
    empreinte += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  await ecrireCle(CLE_EMPREINTE, empreinte);
  return empreinte;
}

// --- etat courant ---------------------------------------------------------

export interface EtatAbonnement {
  /** Un droit valide est-il installe ? */
  active: boolean;
  droit: Droit | null;
  /** Ce qu'on montre au commercant. Vide si tout va bien. */
  message: string;
  /** Peut-on encaisser et enregistrer ? */
  peutEcrire: boolean;
  /** Le droit local est-il perime, faute de rafraichissement ? */
  perime: boolean;
}

const NON_ACTIVE: EtatAbonnement = {
  active: false,
  droit: null,
  message: "Cette application n'est pas encore activee.",
  peutEcrire: false,
  perime: false,
};

/**
 * Lit le droit installe.
 *
 * Ne va JAMAIS sur le reseau : cette fonction est appelee a chaque ouverture
 * d'ecran, y compris au fond d'un marche sans couverture.
 */
export async function etatCourant(): Promise<EtatAbonnement> {
  const licence = await lireCle(CLE_LICENCE);
  if (!licence) return NON_ACTIVE;

  let droit: Droit;
  try {
    droit = lireDroit(licence);
  } catch (erreur) {
    // Un droit illisible est traite comme une absence de droit, jamais comme
    // une autorisation. On le garde en base pour pouvoir diagnostiquer.
    return {
      ...NON_ACTIVE,
      message:
        erreur instanceof LicenceInvalide
          ? erreur.message
          : "Le droit d acces installe est illisible.",
    };
  }

  const perime = droitPerime(droit);
  if (perime) {
    return {
      active: false,
      droit,
      perime: true,
      peutEcrire: false,
      message:
        "Votre droit d acces doit etre verifie. Connectez le telephone a " +
        'Internet quelques secondes pour le renouveler.',
    };
  }

  return {
    active: droit.peutEntrer,
    droit,
    perime: false,
    peutEcrire: droit.peutEcrire,
    message: droit.raison,
  };
}

/**
 * Cette fonctionnalite est-elle comprise dans l'offre ?
 *
 * Tant qu'aucune activation n'a eu lieu, tout est ouvert : une application
 * fraichement installee doit pouvoir etre essayee. C'est le serveur qui
 * decide de fermer, jamais l'absence de reponse.
 */
export function autorise(etat: EtatAbonnement, code: string): boolean {
  if (!etat.droit) return true;
  return etat.droit.fonctionnalites.includes(code);
}

// --- appels au serveur ----------------------------------------------------

async function appeler(chemin: string, options: RequestInit = {}): Promise<unknown> {
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI_RESEAU);
  try {
    const reponse = await fetch(`${SERVEUR}${chemin}`, {
      ...options,
      signal: controleur.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
    const corps = await reponse.json().catch(() => ({}));
    if (!reponse.ok) {
      const detail =
        typeof (corps as { erreur?: unknown }).erreur === 'string'
          ? (corps as { erreur: string }).erreur
          : "Le serveur a refuse la demande.";
      throw new Error(detail);
    }
    return corps;
  } catch (erreur) {
    if (erreur instanceof Error && erreur.name === 'AbortError') {
      throw new Error(
        "Le serveur ne repond pas. Verifiez votre connexion et reessayez.",
      );
    }
    throw erreur;
  } finally {
    clearTimeout(minuterie);
  }
}

/**
 * Rattache ce telephone a une boutique et installe son droit.
 *
 * Appele une seule fois dans la vie de l'installation. Le rafraichissement
 * ulterieur passe par le jeton d'appareil, sans ressaisie.
 */
export async function activer(code: string, libelle = ''): Promise<EtatAbonnement> {
  const saisie = (code || '').trim().toUpperCase();
  if (!saisie) throw new Error("Saisissez le code d'activation.");

  const empreinte = await empreinteAppareil();
  const reponse = (await appeler('/api/public/activation/', {
    method: 'POST',
    body: JSON.stringify({ code: saisie, empreinte, libelle }),
  })) as { licence?: string; jeton_appareil?: string };

  if (!reponse.licence || !reponse.jeton_appareil) {
    throw new Error("Le serveur n'a pas renvoye de droit d acces.");
  }

  // On verifie AVANT d'enregistrer : mieux vaut echouer sur-le-champ que
  // stocker un droit que l'application refusera a la prochaine ouverture.
  lireDroit(reponse.licence);

  await ecrireCle(CLE_LICENCE, reponse.licence);
  await ecrireCle(CLE_APPAREIL, reponse.jeton_appareil);
  await ecrireCle(CLE_DERNIER_CONTACT, new Date().toISOString());
  return etatCourant();
}

/**
 * Renouvelle le droit quand le reseau est la.
 *
 * Silencieux par nature : appele au demarrage, il ne doit deranger personne
 * quand il echoue. Un echec laisse simplement le droit precedent en place,
 * jusqu'a sa propre echeance.
 */
export async function rafraichir(): Promise<EtatAbonnement> {
  const jeton = await lireCle(CLE_APPAREIL);
  if (!jeton) return etatCourant();

  const reponse = (await appeler('/api/public/licence/', {
    method: 'GET',
    headers: { 'X-Appareil': jeton },
  })) as { licence?: string };

  if (reponse.licence) {
    lireDroit(reponse.licence);
    await ecrireCle(CLE_LICENCE, reponse.licence);
    await ecrireCle(CLE_DERNIER_CONTACT, new Date().toISOString());
  }
  return etatCourant();
}

/**
 * Detache ce telephone.
 *
 * NE TOUCHE A AUCUNE DONNEE COMMERCIALE : ventes, produits, clients et stock
 * restent intacts. On retire un droit d'acces, on ne vide pas une caisse.
 */
export async function detacher(): Promise<void> {
  await ecrireCle(CLE_LICENCE, '');
  await ecrireCle(CLE_APPAREIL, '');
}

export async function dernierContact(): Promise<string> {
  return lireCle(CLE_DERNIER_CONTACT);
}

export async function jetonAppareil(): Promise<string> {
  return lireCle(CLE_APPAREIL);
}

// --- le verrou -------------------------------------------------------------
//
// CE QUI MANQUAIT, ET CE QUE CA COUTAIT
// --------------------------------------
// Tout ce qui precede etait ecrit, teste, et n'etait appele NULLE PART en
// dehors de l'ecran d'abonnement lui-meme. L'application fonctionnait donc
// entierement sans activation : un APK remis a cent personnes s'utilisait
// cent fois, gratuitement, sans limite de temps.
//
// Le verrou est pose dans les SERVICES d'ecriture, pas dans les ecrans. Un
// bouton grise se contourne ; une fonction qui refuse d'ecrire, non. C'est
// aussi le seul endroit ou l'on est certain de ne rien oublier : il n'y a
// qu'une facon d'enregistrer une vente.
//
// CE QUE LE VERROU NE FAIT JAMAIS
// --------------------------------
// Il n'efface rien et n'empeche rien de LIRE. Un commercant dont l'abonnement
// expire garde ses ventes, ses produits, ses clients, ses chiffres, et peut
// les consulter et les exporter. On ferme une caisse, on ne confisque pas une
// comptabilite.

/**
 * Une application jamais activee peut-elle vendre ?
 *
 * `true` : non. Le commercant doit saisir un code, obtenu aupres d'un
 * commercial ou sur le site. C'est la regle voulue pour la distribution :
 * l'APK se telecharge librement, et ce code est ce qui separe un curieux d'un
 * client.
 *
 * Passer cette constante a `false` rouvre l'application aux installations
 * neuves — utile pour une demonstration ou un salon. Une seule ligne, et elle
 * est ici pour qu'on la trouve.
 */
export const ACTIVATION_OBLIGATOIRE = true;

/** Levee quand l'ecriture est refusee. Son message s'affiche tel quel. */
export class EcritureFermee extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EcritureFermee';
  }
}

/**
 * Refuse d'ecrire si le droit ne le permet pas.
 *
 * A appeler en PREMIERE ligne de toute fonction qui enregistre une operation
 * commerciale. Le message est ecrit pour le commercant, pas pour le
 * developpeur : il dit quoi faire, et ou.
 */
export async function exigerEcriture(): Promise<void> {
  const etat = await etatCourant();
  if (etat.peutEcrire) return;

  if (!etat.droit) {
    if (!ACTIVATION_OBLIGATOIRE) return;
    // `etatCourant` distingue deux absences de droit : jamais active, et
    // droit present mais illisible — abime au transport, ou modifie a la
    // main dans la base du telephone. Le second porte un message precis, et
    // l'ecraser par « pas encore activee » enverrait le commercant ressaisir
    // un code alors que son probleme est ailleurs.
    throw new EcritureFermee(
      etat.message ||
        "Cette application n'est pas encore activee. Ouvrez « Mon abonnement » " +
          'dans le menu et saisissez le code recu de SahelPOS.',
    );
  }

  if (etat.perime) {
    throw new EcritureFermee(
      "Votre droit d acces doit etre verifie. Connectez le telephone a " +
        'Internet quelques secondes, puis reessayez.',
    );
  }

  throw new EcritureFermee(
    etat.message ||
      "Votre abonnement ne permet plus d enregistrer d operations. " +
        'Contactez SahelPOS.',
  );
}
