const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');

const lire = (path) => readFileSync(resolve(__dirname, '..', path), 'utf8');
function executerTS(path, dependances = {}) {
  const compile = ts.transpileModule(lire(path), {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  const erreurs = (compile.diagnostics ?? []).filter((x) => x.category === ts.DiagnosticCategory.Error);
  assert.equal(erreurs.length, 0, erreurs.map((x) => ts.flattenDiagnosticMessageText(x.messageText, '\n')).join('\n'));
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compile.outputText)(module, module.exports, (name) => {
    if (name in dependances) return dependances[name];
    throw new Error('Dépendance inattendue pour le test: ' + name);
  });
  return module.exports;
}
const permissions = executerTS('src/domain/permissions-mobile.ts');
const navigation = executerTS('src/domain/navigation-mobile.ts',
  { './permissions-mobile': permissions });
const entries = (groups) => groups.flatMap((g) => g.entrees);

test('vendeur: ventes personnelles et clients accessibles, gestion interdite', () => {
  for (const chemin of ['/ventes', '/vente/42', '/client/42', '/habillement/commandes',
    '/habillement/commandes/42', '/(tabs)/menu']) {
    assert.equal(permissions.peutAccederCheminMobile('vendeur', chemin), true, chemin);
  }
  for (const chemin of ['/achats', '/stock/mouvements', '/factures', '/parametres/utilisateurs',
    '/habillement/rapports', '/tableau-de-bord']) {
    assert.equal(permissions.peutAccederCheminMobile('vendeur', chemin), false, chemin);
  }
  assert.equal(permissions.peutAccederCheminMobile('gerant', '/parametres/utilisateurs'), false);
  assert.equal(permissions.peutAccederCheminMobile('admin', '/parametres/utilisateurs'), true);
});
test('menus de tous les secteurs: groupes métier stables et routes uniques', () => {
  for (const secteur of ['COMMERCE_GENERAL','HABILLEMENT','CEREALES_VRAC','ELECTRICITE','QUINCAILLERIE',
    'ELECTRONIQUE','FRIPERIE','COSMETIQUE','PIECES_DETACHEES']) {
    for (const role of ['admin','gerant','vendeur']) {
      const groupes = navigation.construireNavigationMobile(secteur, role, [
        'VARIANT_EXCHANGE', 'PURCHASE_MATRIX',
      ]);
      const all = entries(groupes);
      assert.ok(all.length >= 3, secteur + ':' + role);
      assert.equal(new Set(all.map((e) => e.chemin)).size, all.length, secteur + ':' + role);
      assert.ok(all.every((e) => permissions.peutAccederCheminMobile(role, e.chemin)));
    }
  }
});
test('capabilities spéciales Habillement ne deviennent pas des permissions automatiques', () => {
  const sans = entries(navigation.construireNavigationMobile('HABILLEMENT', 'gerant', []));
  assert.ok(!sans.some((e) => e.id === 'echanges' || e.id === 'matrice'));
  const avec = entries(navigation.construireNavigationMobile('HABILLEMENT', 'gerant', ['VARIANT_EXCHANGE', 'PURCHASE_MATRIX']));
  assert.ok(avec.some((e) => e.id === 'echanges'));
  assert.ok(avec.some((e) => e.id === 'matrice'));
  const vendeur = entries(navigation.construireNavigationMobile('HABILLEMENT', 'vendeur', ['VARIANT_EXCHANGE']));
  assert.ok(!vendeur.some((e) => e.id === 'echanges'));
});
test('toutes les destinations du menu correspondent à des fichiers expo-router', () => {
  const groupes = navigation.construireNavigationMobile('HABILLEMENT', 'admin', ['VARIANT_EXCHANGE','PURCHASE_MATRIX'])
    .concat(navigation.construireNavigationMobile('CEREALES_VRAC', 'admin', []));
  for (const entree of entries(groupes)) {
    const path = entree.chemin.replace(/^\//, '');
    const candidates = [
      resolve(__dirname, '..', 'app', path + '.tsx'),
      resolve(__dirname, '..', 'app', path, 'index.tsx'),
      resolve(__dirname, '..', 'app', '(tabs)', path + '.tsx'),
    ];
    assert.ok(candidates.some((x) => existsSync(x)), 'Route inexistante: ' + entree.chemin);
  }
});
test('l’écran Menu et le tiroir consomment le même registre', () => {
  assert.match(lire('app/(tabs)/menu.tsx'), /construireNavigationMobile\(/);
  assert.match(lire('src/ui/tiroir.tsx'), /construireNavigationMobile\(/);
  assert.doesNotMatch(lire('src/ui/tiroir.tsx'), /groupe\.titre === 'Gestion'/);
  assert.match(lire('app/(tabs)/_layout.tsx'), /name="menu"/);
});
test('détail de vente vendeur: contrôle de propriété et bénéfice/annulation masqués', () => {
  assert.match(lire('app/vente/[id].tsx'), /v\.utilisateurId !== utilisateur\.id/);
  assert.match(lire('app/vente/[id].tsx'), /gestionnaire && !annulee/);
  assert.match(lire('app/(tabs)/ventes.tsx'), /utilisateur\?\.role !== 'vendeur'/);
  assert.match(lire('src/db/repositories/vente.ts'), /v\.utilisateur_id AS utilisateurId/);
});
