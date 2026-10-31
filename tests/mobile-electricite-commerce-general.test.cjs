const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const filename = resolve(__dirname, '../src/domain/commerce.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const commerce = loaded.exports;
const socle = ['STOCK_SIMPLE', 'INVENTORY', 'LOW_STOCK_ALERT'];
const techniques = [...socle, 'MULTI_UNIT', 'PRODUCT_VARIANTS', 'TECHNICAL_DIMENSIONS'];
function contrat(secteur, capabilities = socle, overrides = {}) {
  return commerce.lireProfilCommerce({
    version: 1, secteur, secteur_libelle: secteur,
    mode_vente: 'DETAIL', mode_approvisionnement: 'CLASSIQUE', mode_catalogue: 'SIMPLE',
    capabilities_effectives: capabilities, capabilities_non_supportees: [],
    ecritures_autorisees: [...commerce.TYPES_ECRITURE_COMMERCE],
    compatible: true, raison: '', ...overrides,
  });
}

test('Électricité et Électronique restent deux secteurs distincts', () => {
  const codes = commerce.SECTEURS_COMMERCE.map((s) => s.code);
  assert.ok(codes.includes('ELECTRICITE'));
  assert.ok(codes.includes('ELECTRONIQUE'));
  assert.equal(new Set(codes).size, codes.length);
});
test('le contrat Électricité accepte les capacités techniques déjà prises en charge', () => {
  const p = contrat('ELECTRICITE', techniques);
  assert.ok(p);
  assert.equal(p.secteur, 'ELECTRICITE');
  assert.equal(p.compatible, true);
  assert.equal(commerce.ecritureCommerceAutorisee(p, 'ventes'), true);
});
test('Électricité résout Références et Rayons sans vocabulaire de vêtements', () => {
  const ui = commerce.resoudreProfilUIMobile(contrat('ELECTRICITE', techniques));
  assert.equal(ui.code, 'ELECTRICITE');
  assert.equal(ui.nom, 'Électricité');
  assert.equal(ui.libelles.catalogue, 'Références');
  assert.equal(ui.libelles.categories, 'Rayons');
  assert.equal(ui.libelles.produit, 'Référence');
});
test('Commerce général a un profil explicite et conserve un catalogue simple', () => {
  const p = contrat('COMMERCE_GENERAL');
  const ui = commerce.resoudreProfilUIMobile(p);
  assert.equal(ui.nom, 'Commerce général');
  assert.equal(ui.libelles.produits, 'Produits');
  assert.equal(ui.libelles.categories, 'Catégories');
  assert.equal(p.mode_catalogue, 'SIMPLE');
  assert.equal(p.compatible, true);
});
test('le profil général ne réclame ni variantes techniques ni unités multiples', () => {
  const ui = commerce.resoudreProfilUIMobile(contrat('COMMERCE_GENERAL'));
  for (const code of ['PRODUCT_VARIANTS', 'TECHNICAL_DIMENSIONS', 'MULTI_UNIT', 'WHOLESALE']) {
    assert.equal(ui.capabilities.includes(code), false, code);
  }
});
test('les options activées du profil général sont reconnues sans mode avancé imposé', () => {
  const p = contrat('COMMERCE_GENERAL', [...socle, 'MULTI_UNIT', 'WHOLESALE'], { mode_vente: 'MIXTE' });
  const ui = commerce.resoudreProfilUIMobile(p);
  assert.equal(p.compatible, true);
  assert.equal(ui.capabilities.includes('MULTI_UNIT'), true);
  assert.equal(ui.capabilities.includes('WHOLESALE'), true);
});
test('le profil Électricité ne doit pas inventer un droit de vente en gros', () => {
  const ui = commerce.resoudreProfilUIMobile(contrat('ELECTRICITE', techniques));
  assert.equal(ui.capabilities.includes('WHOLESALE'), false);
});
test('le repli visuel est Commerce général mais ne permet aucune écriture sans licence', () => {
  const ui = commerce.resoudreProfilUIMobile(null);
  assert.equal(ui.code, 'COMMERCE_GENERAL');
  assert.equal(ui.nom, 'Commerce général');
  assert.equal(ui.capabilities.length, 0);
  assert.equal(commerce.ecritureCommerceAutorisee(null, 'ventes'), false);
});
test('un secteur inconnu ne devient pas une licence de commerce général', () => {
  assert.equal(contrat('INCONNU'), null);
});
test('les restrictions granulaires restent appliquées pour Électricité', () => {
  const p = contrat('ELECTRICITE', techniques, { ecritures_autorisees: ['clients'] });
  assert.ok(p);
  assert.equal(commerce.ecritureCommerceAutorisee(p, 'clients'), true);
  assert.equal(commerce.ecritureCommerceAutorisee(p, 'ventes'), false);
});
test('un module électrique non pris en charge conserve le signal de compatibilité partielle', () => {
  const p = contrat('ELECTRICITE', [...techniques, 'SERIAL_TRACKING']);
  assert.ok(p);
  assert.equal(p.compatible, false);
});
test('le contrat Habillement reste reconnu sans conversion de secteur', () => {
  const p = contrat('HABILLEMENT', [...socle, 'PRODUCT_VARIANTS', 'SIZE_DIMENSION', 'COLOR_DIMENSION']);
  assert.equal(p.secteur, 'HABILLEMENT');
  assert.equal(p.compatible, true);
});
