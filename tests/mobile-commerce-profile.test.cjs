const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function charger() {
  const path = resolve(__dirname, '../src/domain/commerce.ts');
  const loaded = new Module(path, module);
  loaded._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, path);
  return loaded.exports;
}

const contrat = {
  version: 1, secteur: 'ELECTRONIQUE', secteur_libelle: 'Electronique',
  mode_vente: 'DETAIL', mode_approvisionnement: 'CLASSIQUE', mode_catalogue: 'SIMPLE',
  capabilities_effectives: ['STOCK_SIMPLE', 'BARCODE'], capabilities_non_supportees: [],
  compatible: true, raison: '',
};

test('mobile exposes the nine actual server commerce sectors', () => {
  const { SECTEURS_COMMERCE } = charger();
  assert.deepEqual(SECTEURS_COMMERCE.map(s => s.code), [
    'ALIMENTATION', 'HABILLEMENT', 'FRIPERIE', 'ELECTRONIQUE', 'QUINCAILLERIE',
    'COSMETIQUE', 'PIECES_DETACHEES', 'COMMERCE_GENERAL', 'AUTRE',
  ]);
});

test('signed simple catalogue remains usable offline', () => {
  const { lireProfilCommerce } = charger();
  assert.equal(lireProfilCommerce(contrat).compatible, true);
  assert.equal(lireProfilCommerce(contrat).secteur, 'ELECTRONIQUE');
});

test('unsupported catalogues and capabilities cannot unlock this APK', () => {
  const { lireProfilCommerce } = charger();
  for (const extra of [
    { mode_catalogue: 'ADVANCED' },
    { capabilities_effectives: ['SERIAL_TRACKING'] },
    { capabilities_non_supportees: ['PRODUCT_VARIANTS'] },
    { compatible: false, raison: 'Lecture uniquement.' },
    { compatible: 'true' },
  ]) {
    assert.notEqual(lireProfilCommerce({ ...contrat, ...extra })?.compatible, true);
  }
});

test('missing or unknown commerce contracts fail closed', () => {
  const { lireProfilCommerce } = charger();
  for (const value of [undefined, {}, { ...contrat, version: 2 },
    { ...contrat, secteur: 'INCONNU' }, { ...contrat, capabilities_effectives: null }]) {
    assert.equal(lireProfilCommerce(value), null);
  }
});
