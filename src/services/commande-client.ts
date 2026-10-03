import {
  dansTransaction,
  executer,
  genererIdLocal,
  lirePremier,
  lireTout,
  maintenant,
} from '../db/repositories/base';
import type { Produit } from '../domain/types';
import type { VarianteMobile } from '../db/repositories/variante';
import { libelleVariante } from '../db/repositories/variante';
import { exigerEcriture } from './abonnement';
import { marquerChangement } from './synchronisation';

export type StatutCommandeClient =
  | 'BROUILLON'
  | 'CONFIRMEE'
  | 'EN_PREPARATION'
  | 'PRETE'
  | 'TERMINEE'
  | 'ANNULEE';

export interface ArticleCommandeClient {
  produit: Produit;
  variante?: VarianteMobile | null;
  quantite: number;
  prixUnitaire: number;
}

export interface CommandeClientResume {
  id: number;
  idLocal: string;
  serveurId: number | null;
  numero: string;
  clientNom: string | null;
  statut: StatutCommandeClient;
  total: number;
  montantPaye: number;
  dateCreation: string;
  syncStatut: string;
  nbLignes: number;
  pieces: number;
  preparees: number;
}

export interface LigneCommandeClient {
  id: number;
  serveurId: number | null;
  produitId: number;
  varianteId: number | null;
  libelle: string;
  quantiteCommandee: number;
  quantiteReservee: number;
  quantitePreparee: number;
  prixUnitaire: number;
  total: number;
}

export interface CommandeClientDetail extends CommandeClientResume {
  clientId: number | null;
  note: string | null;
  lignes: LigneCommandeClient[];
}

function numeroLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `CMD-M-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${String(d.getTime()).slice(-5)}`;
}

export async function creerCommandeClient(
  articles: ArticleCommandeClient[],
  options: { clientId?: number | null; note?: string } = {},
): Promise<number> {
  await exigerEcriture();
  if (!articles.length) throw new Error('Ajoutez au moins un article à la commande.');

  for (const article of articles) {
    if (!Number.isFinite(article.quantite) || article.quantite <= 0) {
      throw new Error('Les quantités commandées doivent être positives.');
    }
    if (!Number.isFinite(article.prixUnitaire) || article.prixUnitaire < 0) {
      throw new Error('Le prix de vente doit être valide.');
    }
  }

  const idLocal = genererIdLocal();
  const date = maintenant();
  const total = articles.reduce(
    (s, a) => s + Math.round(a.quantite * a.prixUnitaire),
    0,
  );

  return dansTransaction(async () => {
    const r = await executer(
      `INSERT INTO commande_client
       (id_local, serveur_id, numero, client_id, statut, total, montant_paye,
        note, date_creation, sync_statut)
       VALUES (?, NULL, ?, ?, 'BROUILLON', ?, 0, ?, ?, 'PENDING')`,
      idLocal,
      numeroLocal(),
      options.clientId ?? null,
      total,
      options.note?.trim() || null,
      date,
    );
    const commandeId = r.lastInsertRowId;

    for (const article of articles) {
      const libelle = article.variante
        ? `${article.produit.nom} - ${libelleVariante(article.variante)}`
        : article.produit.nom;
      await executer(
        `INSERT INTO ligne_commande_client
         (commande_id, serveur_id, produit_id, variante_id, libelle,
          quantite_commandee, quantite_reservee, quantite_preparee,
          prix_unitaire, total)
         VALUES (?, NULL, ?, ?, ?, ?, 0, 0, ?, ?)`,
        commandeId,
        article.produit.id,
        article.variante?.id ?? null,
        libelle,
        article.quantite,
        Math.round(article.prixUnitaire),
        Math.round(article.quantite * article.prixUnitaire),
      );
    }

    await marquerChangement('commande_client', idLocal);
    return commandeId;
  });
}

export async function listerCommandesClients(): Promise<CommandeClientResume[]> {
  const lignes = await lireTout<{
    id: number; id_local: string; serveur_id: number | null; numero: string;
    client_nom: string | null; statut: StatutCommandeClient; total: number;
    montant_paye: number; date_creation: string; sync_statut: string;
    nb_lignes: number; pieces: number; preparees: number;
  }>(
    `SELECT c.id, c.id_local, c.serveur_id, c.numero,
            cl.nom AS client_nom, c.statut, c.total, c.montant_paye,
            c.date_creation, c.sync_statut,
            COUNT(l.id) AS nb_lignes,
            COALESCE(SUM(l.quantite_commandee), 0) AS pieces,
            COALESCE(SUM(l.quantite_preparee), 0) AS preparees
       FROM commande_client c
       LEFT JOIN client cl ON cl.id = c.client_id
       LEFT JOIN ligne_commande_client l ON l.commande_id = c.id
      GROUP BY c.id
      ORDER BY c.date_creation DESC, c.id DESC`,
  );
  return lignes.map((l) => ({
    id: l.id,
    idLocal: l.id_local,
    serveurId: l.serveur_id,
    numero: l.numero,
    clientNom: l.client_nom,
    statut: l.statut,
    total: l.total,
    montantPaye: l.montant_paye,
    dateCreation: l.date_creation,
    syncStatut: l.sync_statut,
    nbLignes: l.nb_lignes,
    pieces: l.pieces,
    preparees: l.preparees,
  }));
}

export async function obtenirCommandeClient(id: number): Promise<CommandeClientDetail | null> {
  const c = await lirePremier<{
    id: number; id_local: string; serveur_id: number | null; numero: string;
    client_id: number | null; client_nom: string | null; statut: StatutCommandeClient;
    total: number; montant_paye: number; note: string | null;
    date_creation: string; sync_statut: string;
  }>(
    `SELECT c.id, c.id_local, c.serveur_id, c.numero, c.client_id,
            cl.nom AS client_nom, c.statut, c.total, c.montant_paye,
            c.note, c.date_creation, c.sync_statut
       FROM commande_client c
       LEFT JOIN client cl ON cl.id = c.client_id
      WHERE c.id = ?`,
    id,
  );
  if (!c) return null;

  const lignes = await lireTout<{
    id: number; serveur_id: number | null; produit_id: number; variante_id: number | null;
    libelle: string; quantite_commandee: number; quantite_reservee: number;
    quantite_preparee: number; prix_unitaire: number; total: number;
  }>(
    `SELECT id, serveur_id, produit_id, variante_id, libelle,
            quantite_commandee, quantite_reservee, quantite_preparee,
            prix_unitaire, total
       FROM ligne_commande_client
      WHERE commande_id = ?
      ORDER BY id`,
    id,
  );

  return {
    id: c.id,
    idLocal: c.id_local,
    serveurId: c.serveur_id,
    numero: c.numero,
    clientId: c.client_id,
    clientNom: c.client_nom,
    statut: c.statut,
    total: c.total,
    montantPaye: c.montant_paye,
    note: c.note,
    dateCreation: c.date_creation,
    syncStatut: c.sync_statut,
    nbLignes: lignes.length,
    pieces: lignes.reduce((s, l) => s + l.quantite_commandee, 0),
    preparees: lignes.reduce((s, l) => s + l.quantite_preparee, 0),
    lignes: lignes.map((l) => ({
      id: l.id,
      serveurId: l.serveur_id,
      produitId: l.produit_id,
      varianteId: l.variante_id,
      libelle: l.libelle,
      quantiteCommandee: l.quantite_commandee,
      quantiteReservee: l.quantite_reservee,
      quantitePreparee: l.quantite_preparee,
      prixUnitaire: l.prix_unitaire,
      total: l.total,
    })),
  };
}

async function changerStatut(
  id: number,
  statut: StatutCommandeClient,
  preparationComplete = false,
): Promise<void> {
  await exigerEcriture();
  const c = await lirePremier<{ id_local: string; serveur_id: number | null }>(
    'SELECT id_local, serveur_id FROM commande_client WHERE id = ?',
    id,
  );
  if (!c) throw new Error('Commande introuvable.');
  if (!c.serveur_id && statut !== 'ANNULEE') {
    throw new Error(
      'Synchronisez d’abord cette commande avant de changer son état.',
    );
  }

  await dansTransaction(async () => {
    if (preparationComplete) {
      await executer(
        `UPDATE ligne_commande_client
            SET quantite_preparee = quantite_reservee
          WHERE commande_id = ?`,
        id,
      );
    }
    await executer(
      `UPDATE commande_client
          SET statut = ?, sync_statut = 'PENDING'
        WHERE id = ?`,
      statut,
      id,
    );
    await marquerChangement('commande_client', c.id_local);
  });
}

export async function confirmerCommandeClient(id: number): Promise<void> {
  return changerStatut(id, 'CONFIRMEE');
}

export async function preparerCommandeClient(id: number): Promise<void> {
  return changerStatut(id, 'EN_PREPARATION', true);
}

export async function marquerCommandePrete(id: number): Promise<void> {
  return changerStatut(id, 'PRETE', true);
}

export async function annulerCommandeClient(id: number): Promise<void> {
  return changerStatut(id, 'ANNULEE');
}
