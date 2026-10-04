# SahelPOS Mobile Habillement Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le Bloc 1 de la parité Habillement Android : référentiels Mode, dimensions, variantes et synchronisation Web ↔ Mobile sûrs et offline-first, sans encore déverrouiller la caisse Habillement.

**Architecture:** Django reste l'autorité métier et SQLite reproduit les concepts nécessaires à l'exploitation hors ligne. Les variantes sont des objets synchronisables de premier rang reliés au produit parent ; les référentiels Habillement et les dimensions sont synchronisés avant les variantes. Le protocole de sync évolue de façon additive afin que les anciens APK continuent à lire les données simples sans pouvoir aplatir les catalogues avancés.

**Tech Stack:** Django 5.2 / DRF, React Native 0.86, Expo 57, TypeScript 6, expo-sqlite, tests Django `TestCase`/DRF et tests Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-04-habillement-mobile-parity-design.md`

## Global Constraints

- Le Web reste l'autorité métier.
- Le mobile ne crée pas de second moteur Habillement divergent.
- Le moteur commun de stock reste unique.
- Les objets Habillement requis hors ligne vivent en SQLite.
- Chaque objet synchronisable possède une identité locale durable et un horodatage de modification ; les suppressions restent explicites lorsque pertinent.
- Une capability mobile n'est déverrouillée qu'après représentation SQLite, sync, service métier local sûr, UI et tests.
- Un APK incapable de représenter une donnée avancée ne doit jamais pouvoir l'aplatir.
- Le `pull` reste possible même si une famille d'écriture est bloquée.
- Les retries réseau ne doivent jamais dupliquer variantes ou stock.
- Les tests sont exécutés localement. GitHub Actions n'est pas utilisé sans autorisation explicite.

## Review Focus

- Un produit Habillement avec deux dimensions portant la même valeur textuelle (ex. taille 38 et pointure 38) doit conserver deux identités distinctes et ne jamais fusionner les options.
- Un pull rejoué deux fois après coupure réseau doit rester idempotent : aucune variante, valeur ou liaison Habillement ne doit être dupliquée.
- Une variante Web supprimée/désactivée doit disparaître de la sélection mobile sans supprimer l'historique local qui la référence.
- Un ancien APK ou un payload simple ne doit pas pouvoir remplacer un produit Habillement ADVANCED contenant des variantes.
- Une première synchronisation interrompue après les référentiels mais avant les variantes doit pouvoir reprendre sans base locale incohérente.

---

## File Map

### Mobile — création

- `src/domain/habillement.ts` — contrats TypeScript des référentiels, dimensions et variantes.
- `src/db/repositories/habillement.ts` — lecture/upsert local des référentiels et extensions produit.
- `src/db/repositories/variante.ts` — lecture/upsert local des dimensions, valeurs et variantes.
- `tests/mobile-habillement-schema.test.cjs` — contrat du schéma SQLite.
- `tests/mobile-habillement-sync.test.cjs` — contrats pull/idempotence/ordre de dépendances.

### Mobile — modification

- `src/db/schema.ts` — migration v10 pour le socle Habillement.
- `src/db/database.ts` — réparation critique additive des tables/indices Habillement si nécessaire.
- `src/services/synchronisation.ts` — types de sync, pull Habillement, ordre d'application, protocole V3.
- `src/domain/commerce.ts` — capacités Android réellement supportées après fondations.
- `tests/mobile-commerce-profile.test.cjs` — assertions de capabilities et garde-fous.

### Web — modification

- `backend/apps/sync/api.py` — sérialisation pull des référentiels/dimensions/variantes et protection des écritures simples.
- `backend/apps/commerce/mobile.py` — annonce des capabilities disponibles pour cet APK/protocole sans déverrouiller les écritures transactionnelles.
- `backend/tests/test_sync.py` — couverture du pull Habillement et idempotence.
- `backend/tests/test_commerce_mobile.py` — contrat mobile fondations.

---

### Task 1: Schéma SQLite Habillement V10

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/database.ts`
- Create: `tests/mobile-habillement-schema.test.cjs`

**Interfaces:**
- Consumes: tables existantes `produit`, `sync_outbox` et convention `id_local/date_modification`.
- Produces: tables `hab_schema_taille`, `hab_valeur_schema_taille`, `hab_categorie_mode`, `hab_couleur_mode`, `hab_marque`, `hab_saison`, `hab_collection`, `hab_produit`, `dimension_variante`, `valeur_dimension`, `variante_produit`, `variante_valeur`; `SCHEMA_VERSION = 10`.

- [ ] **Step 1: Write the failing schema contract test**

Create `tests/mobile-habillement-schema.test.cjs` asserting from `src/db/schema.ts` that:
- `SCHEMA_VERSION === 10`;
- the v10 migration creates all eleven Habillement/variant tables;
- `hab_produit.produit_id` references `produit(id)`;
- `variante_produit.produit_id` references `produit(id)`;
- `variante_produit` contains `id_local`, `sku`, `signature_combinaison`, `prix_override`, `prix_achat`, `code_barre`, `actif`, `date_modification`, `supprime_le`;
- `variante_valeur` has a unique pair `(variante_id, valeur_id)`;
- dimension/value uniqueness is scoped locally so taille 38 and pointure 38 remain distinct.

- [ ] **Step 2: Run the schema test to verify RED**

Run: `node --test tests/mobile-habillement-schema.test.cjs`  
Expected: FAIL because schema version 10/tables do not exist.

- [ ] **Step 3: Add migration v10 in `src/db/schema.ts`**

Implement only the additive schema required by the test. Use local integer PKs plus `id_local TEXT NOT NULL UNIQUE` for synchronizable objects, FK `ON DELETE CASCADE` for product-owned extensions, and explicit indices on foreign keys/SKU/signature.

- [ ] **Step 4: Extend `reparerSchemaCritique()` in `src/db/database.ts`**

Add idempotent repair only for critical missing Habillement indices/columns on tables that already exist. Do not recreate/drop tables and never wipe data.

- [ ] **Step 5: Run schema tests GREEN**

Run: `node --test tests/mobile-habillement-schema.test.cjs`  
Expected: PASS.

- [ ] **Step 6: Run existing database-sensitive mobile tests**

Run: `node --test tests/mobile-sync-safety.test.cjs tests/mobile-commerce-profile.test.cjs`  
Expected: PASS with no STANDARD regression.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/database.ts tests/mobile-habillement-schema.test.cjs
git commit -m "feat(habillement): add mobile variant schema"
```

---

### Task 2: Contrats domaine et repositories Habillement locaux

**Files:**
- Create: `src/domain/habillement.ts`
- Create: `src/db/repositories/habillement.ts`
- Create: `src/db/repositories/variante.ts`
- Create: `tests/mobile-habillement-repositories.test.cjs`

**Interfaces:**
- Consumes: tables de Task 1, helpers `executer/lirePremier/lireTout/dansTransaction`.
- Produces:
  - `upsertReferentielHabillement(type, payload): Promise<void>`
  - `upsertProduitHabillement(payload: ProduitHabillementSync): Promise<void>`
  - `upsertDimension(payload: DimensionVarianteSync): Promise<void>`
  - `upsertValeurDimension(payload: ValeurDimensionSync): Promise<void>`
  - `upsertVariante(payload: VarianteProduitSync): Promise<void>`
  - `listerVariantesProduit(produitId: number): Promise<VarianteProduitLocale[]>`
  - types `SchemaTailleSync`, `CategorieModeSync`, `CouleurModeSync`, `ProduitHabillementSync`, `DimensionVarianteSync`, `ValeurDimensionSync`, `VarianteProduitSync`.

- [ ] **Step 1: Write failing repository tests**

Create tests asserting:
- two upserts with same `id_local` update instead of duplicate;
- a newer local `date_modification` is not overwritten by older pull data;
- a dimension TAILLE/value 38 and dimension POINTURE/value 38 coexist;
- a variant retains multiple value links;
- deactivated/deleted variant is excluded from the default sellable list but remains stored.

- [ ] **Step 2: Run repository tests RED**

Run: `node --test tests/mobile-habillement-repositories.test.cjs`  
Expected: FAIL because modules/functions do not exist.

- [ ] **Step 3: Define exact domain contracts in `src/domain/habillement.ts`**

Match Web semantics:
- schema size dimension code `TAILLE | POINTURE`;
- category genre `H | F | E | M`;
- variant values reference a dimension/value identity, not free text;
- variant payload includes product `id_local` and value `id_local[]`.

- [ ] **Step 4: Implement Habillement repository upserts**

Resolve parent objects by `id_local`; perform each aggregate upsert in a SQLite transaction. Reject orphan payloads with an explicit error rather than silently dropping links.

- [ ] **Step 5: Implement variant repository and listing**

`listerVariantesProduit` returns active, non-deleted variants with ordered dimension/value display data and effective price fields.

- [ ] **Step 6: Run repository tests GREEN**

Run: `node --test tests/mobile-habillement-repositories.test.cjs`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/habillement.ts src/db/repositories/habillement.ts src/db/repositories/variante.ts tests/mobile-habillement-repositories.test.cjs
git commit -m "feat(habillement): add local variant repositories"
```

---

### Task 3: Contrat de pull Habillement côté Web

**Files:**
- Modify: `backend/apps/sync/api.py`
- Modify: `backend/tests/test_sync.py`

**Interfaces:**
- Consumes: modèles Web `SchemaTaille`, `ValeurSchemaTaille`, `CategorieMode`, `CouleurMode`, `Marque`, `Saison`, `Collection`, `ProduitHabillement`, `DimensionVariante`, `ValeurDimension`, `VarianteProduit`.
- Produces: champs additifs du pull :
  - `referentiels_habillement`
  - `produits_habillement`
  - `dimensions`
  - `valeurs_dimensions`
  - `variantes`

- [ ] **Step 1: Write failing Django pull tests**

Add tests asserting a Habillement product pull contains:
- category, size schema and color references;
- dimension identities and values;
- variant `id_local`, product `id_local`, SKU, effective attributes and value identities;
- two values named `38` under different dimensions remain distinct;
- requesting the same cursor window twice yields stable identities and no duplicate semantic objects.

- [ ] **Step 2: Run targeted Django tests RED**

Run from `backend/`:  
`python manage.py test tests.test_sync --verbosity 2`  
Expected: FAIL on missing Habillement fields.

- [ ] **Step 3: Add serializer helpers in `backend/apps/sync/api.py`**

Add focused private serializers for each new object family. Use stable local identities from `Synchronisable` when available; for reference models that do not yet carry `id_local`, emit deterministic opaque sync keys namespaced by model + PK rather than labels.

- [ ] **Step 4: Extend pull response additively**

Return the five new arrays without changing the existing simple arrays or cursor semantics. Ensure dependencies are all included before a variant can reference them.

- [ ] **Step 5: Run targeted Django tests GREEN**

Run: `python manage.py test tests.test_sync --verbosity 2`  
Expected: PASS.

- [ ] **Step 6: Run commerce mobile tests**

Run: `python manage.py test tests.test_commerce_mobile --verbosity 2`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/sync/api.py backend/tests/test_sync.py
git commit -m "feat(sync): expose habillement variant pull"
```

---

### Task 4: Appliquer le pull Habillement sur Android

**Files:**
- Modify: `src/services/synchronisation.ts`
- Create: `tests/mobile-habillement-sync.test.cjs`

**Interfaces:**
- Consumes: Task 2 repository functions and Task 3 pull arrays.
- Produces: protocole mobile `VERSION_PROTOCOLE = '3'`; `appliquerPull` persists dependencies in order:
  1. référentiels Habillement;
  2. dimensions;
  3. valeurs;
  4. produits simples existants;
  5. extensions produit Habillement;
  6. variantes;
  7. other existing business objects.

- [ ] **Step 1: Write failing sync-order/idempotence tests**

Assert:
- protocol version is 3;
- repositories are called in dependency-safe order;
- replaying identical Habillement pull performs upserts without duplicate creation;
- missing parent/value rejects the pull transaction and does not advance cursor;
- interrupted initial sync can replay the same snapshot safely.

- [ ] **Step 2: Run mobile sync test RED**

Run: `node --test tests/mobile-habillement-sync.test.cjs`  
Expected: FAIL because V3 payload/application does not exist.

- [ ] **Step 3: Add new sync payload interfaces**

Import Task 2 domain types rather than duplicating shapes inside `synchronisation.ts`.

- [ ] **Step 4: Extend `PullSync` and `appliquerPull`**

Apply all Habillement data inside the existing transaction that also stores the cursor. Increment `recus` for each persisted object consistently with existing counters.

- [ ] **Step 5: Bump `VERSION_PROTOCOLE` to `3`**

Existing installations must run the bootstrap path once after update because their local representation gained new tables/data.

- [ ] **Step 6: Run sync tests GREEN**

Run: `node --test tests/mobile-habillement-sync.test.cjs tests/mobile-sync-safety.test.cjs`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/synchronisation.ts tests/mobile-habillement-sync.test.cjs
git commit -m "feat(sync): pull habillement variants on mobile"
```

---

### Task 5: Protéger le push simple contre l'aplatissement des variantes

**Files:**
- Modify: `backend/apps/sync/api.py`
- Modify: `backend/tests/test_commerce_mobile.py`
- Modify: `backend/tests/test_sync.py`

**Interfaces:**
- Consumes: contrat `commerce.ecritures_autorisees`, profil `ADVANCED`, existence Web de variantes.
- Produces: garde serveur explicite refusant les mutations `produits/ventes/achats/mouvements` au format simple lorsqu'elles ciblent des données nécessitant les variantes.

- [ ] **Step 1: Write failing anti-flattening tests**

Cover:
- simple product push against Habillement ADVANCED returns 409 and leaves product/variants untouched;
- simple sale/stock/achat push cannot target a product with variants;
- clients/fournisseurs/boutique remain writable;
- pull remains HTTP 200.

- [ ] **Step 2: Run tests RED**

Run from `backend/`:  
`python manage.py test tests.test_commerce_mobile tests.test_sync --verbosity 2`  
Expected: at least one anti-flattening case FAIL before implementation.

- [ ] **Step 3: Implement payload-level guards**

Keep the existing family-level guard, then add object-level validation where needed so a future mixed profile cannot bypass safety merely because the family is globally allowed.

- [ ] **Step 4: Run tests GREEN**

Run: `python manage.py test tests.test_commerce_mobile tests.test_sync --verbosity 2`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/sync/api.py backend/tests/test_commerce_mobile.py backend/tests/test_sync.py
git commit -m "fix(sync): prevent variant catalogue flattening"
```

---

### Task 6: Capability contract for read-ready Habillement foundations

**Files:**
- Modify: `backend/apps/commerce/mobile.py`
- Modify: `src/domain/commerce.ts`
- Modify: `tests/mobile-commerce-profile.test.cjs`
- Modify: `backend/tests/test_commerce_mobile.py`

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces:
  - mobile can declare `PRODUCT_VARIANTS`, `SIZE_DIMENSION`, `COLOR_DIMENSION` as **representable/readable**;
  - transaction families `produits/ventes/achats/mouvements` remain blocked for Habillement until Blocks 2–4 implement safe local writes.

- [ ] **Step 1: Write failing capability tests**

Assert:
- signed contract no longer classifies the three foundation capabilities as unknown/non-representable;
- Habillement mobile remains `compatible: false` for full parity at this stage;
- safe core writes remain enabled;
- transaction writes remain protected.

- [ ] **Step 2: Run Web + Mobile capability tests RED**

Run:
- Web: `python manage.py test tests.test_commerce_mobile --verbosity 2`
- Mobile: `node --test tests/mobile-commerce-profile.test.cjs`

Expected: FAIL on foundation capability support state.

- [ ] **Step 3: Split representation support from write support**

In Web and Mobile contracts, introduce explicit semantics so "this APK can store/read this capability" is not confused with "this APK may mutate business transactions using it". Do not add `PURCHASE_MATRIX`, `VARIANT_EXCHANGE` or `ARRIVAL_MANAGEMENT` yet.

- [ ] **Step 4: Run tests GREEN**

Run both commands from Step 2.  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/commerce/mobile.py backend/tests/test_commerce_mobile.py
git commit -m "feat(commerce): advertise mobile variant foundations"
git add src/domain/commerce.ts tests/mobile-commerce-profile.test.cjs
git commit -m "feat(commerce): recognize variant foundations on android"
```

---

### Task 7: Bloc 1 regression and acceptance gate

**Files:**
- Modify only if tests expose a regression.
- Test: existing Web and Mobile suites relevant to commerce/sync.

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: verified foundation suitable for starting Bloc 2 Catalogue/Modèles.

- [ ] **Step 1: Run complete targeted mobile suite locally**

Run from mobile repository:

```bash
node --test   tests/mobile-habillement-schema.test.cjs   tests/mobile-habillement-repositories.test.cjs   tests/mobile-habillement-sync.test.cjs   tests/mobile-commerce-profile.test.cjs   tests/mobile-commerce-writes.test.cjs   tests/mobile-sync-safety.test.cjs
```

Expected: 0 failures.

- [ ] **Step 2: Run TypeScript compiler**

Run: `npx tsc --noEmit`  
Expected: exit code 0.

- [ ] **Step 3: Run targeted Web suite locally**

Run from `backend/`:

```bash
python manage.py test   tests.test_sync   tests.test_commerce_mobile   apps.commerce.tests   apps.habillement.tests   --verbosity 2
```

Expected: 0 failures.

- [ ] **Step 4: Verify acceptance scenarios**

Verify with tests or fixtures that:
- Web → Android delivers one model with sizes/colors/variants;
- replay produces no duplicate;
- size 38 and pointure 38 remain distinct;
- deactivated variant remains historical but non-sellable;
- STANDARD simple catalogue still syncs;
- Habillement transaction writes are still blocked at this foundation stage.

Expected: all six scenarios pass.

- [ ] **Step 5: Record Block 1 completion**

Do not enable caisse variants, PURCHASE_MATRIX, VARIANT_EXCHANGE or ARRIVAL_MANAGEMENT in this commit. The next implementation plan starts with Bloc 2 Catalogue/Modèles.

- [ ] **Step 6: Commit any acceptance-only fixture/test changes**

```bash
git add tests backend/tests
git commit -m "test(habillement): certify mobile variant foundations"
```
