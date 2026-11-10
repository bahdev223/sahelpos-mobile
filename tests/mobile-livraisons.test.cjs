const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function charger(relative, imports = {}) {
  const file = resolve(__dirname, '..', relative);
  const loaded = new Module(file, module);
  loaded.paths = Module._nodeModulePaths(resolve(__dirname, '..'));
  loaded.require = (name) => name in imports ? imports[name] : require(name);
  loaded._compile(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return loaded.exports;
}

const accounts = charger('src/domain/accounts.ts');
const permissions = () => charger('src/domain/permissions-mobile.ts', { './accounts': accounts });
const livraisons = () => charger('src/domain/livraisons.ts', { './accounts': accounts });

test('courier roles never grant access to commerce or other courier roles to its routes', () => {
  for (const role of ['livreur', 'livreur_prestataire']) {
    assert.equal(permissions().peutAccederCheminMobile(role, '/livraisons/12'), true);
    for (const route of ['/accueil', '/caisse', '/catalogue', '/clients', '/parametres/boutique', '/stock']) {
      assert.equal(permissions().peutAccederCheminMobile(role, route), false);
    }
    assert.equal(accounts.writeAllowed(role, 'ventes'), false);
    assert.equal(accounts.writeAllowed(role, 'clients'), false);
  }
  for (const role of ['admin', 'gerant', 'vendeur']) {
    assert.equal(permissions().peutAccederCheminMobile(role, '/livraisons/12'), false);
  }
  assert.equal(accounts.writeAllowed(undefined, 'ventes'), true);
});

test('package QR validates the exact mission parcel and permits historical raw UUID labels', () => {
  const { colisDepuisQr } = livraisons();
  const id = '12a8c495-3ef5-4804-a7ec-5dad063c5315';
  const colis = [{ id }];
  assert.equal(colisDepuisQr('SP360-COLIS:' + id.toUpperCase(), colis), id);
  assert.equal(colisDepuisQr(id, colis), id);
  assert.equal(colisDepuisQr('https://example.test/' + id, colis), null);
  assert.equal(colisDepuisQr('SP360-COLIS:2ca303f6-8d32-474c-a4cb-10004be6121b', colis), null);
});

test('pending courier events can chain at their original expected versions without pretending to be confirmed', () => {
  const { projectionMission } = livraisons();
  const mission = { statut: 'CHARGEMENT', version: 5 };
  const prendre = { type: 'prendre', version: 5, statut: 'ATTENTE' };
  const partir = { type: 'partir', version: 6, statut: 'ATTENTE' };
  assert.deepEqual(projectionMission(mission, [prendre, partir]), { statut: 'EN_COURS', version: 7, bloquee: false });
  assert.equal(mission.statut, 'CHARGEMENT');
  assert.deepEqual(projectionMission(mission, [{ ...prendre, statut: 'CONFLIT' }, partir]), {
    statut: 'CHARGEMENT', version: 5, bloquee: true,
  });
  assert.deepEqual(projectionMission({ statut: 'EN_COURS', version: 7 }, [prendre, partir]), {
    statut: 'EN_COURS', version: 7, bloquee: false,
  });
});

test('the delivery quantity contract requires a complete line count and a reason for leftovers', () => {
  const { preparerRemise } = livraisons();
  const lignes = [{ id: 1, quantite_prevue: '4.000', quantite_preparee: '4.000' },
    { id: 2, quantite_prevue: '2.000', quantite_preparee: '2.000' }];
  const signature = [[[0, 0], [1000, 1000]]];
  assert.throws(() => preparerRemise(lignes, { 1: '3', 2: '2' }, 'Awa', '', signature), /reliquat/i);
  assert.throws(() => preparerRemise(lignes, { 1: '5', 2: '2' }, 'Awa', 'Reliquat', signature), /quantité/i);
  const data = preparerRemise(lignes, { 1: '2,5', 2: '0' }, 'Awa', 'Client absent', signature);
  assert.deepEqual(data.lignes, [{ id: 1, quantite: '2.5' }, { id: 2, quantite: '0' }]);
});

test('a replanned partial delivery accepts only the incremental remaining quantities', () => {
  const { preparerRemise } = livraisons();
  const lignes = [{ id: 1, quantite_prevue: '4.000', quantite_preparee: '4.000', quantite_remise: '2.500', quantite_restante: '1.500' },
    { id: 2, quantite_prevue: '2.000', quantite_preparee: '2.000', quantite_remise: '2.000' }];
  const signature = [[[0, 0], [1000, 1000]]];
  assert.throws(() => preparerRemise(lignes, { 1: '4', 2: '0' }, 'Awa', '', signature), /quantité/i);
  assert.deepEqual(preparerRemise(lignes, { 1: '1,5', 2: '0' }, 'Awa', '', signature).lignes,
    [{ id: 1, quantite: '1.5' }, { id: 2, quantite: '0' }]);
});

function environnementLivreur() {
  const { DatabaseSync } = require('node:sqlite');
  const { randomUUID } = require('node:crypto');
  const db = new DatabaseSync(':memory:');
  const schema = charger('src/db/schema.ts');
  db.exec(schema.MIGRATIONS[16].join(';'));
  const executor = {
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args),
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args),
    runAsync: async (sql, ...args) => db.prepare(sql).run(...args),
    withExclusiveTransactionAsync: async (task) => task(executor),
  };
  const utilisateur = { id: 1, idLocal: 'membre-a', role: 'livreur', actif: true };
  let membre = utilisateur.idLocal;
  const service = charger('src/services/livraisons.ts', {
    'expo-crypto': { randomUUID },
    '../db/database': { obtenirBase: async () => executor },
    '../domain/accounts': accounts,
    '../domain/livraisons': livraisons(),
    './abonnement': {
      etatCourant: async () => ({ active: true, droit: { boutique: '7', membre: { id_local: membre, role: 'livreur' } } }),
      jetonAppareil: async () => 'appareil',
    },
    './auth': { obtenirUtilisateurParIdLocal: async (idLocal) => ({ ...utilisateur, idLocal }) },
    './accounts': { ACCOUNTS_SERVEUR: 'https://sahelpos.test' },
  });
  return { db, utilisateur, service, changerMembre: (id) => { membre = id; } };
}

test('a lost HTTP response replays the same UUID, version and body without exposing another courier cache', async () => {
  const { db, utilisateur, service, changerMembre } = environnementLivreur();
  const requests = [];
  const mission = { id: 3, numero: 'L-3', version: 9, statut: 'CHARGEE', lignes: [], colis: [] };
  const original = global.fetch;
  global.fetch = async (url, options) => {
    if (!options.body) return new Response(JSON.stringify(mission));
    requests.push(options.body);
    if (requests.length === 1) throw new Error('response lost');
    return new Response(JSON.stringify({ ...mission, statut: 'EN_COURS', version: 10, version_appliquee: 10 }));
  };
  try {
    const session = service.creerSessionLivreur(utilisateur);
    await service.actualiserMission(session, 3);
    await service.enfilerAction(session, 3, 9, { type: 'partir', donnees: {} });
    await service.synchroniserLivraisons(session);
    assert.equal((await service.lireMission(session, 3)).operations.length, 1);
    await service.synchroniserLivraisons(session);
    assert.equal(requests[0], requests[1]);
    assert.equal(JSON.parse(requests[0]).version, 9);
    assert.equal((await service.lireMission(session, 3)).operations.length, 0);
    assert.equal((await service.lireMission(session, 3)).mission.statut, 'EN_COURS');
    changerMembre('membre-b');
    await assert.rejects(service.lireMission(session, 3), /profil|accès/i);
    assert.equal((await service.lireMission(service.creerSessionLivreur({ ...utilisateur, idLocal: 'membre-b' }), 3)).mission, null);
  } finally {
    global.fetch = original;
    db.close();
  }
});

test('a version conflict preserves the original operation until an explicit review and server reload', async () => {
  const { db, utilisateur, service } = environnementLivreur();
  const mission = { id: 3, numero: 'L-3', version: 9, statut: 'CHARGEE', lignes: [], colis: [] };
  const original = global.fetch;
  let posts = 0;
  global.fetch = async (_url, options) => {
    if (!options.body) return Response.json(mission);
    posts++;
    return Response.json({ detail: 'Version modifiée' }, { status: 409 });
  };
  try {
    const session = service.creerSessionLivreur(utilisateur);
    await service.actualiserMission(session, 3);
    await service.enfilerAction(session, 3, 9, { type: 'partir', donnees: {} });
    await service.synchroniserLivraisons(session);
    await service.synchroniserLivraisons(session);
    assert.equal(posts, 1);
    const { mission: affichee, operations } = await service.lireMission(session, 3);
    assert.equal(affichee.statut, 'CHARGEE');
    assert.equal(operations[0].statut, 'CONFLIT');
    const avant = db.prepare('SELECT corps FROM livraison_file').get().corps;
    await service.classerConflitMission(session, 3, operations[0].cle);
    assert.equal((await service.lireMission(session, 3)).operations.length, 0);
    assert.deepEqual({ ...db.prepare('SELECT statut, corps FROM livraison_file').get() },
      { statut: 'ARCHIVEE', corps: avant });
  } finally {
    global.fetch = original;
    db.close();
  }
});

test('confirmed authorization failure hides cached missions and retains the outbox across logout', async () => {
  const { db, utilisateur, service } = environnementLivreur();
  const mission = { id: 3, numero: 'L-3', version: 9, statut: 'CHARGEE', lignes: [], colis: [] };
  const original = global.fetch;
  global.fetch = async (url, options) => options.body || url.endsWith('/reglages/')
    ? Response.json({ detail: 'Appareil révoqué' }, { status: 403 })
    : Response.json(mission);
  try {
    const session = service.creerSessionLivreur(utilisateur);
    await service.actualiserMission(session, 3);
    await service.enfilerAction(session, 3, 9, { type: 'partir', donnees: {} });
    await assert.rejects(service.synchroniserLivraisons(session), /profil/i);
    await assert.rejects(service.lireMission(session, 3), /profil/i);
    service.invaliderSessionsLivreur();
    await assert.rejects(service.lireMission(session, 3), /profil/i);
    await assert.rejects(service.lireMission(service.creerSessionLivreur(utilisateur), 3), /profil/i);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM livraison_file').get().n, 1);
  } finally {
    global.fetch = original;
    db.close();
  }
});

test('shop GPS denial stops the grant and replay while leaving the authorized mission available', async () => {
  const { db, utilisateur, service } = environnementLivreur();
  const mission = { id: 3, numero: 'L-3', version: 9, statut: 'EN_COURS', lignes: [], colis: [] };
  const original = global.fetch;
  let positions = 0;
  global.fetch = async (url, options) => {
    if (url.endsWith('/positions/')) {
      positions++;
      assert.equal(JSON.parse(options.body).points[0].latitude, 12.65);
      return Response.json({ detail: 'GPS désactivé' }, { status: 403 });
    }
    if (url.endsWith('/reglages/')) return Response.json({ gps_actif: false });
    return Response.json(mission);
  };
  try {
    const session = service.creerSessionLivreur(utilisateur);
    await service.actualiserMission(session, 3);
    const grant = await service.accorderGps(session, 3);
    await service.enregistrerPositions(grant, [{
      latitude: 12.65, longitude: -8, precision: 14,
      horodatage: new Date(grant.debut + 100).toISOString(),
    }]);
    assert.equal(await service.lireAutorisationGps(), null);
    assert.equal(await service.autorisationGpsValide(grant), false);
    assert.equal((await service.lireMission(session, 3)).mission.id, 3);
    assert.equal(db.prepare('SELECT statut FROM livraison_file').get().statut, 'CONFLIT');
    await service.synchroniserLivraisons(session);
    assert.equal(positions, 1);
  } finally {
    global.fetch = original;
    db.close();
  }
});
