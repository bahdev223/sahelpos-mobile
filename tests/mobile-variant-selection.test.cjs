const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/sqlite-runtime.cjs');
const { filtrerVariantes } = load('src/domain/selection-variantes.ts');
const variant = (id, taille, couleur) => ({ id, sku: `SKU-${id}`, valeurs: [
  { dimensionCode: 'TAILLE', code: taille, nom: taille },
  { dimensionCode: 'COULEUR', code: couleur, nom: couleur },
] });
const variantes = [variant(1, 'M', 'Bleu'), variant(2, 'S', 'Bleu'), variant(3, 'M', 'Écru')];
test('variant filters intersect exact size and color codes without inventing combinations', () => {
  assert.deepEqual(filtrerVariantes(variantes, { TAILLE: 'M', COULEUR: 'Bleu' }).map(v => v.id), [1]);
  assert.deepEqual(filtrerVariantes(variantes, { TAILLE: 'S', COULEUR: 'Écru' }), []);
  assert.deepEqual(filtrerVariantes(variantes, { TAILLE: '' }, 'ecru').map(v => v.id), [3]);
});
