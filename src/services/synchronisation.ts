/**
 * Synchronisation V1 Mobile <-> Web.
 *
 * Le telephone travaille d'abord en SQLite. Chaque ecriture met une entree
 * dans `sync_outbox`; quand Internet revient, on pousse ces objets vers Django,
 * puis on tire les changements du serveur avec un curseur.
 */
import {
  dansTransaction,
  executer,
  lirePremier,
  lireTout,
  maintenant,
} from '../db/repositories/base';
import { jetonAppareil } from './abonnement';

const SERVEUR = 'https://sahelpos.saheltech.tech';
const DELAI_RESEAU = 20000;
const CLE_CURSOR = 'sync.cursor';

type TypeObjet = 'produit' | 'client' | 'fournisseur' | 'vente' | 'mouvement';

interface LigneOutbox {
  type_objet: TypeObjet;
  id_local: string;
}

interface ProduitSync {
  id_local: string;
  nom: string;
  categorie: string | null;
  code_barre: string | null;
  prix_unitaire: number | string;
  prix_achat: number | string;
  unite_base: string;
  quantite_base: number | string;
  stock_min: number | string;
  gestion_stock: boolean | number;
  actif: boolean | number;
  date_creation?: string | null;
  date_modification?: string | null;
  supprime_le?: string | null;
  sous_unites?: Array<{ nom: string; facteur: number | string; prix: number | string }>;
}

interface ClientSync {
  id_local: string;
  nom: string;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
  date_creation?: string | null;
  date_modification?: string | null;
  supprime_le?: string | null;
}

interface FournisseurSync extends ClientSync {
  contact?: string | null;
}

interface LigneVenteSync {
  produit_id_local: string;
  libelle: string;
  unite: string;
  facteur: number | string;
  quantite: number | string;
  quantite_base: number | string;
  prix_unitaire: number | string;
  cout_unitaire: number | string;
  total: number | string;
  benefice_total: number | string;
}

interface VenteSync {
  id_local: string;
  numero: string;
  client_id_local?: string | null;
  date_vente: string;
  total: number | string;
  montant_paye: number | string;
  mode_paiement: string;
  statut: string;
  benefice_total: number | string;
  note?: string;
  date_modification?: string | null;
  supprime_le?: string | null;
  lignes: LigneVenteSync[];
}

interface MouvementSync {
  id_local: string;
  produit_id_local: string;
  nature: string;
  source: string;
  quantite: number | string;
  unite?: string | null;
  quantite_base: number | string;
  stock_avant?: number | string | null;
  stock_apres?: number | string | null;
  prix_unitaire?: number | string | null;
  reference?: string | null;
  motif?: string | null;
  utilisateur?: string | null;
  date_mouvement: string;
  date_modification?: string | null;
  supprime_le?: string | null;
}

interface PullSync {
  cursor: string;
  produits: ProduitSync[];
  clients: ClientSync[];
  fournisseurs: FournisseurSync[];
  ventes: VenteSync[];
  mouvements?: MouvementSync[];
}

interface PushSync {
  cursor?: string;
  appliques?: Array<{ type: TypeObjet; id_local: string; etat: string }>;
  ignores?: Array<{ type: TypeObjet; id_local: string; etat: string }>;
}

export interface ResultatSynchronisation {
  pousses: number;
  recus: number;
  cursor: string;
}

export async function marquerChangement(
  typeObjet: TypeObjet,
  idLocal: string,
  operation = 'upsert',
): Promise<void> {
  if (!idLocal) return;
  await executer(
    `INSERT INTO sync_outbox (type_objet, id_local, operation, date_creation)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(type_objet, id_local)
     DO UPDATE SET operation = excluded.operation,
                   date_creation = excluded.date_creation,
                   derniere_erreur = NULL`,
    typeObjet,
    idLocal,
    operation,
    maintenant(),
  );
}

export async function synchroniser(): Promise<ResultatSynchronisation> {
  const jeton = await jetonAppareil();
  if (!jeton) {
    throw new Error("Activez l'application avant de synchroniser.");
  }

  const pending = await lireTout<LigneOutbox>(
    'SELECT type_objet, id_local FROM sync_outbox ORDER BY date_creation, id',
  );
  let pousses = 0;
  if (pending.length > 0) {
    const push = await appeler<PushSync>('/api/public/sync/push/', jeton, {
      method: 'POST',
      body: JSON.stringify(await construirePayload(pending)),
    });
    const traites = [...(push.appliques ?? []), ...(push.ignores ?? [])];
    await dansTransaction(async () => {
      for (const item of traites) {
        await executer(
          'DELETE FROM sync_outbox WHERE type_objet = ? AND id_local = ?',
          item.type,
          item.id_local,
        );
      }
    });
    pousses = traites.length;
  }

  const cursorLocal = await lireParam(CLE_CURSOR);
  const chemin = cursorLocal
    ? `/api/public/sync/pull/?cursor=${encodeURIComponent(cursorLocal)}`
    : '/api/public/sync/pull/';
  const pull = await appeler<PullSync>(chemin, jeton);
  const recus = await appliquerPull(pull);
  await ecrireParam(CLE_CURSOR, pull.cursor);

  return { pousses, recus, cursor: pull.cursor };
}

async function appeler<T>(
  chemin: string,
  jeton: string,
  options: RequestInit = {},
): Promise<T> {
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI_RESEAU);
  try {
    const reponse = await fetch(`${SERVEUR}${chemin}`, {
      ...options,
      signal: controleur.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Appareil': jeton,
        ...(options.headers ?? {}),
      },
    });
    const corps = await reponse.json().catch(() => ({}));
    if (!reponse.ok) {
      throw new Error(
        typeof corps.erreur === 'string'
          ? corps.erreur
          : 'La synchronisation a ete refusee par le serveur.',
      );
    }
    return corps as T;
  } catch (erreur) {
    if (erreur instanceof Error && erreur.name === 'AbortError') {
      throw new Error('Le serveur ne repond pas. Reessayez quand Internet revient.');
    }
    throw erreur;
  } finally {
    clearTimeout(minuterie);
  }
}

async function construirePayload(pending: LigneOutbox[]) {
  const ids = (typeObjet: TypeObjet) =>
    pending.filter((l) => l.type_objet === typeObjet).map((l) => l.id_local);
  return {
    produits: await lireProduits(ids('produit')),
    clients: await lireClients(ids('client')),
    fournisseurs: await lireFournisseurs(ids('fournisseur')),
    ventes: await lireVentes(ids('vente')),
    mouvements: await lireMouvements(ids('mouvement')),
  };
}

async function lireProduits(ids: string[]): Promise<ProduitSync[]> {
  if (ids.length === 0) return [];
  const produits = await lireTout<ProduitSync>(
    `SELECT id_local, nom, categorie, code_barre, prix_unitaire, prix_achat,
            unite_base, quantite_base, stock_min, gestion_stock, actif,
            date_creation, date_modification
       FROM produit WHERE id_local IN (${placeholders(ids)})`,
    ...ids,
  );
  for (const produit of produits) {
    const local = await lirePremier<{ id: number }>(
      'SELECT id FROM produit WHERE id_local = ?',
      produit.id_local,
    );
    produit.sous_unites = local
      ? await lireTout(
          'SELECT nom, facteur, prix FROM sous_unite WHERE produit_id = ?',
          local.id,
        )
      : [];
  }
  return produits;
}

async function lireClients(ids: string[]): Promise<ClientSync[]> {
  if (ids.length === 0) return [];
  return lireTout(
    `SELECT id_local, nom, telephone, email, adresse, date_creation, date_modification
       FROM client WHERE id_local IN (${placeholders(ids)})`,
    ...ids,
  );
}

async function lireFournisseurs(ids: string[]): Promise<FournisseurSync[]> {
  if (ids.length === 0) return [];
  return lireTout(
    `SELECT id_local, nom, contact, telephone, email, adresse,
            date_creation, date_modification
       FROM fournisseur WHERE id_local IN (${placeholders(ids)})`,
    ...ids,
  );
}

async function lireVentes(ids: string[]): Promise<VenteSync[]> {
  if (ids.length === 0) return [];
  const ventes = await lireTout<VenteSync & { id: number }>(
    `SELECT v.id, v.id_local, v.numero, c.id_local AS client_id_local,
            v.date_vente, v.total, v.montant_paye, v.mode_paiement,
            v.statut, v.benefice_total
       FROM vente v
       LEFT JOIN client c ON c.id = v.client_id
      WHERE v.id_local IN (${placeholders(ids)})`,
    ...ids,
  );
  for (const vente of ventes) {
    vente.lignes = await lireTout<LigneVenteSync>(
      `SELECT p.id_local AS produit_id_local, l.libelle, l.unite, l.facteur,
              l.quantite, l.quantite_base, l.prix_unitaire, l.cout_unitaire,
              l.total, l.benefice_total
         FROM ligne_vente l
         JOIN produit p ON p.id = l.produit_id
        WHERE l.vente_id = ?`,
      vente.id,
    );
  }
  return ventes;
}

async function lireMouvements(ids: string[]): Promise<MouvementSync[]> {
  if (ids.length === 0) return [];
  return lireTout(
    `SELECT m.id_local, p.id_local AS produit_id_local, m.nature,
            m.source_operation AS source, m.quantite, m.unite, m.quantite_base,
            m.stock_avant, m.stock_apres, m.prix_unitaire, m.reference, m.motif,
            m.utilisateur, m.date_mouvement, m.date_mouvement AS date_modification
       FROM mouvement_stock m
       JOIN produit p ON p.id = m.produit_id
      WHERE m.id_local IN (${placeholders(ids)})`,
    ...ids,
  );
}

async function appliquerPull(pull: PullSync): Promise<number> {
  let recus = 0;
  await dansTransaction(async () => {
    for (const produit of pull.produits ?? []) {
      await appliquerProduit(produit);
      recus++;
    }
    for (const client of pull.clients ?? []) {
      await appliquerClient(client);
      recus++;
    }
    for (const fournisseur of pull.fournisseurs ?? []) {
      await appliquerFournisseur(fournisseur);
      recus++;
    }
    for (const vente of pull.ventes ?? []) {
      await appliquerVente(vente);
      recus++;
    }
    for (const mouvement of pull.mouvements ?? []) {
      await appliquerMouvement(mouvement);
      recus++;
    }
  });
  return recus;
}

async function appliquerProduit(p: ProduitSync): Promise<void> {
  await executer(
    `INSERT INTO produit (id_local, nom, categorie, code_barre, prix_unitaire,
                          prix_achat, unite_base, quantite_base, stock_min,
                          gestion_stock, actif, date_creation, date_modification)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_local) DO UPDATE SET
       nom = excluded.nom,
       categorie = excluded.categorie,
       code_barre = excluded.code_barre,
       prix_unitaire = excluded.prix_unitaire,
       prix_achat = excluded.prix_achat,
       unite_base = excluded.unite_base,
       quantite_base = excluded.quantite_base,
       stock_min = excluded.stock_min,
       gestion_stock = excluded.gestion_stock,
       actif = excluded.actif,
       date_modification = excluded.date_modification`,
    p.id_local,
    p.nom,
    p.categorie ?? null,
    p.code_barre ?? null,
    Number(p.prix_unitaire ?? 0),
    Number(p.prix_achat ?? 0),
    p.unite_base || 'Unite',
    Number(p.quantite_base ?? 0),
    Number(p.stock_min ?? 0),
    p.gestion_stock ? 1 : 0,
    p.supprime_le ? 0 : p.actif ? 1 : 0,
    p.date_creation ?? maintenant(),
    p.date_modification ?? maintenant(),
  );
  const local = await lirePremier<{ id: number }>(
    'SELECT id FROM produit WHERE id_local = ?',
    p.id_local,
  );
  if (!local) return;
  await executer('DELETE FROM sous_unite WHERE produit_id = ?', local.id);
  for (const su of p.sous_unites ?? []) {
    await executer(
      'INSERT INTO sous_unite (produit_id, nom, facteur, prix) VALUES (?, ?, ?, ?)',
      local.id,
      su.nom,
      Number(su.facteur ?? 1),
      Number(su.prix ?? 0),
    );
  }
}

async function appliquerClient(c: ClientSync): Promise<void> {
  if (c.supprime_le) return;
  await executer(
    `INSERT INTO client (id_local, nom, telephone, email, adresse, date_creation,
                         date_modification)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_local) DO UPDATE SET
       nom = excluded.nom,
       telephone = excluded.telephone,
       email = excluded.email,
       adresse = excluded.adresse,
       date_modification = excluded.date_modification`,
    c.id_local,
    c.nom,
    c.telephone ?? null,
    c.email ?? null,
    c.adresse ?? null,
    c.date_creation ?? maintenant(),
    c.date_modification ?? maintenant(),
  );
}

async function appliquerFournisseur(f: FournisseurSync): Promise<void> {
  if (f.supprime_le) return;
  await executer(
    `INSERT INTO fournisseur (id_local, nom, contact, telephone, email, adresse,
                              date_creation, date_modification)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_local) DO UPDATE SET
       nom = excluded.nom,
       contact = excluded.contact,
       telephone = excluded.telephone,
       email = excluded.email,
       adresse = excluded.adresse,
       date_modification = excluded.date_modification`,
    f.id_local,
    f.nom,
    f.contact ?? null,
    f.telephone ?? null,
    f.email ?? null,
    f.adresse ?? null,
    f.date_creation ?? maintenant(),
    f.date_modification ?? maintenant(),
  );
}

async function appliquerVente(v: VenteSync): Promise<void> {
  const existe = await lirePremier<{ id: number }>(
    'SELECT id FROM vente WHERE id_local = ?',
    v.id_local,
  );
  if (existe) return;
  const client = v.client_id_local
    ? await lirePremier<{ id: number }>(
        'SELECT id FROM client WHERE id_local = ?',
        v.client_id_local,
      )
    : null;
  const vente = await executer(
    `INSERT INTO vente (id_local, numero, client_id, date_vente, total,
                        montant_paye, mode_paiement, statut, benefice_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    v.id_local,
    v.numero,
    client?.id ?? null,
    v.date_vente,
    Number(v.total ?? 0),
    Number(v.montant_paye ?? 0),
    v.mode_paiement,
    v.statut,
    Number(v.benefice_total ?? 0),
  );
  for (const l of v.lignes ?? []) {
    const produit = await lirePremier<{ id: number }>(
      'SELECT id FROM produit WHERE id_local = ?',
      l.produit_id_local,
    );
    if (!produit) continue;
    await executer(
      `INSERT INTO ligne_vente (vente_id, produit_id, libelle, unite, facteur,
                                quantite, quantite_base, prix_unitaire,
                                cout_unitaire, total, benefice_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      vente.lastInsertRowId,
      produit.id,
      l.libelle,
      l.unite,
      Number(l.facteur ?? 1),
      Number(l.quantite ?? 0),
      Number(l.quantite_base ?? 0),
      Number(l.prix_unitaire ?? 0),
      Number(l.cout_unitaire ?? 0),
      Number(l.total ?? 0),
      Number(l.benefice_total ?? 0),
    );
  }
}

async function appliquerMouvement(m: MouvementSync): Promise<void> {
  const existe = await lirePremier<{ id: number }>(
    'SELECT id FROM mouvement_stock WHERE id_local = ?',
    m.id_local,
  );
  if (existe || m.supprime_le) return;
  const produit = await lirePremier<{ id: number }>(
    'SELECT id FROM produit WHERE id_local = ?',
    m.produit_id_local,
  );
  if (!produit) return;
  await executer(
    `INSERT INTO mouvement_stock (id_local, produit_id, nature, source_operation,
                                  quantite, unite, quantite_base, stock_avant,
                                  stock_apres, prix_unitaire, reference, motif,
                                  utilisateur, date_mouvement)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    m.id_local,
    produit.id,
    m.nature === 'CORRECTION' ? 'AJUSTEMENT' : m.nature,
    m.source,
    Number(m.quantite ?? 0),
    m.unite ?? null,
    Number(m.quantite_base ?? 0),
    m.stock_avant === null || m.stock_avant === undefined ? null : Number(m.stock_avant),
    m.stock_apres === null || m.stock_apres === undefined ? null : Number(m.stock_apres),
    m.prix_unitaire === null || m.prix_unitaire === undefined ? null : Number(m.prix_unitaire),
    m.reference ?? null,
    m.motif ?? null,
    m.utilisateur ?? null,
    m.date_mouvement,
  );
}

async function lireParam(cle: string): Promise<string> {
  const ligne = await lirePremier<{ valeur: string | null }>(
    'SELECT valeur FROM parametre WHERE cle = ?',
    cle,
  );
  return ligne?.valeur ?? '';
}

async function ecrireParam(cle: string, valeur: string): Promise<void> {
  await executer(
    `INSERT INTO parametre (cle, valeur, date_modification) VALUES (?, ?, ?)
     ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur,
                                    date_modification = excluded.date_modification`,
    cle,
    valeur,
    maintenant(),
  );
}

function placeholders(valeurs: unknown[]): string {
  return valeurs.map(() => '?').join(', ');
}
