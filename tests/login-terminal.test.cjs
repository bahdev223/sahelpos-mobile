const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const racine = resolve(__dirname, '..');
const lire = (relatif) => readFileSync(resolve(racine, relatif), 'utf8');

test('login mobile supports multiple local profiles with isolated PIN and biometrics', () => {
  const ecran = lire('app/connexion.tsx');

  assert.match(ecran, /Connexion multi-profils/);
  assert.match(ecran, /Choisir un profil/);
  assert.match(ecran, /Ouvrir ce profil/);
  assert.match(ecran, /listerComptesConnexion/);
  assert.match(ecran, /authenticateAsync/);
  assert.match(ecran, /connecter\(compte\.login, pin\)/);
  assert.match(ecran, /biometrieUtilisateurId !== compte\.id/);
  assert.doesNotMatch(ecran, /accessibilityRole="checkbox"/);
});
