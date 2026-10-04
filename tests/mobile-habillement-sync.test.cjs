const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const source = readFileSync(resolve(__dirname, '../src/services/synchronisation.ts'), 'utf8');

test('habilitation sync uses protocol v3', () => {
  assert.match(source, /const VERSION_PROTOCOLE = '3'/);
});

test('habilitation pull contract is represented explicitly', () => {
  for (const champ of [
    'referentiels_habillement',
    'produits_habillement',
    'dimensions',
    'valeurs_dimensions',
    'variantes',
  ]) assert.match(source, new RegExp(champ));
});

test('habilitation pull applies dependencies before variants and cursor', () => {
  const ref = source.indexOf('referentiels_habillement');
  const dim = source.indexOf('pull.dimensions');
  const val = source.indexOf('pull.valeurs_dimensions');
  const prod = source.indexOf('pull.produits_habillement');
  const vari = source.indexOf('pull.variantes');
  const cursor = source.lastIndexOf('await ecrireParam(CLE_CURSOR, pull.cursor)');
  assert.ok(ref >= 0 && ref < dim);
  assert.ok(dim < val);
  assert.ok(val < prod);
  assert.ok(prod < vari);
  assert.ok(vari < cursor);
});

test('habilitation repositories are used for idempotent upserts', () => {
  assert.match(source, /upsertReferentielHabillement/);
  assert.match(source, /upsertProduitHabillement/);
  assert.match(source, /upsertDimension/);
  assert.match(source, /upsertValeurDimension/);
  assert.match(source, /upsertVariante/);
});
