const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

// Execute the repository's real SQL against SQLite, replacing only Expo's bridge.
function fixture(t, { total = 1000, paid = 400, status = 'partielle' } = {}) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE vente (id INTEGER PRIMARY KEY, numero TEXT, total REAL NOT NULL,
      montant_paye REAL NOT NULL, statut TEXT NOT NULL);
    CREATE TABLE produit (id INTEGER PRIMARY KEY, quantite_base REAL NOT NULL,
      gestion_stock INTEGER NOT NULL DEFAULT 1, date_modification TEXT);
    CREATE TABLE variante_produit (id INTEGER PRIMARY KEY, produit_id INTEGER NOT NULL,
      stock_actuel REAL NOT NULL, actif INTEGER NOT NULL DEFAULT 1, date_modification TEXT);
    CREATE TABLE ligne_vente (id INTEGER PRIMARY KEY, vente_id INTEGER NOT NULL,
      produit_id INTEGER NOT NULL, variante_id INTEGER, quantite REAL,
      unite TEXT, quantite_base REAL);
    CREATE TABLE operation_vente_mobile (
      id_local TEXT PRIMARY KEY, vente_id INTEGER NOT NULL, nature TEXT NOT NULL,
      montant REAL NOT NULL DEFAULT 0, mode_paiement TEXT NOT NULL DEFAULT 'especes',
      motif TEXT, date_creation TEXT NOT NULL
    );
    CREATE TABLE sync_outbox (
      id INTEGER PRIMARY KEY, type_objet TEXT NOT NULL, id_local TEXT NOT NULL,
      operation TEXT NOT NULL, date_creation TEXT NOT NULL,
      UNIQUE (type_objet, id_local)
    );
    CREATE TABLE mouvement_stock (id INTEGER PRIMARY KEY, id_local TEXT UNIQUE,
      produit_id INTEGER, variante_id INTEGER, nature TEXT, source_operation TEXT,
      quantite REAL, unite TEXT, quantite_base REAL, stock_avant REAL, stock_apres REAL,
      reference TEXT, motif TEXT, date_mouvement TEXT);
  `);
  db.prepare('INSERT INTO vente VALUES (1, ?, ?, ?, ?)').run('V-TEST', total, paid, status);
  db.exec(`INSERT INTO produit (id, quantite_base) VALUES (1, 8);
    INSERT INTO variante_produit (id, produit_id, stock_actuel) VALUES (10, 1, 3), (11, 1, 5);
    INSERT INTO ligne_vente VALUES (1, 1, 1, 10, 2, 'Piece', 2);`);
  let nextId = 0;
  const base = {
    genererIdLocal: () => `operation-${++nextId}`,
    lirePremier: async (sql, ...params) => db.prepare(sql).get(...params) ?? null,
    lireTout: async (sql, ...params) => db.prepare(sql).all(...params),
    executer: async (sql, ...params) => db.prepare(sql).run(...params),
    maintenant: () => '2026-10-13T12:00:00.000Z',
    dansTransaction: async fn => {
      db.exec('BEGIN IMMEDIATE');
      try { const value = await fn(); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  const code = readFileSync(resolve(__dirname, '../src/db/repositories/vente.ts'), 'utf8');
  const compiled = ts.transpileModule(code, {
    fileName: 'vente.ts', reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const errors = (compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compiled.outputText)(module, module.exports, name => {
    if (name === './base') return base;
    throw new Error(`Unexpected runtime import: ${name}`);
  });
  return { db, ...module.exports, sale: () => ({ ...db.prepare('SELECT * FROM vente WHERE id=1').get() }) };
}

for (const [label, amount] of [['dépassement', 601], ['fraction', 0.5], ['infini', Infinity], ['NaN', NaN], ['négatif', -1], ['zéro', 0], ['entier non sûr', Number.MAX_SAFE_INTEGER + 1]]) {
  test(`le règlement refuse ${label} sans changer SQLite`, async t => {
    const f = fixture(t); const before = f.sale();
    await assert.rejects(() => f.encaisser(1, amount), /montant|reste|entier|positif|valide/i);
    assert.deepEqual(f.sale(), before);
  });
}
test('un règlement partiel conserve le bon solde et le statut', async t => {
  const f = fixture(t); await f.encaisser(1, 100);
  assert.equal(f.sale().montant_paye, 500); assert.equal(f.sale().statut, 'partielle');
});
test('le règlement exact solde la vente ; un second règlement est refusé', async t => {
  const f = fixture(t); await f.encaisser(1, 600);
  assert.equal(f.sale().montant_paye, 1000); assert.equal(f.sale().statut, 'payee');
  await assert.rejects(() => f.encaisser(1, 1));
  assert.equal(f.sale().montant_paye, 1000);
});
test('une vente annulée ne reçoit pas de règlement', async t => {
  const f = fixture(t, { status: 'annulee' });
  await assert.rejects(() => f.encaisser(1, 100), /annulee/i);
  assert.equal(f.sale().montant_paye, 400);
});
test('annuler une vente restaure sa variante exacte et son parent, une seule fois', async t => {
  const f = fixture(t); await f.annulerVente(1, 'Erreur de caisse');
  assert.equal(f.db.prepare('SELECT stock_actuel AS stock FROM variante_produit WHERE id=10').get().stock, 5);
  assert.equal(f.db.prepare('SELECT stock_actuel AS stock FROM variante_produit WHERE id=11').get().stock, 5);
  assert.equal(f.db.prepare('SELECT quantite_base AS stock FROM produit WHERE id=1').get().stock, 10);
  const m = f.db.prepare('SELECT * FROM mouvement_stock').get();
  assert.equal(m.variante_id, 10); assert.equal(m.stock_avant, 3); assert.equal(m.stock_apres, 5);
  assert.equal(f.sale().statut, 'annulee');
  await assert.rejects(() => f.annulerVente(1));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM mouvement_stock').get().n, 1);
});
test('annulation d’un produit sans variantes reste compatible', async t => {
  const f = fixture(t); f.db.exec('UPDATE ligne_vente SET variante_id=NULL');
  await f.annulerVente(1);
  assert.equal(f.db.prepare('SELECT quantite_base AS stock FROM produit WHERE id=1').get().stock, 10);
  const m = f.db.prepare('SELECT * FROM mouvement_stock').get();
  assert.equal(m.variante_id, null); assert.equal(m.stock_avant, 8); assert.equal(m.stock_apres, 10);
});
test('une variante d’un autre produit bloque toute l’annulation', async t => {
  const f = fixture(t); f.db.exec('UPDATE variante_produit SET produit_id=99 WHERE id=10');
  await assert.rejects(() => f.annulerVente(1), /variante/i);
  assert.equal(f.sale().statut, 'partielle');
  assert.equal(f.db.prepare('SELECT quantite_base AS stock FROM produit WHERE id=1').get().stock, 8);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM mouvement_stock').get().n, 0);
});
test('un produit absent bloque toute l’annulation au lieu de perdre son retour', async t => {
  const f = fixture(t); f.db.exec('DELETE FROM produit');
  await assert.rejects(() => f.annulerVente(1), /produit/i);
  assert.equal(f.sale().statut, 'partielle');
});


test('two credit payments are separate durable events and outbox rows', async t => {
  const f = fixture(t);
  await f.encaisser(1, 100);
  await f.encaisser(1, 200);
  const ops = f.db.prepare(
    "SELECT id_local, nature, montant FROM operation_vente_mobile ORDER BY rowid",
  ).all();
  assert.deepEqual(ops.map(o => o.montant), [100, 200]);
  assert.equal(ops[0].nature, 'REGLEMENT');
  assert.notEqual(ops[0].id_local, ops[1].id_local);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE type_objet='operation_vente'").get().n, 2);
  assert.equal(f.sale().montant_paye, 700);
});

test('cancellation queues exactly one durable event, with a single stock reversal', async t => {
  const f = fixture(t);
  await f.annulerVente(1, 'erreur de caisse');
  const operation = f.db.prepare('SELECT * FROM operation_vente_mobile').get();
  assert.equal(operation.nature, 'ANNULATION');
  assert.equal(operation.motif, 'erreur de caisse');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n, 1);
  await assert.rejects(() => f.annulerVente(1));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM operation_vente_mobile').get().n, 1);
});

test('outbox failure rolls back payment and cancellation atomically', async t => {
  const f = fixture(t);
  f.db.exec('DROP TABLE sync_outbox');
  await assert.rejects(() => f.encaisser(1, 100));
  assert.equal(f.sale().montant_paye, 400);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM operation_vente_mobile').get().n, 0);
  await assert.rejects(() => f.annulerVente(1));
  assert.equal(f.sale().statut, 'partielle');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM mouvement_stock').get().n, 0);
});
