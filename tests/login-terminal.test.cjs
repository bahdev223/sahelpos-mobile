const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const racine = resolve(__dirname, '..');
const lire = (relatif) => readFileSync(resolve(racine, relatif), 'utf8');

test('login mobile exposes explicit local profiles and requires the selected profile PIN', () => {
  const ecran = lire('app/connexion.tsx');

  assert.match(ecran, /Choisir un profil/);
  assert.match(ecran, /listerComptesConnexion/);
  assert.match(ecran, /selectionner/);
  assert.match(ecran, /connecter\(compte\.login, pin\)/);
  assert.match(ecran, /authenticateAsync/);
  assert.match(ecran, /biometrieUtilisateurId\s*!==\s*compte\.id/);
  assert.match(ecran, /promptMessage:\s*`Ouvrir le profil \$\{compte\.nom \|\| compte\.login\}`/);
  assert.doesNotMatch(ecran, /connecter automatiquement/i);
});
