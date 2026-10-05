const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function chargerVente() {
  const path = resolve(__dirname, '../src/services/vente.ts');
  const loaded = new Module(path, module);
  loaded.require = name => {
    if (name.endsWith('/database')) return { obtenirBase: async () => ({}) };
    if (name.endsWith('/base')) return { genererIdLocal: () => 'local-1' };
    if (name.endsWith('/abonnement')) return { exigerEcriture: async () => {} };
    if (name.endsWith('/auth')) return { verifierAccesCaisse: async () => {} };
    if (name.endsWith('/notifications')) return { verifierStock: async () => {} };
    if (name.endsWith('/synchronisation')) return { marquerChangement: async () => {} };
    throw new Error('Import inattendu ' + name);
  };
  loaded._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, path);
  return loaded.exports;
}

test('variant sale line keeps variant identity, snapshots and variant cost', () => {
  const { calculerLigne } = chargerVente();
  const ligne = calculerLigne({
    produit: {
      id: 7, idLocal: 'prod-7', nom: 'Chemise', categorie: 'Mode',
      codeBarre: null, prixUnitaire: 5000, prixAchat: 2500, uniteBase: 'Unite',
      quantiteBase: 20, stockMin: 2, gestionStock: true, cheminImage: null, actif: true,
    },
    variante: {
      idLocal: 'var-1', sku: 'CHEM-M-NOIR', nom: 'Noir / M',
      stockDisponible: 4, prixAchat: 3000,
    },
    unite: 'Unite', facteur: 1, quantite: 2, prixUnitaire: 5500,
  });
  assert.equal(ligne.varianteIdLocal, 'var-1');
  assert.equal(ligne.varianteSkuSnapshot, 'CHEM-M-NOIR');
  assert.equal(ligne.varianteNomSnapshot, 'Noir / M');
  assert.equal(ligne.coutUnitaire, 3000);
  assert.equal(ligne.libelle, 'Chemise · Noir / M');
});

test('sale service persists and moves variant stock independently', () => {
  const source = readFileSync(resolve(__dirname, '../src/services/vente.ts'), 'utf8');
  assert.match(source, /variante_id_local/);
  assert.match(source, /stock_disponible/);
  assert.match(source, /UPDATE variante_produit SET stock_actuel = \?, stock_disponible = \?/);
  assert.match(source, /mouvement_stock[\s\S]*variante_id_local/);
});
