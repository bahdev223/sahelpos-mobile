/**
 * Depot des clients.
 *
 * Le solde d'un client n'est pas stocke dans une colonne : il est TOUJOURS
 * recalcule depuis les ventes. Une colonne "solde" finit toujours par diverger
 * du detail des ventes quand une vente est annulee ou un reglement corrige, et
 * le commercant ne sait alors plus qui croire.
 */
import type { Client } from '../../domain/types';
import {
  executer,
  genererIdLocal,
  lirePremier,
  lireTout,
  maintenant,
} from './base';
import { marquerChangement } from '../../services/synchronisation';

interface LigneClient {
  id: number;
  id_local: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
}

const COLONNES = 'id, id_local, nom, telephone, email, adresse';

function versClient(l: LigneClient): Client {
  return {
    id: l.id,
    idLocal: l.id_local,
    nom: l.nom,
    telephone: l.telephone,
    email: l.email,
    adresse: l.adresse,
  };
}

export async function listerClients(recherche = '', limite = 200): Promise<Client[]> {
  const terme = recherche.trim();
  if (!terme) {
    const lignes = await lireTout<LigneClient>(
      `SELECT ${COLONNES} FROM client ORDER BY nom LIMIT ?`,
      limite,
    );
    return lignes.map(versClient);
  }

  // Le telephone est souvent le seul identifiant fiable d'un client au Mali :
  // on le rend cherchable au meme titre que le nom.
  const motif = `%${terme}%`;
  const lignes = await lireTout<LigneClient>(
    `SELECT ${COLONNES} FROM client
     WHERE nom LIKE ? OR telephone LIKE ?
     ORDER BY nom LIMIT ?`,
    motif,
    motif,
    limite,
  );
  return lignes.map(versClient);
}

export async function obtenirClient(id: number): Promise<Client | null> {
  const l = await lirePremier<LigneClient>(
    `SELECT ${COLONNES} FROM client WHERE id = ?`,
    id,
  );
  return l ? versClient(l) : null;
}

export interface SaisieClient {
  nom: string;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
}

export async function creerClient(saisie: SaisieClient): Promise<number> {
  const idLocal = genererIdLocal();
  const horodatage = maintenant();
  const r = await executer(
    `INSERT INTO client (id_local, nom, telephone, email, adresse, date_creation,
                         date_modification)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    idLocal,
    saisie.nom.trim(),
    saisie.telephone?.trim() || null,
    saisie.email?.trim() || null,
    saisie.adresse?.trim() || null,
    horodatage,
    horodatage,
  );
  await marquerChangement('client', idLocal);
  return r.lastInsertRowId;
}

export async function modifierClient(id: number, saisie: SaisieClient): Promise<void> {
  const existant = await lirePremier<{ id_local: string }>(
    'SELECT id_local FROM client WHERE id = ?',
    id,
  );
  await executer(
    `UPDATE client SET nom = ?, telephone = ?, email = ?, adresse = ?,
                       date_modification = ?
      WHERE id = ?`,
    saisie.nom.trim(),
    saisie.telephone?.trim() || null,
    saisie.email?.trim() || null,
    saisie.adresse?.trim() || null,
    maintenant(),
    id,
  );
  await marquerChangement('client', existant?.id_local ?? '');
}

/**
 * Supprime un client, sauf s'il a des ventes : on detacherait alors des ventes
 * de leur acheteur, et le solde du deviendrait introuvable.
 */
export async function supprimerClient(id: number): Promise<boolean> {
  const ventes = await lirePremier<{ n: number }>(
    'SELECT COUNT(*) AS n FROM vente WHERE client_id = ?',
    id,
  );
  if ((ventes?.n ?? 0) > 0) return false;
  await executer('DELETE FROM client WHERE id = ?', id);
  return true;
}

export interface SoldeClient {
  totalAchete: number;
  totalPaye: number;
  /** Ce que le client doit encore. Zero s'il est a jour. */
  resteDu: number;
  nbVentes: number;
}

export async function calculerSolde(clientId: number): Promise<SoldeClient> {
  // Les ventes annulees sont exclues : elles n'ont jamais eu lieu du point de
  // vue du solde, meme si on garde leur trace dans le journal.
  const l = await lirePremier<{
    total: number | null;
    paye: number | null;
    n: number;
  }>(
    `SELECT SUM(total) AS total, SUM(montant_paye) AS paye, COUNT(*) AS n
     FROM vente WHERE client_id = ? AND statut <> 'annulee'`,
    clientId,
  );

  const totalAchete = Math.round(l?.total ?? 0);
  const totalPaye = Math.round(l?.paye ?? 0);
  return {
    totalAchete,
    totalPaye,
    resteDu: Math.max(0, totalAchete - totalPaye),
    nbVentes: l?.n ?? 0,
  };
}

export interface VenteClient {
  id: number;
  numero: string;
  dateVente: string;
  total: number;
  montantPaye: number;
  statut: string;
}

export async function listerVentesClient(
  clientId: number,
  limite = 100,
): Promise<VenteClient[]> {
  return lireTout<VenteClient>(
    `SELECT id, numero, date_vente AS dateVente, total,
            montant_paye AS montantPaye, statut
     FROM vente WHERE client_id = ?
     ORDER BY date_vente DESC LIMIT ?`,
    clientId,
    limite,
  );
}
