const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function charger(relatif) {
  const path = resolve(__dirname, '..', relatif);
  const loaded = new Module(path, module);
  loaded._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, path);
  return loaded.exports;
}
const base = {
  id: 1, idLocal: 'u-1', login: 'awa', nom: 'Awa', role: 'admin',
  actif: true, caisseOuvreA: null, caisseFermeA: null,
};

test('une retrogradation admin vers vendeur actualise la session', () => {
  const { resoudreSessionSynchronisee } = charger('src/domain/session.ts');
  const resultat = resoudreSessionSynchronisee(base, { ...base, role: 'vendeur' });
  assert.equal(resultat.type, 'ACTUALISE');
  assert.equal(resultat.utilisateur.role, 'vendeur');
});

test('un compte desactive pendant la session est ferme', () => {
  const { resoudreSessionSynchronisee } = charger('src/domain/session.ts');
  assert.deepEqual(
    resoudreSessionSynchronisee(base, { ...base, actif: false }),
    { type: 'FERME', raison: 'INACTIF' },
  );
});

test('un compte supprime localement ferme la session', () => {
  const { resoudreSessionSynchronisee } = charger('src/domain/session.ts');
  assert.deepEqual(resoudreSessionSynchronisee(base, null), { type: 'FERME', raison: 'ABSENT' });
});

test('la liste de connexion garde seulement les profils actifs sans privilegier admin', () => {
  const { comptesPourConnexion } = charger('src/domain/session.ts');
  const liste = comptesPourConnexion([
    { ...base, id: 3, idLocal: 'u3', login: 'z', nom: 'Zara', role: 'admin' },
    { ...base, id: 2, idLocal: 'u2', login: 'b', nom: 'Bintou', role: 'vendeur' },
    { ...base, id: 4, idLocal: 'u4', login: 'x', nom: 'Fatou', role: 'gerant', actif: false },
  ]);
  assert.deepEqual(liste.map((u) => u.nom), ['Bintou', 'Zara']);
});

test('vendeur ne peut pas conserver une route administration dans la pile', () => {
  const { peutAccederCheminMobile } = charger('src/domain/permissions-mobile.ts');
  assert.equal(peutAccederCheminMobile('vendeur', '/caisse'), true);
  assert.equal(peutAccederCheminMobile('vendeur', '/clients'), true);
  assert.equal(peutAccederCheminMobile('vendeur', '/achats/12'), false);
  assert.equal(peutAccederCheminMobile('vendeur', '/parametres/utilisateurs'), false);
});

test('gerant garde le metier mais pas les comptes et abonnement', () => {
  const { peutAccederCheminMobile } = charger('src/domain/permissions-mobile.ts');
  assert.equal(peutAccederCheminMobile('gerant', '/achats'), true);
  assert.equal(peutAccederCheminMobile('gerant', '/stock'), true);
  assert.equal(peutAccederCheminMobile('gerant', '/parametres/utilisateurs'), false);
  assert.equal(peutAccederCheminMobile('gerant', '/abonnement'), false);
});

test('administrateur garde toutes les routes', () => {
  const { peutAccederCheminMobile } = charger('src/domain/permissions-mobile.ts');
  assert.equal(peutAccederCheminMobile('admin', '/parametres/utilisateurs'), true);
  assert.equal(peutAccederCheminMobile('admin', '/habillement/inventaire'), true);
});
