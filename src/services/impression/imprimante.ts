/**
 * Envoi d'un ticket a l'imprimante thermique.
 *
 * POURQUOI UNE ABSTRACTION ICI
 * ----------------------------
 * Les imprimantes a tickets se repartissent en deux familles de Bluetooth, qui
 * n'ont RIEN en commun cote code :
 *
 *   - Bluetooth Classic (SPP) : la majorite des petites 58 mm bon marche.
 *     Demande `react-native-bluetooth-classic`.
 *   - Bluetooth Low Energy (BLE) : les modeles plus recents.
 *     Demande `react-native-ble-plx`.
 *
 * Tant que le modele exact n'est pas connu, on ne peut pas trancher. Tout le
 * reste de l'application ne parle donc qu'a l'interface `Transport` : le jour
 * ou l'on sait, on ecrit une implementation de plus et rien d'autre ne bouge.
 */
import type { Ticket } from './escpos';

export interface AppareilImprimante {
  id: string;
  nom: string | null;
}

/** Ce que doit savoir faire un canal vers l'imprimante, quel que soit son type. */
export interface Transport {
  readonly nom: string;
  estDisponible(): Promise<boolean>;
  rechercher(dureeMs?: number): Promise<AppareilImprimante[]>;
  connecter(idAppareil: string): Promise<void>;
  envoyer(octets: Uint8Array): Promise<void>;
  deconnecter(): Promise<void>;
}

export class ImprimanteIndisponible extends Error {
  constructor(raison: string) {
    super(raison);
    this.name = 'ImprimanteIndisponible';
  }
}

export class ServiceImpression {
  private transport: Transport | null = null;
  private appareilConnecte: string | null = null;

  definirTransport(transport: Transport): void {
    this.transport = transport;
  }

  private exigerTransport(): Transport {
    if (!this.transport) {
      throw new ImprimanteIndisponible(
        "Aucun canal d'impression configure. Le modele d'imprimante doit etre " +
          'connu pour choisir entre Bluetooth Classic et BLE.',
      );
    }
    return this.transport;
  }

  async rechercher(dureeMs = 8000): Promise<AppareilImprimante[]> {
    const t = this.exigerTransport();
    if (!(await t.estDisponible())) {
      throw new ImprimanteIndisponible(
        'Bluetooth indisponible : verifiez qu il est active et que la ' +
          'permission a ete accordee a l application.',
      );
    }
    return t.rechercher(dureeMs);
  }

  async connecter(idAppareil: string): Promise<void> {
    await this.exigerTransport().connecter(idAppareil);
    this.appareilConnecte = idAppareil;
  }

  get connecte(): boolean {
    return this.appareilConnecte !== null;
  }

  /**
   * Imprime un ticket. Les octets sont envoyes par petits blocs : beaucoup
   * d'imprimantes ont un tampon minuscule et perdent silencieusement la fin du
   * ticket si on leur envoie tout d'un coup.
   */
  async imprimer(ticket: Ticket, tailleBloc = 180): Promise<void> {
    const t = this.exigerTransport();
    if (!this.connecte) {
      throw new ImprimanteIndisponible('Aucune imprimante connectee.');
    }
    const octets = ticket.versOctets();
    for (let i = 0; i < octets.length; i += tailleBloc) {
      await t.envoyer(octets.slice(i, i + tailleBloc));
    }
  }

  async deconnecter(): Promise<void> {
    if (!this.transport || !this.appareilConnecte) return;
    await this.transport.deconnecter();
    this.appareilConnecte = null;
  }
}

export const serviceImpression = new ServiceImpression();
