const test = require('node:test');
const assert = require('node:assert/strict');
const { load, runtime } = require('./helpers/sqlite-runtime.cjs');

async function checkout(t) {
  const rt = await runtime(t);
  const native = {
    withTransactionAsync: rt.base.dansTransaction,
    getFirstAsync: rt.base.lirePremier,
    runAsync: rt.base.executer,
  };
  const service = load('src/services/vente.ts', {
    '../db/database': { obtenirBase: async () => native },
    '../db/repositories/base': rt.base,
    '../db/repositories/variante': { libelleVariante: v => v.sku },
    './abonnement': { exigerEcriture: async () => {} },
    './auth': { verifierAccesCaisse: async () => {} },
    './notifications': { verifierStock: async () => {} },
    './synchronisation': rt.sync,
  });
  const demande = {
    cleIdempotence: 'checkout-once', montantPaye: 100, modePaiement: 'especes', utilisateurId: 1,
    articles: [{ produit: { id: 1, nom: 'Article recette', prixAchat: 50, gestionStock: true },
      unite: 'Piece', facteur: 1, quantite: 1, prixUnitaire: 100 }],
  };
  return { ...rt, service, demande, native };
}

test('an uncertain committed checkout is reconciled to its receipt without another stock deduction', async t => {
  const { db, native, service, demande } = await checkout(t);
  const transaction = native.withTransactionAsync;
  let lost = true;
  native.withTransactionAsync = async fn => {
    const value = await transaction(fn);
    if (lost) { lost = false; throw new Error('NativeDatabase commit response lost'); }
    return value;
  };
  const receipt = await service.enregistrerVente(demande);
  assert.equal(receipt.total, 100);
  assert.equal(db.prepare('SELECT count(*) n FROM vente WHERE id_local=?').get(demande.cleIdempotence).n, 1);
  assert.equal(db.prepare('SELECT quantite_base FROM produit').get().quantite_base, 7);
  assert.equal(db.prepare('SELECT count(*) n FROM sync_outbox').get().n, 1);
});

test('retrying the same checkout returns its receipt without another sale or stock change', async t => {
  const { db, service, demande } = await checkout(t);
  const first = await service.enregistrerVente(demande);
  const second = await service.enregistrerVente(demande);
  assert.equal(first.venteId, second.venteId);
  assert.equal(db.prepare('SELECT quantite_base FROM produit WHERE id=1').get().quantite_base,7);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n,1);
});

test('a checkout identifier cannot be reused with different payment data', async t => {
  const { db, service, demande } = await checkout(t);
  await service.enregistrerVente(demande);
  await assert.rejects(service.enregistrerVente({ ...demande, modePaiement: 'mobile_money' }), /différent/i);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vente').get().n,2);
});

test('variant sale journal uses current stock and a signed delta for every line', async t => {
  const { db, service, demande } = await checkout(t);
  db.exec("INSERT INTO variante_produit (id,id_local,produit_id,sku,stock_actuel) VALUES (1,'v-test',1,'S-BLEU',5)");
  demande.articles[0].variante = { id: 1, sku: 'S-BLEU', stockActuel: 8, prixAchat: 50 };
  demande.articles.push({ ...demande.articles[0] });
  demande.montantPaye = 200;
  await service.enregistrerVente(demande);
  const movements = db.prepare('SELECT quantite_base, stock_avant, stock_apres FROM mouvement_stock ORDER BY id').all();
  assert.deepEqual(movements.map(m => [m.quantite_base,m.stock_avant,m.stock_apres]), [[-1,5,4],[-1,4,3]]);
});
