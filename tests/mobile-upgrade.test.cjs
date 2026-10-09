const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function charger(relative, imports = {}) {
  const filename = resolve(__dirname, '..', relative);
  const loaded = new Module(filename, module);
  loaded.paths = Module._nodeModulePaths(resolve(__dirname, '..'));
  loaded.require = (name) => name in imports ? imports[name] : require(name);
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}

const schema = charger('src/db/schema.ts');

function baseHistorique() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const migration of schema.MIGRATIONS.slice(0, 9)) {
    for (const sql of migration) {
      try { db.exec(sql); }
      catch (error) {
        if (!/duplicate column name/.test(error.message)) throw error;
      }
    }
  }
  db.exec(`
    PRAGMA user_version = 9;
    -- The v9 startup repair supplied these columns outside MIGRATIONS.
    ALTER TABLE utilisateur ADD COLUMN id_local TEXT;
    ALTER TABLE utilisateur ADD COLUMN caisse_ouvre_a TEXT;
    ALTER TABLE utilisateur ADD COLUMN caisse_ferme_a TEXT;
    ALTER TABLE utilisateur ADD COLUMN date_modification TEXT;
    INSERT INTO utilisateur (id, id_local, login, nom, code_pin, role, date_creation, date_modification)
      VALUES (1, 'member-upgrade', 'upgrade-test', 'Recette', 'existing-pin-hash', 'admin', '2026-10-09', '2026-10-09');
    INSERT INTO produit (id, id_local, nom, quantite_base, chemin_image, date_creation)
      VALUES (1, 'product-upgrade', 'Produit recette', 8, 'file:///durable/photo.png', '2026-10-09');
    INSERT INTO vente (id, id_local, numero, utilisateur_id, date_vente, total, montant_paye)
      VALUES (1, 'sale-upgrade', 'TEST-UPGRADE-1', 1, '2026-10-09', 1000, 1000);
    INSERT INTO ligne_vente (vente_id, produit_id, libelle, unite, quantite, quantite_base, prix_unitaire, total)
      VALUES (1, 1, 'Produit recette', 'Unite', 2, 2, 500, 1000);
    INSERT INTO mouvement_stock (id_local, produit_id, nature, source_operation, quantite,
      quantite_base, stock_avant, stock_apres, date_mouvement)
      VALUES ('movement-upgrade', 1, 'SORTIE', 'VENTE', 2, -2, 10, 8, '2026-10-09');
    INSERT INTO sync_outbox (type_objet, id_local, date_creation, statut, tentatives)
      VALUES ('vente', 'sale-upgrade', '2026-10-09', 'PENDING', 2),
             ('mouvement', 'movement-upgrade', '2026-10-09', 'FAILED', 1);
    INSERT INTO parametre (cle, valeur) VALUES
      ('abonnement.licence', 'existing-signed-licence'), ('sync.boutique', 'shop-upgrade');
  `);
  return db;
}

function migrateur(db, failOnce = () => false) {
  let failed = false;
  const native = {
    execAsync: async (sql) => {
      if (!failed && failOnce(sql)) {
        failed = true;
        throw new Error('Simulated migration interruption');
      }
      db.exec(sql);
    },
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args),
    withTransactionAsync: async (operation) => {
      db.exec('BEGIN');
      try { await operation(); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    closeAsync: async () => {},
  };
  return charger('src/db/database.ts', {
    'expo-sqlite': { openDatabaseAsync: async () => native },
    './schema': schema,
  });
}

function donnees(db) {
  return Object.fromEntries(['utilisateur', 'vente', 'ligne_vente', 'mouvement_stock', 'sync_outbox', 'parametre', 'produit']
    .map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
      .map((row) => Object.fromEntries(Object.entries(row)
        .filter(([key]) => !['variante_id', 'ligne_serveur_id', 'marque', 'reference_fabricant', 'prix_gros'].includes(key))))]));
}

test('upgrade v9 preserves PIN, licence, unsynced sales, stock and durable photo paths', async () => {
  const db = baseHistorique();
  try {
    const before = donnees(db);
    await migrateur(db).obtenirBase();
    assert.deepEqual(donnees(db), before);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, schema.SCHEMA_VERSION);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    db.exec(`INSERT INTO variante_produit (id_local, produit_id, sku) VALUES ('variant-upgrade', 1, 'RECETTE-M');
      UPDATE ligne_vente SET variante_id = 1 WHERE vente_id = 1;`);
    assert.equal(db.prepare('SELECT variante_id FROM ligne_vente').get().variante_id, 1);
  } finally { db.close(); }
});

test('interrupted upgrade resumes without duplicating or losing pending operations', async () => {
  const db = baseHistorique();
  try {
    const before = donnees(db);
    const migration = migrateur(db, (sql) => sql.includes('CREATE TABLE IF NOT EXISTS commande_client'));
    await assert.rejects(migration.obtenirBase(), /Simulated migration interruption/);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 9);
    assert.deepEqual(donnees(db), before);
    await migration.obtenirBase();
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, schema.SCHEMA_VERSION);
    assert.deepEqual(donnees(db), before);
    await migrateur(db).obtenirBase();
    assert.deepEqual(donnees(db), before);
  } finally { db.close(); }
});

test('replayed upgrade tolerates existing columns with an old version marker', async () => {
  const db = baseHistorique();
  try {
    await migrateur(db).obtenirBase();
    const before = donnees(db);
    db.exec('PRAGMA user_version = 9');
    await migrateur(db).obtenirBase();
    assert.deepEqual(donnees(db), before);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});

test('fresh installation applies the same migrations without duplicate-column failure', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await migrateur(db).obtenirBase();
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, schema.SCHEMA_VERSION);
    assert.equal(db.prepare('SELECT count(*) AS n FROM sync_outbox').get().n, 0);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { db.close(); }
});
