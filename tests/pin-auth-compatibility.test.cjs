const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const racine = resolve(__dirname, '..');
const auth = readFileSync(resolve(racine, 'src/services/auth.ts'), 'utf8');
const connexion = readFileSync(resolve(racine, 'app/connexion.tsx'), 'utf8');
const demarrage = readFileSync(resolve(racine, 'app/demarrage.tsx'), 'utf8');

test('PIN rule is shared and accepts the 9-digit local code used by the device', () => {
  assert.match(auth, /LONGUEUR_PIN_MIN\s*=\s*4/);
  assert.match(auth, /LONGUEUR_PIN_MAX\s*=\s*9/);
  assert.match(connexion, /LONGUEUR_PIN_MAX/);
  assert.match(demarrage, /LONGUEUR_PIN_MAX/);
  assert.doesNotMatch(connexion, /const LONGUEUR_PIN_MAX\s*=\s*6/);
  assert.doesNotMatch(demarrage, /const LONGUEUR_PIN_MAX\s*=\s*6/);
});

test('legacy clear-text PINs are upgraded after a successful login', () => {
  assert.match(auth, /stocke === pin/);
  assert.match(auth, /UPDATE utilisateur SET code_pin = \? WHERE id = \?/);
  assert.match(auth, /verifierEtModerniserPin\(l\.id, l\.code_pin, pin\)/);
});
