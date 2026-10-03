import { lirePremier, lireTout } from './base';

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
