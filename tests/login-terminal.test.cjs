const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const racine = resolve(__dirname, '..');

function lire(relatif) {
  return readFileSync(resolve(racine, relatif), 'utf8');
}

test('login mobile uses a terminal-bound account, not an account selector', () => {
  const ecran = lire('app/connexion.tsx');

  assert.match(ecran, /Connexion caisse/);
  assert.match(ecran, /Ouvrir la caisse/);
  assert.match(ecran, /authenticateAsync/);
  assert.match(ecran, /connecter\(/);

  assert.doesNotMatch(ecran, /accessibilityRole="checkbox"/);
  assert.doesNotMatch(ecran, /compteChoisi/);
  assert.doesNotMatch(ecran, /liaisonBiometrie/);
  assert.doesNotMatch(ecran, /Entrer avec/);
  assert.doesNotMatch(ecran, /Choisissez votre nom/);
});

