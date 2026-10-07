const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const racine = resolve(__dirname, '..');
const lire = (relatif) => readFileSync(resolve(racine, relatif), 'utf8');

test('Android login exposes Google and invitation QR without replacing offline PIN', () => {
  const demarrage = lire('app/demarrage.tsx');
  const scanner = lire('src/ui/QrInvitationScanner.tsx');

  assert.match(demarrage, /Continuer avec Google/);
  assert.match(demarrage, /Scanner un QR code/);
  assert.match(demarrage, /traiterRetourSahelTech/);
  assert.match(demarrage, /utilisateurProvisionne/);
  assert.match(demarrage, /modifierUtilisateur\(utilisateurId, \{ pin \}\)/);
  assert.match(scanner, /barcodeTypes: \['qr'\]/);
  assert.match(scanner, /facing="back"/);
});

test('SSO handoff preserves exact membership and supports silent first signup', () => {
  const abonnement = lire('src/services/abonnement/index.ts');

  assert.match(abonnement, /membreIdLocal/);
  assert.match(abonnement, /member/);
  assert.match(abonnement, /type: 'setup'/);
  assert.match(abonnement, /\/api\/public\/sso\/native-setup\//);
  assert.match(abonnement, /mode_catalogue: 'SIMPLE'/);
});

test('mobile source version is SahelPOS 1.3.0', () => {
  const app = JSON.parse(lire('app.json'));
  const pkg = JSON.parse(lire('package.json'));
  const lock = JSON.parse(lire('package-lock.json'));

  assert.equal(app.expo.version, '1.3.0');
  assert.equal(app.expo.android.versionCode, 9);
  assert.equal(pkg.version, '1.3.0');
  assert.equal(lock.version, '1.3.0');
  assert.equal(lock.packages[''].version, '1.3.0');
});
