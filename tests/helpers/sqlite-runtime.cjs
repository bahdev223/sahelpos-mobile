const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function load(relative, imports = {}) {
  const filename = resolve(__dirname, '../..', relative);
  const loaded = new Module(filename, module);
  loaded.paths = Module._nodeModulePaths(resolve(__dirname, '../..'));
  loaded.require = name => name in imports ? imports[name] : require(name);
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}

async function runtime(t, role = 'patron') {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  let queue = Promise.resolve();
  const transaction = fn => {
    const work = queue.then(async () => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = await fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
    });
    queue = work.catch(() => {});
    return work;
  };
  const native = {
    execAsync: async sql => db.exec(sql),
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => {
      const result = db.prepare(sql).run(...args);
      return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
    },
    withTransactionAsync: transaction,
  };
  await load('src/db/database.ts', {
    'expo-sqlite': { openDatabaseAsync: async () => native },
    './schema': load('src/db/schema.ts'),
  }).obtenirBase();
  let seq = 0;
  const base = {
    lirePremier: native.getFirstAsync, lireTout: native.getAllAsync,
    executer: native.runAsync, dansTransaction: transaction,
    maintenant: () => '2026-11-04T12:00:00.000Z',
    genererIdLocal: () => `operation-${++seq}`,
  };
  const abonnement = { peutEcrire: true, droit: {
    boutique: 'shop', peutEcrire: true,
    membre: { id_local: 'manager', role },
    commerce: { ecritures_autorisees: ['produits', 'clients', 'ventes', 'mouvements'] },
  } };
  const sync = load('src/services/synchronisation.ts', {
    '../db/repositories/base': base,
    'expo-file-system': { File: class {}, Paths: {} },
    'expo-file-system/legacy': {},
    './notifications/journal': { deposer: async () => {} },
    './abonnement': {
      jetonAppareil: async () => 'test-device', rafraichir: async () => abonnement,
      ecritureMobileAutorisee: (etat, type) => etat.droit.commerce.ecritures_autorisees.includes(type),
    },
  });
  db.exec(`
    INSERT INTO parametre (cle, valeur) VALUES
      ('sync.boutique', 'shop'), ('sync.cursor', 'before'),
      ('sync.bootstrap_effectue', '1');
    INSERT INTO utilisateur (id, id_local, login, nom, code_pin, role, date_creation)
      VALUES (1, 'seller', 'seller', 'Vendeur recette', 'hash', 'vendeur', '2026-11-04');
    INSERT INTO client (id, id_local, nom, date_creation) VALUES (1, 'client-1', 'Client initial', '2026-11-04');
    INSERT INTO produit (id, id_local, nom, quantite_base, date_creation)
      VALUES (1, 'product-1', 'Article recette', 8, '2026-11-04');
    INSERT INTO vente (id, id_local, numero, utilisateur_id, client_id, date_vente, total, montant_paye, statut)
      VALUES (1, 'sale-1', 'RECETTE-1', 1, 1, '2026-11-04', 1000, 100, 'partielle');
    INSERT INTO ligne_vente (vente_id, produit_id, libelle, unite, quantite, quantite_base, prix_unitaire, total)
      VALUES (1, 1, 'Article recette', 'Piece', 1, 1, 1000, 1000);
  `);
  db.prepare('INSERT INTO parametre (cle,valeur) VALUES (?,?)').run(
    'sync.perimetre_membre', JSON.stringify(['shop', 'manager', role]),
  );
  const sales = load('src/db/repositories/vente.ts', { './base': base });
  const checkout = load('src/services/vente.ts', {
    '../db/database': { obtenirBase: async () => native }, '../db/repositories/base': base,
    '../db/repositories/variante': { libelleVariante: v => v.sku },
    './abonnement': { exigerEcriture: async () => {} }, './auth': { verifierAccesCaisse: async () => {} },
    './notifications': { verifierStock: async () => {} }, './synchronisation': sync,
  });
  return { db, base, sync, sales, checkout, abonnement, param: key => db.prepare('SELECT valeur FROM parametre WHERE cle=?').get(key)?.valeur };
}

function network(t, handler) {
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; });
  global.fetch = async (url, init) => ({ ok: true, json: async () => handler(url, init) });
}

module.exports = { load, runtime, network };
