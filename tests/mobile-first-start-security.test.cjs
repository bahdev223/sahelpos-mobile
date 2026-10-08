const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const racine = resolve(__dirname, '..');

function lire(relatif) {
  return readFileSync(resolve(racine, relatif), 'utf8');
}

test('first mobile setup stores the local PIN through the auth service', () => {
  const demarrage = lire('app/demarrage.tsx');

  assert.match(demarrage, /finaliserConnexionMobile/);
  assert.match(demarrage, /pin:\s*pin/);
  assert.doesNotMatch(demarrage, /INSERT INTO utilisateur[\s\S]*code_pin[\s\S]*pin,/);
});

test('first mobile setup offers Android biometric binding after PIN creation', () => {
  const demarrage = lire('app/demarrage.tsx');

  assert.match(demarrage, /expo-local-authentication/);
  assert.match(demarrage, /hasHardwareAsync/);
  assert.match(demarrage, /isEnrolledAsync/);
  assert.match(demarrage, /authenticateAsync/);
  assert.match(demarrage, /CLES_PARAMETRES\.biometrieUtilisateur/);
});
