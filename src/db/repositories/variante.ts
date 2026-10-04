import type {
  DimensionVarianteSync,
  ValeurDimensionSync,
  VarianteProduitLocale,
  VarianteProduitSync,
  ValeurVarianteLocale,
} from '../../domain/habillement';
import {
  dansTransaction,
  executer,
  lirePremier,
  lireTout,
  versBooleen,
} from './base';

async function idParLocal(table: string, idLocal: string): Promise<number | null> {
  const ligne = await lirePremier<{ id: number }>(
    `SELECT id FROM ${table} WHERE id_local = ?`,
    idLocal,
  );
  return ligne?.id ?? null;
}

async function plusRecent(table: string, idLocal: string, entrant: string): Promise<boolean> {
  const ligne = await lirePremier<{ date_modification: string | null }>(
    `SELECT date_modification FROM ${table} WHERE id_local = ?`,
    idLocal,
  );
  return Boolean(ligne?.date_modification && ligne.date_modification > entrant);
}

export async function upsertDimension(payload: DimensionVarianteSync): Promise<void> {
  if (await plusRecent('dimension_variante', payload.id_local, payload.date_modification)) return;
  await executer(
    `INSERT INTO dimension_variante
      (id_local, code, nom, ordre, date_modification, supprime_le)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_local) DO UPDATE SET
       code = excluded.code,
       nom = excluded.nom,
       ordre = excluded.ordre,
       date_modification = excluded.date_modification,
       supprime_le = excluded.supprime_le`,
    payload.id_local, payload.code, payload.nom, payload.ordre,
    payload.date_modification, payload.supprime_le ?? null,
  );
}

export async function upsertValeurDimension(payload: ValeurDimensionSync): Promise<void> {
  if (await plusRecent('valeur_dimension', payload.id_local, payload.date_modification)) return;
  const dimensionId = await idParLocal('dimension_variante', payload.dimension_id_local);
  if (!dimensionId) throw new Error(`Valeur de dimension orpheline : ${payload.id_local}`);

  await executer(
    `INSERT INTO valeur_dimension
      (id_local, dimension_id, code, nom, ordre, code_hex, date_modification, supprime_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_local) DO UPDATE SET
       dimension_id = excluded.dimension_id,
       code = excluded.code,
       nom = excluded.nom,
       ordre = excluded.ordre,
       code_hex = excluded.code_hex,
       date_modification = excluded.date_modification,
       supprime_le = excluded.supprime_le`,
    payload.id_local, dimensionId, payload.code, payload.nom, payload.ordre,
    payload.code_hex ?? null, payload.date_modification, payload.supprime_le ?? null,
  );
}

export async function upsertVariante(payload: VarianteProduitSync): Promise<void> {
  await dansTransaction(async () => {
    if (await plusRecent('variante_produit', payload.id_local, payload.date_modification)) return;

    const produitId = await idParLocal('produit', payload.produit_id_local);
    if (!produitId) throw new Error(`Variante orpheline : produit ${payload.produit_id_local}`);

    const valeurIds: number[] = [];
    for (const idLocal of payload.valeurs_id_local) {
      const valeurId = await idParLocal('valeur_dimension', idLocal);
      if (!valeurId) throw new Error(`Variante orpheline : valeur ${idLocal}`);
      valeurIds.push(valeurId);
    }

    await executer(
      `INSERT INTO variante_produit
        (id_local, produit_id, sku, signature_combinaison, prix_override, prix_achat,
         code_barre, actif, date_modification, supprime_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id_local) DO UPDATE SET
         produit_id = excluded.produit_id,
         sku = excluded.sku,
         signature_combinaison = excluded.signature_combinaison,
         prix_override = excluded.prix_override,
         prix_achat = excluded.prix_achat,
         code_barre = excluded.code_barre,
         actif = excluded.actif,
         date_modification = excluded.date_modification,
         supprime_le = excluded.supprime_le`,
      payload.id_local, produitId, payload.sku, payload.signature_combinaison,
      payload.prix_override ?? null, payload.prix_achat ?? null,
      payload.code_barre ?? null, payload.actif ? 1 : 0,
      payload.date_modification, payload.supprime_le ?? null,
    );

    const varianteId = await idParLocal('variante_produit', payload.id_local);
    if (!varianteId) throw new Error(`Variante introuvable apres upsert : ${payload.id_local}`);

    await executer('DELETE FROM variante_valeur WHERE variante_id = ?', varianteId);
    for (const valeurId of valeurIds) {
      await executer(
        `INSERT INTO variante_valeur (variante_id, valeur_id)
         VALUES (?, ?) ON CONFLICT(variante_id, valeur_id) DO NOTHING`,
        varianteId, valeurId,
      );
    }
  });
}

interface LigneVariante {
  id: number;
  id_local: string;
  produit_id: number;
  sku: string;
  signature_combinaison: string;
  prix_override: number | null;
  prix_achat: number | null;
  code_barre: string | null;
  actif: number | boolean;
}

export async function listerVariantesProduit(produitId: number): Promise<VarianteProduitLocale[]> {
  const lignes = await lireTout<LigneVariante>(
    `SELECT v.id, v.id_local, v.produit_id, v.sku, v.signature_combinaison,
            v.prix_override, v.prix_achat, v.code_barre, v.actif
       FROM variante_produit v
      WHERE v.produit_id = ?
        AND v.actif = 1
        AND v.supprime_le IS NULL
      ORDER BY v.sku`,
    produitId,
  );

  const resultat: VarianteProduitLocale[] = [];
  for (const ligne of lignes) {
    const valeurs = await lireTout<{
      id_local: string;
      dimension_id_local: string;
      dimension_code: string;
      dimension_nom: string;
      code: string;
      nom: string;
      ordre: number;
      code_hex: string | null;
    }>(
      `SELECT vd.id_local, d.id_local AS dimension_id_local,
              d.code AS dimension_code, d.nom AS dimension_nom,
              vd.code, vd.nom, vd.ordre, vd.code_hex
         FROM variante_valeur vv
         JOIN valeur_dimension vd ON vd.id = vv.valeur_id
         JOIN dimension_variante d ON d.id = vd.dimension_id
        WHERE vv.variante_id = ?
          AND vd.supprime_le IS NULL
          AND d.supprime_le IS NULL
        ORDER BY d.ordre, vd.ordre, vd.nom`,
      ligne.id,
    );

    resultat.push({
      id: ligne.id,
      idLocal: ligne.id_local,
      produitId: ligne.produit_id,
      sku: ligne.sku,
      signatureCombinaison: ligne.signature_combinaison,
      prixOverride: ligne.prix_override,
      prixAchat: ligne.prix_achat,
      codeBarre: ligne.code_barre,
      actif: versBooleen(ligne.actif),
      valeurs: valeurs.map((v): ValeurVarianteLocale => ({
        idLocal: v.id_local,
        dimensionIdLocal: v.dimension_id_local,
        dimensionCode: v.dimension_code,
        dimensionNom: v.dimension_nom,
        code: v.code,
        nom: v.nom,
        ordre: v.ordre,
        codeHex: v.code_hex,
      })),
    });
  }
  return resultat;
}
