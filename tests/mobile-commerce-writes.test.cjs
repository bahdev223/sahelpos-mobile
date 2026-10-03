const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

for (const [file, operations] of [
  ['src/db/repositories/produit.ts', [['creerProduit', {}], ['modifierProduit', 1, {}], ['supprimerOuDesactiver', 1]]],
  ['src/db/repositories/stock.ts', [['appliquerMouvement', { quantite: 1 }]]],
  ['src/services/inventaire.ts', [['creerInventaire'], ['saisirComptage', 1, 1, 2], ['annulerInventaire', 1]]],
]) {
  for (const [name, ...args] of operations) {
    test(`${name} refuses incompatible commerce before any database mutation`, async () => {
      const path = resolve(__dirname, '..', file);
      const loaded = new Module(path, module);
      let writes = 0;
      const base = {
        lirePremier: async () => null, lireTout: async () => [],
        executer: async () => { writes++; return { lastInsertRowId: 1 }; },
        dansTransaction: async op => op(), maintenant: () => '2026-10-01',
        genererIdLocal: () => 'local-1', versBooleen: Boolean,
      };
      loaded.require = name => {
        if (name.endsWith('/base')) return base;
        if (name.endsWith('/abonnement')) return { exigerEcriture: async () => { throw new Error('Profil incompatible'); } };
        if (name.endsWith('/synchronisation')) return { marquerChangement: async () => { writes++; } };
        if (name.endsWith('/notifications')) return { verifierStock: async () => {} };
        if (name.endsWith('/domain/stock')) return { seuilAlerteStock: () => 1 };
        throw new Error(`Import inattendu ${name}`);
      };
      loaded._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText, path);
      await assert.rejects(() => loaded.exports[name](...args), /Profil incompatible/);
      assert.equal(writes, 0);
    });
  }
}
