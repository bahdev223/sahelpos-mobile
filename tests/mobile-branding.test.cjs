const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const racine = resolve(__dirname, '..');

function lire(relatif) {
  return readFileSync(resolve(racine, relatif), 'utf8');
}

test('mobile app is branded SahelPOS, not Nere', () => {
  const app = JSON.parse(lire('app.json'));
  const strings = lire('android/app/src/main/res/values/strings.xml');

  assert.equal(app.expo.name, 'SahelPOS');
  assert.match(strings, /<string name="app_name">SahelPOS<\/string>/);
  assert.doesNotMatch(app.expo.name, /N[ée]r[ée]/i);
  assert.doesNotMatch(strings, /N[ée]r[ée]/i);
});

test('launcher assets come from symbol-only SahelPOS source', () => {
  const script = 'scripts/generate-brand-assets.ps1';
  assert.equal(existsSync(resolve(racine, script)), true);

  const source = lire(script);
  assert.match(source, /Draw-SahelPosSymbol/);
  assert.doesNotMatch(source, /N[ée]r[ée]/i);
  assert.doesNotMatch(source, /DrawString\([^)]*N[ée]r[ée]/i);
  assert.match(source, /Save-LauncherAssets/);

  for (const fichier of [
    'assets/icon.png',
    'assets/android-icon-foreground.png',
    'assets/android-icon-monochrome.png',
    'assets/splash-icon.png',
  ]) {
    assert.equal(existsSync(resolve(racine, fichier)), true, `${fichier} must exist`);
  }
});

test('mobile onboarding uses SahelPOS space language', () => {
  const demarrage = lire('app/demarrage.tsx');

  assert.match(demarrage, /Creer mon espace/);
  assert.match(demarrage, /Votre entreprise/);
  assert.match(demarrage, /premier point de vente/);
  assert.doesNotMatch(demarrage, /Creer ma boutique|Creer une nouvelle boutique|Parlez-nous de votre boutique/);
});
