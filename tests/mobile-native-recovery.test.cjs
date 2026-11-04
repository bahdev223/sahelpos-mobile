const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/sqlite-runtime.cjs');

async function fixture(overrides = {}) {
  let openings = 0;
  const native = {
    execAsync: async () => {}, closeAsync: async () => {},
    getAllAsync: async () => [],
    getFirstAsync: async sql => sql === 'PRAGMA user_version' ? { user_version: 0 } : null,
    withTransactionAsync: async fn => fn(),
    runAsync: async () => {},
    ...overrides,
  };
  const database = load('src/db/database.ts', {
    'expo-sqlite': { openDatabaseAsync: async () => { openings++; return native; } },
    './schema': { SCHEMA_VERSION: 0, MIGRATIONS: [] },
  });
  const db = await database.obtenirBase();
  return { db, openings: () => openings, native };
}

test('an uncertain native write is never automatically executed twice', async () => {
  let balance = 0;
  const f = await fixture({ runAsync: async () => {
    balance += 100;
    if (balance === 100) throw new Error('NativeDatabase bridge disconnected after execution');
  } });
  await assert.rejects(() => f.db.runAsync('UPDATE balance SET total=total+100'), /NativeDatabase/);
  assert.equal(balance, 100);
});

test('a transaction whose commit acknowledgement was lost never reruns its callback', async () => {
  const f = await fixture();
  let calls = 0;
  const operation = async () => { calls++; };
  f.native.withTransactionAsync = async fn => {
    await fn();
    if (fn === operation && calls === 1) throw new Error('NativeDatabase transaction acknowledgement lost');
  };
  await assert.rejects(() => f.db.withTransactionAsync(operation), /NativeDatabase/);
  assert.equal(calls, 1);
});

test('a failed write inside a transaction rolls back before reconnecting', async () => {
  const f = await fixture();
  let calls = 0;
  let rolledBack = false;
  f.native.runAsync = async () => {
    calls++;
    if (calls === 1) throw new Error('NativeDatabase.prepareAsync rejected');
  };
  f.native.withTransactionAsync = async fn => {
    try { await fn(); }
    catch (error) {
      assert.equal(f.openings(), 1, 'must not close the active transaction handle');
      rolledBack = true;
      throw error;
    }
  };
  await assert.rejects(() => f.db.withTransactionAsync(() => f.db.runAsync('INSERT INTO vente')), /NativeDatabase/);
  assert.equal(rolledBack, true);
  assert.equal(calls, 1);
});

test('a failed read can reconnect once without duplicating writes', async () => {
  const f = await fixture();
  let reads = 0;
  f.native.getFirstAsync = async sql => {
    if (sql === 'SELECT total FROM vente') {
      if (++reads === 1) throw new Error('NativeDatabase invalid handle');
      return { total: 100 };
    }
    return sql === 'PRAGMA user_version' ? { user_version: 0 } : null;
  };
  assert.deepEqual(await f.db.getFirstAsync('SELECT total FROM vente'), { total: 100 });
  assert.equal(reads, 2);
});

test('simultaneous local transactions never overlap or roll back each other', async () => {
  const f = await fixture();
  let active = 0;
  let highest = 0;
  f.native.withTransactionAsync = async fn => {
    highest = Math.max(highest, ++active);
    try { await fn(); } finally { active--; }
  };
  const results = await Promise.allSettled([
    f.db.withTransactionAsync(async () => {
      await new Promise(resolve => setImmediate(resolve));
      throw new Error('first transaction rolled back');
    }),
    f.db.withTransactionAsync(async () => {
      await new Promise(resolve => setImmediate(resolve));
    }),
  ]);
  assert.equal(highest, 1);
  assert.deepEqual(results.map(r => r.status), ['rejected', 'fulfilled']);
});
