const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function charger(fichier) {
  const filename = path.resolve(__dirname, '..', fichier);
  const mod = new Module(filename, module);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return mod.exports;
}
const p = () => charger('src/domain/presentation-commerce.ts');
const prix = () => charger('src/domain/prix-commerce.ts');
const profil = (secteur, mode_vente = 'MIXTE', actif = true) => ({
  secteur, mode_vente, capabilities_effectives: actif ? ['WHOLESALE'] : [],
});

test('Électricité réutilise le formulaire technique, sans assimiler Électronique', () => {
  assert.equal(p().estReferenceTechnique(profil('ELECTRICITE')), true);
  assert.equal(p().estReferenceTechnique(profil('QUINCAILLERIE')), true);
  for (const code of ['ELECTRONIQUE', 'HABILLEMENT', 'COMMERCE_GENERAL']) {
    assert.equal(p().estReferenceTechnique(profil(code)), false);
  }
});
test('le tarif gros est disponible aux trois profils autorisés, jamais sans capacité', () => {
  for (const code of ['QUINCAILLERIE', 'ELECTRICITE', 'COMMERCE_GENERAL']) {
    for (const mode of ['GROS', 'MIXTE']) {
      assert.equal(p().tarifGrosDisponible(profil(code, mode)), true);
      assert.equal(p().tarifGrosDisponible(profil(code, mode, false)), false);
    }
    assert.equal(p().tarifGrosDisponible(profil(code, 'DETAIL')), false);
  }
  assert.equal(p().tarifGrosDisponible(null), false);
});
test('les routes électriques ne pointent pas vers une fiche portant le mauvais métier', () => {
  assert.deepEqual(p().routeReferenceTechnique(profil('ELECTRICITE'), 12), {
    pathname: '/electricite/reference/[id]', params: { id: '12' },
  });
  assert.equal(p().libelleReferenceTechnique(profil('ELECTRICITE')), 'Référence électrique');
  assert.equal(p().routeReferenceTechnique(profil('COMMERCE_GENERAL'), 12).pathname, '/produit/[id]');
  assert.equal(p().routeReferenceTechnique(profil('QUINCAILLERIE'), 12).pathname, '/quincaillerie/reference/[id]');
});
test('600 par mètre donne 60 000 pour un rouleau de 100 mètres de cette variante', () => {
  assert.equal(prix().prixDetailVariante(55000, 100, 600), 60000);
  assert.equal(prix().prixDetailVariante(10000, 1, 9500), 9500);
});
test('sans prix spécifique positif, le prix propre du conditionnement est conservé', () => {
  assert.equal(prix().prixDetailVariante(55000, 100, null), 55000);
  assert.equal(prix().prixDetailVariante(55000, 100, 0), 55000);
  assert.equal(prix().prixDetailVariante(55000, 100), 55000);
});
test('un facteur ou un tarif non fini ou négatif est refusé', () => {
  for (const args of [[600, 0, 500], [600, -1, 500], [NaN, 1, 500], [600, 1, -5], [600, 1, NaN]]) {
    assert.throws(() => prix().prixDetailVariante(...args));
  }
});
test('deux lignes détail et gros de la même variante ne fusionnent pas', () => {
  const article = { produit: { id: 1 }, variante: { id: 2 }, unite: 'Metre', facteur: 1, prixUnitaire: 600 };
  const cle = prix().cleArticleCommerce;
  assert.notEqual(cle(article), cle({ ...article, prixUnitaire: 500 }));
  assert.notEqual(cle(article), cle({ ...article, facteur: 100 }));
  assert.notEqual(cle(article), cle({ ...article, variante: { id: 3 } }));
  assert.equal(cle(article), cle({ ...article }));
});
