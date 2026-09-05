/**
 * Enregistrement d'une vente.
 *
 * Regle non negociable : la vente, ses lignes et les mouvements de stock sont
 * ecrits dans UNE SEULE transaction. Si l'application est tuee au milieu (le
 * systeme Android le fait sans prevenir quand la memoire manque), soit tout est
 * enregistre, soit rien. Sans cela on obtient des ventes sans lignes, ou du
 * stock retire pour une vente qui n'existe pas.
 */
import type * as SQLite from 'expo-sqlite';

import { obtenirBase } from '../db/database';
import type { LigneVente, ModePaiement, Produit } from '../domain/types';
import { exigerEcriture } from './abonnement';
import { verifierStock } from './notifications';

export interface ArticlePanier {
  produit: Produit;
  /** Unite choisie : l'unite de base, ou une sous-unite (carton, sac...). */
  unite: string;
  /** Combien d'unites de base vaut l'unite choisie. */
  facteur: number;
  quantite: number;
  prixUnitaire: number;
}

export interface DemandeVente {
  articles: ArticlePanier[];
  modePaiement: ModePaiement;
  montantPaye: number;
  clientId?: number | null;
  utilisateurId?: number | null;
}

export interface ResultatVente {
  venteId: number;
  numero: string;
  total: number;
  lignes: LigneVente[];
}

export class StockInsuffisant extends Error {
  constructor(readonly produit: string, readonly demande: number, readonly dispo: number) {
    super(`Stock insuffisant pour ${produit} : ${demande} demande(s), ${dispo} disponible(s).`);
    this.name = 'StockInsuffisant';
  }
}

/** Le franc CFA n'a pas de centimes : chaque ligne est arrondie au franc. */
function arrondir(valeur: number): number {
  return Math.round(valeur);
}

export function calculerLigne(article: ArticlePanier): LigneVente {
  const quantiteBase = article.quantite * article.facteur;
  const total = arrondir(article.quantite * article.prixUnitaire);
  // Le cout est celui de l'unite de base, ramene a l'unite vendue.
  const coutUnitaire = arrondir(article.produit.prixAchat * article.facteur);
  const beneficeTotal = total - arrondir(coutUnitaire * article.quantite);

  return {
    produitId: article.produit.id,
    libelle: article.produit.nom,
    unite: article.unite,
    facteur: article.facteur,
    quantite: article.quantite,
    quantiteBase,
    prixUnitaire: arrondir(article.prixUnitaire),
    coutUnitaire,
    total,
    beneficeTotal,
  };
}

/** Total du panier : somme des lignes DEJA arrondies, pour coller au ticket. */
export function calculerTotal(articles: ArticlePanier[]): number {
  return articles.reduce((somme, a) => somme + calculerLigne(a).total, 0);
}

export async function enregistrerVente(demande: DemandeVente): Promise<ResultatVente> {
  // Le verrou est ici et non dans l'ecran : un bouton grise se
  // contourne, une fonction qui refuse d'ecrire, non.
  await exigerEcriture();

  if (demande.articles.length === 0) {
    throw new Error('Le panier est vide.');
  }

  const db = await obtenirBase();
  const lignes = demande.articles.map(calculerLigne);
  const total = lignes.reduce((s, l) => s + l.total, 0);
  const beneficeTotal = lignes.reduce((s, l) => s + l.beneficeTotal, 0);
  const maintenant = new Date().toISOString();

  let resultat: ResultatVente | null = null;

  await db.withTransactionAsync(async () => {
    // Le stock est relu DANS la transaction : le lire avant laisserait une
    // fenetre ou deux ventes simultanees passeraient le meme article.
    for (const ligne of lignes) {
      const p = await db.getFirstAsync<{ nom: string; quantite_base: number; gestion_stock: number }>(
        'SELECT nom, quantite_base, gestion_stock FROM produit WHERE id = ?',
        ligne.produitId,
      );
      if (!p) throw new Error(`Produit ${ligne.produitId} introuvable.`);
      if (p.gestion_stock && p.quantite_base < ligne.quantiteBase) {
        throw new StockInsuffisant(p.nom, ligne.quantiteBase, p.quantite_base);
      }
    }

    const numero = await genererNumero(db);
    const idLocal = genererIdLocal();
    const reste = total - demande.montantPaye;
    const statut = reste <= 0 ? 'payee' : demande.montantPaye > 0 ? 'partielle' : 'impayee';

    const vente = await db.runAsync(
      `INSERT INTO vente (id_local, numero, client_id, utilisateur_id, date_vente,
                          total, montant_paye, mode_paiement, statut, benefice_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      idLocal,
      numero,
      demande.clientId ?? null,
      demande.utilisateurId ?? null,
      maintenant,
      total,
      demande.montantPaye,
      demande.modePaiement,
      statut,
      beneficeTotal,
    );
    const venteId = vente.lastInsertRowId;

    for (const l of lignes) {
      await db.runAsync(
        `INSERT INTO ligne_vente (vente_id, produit_id, libelle, unite, facteur,
                                  quantite, quantite_base, prix_unitaire,
                                  cout_unitaire, total, benefice_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        venteId, l.produitId, l.libelle, l.unite, l.facteur,
        l.quantite, l.quantiteBase, l.prixUnitaire,
        l.coutUnitaire, l.total, l.beneficeTotal,
      );

      const avant = await db.getFirstAsync<{ quantite_base: number; gestion_stock: number }>(
        'SELECT quantite_base, gestion_stock FROM produit WHERE id = ?',
        l.produitId,
      );
      if (!avant?.gestion_stock) continue;

      const apres = avant.quantite_base - l.quantiteBase;
      await db.runAsync(
        'UPDATE produit SET quantite_base = ?, date_modification = ? WHERE id = ?',
        apres, maintenant, l.produitId,
      );
      await db.runAsync(
        `INSERT INTO mouvement_stock (id_local, produit_id, nature, source_operation, quantite,
                                      unite, quantite_base, stock_avant, stock_apres,
                                      prix_unitaire, reference, date_mouvement)
         VALUES (lower(hex(randomblob(16))), ?, 'SORTIE', 'VENTE', ?, ?, ?, ?, ?, ?, ?, ?)`,
        l.produitId, l.quantite, l.unite, l.quantiteBase,
        avant.quantite_base, apres, l.prixUnitaire, numero, maintenant,
      );
    }

    resultat = { venteId, numero, total, lignes };
  });

  if (!resultat) throw new Error("La vente n'a pas pu etre enregistree.");

  // Le type est reaffirme ici : `resultat` est affecte DANS la transaction,
  // et l'analyse de flux de TypeScript ne suit pas les affectations faites
  // dans une fonction de rappel — elle le reduit donc a `never`.
  const enregistree: ResultatVente = resultat;

  // APRES la transaction, jamais dedans : une notification qui echoue ne doit
  // pas annuler une vente deja encaissee. L'appel n'est pas attendu — le
  // vendeur rend la monnaie, il n'a pas a patienter pendant qu'on evalue le
  // stock.
  void verifierStock(enregistree.lignes.map((l) => l.produitId));

  return enregistree;
}

/** Numero du jour : V-AAAAMMJJ-0001, remis a 1 chaque jour. */
async function genererNumero(db: SQLite.SQLiteDatabase): Promise<string> {
  const d = new Date();
  const deux = (n: number) => String(n).padStart(2, '0');
  const jour = `${d.getFullYear()}${deux(d.getMonth() + 1)}${deux(d.getDate())}`;
  const prefixe = `V-${jour}-`;

  const ligne = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM vente WHERE numero LIKE ?',
    prefixe + '%',
  );
  return prefixe + String((ligne?.n ?? 0) + 1).padStart(4, '0');
}

function genererIdLocal(): string {
  const hasard = Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${hasard}`;
}
