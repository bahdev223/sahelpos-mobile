const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const racine = resolve(__dirname, '..');

function lire(relatif) {
  return readFileSync(resolve(racine, relatif), 'utf8');
}

test('mobile checkout lets seller override the unit price before adding to cart', () => {
  const caisse = lire('app/(tabs)/caisse.tsx');

  assert.match(caisse, /prixTexte/);
  assert.match(caisse, /setPrixTexte/);
  assert.match(caisse, /label="Prix unitaire"/);
  assert.match(caisse, /prix:\s*prixUnitaire/);
  assert.match(
    caisse,
    /onAjouter\(\s*produit,\s*\{\s*\.\.\.unite,\s*prix:\s*prixUnitaire\s*\},\s*quantite,\s*variante,?\s*\)/s,
  );
});

