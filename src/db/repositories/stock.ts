/**
 * Depot du stock : journal des mouvements et ecritures d'entree, sortie et
 * ajustement.
 *
 * Regle centrale : le stock d'un produit et sa trace dans le journal sont
 * ecrits ENSEMBLE, dans une seule transaction. Un stock modifie sans mouvement
 * correspondant est invisible : le commercant constate un ecart et n'a aucun
 * moyen de savoir d'ou il vient.
 */
import type { NatureMouvement, SourceOperation } from '../../domain/types';
import { dansTransaction, executer, lirePremier, lireTout, maintenant } from './base';

export interface Mouvement {
  id: number;
  produitId: number;
  produitNom: string;
  nature: NatureMouvement;
  sourceOperation: SourceOperation;
  quantite: number;
  unite: string | null;
  quantiteBase: number;
  stockAvant: number | null;
  stockApres: number | null;
  prixUnitaire: number | null;
  reference: string | null;
  motif: string | null;
  utilisateur: string | null;
  dateMouvement: string;
}

export interface FiltreMouvement {
  produitId?: number;
  nature?: NatureMouvement;
  source?: SourceOperation;
  debut?: string;
  fin?: string;
  limite?: number;
}

export async function listerMouvements(
  filtre: FiltreMouvement = {},
): Promise<Mouvement[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filtre.produitId) {
    conditions.push('m.produit_id = ?');
    params.push(filtre.produitId);
  }
  if (filtre.nature) {
    conditions.push('m.nature = ?');
    params.push(filtre.nature);
  }
  if (filtre.source) {
    conditions.push('m.source_operation = ?');
    params.push(filtre.source);
  }
  if (filtre.debut) {
    conditions.push('m.date_mouvement >= ?');
    params.push(filtre.debut);
  }
  if (filtre.fin) {
    conditions.push('m.date_mouvement <= ?');
    params.push(filtre.fin);
  }

  const ou = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  return lireTout<Mouvement>(
    `SELECT m.id, m.produit_id AS produitId, p.nom AS produitNom, m.nature,
            m.source_operation AS sourceOperation, m.quantite, m.unite,
            m.quantite_base AS quantiteBase, m.stock_avant AS stockAvant,
            m.stock_apres AS stockApres, m.prix_unitaire AS prixUnitaire,
            m.reference, m.motif, m.utilisateur,
            m.date_mouvement AS dateMouvement
     FROM mouvement_stock m JOIN produit p ON p.id = m.produit_id${ou}
     ORDER BY m.date_mouvement DESC, m.id DESC LIMIT ?`,
    ...params,
    filtre.limite ?? 200,
  );
}

export interface EcritureStock {
  produitId: number;
  nature: NatureMouvement;
  source: SourceOperation;
  /** Quantite dans l'unite saisie par l'utilisateur. */
  quantite: number;
  unite?: string;
  /** Combien d'unites de base vaut l'unite saisie (1 pour l'unite de base). */
  facteur?: number;
  prixUnitaire?: number;
  reference?: string;
  motif?: string;
  utilisateur?: string;
}

export class StockInsuffisantStock extends Error {
  constructor(readonly produit: string, readonly demande: number, readonly dispo: number) {
    super(
      `Stock insuffisant pour ${produit} : ${demande} demande(s), ${dispo} disponible(s).`,
    );
    this.name = 'StockInsuffisantStock';
  }
}

/**
 * Applique un mouvement et met le stock a jour.
 *
 * Le stock est relu DANS la transaction : le lire avant laisserait une fenetre
 * pendant laquelle une vente simultanee pourrait vider le produit.
 */
export async function appliquerMouvement(e: EcritureStock): Promise<number> {
  const facteur = e.facteur ?? 1;
  const quantiteBase = e.quantite * facteur;
  if (quantiteBase <= 0) {
    throw new Error('La quantite doit etre superieure a zero.');
  }

  return dansTransaction(async () => {
    const p = await lirePremier<{
      nom: string;
      quantite_base: number;
      gestion_stock: number;
    }>('SELECT nom, quantite_base, gestion_stock FROM produit WHERE id = ?', e.produitId);
    if (!p) throw new Error('Produit introuvable.');

    // Un produit sans gestion de stock (un service, une prestation) est trace
    // dans le journal mais n'a pas de quantite a decompter.
    if (!p.gestion_stock) {
      await ecrireMouvement(e, quantiteBase, null, null);
      return 0;
    }

    const avant = p.quantite_base;
    let apres: number;

    if (e.nature === 'ENTREE') {
      apres = avant + quantiteBase;
    } else if (e.nature === 'SORTIE') {
      if (avant < quantiteBase) {
        throw new StockInsuffisantStock(p.nom, quantiteBase, avant);
      }
      apres = avant - quantiteBase;
    } else {
      // AJUSTEMENT : la quantite saisie est le stock REEL constate, pas un
      // ecart. C'est ce que compte le commercant en rayon.
      apres = quantiteBase;
    }

    await executer(
      'UPDATE produit SET quantite_base = ?, date_modification = ? WHERE id = ?',
      apres,
      maintenant(),
      e.produitId,
    );
    await ecrireMouvement(e, e.nature === 'AJUSTEMENT' ? apres - avant : quantiteBase, avant, apres);
    return apres;
  });
}

async function ecrireMouvement(
  e: EcritureStock,
  quantiteBase: number,
  avant: number | null,
  apres: number | null,
): Promise<void> {
  await executer(
    `INSERT INTO mouvement_stock (id_local, produit_id, nature, source_operation, quantite,
                                  unite, quantite_base, stock_avant, stock_apres,
                                  prix_unitaire, reference, motif, utilisateur,
                                  date_mouvement)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    e.produitId,
    e.nature,
    e.source,
    e.quantite,
    e.unite ?? null,
    quantiteBase,
    avant,
    apres,
    e.prixUnitaire ?? null,
    e.reference ?? null,
    e.motif ?? null,
    e.utilisateur ?? null,
    maintenant(),
  );
}

export interface ValeurStock {
  nbProduits: number;
  /** Ce que le stock a coute : sert a savoir combien d'argent dort en rayon. */
  valeurAchat: number;
  /** Ce qu'il rapporterait s'il etait entierement vendu. */
  valeurVente: number;
}

export async function valeurStock(): Promise<ValeurStock> {
  const l = await lirePremier<{ n: number; achat: number | null; vente: number | null }>(
    `SELECT COUNT(*) AS n,
            SUM(quantite_base * prix_achat) AS achat,
            SUM(quantite_base * prix_unitaire) AS vente
     FROM produit WHERE actif = 1 AND gestion_stock = 1`,
  );
  return {
    nbProduits: l?.n ?? 0,
    valeurAchat: Math.round(l?.achat ?? 0),
    valeurVente: Math.round(l?.vente ?? 0),
  };
}
