import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import {
  AccesLivreurRefuse, accorderGps, autorisationGpsValide, enregistrerPositions, lireAutorisationGps, revoquerGps, verifierReglageGps,
  type PositionLivreur, type SessionLivreur,
} from './livraisons';

const TACHE = 'sahelpos-livraison-gps';
let revisionGps = 0;

export async function reconcilierGps(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const grant = await lireAutorisationGps();
  if (grant && await autorisationGpsValide(grant) && (await Location.getBackgroundPermissionsAsync()).granted) return;
  await arreterGps(grant?.cle);
}

export async function arreterGps(cle?: string): Promise<void> {
  revisionGps++;
  const actuelle = cle ? await lireAutorisationGps() : null;
  if (actuelle && actuelle.cle !== cle) return;
  try {
    await revoquerGps(cle);
  } finally {
    if (Platform.OS === 'android' && await Location.hasStartedLocationUpdatesAsync(TACHE)) {
      await Location.stopLocationUpdatesAsync(TACHE);
    }
  }
}

export async function gpsPourMission(id: number): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  await reconcilierGps();
  return (await lireAutorisationGps())?.mission === id && await Location.hasStartedLocationUpdatesAsync(TACHE);
}

export async function activerGps(session: SessionLivreur, id: number): Promise<void> {
  if (Platform.OS !== 'android' || !await TaskManager.isAvailableAsync()) {
    throw new Error('Le suivi nécessite une version native Android compatible.');
  }
  const tentative = ++revisionGps;
  await verifierReglageGps(session);
  const avant = await lireAutorisationGps();
  if (avant && avant.mission !== id) throw new Error('Arrêtez d’abord le suivi de l’autre mission.');
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Activez la localisation du téléphone.');
  if (!(await Location.requestForegroundPermissionsAsync()).granted) {
    throw new Error('Autorisez la localisation pendant l’utilisation pour partager votre position.');
  }
  if (!(await Location.requestBackgroundPermissionsAsync()).granted) {
    throw new Error('La localisation en arrière-plan est désactivée. La mission reste disponible.');
  }
  if (tentative !== revisionGps) return;
  const grant = await accorderGps(session, id);
  if (tentative !== revisionGps) {
    await revoquerGps(grant.cle);
    return;
  }
  try {
    await Location.startLocationUpdatesAsync(TACHE, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30_000,
      distanceInterval: 30,
      foregroundService: {
        notificationTitle: 'SahelPOS · Livraison en cours',
        notificationBody: 'Votre position est partagée pour cette mission.',
        notificationColor: '#0E7490',
        killServiceOnDestroy: true,
      },
    });
    if (tentative !== revisionGps) {
      await arreterGps(grant.cle);
      if (await Location.hasStartedLocationUpdatesAsync(TACHE) && !await lireAutorisationGps()) {
        await Location.stopLocationUpdatesAsync(TACHE);
      }
    }
  } catch (erreur) {
    await revoquerGps(grant.cle);
    throw erreur;
  }
}

function convertirPosition(fix: Location.LocationObject): PositionLivreur | null {
  const { latitude, longitude, accuracy } = fix.coords;
  if (fix.mocked || accuracy === null || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10_000
    || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || !Number.isFinite(fix.timestamp) || fix.timestamp <= 0) return null;
  return { latitude, longitude, precision: accuracy, horodatage: new Date(fix.timestamp).toISOString() };
}

if (Platform.OS === 'android') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TACHE, async ({ data, error }) => {
    if (error) return;
    const grant = await lireAutorisationGps();
    if (!grant || grant.expiration <= Date.now()) {
      await arreterGps(grant?.cle).catch(() => {});
      return;
    }
    try {
      const points = (data?.locations ?? []).map(convertirPosition).filter((point) => point !== null);
      if (points.length) await enregistrerPositions(grant, points);
      if (!await lireAutorisationGps()) await arreterGps(grant.cle);
    } catch (erreur) {
      if (erreur instanceof AccesLivreurRefuse) {
        await arreterGps(grant.cle).catch(() => {});
      }
    }
  });
}
