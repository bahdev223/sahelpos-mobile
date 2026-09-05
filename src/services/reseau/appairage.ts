/**
 * Appairage : le QR code que le vendeur scanne pour rejoindre la boutique.
 *
 * Le QR porte tout ce qu'il faut pour se connecter, ET un jeton. Sans jeton,
 * n'importe qui sur le Wi-Fi de la boutique — un client, le voisin — pourrait
 * lire la caisse. Le patron peut renouveler ce jeton a tout moment : les
 * telephones deja appaires sont alors deconnectes, ce qui est le moyen de
 * couper un vendeur qui est parti.
 */
import { PORT_PAR_DEFAUT, VERSION_PROTOCOLE } from './protocole';

/** Marqueur en tete du QR : evite de tenter une connexion sur un QR quelconque. */
const MARQUEUR = 'SAHELPOS';

export interface InvitationBoutique {
  version: number;
  adresse: string;
  port: number;
  jeton: string;
  boutique: string;
}

export class InvitationIllisible extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvitationIllisible';
  }
}

/**
 * Jeton aleatoire.
 *
 * `Math.random` ne convient pas pour un secret, mais la portee est un reseau
 * Wi-Fi local et la duree de vie une journee de travail. On compense par la
 * longueur, et le patron peut renouveler d'un geste.
 */
export function genererJeton(longueur = 24): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let jeton = '';
  for (let i = 0; i < longueur; i++) {
    jeton += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return jeton;
}

/**
 * Contenu du QR code.
 *
 * Format texte compact plutot que JSON : moins de caracteres, donc un QR moins
 * dense, donc plus facile a scanner sur un ecran de telephone parfois sale ou
 * fissure.
 */
export function encoderInvitation(invitation: InvitationBoutique): string {
  const boutique = invitation.boutique.replace(/[|]/g, ' ').trim();
  return [
    MARQUEUR,
    invitation.version,
    invitation.adresse,
    invitation.port,
    invitation.jeton,
    boutique,
  ].join('|');
}

export function decoderInvitation(contenu: string): InvitationBoutique {
  const morceaux = contenu.trim().split('|');
  if (morceaux[0] !== MARQUEUR) {
    throw new InvitationIllisible(
      "Ce QR code n'est pas celui de SahelPOS. Demandez au patron d'afficher " +
        "l'ecran Partager la boutique.",
    );
  }
  // Le nom de la boutique peut contenir des espaces mais jamais de |, on
  // recolle donc simplement les eventuels morceaux restants.
  const [, version, adresse, port, jeton, ...reste] = morceaux;

  const versionNombre = Number(version);
  const portNombre = Number(port) || PORT_PAR_DEFAUT;

  if (!adresse || !jeton) {
    throw new InvitationIllisible('Ce QR code est incomplet. Faites-le reafficher.');
  }
  if (!Number.isFinite(versionNombre)) {
    throw new InvitationIllisible('Ce QR code est illisible.');
  }
  if (versionNombre !== VERSION_PROTOCOLE) {
    throw new InvitationIllisible(
      "Les deux telephones n'ont pas la meme version de l'application. Mettez-les a jour.",
    );
  }

  return {
    version: versionNombre,
    adresse,
    port: portNombre,
    jeton,
    boutique: reste.join('|').trim() || 'Boutique',
  };
}

/** Adresse de base du serveur du patron. */
export function urlBase(invitation: Pick<InvitationBoutique, 'adresse' | 'port'>): string {
  return `http://${invitation.adresse}:${invitation.port}`;
}

/**
 * Une adresse utilisable sur le reseau local ?
 *
 * Sans Wi-Fi, `expo-network` renvoie une adresse de bouclage ou rien : mieux
 * vaut le dire avant d'afficher un QR code qui ne menerait nulle part.
 */
export function adresseUtilisable(adresse: string | null | undefined): boolean {
  if (!adresse) return false;
  if (adresse === '0.0.0.0' || adresse.startsWith('127.')) return false;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(adresse);
}
