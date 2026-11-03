const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE produit (id INTEGER PRIMARY KEY, quantite_base REAL NOT NULL,
      unite_base TEXT NOT NULL, gestion_stock INTEGER NOT NULL, date_modification TEXT);
    CREATE TABLE variante_produit (id INTEGER PRIMARY KEY, produit_id INTEGER,
      actif INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE inventaire (id INTEGER PRIMARY KEY, numero TEXT NOT NULL,
      statut TEXT NOT NULL, date_validation TEXT, nb_ecarts INTEGER DEFAULT 0,
      valeur_ecarts REAL DEFAULT 0);
    CREATE TABLE ligne_inventaire (id INTEGER PRIMARY KEY, inventaire_id INTEGER NOT NULL,
      produit_id INTEGER NOT NULL, stock_theorique REAL NOT NULL,
      stock_physique REAL, prix_achat REAL, ecart REAL, valeur_ecart REAL);
    CREATE TABLE mouvement_stock (id INTEGER PRIMARY KEY, id_local TEXT UNIQUE,
      produit_id INTEGER, nature TEXT, source_operation TEXT,
      quantite REAL, unite TEXT, quantite_base REAL,
      stock_avant REAL, stock_apres REAL, prix_unitaire REAL,
      reference TEXT, motif TEXT, utilisateur TEXT, date_mouvement TEXT);
    CREATE TABLE sync_outbox (id INTEGER PRIMARY KEY, type_objet TEXT, id_local TEXT,
      operation TEXT, date_creation TEXT, UNIQUE(type_objet, id_local));
    INSERT INTO produit VALUES (1, 10, 'Piece', 1, NULL);
    INSERT INTO inventaire (id, numero, statut) VALUES (1, 'INV-TEST', 'BROUILLON');
    INSERT INTO ligne_inventaire (id, inventaire_id, produit_id, stock_theorique, prix_achat)
      VALUES (1, 1, 1, 10, 100);
  `);
  let next = 0;
  const base = {
    lirePremier: async (sql, ...args) => db.prepare(sql).get(...args) ?? null,
    lireTout: async (sql, ...args) => db.prepare(sql).all(...args),
    executer: async (sql, ...args) => db.prepare(sql).run(...args),
    genererIdLocal: () => `m-${++next}`,
    maintenant: () => '2026-11-03T12:00:00.000Z',
    dansTransaction: async fn => {
      db.exec('BEGIN IMMEDIATE');
      try { const result = await fn(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  const file = resolve(__dirname, '../src/services/inventaire.ts');
  const transpiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: 'inventaire.ts',
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const module = { exports: {} };
  const imports = {
    '../db/repositories/base': base,
    './abonnement': { exigerEcriture: async () => {} },
    './notifications': { verifierStock: async () => {} },
    './synchronisation': {
      marquerChangement: async (type, id) => db.prepare(
        "INSERT INTO sync_outbox (type_objet, id_local, operation, date_creation) VALUES (?, ?, 'upsert', ?)",
      ).run(type, id, '2026-11-03T12:00:00.000Z'),
    },
  };
  new Function('module', 'exports', 'require', transpiled.outputText)(
    module, module.exports, name => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
  );
  return { db, ...module.exports };
}

test('applies the frozen difference on current stock without erasing later sales', async t => {
  const f = fixture(t);
  f.db.exec('UPDATE produit SET quantite_base=7 WHERE id=1'); // sale during count
  const result = await f.validerInventaire(1, 'Gerant', [
    { ligneId: 1, produitId: 1, stockPhysique: 9 },
  ]);
  assert.equal(f.db.prepare('SELECT quantite_base AS stock FROM produit').get().stock, 6);
  const movement = f.db.prepare('SELECT * FROM mouvement_stock').get();
  assert.equal(movement.quantite_base, -1);
  assert.equal(movement.quantite, 9);
  assert.equal(movement.stock_avant, 7);
  assert.equal(movement.stock_apres, 6);
  assert.equal(movement.source_operation, 'INVENTAIRE');
  assert.equal(f.db.prepare('SELECT id_local FROM sync_outbox').get().id_local, movement.id_local);
  assert.equal(result.nbComptes, 1);
  assert.equal(result.nbEcarts, 1);
  await assert.rejects(() => f.validerInventaire(1, 'Gerant'), /valide/i);
});

test('a matching count can be validated without generating a stock event', async t => {
  const f = fixture(t);
  const result = await f.validerInventaire(1, 'Gerant', [
    { ligneId: 1, produitId: 1, stockPhysique: 10 },
  ]);
  assert.equal(result.nbComptes, 1);
  assert.equal(result.nbEcarts, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n, 0);
  assert.equal(f.db.prepare('SELECT statut FROM inventaire').get().statut, 'VALIDE');
});

test('an unknown count line cannot alter the inventory', async t => {
  const f = fixture(t);
  await assert.rejects(() => f.validerInventaire(1, 'Gerant', [
    { ligneId: 1, produitId: 99, stockPhysique: 0 },
  ]), /correspond/i);
  assert.equal(f.db.prepare('SELECT statut FROM inventaire').get().statut, 'BROUILLON');
});

test('a model with variants refuses a product-level adjustment', async t => {
  const f = fixture(t);
  f.db.exec('INSERT INTO variante_produit (id, produit_id, actif) VALUES (1, 1, 1)');
  await assert.rejects(() => f.validerInventaire(1, 'Gerant', [
    { ligneId: 1, produitId: 1, stockPhysique: 9 },
  ]), /variantes|tailles|couleurs/i);
  assert.equal(f.db.prepare('SELECT quantite_base FROM produit').get().quantite_base, 10);
});

test('failed outbox insertion rolls back the stock, journal and validation', async t => {
  const f = fixture(t);
  f.db.exec('DROP TABLE sync_outbox');
  await assert.rejects(() => f.validerInventaire(1, 'Gerant', [
    { ligneId: 1, produitId: 1, stockPhysique: 9 },
  ]));
  assert.equal(f.db.prepare('SELECT quantite_base FROM produit').get().quantite_base, 10);
  assert.equal(f.db.prepare('SELECT statut FROM inventaire').get().statut, 'BROUILLON');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM mouvement_stock').get().n, 0);
});
