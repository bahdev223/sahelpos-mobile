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
let baseNative: SQLite.SQLiteDatabase | null = null;
let ouverture: Promise<SQLite.SQLiteDatabase> | null = null;
let reprise: Promise<void> | null = null;

/** Retourne la base, en l'ouvrant et en la migrant au premier appel. */
export async function obtenirBase(): Promise<SQLite.SQLiteDatabase> {
  if (base) return base;

  // Au lancement, le bootstrap, les ecrans et le moteur de synchronisation
  // peuvent tous demander SQLite dans la meme frame. Ouvrir plusieurs bases
  // natives avant que la premiere migration soit terminee provoque parfois un
  // `NativeDatabase.prepareAsync` nul sur Android. Tous les appelants doivent
  // attendre exactement la meme ouverture et la meme migration.
  if (ouverture) return ouverture;

  ouverture = ouvrirEtMigrer();
  try {
    base = await ouverture;
    return base;
  } finally {
    ouverture = null;
  }
}

async function ouvrirEtMigrer(): Promise<SQLite.SQLiteDatabase> {
  const db = await ouvrirNativeEtMigrer();
  baseNative = db;
  return facadeResiliente();
}

async function ouvrirNativeEtMigrer(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(NOM_BASE);

  // Sans cette ligne, SQLite ignore les ON DELETE CASCADE declares au schema.
  await db.execAsync('PRAGMA foreign_keys = ON;');
  // WAL : lectures et ecritures concurrentes, et moins de risque de corruption
  // si l'application est tuee par le systeme pendant une vente.
  await db.execAsync('PRAGMA journal_mode = WAL;');

  await migrer(db);
  return db;
}

/** Certaines versions Android peuvent perdre le handle natif apres une mise
 * en veille ou une pression memoire. Cette erreur du bridge ne signifie pas
 * que les donnees SQLite sont perdues : on rouvre le handle et on rejoue UNE
 * fois la requete. Les autres erreurs SQL restent visibles normalement. */
function erreurHandleNatif(erreur: unknown): boolean {
  const texte = erreur instanceof Error ? `${erreur.name} ${erreur.message}` : String(erreur);
  return /NativeDatabase|prepareAsync|NullPointerException/i.test(texte);
}

async function reparerHandleNatif(): Promise<void> {
  if (reprise) return reprise;
  reprise = (async () => {
    const precedente = baseNative;
    baseNative = null;
    try {
      await precedente?.closeAsync();
    } catch {
      // Le handle est justement invalide : il n'est plus utilisable ni
      // necessaire pour retrouver le fichier SQLite persistant.
    }
    baseNative = await ouvrirNativeEtMigrer();
  })();
  try {
    await reprise;
  } finally {
    reprise = null;
  }
}

function facadeResiliente(): SQLite.SQLiteDatabase {
  return new Proxy({} as SQLite.SQLiteDatabase, {
    get(_cible, propriete) {
      const native = baseNative as unknown as Record<PropertyKey, unknown> | null;
      const valeur = native?.[propriete];
      if (typeof valeur !== 'function') return valeur;

      return async (...argumentsMethode: unknown[]) => {
        try {
          return await Reflect.apply(valeur, baseNative, argumentsMethode);
        } catch (erreur) {
          if (!erreurHandleNatif(erreur)) throw erreur;
          await reparerHandleNatif();
          const remplacee = (baseNative as unknown as Record<PropertyKey, unknown>)[propriete];
          if (typeof remplacee !== 'function') throw erreur;
          return Reflect.apply(remplacee, baseNative, argumentsMethode);
        }
      };
    },
  });
}

async function migrer(db: SQLite.SQLiteDatabase): Promise<void> {
  const ligne = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const versionActuelle = ligne?.user_version ?? 0;

  if (versionActuelle >= SCHEMA_VERSION) {
    await reparerSchemaCritique(db);
    return;
  }

  for (let v = versionActuelle; v < SCHEMA_VERSION; v++) {
    const etapes = MIGRATIONS[v];
    if (!etapes) continue;
    await db.withTransactionAsync(async () => {
      for (const sql of etapes) {
        await executerEtapeMigration(db, sql);
      }
    });
  }

  // PRAGMA n'accepte pas de parametre lie : la valeur vient d'une constante
  // du code, jamais d'une saisie utilisateur.
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  await reparerSchemaCritique(db);
}

/**
 * Rend la migration des vendeurs rejouable sans jamais effacer la base.
 * SQLite ne propose pas ADD COLUMN IF NOT EXISTS sur toutes les versions
 * Android supportees, donc on inspecte la table avant chaque ALTER TABLE.
 */
async function reparerSchemaVendeurs(db: SQLite.SQLiteDatabase): Promise<void> {
  if (!(await tableExiste(db, 'utilisateur'))) return;
  const colonnes = new Set(
    (await db.getAllAsync<{ name: string }>('PRAGMA table_info(utilisateur)'))
      .map((colonne) => colonne.name),
  );

  await db.withTransactionAsync(async () => {
    if (!colonnes.has('id_local')) {
      await db.execAsync('ALTER TABLE utilisateur ADD COLUMN id_local TEXT');
      colonnes.add('id_local');
    }
    if (!colonnes.has('caisse_ouvre_a')) {
      await db.execAsync('ALTER TABLE utilisateur ADD COLUMN caisse_ouvre_a TEXT');
      colonnes.add('caisse_ouvre_a');
    }
    if (!colonnes.has('caisse_ferme_a')) {
      await db.execAsync('ALTER TABLE utilisateur ADD COLUMN caisse_ferme_a TEXT');
      colonnes.add('caisse_ferme_a');
    }
    if (!colonnes.has('date_modification')) {
      await db.execAsync('ALTER TABLE utilisateur ADD COLUMN date_modification TEXT');
      colonnes.add('date_modification');
    }

    await db.execAsync(
      `UPDATE utilisateur
          SET id_local = lower(hex(randomblob(16)))
        WHERE id_local IS NULL OR id_local = ''`,
    );
    await db.execAsync(
      `UPDATE utilisateur
          SET date_modification = date_creation
        WHERE date_modification IS NULL OR date_modification = ''`,
    );
    await db.execAsync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_utilisateur_id_local ON utilisateur(id_local)',
    );
  });
}

async function tableExiste(db: SQLite.SQLiteDatabase, nom: string): Promise<boolean> {
  const ligne = await db.getFirstAsync<{ n: string }>(
    "SELECT name AS n FROM sqlite_master WHERE type = 'table' AND name = ?",
    nom,
  );
  return Boolean(ligne?.n);
}

function etapeDejaAppliquee(erreur: unknown): boolean {
  const texte = erreur instanceof Error ? erreur.message : String(erreur);
  return /duplicate column name|already exists/i.test(texte);
}

async function executerEtapeMigration(
  db: SQLite.SQLiteDatabase,
  sql: string,
): Promise<void> {
  try {
    await db.execAsync(sql);
  } catch (erreur) {
    if (etapeDejaAppliquee(erreur)) return;
    throw erreur;
  }
}

/**
 * Filet de securite pour les bases qui ont traverse une build defectueuse.
 * On repare seulement les tables deja creees, sans jamais vider les donnees.
 */
async function reparerSchemaCritique(db: SQLite.SQLiteDatabase): Promise<void> {
  await reparerSchemaVendeurs(db);

  await db.withTransactionAsync(async () => {
    if (await tableExiste(db, 'mouvement_stock')) {
      const colonnes = await colonnesTable(db, 'mouvement_stock');
      if (!colonnes.has('id_local')) {
        await db.execAsync('ALTER TABLE mouvement_stock ADD COLUMN id_local TEXT');
      }
      await db.execAsync(
        `UPDATE mouvement_stock SET id_local = lower(hex(randomblob(16)))
          WHERE id_local IS NULL OR id_local = ''`,
      );
      await db.execAsync(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_mouvement_id_local ON mouvement_stock(id_local)',
      );
    }

    if (await tableExiste(db, 'paiement_achat')) {
      const colonnes = await colonnesTable(db, 'paiement_achat');
      if (!colonnes.has('id_local')) {
        await db.execAsync('ALTER TABLE paiement_achat ADD COLUMN id_local TEXT');
      }
      await db.execAsync(
        `UPDATE paiement_achat SET id_local = lower(hex(randomblob(16)))
          WHERE id_local IS NULL OR id_local = ''`,
      );
      await db.execAsync(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_paiement_achat_id_local ON paiement_achat(id_local)',
      );
    }

    if (await tableExiste(db, 'client')) {
      const colonnes = await colonnesTable(db, 'client');
      if (!colonnes.has('date_modification')) {
        await db.execAsync('ALTER TABLE client ADD COLUMN date_modification TEXT');
      }
    }

    if (await tableExiste(db, 'fournisseur')) {
      const colonnes = await colonnesTable(db, 'fournisseur');
      if (!colonnes.has('date_modification')) {
        await db.execAsync('ALTER TABLE fournisseur ADD COLUMN date_modification TEXT');
      }
    }

    if (await tableExiste(db, 'achat')) {
      const colonnes = await colonnesTable(db, 'achat');
      if (!colonnes.has('date_modification')) {
        await db.execAsync('ALTER TABLE achat ADD COLUMN date_modification TEXT');
      }
      await db.execAsync(
        `UPDATE achat
            SET date_modification = COALESCE(date_reception, date_achat)
          WHERE date_modification IS NULL OR date_modification = ''`,
      );
    }

    if (await tableExiste(db, 'sync_outbox')) {
      const colonnes = await colonnesTable(db, 'sync_outbox');
      if (!colonnes.has('statut')) {
        await db.execAsync("ALTER TABLE sync_outbox ADD COLUMN statut TEXT NOT NULL DEFAULT 'PENDING'");
      }
      await db.execAsync(
        `UPDATE sync_outbox
            SET statut = CASE WHEN derniere_erreur IS NULL THEN 'PENDING' ELSE 'FAILED' END
          WHERE statut IS NULL OR statut = ''`,
      );
      await db.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_sync_outbox_statut_date ON sync_outbox(statut, date_creation)',
      );
    }
  });
}

async function colonnesTable(
  db: SQLite.SQLiteDatabase,
  table: string,
): Promise<Set<string>> {
  return new Set(
    (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`))
      .map((colonne) => colonne.name),
  );
}

/** A n'utiliser que dans les tests : referme et oublie la base ouverte. */
export async function fermerBase(): Promise<void> {
  if (ouverture) await ouverture;
  if (!baseNative) return;
  await baseNative.closeAsync();
  baseNative = null;
  base = null;
}
