const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
function load(relative, imports = {}) {
  const file = resolve(__dirname, "../", relative);
  const m = new Module(file, module);
  m.paths = Module._nodeModulePaths(resolve(__dirname, ".."));
  m.require = (name) => (name in imports ? imports[name] : require(name));
  m._compile(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
  return m.exports;
}
const domain = () => load("src/domain/accounts.ts");
const token = "a".repeat(43),
  origin = "https://sahelpos.saheltech.tech";
test("native scanner accepts only SahelPOS opaque QR and invitation links", () => {
  assert.equal(domain().parseQr(origin + "/qr/" + token, origin).token, token);
  for (const input of [
    "https://evil.test/qr/" + token,
    origin + "/qr/" + token + "?role=patron",
    '{"role":"patron"}',
  ])
    assert.throws(() => domain().parseQr(input, origin));
});
test("native browser cancellation is distinct from a valid ticket", () => {
  assert.equal(domain().nativeTicket({ type: "cancel" }), null);
  assert.equal(domain().nativeTicket({ type: "dismiss" }), null);
  assert.equal(
    domain().nativeTicket({
      type: "success",
      url: "sahelpos://auth-callback#ticket=" + token,
    }),
    token,
  );
  for (const url of [
    "https://evil.test/#ticket=" + token,
    "sahelpos://wrong#ticket=" + token,
    "sahelpos://auth-callback#ticket=short",
  ])
    assert.throws(() => domain().nativeTicket({ type: "success", url }));
});
test("signed role scope refuses offline administrator writes from seller device", () => {
  assert.equal(domain().writeAllowed("vendeur", "ventes"), true);
  assert.equal(domain().writeAllowed("vendeur", "produits"), false);
  assert.equal(domain().writeAllowed("gerant", "boutique"), false);
  assert.equal(domain().writeAllowed("patron", "utilisateurs"), false);
  assert.equal(domain().writeAllowed(undefined, "utilisateurs"), true);
});
test("Accounts PIN initialization targets the permanent member and preserves an existing PIN and outbox", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE utilisateur(id INTEGER PRIMARY KEY,id_local TEXT UNIQUE,login TEXT,nom TEXT,role TEXT,actif INTEGER,code_pin TEXT,caisse_ouvre_a TEXT,caisse_ferme_a TEXT,date_modification TEXT);CREATE TABLE sync_outbox(id INTEGER);INSERT INTO sync_outbox VALUES(1);",
  );
  db.prepare(
    "INSERT INTO utilisateur VALUES(1,?,'moussa','Moussa','vendeur',1,'',NULL,NULL,'now')",
  ).run("member-uuid");
  let pushes = 0;
  const service = load("src/services/auth.ts", {
    "./abonnement": { etatCourant: async () => ({ droit: null }) },
    "expo-crypto": {
      CryptoDigestAlgorithm: { SHA256: "SHA256" },
      digestStringAsync: async (_, value) => "hash:" + value,
    },
    "../db/repositories/base": {
      lirePremier: async (sql, ...args) => db.prepare(sql).get(...args),
      lireTout: async () => [],
      executer: async (sql, ...args) => db.prepare(sql).run(...args),
      maintenant: () => new Date().toISOString(),
      versBooleen: Boolean,
    },
    "./synchronisation": { marquerChangement: async () => pushes++ },
  });
  const user = await service.initialiserPinAccounts("member-uuid", "123456");
  assert.equal(user.idLocal, "member-uuid");
  assert.equal(user.role, "vendeur");
  const before = db.prepare("SELECT code_pin FROM utilisateur").get().code_pin;
  await assert.rejects(
    () => service.initialiserPinAccounts("member-uuid", "654321"),
    /déjà|deja/i,
  );
  assert.equal(
    db.prepare("SELECT code_pin FROM utilisateur").get().code_pin,
    before,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sync_outbox").get().n, 1);
  assert.equal(pushes, 0);
  db.close();
});
function accountsService(browserResult, local = {}) {
  const crypto = require("node:crypto");
  let browserUrl = "";
  let calls = [];
  const service = load("src/services/accounts.ts", {
    "expo-crypto": {
      getRandomBytes: (n) => new Uint8Array(n).fill(17),
      CryptoDigestAlgorithm: { SHA256: "SHA256" },
      digestStringAsync: async (_, value) =>
        crypto.createHash("sha256").update(value).digest("hex"),
    },
    "expo-web-browser": {
      openAuthSessionAsync: async (url, callback) => {
        browserUrl = url;
        assert.equal(callback, "sahelpos://auth-callback");
        return browserResult;
      },
    },
    "../domain/accounts": domain(),
    "./abonnement": {
      empreinteAppareil: async () => "test-device",
      installerDroitAccounts: async () => {
        calls.push("install");
        if (local.reject) throw new Error("Boutique différente");
        return { boutique: "1" };
      },
    },
    "./synchronisation": {
      bootstrapInitial: async () => calls.push("bootstrap"),
      actualiserProfilAccounts: async () => calls.push("member"),
    },
    "./auth": {
      obtenirUtilisateurParIdLocal: async () => ({ idLocal: "member" }),
      listerComptesConnexion: async () => [],
    },
  });
  return { service, getUrl: () => browserUrl, calls };
}
test("cancelled native Accounts browser performs no exchange or provisioning", async () => {
  const { service, calls } = accountsService({ type: "cancel" });
  const original = global.fetch;
  let network = 0;
  global.fetch = async () => {
    network++;
    throw new Error("Unexpected request");
  };
  try {
    assert.equal(await service.ouvrirAccounts("google"), null);
    assert.equal(network, 0);
    assert.deepEqual(calls, []);
  } finally {
    global.fetch = original;
  }
});

function scopedAuth() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE utilisateur(id INTEGER PRIMARY KEY,id_local TEXT UNIQUE,login TEXT UNIQUE,nom TEXT,role TEXT,actif INTEGER,code_pin TEXT,caisse_ouvre_a TEXT,caisse_ferme_a TEXT,date_creation TEXT,date_modification TEXT);
    CREATE TABLE sync_outbox(id INTEGER);
    INSERT INTO sync_outbox VALUES(1);
    INSERT INTO utilisateur VALUES(1,'member-a','awa','Awa','vendeur',1,'',NULL,NULL,'now','now');
    INSERT INTO utilisateur VALUES(2,'member-b','moussa','Moussa','vendeur',1,'hash:SahelPOS360::pin::v1' || '654321',NULL,NULL,'now','now');`);
  const droit = { membre: { id_local: "member-a", role: "vendeur" } };
  const service = load("src/services/auth.ts", {
    "expo-crypto": { CryptoDigestAlgorithm: { SHA256: "SHA256" }, digestStringAsync: async (_, value) => "hash:" + value },
    "../db/repositories/base": {
      lirePremier: async (sql, ...args) => db.prepare(sql).get(...args),
      lireTout: async (sql, ...args) => db.prepare(sql).all(...args),
      executer: async (sql, ...args) => db.prepare(sql).run(...args),
      maintenant: () => "now", versBooleen: Boolean, genererIdLocal: () => "unrelated-admin",
    },
    "./abonnement": { etatCourant: async () => ({ droit }) },
    "./synchronisation": { marquerChangement: async () => { throw new Error("Unexpected outbox write"); } },
  });
  return { service, db, droit };
}
test("linked legacy setup keeps the signed seller identity despite an edited login and preserves its existing PIN", async () => {
  const { service, db, droit } = scopedAuth();
  try {
    const user = await service.finaliserConnexionMobile(droit, { login: "different", nom: "Different", role: "admin", pin: "123456" });
    assert.equal(user.idLocal, "member-a");
    assert.equal(user.role, "vendeur");
    assert.equal(user.login, "awa");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM utilisateur").get().n, 2);
    const before = db.prepare("SELECT code_pin FROM utilisateur WHERE id=1").get().code_pin;
    await assert.rejects(() => service.finaliserConnexionMobile(droit, { login: "different", role: "admin", pin: "999999" }), /incorrect/i);
    assert.equal(db.prepare("SELECT code_pin FROM utilisateur WHERE id=1").get().code_pin, before);
    assert.equal((await service.finaliserConnexionMobile(droit, { login: "different", role: "admin", pin: "123456" })).idLocal, "member-a");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sync_outbox").get().n, 1);
  } finally { db.close(); }
});
test("scoped offline PIN, biometric guard and sale guard refuse a preserved foreign profile without deleting it", async () => {
  const { service, db } = scopedAuth();
  try {
    const other = await service.obtenirUtilisateurParId(2);
    await assert.rejects(() => service.connecter("moussa", "654321"), /profil|appareil/i);
    await assert.rejects(() => service.verifierProfilAppareil(other), /profil|appareil/i);
    await assert.rejects(() => service.verifierAccesCaisse(2), /profil|appareil/i);
    await assert.rejects(() => service.verifierAccesCaisse(null), /profil|appareil/i);
    assert.deepEqual((await service.listerComptesConnexion()).map((u) => u.idLocal), ["member-a"]);
    assert.equal(db.prepare("SELECT code_pin FROM utilisateur WHERE id=2").get().code_pin, "hash:SahelPOS360::pin::v1" + "654321");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM utilisateur").get().n, 2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sync_outbox").get().n, 1);
  } finally { db.close(); }
});
test("native exchange sends the verifier for the challenge actually opened in the system browser", async () => {
  const { service, getUrl } = accountsService({
    type: "success",
    url: "sahelpos://auth-callback#ticket=" + token,
  });
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, origin + "/api/auth/exchange/");
    const payload = JSON.parse(options.body);
    assert.equal(payload.ticket, token);
    assert.equal(
      new URL(getUrl()).searchParams.get("challenge"),
      require("node:crypto")
        .createHash("sha256")
        .update(payload.verifier)
        .digest("base64url"),
    );
    return {
      ok: true,
      json: async () => ({
        jeton: "spst_" + token,
        utilisateur: { external_subject: "subject", boutiques: [] },
      }),
    };
  };
  try {
    await service.ouvrirAccounts("google");
    assert.equal(new URL(getUrl()).pathname, "/api/auth/google/");
  } finally {
    global.fetch = original;
  }
});
test("foreign-shop signed right stops provisioning before local member or bootstrap mutation", async () => {
  const { service, calls } = accountsService(
    { type: "cancel" },
    { reject: true },
  );
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      licence: "signed",
      jeton_appareil: "device",
      membre: { id_local: "member" },
      boutique_id: 2,
    }),
  });
  try {
    await assert.rejects(
      () => service.preparerProfil({ jeton: "session", utilisateur: {} }, 2),
      /Boutique différente/,
    );
    assert.deepEqual(calls, ["install"]);
  } finally {
    global.fetch = original;
  }
});
