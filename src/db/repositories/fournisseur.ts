/**
 * Depot des fournisseurs.
 *
 * Comme pour les clients, le solde n'est stocke nulle part : il se recalcule
 * depuis les achats. Une colonne "solde" finit toujours par diverger le jour ou
 * un achat est annule ou corrige.
 */
import {
  executer,
  genererIdLocal,
  lirePremier,
  lireTout,
  maintenant,
} from './base';

export interface Fournisseur {
  id: number;
  idLocal: string;
  nom: string;
  contact: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
}

interface LigneFournisseur {
  id: number;
  id_local: string;
  nom: string;
  contact: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
}

const COLONNES = 'id, id_local, nom, contact, telephone, email, adresse';

function versFournisseur(l: LigneFournisseur): Fournisseur {
  return {
    id: l.id,
    idLocal: l.id_local,
    nom: l.nom,
    contact: l.contact,
    telephone: l.telephone,
    email: l.email,
    adresse: l.adresse,
  };
}

export async function listerFournisseurs(
  recherche = '',
  limite = 200,
): Promise<Fournisseur[]> {
  const terme = recherche.trim();
  if (!terme) {
    const lignes = await lireTout<LigneFournisseur>(
      `SELECT ${COLONNES} FROM fournisseur ORDER BY nom LIMIT ?`,
      limite,
    );
    return lignes.map(versFournisseur);
  }
  const motif = `%${terme}%`;
  const lignes = await lireTout<LigneFournisseur>(
    `SELECT ${COLONNES} FROM fournisseur
     WHERE nom LIKE ? OR telephone LIKE ? OR contact LIKE ?
     ORDER BY nom LIMIT ?`,
    motif, motif, motif, limite,
  );
  return lignes.map(versFournisseur);
}

export async function obtenirFournisseur(id: number): Promise<Fournisseur | null> {
  const l = await lirePremier<LigneFournisseur>(
    `SELECT ${COLONNES} FROM fournisseur WHERE id = ?`,
    id,
  );
  return l ? versFournisseur(l) : null;
}

export interface SaisieFournisseur {
  nom: string;
  contact?: string | null;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
}

export async function creerFournisseur(saisie: SaisieFournisseur): Promise<number> {
  if (!saisie.nom.trim()) throw new Error('Le nom du fournisseur est requis.');
  const r = await executer(
    `INSERT INTO fournisseur (id_local, nom, contact, telephone, email, adresse,
                              date_creation)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    genererIdLocal(),
    saisie.nom.trim(),
    saisie.contact?.trim() || null,
    saisie.telephone?.trim() || null,
    saisie.email?.trim() || null,
    saisie.adresse?.trim() || null,
    maintenant(),
  );
  return r.lastInsertRowId;
}

export async function modifierFournisseur(
  id: number,
  saisie: SaisieFournisseur,
): Promise<void> {
  await executer(
    `UPDATE fournisseur SET nom = ?, contact = ?, telephone = ?, email = ?,
                            adresse = ?
     WHERE id = ?`,
    saisie.nom.trim(),
    saisie.contact?.trim() || null,
    saisie.telephone?.trim() || null,
    saisie.email?.trim() || null,
    saisie.adresse?.trim() || null,
    id,
  );
}

/**
 * Supprime un fournisseur, sauf s'il a des achats : on detacherait sinon des
 * achats de leur origine, et la dette fournisseur deviendrait introuvable.
 */
export async function supprimerFournisseur(id: number): Promise<boolean> {
  const achats = await lirePremier<{ n: number }>(
    'SELECT COUNT(*) AS n FROM achat WHERE fournisseur_id = ?',
    id,
  );
  if ((achats?.n ?? 0) > 0) return false;
  await executer('DELETE FROM fournisseur WHERE id = ?', id);
  return true;
}

export interface SoldeFournisseur {
  totalAchete: number;
  totalPaye: number;
  /** Ce que la boutique doit encore a ce fournisseur. */
  resteDu: number;
  nbAchats: number;
}

export async function calculerSoldeFournisseur(
  fournisseurId: number,
): Promise<SoldeFournisseur> {
  // Les achats annules sont exclus : ils n'ont jamais eu lieu du point de vue
  // de la dette, meme si on garde leur trace.
  const l = await lirePremier<{ total: number | null; paye: number | null; n: number }>(
    `SELECT SUM(total) AS total, SUM(montant_paye) AS paye, COUNT(*) AS n
     FROM achat WHERE fournisseur_id = ? AND statut <> 'ANNULE'`,
    fournisseurId,
  );
  const totalAchete = Math.round(l?.total ?? 0);
  const totalPaye = Math.round(l?.paye ?? 0);
  return {
    totalAchete,
    totalPaye,
    resteDu: Math.max(0, totalAchete - totalPaye),
    nbAchats: l?.n ?? 0,
  };
}

/** Ce que la boutique doit a l'ensemble de ses fournisseurs. */
export async function detteTotale(): Promise<number> {
  const l = await lirePremier<{ reste: number | null }>(
    `SELECT SUM(total - montant_paye) AS reste FROM achat
     WHERE statut <> 'ANNULE' AND total > montant_paye`,
  );
  return Math.round(l?.reste ?? 0);
}
