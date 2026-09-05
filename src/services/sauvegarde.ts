/**
 * Sauvegarde et restauration de la base.
 *
 * Ce n'est pas un confort mais une securite. `expo-sqlite` ecrit dans le
 * stockage prive de l'application : les donnees survivent aux mises a jour,
 * mais disparaissent avec la desinstallation, et un telephone perdu ou casse
 * emporte la caisse avec lui. Un commercant qui n'exporte jamais perd tout
 * son historique le jour ou son telephone tombe.
 */
// API historique de expo-file-system : le SDK 57 propose une nouvelle API
// (Paths / File / Directory), mais l'ancienne reste livree et expose exactement
// ce dont on a besoin ici — copier, supprimer, mesurer un fichier. On evite
// ainsi une reecriture sans gain fonctionnel sur du code qui manipule la base.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { fermerBase, obtenirBase } from '../db/database';
import { lirePremier } from '../db/repositories/base';

/** Emplacement reel du fichier SQLite gere par expo-sqlite. */
function cheminBase(): string {
  return `${FileSystem.documentDirectory}SQLite/sahelpos.db`;
}

function horodatageFichier(): string {
  const d = new Date();
  const deux = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${deux(d.getMonth() + 1)}${deux(d.getDate())}` +
    `-${deux(d.getHours())}${deux(d.getMinutes())}`
  );
}

export interface ResumeSauvegarde {
  chemin: string;
  nomFichier: string;
  tailleOctets: number;
  nbProduits: number;
  nbVentes: number;
}

/**
 * Copie la base dans un fichier daté, pret a etre partage.
 *
 * On force d'abord l'ecriture du journal WAL dans le fichier principal : sans
 * cela, les dernieres ventes vivent encore dans le fichier -wal et la copie
 * serait incomplete, ce qui est exactement ce qu'on ne veut pas d'une
 * sauvegarde.
 */
export async function exporterBase(): Promise<ResumeSauvegarde> {
  const db = await obtenirBase();
  await db.execAsync('PRAGMA wal_checkpoint(FULL);');

  const produits = await lirePremier<{ n: number }>('SELECT COUNT(*) AS n FROM produit');
  const ventes = await lirePremier<{ n: number }>('SELECT COUNT(*) AS n FROM vente');

  const nomFichier = `sahelpos-${horodatageFichier()}.db`;
  const destination = `${FileSystem.cacheDirectory}${nomFichier}`;

  await FileSystem.copyAsync({ from: cheminBase(), to: destination });
  const info = await FileSystem.getInfoAsync(destination);

  return {
    chemin: destination,
    nomFichier,
    tailleOctets: info.exists ? (info.size ?? 0) : 0,
    nbProduits: produits?.n ?? 0,
    nbVentes: ventes?.n ?? 0,
  };
}

/**
 * Propose au commercant d'envoyer la sauvegarde hors du telephone.
 *
 * Une copie qui reste sur l'appareil ne protege de rien : elle disparait avec
 * lui. Le partage (WhatsApp, Drive, carte SD) est donc l'etape qui compte.
 */
export async function partagerSauvegarde(chemin: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(chemin, {
    mimeType: 'application/octet-stream',
    dialogTitle: 'Envoyer la sauvegarde hors du telephone',
  });
  return true;
}

export class RestaurationImpossible extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestaurationImpossible';
  }
}

/**
 * Remplace la base courante par un fichier de sauvegarde.
 *
 * ATTENTION : toutes les donnees actuelles sont perdues. L'appelant DOIT avoir
 * fait confirmer explicitement. On prend malgre tout une copie de securite de
 * la base remplacee : une restauration lancee par erreur ne doit pas etre
 * definitive.
 */
export async function restaurerBase(cheminSauvegarde: string): Promise<void> {
  const source = await FileSystem.getInfoAsync(cheminSauvegarde);
  if (!source.exists) {
    throw new RestaurationImpossible('Fichier de sauvegarde introuvable.');
  }

  const base = cheminBase();
  const secours = `${FileSystem.cacheDirectory}avant-restauration-${horodatageFichier()}.db`;

  const actuelle = await FileSystem.getInfoAsync(base);
  if (actuelle.exists) {
    await FileSystem.copyAsync({ from: base, to: secours });
  }

  // La base doit etre fermee avant d'ecraser son fichier, sinon SQLite garde
  // en memoire l'ancien contenu et la restauration semble sans effet.
  await fermerBase();

  // Les fichiers -wal et -shm decrivent l'ANCIENNE base : les laisser en place
  // corromprait celle qu'on vient de restaurer.
  for (const suffixe of ['-wal', '-shm']) {
    const annexe = base + suffixe;
    if ((await FileSystem.getInfoAsync(annexe)).exists) {
      await FileSystem.deleteAsync(annexe, { idempotent: true });
    }
  }

  await FileSystem.copyAsync({ from: cheminSauvegarde, to: base });

  // Rouvre et migre si la sauvegarde vient d'une version plus ancienne.
  await obtenirBase();
}
