import type { Produit } from '../domain/types';
import type { VarianteProduitLocale } from '../domain/habillement';
import { lireTout } from '../db/repositories/base';

export interface ModeleHabillementMobile {
  produit: Produit;
  categorieMode: string | null;
  marque: string | null;
  saison: string | null;
  collection: string | null;
  variantes: VarianteProduitLocale[];
  stockTotal: number;
  stockDisponible: number;
  tailles: string[];
  couleurs: Array<{ nom: string; codeHex: string | null }>;
}

interface LigneModele {
  id: number;
  id_local: string;
  nom: string;
  categorie: string | null;
  code_barre: string | null;
  prix_unitaire: number;
  prix_achat: number;
  unite_base: string;
  quantite_base: number;
  stock_min: number;
  gestion_stock: number;
  chemin_image: string | null;
  actif: number;
  categorie_mode: string | null;
  marque: string | null;
  saison: string | null;
  collection: string | null;
}

export async function listerModelesHabillement(): Promise<ModeleHabillementMobile[]> {
  const lignes = await lireTout<LigneModele>(
    `SELECT p.id, p.id_local, p.nom, p.categorie, p.code_barre, p.prix_unitaire,
            p.prix_achat, p.unite_base, p.quantite_base, p.stock_min,
            p.gestion_stock, p.chemin_image, p.actif,
            cm.nom AS categorie_mode, ma.nom AS marque, sa.nom AS saison,
            co.nom AS collection
       FROM produit p
       JOIN hab_produit hp ON hp.produit_id = p.id AND hp.supprime_le IS NULL
       LEFT JOIN hab_categorie_mode cm ON cm.id = hp.categorie_mode_id
       LEFT JOIN hab_marque ma ON ma.id = hp.marque_id
       LEFT JOIN hab_saison sa ON sa.id = hp.saison_id
       LEFT JOIN hab_collection co ON co.id = hp.collection_id
      WHERE p.actif = 1
      ORDER BY p.nom COLLATE NOCASE`,
  );

  const resultat: ModeleHabillementMobile[] = [];
  for (const ligne of lignes) {
    const variantes = await lireTout<{
      id: number; id_local: string; produit_id: number; sku: string;
      signature_combinaison: string; prix_override: number | null; prix_achat: number | null;
      code_barre: string | null; actif: number; stock_actuel: number; stock_disponible: number;
    }>(
      `SELECT id, id_local, produit_id, sku, signature_combinaison, prix_override,
              prix_achat, code_barre, actif, stock_actuel, stock_disponible
         FROM variante_produit
        WHERE produit_id = ? AND actif = 1 AND supprime_le IS NULL
        ORDER BY sku`,
      ligne.id,
    );

    const variantesCompletes: VarianteProduitLocale[] = [];
    for (const variante of variantes) {
      const valeurs = await lireTout<{
        id_local: string; dimension_id_local: string; dimension_code: string;
        dimension_nom: string; code: string; nom: string; ordre: number; code_hex: string | null;
      }>(
        `SELECT vd.id_local, d.id_local AS dimension_id_local,
                d.code AS dimension_code, d.nom AS dimension_nom,
                vd.code, vd.nom, vd.ordre, vd.code_hex
           FROM variante_valeur vv
           JOIN valeur_dimension vd ON vd.id = vv.valeur_id
           JOIN dimension_variante d ON d.id = vd.dimension_id
          WHERE vv.variante_id = ?
            AND vd.supprime_le IS NULL AND d.supprime_le IS NULL
          ORDER BY d.ordre, vd.ordre`,
        variante.id,
      );
      variantesCompletes.push({
        id: variante.id,
        idLocal: variante.id_local,
        produitId: variante.produit_id,
        sku: variante.sku,
        signatureCombinaison: variante.signature_combinaison,
        prixOverride: variante.prix_override,
        prixAchat: variante.prix_achat,
        codeBarre: variante.code_barre,
        actif: Boolean(variante.actif),
        stockActuel: Number(variante.stock_actuel || 0),
        stockDisponible: Number(variante.stock_disponible || 0),
        valeurs: valeurs.map(v => ({
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

    const tailles = new Set<string>();
    const couleurs = new Map<string, string | null>();
    for (const variante of variantesCompletes) {
      for (const valeur of variante.valeurs) {
        const code = valeur.dimensionCode.toUpperCase();
        const nomDimension = valeur.dimensionNom.toLowerCase();
        if (code === 'TAILLE' || code === 'POINTURE' || nomDimension.includes('taille') || nomDimension.includes('pointure')) {
          tailles.add(valeur.nom);
        }
        if (code === 'COULEUR' || nomDimension.includes('couleur')) {
          couleurs.set(valeur.nom, valeur.codeHex);
        }
      }
    }

    resultat.push({
      produit: {
        id: ligne.id, idLocal: ligne.id_local, nom: ligne.nom, categorie: ligne.categorie,
        codeBarre: ligne.code_barre, prixUnitaire: ligne.prix_unitaire,
        prixAchat: ligne.prix_achat, uniteBase: ligne.unite_base,
        quantiteBase: ligne.quantite_base, stockMin: ligne.stock_min,
        gestionStock: Boolean(ligne.gestion_stock), cheminImage: ligne.chemin_image,
        actif: Boolean(ligne.actif),
      },
      categorieMode: ligne.categorie_mode,
      marque: ligne.marque,
      saison: ligne.saison,
      collection: ligne.collection,
      variantes: variantesCompletes,
      stockTotal: variantesCompletes.reduce((s, v) => s + v.stockActuel, 0),
      stockDisponible: variantesCompletes.reduce((s, v) => s + v.stockDisponible, 0),
      tailles: [...tailles],
      couleurs: [...couleurs].map(([nom, codeHex]) => ({ nom, codeHex })),
    });
  }
  return resultat;
}
