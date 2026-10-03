const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function chargerVente() {
  const chemin = resolve(__dirname, '../src/services/vente.ts');
  const ecritures = [];
  const db = {
    withTransactionAsync: async (operation) => operation(),
    getFirstAsync: async (sql) => sql.includes('COUNT(*)')
      ? { n: 0 }
      : { nom: 'Riz', quantite_base: 5, gestion_stock: 1 },
    runAsync: async (sql, ...args) => {
      ecritures.push({ sql, args });
      return { lastInsertRowId: 1 };
    },
  };
  const imports = {
    '../db/database': { obtenirBase: async () => db },
    '../db/repositories/base': { genererIdLocal: () => 'vente-1' },
    './abonnement': { exigerEcriture: async () => {} },
    './auth': { verifierAccesCaisse: async () => {} },
    './notifications': { verifierStock: async () => {} },
    './synchronisation': { marquerChangement: async () => {} },
  };
  const charge = new Module(chemin, module);
  charge.paths = Module._nodeModulePaths(resolve(__dirname, '..'));
  charge.require = (nom) => nom in imports ? imports[nom] : require(nom);
  charge._compile(ts.transpileModule(readFileSync(chemin, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, chemin);
  return { enregistrerVente: charge.exports.enregistrerVente, ecritures };
}

const produit = {
  id: 1, nom: 'Riz', prixAchat: 50, gestionStock: true,
};
const article = (quantite) => ({ produit, unite: 'Unite', facteur: 1, quantite, prixUnitaire: 100 });
const demande = (articles, montantPaye, clientId = 1) => ({
  articles, montantPaye, clientId, modePaiement: 'especes', utilisateurId: 1,
});

test('combined quantity of the same product cannot exceed available stock', async () => {
  const { enregistrerVente, ecritures } = chargerVente();
  await assert.rejects(() => enregistrerVente(demande([article(3), article(3)], 600)), /stock insuffisant/i);
  assert.equal(ecritures.length, 0);
});

test('invalid quantity and overpayment cannot become a sale', async () => {
  const { enregistrerVente, ecritures } = chargerVente();
  await assert.rejects(() => enregistrerVente(demande([article(-1)], 0)), /quantit/i);
  await assert.rejects(() => enregistrerVente(demande([article(1)], 200)), /montant|total/i);
  assert.equal(ecritures.length, 0);
});

test('a deferred payment requires an identified client', async () => {
  const { enregistrerVente, ecritures } = chargerVente();
  await assert.rejects(() => enregistrerVente(demande([article(1)], 0, null)), /client/i);
  assert.equal(ecritures.length, 0);
});

test('a valid sale and a partial payment with a client remain accepted', async () => {
  for (const montantPaye of [100, 50]) {
    const { enregistrerVente, ecritures } = chargerVente();
    const resultat = await enregistrerVente(demande([article(1)], montantPaye));
    assert.equal(resultat.total, 100);
    assert.equal(ecritures.filter(({ sql }) => sql.includes('INSERT INTO vente ')).length, 1);
  }
});
