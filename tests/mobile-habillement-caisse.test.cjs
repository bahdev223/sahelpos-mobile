const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function charger() {
  const path = resolve(__dirname, '../src/services/caisseHabillement.ts');
  const loaded = new Module(path, module);
  loaded._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, path);
  return loaded.exports;
}

const produit = {
  id: 10, idLocal: 'prod-10', nom: 'Chemise', categorie: 'Mode', codeBarre: null,
  prixUnitaire: 5000, prixAchat: 2500, uniteBase: 'Unite', quantiteBase: 8,
  stockMin: 2, gestionStock: true, cheminImage: null, actif: true,
};
const variante = {
  id: 1, idLocal: 'var-1', produitId: 10, sku: 'CHEM-M-NOIR',
  signatureCombinaison: '1-2', prixOverride: 5500, prixAchat: 3000,
  codeBarre: null, actif: true, stockActuel: 4, stockDisponible: 3,
  valeurs: [
    { idLocal:'c-noir', dimensionIdLocal:'d-c', dimensionCode:'COULEUR', dimensionNom:'Couleur', code:'NOIR', nom:'Noir', ordre:1, codeHex:'#000000' },
    { idLocal:'t-m', dimensionIdLocal:'d-t', dimensionCode:'TAILLE', dimensionNom:'Taille', code:'M', nom:'M', ordre:2, codeHex:null },
  ],
};

test('variant description extracts color and size', () => {
  const { decrireVariante } = charger();
  assert.deepEqual(decrireVariante(variante), {
    couleur: 'Noir',
    couleurHex: '#000000',
    taille: 'M',
  });
});

test('adding a variant to cart preserves identity and enforces available stock', () => {
  const { ajouterVariantePanier } = charger();
  const modele = { produit, variantes:[variante], stockTotal:4, stockDisponible:3, tailles:['M'], couleurs:[{nom:'Noir',codeHex:'#000000'}] };
  const first = ajouterVariantePanier([], modele, variante, 2);
  assert.equal(first.ok, true);
  assert.equal(first.panier[0].variante.idLocal, 'var-1');
  assert.equal(first.panier[0].prixUnitaire, 5500);
  const second = ajouterVariantePanier(first.panier, modele, variante, 2);
  assert.equal(second.ok, false);
  assert.match(second.erreur, /Stock insuffisant/);
});
