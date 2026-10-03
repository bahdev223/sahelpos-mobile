const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes } = require('node:crypto');

function load(relative, overrides = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  cache.set(filename, loaded);
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('.')) {
      const target = path.resolve(path.dirname(filename), name) + '.ts';
      return load(path.relative(path.resolve(__dirname, '..'), target), overrides, cache);
    }
    return require(name);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}

const dimension = (code, id, count, offset = 0) => ({ code, nom: code, ordre: id,
  valeurs: Array.from({ length: count }, (_, i) => ({ valeurServeurId: offset + i + 1,
    dimensionId: id, dimensionCode: code, dimensionNom: code, dimensionOrdre: id,
    code: `${code}-${i}`, nom: `${code} ${i}`, codeHex: null, ordre: i })) });
const refs = [dimension('TAILLE', 1, 2), dimension('COULEUR', 2, 2, 100)];
const ids = refs.flatMap((d) => d.valeurs.map((v) => v.valeurServeurId));

function domaine() { return load('src/domain/matrice-habillement.ts'); }

test('la matrice utilise les vraies valeurs et produit chaque combinaison une seule fois', () => {
  const { preparerMatrice } = domaine();
  const matrix = preparerMatrice(refs, [...ids, ids[0]]);
  assert.equal(matrix.length, 4);
  assert.equal(new Set(matrix.map((c) => c.signature)).size, 4);
  assert.deepEqual(matrix[0].valeurs.map((v) => v.valeurServeurId), [1, 101]);
});
test('l ordre du référentiel et la sélection ne changent pas les identités', () => {
  const { preparerMatrice } = domaine();
  assert.deepEqual(preparerMatrice([...refs].reverse(), [...ids].reverse()), preparerMatrice(refs, ids));
});
test('une valeur supprimée du référentiel est refusée', () => {
  assert.throws(() => domaine().preparerMatrice(refs, [...ids, 999]), /référentiel/i);
});
test('240 combinaisons sont acceptées et 241 sont refusées avant génération', () => {
  const { preparerMatrice } = domaine();
  const r240 = [dimension('TAILLE', 1, 240)];
  assert.equal(preparerMatrice(r240, r240[0].valeurs.map((v) => v.valeurServeurId)).length, 240);
  const r241 = [dimension('TAILLE', 1, 241)];
  assert.throws(() => preparerMatrice(r241, r241[0].valeurs.map((v) => v.valeurServeurId)), /240/);
});
test('une référence vide ne crée pas silencieusement une variante unique', () => {
  assert.throws(() => domaine().preparerMatrice([], []), /choisissez|synchronis/i);
  assert.equal(domaine().preparerMatrice([], [], true).length, 1);
});
test('les couleurs non valides ne sont pas injectées dans les styles natifs', () => {
  assert.equal(domaine().couleurValide('#aAbB09'), '#aAbB09');
  for (const val of ['red', 'transparent', '#GG0000', '#fff', null]) assert.equal(domaine().couleurValide(val), null);
});

function fixture({ blocked = false, role = 'gerant', profile = 'HABILLEMENT' } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE utilisateur (id INTEGER PRIMARY KEY, role TEXT, actif INTEGER);
    INSERT INTO utilisateur VALUES (1, '${role}', 1);
    CREATE TABLE produit (id INTEGER PRIMARY KEY AUTOINCREMENT, id_local TEXT UNIQUE NOT NULL, nom TEXT NOT NULL,
      categorie TEXT, code_barre TEXT UNIQUE, prix_unitaire REAL DEFAULT 0, prix_achat REAL DEFAULT 0,
      unite_base TEXT DEFAULT 'Unite', quantite_base REAL DEFAULT 0, stock_min REAL DEFAULT 0,
      gestion_stock INTEGER DEFAULT 1, chemin_image TEXT, actif INTEGER DEFAULT 1,
      date_creation TEXT, date_modification TEXT);
    CREATE TABLE variante_produit (id INTEGER PRIMARY KEY AUTOINCREMENT, id_local TEXT UNIQUE NOT NULL,
      produit_id INTEGER NOT NULL REFERENCES produit(id), sku TEXT NOT NULL, code_barre TEXT,
      prix_override REAL, prix_achat REAL, stock_actuel REAL DEFAULT 0, actif INTEGER DEFAULT 1,
      date_creation TEXT, date_modification TEXT);
    CREATE TABLE variante_valeur (id INTEGER PRIMARY KEY, variante_id INTEGER REFERENCES variante_produit(id),
      valeur_serveur_id INTEGER, dimension_id INTEGER, dimension_code TEXT, dimension_nom TEXT,
      dimension_ordre INTEGER, valeur_code TEXT, valeur_nom TEXT, code_hex TEXT, valeur_ordre INTEGER,
      UNIQUE(variante_id, dimension_code));
    CREATE TABLE dimension_variante_ref (id_serveur INTEGER PRIMARY KEY, code TEXT, nom TEXT, ordre INTEGER);
    CREATE TABLE valeur_dimension_ref (id_serveur INTEGER PRIMARY KEY, dimension_id_serveur INTEGER,
      code TEXT, nom TEXT, code_hex TEXT, ordre INTEGER);
    CREATE TABLE sync_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, type_objet TEXT, id_local TEXT,
      operation TEXT DEFAULT 'upsert', date_creation TEXT, statut TEXT DEFAULT 'PENDING', derniere_erreur TEXT,
      UNIQUE(type_objet,id_local));`);
  for (const ref of refs) {
    sqlite.prepare('INSERT INTO dimension_variante_ref VALUES (?,?,?,?)').run(ref.ordre, ref.code, ref.nom, ref.ordre);
    for (const v of ref.valeurs) sqlite.prepare('INSERT INTO valeur_dimension_ref VALUES (?,?,?,?,?,?)')
      .run(v.valeurServeurId, v.dimensionId, v.code, v.nom, v.codeHex, v.ordre);
  }
  const tx = {
    getFirstAsync: async (sql, ...params) => sqlite.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) => sqlite.prepare(sql).all(...params),
    runAsync: async (sql, ...params) => {
      const r = sqlite.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
  };
  const native = { ...tx, withExclusiveTransactionAsync: async (fn) => {
    sqlite.exec('BEGIN IMMEDIATE');
    try { await fn(tx); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  }};
  const service = load('src/services/modeles-habillement.ts', {
    '../db/database': { obtenirBase: async () => native },
    '../db/repositories/base': { genererIdLocal: () => randomBytes(16).toString('hex') },
    './abonnement': { exigerEcriture: async () => { if (blocked) throw new Error('Licence fermée'); },
      etatCourant: async () => ({ droit: { commerce: { secteur: profile,
        capabilities_effectives: ['PRODUCT_VARIANTS'] } } }) },
  });
  const input = { idLocal: randomBytes(16).toString('hex'), nom: 'Chemise Oxford', categorie: 'Chemises',
    prixUnitaire: 8000, prixAchat: 4500, codeBarre: '', stockMin: 10, cheminImage: null, valeursIds: ids };
  const count = (name) => sqlite.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n;
  return { sqlite, service, input, count, native };
}

test('création atomique du modèle, des variantes et de l outbox', async () => {
  const f = fixture();
  const saved = await f.service.enregistrerModeleHabillement(f.input, 1);
  assert.ok(saved.id > 0);
  assert.equal(f.count('produit'), 1); assert.equal(f.count('variante_produit'), 4);
  assert.equal(f.count('variante_valeur'), 8); assert.equal(f.count('sync_outbox'), 5);
  assert.equal(f.sqlite.prepare('SELECT quantite_base FROM produit').get().quantite_base, 0);
});
test('rejouer la même sauvegarde ne crée ni modèle ni variante supplémentaire', async () => {
  const f = fixture();
  const a = await f.service.enregistrerModeleHabillement(f.input, 1);
  const b = await f.service.enregistrerModeleHabillement(f.input, 1);
  assert.equal(a.id, b.id); assert.equal(f.count('produit'), 1); assert.equal(f.count('variante_produit'), 4);
});
test('un refus licence, rôle, profil ou utilisateur inactif ne laisse aucune écriture', async () => {
  for (const options of [{ blocked: true }, { role: 'vendeur' }, { profile: 'ALIMENTATION' }, {}]) {
    const f = fixture(options);
    if (!Object.keys(options).length) f.sqlite.exec('UPDATE utilisateur SET actif=0');
    await assert.rejects(f.service.enregistrerModeleHabillement(f.input, 1));
    assert.equal(f.count('produit'), 0); assert.equal(f.count('sync_outbox'), 0);
  }
});
test('une matrice invalide ne laisse pas le modèle intermédiaire en base', async () => {
  const f = fixture();
  await assert.rejects(f.service.enregistrerModeleHabillement({ ...f.input, valeursIds: [999] }, 1));
  assert.equal(f.count('produit'), 0); assert.equal(f.count('sync_outbox'), 0);
});
test('une panne après insertion du modèle annule également variantes et outbox', async () => {
  const f = fixture();
  f.sqlite.exec("CREATE TRIGGER refuse_variant BEFORE INSERT ON variante_produit BEGIN SELECT RAISE(ABORT, 'stockage indisponible'); END;");
  await assert.rejects(f.service.enregistrerModeleHabillement(f.input, 1), /stockage/);
  assert.equal(f.count('produit'), 0); assert.equal(f.count('sync_outbox'), 0);
});
test('édition : conserver stock, variantes, prix spécifiques et identités', async () => {
  const f = fixture();
  const first = await f.service.enregistrerModeleHabillement(f.input, 1);
  f.sqlite.exec('UPDATE produit SET quantite_base=12; UPDATE variante_produit SET stock_actuel=3,prix_override=9000');
  const before = f.sqlite.prepare('SELECT * FROM variante_produit ORDER BY id').all();
  const edited = await f.service.enregistrerModeleHabillement({ ...f.input, id: first.id,
    dateModification: first.dateModification, nom: 'Chemise Oxford premium', valeursIds: [] }, 1);
  assert.equal(edited.id, first.id);
  assert.equal(f.sqlite.prepare('SELECT quantite_base FROM produit').get().quantite_base, 12);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM variante_produit ORDER BY id').all(), before);
});
test('une édition obsolète ne remplace pas une modification plus récente', async () => {
  const f = fixture(); const first = await f.service.enregistrerModeleHabillement(f.input, 1);
  f.sqlite.prepare('UPDATE produit SET date_modification=?,nom=?').run('2099-01-01T00:00:00Z','Modification Web');
  await assert.rejects(f.service.enregistrerModeleHabillement({ ...f.input, id: first.id,
    dateModification: first.dateModification, valeursIds: [] }, 1), /modifi|recharg/i);
  assert.equal(f.sqlite.prepare('SELECT nom FROM produit').get().nom, 'Modification Web');
});
test('deux modèles homonymes n utilisent pas les mêmes SKU', async () => {
  const f = fixture(); await f.service.enregistrerModeleHabillement(f.input, 1);
  await f.service.enregistrerModeleHabillement({ ...f.input, idLocal: randomBytes(16).toString('hex') }, 1);
  const rows = f.sqlite.prepare('SELECT sku FROM variante_produit').all();
  assert.equal(rows.length, 8); assert.equal(new Set(rows.map((v) => v.sku)).size, 8);
});
test('les données monétaires non finies ou négatives sont refusées sans écriture', async () => {
  for (const prixUnitaire of [NaN, Infinity, -1]) {
    const f = fixture(); await assert.rejects(f.service.enregistrerModeleHabillement({ ...f.input, prixUnitaire }, 1));
    assert.equal(f.count('produit'), 0);
  }
});


test('ajouter une matrice existante ne réactive pas les variantes désactivées', async () => {
  const f = fixture(); const saved = await f.service.enregistrerModeleHabillement(f.input, 1);
  f.sqlite.exec('UPDATE variante_produit SET actif=0 WHERE id=1');
  const n = await f.service.ajouterVariantesHabillement(saved.id, ids, 1);
  assert.equal(n, 0); assert.equal(f.count('variante_produit'), 4);
  assert.equal(f.sqlite.prepare('SELECT actif FROM variante_produit WHERE id=1').get().actif, 0);
});
test('la désactivation est atomique et ne supprime ni stock ni variante', async () => {
  const f = fixture(); await f.service.enregistrerModeleHabillement(f.input, 1);
  f.sqlite.exec('UPDATE variante_produit SET stock_actuel=3 WHERE id=1; DELETE FROM sync_outbox');
  await f.service.changerEtatVarianteHabillement(1, false, 1);
  assert.equal(f.sqlite.prepare('SELECT actif FROM variante_produit WHERE id=1').get().actif, 0);
  assert.equal(f.sqlite.prepare('SELECT stock_actuel FROM variante_produit WHERE id=1').get().stock_actuel, 3);
  assert.equal(f.count('variante_produit'), 4); assert.equal(f.count('sync_outbox'), 1);
});
test('le prix nul spécifique retombe sur le prix du modèle comme dans Django', () => {
  const prix = domaine().prixVarianteOuModele;
  assert.equal(prix(0, 8000), 8000); assert.equal(prix(null, 8000), 8000);
  assert.equal(prix(9500, 8000), 9500);
});
test('le catalogue ne multiplie pas le stock par le nombre de dimensions', async () => {
  const f = fixture(); await f.service.enregistrerModeleHabillement(f.input, 1);
  f.sqlite.exec('UPDATE variante_produit SET stock_actuel=2');
  const lecture = load('src/services/catalogue-habillement.ts', { '../db/database': { obtenirBase: async () => f.native } });
  const modeles = await lecture.chargerCatalogueHabillement();
  assert.equal(modeles.length, 1); assert.equal(modeles[0].stockVariantes, 8);
  assert.equal(modeles[0].nbVariantes, 4);
  assert.equal(modeles[0].tailles.length, 2); assert.equal(modeles[0].couleurs.length, 2);
});
test('le catalogue conserve les vraies couleurs et recherche sans accents', async () => {
  const f = fixture(); await f.service.enregistrerModeleHabillement({ ...f.input, nom: 'Vêtement été' }, 1);
  f.sqlite.exec("UPDATE variante_valeur SET code_hex='#AA0022' WHERE dimension_code='COULEUR'");
  const lecture = load('src/services/catalogue-habillement.ts', { '../db/database': { obtenirBase: async () => f.native } });
  const modeles = await lecture.chargerCatalogueHabillement();
  assert.equal(modeles[0].couleurs[0].hex, '#AA0022');
  assert.equal(lecture.filtrerCatalogueHabillement(modeles, 'vetement ete', null).length, 1);
  assert.equal(lecture.filtrerCatalogueHabillement(modeles, '', 'Autre').length, 0);
});

test('les anciens liens produit sont redirigés vers le bon parcours Habillement', () => {
  const { destinationProduitHabillement } = load('src/domain/navigation-habillement.ts');
  assert.deepEqual(destinationProduitHabillement('/produit/nouveau'), { creation: true });
  assert.deepEqual(destinationProduitHabillement('/produit/12'), { id: '12', modifier: false });
  assert.deepEqual(destinationProduitHabillement('/produit/modifier/12'), { id: '12', modifier: true });
  assert.equal(destinationProduitHabillement('/clients/12'), null);
});

test('fermer pendant la sauvegarde ne détruit pas la photo en cours d enregistrement', () => {
  const { PhotoModeleProvisoire } = load('src/domain/photo-modele.ts');
  const effacees = [];
  const photo = new PhotoModeleProvisoire((chemin) => effacees.push(chemin));
  photo.remplacer('produits/photo.jpg');
  photo.commencerSauvegarde(); photo.abandonner();
  assert.deepEqual(effacees, []);
  photo.confirmerSauvegarde();
  assert.deepEqual(effacees, []);
});
test('une photo abandonnée est nettoyée seulement après échec de la transaction', () => {
  const { PhotoModeleProvisoire } = load('src/domain/photo-modele.ts');
  const effacees = [];
  const photo = new PhotoModeleProvisoire((chemin) => effacees.push(chemin));
  photo.remplacer('produits/photo.jpg'); photo.commencerSauvegarde(); photo.abandonner();
  assert.deepEqual(effacees, []);
  photo.echecSauvegarde();
  assert.deepEqual(effacees, ['produits/photo.jpg']);
});
test('une erreur sans fermeture conserve la photo pour réessayer', () => {
  const { PhotoModeleProvisoire } = load('src/domain/photo-modele.ts');
  const effacees = [];
  const photo = new PhotoModeleProvisoire((chemin) => effacees.push(chemin));
  photo.remplacer('produits/photo.jpg'); photo.commencerSauvegarde(); photo.echecSauvegarde();
  assert.deepEqual(effacees, []);
  photo.remplacer('produits/autre.jpg');
  assert.deepEqual(effacees, ['produits/photo.jpg']);
  photo.abandonner();
  assert.deepEqual(effacees, ['produits/photo.jpg', 'produits/autre.jpg']);
});
