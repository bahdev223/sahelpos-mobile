const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

// Execute the production TypeScript and SQL, replacing only the native bridge.
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
const moduleParent = module;
const { calculerPeriode } = charger('src/domain/periodes.ts');
const reference = new Date(2026, 8, 12, 14);
const dateLocale = (iso) => {
  const d = new Date(iso);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
};

test('annual navigation covers all twelve months of the previous year', () => {
  const p = calculerPeriode('annee', -1, reference);
  assert.deepEqual(dateLocale(p.debut), [2025, 1, 1]);
  assert.deepEqual(dateLocale(p.fin), [2025, 12, 31]);
  assert.equal(p.groupes.length, 12);
  assert.equal(p.groupes[0].cle, '2025-01');
  assert.equal(p.groupes[11].cle, '2025-12');
});

test('month navigation handles leap February and year boundaries', () => {
  const fevrier = calculerPeriode('mois', -1, new Date(2024, 2, 31));
  assert.deepEqual(dateLocale(fevrier.fin), [2024, 2, 29]);
  assert.equal(fevrier.groupes.length, 29);
  const decembre = calculerPeriode('mois', -1, new Date(2026, 0, 31));
  assert.deepEqual(dateLocale(decembre.debut), [2025, 12, 1]);
  assert.deepEqual(dateLocale(decembre.fin), [2025, 12, 31]);
});

test('calendar weeks run Monday to Sunday even across a year boundary', () => {
  const p = calculerPeriode('semaine', 0, new Date(2026, 0, 1));
  assert.deepEqual(dateLocale(p.debut), [2025, 12, 29]);
  assert.deepEqual(dateLocale(p.fin), [2026, 1, 4]);
  assert.equal(p.groupes.length, 7);
});

test('day, seven-day and thirty-day blocks have no gaps or overlap', () => {
  for (const [mode, count] of [['jour', 1], ['7jours', 7], ['30jours', 30]]) {
    const actuel = calculerPeriode(mode, 0, reference);
    const avant = calculerPeriode(mode, -1, reference);
    assert.equal(actuel.groupes.length, count);
    assert.equal(new Date(avant.fin).getTime() + 1, new Date(actuel.debut).getTime());
  }
});

test('civil-day boundaries survive daylight saving changes', () => {
  const initial = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Paris';
    for (const [reference, heures] of [[new Date(2026, 2, 29, 12), 23], [new Date(2026, 9, 25, 12), 25]]) {
      const p = calculerPeriode('jour', 0, reference);
      assert.equal(new Date(p.fin) - new Date(p.debut) + 1, heures * 3600000);
      assert.equal(p.groupes.length, 1);
    }
  } finally {
    if (initial === undefined) delete process.env.TZ;
    else process.env.TZ = initial;
  }
});

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE client (id INTEGER PRIMARY KEY, nom TEXT);
    CREATE TABLE vente (id INTEGER PRIMARY KEY, numero TEXT, date_vente TEXT,
      client_id INTEGER, utilisateur_id INTEGER, total REAL, montant_paye REAL,
      benefice_total REAL, mode_paiement TEXT, statut TEXT);
    CREATE TABLE ligne_vente (vente_id INTEGER, produit_id INTEGER, libelle TEXT,
      quantite REAL, total REAL, benefice_total REAL);
  `);
  const inserer = db.prepare('INSERT INTO vente VALUES (?, ?, ?, NULL, ?, 100, 80, 20, \'especes\', ?)');
  for (let id = 1; id <= 450; id++) {
    // Repeated dates exercise the ID tie-breaker on every pagination boundary.
    const date = new Date(2025, id <= 225 ? 0 : 11, 15, 12).toISOString();
    inserer.run(id, `V-${id}`, date, id % 2 ? 1 : 2, id % 10 ? 'partielle' : 'annulee');
    db.prepare('INSERT INTO ligne_vente VALUES (?, 1, \'Produit\', 1, 100, 20)').run(id);
  }
  inserer.run(451, 'V-451', new Date(2026, 0, 1, 12).toISOString(), 1, 'partielle');
  const repo = charger('src/db/repositories/vente.ts', {
    './base': {
      lireTout: async (sql, ...params) => db.prepare(sql).all(...params),
      lirePremier: async (sql, ...params) => db.prepare(sql).get(...params),
    },
  });
  return { db, repo, periode: calculerPeriode('annee', -1, reference) };
}

test('keyset pagination returns every sale beyond 300 with no duplicates', async () => {
  const { db, repo, periode } = fixture();
  try {
    const toutes = [];
    let avant;
    for (;;) {
      const page = await repo.listerVentes({ debut: periode.debut, fin: periode.fin, limite: 100, avant });
      toutes.push(...page);
      if (page.length < 100) break;
      avant = page.at(-1);
    }
    assert.equal(toutes.length, 450);
    assert.equal(new Set(toutes.map(v => v.id)).size, 450);
    assert.equal(toutes[0].id, 450);
    assert.equal(toutes.at(-1).id, 1);
  } finally { db.close(); }
});

test('annual totals and monthly groups exclude cancellations, not older sales', async () => {
  const { db, repo, periode: p } = fixture();
  try {
    const total = await repo.totauxPeriode(p.debut, p.fin);
    assert.deepEqual(total, { nbVentes: 405, chiffreAffaires: 40500, encaisse: 32400, benefice: 8100, resteDu: 8100 });
    const groupes = await repo.regrouperVentes(p.debut, p.fin, true);
    assert.deepEqual(groupes.map(g => g.cle), ['2025-01', '2025-12']);
    assert.equal(groupes.reduce((s, g) => s + g.chiffreAffaires, 0), total.chiffreAffaires);
    assert.equal(groupes.reduce((s, g) => s + g.nbVentes, 0), total.nbVentes);
  } finally { db.close(); }
});

test('seller scope applies to history, totals, groups and top products', async () => {
  const { db, repo, periode: p } = fixture();
  try {
    const ventes = await repo.listerVentes({ debut: p.debut, fin: p.fin, utilisateurId: 1, limite: 500 });
    assert.equal(ventes.length, 225);
    assert.ok(ventes.every(v => v.id % 2 === 1));
    const total = await repo.totauxPeriode(p.debut, p.fin, 1);
    assert.equal(total.chiffreAffaires, 22500);
    const groupes = await repo.regrouperVentes(p.debut, p.fin, false, 1);
    assert.equal(groupes.length, 2);
    assert.equal(groupes.reduce((s, g) => s + g.chiffreAffaires, 0), 22500);
    const top = await repo.meilleuresVentes(p.debut, p.fin, 5, 1);
    assert.equal(top[0].total, 22500);
    const global = await repo.meilleuresVentes(p.debut, p.fin, 5);
    assert.equal(global[0].total, 40500);
  } finally { db.close(); }
});

test('an empty historical year has zero totals without losing its twelve buckets', async () => {
  const { db, repo } = fixture();
  try {
    const p = calculerPeriode('annee', -3, reference);
    assert.equal(p.groupes.length, 12);
    assert.deepEqual(await repo.regrouperVentes(p.debut, p.fin, true), []);
    assert.equal((await repo.totauxPeriode(p.debut, p.fin)).nbVentes, 0);
  } finally { db.close(); }
});
