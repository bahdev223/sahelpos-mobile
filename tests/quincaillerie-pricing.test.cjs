const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function charger() {
  const path = resolve(__dirname, '../src/domain/quincaillerie.ts');
  const loaded = new Module(path, module);
  loaded._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, path);
  return loaded.exports;
}

test('prix détail conditionnement utilise le prix propre quand il existe', () => {
  const { prixConditionnement } = charger();
  assert.equal(prixConditionnement(600, 55000, 100), 55000);
});

test('prix détail conditionnement hérite du prix base fois facteur', () => {
  const { prixConditionnement } = charger();
  assert.equal(prixConditionnement(600, 0, 100), 60000);
});

test('prix gros conditionnement utilise le prix propre quand il existe', () => {
  const { prixGrosConditionnement } = charger();
  assert.equal(prixGrosConditionnement(500, 47000, 100), 47000);
});

test('prix gros conditionnement hérite du gros de base', () => {
  const { prixGrosConditionnement } = charger();
  assert.equal(prixGrosConditionnement(500, 0, 100), 50000);
});

test('absence de prix gros reste absence de prix gros', () => {
  const { prixGrosConditionnement } = charger();
  assert.equal(prixGrosConditionnement(0, 0, 100), 0);
});

test('facteur ou tarifs invalides sont refusés', () => {
  const { prixConditionnement, prixGrosConditionnement } = charger();
  assert.throws(() => prixConditionnement(600, 0, 0), /invalide/i);
  assert.throws(() => prixGrosConditionnement(-1, 0, 10), /invalide/i);
  assert.throws(() => prixGrosConditionnement(500, -10, 10), /invalide/i);
});
