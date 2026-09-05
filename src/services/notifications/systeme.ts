/**
 * Faire sonner le telephone, meme application fermee.
 *
 * POURQUOI DES NOTIFICATIONS LOCALES ET NON DU PUSH
 * --------------------------------------------------
 * Une rupture de stock se produit PENDANT une vente, sur ce telephone, souvent
 * sans reseau. C'est donc l'application elle-meme qui la constate, et
 * elle-meme qui doit prevenir. Le push par serveur suppose Internet et une
 * synchronisation prealable : il servira a prevenir le PATRON qui n'est pas
 * dans la boutique, pas le vendeur qui a le client devant lui.
 *
 * TOUT ICI EST FACULTATIF
 * ------------------------
 * Le commercant peut refuser les notifications, ou son telephone peut les
 * bloquer. Aucune fonction de ce fichier ne doit alors casser quoi que ce
 * soit : le journal interne reste la source de verite, et la cloche dans
 * l'application continue de compter. Le systeme n'est qu'un rappel.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Gravite } from './journal';

/**
 * Deux canaux Android, et c'est deliberé.
 *
 * Android laisse l'utilisateur couper un canal sans couper les autres. En
 * separant l'urgent du reste, un commercant agace par les rappels de stock bas
 * peut les eteindre SANS perdre les ruptures franches. Un canal unique aurait
 * fait perdre les deux d'un seul geste.
 */
const CANAL_URGENT = 'rupture';
const CANAL_INFO = 'stock';

let prepare = false;

/**
 * Prepare les canaux et demande l'autorisation.
 *
 * Ne demande RIEN si l'utilisateur a deja repondu : redemander a chaque
 * ouverture est le meilleur moyen de se faire refuser definitivement.
 */
export async function preparer(): Promise<boolean> {
  if (prepare) return true;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CANAL_URGENT, {
        name: 'Ruptures de stock',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        description: "Un produit vient d'etre epuise.",
      });
      await Notifications.setNotificationChannelAsync(CANAL_INFO, {
        name: 'Stock bas et rappels',
        importance: Notifications.AndroidImportance.DEFAULT,
        description: 'Produits sous leur seuil, echeance d abonnement.',
      });
    }

    const { status } = await Notifications.getPermissionsAsync();
    let accorde = status === 'granted';
    if (!accorde && status !== 'denied') {
      const demande = await Notifications.requestPermissionsAsync();
      accorde = demande.status === 'granted';
    }

    prepare = true;
    return accorde;
  } catch {
    // Un telephone qui refuse net ne doit pas empecher la caisse d'ouvrir.
    return false;
  }
}

export interface AvisSysteme {
  titre: string;
  corps: string;
  gravite: Gravite;
  /** Ou emmener le commercant quand il appuie sur la notification. */
  chemin?: string | null;
}

/**
 * Affiche l'avis tout de suite.
 *
 * Renvoie `false` si le telephone n'a rien affiche — l'appelant ne doit alors
 * PAS marquer la notification comme sonnee, pour qu'elle ressorte le jour ou
 * l'autorisation sera donnee.
 */
export async function sonner(avis: AvisSysteme): Promise<boolean> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: avis.titre,
        body: avis.corps,
        data: avis.chemin ? { chemin: avis.chemin } : {},
        sound: avis.gravite === 'urgent',
      },
      // `null` = immediatement. On ne planifie jamais dans le futur : une
      // notification differee arriverait apres que le commercant a deja
      // reapprovisionne, et lui ferait perdre confiance dans les autres.
      trigger:
        Platform.OS === 'android'
          ? { channelId: avis.gravite === 'urgent' ? CANAL_URGENT : CANAL_INFO }
          : null,
    });
    return true;
  } catch {
    return false;
  }
}

/** Remet le compteur de la pastille du lanceur a la valeur donnee. */
export async function poserPastille(nombre: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, nombre));
  } catch {
    // Beaucoup de lanceurs Android ne gerent pas la pastille : sans
    // consequence, la cloche dans l'application reste la reference.
  }
}
