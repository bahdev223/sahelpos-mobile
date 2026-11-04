const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/sqlite-runtime.cjs');
const { contracts } = require('./fixtures/server-commerce-20261104.json');
const commerce = load('src/domain/commerce.ts');
const { writeAllowed } = load('src/domain/accounts.ts');
const permissions = load('src/domain/permissions-mobile.ts');
const navigation = load('src/domain/navigation-mobile.ts', { './permissions-mobile': permissions });

for (const { scenario, contract } of contracts) {
  test(`server contract parity: ${scenario}`, () => {
    const local = commerce.lireProfilCommerce(contract);
    assert.ok(local);
    assert.equal(local.compatible, contract.compatible);
    assert.deepEqual(local.ecritures_autorisees, contract.ecritures_autorisees);
    assert.ok(commerce.resoudreProfilUIMobile(local).capabilities.every(cap => contract.capabilities_effectives.includes(cap)));
    if (contract.capabilities_non_supportees.length || (contract.mode_catalogue === 'ADVANCED' && contract.secteur === 'FRIPERIE')) {
      assert.equal(commerce.ecritureCommerceAutorisee(local, 'ventes'), false);
    }
  });
}
for (const { code } of commerce.SECTEURS_COMMERCE) for (const [role, localRole] of [['patron','admin'],['gerant','gerant'],['vendeur','vendeur']]) {
  test(`${code}: navigation and write scope for ${role}`, () => {
    const contract = commerce.lireProfilCommerce(contracts.find(x => x.scenario === code).contract);
    const entries = navigation.construireNavigationMobile(code, localRole, contract.capabilities_effectives).flatMap(g => g.entrees);
    assert.equal(new Set(entries.map(e => e.chemin)).size, entries.length);
    assert.ok(entries.every(e => permissions.peutAccederCheminMobile(localRole, e.chemin)));
    const writes = contract.ecritures_autorisees.filter(type => writeAllowed(role, type));
    assert.ok(writes.includes('ventes') && writes.includes('clients'));
    if (role === 'vendeur') assert.deepEqual(writes, ['clients','ventes']);
    else assert.ok(writes.includes('achats') && writes.includes('mouvements'));
    assert.equal(writes.includes('boutique'), role === 'patron');
  });
}
