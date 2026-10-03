const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

const moduleParent = module;

function charger(fichier, imports = {}) {
  const chemin = resolve(__dirname, '..', fichier);
  const module = new Module(chemin, moduleParent);
  module.paths = Module._nodeModulePaths(resolve(__dirname, '..'));
  module.require = (nom) => nom in imports ? imports[nom] : require(nom);
  module._compile(ts.transpileModule(readFileSync(chemin, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, chemin);
  return module.exports;
}

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE client (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_local TEXT NOT NULL UNIQUE,
      nom TEXT NOT NULL,
      telephone TEXT,
      email TEXT,
      adresse TEXT,
      chemin_photo TEXT,
      date_creation TEXT NOT NULL,
      date_modification TEXT
    );
  `);
  const changements = [];
  const repo = charger('src/db/repositories/client.ts', {
    './base': {
      executer: async (sql, ...params) => {
        const r = db.prepare(sql).run(...params);
        return { lastInsertRowId: Number(r.lastInsertRowid) };
      },
      genererIdLocal: () => 'client-local-photo',
      lirePremier: async (sql, ...params) => db.prepare(sql).get(...params),
      lireTout: async (sql, ...params) => db.prepare(sql).all(...params),
      maintenant: () => '2026-09-25T00:00:00.000Z',
    },
    '../../services/synchronisation': {
      marquerChangement: async (type, idLocal) => changements.push({ type, idLocal }),
    },
  });
  return { db, repo, changements };
}

test('client repository stores and reads the optional profile photo path', async () => {
  const { db, repo, changements } = fixture();
  try {
    const id = await repo.creerClient({
      nom: 'Ousmane Toure',
      telephone: '879468475',
      email: '',
      adresse: 'Golf, Bamako',
      cheminPhoto: 'clients/ousmane.png',
    });

    assert.deepEqual(await repo.obtenirClient(id), {
      id,
      idLocal: 'client-local-photo',
      nom: 'Ousmane Toure',
      telephone: '879468475',
      email: null,
      adresse: 'Golf, Bamako',
      cheminPhoto: 'clients/ousmane.png',
    });
    assert.deepEqual(changements, [{ type: 'client', idLocal: 'client-local-photo' }]);
  } finally {
    db.close();
  }
});
