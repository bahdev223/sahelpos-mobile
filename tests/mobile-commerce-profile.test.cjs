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
  ecritures_autorisees: ['utilisateurs', 'produits', 'clients', 'fournisseurs', 'achats', 'boutique', 'ventes', 'mouvements'],
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
  const { lireProfilCommerce, ecritureCommerceAutorisee } = charger();
  const profil = lireProfilCommerce(contrat);
  assert.equal(profil.compatible, true);
  assert.equal(profil.secteur, 'ELECTRONIQUE');
  assert.equal(ecritureCommerceAutorisee(profil, 'ventes'), true);
  assert.equal(ecritureCommerceAutorisee(profil, 'produits'), true);
});

test('advanced profile keeps safe mobile writes without flattening its catalogue', () => {
  const { lireProfilCommerce, ecritureCommerceAutorisee } = charger();
  const profil = lireProfilCommerce({
    ...contrat,
    mode_catalogue: 'ADVANCED',
    capabilities_non_supportees: ['PRODUCT_VARIANTS'],
    ecritures_autorisees: ['utilisateurs', 'clients', 'fournisseurs', 'boutique'],
    compatible: false,
    raison: 'Mode mobile partiel.',
  });
  assert.equal(profil.compatible, false);
  assert.equal(ecritureCommerceAutorisee(profil, 'clients'), true);
  assert.equal(ecritureCommerceAutorisee(profil, 'fournisseurs'), true);
  assert.equal(ecritureCommerceAutorisee(profil, 'produits'), false);
  assert.equal(ecritureCommerceAutorisee(profil, 'ventes'), false);
});

test('old signed incompatible licence is migrated to safe core writes', () => {
  const { lireProfilCommerce, ecritureCommerceAutorisee } = charger();
  const { ecritures_autorisees, ...ancienContrat } = {
    ...contrat,
    mode_catalogue: 'ADVANCED',
    compatible: false,
  };
  const profil = lireProfilCommerce(ancienContrat);
  assert.equal(ecritureCommerceAutorisee(profil, 'clients'), true);
  assert.equal(ecritureCommerceAutorisee(profil, 'boutique'), true);
  assert.equal(ecritureCommerceAutorisee(profil, 'produits'), false);
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
