/**
 * Canal Bluetooth Low Energy.
 *
 * Les imprimantes recentes (et la totalite de celles utilisables depuis un
 * iPhone) exposent un service GATT au lieu d'un port serie. Le principe reste
 * le meme : on ecrit les octets ESC/POS dans une caracteristique inscriptible.
 *
 * Deux differences pratiques changent tout par rapport au SPP :
 *   - le BLE ne "decouvre" pas des appareils appaires, il ecoute des annonces :
 *     l'imprimante doit etre allumee au moment de la recherche ;
 *   - une ecriture BLE est plafonnee par le MTU negocie, 23 octets par defaut
 *     dont 3 d'en-tete. Sans renegociation, un ticket part par tranches de 20
 *     octets — d'ou la demande de MTU a la connexion et le decoupage interne.
 */
import { Platform } from 'react-native';
import { BleManager, ScanMode, State } from 'react-native-ble-plx';
import type { BleError, Characteristic, Device } from 'react-native-ble-plx';

import {
  ImprimanteIndisponible,
  type AppareilImprimante,
  type Transport,
} from '../imprimante';

import { demanderPermissionsBluetooth, pause, versBase64 } from './classic';

/** MTU minimal impose par la specification BLE, en-tete ATT comprise. */
const MTU_MINIMAL = 23;
const EN_TETE_ATT = 3;
/** Valeur haute acceptee par Android ; l'imprimante negocie a la baisse. */
const MTU_DEMANDE = 512;
const DELAI_CONNEXION_MS = 15000;

/** Ou ecrire le ticket une fois l'imprimante connectee. */
interface CibleEcriture {
  service: string;
  caracteristique: string;
  /** Vrai si la caracteristique accuse reception de chaque ecriture. */
  avecReponse: boolean;
}

/**
 * Couples service/caracteristique connus des imprimantes a tickets.
 *
 * Ils servent a departager quand plusieurs caracteristiques sont inscriptibles
 * (batterie, configuration, mise a jour du firmware...) : ecrire un ticket dans
 * la mauvaise ne produit rien de visible et fait perdre un temps fou au
 * diagnostic.
 */
const CIBLES_CONNUES: ReadonlyArray<{ service: string; caracteristique: string }> = [
  // Service 0x18F0, de loin le plus repandu sur les modules BLE d'imprimantes.
  {
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    caracteristique: '00002af1-0000-1000-8000-00805f9b34fb',
  },
  // Nordic UART Service : l'autre grand classique, un port serie sur BLE.
  {
    service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    caracteristique: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  },
];

function raison(erreur: unknown): string {
  if (erreur instanceof Error) return erreur.message;
  return String(erreur);
}

/**
 * Le BLE annonce quantite d'appareils qui ne sont pas des imprimantes (montres,
 * ecouteurs, balises), et beaucoup n'annoncent aucun nom. Une adresse nue ne
 * veut rien dire pour un commercant : on ne lui montre que ce qu'il peut
 * reconnaitre.
 */
function nomLisible(appareil: Device): string | null {
  for (const candidat of [appareil.name, appareil.localName]) {
    if (typeof candidat === 'string' && candidat.trim().length > 0) {
      return candidat.trim();
    }
  }
  return null;
}

export class TransportBluetoothLowEnergy implements Transport {
  readonly nom = 'Bluetooth BLE';

  private gestionnaire: BleManager | null = null;
  private appareil: Device | null = null;
  private cible: CibleEcriture | null = null;
  private tailleBloc = MTU_MINIMAL - EN_TETE_ATT;

  /**
   * Construire un BleManager allume la pile Bluetooth native. On attend donc le
   * premier besoin reel : une application ouverte sur l'ecran de vente n'a
   * aucune raison de reveiller la radio.
   */
  private obtenirGestionnaire(): BleManager {
    if (!this.gestionnaire) this.gestionnaire = new BleManager();
    return this.gestionnaire;
  }

  async estDisponible(): Promise<boolean> {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;
    if (!(await demanderPermissionsBluetooth())) return false;
    try {
      return (await this.obtenirGestionnaire().state()) === State.PoweredOn;
    } catch {
      return false;
    }
  }

  async rechercher(dureeMs = 8000): Promise<AppareilImprimante[]> {
    const gestionnaire = this.obtenirGestionnaire();
    const trouves = new Map<string, AppareilImprimante>();

    await new Promise<void>((resoudre, rejeter) => {
      const minuterie = setTimeout(() => {
        void gestionnaire.stopDeviceScan().catch(() => undefined);
        resoudre();
      }, dureeMs);

      const echouer = (erreur: unknown): void => {
        clearTimeout(minuterie);
        void gestionnaire.stopDeviceScan().catch(() => undefined);
        rejeter(
          new ImprimanteIndisponible(
            `Recherche Bluetooth BLE impossible : ${raison(erreur)}.`,
          ),
        );
      };

      // `null` en premier argument : on ne filtre pas par service. Beaucoup
      // d'imprimantes n'annoncent pas leur service GATT dans la trame de
      // publicite ; filtrer dessus reviendrait a ne jamais les voir.
      gestionnaire
        .startDeviceScan(
          null,
          { allowDuplicates: false, scanMode: ScanMode.LowLatency },
          (erreur: BleError | null, appareil: Device | null) => {
            if (erreur !== null) {
              echouer(erreur);
              return;
            }
            if (appareil === null) return;
            const nom = nomLisible(appareil);
            if (nom === null) return;
            trouves.set(appareil.id.toUpperCase(), { id: appareil.id, nom });
          },
        )
        .catch(echouer);
    });

    return [...trouves.values()];
  }

  async connecter(idAppareil: string): Promise<void> {
    const gestionnaire = this.obtenirGestionnaire();
    await this.deconnecter();
    // Un scan en cours monopolise la radio et fait echouer la connexion.
    await gestionnaire.stopDeviceScan().catch(() => undefined);

    try {
      const connecte = await gestionnaire.connectToDevice(idAppareil, {
        timeout: DELAI_CONNEXION_MS,
      });

      // La negociation de MTU n'existe que sur Android ; un refus n'est pas une
      // erreur, on retombe simplement sur les 20 octets utiles reglementaires.
      const negocie =
        Platform.OS === 'android'
          ? await connecte.requestMTU(MTU_DEMANDE).catch(() => connecte)
          : connecte;

      this.tailleBloc = Math.max(
        MTU_MINIMAL - EN_TETE_ATT,
        (negocie.mtu || MTU_MINIMAL) - EN_TETE_ATT,
      );

      const explore = await negocie.discoverAllServicesAndCharacteristics();
      this.cible = await this.trouverCible(explore);
      this.appareil = explore;
    } catch (erreur) {
      await this.deconnecter();
      if (erreur instanceof ImprimanteIndisponible) throw erreur;
      throw new ImprimanteIndisponible(
        `Connexion BLE impossible a ${idAppareil} : ${raison(erreur)}. ` +
          'Verifiez que l imprimante est allumee et a portee.',
      );
    }
  }

  async envoyer(octets: Uint8Array): Promise<void> {
    const appareil = this.appareil;
    const cible = this.cible;
    if (!appareil || !cible) {
      throw new ImprimanteIndisponible('Aucune imprimante BLE connectee.');
    }
    const gestionnaire = this.obtenirGestionnaire();

    // Second decoupage, en plus de celui du service d'impression : celui-ci est
    // impose par le MTU de la liaison, pas par le tampon de l'imprimante. Une
    // ecriture plus longue que le MTU est tronquee sans erreur.
    for (let i = 0; i < octets.length; i += this.tailleBloc) {
      const bloc = versBase64(octets.slice(i, i + this.tailleBloc));
      try {
        if (cible.avecReponse) {
          await gestionnaire.writeCharacteristicWithResponseForDevice(
            appareil.id,
            cible.service,
            cible.caracteristique,
            bloc,
          );
        } else {
          await gestionnaire.writeCharacteristicWithoutResponseForDevice(
            appareil.id,
            cible.service,
            cible.caracteristique,
            bloc,
          );
          // Sans accuse de reception, rien ne freine l'envoi : le tampon de
          // l'imprimante deborde et la fin du ticket est perdue en silence.
          await pause(20);
        }
      } catch (erreur) {
        throw new ImprimanteIndisponible(
          `Envoi interrompu vers l'imprimante BLE : ${raison(erreur)}.`,
        );
      }
    }
  }

  async deconnecter(): Promise<void> {
    const appareil = this.appareil;
    this.appareil = null;
    this.cible = null;
    this.tailleBloc = MTU_MINIMAL - EN_TETE_ATT;
    if (!appareil) return;
    await this.obtenirGestionnaire()
      .cancelDeviceConnection(appareil.id)
      .catch(() => undefined);
  }

  /**
   * Choisit la caracteristique dans laquelle ecrire le ticket : d'abord un
   * couple connu, a defaut la premiere caracteristique inscriptible trouvee.
   */
  private async trouverCible(appareil: Device): Promise<CibleEcriture> {
    const candidates: CibleEcriture[] = [];

    for (const service of await appareil.services()) {
      let caracteristiques: Characteristic[];
      try {
        caracteristiques = await service.characteristics();
      } catch {
        continue;
      }
      for (const caracteristique of caracteristiques) {
        const inscriptible =
          caracteristique.isWritableWithResponse ||
          caracteristique.isWritableWithoutResponse;
        if (!inscriptible) continue;
        candidates.push({
          service: service.uuid.toLowerCase(),
          caracteristique: caracteristique.uuid.toLowerCase(),
          avecReponse: caracteristique.isWritableWithResponse,
        });
      }
    }

    if (candidates.length === 0) {
      throw new ImprimanteIndisponible(
        'Cet appareil BLE n expose aucune caracteristique inscriptible : ' +
          'ce n est pas une imprimante a tickets.',
      );
    }

    for (const connue of CIBLES_CONNUES) {
      const trouvee = candidates.find(
        (candidate) =>
          candidate.service === connue.service &&
          candidate.caracteristique === connue.caracteristique,
      );
      if (trouvee) return trouvee;
    }

    return candidates[0];
  }
}

/** Instance unique : un seul BleManager par application, sinon les scans se genent. */
export const transportBluetoothLowEnergy = new TransportBluetoothLowEnergy();
