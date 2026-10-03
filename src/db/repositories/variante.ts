import { genererIdLocal, lirePremier, lireTout, executer, dansTransaction, maintenant } from './base';
import { marquerChangement } from '../../services/synchronisation';
import { exigerEcriture } from '../../services/abonnement';

export interface ValeurVarianteMobile {
  dimensionCode: string;
  dimensionNom: string;
  dimensionOrdre: number;
  code: string;
  nom: string;
  codeHex: string | null;
  ordre: number;
}

export interface VarianteMobile {
  id: number;
  idLocal: string;
  produitId: number;
  sku: string;
  codeBarre: string | null;
  prixOverride: number | null;
  prixAchat: number | null;
  stockActuel: number;
  actif: boolean;
  valeurs: ValeurVarianteMobile[];
}

interface LigneVariante {
  id: number;
  id_local: string;
  produit_id: number;
  sku: string;
  code_barre: string | null;
  prix_override: number | null;
  prix_achat: number | null;
  stock_actuel: number;
  actif: number;
}

async function valeurs(varianteId: number): Promise<ValeurVarianteMobile[]> {
  const lignes = await lireTout<{
    dimension_code: string;
    dimension_nom: string;
    dimension_ordre: number;
    valeur_code: string;
    valeur_nom: string;
    code_hex: string | null;
    valeur_ordre: number;
  }>(
    `SELECT dimension_code, dimension_nom, dimension_ordre,
            valeur_code, valeur_nom, code_hex, valeur_ordre
       FROM variante_valeur
      WHERE variante_id = ?
      ORDER BY dimension_ordre, valeur_ordre, valeur_nom`,
    varianteId,
  );
  return lignes.map((l) => ({
    dimensionCode: l.dimension_code,
    dimensionNom: l.dimension_nom,
    dimensionOrdre: l.dimension_ordre,
    code: l.valeur_code,
    nom: l.valeur_nom,
    codeHex: l.code_hex,
    ordre: l.valeur_ordre,
  }));
}

async function convertir(ligne: LigneVariante): Promise<VarianteMobile> {
  return {
    id: ligne.id,
    idLocal: ligne.id_local,
    produitId: ligne.produit_id,
    sku: ligne.sku,
    codeBarre: ligne.code_barre,
    prixOverride: ligne.prix_override,
    prixAchat: ligne.prix_achat,
    stockActuel: ligne.stock_actuel,
    actif: ligne.actif === 1,
    valeurs: await valeurs(ligne.id),
  };
}

export async function listerVariantesProduit(produitId: number): Promise<VarianteMobile[]> {
  const lignes = await lireTout<LigneVariante>(
    `SELECT id, id_local, produit_id, sku, code_barre, prix_override,
            prix_achat, stock_actuel, actif
       FROM variante_produit
      WHERE produit_id = ? AND actif = 1
      ORDER BY sku`,
    produitId,
  );
  return Promise.all(lignes.map(convertir));
}

export async function obtenirVariante(id: number): Promise<VarianteMobile | null> {
  const ligne = await lirePremier<LigneVariante>(
    `SELECT id, id_local, produit_id, sku, code_barre, prix_override,
            prix_achat, stock_actuel, actif
       FROM variante_produit WHERE id = ?`,
    id,
  );
  return ligne ? convertir(ligne) : null;
}

export async function trouverVarianteParCodeBarre(code: string): Promise<VarianteMobile | null> {
  const ligne = await lirePremier<LigneVariante>(
    `SELECT id, id_local, produit_id, sku, code_barre, prix_override,
            prix_achat, stock_actuel, actif
       FROM variante_produit
      WHERE code_barre = ? AND actif = 1`,
    code,
  );
  return ligne ? convertir(ligne) : null;
}

export async function stockTotalVariantes(produitId: number): Promise<number> {
  const ligne = await lirePremier<{ total: number }>(
    'SELECT COALESCE(SUM(stock_actuel), 0) AS total FROM variante_produit WHERE produit_id = ? AND actif = 1',
    produitId,
  );
  return ligne?.total ?? 0;
}

export async function dimensionsProduit(
  produitId: number,
): Promise<Array<{ code: string; nom: string; valeurs: Array<{ code: string; nom: string; codeHex: string | null }> }>> {
  const variantes = await listerVariantesProduit(produitId);
  const table = new Map<string, { code: string; nom: string; valeurs: Map<string, { code: string; nom: string; codeHex: string | null; ordre: number }> }>();
  for (const variante of variantes) {
    for (const valeur of variante.valeurs) {
      const dimension = table.get(valeur.dimensionCode) ?? {
        code: valeur.dimensionCode,
        nom: valeur.dimensionNom,
        valeurs: new Map(),
      };
      if (!dimension.valeurs.has(valeur.code)) {
        dimension.valeurs.set(valeur.code, {
          code: valeur.code,
          nom: valeur.nom,
          codeHex: valeur.codeHex,
          ordre: valeur.ordre,
        });
      }
      table.set(valeur.dimensionCode, dimension);
    }
  }
  return [...table.values()].map((d) => ({
    code: d.code,
    nom: d.nom,
    valeurs: [...d.valeurs.values()].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))
      .map(({ ordre: _ordre, ...v }) => v),
  }));
}

export function libelleVariante(variante: VarianteMobile): string {
  if (variante.valeurs.length === 0) return variante.sku;
  return variante.valeurs.map((v) => v.nom).join(' / ');
}


export interface OptionMatriceMobile {
  valeurServeurId: number;
  dimensionId: number;
  dimensionCode: string;
  dimensionNom: string;
  dimensionOrdre: number;
  code: string;
  nom: string;
  codeHex: string | null;
  ordre: number;
}

export async function optionsMatriceProduit(): Promise<
  Array<{ code: string; nom: string; ordre: number; valeurs: OptionMatriceMobile[] }>
> {
  const lignes = await lireTout<{
    valeur_serveur_id: number;
    dimension_id: number;
    dimension_code: string;
    dimension_nom: string;
    dimension_ordre: number;
    valeur_code: string;
    valeur_nom: string;
    code_hex: string | null;
    valeur_ordre: number;
  }>(
    `SELECT v.id_serveur AS valeur_serveur_id,
            d.id_serveur AS dimension_id,
            d.code AS dimension_code,
            d.nom AS dimension_nom,
            d.ordre AS dimension_ordre,
            v.code AS valeur_code,
            v.nom AS valeur_nom,
            v.code_hex,
            v.ordre AS valeur_ordre
       FROM valeur_dimension_ref v
       JOIN dimension_variante_ref d
         ON d.id_serveur = v.dimension_id_serveur
      ORDER BY d.ordre, v.ordre, v.nom`,
  );

  const table = new Map<string, {
    code: string; nom: string; ordre: number; valeurs: OptionMatriceMobile[];
  }>();
  for (const ligne of lignes) {
    const dimension = table.get(ligne.dimension_code) ?? {
      code: ligne.dimension_code,
      nom: ligne.dimension_nom,
      ordre: ligne.dimension_ordre,
      valeurs: [],
    };
    dimension.valeurs.push({
      valeurServeurId: ligne.valeur_serveur_id,
      dimensionId: ligne.dimension_id,
      dimensionCode: ligne.dimension_code,
      dimensionNom: ligne.dimension_nom,
      dimensionOrdre: ligne.dimension_ordre,
      code: ligne.valeur_code,
      nom: ligne.valeur_nom,
      codeHex: ligne.code_hex,
      ordre: ligne.valeur_ordre,
    });
    table.set(ligne.dimension_code, dimension);
  }
  return [...table.values()].sort((a, b) => a.ordre - b.ordre);
}

function produitCartesien<T>(groupes: T[][]): T[][] {
  if (groupes.length === 0) return [];
  return groupes.reduce<T[][]>(
    (acc, groupe) => acc.flatMap((base) => groupe.map((element) => [...base, element])),
    [[]],
  );
}

function skuFragment(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 12);
}

export async function genererMatriceVariantesLocale(
  produitId: number,
  selections: Record<string, OptionMatriceMobile[]>,
): Promise<number[]> {
  const produit = await lirePremier<{ id_local: string; nom: string }>(
    'SELECT id_local, nom FROM produit WHERE id = ?',
    produitId,
  );
  if (!produit) throw new Error('Modele introuvable.');

  const groupes = Object.values(selections).filter((groupe) => groupe.length > 0);
  if (groupes.length === 0) throw new Error('Choisissez au moins une taille ou une couleur.');

  const combinaisons = produitCartesien(groupes);
  const crees: number[] = [];

  await dansTransaction(async () => {
    let index = 1;
    for (const combinaison of combinaisons) {
      const signatureLocale = combinaison
        .map((v) => String(v.valeurServeurId))
        .sort((a, b) => Number(a) - Number(b))
        .join('-');

      const existante = await lirePremier<{ id: number }>(
        `SELECT vp.id
           FROM variante_produit vp
          WHERE vp.produit_id = ?
            AND (
              SELECT GROUP_CONCAT(valeur_serveur_id, '-')
                FROM (
                  SELECT vv.valeur_serveur_id
                    FROM variante_valeur vv
                   WHERE vv.variante_id = vp.id
                   ORDER BY vv.valeur_serveur_id
                )
            ) = ?`,
        produitId,
        signatureLocale,
      );
      if (existante) {
        crees.push(existante.id);
        continue;
      }

      const idLocal = genererIdLocal();
      const suffixe = combinaison.map((v) => skuFragment(v.code || v.nom)).join('-');
      const sku = `${skuFragment(produit.nom).slice(0, 8) || 'MODELE'}-${produitId}-${suffixe || index}`.slice(0, 60);
      const insertion = await executer(
        `INSERT INTO variante_produit
         (id_local, produit_id, sku, code_barre, prix_override, prix_achat,
          stock_actuel, actif, date_creation, date_modification)
         VALUES (?, ?, ?, NULL, NULL, NULL, 0, 1, ?, ?)`,
        idLocal,
        produitId,
        sku,
        maintenant(),
        maintenant(),
      );
      const varianteId = insertion.lastInsertRowId;

      for (const valeur of combinaison) {
        await executer(
          `INSERT INTO variante_valeur
           (variante_id, valeur_serveur_id, dimension_id, dimension_code,
            dimension_nom, dimension_ordre, valeur_code, valeur_nom, code_hex,
            valeur_ordre)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          varianteId,
          valeur.valeurServeurId,
          valeur.dimensionId,
          valeur.dimensionCode,
          valeur.dimensionNom,
          valeur.dimensionOrdre,
          valeur.code,
          valeur.nom,
          valeur.codeHex,
          valeur.ordre,
        );
      }
      await marquerChangement('variante', idLocal);
      crees.push(varianteId);
      index += 1;
    }
  });

  return crees;
}


export async function corrigerStockVariante(
  varianteId: number,
  stockPhysique: number,
  motif = 'Inventaire variantes',
): Promise<void> {
  await exigerEcriture();
  if (!Number.isFinite(stockPhysique) || stockPhysique < 0) {
    throw new Error('Le stock physique doit etre positif ou nul.');
  }

  await dansTransaction(async () => {
    const variante = await lirePremier<{
      id: number;
      id_local: string;
      produit_id: number;
      stock_actuel: number;
      prix_achat: number | null;
    }>(
      `SELECT id, id_local, produit_id, stock_actuel, prix_achat
         FROM variante_produit WHERE id = ? AND actif = 1`,
      varianteId,
    );
    if (!variante) throw new Error('Variante introuvable.');

    const produit = await lirePremier<{
      quantite_base: number;
      prix_achat: number;
      unite_base: string;
    }>(
      'SELECT quantite_base, prix_achat, unite_base FROM produit WHERE id = ?',
      variante.produit_id,
    );
    if (!produit) throw new Error('Modele introuvable.');

    const ancien = Number(variante.stock_actuel || 0);
    const nouveau = Math.round(stockPhysique * 1000) / 1000;
    const delta = Math.round((nouveau - ancien) * 1000) / 1000;
    if (delta === 0) return;

    const horodatage = maintenant();
    await executer(
      `UPDATE variante_produit
          SET stock_actuel = ?, date_modification = ?
        WHERE id = ?`,
      nouveau,
      horodatage,
      variante.id,
    );
    await executer(
      `UPDATE produit
          SET quantite_base = MAX(0, quantite_base + ?), date_modification = ?
        WHERE id = ?`,
      delta,
      horodatage,
      variante.produit_id,
    );

    const mouvementId = genererIdLocal();
    await executer(
      `INSERT INTO mouvement_stock
       (id_local, produit_id, variante_id, nature, source_operation, quantite,
        unite, quantite_base, stock_avant, stock_apres, prix_unitaire,
        reference, motif, utilisateur, date_mouvement)
       VALUES (?, ?, ?, 'AJUSTEMENT', 'INVENTAIRE', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      mouvementId,
      variante.produit_id,
      variante.id,
      nouveau,
      produit.unite_base,
      delta,
      ancien,
      nouveau,
      variante.prix_achat ?? produit.prix_achat,
      `INV-VAR-${variante.id_local.slice(0, 8)}`,
      motif,
      horodatage,
    );
    await marquerChangement('mouvement', mouvementId);
  });
}
