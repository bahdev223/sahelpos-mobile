const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function chargerAbonnement(options = {}) {
  const chemin = resolve(__dirname, '../src/services/abonnement/index.ts');
  const parametres = new Map([
    ['sync.boutique', 'boutique-A'],
    ['abonnement.licence', 'licence-A'],
    ['abonnement.jeton_appareil', 'jeton-A'],
  ]);
  const moduleCharge = new Module(chemin, module);
  moduleCharge.paths = Module._nodeModulePaths(resolve(__dirname, '..'));
  const imports = {
    '../../db/repositories/base': {
      lireTout: async (_sql, cle) => [{ valeur: parametres.get(cle) ?? null }],
      executer: async (_sql, cle, valeur) => { parametres.set(cle, valeur); },
    },
    '../../domain/commerce': {
      ecritureCommerceAutorisee: (commerce, type) =>
        Boolean(commerce?.ecritures_autorisees?.includes(type)),
    },
    './licence': {
      lireDroit: (licence) => ({
        boutique: licence === 'licence-B' ? 'boutique-B' : 'boutique-A',
        peutEntrer: true,
        peutEcrire: true,
        fonctionnalites: [],
        raison: '',
        commerce: {
          compatible: true,
          raison: '',
          ecritures_autorisees: ['utilisateurs','produits','clients','fournisseurs','achats','boutique','ventes','mouvements'],
        },
        ...options.droit,
      }),
      droitPerime: () => false,
      LicenceInvalide: class LicenceInvalide extends Error {},
    },
  };
  moduleCharge.require = (nom) => nom in imports ? imports[nom] : require(nom);
  moduleCharge._compile(ts.transpileModule(readFileSync(chemin, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, chemin);
  return { service: moduleCharge.exports, parametres };
}

test('a foreign licence cannot authorize local commercial writes', async () => {
  const { service, parametres } = chargerAbonnement();
  parametres.set('abonnement.licence', 'licence-B');
  await assert.rejects(() => service.exigerEcriture(), /boutique|espace/i);
});

test('a licence refresh cannot replace the licence of a linked shop', async () => {
  const { service, parametres } = chargerAbonnement();
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ licence: 'licence-B' }) });
  try {
    await assert.rejects(() => service.rafraichir(), /boutique|espace/i);
    assert.equal(parametres.get('abonnement.licence'), 'licence-A');
  } finally {
    global.fetch = originalFetch;
  }
});

test('an incompatible commerce licence keeps consultation but blocks offline writes', async () => {
  const { service } = chargerAbonnement({ droit: {
    commerce: {
      compatible: false,
      raison: 'Variantes non prises en charge sur ce mobile.',
      ecritures_autorisees: [],
    },
  } });
  const etat = await service.etatCourant();
  assert.equal(etat.active, true);
  assert.equal(etat.peutEcrire, false);
  await assert.rejects(() => service.exigerEcriture(), /Variantes/);
});

test('a legacy licence requires profile verification before writing', async () => {
  const { service } = chargerAbonnement({ droit: { commerce: null } });
  assert.equal((await service.etatCourant()).active, true);
  await assert.rejects(() => service.exigerEcriture(), /profil/i);
});

test('mobile registration sends the actual commerce profile and city', async () => {
  const { service, parametres } = chargerAbonnement();
  parametres.delete('sync.boutique');
  let payload;
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, text: async () => JSON.stringify({ licence: 'licence-A', jeton_appareil: 'A' }) };
  };
  try {
    await service.creerBoutiqueMobile({
      nomBoutique: 'Awa', nomPatron: 'Awa', login: 'awa', motDePasse: 'secret123',
      ville: 'Sikasso', secteur: 'FRIPERIE', modeVente: 'MIXTE', modeApprovisionnement: 'IMPORTATION',
    });
    assert.equal(payload.ville, 'Sikasso');
    assert.equal(payload.secteur, 'FRIPERIE');
    assert.equal(payload.mode_vente, 'MIXTE');
    assert.equal(payload.mode_approvisionnement, 'IMPORTATION');
  } finally { global.fetch = originalFetch; }
});
