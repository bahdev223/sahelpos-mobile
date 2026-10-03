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
import { genererIdLocal } from '../db/repositories/base';
import type { LigneVente, ModePaiement, Produit } from '../domain/types';
import type { VarianteMobile } from '../db/repositories/variante';
import { libelleVariante } from '../db/repositories/variante';
import { exigerEcriture } from './abonnement';
import { verifierAccesCaisse } from './auth';
import { verifierStock } from './notifications';
import { marquerChangement } from './synchronisation';

export interface ArticlePanier {
  produit: Produit;
  /** Unite choisie : l'unite de base, ou une sous-unite (carton, sac...). */
  unite: string;
  /** Combien d'unites de base vaut l'unite choisie. */
  facteur: number;
  quantite: number;
  prixUnitaire: number;
  /** Declinaison exacte vendue pour les profils a variantes (taille/couleur). */
  variante?: VarianteMobile | null;
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
  const coutBase = article.variante?.prixAchat ?? article.produit.prixAchat;
  const coutUnitaire = arrondir(coutBase * article.facteur);
  const beneficeTotal = total - arrondir(coutUnitaire * article.quantite);
  const libelle = article.variante
    ? `${article.produit.nom} - ${libelleVariante(article.variante)}`
    : article.produit.nom;

  return {
    produitId: article.produit.id,
    libelle,
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
  await verifierAccesCaisse(demande.utilisateurId);

  if (demande.articles.length === 0) {
    throw new Error('Le panier est vide.');
  }

  for (const article of demande.articles) {
    if (!Number.isFinite(article.quantite) || article.quantite <= 0 ||
        !Number.isFinite(article.facteur) || article.facteur <= 0) {
      throw new Error('La quantite et le facteur doivent etre positifs.');
    }
    if (!Number.isFinite(article.prixUnitaire) || article.prixUnitaire < 0 ||
        !Number.isFinite(article.produit.prixAchat) || article.produit.prixAchat < 0) {
      throw new Error('Le prix de vente et le cout doivent etre valides.');
    }
  }

  const db = await obtenirBase();
  const lignes = demande.articles.map(calculerLigne);
  const total = lignes.reduce((s, l) => s + l.total, 0);
  if (!Number.isInteger(demande.montantPaye) || demande.montantPaye < 0 || demande.montantPaye > total) {
    throw new Error('Le montant paye doit etre compris entre zero et le total.');
  }
  if (demande.montantPaye < total && !demande.clientId) {
    throw new Error('Un client est obligatoire pour une vente non entierement payee.');
  }
  const beneficeTotal = lignes.reduce((s, l) => s + l.beneficeTotal, 0);
  const maintenant = new Date().toISOString();

  let resultat: ResultatVente | null = null;

  await db.withTransactionAsync(async () => {
    // Le stock est relu DANS la transaction : le lire avant laisserait une
    // fenetre ou deux ventes simultanees passeraient le meme article.
    const demandesParProduit = new Map<number, number>();
    const demandesParVariante = new Map<number, { quantite: number; nom: string }>();
    for (let i = 0; i < lignes.length; i++) {
      const ligne = lignes[i];
      const article = demande.articles[i];
      if (article.variante) {
        const courant = demandesParVariante.get(article.variante.id);
        demandesParVariante.set(article.variante.id, {
          quantite: (courant?.quantite ?? 0) + ligne.quantiteBase,
          nom: ligne.libelle,
        });
      } else {
        demandesParProduit.set(
          ligne.produitId,
          (demandesParProduit.get(ligne.produitId) ?? 0) + ligne.quantiteBase,
        );
      }
    }
    for (const [produitId, quantiteDemandee] of demandesParProduit) {
      const p = await db.getFirstAsync<{ nom: string; quantite_base: number; gestion_stock: number }>(
        'SELECT nom, quantite_base, gestion_stock FROM produit WHERE id = ?',
        produitId,
      );
      if (!p) throw new Error(`Produit ${produitId} introuvable.`);
      if (p.gestion_stock && p.quantite_base < quantiteDemandee) {
        throw new StockInsuffisant(p.nom, quantiteDemandee, p.quantite_base);
      }
    }
    for (const [varianteId, demandeVariante] of demandesParVariante) {
      const v = await db.getFirstAsync<{ stock_actuel: number; actif: number }>(
        'SELECT stock_actuel, actif FROM variante_produit WHERE id = ?',
        varianteId,
      );
      if (!v || v.actif !== 1) throw new Error(`Variante introuvable : ${demandeVariante.nom}.`);
      if (v.stock_actuel < demandeVariante.quantite) {
        throw new StockInsuffisant(demandeVariante.nom, demandeVariante.quantite, v.stock_actuel);
      }
    }

    const numero = await genererNumero(db);
    const idLocal = genererIdLocal();
    const vendeur = demande.utilisateurId
      ? await db.getFirstAsync<{ nom: string | null; login: string }>(
          'SELECT nom, login FROM utilisateur WHERE id = ?',
          demande.utilisateurId,
        )
      : null;
    const nomVendeur = vendeur ? (vendeur.nom || vendeur.login) : null;
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

    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      const article = demande.articles[i];
      await db.runAsync(
        `INSERT INTO ligne_vente (vente_id, produit_id, variante_id, libelle, unite, facteur,
                                  quantite, quantite_base, prix_unitaire,
                                  cout_unitaire, total, benefice_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        venteId, l.produitId, article.variante?.id ?? null, l.libelle, l.unite, l.facteur,
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
      if (article.variante) {
        await db.runAsync(
          'UPDATE variante_produit SET stock_actuel = stock_actuel - ?, date_modification = ? WHERE id = ?',
          l.quantiteBase, maintenant, article.variante.id,
        );
      }
      await db.runAsync(
        `INSERT INTO mouvement_stock (id_local, produit_id, variante_id, nature, source_operation, quantite,
                                      unite, quantite_base, stock_avant, stock_apres,
                                      prix_unitaire, reference, motif, utilisateur, date_mouvement)
         VALUES (lower(hex(randomblob(16))), ?, ?, 'SORTIE', 'VENTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        l.produitId, article.variante?.id ?? null, l.quantite, l.unite, l.quantiteBase,
        article.variante ? article.variante.stockActuel : avant.quantite_base,
        article.variante ? article.variante.stockActuel - l.quantiteBase : apres,
        l.prixUnitaire, numero, `Vente ${numero}`, nomVendeur, maintenant,
      );
    }

    resultat = { venteId, numero, total, lignes };
    await marquerChangement('vente', idLocal);
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

