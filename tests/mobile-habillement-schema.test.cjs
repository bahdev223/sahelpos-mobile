const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const schema = readFileSync(resolve(__dirname, '../src/db/schema.ts'), 'utf8');

test('schema version 10 introduces habillement variant foundations', () => {
  assert.match(schema, /export const SCHEMA_VERSION = 10/);

  for (const table of [
    'hab_schema_taille',
    'hab_valeur_schema_taille',
    'hab_categorie_mode',
    'hab_couleur_mode',
    'hab_marque',
    'hab_saison',
    'hab_collection',
    'hab_produit',
    'dimension_variante',
    'valeur_dimension',
    'variante_produit',
    'variante_valeur',
  ]) {
    assert.match(schema, new RegExp('CREATE TABLE IF NOT EXISTS ' + table));
  }
});

test('variant schema preserves identities and product ownership', () => {
  assert.match(schema, /hab_produit[\s\S]*produit_id[\s\S]*REFERENCES produit\(id\)/);
  assert.match(schema, /variante_produit[\s\S]*produit_id[\s\S]*REFERENCES produit\(id\)/);

  for (const column of [
    'id_local',
    'sku',
    'signature_combinaison',
    'prix_override',
    'prix_achat',
    'code_barre',
    'actif',
    'date_modification',
    'supprime_le',
  ]) {
    assert.match(schema, new RegExp('variante_produit[\\s\\S]*' + column));
  }

  assert.match(schema, /UNIQUE\s*\(variante_id,\s*valeur_id\)/);
});

test('dimension identity prevents merging taille 38 with pointure 38', () => {
  assert.match(schema, /dimension_variante[\s\S]*code[\s\S]*UNIQUE/);
  assert.match(schema, /valeur_dimension[\s\S]*dimension_id[\s\S]*code/);
  assert.match(schema, /UNIQUE\s*\(dimension_id,\s*code\)/);
});
