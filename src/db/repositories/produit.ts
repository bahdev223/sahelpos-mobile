/**
 * Depot des produits, des sous-unites et des categories.
 */
import type { Produit, SousUnite } from '../../domain/types';
import { seuilAlerteStock } from '../../domain/stock';
import {
  dansTransaction,
  executer,
  genererIdLocal,
  lirePremier,
  lireTout,
  maintenant,
  versBooleen,
} from './base';
import { marquerChangement } from '../../services/synchronisation';
import { exigerEcriture } from '../../services/abonnement';

interface LigneProduit {
  id: number;
  id_local: string;
  nom: string;
  categorie: string | null;
  marque: string;
  reference_fabricant: string;
  code_barre: string | null;
  prix_unitaire: number;
  prix_gros: number;
  prix_achat: number;
  unite_base: string;
  quantite_base: number;
  stock_min: number;
  gestion_stock: number;
  chemin_image: string | null;
  actif: number;
}

const COLONNES =
  'id, id_local, nom, categorie, marque, reference_fabricant, code_barre, prix_unitaire, prix_gros, prix_achat, ' +
  'unite_base, quantite_base, stock_min, gestion_stock, chemin_image, actif';

function versProduit(l: LigneProduit): Produit {
  return {
    id: l.id,
    idLocal: l.id_local,
    nom: l.nom,
    categorie: l.categorie,
    marque: l.marque,
    referenceFabricant: l.reference_fabricant,
    codeBarre: l.code_barre,
    prixUnitaire: l.prix_unitaire,
    prixGros: l.prix_gros,
    prixAchat: l.prix_achat,
    uniteBase: l.unite_base,
    quantiteBase: l.quantite_base,
    stockMin: l.stock_min,
    gestionStock: versBooleen(l.gestion_stock),
    cheminImage: l.chemin_image,
    actif: versBooleen(l.actif),
  };
}

export interface FiltreProduit {
  recherche?: string;
  categorie?: string;
  actifsSeulement?: boolean;
  limite?: number;
}

export async function listerProduits(filtre: FiltreProduit = {}): Promise<Produit[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filtre.actifsSeulement !== false) conditions.push('actif = 1');
  if (filtre.recherche?.trim()) {
    // Le commercant tape un fragment de nom, ou scanne un code : on cherche
    // dans les deux sans lui demander de choisir.
    conditions.push('(nom LIKE ? OR code_barre LIKE ? OR marque LIKE ? OR reference_fabricant LIKE ?)');
    const motif = `%${filtre.recherche.trim()}%`;
    params.push(motif, motif, motif, motif);
  }
  if (filtre.categorie) {
    conditions.push('categorie = ?');
    params.push(filtre.categorie);
  }

  const ou = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const lignes = await lireTout<LigneProduit>(
    `SELECT ${COLONNES} FROM produit${ou} ORDER BY nom LIMIT ?`,
    ...params,
    filtre.limite ?? 200,
  );
  return lignes.map(versProduit);
}

export async function obtenirProduit(id: number): Promise<Produit | null> {
  const l = await lirePremier<LigneProduit>(
    `SELECT ${COLONNES} FROM produit WHERE id = ?`,
    id,
  );
  return l ? versProduit(l) : null;
}

export async function trouverParCodeBarre(code: string): Promise<Produit | null> {
  const l = await lirePremier<LigneProduit>(
    `SELECT ${COLONNES} FROM produit WHERE code_barre = ? AND actif = 1`,
    code,
  );
  return l ? versProduit(l) : null;
}

export async function listerCategories(): Promise<string[]> {
  const lignes = await lireTout<{ categorie: string | null }>(
    "SELECT DISTINCT categorie FROM produit " +
      "WHERE categorie IS NOT NULL AND categorie <> '' ORDER BY categorie",
  );
  return lignes.map((l) => l.categorie ?? '').filter((c) => c.length > 0);
}

export async function listerSousUnites(produitId: number): Promise<SousUnite[]> {
  const lignes = await lireTout<{
    id: number;
    produit_id: number;
    nom: string;
    facteur: number;
    prix: number;
    prix_gros: number;
  }>(
    'SELECT id, produit_id, nom, facteur, prix, prix_gros FROM sous_unite ' +
      'WHERE produit_id = ? ORDER BY facteur',
    produitId,
  );
  return lignes.map((l) => ({
    id: l.id,
    produitId: l.produit_id,
    nom: l.nom,
    facteur: l.facteur,
    prix: l.prix,
    prixGros: l.prix_gros,
  }));
}

export interface SaisieProduit {
  nom: string;
  categorie?: string | null;
  codeBarre?: string | null;
  marque?: string;
  referenceFabricant?: string;
  prixUnitaire: number;
  prixGros?: number;
  prixAchat: number;
  uniteBase: string;
  quantiteBase?: number;
  stockMin?: number;
  gestionStock?: boolean;
  cheminImage?: string | null;
  actif?: boolean;
  sousUnites?: Array<{ nom: string; facteur: number; prix: number; prixGros?: number }>;
}

export async function creerProduit(saisie: SaisieProduit): Promise<number> {
  await exigerEcriture('produits');
  return dansTransaction(async () => {
    const idLocal = genererIdLocal();
    const horodatage = maintenant();
    const r = await executer(
      `INSERT INTO produit
       (id_local, nom, categorie, marque, reference_fabricant, code_barre,
        prix_unitaire, prix_gros, prix_achat, unite_base, quantite_base, stock_min,
        gestion_stock, chemin_image, actif, date_creation, date_modification)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      idLocal,
      saisie.nom.trim(),
      saisie.categorie ?? null,
      saisie.marque?.trim() ?? '',
      saisie.referenceFabricant?.trim() ?? '',
      saisie.codeBarre?.trim() || null,
      Math.round(saisie.prixUnitaire),
      Math.round(saisie.prixGros ?? 0),
      Math.round(saisie.prixAchat),
      saisie.uniteBase || 'Unite',
      saisie.quantiteBase ?? 0,
      saisie.stockMin ?? 0,
      saisie.gestionStock === false ? 0 : 1,
      saisie.cheminImage ?? null,
      saisie.actif === false ? 0 : 1,
      horodatage,
      horodatage,
    );
    const id = r.lastInsertRowId;
    for (const su of saisie.sousUnites ?? []) {
      await executer(
        'INSERT INTO sous_unite (produit_id, nom, facteur, prix, prix_gros) VALUES (?, ?, ?, ?, ?)',
        id,
        su.nom,
        su.facteur,
        Math.round(su.prix),
        Math.round(su.prixGros ?? 0),
      );
    }
    await marquerChangement('produit', idLocal);
    return id;
  });
}

export async function modifierProduit(id: number, saisie: SaisieProduit): Promise<void> {
  await exigerEcriture('produits');
  await dansTransaction(async () => {
    const existant = await lirePremier<{ id_local: string }>(
      'SELECT id_local FROM produit WHERE id = ?',
      id,
    );
    await executer(
      `UPDATE produit SET nom = ?, categorie = ?, marque = ?, reference_fabricant = ?,
                          code_barre = ?, prix_unitaire = ?, prix_gros = ?,
                          prix_achat = ?, unite_base = ?, stock_min = ?,
                          gestion_stock = ?, chemin_image = ?, actif = ?,
                          date_modification = ?
       WHERE id = ?`,
      saisie.nom.trim(),
      saisie.categorie ?? null,
      saisie.marque?.trim() ?? '',
      saisie.referenceFabricant?.trim() ?? '',
      saisie.codeBarre?.trim() || null,
      Math.round(saisie.prixUnitaire),
      Math.round(saisie.prixGros ?? 0),
      Math.round(saisie.prixAchat),
      saisie.uniteBase || 'Unite',
      saisie.stockMin ?? 0,
      saisie.gestionStock === false ? 0 : 1,
      saisie.cheminImage ?? null,
      saisie.actif === false ? 0 : 1,
      maintenant(),
      id,
    );

    // Les sous-unites sont remplacees en bloc : gerer un differentiel ligne a
    // ligne pour trois ou quatre entrees couterait plus cher en code qu'il ne
    // rapporte, et laisserait des orphelines si l'ecriture s'interrompt.
    if (saisie.sousUnites) {
      await executer('DELETE FROM sous_unite WHERE produit_id = ?', id);
      for (const su of saisie.sousUnites) {
        await executer(
          'INSERT INTO sous_unite (produit_id, nom, facteur, prix, prix_gros) VALUES (?, ?, ?, ?, ?)',
          id,
          su.nom,
          su.facteur,
          Math.round(su.prix),
          Math.round(su.prixGros ?? 0),
        );
      }
    }
    await marquerChangement('produit', existant?.id_local ?? '');
  });
}

/**
 * Un produit deja vendu, inventorie ou mouvemente n'est jamais supprime : son
 * historique deviendrait illisible et les totaux passes faux. Il est desactive,
 * ce qui le retire des listes de vente sans toucher au passe.
 */
export async function supprimerOuDesactiver(
  id: number,
): Promise<'supprime' | 'desactive'> {
  await exigerEcriture('produits');
  const usages = await lirePremier<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM ligne_vente WHERE produit_id = ?)
          + (SELECT COUNT(*) FROM ligne_inventaire WHERE produit_id = ?)
          + (SELECT COUNT(*) FROM mouvement_stock WHERE produit_id = ?) AS n`,
    id,
    id,
    id,
  );

  if ((usages?.n ?? 0) > 0) {
    const existant = await lirePremier<{ id_local: string }>(
      'SELECT id_local FROM produit WHERE id = ?',
      id,
    );
    await executer(
      'UPDATE produit SET actif = 0, date_modification = ? WHERE id = ?',
      maintenant(),
      id,
    );
    await marquerChangement('produit', existant?.id_local ?? '');
    return 'desactive';
  }

  await dansTransaction(async () => {
    await executer('DELETE FROM sous_unite WHERE produit_id = ?', id);
    await executer('DELETE FROM produit WHERE id = ?', id);
  });
  return 'supprime';
}

/** Produits dont le stock est retombe au niveau d'alerte, les plus bas d'abord. */
export async function listerAlertesStock(): Promise<Produit[]> {
  const lignes = await lireTout<LigneProduit>(
    `SELECT ${COLONNES} FROM produit
     WHERE actif = 1 AND gestion_stock = 1
       AND (
         (stock_min > 0 AND quantite_base <= stock_min)
         OR (stock_min <= 0 AND quantite_base <= 10)
       )
     ORDER BY nom`,
  );
  return lignes
    .filter((ligne) => ligne.quantite_base <= seuilAlerteStock(ligne.stock_min))
    .sort(
      (a, b) =>
        a.quantite_base / seuilAlerteStock(a.stock_min) -
          b.quantite_base / seuilAlerteStock(b.stock_min) ||
        a.nom.localeCompare(b.nom, 'fr'),
    )
    .map(versProduit);
}
