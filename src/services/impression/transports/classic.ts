/**
 * Canal Bluetooth Classic (SPP / RFCOMM).
 *
 * C'est le canal des imprimantes 58 mm bon marche vendues au Mali : un port
 * serie emule au-dessus du Bluetooth, sur lequel on ecrit des octets ESC/POS
 * sans autre ceremonie. Il n'existe que sur Android : sur iOS, le SPP est
 * reserve aux accessoires certifies MFi, qu'aucune imprimante a 15 000 F n'est.
 *
 * AIDES PARTAGEES
 * ---------------
 * `demanderPermissionsBluetooth`, `versBase64` et `pause` sont declarees ici et
 * reutilisees par le canal BLE. Elles ne sont pas propres au SPP, mais Android
 * accorde les permissions Bluetooth a l'APPLICATION et non a un canal : une
 * seule demande couvre les deux, et la dupliquer ferait apparaitre deux boites
 * de dialogue identiques a l'utilisateur.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import type { Permission } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import type {
  BluetoothDevice,
  BluetoothEventSubscription,
  BluetoothNativeDevice,
  StandardOptions,
} from 'react-native-bluetooth-classic';

import {
  ImprimanteIndisponible,
  type AppareilImprimante,
  type Transport,
} from '../imprimante';

/** Android 12 (API 31) a introduit les permissions Bluetooth dediees. */
const ANDROID_12 = 31;

/**
 * Options de connexion RFCOMM.
 *
 * Les cles sont en MAJUSCULES et non en `camelCase` comme le suggerent les
 * typages de la bibliotheque : cote Java, l'option est cherchee d'abord par le
 * nom de la constante (`SECURE_SOCKET`), puis en minuscules, puis par un code
 * interne qui vaut `secure` — jamais `secureSocket`. Ecrire `secureSocket`
 * revient donc a ne rien passer du tout.
 */
interface OptionsRfcomm extends StandardOptions {
  CONNECTOR_TYPE?: string;
  CONNECTION_TYPE?: string;
  SECURE_SOCKET?: boolean;
  DELIMITER?: string;
  READ_SIZE?: number;
}

/**
 * `binary` branche la connexion sur un flux d'octets bruts. Le mode par defaut
 * (`delimited`) decoupe ce qui transite en chaines separees par des sauts de
 * ligne : un ticket ESC/POS, plein de `\n` et d'octets de commande, y serait
 * decoupe et re-encode n'importe comment.
 */
const OPTIONS_BASE: OptionsRfcomm = {
  CONNECTOR_TYPE: 'rfcomm',
  CONNECTION_TYPE: 'binary',
  DELIMITER: '',
  READ_SIZE: 1024,
};

const ALPHABET_BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encode des octets en base64.
 *
 * Les deux bibliotheques Bluetooth n'acceptent que du base64 : c'est le seul
 * format binaire qui traverse proprement le pont natif de React Native. On
 * n'utilise ni `btoa` (absent selon les moteurs JS) ni `Buffer` (absent de
 * React Native sans polyfill) : quinze lignes ici evitent une dependance de
 * plus et un plantage a l'impression, c'est-a-dire au pire moment.
 */
export function versBase64(octets: Uint8Array): string {
  let sortie = '';
  for (let i = 0; i < octets.length; i += 3) {
    const restants = octets.length - i;
    const o0 = octets[i];
    const o1 = restants > 1 ? octets[i + 1] : 0;
    const o2 = restants > 2 ? octets[i + 2] : 0;

    sortie += ALPHABET_BASE64[o0 >> 2];
    sortie += ALPHABET_BASE64[((o0 & 0x03) << 4) | (o1 >> 4)];
    sortie += restants > 1 ? ALPHABET_BASE64[((o1 & 0x0f) << 2) | (o2 >> 6)] : '=';
    sortie += restants > 2 ? ALPHABET_BASE64[o2 & 0x3f] : '=';
  }
  return sortie;
}

/** Attente non bloquante, utilisee comme garde-fou de duree de recherche. */
export function pause(dureeMs: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, dureeMs));
}

/**
 * Demande les permissions Bluetooth d'Android et dit si tout a ete accorde.
 *
 * POURQUOI LA LOCALISATION SUR ANDROID 11 ET ANTERIEUR
 * ---------------------------------------------------
 * Jusqu'a Android 11 (API 30), il n'existait aucune permission Bluetooth
 * "dangereuse" : scanner revenait a lire les identifiants des appareils
 * alentour, ce qui permet de deduire la position de l'utilisateur (les balises
 * Bluetooth des magasins servent exactement a cela). Google a donc verrouille
 * la decouverte derriere ACCESS_FINE_LOCATION. Sans cette permission, le scan
 * ne renvoie AUCUN appareil — sans jamais lever d'erreur, ce qui donne
 * l'illusion qu'aucune imprimante n'est allumee.
 *
 * Depuis Android 12 (API 31), BLUETOOTH_SCAN et BLUETOOTH_CONNECT remplacent ce
 * detour et la localisation n'est plus demandee : inutile d'inquieter le
 * commercant avec une permission qui n'a rien a voir avec son imprimante.
 */
export async function demanderPermissionsBluetooth(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const version =
    typeof Platform.Version === 'number'
      ? Platform.Version
      : Number.parseInt(Platform.Version, 10);

  const requises: Permission[] =
    version >= ANDROID_12
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  try {
    const reponses = await PermissionsAndroid.requestMultiple(requises);
    return requises.every(
      (permission) => reponses[permission] === PermissionsAndroid.RESULTS.GRANTED,
    );
  } catch {
    return false;
  }
}

/** Un appareil sans nom exploitable ne peut pas etre reconnu par le commercant. */
function nomLisible(appareil: BluetoothNativeDevice): string | null {
  const nom = typeof appareil.name === 'string' ? appareil.name.trim() : '';
  if (nom.length === 0) return null;
  return nom === appareil.address ? null : nom;
}

/** Les adresses MAC remontent tantot en majuscules tantot en minuscules. */
function cle(adresse: string): string {
  return adresse.toUpperCase();
}

function raison(erreur: unknown): string {
  if (erreur instanceof Error) return erreur.message;
  return String(erreur);
}

export class TransportBluetoothClassic implements Transport {
  readonly nom = 'Bluetooth Classic';

  private appareil: BluetoothDevice | null = null;

  async estDisponible(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    if (!(await demanderPermissionsBluetooth())) return false;
    try {
      if (!(await RNBluetoothClassic.isBluetoothAvailable())) return false;
      return await RNBluetoothClassic.isBluetoothEnabled();
    } catch {
      return false;
    }
  }

  async rechercher(dureeMs = 8000): Promise<AppareilImprimante[]> {
    const trouves = new Map<string, AppareilImprimante>();

    // Une imprimante deja appairee dans les reglages Android n'apparait PAS
    // dans la decouverte : elle n'est visible que par getBondedDevices. C'est
    // le cas le plus courant en boutique, on commence donc par la.
    for (const appareil of await this.appairees()) {
      trouves.set(cle(appareil.address), {
        id: appareil.address,
        nom: nomLisible(appareil),
      });
    }

    await this.decouvrir(dureeMs, trouves);

    return [...trouves.values()];
  }

  async connecter(idAppareil: string): Promise<void> {
    await this.deconnecter();

    // La decouverte sature la radio : tant qu'elle tourne, l'ouverture du
    // socket echoue une fois sur deux.
    await RNBluetoothClassic.cancelDiscovery().catch(() => false);

    try {
      this.appareil = await this.ouvrir(idAppareil, true);
      return;
    } catch (erreurSecurisee) {
      // Beaucoup d'imprimantes bon marche n'implementent pas l'appairage
      // chiffre : le socket securise est refuse alors que le socket ouvert
      // fonctionne. On ne peut pas le savoir a l'avance, on essaie les deux.
      try {
        this.appareil = await this.ouvrir(idAppareil, false);
        return;
      } catch (erreurOuverte) {
        throw new ImprimanteIndisponible(
          `Connexion impossible a l'imprimante ${idAppareil} : ` +
            `${raison(erreurSecurisee)} / ${raison(erreurOuverte)}. ` +
            'Verifiez qu elle est allumee, chargee, et appairee dans les ' +
            'reglages Bluetooth du telephone.',
        );
      }
    }
  }

  async envoyer(octets: Uint8Array): Promise<void> {
    const appareil = this.appareil;
    if (!appareil) {
      throw new ImprimanteIndisponible('Aucune imprimante Bluetooth Classic connectee.');
    }
    let accepte = false;
    try {
      accepte = await appareil.write(versBase64(octets), 'base64');
    } catch (erreur) {
      throw new ImprimanteIndisponible(
        `Envoi interrompu vers l'imprimante : ${raison(erreur)}.`,
      );
    }
    if (!accepte) {
      throw new ImprimanteIndisponible(
        'L imprimante a refuse les donnees : liaison perdue en cours de ticket.',
      );
    }
  }

  async deconnecter(): Promise<void> {
    const appareil = this.appareil;
    this.appareil = null;
    if (!appareil) return;
    // Une imprimante deja eteinte fait echouer disconnect : l'etat local est
    // deja remis a zero, l'erreur n'apprendrait rien a l'utilisateur.
    await appareil.disconnect().catch(() => false);
  }

  private async appairees(): Promise<BluetoothNativeDevice[]> {
    try {
      return await RNBluetoothClassic.getBondedDevices();
    } catch {
      return [];
    }
  }

  private async ouvrir(adresse: string, securise: boolean): Promise<BluetoothDevice> {
    const options: OptionsRfcomm = { ...OPTIONS_BASE, SECURE_SOCKET: securise };
    return RNBluetoothClassic.connectToDevice(adresse, options);
  }

  /**
   * Decouverte des appareils non appaires, bornee a `dureeMs`.
   *
   * `startDiscovery` ne rend la main qu'au bout du cycle complet d'Android
   * (une douzaine de secondes) : on ecoute donc les appareils au fil de l'eau
   * et on rend la liste des qu'un des deux arrive au bout, pour que le bouton
   * "Rechercher" reponde dans un delai previsible.
   */
  private async decouvrir(
    dureeMs: number,
    trouves: Map<string, AppareilImprimante>,
  ): Promise<void> {
    let abonnement: BluetoothEventSubscription | null = null;
    try {
      abonnement = RNBluetoothClassic.onDeviceDiscovered((evenement) => {
        const appareil = evenement.device;
        if (!appareil || typeof appareil.address !== 'string') return;
        const identifiant = cle(appareil.address);
        // Un appareil appaire porte deja son nom : ne pas l'ecraser par la
        // fiche de decouverte, souvent plus pauvre.
        if (trouves.has(identifiant)) return;
        trouves.set(identifiant, {
          id: appareil.address,
          nom: nomLisible(appareil),
        });
      });

      const decouverte = RNBluetoothClassic.startDiscovery().catch(
        (): BluetoothDevice[] => [],
      );
      const resultat = await Promise.race([
        decouverte,
        pause(dureeMs).then((): null => null),
      ]);

      if (resultat) {
        for (const appareil of resultat) {
          const identifiant = cle(appareil.address);
          if (trouves.has(identifiant)) continue;
          trouves.set(identifiant, {
            id: appareil.address,
            nom: nomLisible(appareil),
          });
        }
      }
    } finally {
      abonnement?.remove();
      // Laisser la decouverte tourner viderait la batterie et empecherait la
      // connexion qui suit immediatement.
      await RNBluetoothClassic.cancelDiscovery().catch(() => false);
    }
  }
}

/** Instance unique : le module natif ne gere de toute facon qu'un adaptateur. */
export const transportBluetoothClassic = new TransportBluetoothClassic();
