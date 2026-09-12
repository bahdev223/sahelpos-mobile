/**
 * Achats fournisseur.
 *
 * Un achat se saisit d'abord en BROUILLON — on note ce qu'on a commande — puis
 * il est RECU : c'est la reception qui fait entrer la marchandise en stock, pas
 * la saisie. Sans cette separation, une commande notee le matin gonflerait le
 * stock avant que le camion soit arrive.
 *
 * La reception met aussi a jour le PRIX D'ACHAT du produit. C'est ce qui permet
 * au benefice des ventes suivantes d'etre juste : garder l'ancien prix
 * ferait croire a une marge qui n'existe plus.
 */
import {
  dansTransaction,
  executer,
  genererIdLocal,
  lirePremier,
  lireTout,
  maintenant,
} from '../db/repositories/base';
import { exigerEcriture } from './abonnement';
import { verifierStock } from './notifications';
import { marquerChangement } from './synchronisation';

export type StatutAchat = 'BROUILLON' | 'RECU' | 'ANNULE';

export type ModePaiementAchat = 'especes' | 'mobile_money' | 'credit';

export interface AchatResume {
  id: number;
  numero: string;
  fournisseurId: number | null;
  fournisseurNom: string | null;
  reference: string | null;
  dateAchat: string;
  total: number;
  montantPaye: number;
  statut: StatutAchat;
  dateReception: string | null;
}

export interface LigneAchat {
  produitId: number;
  libelle: string;
  unite: string;
  facteur: number;
  quantite: number;
  quantiteBase: number;
  prixUnitaire: number;
  total: number;
}

export interface ArticleAchat {
  produitId: number;
  libelle: string;
  unite: string;
  /** Combien d'unites de base vaut l'unite achetee (un carton = 24 unites). */
  facteur: number;
  quantite: number;
  /** Prix payé pour UNE unite achetee, pas pour l'unite de base. */
  prixUnitaire: number;
}

export class AchatNonModifiable extends Error {
  constructor(statut: string) {
    super(
      statut === 'RECU'
        ? 'Cet achat est deja recu : la marchandise est entree en stock.'
        : 'Cet achat est annule.',
    );
    this.name = 'AchatNonModifiable';
  }
}

function arrondir(v: number): number {
  return Math.round(v);
}

export function calculerLigneAchat(a: ArticleAchat): LigneAchat {
  return {
    produitId: a.produitId,
    libelle: a.libelle,
    unite: a.unite,
    facteur: a.facteur,
    quantite: a.quantite,
    quantiteBase: a.quantite * a.facteur,
    prixUnitaire: arrondir(a.prixUnitaire),
    total: arrondir(a.quantite * a.prixUnitaire),
  };
}

export interface FiltreAchat {
  fournisseurId?: number;
  statut?: StatutAchat;
  debut?: string;
  fin?: string;
  limite?: number;
  recherche?: string;
  avant?: { dateAchat: string; id: number };
}

export async function listerAchats(filtre: FiltreAchat = {}): Promise<AchatResume[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filtre.fournisseurId) {
    conditions.push('a.fournisseur_id = ?');
    params.push(filtre.fournisseurId);
  }
  if (filtre.statut) {
    conditions.push('a.statut = ?');
    params.push(filtre.statut);
  }
  if (filtre.debut) {
    conditions.push('a.date_achat >= ?');
    params.push(filtre.debut);
  }
  if (filtre.fin) {
    conditions.push('a.date_achat <= ?');
    params.push(filtre.fin);
  }
  if (filtre.recherche?.trim()) {
    conditions.push('(a.numero LIKE ? OR a.reference LIKE ? OR f.nom LIKE ?)');
    const terme = `%${filtre.recherche.trim()}%`;
    params.push(terme, terme, terme);
  }
  if (filtre.avant) {
    conditions.push('(a.date_achat < ? OR (a.date_achat = ? AND a.id < ?))');
    params.push(filtre.avant.dateAchat, filtre.avant.dateAchat, filtre.avant.id);
  }

  const ou = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  return lireTout<AchatResume>(
    `SELECT a.id, a.numero, a.fournisseur_id AS fournisseurId,
            f.nom AS fournisseurNom, a.reference, a.date_achat AS dateAchat,
            a.total, a.montant_paye AS montantPaye, a.statut,
            a.date_reception AS dateReception
     FROM achat a LEFT JOIN fournisseur f ON f.id = a.fournisseur_id${ou}
     ORDER BY a.date_achat DESC, a.id DESC LIMIT ?`,
    ...params,
    filtre.limite ?? 200,
  );
}

export async function compterAchats(): Promise<Record<StatutAchat, number>> {
  const lignes = await lireTout<{ statut: StatutAchat; nombre: number }>(
    'SELECT statut, COUNT(*) AS nombre FROM achat GROUP BY statut',
  );
  const resultat: Record<StatutAchat, number> = { BROUILLON: 0, RECU: 0, ANNULE: 0 };
  for (const ligne of lignes) resultat[ligne.statut] = ligne.nombre;
  return resultat;
}

export async function obtenirAchat(id: number): Promise<AchatResume | null> {
  return lirePremier<AchatResume>(
    `SELECT a.id, a.numero, a.fournisseur_id AS fournisseurId,
            f.nom AS fournisseurNom, a.reference, a.date_achat AS dateAchat,
            a.total, a.montant_paye AS montantPaye, a.statut,
            a.date_reception AS dateReception
     FROM achat a LEFT JOIN fournisseur f ON f.id = a.fournisseur_id
     WHERE a.id = ?`,
    id,
  );
}

export async function listerLignesAchat(achatId: number): Promise<LigneAchat[]> {
  return lireTout<LigneAchat>(
    `SELECT produit_id AS produitId, libelle, unite, facteur, quantite,
            quantite_base AS quantiteBase, prix_unitaire AS prixUnitaire, total
     FROM ligne_achat WHERE achat_id = ? ORDER BY id`,
    achatId,
  );
}

export interface DemandeAchat {
  fournisseurId?: number | null;
  reference?: string;
  articles: ArticleAchat[];
  /** Ce qui a ete regle immediatement. Le reste devient une dette. */
  montantPaye?: number;
  modePaiement?: ModePaiementAchat;
  /** Faire entrer la marchandise tout de suite (cas le plus frequent). */
  recevoirMaintenant?: boolean;
}

export interface ResultatAchat {
  achatId: number;
  numero: string;
  total: number;
  recu: boolean;
}

export async function enregistrerAchat(demande: DemandeAchat): Promise<ResultatAchat> {
  // Le verrou est ici et non dans l'ecran : un bouton grise se
  // contourne, une fonction qui refuse d'ecrire, non.
  await exigerEcriture();

  if (demande.articles.length === 0) {
    throw new Error('Ajoutez au moins un produit a cet achat.');
  }

  const lignes = demande.articles.map(calculerLigneAchat);
  const total = lignes.reduce((s, l) => s + l.total, 0);
  const paye = arrondir(demande.montantPaye ?? 0);
  const horodatage = maintenant();
  const idLocal = genererIdLocal();

  // La valeur est RENVOYEE par la transaction plutot qu'affectee a une variable
  // exterieure : TypeScript ne peut pas savoir qu'une fermeture a bien ete
  // executee, et reduirait la variable au type `never` apres le controle.
  const cree = await dansTransaction<ResultatAchat>(async () => {
    const numero = await genererNumero();
    const r = await executer(
      `INSERT INTO achat (id_local, numero, fournisseur_id, reference, date_achat,
                          total, montant_paye, statut, date_modification)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'BROUILLON', ?)`,
      idLocal,
      numero,
      demande.fournisseurId ?? null,
      demande.reference?.trim() || null,
      horodatage,
      total,
      paye,
      horodatage,
    );
    const achatId = r.lastInsertRowId;

    for (const l of lignes) {
      await executer(
        `INSERT INTO ligne_achat (achat_id, produit_id, libelle, unite, facteur,
                                  quantite, quantite_base, prix_unitaire, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        achatId, l.produitId, l.libelle, l.unite, l.facteur,
        l.quantite, l.quantiteBase, l.prixUnitaire, l.total,
      );
    }

    if (paye > 0) {
      await executer(
        `INSERT INTO paiement_achat (id_local, achat_id, montant, mode_paiement, date_paiement)
         VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)`,
        achatId, paye, demande.modePaiement ?? 'especes', horodatage,
      );
    }

    return { achatId, numero, total, recu: false };
  });

  // L'achat existe deja a ce stade. Le marquer avant la reception garantit
  // qu'une erreur locale de stock ne le fait jamais disparaitre de la file.
  await marquerChangement('achat', idLocal);
  if (demande.recevoirMaintenant !== false) {
    await recevoirAchat(cree.achatId);
    return { ...cree, recu: true };
  }
  return cree;
}

/**
 * Fait entrer la marchandise en stock.
 *
 * Tout dans une transaction : un achat recu a moitie laisserait du stock
 * fantome, impossible a rattraper autrement qu'en refaisant un inventaire.
 */
export async function recevoirAchat(achatId: number): Promise<void> {
  // Le verrou est ici et non dans l'ecran : un bouton grise se
  // contourne, une fonction qui refuse d'ecrire, non.
  await exigerEcriture();

  await dansTransaction(async () => {
    const a = await lirePremier<{ numero: string; statut: string; id_local: string }>(
      'SELECT numero, statut, id_local FROM achat WHERE id = ?',
      achatId,
    );
    if (!a) throw new Error('Achat introuvable.');
    if (a.statut !== 'BROUILLON') throw new AchatNonModifiable(a.statut);

    const lignes = await lireTout<{
      produit_id: number;
      quantite: number;
      quantite_base: number;
      unite: string;
      prix_unitaire: number;
      facteur: number;
    }>(
      `SELECT produit_id, quantite, quantite_base, unite, prix_unitaire, facteur
       FROM ligne_achat WHERE achat_id = ?`,
      achatId,
    );

    const horodatage = maintenant();

    for (const l of lignes) {
      const p = await lirePremier<{ quantite_base: number; gestion_stock: number }>(
        'SELECT quantite_base, gestion_stock FROM produit WHERE id = ?',
        l.produit_id,
      );
      if (!p) throw new Error('Un produit de cet achat a ete supprime.');

      // Le prix d'achat est ramene a l'unite de BASE : acheter un carton de 24
      // a 12 000 F, c'est 500 F l'unite. Sans cette division, le benefice des
      // ventes a l'unite serait grotesquement faux.
      const prixUnitaireBase = l.facteur > 0 ? l.prix_unitaire / l.facteur : l.prix_unitaire;

      if (!p.gestion_stock) {
        await executer(
          'UPDATE produit SET prix_achat = ?, date_modification = ? WHERE id = ?',
          arrondir(prixUnitaireBase), horodatage, l.produit_id,
        );
        continue;
      }

      const avant = p.quantite_base;
      const apres = avant + l.quantite_base;

      await executer(
        `UPDATE produit SET quantite_base = ?, prix_achat = ?, date_modification = ?
         WHERE id = ?`,
        apres, arrondir(prixUnitaireBase), horodatage, l.produit_id,
      );
      await executer(
        `INSERT INTO mouvement_stock (id_local, produit_id, nature, source_operation, quantite,
                                      unite, quantite_base, stock_avant, stock_apres,
                                      prix_unitaire, reference, motif, date_mouvement)
         VALUES (lower(hex(randomblob(16))), ?, 'ENTREE', 'ACHAT', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        l.produit_id, l.quantite, l.unite, l.quantite_base,
        avant, apres, l.prix_unitaire, a.numero, `Achat ${a.numero}`, horodatage,
      );
    }

    await executer(
      "UPDATE achat SET statut = 'RECU', date_reception = ?, date_modification = ? WHERE id = ?",
      horodatage, horodatage, achatId,
    );
  });

  // Une reception fait REMONTER le stock : c'est le moment ou une rupture
  // signalee doit disparaitre du journal. Sans cet appel, « Riz epuise »
  // resterait affiche alors que le riz est dans le magasin.
  const lignes = await listerLignesAchat(achatId);
  void verifierStock(lignes.map((l) => l.produitId));
  const achat = await lirePremier<{ id_local: string }>('SELECT id_local FROM achat WHERE id = ?', achatId);
  if (achat?.id_local) await marquerChangement('achat', achat.id_local);
}

/** Regle tout ou partie de ce qui reste du au fournisseur. */
export async function payerAchat(
  achatId: number,
  montant: number,
  mode: ModePaiementAchat = 'especes',
): Promise<void> {
  // Le verrou est ici et non dans l'ecran : un bouton grise se
  // contourne, une fonction qui refuse d'ecrire, non.
  await exigerEcriture();

  const arrondi = arrondir(montant);
  if (arrondi <= 0) throw new Error('Le montant doit etre positif.');

  await dansTransaction(async () => {
    const a = await lirePremier<{ total: number; montant_paye: number; statut: string; id_local: string }>(
      'SELECT total, montant_paye, statut, id_local FROM achat WHERE id = ?',
      achatId,
    );
    if (!a) throw new Error('Achat introuvable.');
    if (a.statut === 'ANNULE') throw new Error('Cet achat est annule.');

    const reste = a.total - a.montant_paye;
    if (reste <= 0) throw new Error('Cet achat est deja entierement regle.');
    if (arrondi > reste) {
      throw new Error(
        `Le reste du n'est que de ${reste} : saisissez au plus ce montant.`,
      );
    }

    await executer(
      'UPDATE achat SET montant_paye = montant_paye + ?, date_modification = ? WHERE id = ?',
      arrondi, maintenant(), achatId,
    );
    await executer(
      `INSERT INTO paiement_achat (id_local, achat_id, montant, mode_paiement, date_paiement)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)`,
      achatId, arrondi, mode, maintenant(),
    );
  });
  const achat = await lirePremier<{ id_local: string }>('SELECT id_local FROM achat WHERE id = ?', achatId);
  if (achat?.id_local) await marquerChangement('achat', achat.id_local);
}

export interface PaiementAchat {
  id: number;
  montant: number;
  modePaiement: string;
  datePaiement: string;
  note: string | null;
}

export async function listerPaiements(achatId: number): Promise<PaiementAchat[]> {
  return lireTout<PaiementAchat>(
    `SELECT id, montant, mode_paiement AS modePaiement,
            date_paiement AS datePaiement, note
     FROM paiement_achat WHERE achat_id = ? ORDER BY date_paiement`,
    achatId,
  );
}

/**
 * Annule un achat NON RECU.
 *
 * Un achat deja recu n'est pas annulable ici : la marchandise est en rayon,
 * peut-etre deja vendue. Il faut passer par un ajustement de stock, qui laisse
 * une trace de ce qui s'est reellement passe.
 */
export async function annulerAchat(achatId: number, motif = ''): Promise<void> {
  const a = await lirePremier<{ statut: string }>(
    'SELECT statut FROM achat WHERE id = ?',
    achatId,
  );
  if (!a) throw new Error('Achat introuvable.');
  if (a.statut === 'RECU') {
    throw new Error(
      'Cet achat est deja recu et la marchandise est en stock. Corrigez-la par un ajustement de stock.',
    );
  }
  if (a.statut === 'ANNULE') throw new Error('Cet achat est deja annule.');

  await executer(
    "UPDATE achat SET statut = 'ANNULE', motif = ? WHERE id = ?",
    motif || null, achatId,
  );
}

/** ACH-AAAAMMJJ-01, remis a 1 chaque jour. */
async function genererNumero(): Promise<string> {
  const d = new Date();
  const deux = (n: number) => String(n).padStart(2, '0');
  const prefixe = `ACH-${d.getFullYear()}${deux(d.getMonth() + 1)}${deux(d.getDate())}-`;
  const l = await lirePremier<{ n: number }>(
    'SELECT COUNT(*) AS n FROM achat WHERE numero LIKE ?',
    prefixe + '%',
  );
  return prefixe + String((l?.n ?? 0) + 1).padStart(2, '0');
}
