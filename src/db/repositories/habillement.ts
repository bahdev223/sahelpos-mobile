import type {
  CategorieModeSync,
  CouleurModeSync,
  NomReferentielSync,
  ProduitHabillementSync,
  ReferentielHabillementPayload,
  ReferentielHabillementType,
  SchemaTailleSync,
  ValeurSchemaTailleSync,
} from '../../domain/habillement';
import {
  dansTransaction,
  executer,
  lirePremier,
} from './base';

async function idParLocal(table: string, idLocal?: string | null): Promise<number | null> {
  if (!idLocal) return null;
  const ligne = await lirePremier<{ id: number }>(
    `SELECT id FROM ${table} WHERE id_local = ?`,
    idLocal,
  );
  return ligne?.id ?? null;
}

async function estPlusRecent(table: string, idLocal: string, entrant: string): Promise<boolean> {
  const ligne = await lirePremier<{ date_modification: string | null }>(
    `SELECT date_modification FROM ${table} WHERE id_local = ?`,
    idLocal,
  );
  return Boolean(ligne?.date_modification && ligne.date_modification > entrant);
}

export async function upsertReferentielHabillement(
  type: ReferentielHabillementType,
  payload: ReferentielHabillementPayload,
): Promise<void> {
  const tableParType: Record<ReferentielHabillementType, string> = {
    schema_taille: 'hab_schema_taille',
    valeur_schema_taille: 'hab_valeur_schema_taille',
    categorie_mode: 'hab_categorie_mode',
    couleur_mode: 'hab_couleur_mode',
    marque: 'hab_marque',
    saison: 'hab_saison',
    collection: 'hab_collection',
  };
  const table = tableParType[type];
  if (await estPlusRecent(table, payload.id_local, payload.date_modification)) return;

  if (type === 'schema_taille') {
    const p = payload as SchemaTailleSync;
    await executer(
      `INSERT INTO hab_schema_taille
        (id_local, nom, dimension_code, est_systeme, date_modification, supprime_le)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id_local) DO UPDATE SET
         nom = excluded.nom,
         dimension_code = excluded.dimension_code,
         est_systeme = excluded.est_systeme,
         date_modification = excluded.date_modification,
         supprime_le = excluded.supprime_le`,
      p.id_local, p.nom, p.dimension_code, p.est_systeme ? 1 : 0,
      p.date_modification, p.supprime_le ?? null,
    );
    return;
  }

  if (type === 'valeur_schema_taille') {
    const p = payload as ValeurSchemaTailleSync;
    const schemaId = await idParLocal('hab_schema_taille', p.schema_id_local);
    if (!schemaId) throw new Error(`Valeur de taille orpheline : ${p.id_local}`);
    await executer(
      `INSERT INTO hab_valeur_schema_taille
        (id_local, schema_id, valeur, ordre, date_modification, supprime_le)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id_local) DO UPDATE SET
         schema_id = excluded.schema_id,
         valeur = excluded.valeur,
         ordre = excluded.ordre,
         date_modification = excluded.date_modification,
         supprime_le = excluded.supprime_le`,
      p.id_local, schemaId, p.valeur, p.ordre, p.date_modification, p.supprime_le ?? null,
    );
    return;
  }

  if (type === 'categorie_mode') {
    const p = payload as CategorieModeSync;
    const schemaId = await idParLocal('hab_schema_taille', p.schema_taille_defaut_id_local);
    if (p.schema_taille_defaut_id_local && !schemaId) {
      throw new Error(`Categorie Mode orpheline : ${p.id_local}`);
    }
    await executer(
      `INSERT INTO hab_categorie_mode
        (id_local, nom, genre, est_systeme, utilise_couleur, utilise_taille,
         schema_taille_defaut_id, date_modification, supprime_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id_local) DO UPDATE SET
         nom = excluded.nom,
         genre = excluded.genre,
         est_systeme = excluded.est_systeme,
         utilise_couleur = excluded.utilise_couleur,
         utilise_taille = excluded.utilise_taille,
         schema_taille_defaut_id = excluded.schema_taille_defaut_id,
         date_modification = excluded.date_modification,
         supprime_le = excluded.supprime_le`,
      p.id_local, p.nom, p.genre, p.est_systeme ? 1 : 0,
      p.utilise_couleur ? 1 : 0, p.utilise_taille ? 1 : 0, schemaId,
      p.date_modification, p.supprime_le ?? null,
    );
    return;
  }

  if (type === 'couleur_mode') {
    const p = payload as CouleurModeSync;
    await executer(
      `INSERT INTO hab_couleur_mode
        (id_local, nom, hex_code, est_systeme, actif, date_modification, supprime_le)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id_local) DO UPDATE SET
         nom = excluded.nom,
         hex_code = excluded.hex_code,
         est_systeme = excluded.est_systeme,
         actif = excluded.actif,
         date_modification = excluded.date_modification,
         supprime_le = excluded.supprime_le`,
      p.id_local, p.nom, p.hex_code, p.est_systeme ? 1 : 0, p.actif ? 1 : 0,
      p.date_modification, p.supprime_le ?? null,
    );
    return;
  }

  const p = payload as NomReferentielSync;
  await executer(
    `INSERT INTO ${table} (id_local, nom, date_modification, supprime_le)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id_local) DO UPDATE SET
       nom = excluded.nom,
       date_modification = excluded.date_modification,
       supprime_le = excluded.supprime_le`,
    p.id_local, p.nom, p.date_modification, p.supprime_le ?? null,
  );
}

export async function upsertProduitHabillement(payload: ProduitHabillementSync): Promise<void> {
  await dansTransaction(async () => {
    if (await estPlusRecent('hab_produit', payload.id_local, payload.date_modification)) return;

    const produitId = await idParLocal('produit', payload.produit_id_local);
    if (!produitId) throw new Error(`Produit Habillement orphelin : ${payload.produit_id_local}`);

    const categorieId = await idParLocal('hab_categorie_mode', payload.categorie_mode_id_local);
    const marqueId = await idParLocal('hab_marque', payload.marque_id_local);
    const saisonId = await idParLocal('hab_saison', payload.saison_id_local);
    const collectionId = await idParLocal('hab_collection', payload.collection_id_local);
    const schemaId = await idParLocal('hab_schema_taille', payload.schema_taille_id_local);

    for (const [nom, idLocal, id] of [
      ['categorie', payload.categorie_mode_id_local, categorieId],
      ['marque', payload.marque_id_local, marqueId],
      ['saison', payload.saison_id_local, saisonId],
      ['collection', payload.collection_id_local, collectionId],
      ['schema', payload.schema_taille_id_local, schemaId],
    ] as const) {
      if (idLocal && !id) throw new Error(`Produit Habillement orphelin (${nom}) : ${idLocal}`);
    }

    await executer(
      `INSERT INTO hab_produit
        (id_local, produit_id, categorie_mode_id, marque_id, saison_id, collection_id,
         schema_taille_id, fournisseur_id_local, date_modification, supprime_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id_local) DO UPDATE SET
         produit_id = excluded.produit_id,
         categorie_mode_id = excluded.categorie_mode_id,
         marque_id = excluded.marque_id,
         saison_id = excluded.saison_id,
         collection_id = excluded.collection_id,
         schema_taille_id = excluded.schema_taille_id,
         fournisseur_id_local = excluded.fournisseur_id_local,
         date_modification = excluded.date_modification,
         supprime_le = excluded.supprime_le`,
      payload.id_local, produitId, categorieId, marqueId, saisonId, collectionId,
      schemaId, payload.fournisseur_id_local ?? null,
      payload.date_modification, payload.supprime_le ?? null,
    );
  });
}
