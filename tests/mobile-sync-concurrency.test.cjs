const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, runtime, network } = require('./helpers/sqlite-runtime.cjs');

test('a concurrent settlement cannot reduce the initial payment snapshot', async t => {
  const f = await runtime(t);
  f.db.exec("UPDATE utilisateur SET id_local='manager'; UPDATE vente SET montant_paye=500");
  await f.sync.marquerChangement('vente', 'sale-1');
  const read = f.base.lireTout;
  let settlement;
  f.base.lireTout = async (sql, ...args) => {
    const rows = await read(sql, ...args);
    if (!settlement && sql.includes('v.date_vente, v.total')) {
      settlement = f.sales.encaisser(1, 200);
      // Allow a competing payment to complete unless the snapshot owns
      // the transaction queue. A microtask alone would not reach COMMIT.
      await new Promise(setImmediate);
    }
    return rows;
  };
  let paid = 0;
  network(t, (_url, init) => {
    if (init.method !== 'POST') return { cursor: 'after' };
    const p = JSON.parse(init.body);
    paid += p.ventes.reduce((n, v) => n + v.montant_paye, 0)
      + p.operations_vente.reduce((n, v) => n + v.montant, 0);
    return { appliques: [
      ...p.ventes.map(v => ({ type: 'vente', id_local: v.id_local })),
      ...p.operations_vente.map(v => ({ type: 'operation_vente', id_local: v.id_local })),
    ] };
  });
  await f.sync.synchroniser();
  await settlement;
  await f.sync.synchroniser();
  assert.equal(paid, 700);
  assert.equal(f.db.prepare('SELECT montant_paye FROM vente').get().montant_paye, 700);
  assert.equal(f.db.prepare('SELECT count(*) n FROM sync_outbox').get().n, 0);
});

test('conversion requested during pull remains queued after the pull transaction', async t => {
  const f = await runtime(t);
  const orders = load('src/services/commande-client.ts', {
    '../db/repositories/base': f.base,
    '../db/repositories/variante': { libelleVariante: () => '' },
    './abonnement': { exigerEcriture: async () => {}, etatCourant: async () => f.abonnement },
    './synchronisation': f.sync,
  });
  f.db.exec("INSERT INTO commande_client (id,id_local,serveur_id,numero,statut,total,date_creation,sync_statut) VALUES (1,'order-1',1,'ORDER1','PRETE',1000,'2026-11-04','SYNCED')");
  const read = f.base.lirePremier;
  let conversion;
  f.base.lirePremier = async (sql, ...args) => {
    if (!conversion && sql.includes('SELECT id FROM commande_client WHERE id_local')) {
      conversion = orders.demanderConversionCommandeEnVente(1, 'especes', 1000);
      await Promise.resolve();
    }
    return read(sql, ...args);
  };
  network(t, () => ({ cursor: 'after', commandes_clients: [{
    id_local: 'order-1', serveur_id: 1, numero: 'ORDER1', statut: 'PRETE', total: 1000,
    montant_paye: 0, date_creation: '2026-11-04', lignes: [],
  }] }));
  await f.sync.synchroniser();
  await conversion;
  assert.equal(f.db.prepare('SELECT conversion_demandee FROM commande_client').get().conversion_demandee, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM sync_outbox').get().n, 1);
});

test('failed conversion outbox insertion rolls back the local request', async t => {
  const f = await runtime(t);
  const orders = load('src/services/commande-client.ts', {
    '../db/repositories/base': f.base,
    '../db/repositories/variante': { libelleVariante: () => '' },
    './abonnement': { exigerEcriture: async () => {} },
    './synchronisation': { marquerChangement: async () => { throw new Error('disk full'); } },
  });
  f.db.exec("INSERT INTO commande_client (id,id_local,serveur_id,numero,statut,total,date_creation) VALUES (1,'order-1',1,'ORDER1','PRETE',1000,'2026-11-04')");
  await assert.rejects(orders.demanderConversionCommandeEnVente(1, 'especes', 1000), /disk full/);
  assert.equal(f.db.prepare('SELECT conversion_demandee FROM commande_client').get().conversion_demandee, 0);
});

test('settlement retry after uncertain commit keeps a single financial event', async t => {
  const f = await runtime(t);
  const transaction = f.base.dansTransaction;
  let lost = true;
  f.base.dansTransaction = async fn => {
    const result = await transaction(fn);
    if (lost) { lost = false; throw new Error('NativeDatabase commit acknowledgement lost'); }
    return result;
  };
  // Either reconciled immediately, or retried with the same request identity.
  await f.sales.encaisser(1, 200, 'payment-request-1').catch(() => {});
  await f.sales.encaisser(1, 200, 'payment-request-1');
  assert.equal(f.db.prepare('SELECT montant_paye FROM vente').get().montant_paye, 300);
  assert.equal(f.db.prepare('SELECT count(*) n FROM operation_vente_mobile').get().n, 1);
  await assert.rejects(f.sales.encaisser(1, 100, 'payment-request-1'), /différent/i);
});

test('simultaneous manual and automatic sync share one HTTP cycle', async t => {
  const f = await runtime(t);
  let requests = 0;
  network(t, () => { requests++; return { cursor: 'after' }; });
  const results = await Promise.all([f.sync.synchroniser(), f.sync.synchroniser()]);
  assert.equal(requests, 1);
  assert.deepEqual(results[0], results[1]);
});

test('an old ACK preserves a newer edit and cannot acknowledge an unsent row', async t => {
  const f = await runtime(t);
  await f.sync.marquerChangement('client', 'client-1');
  network(t, async (_url, init) => {
    if (init.method === 'POST') {
      const payload = JSON.parse(init.body);
      assert.equal(payload.clients[0].nom, 'Client initial');
      f.db.exec("UPDATE client SET nom='Client modifie' WHERE id=1");
      await f.sync.marquerChangement('client', 'client-1');
      await f.sync.marquerChangement('client', 'not-submitted');
      return { appliques: [
        { type: 'client', id_local: 'client-1' },
        { type: 'client', id_local: 'not-submitted' },
      ] };
    }
    return { cursor: 'after', clients: [{ id_local: 'client-1', nom: 'Client initial' }] };
  });
  await f.sync.synchroniser();
  assert.equal(f.db.prepare('SELECT nom FROM client WHERE id=1').get().nom, 'Client modifie');
  assert.deepEqual(f.db.prepare('SELECT id_local FROM sync_outbox ORDER BY id').all().map(x => x.id_local), ['client-1', 'not-submitted']);
  assert.equal(f.param('sync.cursor'), 'before');
});

test('a sale created during pull keeps its stock until the next acknowledged cycle', async t => {
  const f = await runtime(t);
  f.db.exec("UPDATE utilisateur SET id_local='manager' WHERE id=1");
  let cycle = 0;
  network(t, async (_url, init) => {
    if (init.method === 'POST') {
      const ventes = JSON.parse(init.body).ventes;
      assert.equal(ventes.length, 1);
      return { appliques: ventes.map(vente => ({ type: 'vente', id_local: vente.id_local })) };
    }
    if (cycle++ === 0) {
      await f.checkout.enregistrerVente({ cleIdempotence: 'during-pull', montantPaye: 100,
        modePaiement: 'especes', utilisateurId: 1,
        articles: [{ produit: { id: 1, nom: 'Article recette', prixAchat: 50, gestionStock: true },
          unite: 'Piece', facteur: 1, quantite: 1, prixUnitaire: 100 }],
      });
    }
    return { cursor: 'after', produits: [{
      id_local: 'product-1', nom: 'Article recette', quantite_base: cycle === 1 ? 8 : 7,
      actif: true, gestion_stock: true,
    }] };
  });
  await f.sync.synchroniser();
  assert.equal(f.db.prepare('SELECT quantite_base AS stock FROM produit').get().stock, 7);
  assert.equal(f.param('sync.cursor'), 'before');
  assert.match(f.param('sync.derniere_erreur'), /attente/i);
  await f.sync.synchroniser();
  assert.equal(f.param('sync.cursor'), 'after');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sync_outbox').get().n, 0);
});

test('a manager can synchronize a settlement for a sale made by another seller', async t => {
  const f = await runtime(t, 'gerant');
  await f.sales.encaisser(1, 200);
  let sent = [];
  network(t, (_url, init) => {
    if (init.method !== 'POST') return { cursor: 'after' };
    sent = JSON.parse(init.body).operations_vente;
    return { appliques: sent.map(x => ({ type: 'operation_vente', id_local: x.id_local })) };
  });
  await f.sync.synchroniser();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].montant, 200);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sync_outbox').get().n, 0);
});

test('a seller cannot transmit another seller settlement', async t => {
  const f = await runtime(t, 'vendeur');
  await f.sales.encaisser(1, 200);
  let posts = 0;
  network(t, (_url, init) => { if (init.method === 'POST') posts++; return { cursor: 'after' }; });
  await f.sync.synchroniser();
  assert.equal(posts, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sync_outbox').get().n, 1);
  assert.equal(f.param('sync.cursor'), 'before');
});

test('an unsupported financial protocol retains the event and reports pending state', async t => {
  const f = await runtime(t);
  await f.sales.encaisser(1, 200);
  network(t, (_url, init) => init.method === 'POST' ? { appliques: [] } : { cursor: 'after' });
  await f.sync.synchroniser();
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sync_outbox').get().n, 1);
  assert.equal(f.param('sync.cursor'), 'before');
  assert.match(f.param('sync.derniere_erreur'), /attente/i);
});
