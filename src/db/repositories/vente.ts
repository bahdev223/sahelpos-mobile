/**
 * Depot des ventes : consultation du journal, encaissement d'un reste a payer,
 * annulation.
 *
 * L'ENREGISTREMENT d'une vente n'est pas ici : il vit dans services/vente.ts,
 * parce qu'il touche aussi le stock et doit rester une seule transaction.
 */
import type { LigneVente, ModePaiement, StatutVente } from '../../domain/types';
import { dansTransaction, executer, lirePremier, lireTout, maintenant } from './base';

export interface VenteResume {
  id: number;
  numero: string;
  dateVente: string;
  clientId: number | null;
  clientNom: string | null;
  total: number;
  montantPaye: number;
  modePaiement: ModePaiement;
  statut: StatutVente;
  beneficeTotal: number;
}

export interface FiltreVente {
  /** Bornes ISO. Le journal du jour passe la date du jour aux deux. */
  debut?: string;
  fin?: string;
  clientId?: number;
  utilisateurId?: number;
  statut?: StatutVente;
  modePaiement?: ModePaiement;
  recherche?: string;
  limite?: number;
  avant?: { dateVente: string; id: number };
}

export async function listerVentes(filtre: FiltreVente = {}): Promise<VenteResume[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filtre.debut) {
    conditions.push('v.date_vente >= ?');
    params.push(filtre.debut);
  }
  if (filtre.fin) {
    conditions.push('v.date_vente <= ?');
    params.push(filtre.fin);
  }
  if (filtre.clientId) {
    conditions.push('v.client_id = ?');
    params.push(filtre.clientId);
  }
  if (filtre.avant) {
    conditions.push('(v.date_vente < ? OR (v.date_vente = ? AND v.id < ?))');
    params.push(filtre.avant.dateVente, filtre.avant.dateVente, filtre.avant.id);
  }
  if (filtre.utilisateurId) {
    conditions.push('v.utilisateur_id = ?');
    params.push(filtre.utilisateurId);
  }
  if (filtre.statut) {
    conditions.push('v.statut = ?');
    params.push(filtre.statut);
  }
  if (filtre.modePaiement) {
    conditions.push('v.mode_paiement = ?');
    params.push(filtre.modePaiement);
  }
  if (filtre.recherche?.trim()) {
    conditions.push('(v.numero LIKE ? OR c.nom LIKE ?)');
    const motif = `%${filtre.recherche.trim()}%`;
    params.push(motif, motif);
  }

  const ou = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  return lireTout<VenteResume>(
    `SELECT v.id, v.numero, v.date_vente AS dateVente, v.client_id AS clientId,
            c.nom AS clientNom, v.total, v.montant_paye AS montantPaye,
            v.mode_paiement AS modePaiement, v.statut,
            v.benefice_total AS beneficeTotal
     FROM vente v LEFT JOIN client c ON c.id = v.client_id${ou}
     ORDER BY v.date_vente DESC, v.id DESC LIMIT ?`,
    ...params,
    filtre.limite ?? 200,
  );
}

export async function obtenirVente(id: number): Promise<VenteResume | null> {
  return lirePremier<VenteResume>(
    `SELECT v.id, v.numero, v.date_vente AS dateVente, v.client_id AS clientId,
            c.nom AS clientNom, v.total, v.montant_paye AS montantPaye,
            v.mode_paiement AS modePaiement, v.statut,
            v.benefice_total AS beneficeTotal
     FROM vente v LEFT JOIN client c ON c.id = v.client_id
     WHERE v.id = ?`,
    id,
  );
}

export async function listerLignes(venteId: number): Promise<LigneVente[]> {
  return lireTout<LigneVente>(
    `SELECT produit_id AS produitId, libelle, unite, facteur, quantite,
            quantite_base AS quantiteBase, prix_unitaire AS prixUnitaire,
            cout_unitaire AS coutUnitaire, total,
            benefice_total AS beneficeTotal
     FROM ligne_vente WHERE vente_id = ? ORDER BY id`,
    venteId,
  );
}

export interface TotauxPeriode {
  nbVentes: number;
  chiffreAffaires: number;
  encaisse: number;
  benefice: number;
  /** Ventes a credit non soldees : ce que la boutique attend encore. */
  resteDu: number;
}

export async function totauxPeriode(debut: string, fin: string, utilisateurId?: number): Promise<TotauxPeriode> {
  const l = await lirePremier<{
    n: number;
    ca: number | null;
    paye: number | null;
    benef: number | null;
  }>(
    `SELECT COUNT(*) AS n, SUM(total) AS ca, SUM(montant_paye) AS paye,
            SUM(benefice_total) AS benef
     FROM vente
     WHERE date_vente >= ? AND date_vente <= ? AND statut <> 'annulee'
       ${utilisateurId ? 'AND utilisateur_id = ?' : ''}`,
    debut,
    fin,
    ...(utilisateurId ? [utilisateurId] : []),
  );

  const ca = Math.round(l?.ca ?? 0);
  const encaisse = Math.round(l?.paye ?? 0);
  return {
    nbVentes: l?.n ?? 0,
    chiffreAffaires: ca,
    encaisse,
    benefice: Math.round(l?.benef ?? 0),
    resteDu: Math.max(0, ca - encaisse),
  };
}

export interface ProduitVendu {
  produitId: number;
  libelle: string;
  quantite: number;
  total: number;
  benefice: number;
}

export async function meilleuresVentes(
  debut: string,
  fin: string,
  limite = 10,
  utilisateurId?: number,
): Promise<ProduitVendu[]> {
  return lireTout<ProduitVendu>(
    `SELECT lv.produit_id AS produitId, lv.libelle,
            SUM(lv.quantite) AS quantite, SUM(lv.total) AS total,
            SUM(lv.benefice_total) AS benefice
     FROM ligne_vente lv JOIN vente v ON v.id = lv.vente_id
     WHERE v.date_vente >= ? AND v.date_vente <= ? AND v.statut <> 'annulee'
       ${utilisateurId ? 'AND v.utilisateur_id = ?' : ''}
     GROUP BY lv.produit_id, lv.libelle
     ORDER BY total DESC LIMIT ?`,
    debut,
    fin,
    ...(utilisateurId ? [utilisateurId] : []),
    limite,
  );
}

export interface GroupeVentes {
  cle: string;
  nbVentes: number;
  chiffreAffaires: number;
  benefice: number;
}

export async function regrouperVentes(debut: string, fin: string, mensuel: boolean, utilisateurId?: number): Promise<GroupeVentes[]> {
  return lireTout<GroupeVentes>(
    `SELECT strftime(?, date_vente, 'localtime') AS cle, COUNT(*) AS nbVentes,
            COALESCE(SUM(total), 0) AS chiffreAffaires,
            COALESCE(SUM(benefice_total), 0) AS benefice
     FROM vente WHERE date_vente >= ? AND date_vente <= ? AND statut <> 'annulee'
       ${utilisateurId ? 'AND utilisateur_id = ?' : ''}
     GROUP BY cle ORDER BY cle`,
    mensuel ? '%Y-%m' : '%Y-%m-%d', debut, fin, ...(utilisateurId ? [utilisateurId] : []),
  );
}

/**
 * Encaisse tout ou partie du reste du sur une vente a credit.
 *
 * Le statut est recalcule a partir des montants, jamais passe en parametre :
 * c'est la seule facon qu'il ne mente pas sur ce qui a reellement ete paye.
 */
export async function encaisser(venteId: number, montant: number): Promise<void> {
  const arrondi = Math.round(montant);
  if (arrondi <= 0) throw new Error('Le montant encaisse doit etre positif.');

  await dansTransaction(async () => {
    const v = await lirePremier<{ total: number; montant_paye: number; statut: string }>(
      'SELECT total, montant_paye, statut FROM vente WHERE id = ?',
      venteId,
    );
    if (!v) throw new Error('Vente introuvable.');
    if (v.statut === 'annulee') {
      throw new Error('Cette vente est annulee : elle ne peut plus etre encaissee.');
    }

    const paye = Math.round(v.montant_paye) + arrondi;
    const statut: StatutVente =
      paye >= Math.round(v.total) ? 'payee' : paye > 0 ? 'partielle' : 'impayee';

    await executer(
      'UPDATE vente SET montant_paye = ?, statut = ? WHERE id = ?',
      paye,
      statut,
      venteId,
    );
  });
}

/**
 * Annule une vente ET remet le stock.
 *
 * Les deux vont ensemble : annuler sans remettre le stock fait disparaitre de
 * la marchandise des comptes, remettre le stock sans annuler la fait exister
 * deux fois. D'ou la transaction unique.
 */
export async function annulerVente(venteId: number, motif = ''): Promise<void> {
  await dansTransaction(async () => {
    const v = await lirePremier<{ numero: string; statut: string }>(
      'SELECT numero, statut FROM vente WHERE id = ?',
      venteId,
    );
    if (!v) throw new Error('Vente introuvable.');
    if (v.statut === 'annulee') throw new Error('Cette vente est deja annulee.');

    const lignes = await lireTout<{
      produit_id: number;
      quantite: number;
      unite: string;
      quantite_base: number;
    }>(
      'SELECT produit_id, quantite, unite, quantite_base FROM ligne_vente WHERE vente_id = ?',
      venteId,
    );

    const date = maintenant();
    for (const l of lignes) {
      const p = await lirePremier<{ quantite_base: number; gestion_stock: number }>(
        'SELECT quantite_base, gestion_stock FROM produit WHERE id = ?',
        l.produit_id,
      );
      if (!p || !p.gestion_stock) continue;

      const apres = p.quantite_base + l.quantite_base;
      await executer(
        'UPDATE produit SET quantite_base = ?, date_modification = ? WHERE id = ?',
        apres,
        date,
        l.produit_id,
      );
      await executer(
        `INSERT INTO mouvement_stock (id_local, produit_id, nature, source_operation, quantite,
                                      unite, quantite_base, stock_avant, stock_apres,
                                      reference, motif, date_mouvement)
         VALUES (lower(hex(randomblob(16))), ?, 'ENTREE', 'RETOUR', ?, ?, ?, ?, ?, ?, ?, ?)`,
        l.produit_id,
        l.quantite,
        l.unite,
        l.quantite_base,
        p.quantite_base,
        apres,
        v.numero,
        motif || 'Annulation de vente',
        date,
      );
    }

    await executer("UPDATE vente SET statut = 'annulee' WHERE id = ?", venteId);
  });
}
