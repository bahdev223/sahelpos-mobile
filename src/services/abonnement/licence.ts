/**
 * Lecture et verification du droit d'acces remis par le serveur.
 *
 * POURQUOI VERIFIER ICI PLUTOT QUE DEMANDER AU SERVEUR
 * ----------------------------------------------------
 * L'application tient la caisse d'une boutique de quartier : elle doit ouvrir
 * et encaisser meme sans reseau, ce qui arrive tous les jours. Elle garde donc
 * le droit en local et le verifie elle-meme, avec la cle PUBLIQUE.
 *
 * POURQUOI CE FICHIER NE PEUT PAS FABRIQUER DE DROIT
 * ---------------------------------------------------
 * Il ne detient que la cle publique : elle permet de verifier une signature,
 * jamais d'en produire une. Un APK decompresse ne livre donc rien
 * d'exploitable. C'est toute la raison d'avoir choisi Ed25519 plutot qu'un
 * secret partage.
 *
 * CE QUI RESTE CONTOURNABLE
 * --------------------------
 * Reculer l'horloge du telephone repousse l'echeance percue. On l'accepte : la
 * parade coute cher pour un gain faible. Le droit lui-meme est court — trente
 * jours — donc un telephone durablement decale finit sans rien de valide a
 * presenter, et l'application redemande une activation.
 */
import nacl from 'tweetnacl';

/**
 * Cle publique de SahelTech.
 *
 * Elle n'a rien de secret : elle ne sert qu'a verifier. La cle privee qui
 * correspond ne quitte jamais le serveur.
 */
const CLE_PUBLIQUE = 'SP7gf7Ei9MFKpqPvQxtTn2qPhEOHQFtmXn0Ro9ih8sA=';

/** Forme de droit que cette version sait lire. */
const VERSION_ATTENDUE = 1;

export interface Droit {
  version: number;
  boutique: string;
  nom: string;
  plan: string;
  statut: string;
  /** La boutique est-elle joignable ? Faux = suspendue, resiliee, grace finie. */
  peutEntrer: boolean;
  /** Peut-on encaisser et enregistrer ? Faux pendant la periode de grace. */
  peutEcrire: boolean;
  fonctionnalites: string[];
  /** Message destine au commercant. Vide si tout va bien. */
  raison: string;
  /** Vraie echeance commerciale, distincte du droit offline de 30 jours. */
  abonnementExpireLe: string;
  finGraceLe: string;
  joursRestants: number | null;
  expireLe: string;
  emisLe: string;
}

export class LicenceInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicenceInvalide';
  }
}

// --- base64 ---------------------------------------------------------------
//
// Hermes n'a ni `Buffer` ni `atob` fiable sur toutes les versions d'Android :
// on decode a la main. Trente lignes valent mieux qu'une dependance de plus
// dans un chemin aussi critique que la verification d'un droit.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function versOctets(base64: string): Uint8Array {
  // On accepte les deux alphabets : le serveur emet en base64 URL, la cle
  // publique est en base64 standard.
  const normalise = base64.replace(/-/g, '+').replace(/_/g, '/');
  const sansRemplissage = normalise.replace(/=+$/, '');

  const octets = new Uint8Array(Math.floor((sansRemplissage.length * 3) / 4));
  let tampon = 0;
  let bits = 0;
  let sortie = 0;

  for (const caractere of sansRemplissage) {
    const valeur = ALPHABET.indexOf(caractere);
    if (valeur === -1) {
      throw new LicenceInvalide('Le droit d acces est illisible.');
    }
    tampon = (tampon << 6) | valeur;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      octets[sortie++] = (tampon >> bits) & 0xff;
    }
  }
  return octets.subarray(0, sortie);
}

/** UTF-8 -> texte. `TextDecoder` manque sur certaines versions d'Hermes. */
function versTexte(octets: Uint8Array): string {
  let sortie = '';
  let i = 0;
  while (i < octets.length) {
    const o = octets[i];
    if (o < 0x80) {
      sortie += String.fromCharCode(o);
      i += 1;
    } else if (o < 0xe0) {
      sortie += String.fromCharCode(((o & 0x1f) << 6) | (octets[i + 1] & 0x3f));
      i += 2;
    } else if (o < 0xf0) {
      sortie += String.fromCharCode(
        ((o & 0x0f) << 12) | ((octets[i + 1] & 0x3f) << 6) | (octets[i + 2] & 0x3f),
      );
      i += 3;
    } else {
      const point =
        ((o & 0x07) << 18) |
        ((octets[i + 1] & 0x3f) << 12) |
        ((octets[i + 2] & 0x3f) << 6) |
        (octets[i + 3] & 0x3f);
      const decale = point - 0x10000;
      sortie += String.fromCharCode(0xd800 + (decale >> 10), 0xdc00 + (decale & 0x3ff));
      i += 4;
    }
  }
  return sortie;
}

/**
 * Verifie la signature et rend le droit.
 *
 * Leve `LicenceInvalide` des que quelque chose cloche : signature fausse,
 * forme inconnue, contenu tronque. On ne devine jamais la moitie d'un droit —
 * un droit a moitie lu ouvrirait des fonctionnalites au hasard.
 */
export function lireDroit(licence: string): Droit {
  const morceaux = (licence || '').trim().split('.');
  if (morceaux.length !== 2 || !morceaux[0] || !morceaux[1]) {
    throw new LicenceInvalide('Le droit d acces est mal forme.');
  }

  const corps = versOctets(morceaux[0]);
  const signature = versOctets(morceaux[1]);
  const cle = versOctets(CLE_PUBLIQUE);

  if (!nacl.sign.detached.verify(corps, signature, cle)) {
    throw new LicenceInvalide(
      "Ce droit d acces n a pas ete emis par SahelPOS. Ressaisissez votre code d activation.",
    );
  }

  let brut: Record<string, unknown>;
  try {
    brut = JSON.parse(versTexte(corps));
  } catch {
    throw new LicenceInvalide('Le contenu du droit est illisible.');
  }

  if (brut.version !== VERSION_ATTENDUE) {
    throw new LicenceInvalide(
      "Ce droit vient d une version plus recente de SahelPOS. Mettez l application a jour.",
    );
  }

  return {
    version: VERSION_ATTENDUE,
    boutique: String(brut.boutique ?? ''),
    nom: String(brut.nom ?? ''),
    plan: String(brut.plan ?? ''),
    statut: String(brut.statut ?? ''),
    peutEntrer: brut.peut_entrer === true,
    peutEcrire: brut.peut_ecrire === true,
    fonctionnalites: Array.isArray(brut.fonctionnalites)
      ? (brut.fonctionnalites as unknown[]).map(String)
      : [],
    raison: String(brut.raison ?? ''),
    abonnementExpireLe: String(brut.abonnement_expire_le ?? ''),
    finGraceLe: String(brut.fin_grace_le ?? ''),
    joursRestants: Number.isFinite(Number(brut.jours_restants))
      ? Math.max(0, Math.floor(Number(brut.jours_restants)))
      : null,
    expireLe: String(brut.expire_le ?? ''),
    emisLe: String(brut.emis_le ?? ''),
  };
}

/** Le droit lui-meme est-il perime ? Distinct de l'echeance de l'abonnement. */
export function droitPerime(droit: Droit, maintenant = new Date()): boolean {
  const fin = new Date(droit.expireLe);
  if (Number.isNaN(fin.getTime())) return true;
  return fin.getTime() < maintenant.getTime();
}
