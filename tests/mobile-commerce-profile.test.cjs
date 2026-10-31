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

test('mobile exposes the eleven actual server commerce sectors', () => {
  const { SECTEURS_COMMERCE } = charger();
  assert.deepEqual(SECTEURS_COMMERCE.map(s => s.code), [
    'ALIMENTATION', 'HABILLEMENT', 'FRIPERIE', 'ELECTRONIQUE', 'ELECTRICITE', 'QUINCAILLERIE',
    'COSMETIQUE', 'PIECES_DETACHEES', 'CEREALES_VRAC', 'COMMERCE_GENERAL', 'AUTRE',
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


test('habillement core profile is supported and resolves dedicated mobile labels', () => {
  const { lireProfilCommerce, resoudreProfilUIMobile } = charger();
  const habillement = lireProfilCommerce({
    ...contrat,
    secteur: 'HABILLEMENT',
    secteur_libelle: 'Habillement',
    capabilities_effectives: [
      'STOCK_SIMPLE', 'PRODUCT_VARIANTS', 'SIZE_DIMENSION',
      'COLOR_DIMENSION', 'VARIANT_EXCHANGE', 'INVENTORY',
    ],
  });
  assert.equal(habillement?.compatible, true);
  const ui = resoudreProfilUIMobile(habillement);
  assert.equal(ui.code, 'HABILLEMENT');
  assert.equal(ui.libelles.catalogue, 'Modeles');
  assert.equal(ui.libelles.produits, 'Modeles');
  assert.equal(ui.libelles.categories, 'Collections');
});


test('quincaillerie profile is compatible and exposes technical labels', () => {
  const { lireProfilCommerce, resoudreProfilUIMobile } = charger();
  const quincaillerie = lireProfilCommerce({
    ...contrat,
    secteur: 'QUINCAILLERIE',
    secteur_libelle: 'Quincaillerie',
    capabilities_effectives: [
      'STOCK_SIMPLE', 'MULTI_UNIT', 'PRODUCT_VARIANTS',
      'TECHNICAL_DIMENSIONS', 'WHOLESALE', 'INVENTORY', 'LOW_STOCK_ALERT', 'BARCODE',
    ],
  });
  assert.equal(quincaillerie?.compatible, true);
  const ui = resoudreProfilUIMobile(quincaillerie);
  assert.equal(ui.code, 'QUINCAILLERIE');
  assert.equal(ui.libelles.catalogue, 'Références');
  assert.equal(ui.libelles.categories, 'Rayons');
  assert.equal(ui.libelles.achats, 'Appro.');
});
