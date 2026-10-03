const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function chargerSynchronisation(options = {}) {
  const chemin = resolve(__dirname, '../src/services/synchronisation.ts');
  const parametres = new Map([
    ['sync.boutique', 'boutique-A'],
    ['sync.bootstrap_effectue', '1'],
    ['sync.protocole', '2'],
  ]);
  const mutations = [];
  const base = {
    lirePremier: async (sql, ...args) => {
      const cle = args[0];
      if (sql.includes('FROM parametre')) return { valeur: parametres.get(cle) ?? null };
      if (sql.includes('FROM sync_outbox')) return { n: 2 };
      if (sql.includes('FROM vente WHERE id_local')) return null;
      if (sql.includes('FROM produit WHERE id_local')) return options.produit ?? null;
      if (sql.includes('FROM mouvement_stock WHERE id_local')) return null;
      if (sql.includes('FROM mouvement_stock')) return options.mouvementDoublon?.(sql, args) ?? null;
      throw new Error(`Lecture inattendue: ${sql}`);
    },
    executer: async (sql, ...args) => {
      mutations.push({ sql, args });
      if (sql.includes('INSERT INTO parametre')) parametres.set(args[0], args[1]);
    },
    dansTransaction: async (operation) => operation(),
    lireTout: async () => [],
    maintenant: () => '2026-09-30T12:00:00Z',
    ...options.base,
  };
  const imports = {
    '../db/repositories/base': base,
    'expo-file-system': { File: class {}, Paths: {} },
    'expo-file-system/legacy': {},
    './notifications/journal': { deposer: async () => {} },
    './abonnement': {
      jetonAppareil: async () => options.jeton ?? null,
      rafraichir: async () => options.abonnement ?? { peutEcrire: true, message: '' },
    },
  };
  const moduleCharge = new Module(chemin, module);
  moduleCharge.paths = Module._nodeModulePaths(resolve(__dirname, '..'));
  moduleCharge.require = (nom) => nom in imports ? imports[nom] : require(nom);
  moduleCharge._compile(ts.transpileModule(readFileSync(chemin, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, chemin);
  return { bootstrapInitial: moduleCharge.exports.bootstrapInitial, synchroniser: moduleCharge.exports.synchroniser, parametres, mutations };
}

test('a linked phone never clears local data to switch to another shop', async () => {
  const { bootstrapInitial, parametres, mutations } = chargerSynchronisation();
  await assert.rejects(() => bootstrapInitial('boutique-B'), /boutique|espace/i);
  assert.equal(parametres.get('sync.boutique'), 'boutique-A');
  assert.equal(parametres.get('sync.cursor'), undefined);
  assert.equal(mutations.some(({ sql }) => /DELETE FROM (sync_outbox|vente|utilisateur)/i.test(sql)), false);
});

test('a changed commerce profile blocks push and preserves pending operations', async () => {
  const { synchroniser, mutations } = chargerSynchronisation({
    jeton: 'test-token',
    abonnement: { peutEcrire: false, message: 'Profil incompatible : variantes.' },
    base: { lireTout: async () => [{ type_objet: 'vente', id_local: 'v1', statut: 'PENDING' }] },
  });
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('unexpected request'); };
  try {
    await assert.rejects(() => synchroniser(), /Profil incompatible/);
    assert.equal(calls, 0);
    assert.equal(mutations.some(({ sql }) => /DELETE FROM sync_outbox/.test(sql)), false);
    assert.equal(mutations.some(({ sql }) => /SET statut = 'SENDING'/.test(sql)), false);
  } finally { global.fetch = originalFetch; }
});

test('SQLite keeps every movement and reconciles the legacy outgoing quantity sign', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE parametre (cle TEXT PRIMARY KEY, valeur TEXT, date_modification TEXT);
    CREATE TABLE sync_outbox (id INTEGER PRIMARY KEY, type_objet TEXT, id_local TEXT,
      statut TEXT, date_creation TEXT, derniere_erreur TEXT, tentatives INTEGER);
    CREATE TABLE produit (id INTEGER PRIMARY KEY, id_local TEXT UNIQUE);
    CREATE TABLE mouvement_stock (id INTEGER PRIMARY KEY, id_local TEXT UNIQUE, produit_id INTEGER,
      nature TEXT, source_operation TEXT, quantite REAL, unite TEXT, quantite_base REAL,
      stock_avant REAL, stock_apres REAL, prix_unitaire REAL, reference TEXT, motif TEXT,
      utilisateur TEXT, date_mouvement TEXT);
    INSERT INTO produit VALUES (1, 'p1'), (2, 'p2');
    INSERT INTO mouvement_stock (id_local, produit_id, nature, source_operation,
      quantite_base, stock_avant, stock_apres, reference)
      VALUES ('local-1', 1, 'SORTIE', 'VENTE', 2, 10, 8, 'V-1');
  `);
  const { synchroniser } = chargerSynchronisation({
    jeton: 'test-token',
    base: {
      lirePremier: async (sql, ...args) => db.prepare(sql).get(...args),
      lireTout: async (sql, ...args) => db.prepare(sql).all(...args),
      executer: async (sql, ...args) => db.prepare(sql).run(...args),
      dansTransaction: async (operation) => {
        db.exec('BEGIN');
        try { const resultat = await operation(); db.exec('COMMIT'); return resultat; }
        catch (erreur) { db.exec('ROLLBACK'); throw erreur; }
      },
    },
  });
  const mouvement = (id, produit, avant, apres) => ({
    id_local: id, produit_id_local: produit, nature: 'SORTIE', source: 'VENTE',
    quantite: avant - apres, quantite_base: apres - avant,
    stock_avant: avant, stock_apres: apres, reference: 'V-1',
    date_mouvement: '2026-09-30T12:00:00Z',
  });
  const precedent = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({
    cursor: 'cursor-1', mouvements: [
      mouvement('web-1', 'p1', 10, 8),
      mouvement('web-2', 'p2', 5, 4),
      mouvement('web-3', 'p1', 8, 7),
    ],
  }) });
  try {
    await synchroniser();
    await synchroniser();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mouvement_stock').get().n, 3);
  } finally {
    global.fetch = precedent;
    db.close();
  }
});

test('a sale with a missing product cannot advance the pull cursor', async () => {
  const { synchroniser, parametres, mutations } = chargerSynchronisation({ jeton: 'test-token' });
  const precedent = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      cursor: 'cursor-1',
      ventes: [{
        id_local: 'vente-1', numero: 'V-1', date_vente: '2026-09-30T12:00:00Z',
        total: 100, montant_paye: 100, mode_paiement: 'ESPECES', statut: 'PAYEE', benefice_total: 20,
        lignes: [{ produit_id_local: 'produit-absent', libelle: 'Article', unite: 'Unite', facteur: 1,
          quantite: 1, quantite_base: 1, prix_unitaire: 100, cout_unitaire: 80, total: 100, benefice_total: 20 }],
      }],
    }),
  });
  try {
    await assert.rejects(() => synchroniser(), /produit-absent/);
    assert.equal(parametres.get('sync.cursor'), undefined);
    assert.equal(mutations.some(({ sql }) => sql.includes('INSERT INTO vente')), false);
  } finally {
    global.fetch = precedent;
  }
});

test('a second product movement sharing a sale reference is not discarded', async () => {
  const { synchroniser, mutations } = chargerSynchronisation({
    jeton: 'test-token',
    produit: { id: 2 },
    mouvementDoublon: (_sql, args) => args.includes(2) ? null : { id: 1 },
  });
  const precedent = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      cursor: 'cursor-1',
      mouvements: [{
        id_local: 'mouvement-2', produit_id_local: 'produit-2', nature: 'SORTIE',
        source: 'VENTE', quantite: 1, quantite_base: 1, stock_avant: 5, stock_apres: 4,
        reference: 'V-1', date_mouvement: '2026-09-30T12:00:00Z',
      }],
    }),
  });
  try {
    await synchroniser();
    assert.equal(mutations.filter(({ sql }) => sql.includes('INSERT INTO mouvement_stock')).length, 1);
  } finally {
    global.fetch = precedent;
  }
});
