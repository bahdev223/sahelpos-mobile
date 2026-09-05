/**
 * Ouverture et migration de la base locale.
 *
 * `expo-sqlite` ecrit dans le stockage prive de l'application : les donnees
 * survivent aux mises a jour de l'app, et disparaissent avec sa desinstallation.
 * C'est pourquoi la sauvegarde (export) n'est pas une option confortable mais
 * une necessite : voir services/sauvegarde.
 */
import * as SQLite from 'expo-sqlite';

import { MIGRATIONS, SCHEMA_VERSION } from './schema';

const NOM_BASE = 'sahelpos.db';

let base: SQLite.SQLiteDatabase | null = null;

/** Retourne la base, en l'ouvrant et en la migrant au premier appel. */
export async function obtenirBase(): Promise<SQLite.SQLiteDatabase> {
  if (base) return base;

  const db = await SQLite.openDatabaseAsync(NOM_BASE);

  // Sans cette ligne, SQLite ignore les ON DELETE CASCADE declares au schema.
  await db.execAsync('PRAGMA foreign_keys = ON;');
  // WAL : lectures et ecritures concurrentes, et moins de risque de corruption
  // si l'application est tuee par le systeme pendant une vente.
  await db.execAsync('PRAGMA journal_mode = WAL;');

  await migrer(db);
  base = db;
  return db;
}

async function migrer(db: SQLite.SQLiteDatabase): Promise<void> {
  const ligne = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const versionActuelle = ligne?.user_version ?? 0;

  if (versionActuelle >= SCHEMA_VERSION) return;

  for (let v = versionActuelle; v < SCHEMA_VERSION; v++) {
    const etapes = MIGRATIONS[v];
    if (!etapes) continue;
    await db.withTransactionAsync(async () => {
      for (const sql of etapes) {
        await db.execAsync(sql);
      }
    });
  }

  // PRAGMA n'accepte pas de parametre lie : la valeur vient d'une constante
  // du code, jamais d'une saisie utilisateur.
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

/** A n'utiliser que dans les tests : referme et oublie la base ouverte. */
export async function fermerBase(): Promise<void> {
  if (!base) return;
  await base.closeAsync();
  base = null;
}
