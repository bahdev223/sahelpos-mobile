const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const racine = resolve(__dirname, '..');

function lire(relatif) {
  return readFileSync(resolve(racine, relatif), 'utf8');
}

test('purchases menu keeps the native header visible', () => {
  const achats = lire('app/achats/index.tsx');

  assert.match(achats, /headerShown:\s*true/);
  assert.match(achats, /title:\s*'Achats'/);
  assert.doesNotMatch(achats, /headerShown:\s*false/);
});

test('new user sheet has its own visible header and close action', () => {
  const utilisateurs = lire('app/parametres/utilisateurs.tsx');

  assert.match(utilisateurs, /Nouveau compte/);
  assert.match(utilisateurs, /Fermer le formulaire/);
  assert.match(utilisateurs, /feuilleEntete/);
});

