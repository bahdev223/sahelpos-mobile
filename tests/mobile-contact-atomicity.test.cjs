const test = require('node:test');
const assert = require('node:assert/strict');
const { load, runtime } = require('./helpers/sqlite-runtime.cjs');

for (const [kind, title] of [['client', 'Client'], ['fournisseur', 'Fournisseur']]) {
  test(`${kind}: failed outbox insertion rolls back the contact itself`, async t => {
    const rt = await runtime(t);
    const repo = load(`src/db/repositories/${kind}.ts`, {
      './base': rt.base,
      '../../services/abonnement': { exigerEcriture: async () => {} },
      '../../services/synchronisation': { marquerChangement: async () => { throw Error('outbox unavailable'); } },
    });
    const before = rt.db.prepare(`SELECT COUNT(*) AS n FROM ${kind}`).get().n;
    await assert.rejects(repo[`creer${title}`]({ nom: 'Contact recette' }), /outbox/);
    assert.equal(rt.db.prepare(`SELECT COUNT(*) AS n FROM ${kind}`).get().n, before);
  });
}
