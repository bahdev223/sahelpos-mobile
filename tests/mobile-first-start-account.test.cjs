const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function chargerAuth() {
  const chemin = resolve(__dirname, '../src/services/auth.ts');
  const ecritures = [];
  const mutationsSync = [];
  const compte = { id: 7, id_local: 'web-owner', login: 'patron', nom: 'Patron', role: 'admin', actif: 1 };
  const imports = {
    'expo-crypto': {
      CryptoDigestAlgorithm: { SHA256: 'SHA256' },
      digestStringAsync: async (_algo, valeur) => `hash:${valeur}`,
    },
    '../db/repositories/base': {
      lirePremier: async (sql) => sql.includes('FROM utilisateur') ? compte : null,
      lireTout: async () => [],
      executer: async (sql, ...args) => { ecritures.push({ sql, args }); return { lastInsertRowId: 7 }; },
      genererIdLocal: () => 'nouveau',
      maintenant: () => '2026-09-30T12:00:00Z',
      versBooleen: Boolean,
    },
    './synchronisation': { marquerChangement: async (...args) => { mutationsSync.push(args); } },
  };
  const moduleCharge = new Module(chemin, module);
  moduleCharge.paths = Module._nodeModulePaths(resolve(__dirname, '..'));
  moduleCharge.require = (nom) => nom in imports ? imports[nom] : require(nom);
  moduleCharge._compile(ts.transpileModule(readFileSync(chemin, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, chemin);
  return { service: moduleCharge.exports, ecritures, mutationsSync };
}

test('first setup attaches a local PIN to the owner already pulled from Web', async () => {
  const { service, ecritures, mutationsSync } = chargerAuth();
  const id = await service.initialiserCompteAdministrateur({
    login: 'patron', nom: 'Patron', pin: '123456', role: 'admin',
  });
  assert.equal(id, 7);
  assert.equal(ecritures.some(({ sql }) => sql.includes('INSERT INTO utilisateur')), false);
  assert.equal(ecritures.some(({ sql, args }) => sql.includes('UPDATE utilisateur SET code_pin') && args[1] === 7), true);
  assert.deepEqual(mutationsSync, []);
});

test('a PIN-only change never enters the server sync outbox', async () => {
  const { service, mutationsSync } = chargerAuth();
  await service.modifierUtilisateur(7, { pin: '123456' });
  assert.deepEqual(mutationsSync, []);
});
