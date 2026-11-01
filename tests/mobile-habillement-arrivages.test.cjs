const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');

test('arrival offline schema is version 17 with durable child identities', () => {
  const schema = readFileSync(resolve(__dirname, '../src/db/schema.ts'), 'utf8');
  assert.match(schema, /SCHEMA_VERSION = 17/);
  for (const table of ['arrivage', 'ligne_arrivage', 'frais_arrivage', 'arrivage_achat']) {
    assert.match(schema, new RegExp('CREATE TABLE IF NOT EXISTS ' + table));
  }
  assert.match(schema, /ligne_arrivage[\s\S]*id_local[\s\S]*UNIQUE/);
  assert.match(schema, /frais_arrivage[\s\S]*id_local[\s\S]*UNIQUE/);
  assert.match(schema, /ALTER TABLE achat ADD COLUMN serveur_id INTEGER/);
});

test('arrival service covers full offline lifecycle', () => {
  const source = readFileSync(resolve(__dirname, '../src/services/arrivage.ts'), 'utf8');
  for (const fn of [
    'creerArrivage',
    'passerArrivageEnTransit',
    'demarrerReceptionArrivage',
    'enregistrerComptageArrivage',
    'validerReceptionArrivage',
    'annulerArrivage',
    'ajouterFraisArrivage',
  ]) assert.match(source, new RegExp('export async function ' + fn));
  assert.match(source, /marquerChangement\('arrivage'/);
  assert.match(source, /UPDATE achat[\s\S]*statut = 'RECU'/);
  assert.match(source, /fraisApprocheAlloues|frais_approche_alloues/);
  assert.match(source, /INSERT INTO mouvement_stock/);
  assert.match(source, /source_operation[\s\S]*'ACHAT'/);
});

test('arrival synchronization uses protocol 7 and carries arrivals', () => {
  const source = readFileSync(resolve(__dirname, '../src/services/synchronisation.ts'), 'utf8');
  assert.match(source, /VERSION_PROTOCOLE = '7'/);
  assert.match(source, /type TypeObjet =[\s\S]*'arrivage'/);
  assert.match(source, /arrivages:/);
  assert.match(source, /pull\.arrivages/);
});

test('arrival screens are dedicated pages and valid TSX', () => {
  for (const relatif of [
    'app/habillement/arrivages/index.tsx',
    'app/habillement/arrivages/nouveau.tsx',
    'app/habillement/arrivages/[id].tsx',
    'app/habillement/arrivages/reception/[id].tsx',
    'app/habillement/lots.tsx',
    'app/habillement/rapports.tsx',
  ]) {
    const chemin = resolve(__dirname, '..', relatif);
    assert.equal(existsSync(chemin), true, relatif);
    const resultat = ts.transpileModule(readFileSync(chemin, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      fileName: chemin,
      reportDiagnostics: true,
    });
    const erreurs = (resultat.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
    assert.equal(erreurs.length, 0, relatif);
  }
});
