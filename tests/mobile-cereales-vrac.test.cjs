const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function chargerTs(relatif) {
  const filename = resolve(__dirname, '..', relatif);
  const loaded = new Module(filename, module);
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}

const commerce = chargerTs('src/domain/commerce.ts');
const presentation = chargerTs('src/domain/presentation-commerce.ts');

function contrat(overrides = {}) {
  return commerce.lireProfilCommerce({
    version: 1,
    secteur: 'CEREALES_VRAC',
    secteur_libelle: 'Céréales & Produits en vrac',
    mode_vente: 'DETAIL',
    mode_approvisionnement: 'CLASSIQUE',
    mode_catalogue: 'SIMPLE',
    capabilities_effectives: [
      'STOCK_SIMPLE', 'MULTI_UNIT', 'BULK_WEIGHT',
      'INVENTORY', 'LOW_STOCK_ALERT', 'WHOLESALE',
    ],
    capabilities_non_supportees: [],
    ecritures_autorisees: [...commerce.TYPES_ECRITURE_COMMERCE],
    compatible: true,
    raison: '',
    ...overrides,
  });
}

test('Céréales & Vrac est un secteur mobile de premier rang', () => {
  assert.ok(commerce.SECTEURS_COMMERCE.some((s) => s.code === 'CEREALES_VRAC'));
  const p = contrat();
  assert.ok(p);
  assert.equal(p.compatible, true);
  assert.equal(p.mode_catalogue, 'SIMPLE');
});

test('le profil vrac expose Denrées, Familles et Stock en poids', () => {
  const ui = commerce.resoudreProfilUIMobile(contrat());
  assert.equal(ui.nom, 'Céréales & Vrac');
  assert.equal(ui.libelles.catalogue, 'Denrées');
  assert.equal(ui.libelles.produit, 'Denrée');
  assert.equal(ui.libelles.categories, 'Familles');
  assert.equal(ui.libelles.stock, 'Stock en poids');
  assert.ok(ui.capabilities.includes('BULK_WEIGHT'));
  assert.ok(ui.capabilities.includes('MULTI_UNIT'));
  assert.ok(ui.capabilities.includes('WHOLESALE'));
});

test('BULK_WEIGHT reste compatible avec les écritures offline', () => {
  const p = contrat();
  assert.equal(p.compatible, true);
  assert.equal(commerce.ecritureCommerceAutorisee(p, 'produits'), true);
  assert.equal(commerce.ecritureCommerceAutorisee(p, 'achats'), true);
  assert.equal(commerce.ecritureCommerceAutorisee(p, 'ventes'), true);
});

test('Céréales ne devient jamais un profil technique à variantes', () => {
  const p = contrat();
  assert.equal(p.capabilities_effectives.includes('PRODUCT_VARIANTS'), false);
  assert.equal(p.capabilities_effectives.includes('TECHNICAL_DIMENSIONS'), false);
  assert.equal(presentation.estReferenceTechnique(p), false);
  assert.equal(presentation.estVrac(p), true);
});

test('le gros reste disponible par défaut sur le profil vrac', () => {
  assert.equal(presentation.tarifGrosDisponible(contrat({ mode_vente: 'DETAIL' })), true);
});

test('le formulaire mobile contient les conditionnements vrac standards', () => {
  const source = readFileSync(resolve(__dirname, '../app/produit/nouveau.tsx'), 'utf8');
  for (const libelle of ['5 kg', 'Demi-sac 25 kg', 'Sac 50 kg', 'Tonne']) {
    assert.equal(source.includes(libelle), true, libelle);
  }
  assert.equal(source.includes("uniteBase: 'Kg'"), true);
  assert.equal(source.includes("stockMin: '50'"), true);
});
