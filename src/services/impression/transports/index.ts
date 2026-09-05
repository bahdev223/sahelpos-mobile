/**
 * Recherche unifiee des imprimantes, sur les deux canaux a la fois.
 *
 * POURQUOI CE MODULE
 * ------------------
 * Un commercant ne sait pas — et n'a aucune raison de savoir — si son
 * imprimante parle Bluetooth Classic ou Bluetooth Low Energy. Rien sur le
 * carton ne le dit. Lui demander de choisir un canal avant de chercher, c'est
 * garantir qu'une fois sur deux il conclura que son imprimante est en panne.
 *
 * Ici on interroge donc les DEUX canaux en parallele, on fusionne les
 * resultats en une seule liste, et chaque appareil se souvient du canal qui l'a
 * trouve. L'utilisateur appuie sur Rechercher, voit son appareil, le choisit :
 * `connecterImprimante` installe le bon transport dans le service d'impression
 * et le reste de l'application n'en saura jamais rien.
 */
import {
  ImprimanteIndisponible,
  serviceImpression,
  type AppareilImprimante,
  type Transport,
} from '../imprimante';

import { transportBluetoothLowEnergy } from './ble';
import {
  demanderPermissionsBluetooth,
  transportBluetoothClassic,
} from './classic';

export { transportBluetoothLowEnergy, TransportBluetoothLowEnergy } from './ble';
export { transportBluetoothClassic, TransportBluetoothClassic } from './classic';
export { demanderPermissionsBluetooth } from './classic';

/** Le canal par lequel une imprimante a ete trouvee, puis reste joignable. */
export type CanalImprimante = 'classic' | 'ble';

export interface ImprimanteTrouvee extends AppareilImprimante {
  canal: CanalImprimante;
}

const CANAUX: ReadonlyArray<{ canal: CanalImprimante; transport: Transport }> = [
  { canal: 'classic', transport: transportBluetoothClassic },
  { canal: 'ble', transport: transportBluetoothLowEnergy },
];

/** Le transport qui sait parler a une imprimante trouvee sur ce canal. */
export function transportDuCanal(canal: CanalImprimante): Transport {
  return canal === 'ble' ? transportBluetoothLowEnergy : transportBluetoothClassic;
}

/**
 * Valide un canal relu depuis la base ou les preferences.
 *
 * Le canal de l'imprimante habituelle est enregistre sous forme de chaine ;
 * cette garde evite d'injecter une valeur inconnue (ancienne version, fichier
 * recopie a la main) dans `transportDuCanal`.
 */
export function estCanalImprimante(valeur: string): valeur is CanalImprimante {
  return valeur === 'classic' || valeur === 'ble';
}

/** Les canaux effectivement utilisables ici et maintenant (radio et permissions). */
export async function canauxDisponibles(): Promise<CanalImprimante[]> {
  const etats = await Promise.all(
    CANAUX.map(async (entree) => ({
      canal: entree.canal,
      disponible: await entree.transport.estDisponible().catch(() => false),
    })),
  );
  return etats.filter((etat) => etat.disponible).map((etat) => etat.canal);
}

/**
 * Cherche les imprimantes sur tous les canaux disponibles, simultanement.
 *
 * Les deux recherches sont lancees ensemble et non l'une apres l'autre : en
 * serie, l'utilisateur attendrait deux fois `dureeMs` avant de voir sa liste.
 * L'echec d'un canal ne fait pas echouer l'autre — un telephone dont le BLE
 * refuse de scanner doit quand meme afficher l'imprimante SPP appairee.
 */
export async function rechercherImprimantes(
  dureeMs = 8000,
): Promise<ImprimanteTrouvee[]> {
  const etats = await Promise.all(
    CANAUX.map(async (entree) => ({
      ...entree,
      disponible: await entree.transport.estDisponible().catch(() => false),
    })),
  );

  const utilisables = etats.filter((etat) => etat.disponible);
  if (utilisables.length === 0) {
    throw new ImprimanteIndisponible(
      'Bluetooth indisponible : activez-le dans les reglages du telephone et ' +
        'autorisez l application a chercher les appareils a proximite.',
    );
  }

  const listes = await Promise.all(
    utilisables.map(async (etat): Promise<ImprimanteTrouvee[]> => {
      try {
        const appareils = await etat.transport.rechercher(dureeMs);
        return appareils.map((appareil) => ({ ...appareil, canal: etat.canal }));
      } catch {
        // Un canal muet ne doit pas priver l'utilisateur des resultats de
        // l'autre : on le laisse simplement ne rien rapporter.
        return [];
      }
    }),
  );

  return fusionner(listes);
}

/**
 * Connecte l'imprimante choisie et installe son canal dans le service
 * d'impression. C'est le seul point ou le type de l'imprimante est decide.
 */
export async function connecterImprimante(
  imprimante: ImprimanteTrouvee,
): Promise<void> {
  // La connexion precedente appartient peut-etre a l'autre canal : il faut la
  // fermer AVANT de remplacer le transport, sinon elle reste ouverte pour
  // toujours et la radio refuse la nouvelle.
  try {
    await serviceImpression.deconnecter();
  } catch {
    // Une imprimante deja eteinte : sans importance, on va en ouvrir une autre.
  }

  serviceImpression.definirTransport(transportDuCanal(imprimante.canal));
  await serviceImpression.connecter(imprimante.id);
}

/**
 * Fusionne les resultats des canaux en une liste sans doublon.
 *
 * Un appareil "DUAL" (Classic + BLE) repond aux deux recherches sous la meme
 * adresse MAC. On garde alors le canal Classic : il transporte de gros blocs,
 * la ou le BLE plafonne a une vingtaine d'octets par ecriture.
 */
function fusionner(listes: ImprimanteTrouvee[][]): ImprimanteTrouvee[] {
  const parAdresse = new Map<string, ImprimanteTrouvee>();

  for (const liste of listes) {
    for (const imprimante of liste) {
      const cle = imprimante.id.toUpperCase();
      const deja = parAdresse.get(cle);
      if (deja && deja.canal === 'classic') continue;
      parAdresse.set(cle, imprimante);
    }
  }

  return [...parAdresse.values()].sort((a, b) =>
    (a.nom ?? a.id).localeCompare(b.nom ?? b.id),
  );
}
