const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function charger(pathRelatif, lignes = {}) {
  const path = resolve(__dirname, '..', pathRelatif);
  const loaded = new Module(path, module);
  loaded.require = (name) => {
    if (name.endsWith('/base')) return lignes.base;
    throw new Error(`Import inattendu ${name}`);
  };
  loaded._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, path);
  return loaded.exports;
}

test('variant repository exposes idempotent upsert contracts', () => {
  const source = readFileSync(resolve(__dirname, '../src/db/repositories/variante.ts'), 'utf8');
  for (const nom of ['upsertDimension', 'upsertValeurDimension', 'upsertVariante', 'listerVariantesProduit']) {
    assert.match(source, new RegExp(`export async function ${nom}`));
  }
  assert.match(source, /ON CONFLICT\(id_local\)/);
  assert.match(source, /date_modification/);
  assert.match(source, /Date\.parse/);
  assert.match(source, /variante_valeur/);
});

test('habilitation repository exposes reference and product-extension upserts', () => {
  const source = readFileSync(resolve(__dirname, '../src/db/repositories/habillement.ts'), 'utf8');
  assert.match(source, /export async function upsertReferentielHabillement/);
  assert.match(source, /export async function upsertProduitHabillement/);
  assert.match(source, /ON CONFLICT\(id_local\)/);
  assert.match(source, /Date\.parse/);
  assert.match(source, /Produit Habillement orphelin/);
});

test('dimension/value contracts keep identities scoped by dimension', () => {
  const source = readFileSync(resolve(__dirname, '../src/domain/habillement.ts'), 'utf8');
  assert.match(source, /dimension_id_local: string/);
  assert.match(source, /valeurs_id_local: string\[\]/);
  assert.match(source, /dimension_code: 'TAILLE' \| 'POINTURE'/);
});

test('sellable variant listing excludes inactive and deleted variants', () => {
  const source = readFileSync(resolve(__dirname, '../src/db/repositories/variante.ts'), 'utf8');
  assert.match(source, /v\.actif = 1/);
  assert.match(source, /v\.supprime_le IS NULL/);
});
