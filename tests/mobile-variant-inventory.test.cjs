const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime, load } = require('./helpers/sqlite-runtime.cjs');

test('blank and malformed stock counts never mean zero', () => {
  const { lireStockCompte } = load('src/domain/comptage.ts');
  for (const value of ['', ' ', '-1', 'NaN', 'Infinity', '1e3', '1,2,3', '1.0001']) {
    assert.equal(lireStockCompte(value), null, value);
  }
  assert.equal(lireStockCompte('0'), 0);
  assert.equal(lireStockCompte(' 1,250 '), 1.25);
});

async function inventory(t) {
  const rt = await runtime(t);
  rt.db.exec(`
    UPDATE produit SET quantite_base=8 WHERE id=1;
    INSERT INTO variante_produit (id,id_local,produit_id,sku,stock_actuel)
      VALUES (1,'variant-1',1,'S-BLEU',5),(2,'variant-2',1,'M-BLEU',3);
  `);
  const variants = load('src/db/repositories/variante.ts', {
    './base': rt.base, '../../services/synchronisation': rt.sync,
    '../../services/abonnement': { exigerEcriture: async () => {}, etatCourant: () => rt.abonnement },
    '../../domain/tailles': load('src/domain/tailles.ts'),
  });
  return { ...rt, variants };
}

test('variant inventory commits every counted line and its outbox atomically', async t => {
  const { db, variants } = await inventory(t);
  await variants.validerComptageVariantes([
    { varianteId: 1, stockTheorique: 5, stockPhysique: 4 },
    { varianteId: 2, stockTheorique: 3, stockPhysique: 5 },
  ]);
  assert.equal(db.prepare('SELECT quantite_base FROM produit WHERE id=1').get().quantite_base,9);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mouvement_stock').get().n,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n,2);
});

test('an invalid second variant rolls back the first stock and outbox', async t => {
  const { db, variants } = await inventory(t);
  await assert.rejects(variants.validerComptageVariantes([
    { varianteId: 1, stockTheorique: 5, stockPhysique: 4 },
    { varianteId: 999, stockTheorique: 3, stockPhysique: 5 },
  ]), /introuvable/i);
  assert.equal(db.prepare('SELECT stock_actuel FROM variante_produit WHERE id=1').get().stock_actuel,5);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n,0);
});

test('a sale after counting rejects stale inventory without overwriting stock', async t => {
  const { db, variants } = await inventory(t);
  db.exec('UPDATE variante_produit SET stock_actuel=4 WHERE id=1; UPDATE produit SET quantite_base=7 WHERE id=1');
  await assert.rejects(variants.validerComptageVariantes([
    { varianteId: 1, stockTheorique: 5, stockPhysique: 4 },
  ]), /stock.*chang/i);
  assert.equal(db.prepare('SELECT quantite_base FROM produit WHERE id=1').get().quantite_base,7);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mouvement_stock').get().n,0);
});

test('repeating a successful count cannot silently erase an intervening sale', async t => {
  const { db, variants } = await inventory(t);
  const count = [{ varianteId: 1, stockTheorique: 5, stockPhysique: 4 }];
  await variants.validerComptageVariantes(count);
  await assert.rejects(variants.validerComptageVariantes(count), /stock.*chang/i);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mouvement_stock').get().n,1);
});

test('duplicate variants and non-finite counts cannot create stock', async t => {
  const { db, variants } = await inventory(t);
  const line = { varianteId: 1, stockTheorique: 5, stockPhysique: 4 };
  await assert.rejects(variants.validerComptageVariantes([line, line]), /fois/i);
  await assert.rejects(variants.validerComptageVariantes([{ ...line, stockPhysique: NaN }]), /stock/i);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mouvement_stock').get().n,0);
});
