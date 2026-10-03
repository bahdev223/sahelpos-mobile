const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');

const fichiers = [
  'app/(tabs)/caisse.tsx',
  'app/(tabs)/catalogue.tsx',
  'app/(tabs)/stock.tsx',
  'app/habillement/modele/[id].tsx',
  'app/habillement/modele/nouveau.tsx',
  'app/habillement/variantes/[id].tsx',
  'app/habillement/referentiel.tsx',
  'app/habillement/inventaire.tsx',
  'app/habillement/echanges.tsx',
  'src/domain/commerce.ts',
  'src/db/repositories/variante.ts',
  'src/profile-ui/habillement/CatalogueHabillement.tsx',
  'src/profile-ui/habillement/StockHabillement.tsx',
  'src/services/vente.ts',
  'src/services/achat.ts',
  'src/services/echange.ts',
  'src/services/synchronisation.ts',
  'src/ui/tiroir.tsx',
];

test('habillement mobile files are syntactically valid TypeScript/TSX', () => {
  for (const relatif of fichiers) {
    const chemin = resolve(__dirname, '..', relatif);
    const source = readFileSync(chemin, 'utf8');
    const resultat = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: chemin,
      reportDiagnostics: true,
    });
    const erreurs = (resultat.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    assert.equal(
      erreurs.length,
      0,
      `${relatif}: ${erreurs.map((e) => ts.flattenDiagnosticMessageText(e.messageText, '\n')).join(' | ')}`,
    );
  }
});

test('offline schema contains variant, reference and exchange structures', () => {
  const schema = readFileSync(resolve(__dirname, '../src/db/schema.ts'), 'utf8');
  for (const attendu of [
    'variante_produit',
    'variante_valeur',
    'dimension_variante_ref',
    'valeur_dimension_ref',
    'ligne_serveur_id',
    'echange_variante',
  ]) {
    assert.match(schema, new RegExp(attendu));
  }
});

test('commerce resolver exposes habillement labels and capabilities', () => {
  const commerce = readFileSync(resolve(__dirname, '../src/domain/commerce.ts'), 'utf8');
  for (const attendu of [
    'PRODUCT_VARIANTS',
    'SIZE_DIMENSION',
    'COLOR_DIMENSION',
    'VARIANT_EXCHANGE',
    "catalogue: 'Modeles'",
    "categories: 'Collections'",
  ]) {
    assert.ok(commerce.includes(attendu), attendu);
  }
});

test('checkout, purchases and inventory carry variant identity', () => {
  const vente = readFileSync(resolve(__dirname, '../src/services/vente.ts'), 'utf8');
  const achat = readFileSync(resolve(__dirname, '../src/services/achat.ts'), 'utf8');
  const sync = readFileSync(resolve(__dirname, '../src/services/synchronisation.ts'), 'utf8');
  assert.ok(vente.includes('variante_id'));
  assert.ok(achat.includes('variante_id'));
  assert.ok(sync.includes('variante_id_local'));
  assert.ok(sync.includes('ligne_serveur_id'));
  assert.ok(sync.includes("ids('echange')"));
});
