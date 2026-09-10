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
const CLE_BOUTIQUE = 'sync.boutique';
const CLE_BOOTSTRAP = 'sync.bootstrap_effectue';
const CLE_PROTOCOLE = 'sync.protocole';
const VERSION_PROTOCOLE = '2';
const CLE_DERNIERE_TENTATIVE = 'sync.derniere_tentative';
const CLE_DERNIER_SUCCES = 'sync.dernier_succes';
const CLE_DERNIERE_ERREUR = 'sync.derniere_erreur';
const CLE_DERNIER_PUSH = 'sync.dernier_push';
const CLE_DERNIER_PULL = 'sync.dernier_pull';
const CLE_DERNIER_NOMBRE_PUSH = 'sync.dernier_nombre_push';
const CLE_DERNIER_NOMBRE_PULL = 'sync.dernier_nombre_pull';
const CLE_BOUTIQUE_MODIFIEE = 'sync.boutique_modifiee';

type TypeObjet = 'produit' | 'client' | 'fournisseur' | 'vente' | 'mouvement' | 'achat' | 'boutique';

interface LigneOutbox {
  type_objet: TypeObjet;
  id_local: string;
  statut: 'PENDING' | 'SENDING' | 'FAILED';
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
  chemin_image?: string | null;
  image_url?: string | null;
  image_version?: string | null;
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

interface LigneAchatSync {
  produit_id_local: string;
  libelle: string;
  unite: string;
  facteur: number | string;
  quantite: number | string;
  quantite_base: number | string;
  prix_unitaire: number | string;
  total: number | string;
}

interface PaiementAchatSync {
  id_local: string;
  montant: number | string;
  mode_paiement: string;
  date_paiement: string;
  note?: string | null;
}

interface AchatSync {
  id_local: string;
  numero: string;
  fournisseur_id_local?: string | null;
  reference?: string | null;
  date_achat: string;
  total: number | string;
  montant_paye: number | string;
  statut: string;
  date_reception?: string | null;
  motif?: string | null;
  date_modification?: string | null;
  supprime_le?: string | null;
  lignes: LigneAchatSync[];
  paiements: PaiementAchatSync[];
}

interface BoutiqueSync {
  nom?: string;
  adresse?: string | null;
  telephone?: string | null;
  devise?: string | null;
  logo?: string | null;
  pied_de_page?: string | null;
  date_modification?: string | null;
}

interface PullSync {
  cursor: string;
  has_more?: boolean;
  produits: ProduitSync[];
  clients: ClientSync[];
  fournisseurs: FournisseurSync[];
  ventes: VenteSync[];
  mouvements?: MouvementSync[];
  achats?: AchatSync[];
  boutique?: BoutiqueSync;
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

export interface EtatSynchronisation {
  derniereTentative: string | null;
  dernierSucces: string | null;
  derniereErreur: string | null;
  dernierPush: string | null;
  dernierPull: string | null;
  dernierNombrePush: number | null;
  dernierNombrePull: number | null;
  enAttente: number;
  cursor: string | null;
}

/** Signale a la racine qu'une ecriture locale attend d'etre poussee. */
const ecouteursChangement = new Set<() => void>();

export function ecouterChangementSynchronisation(ecouteur: () => void): () => void {
  ecouteursChangement.add(ecouteur);
  return () => ecouteursChangement.delete(ecouteur);
}

function notifierChangement(): void {
  for (const ecouteur of ecouteursChangement) ecouteur();
}

export class SynchronisationImpossible extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SynchronisationImpossible';
  }
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
                   derniere_erreur = NULL,
                   statut = 'PENDING'`,
    typeObjet,
    idLocal,
    operation,
    maintenant(),
  );
  notifierChangement();
}

/** Met en file la fiche imprimee sur les factures (nom, devise, logo Web…). */
export async function marquerBoutiqueModifiee(): Promise<void> {
  const date = maintenant();
  await ecrireParam(CLE_BOUTIQUE_MODIFIEE, date);
  await marquerChangement('boutique', 'configuration');
}

export async function lireEtatSynchronisation(): Promise<EtatSynchronisation> {
  const [derniereTentative, dernierSucces, derniereErreur, dernierPush, dernierPull, dernierNombrePush, dernierNombrePull, cursor, attente] = await Promise.all([
    lireParam(CLE_DERNIERE_TENTATIVE),
    lireParam(CLE_DERNIER_SUCCES),
    lireParam(CLE_DERNIERE_ERREUR),
    lireParam(CLE_DERNIER_PUSH),
    lireParam(CLE_DERNIER_PULL),
    lireParam(CLE_DERNIER_NOMBRE_PUSH),
    lireParam(CLE_DERNIER_NOMBRE_PULL),
    lireParam(CLE_CURSOR),
    lirePremier<{ n: number }>("SELECT COUNT(*) AS n FROM sync_outbox WHERE statut != 'SYNCED'"),
  ]);
  return {
    derniereTentative: derniereTentative || null,
    dernierSucces: dernierSucces || null,
    derniereErreur: derniereErreur || null,
    dernierPush: dernierPush || null,
    dernierPull: dernierPull || null,
    dernierNombrePush: dernierNombrePush === '' ? null : nombre(dernierNombrePush),
    dernierNombrePull: dernierNombrePull === '' ? null : nombre(dernierNombrePull),
    enAttente: attente?.n ?? 0,
    cursor: cursor || null,
  };
}

export async function synchroniser(): Promise<ResultatSynchronisation> {
  const jeton = await jetonAppareil();
  if (!jeton) {
    throw new Error("Activez l'application avant de synchroniser.");
  }
  await ecrireParam(CLE_DERNIERE_TENTATIVE, maintenant());
  try {
    // Un arret brutal peut laisser des lignes marquees SENDING. Sans accuse
    // local elles doivent etre rejouees; Django les deduplique par id_local.
    await executer("UPDATE sync_outbox SET statut = 'PENDING' WHERE statut = 'SENDING'");
    const pending = await lireTout<LigneOutbox>(
      "SELECT type_objet, id_local, statut FROM sync_outbox WHERE statut IN ('PENDING', 'FAILED') ORDER BY date_creation, id",
    );
    let pousses = 0;
    if (pending.length > 0) {
      await dansTransaction(async () => {
        for (const item of pending) {
          await executer(
            "UPDATE sync_outbox SET statut = 'SENDING', derniere_erreur = NULL WHERE type_objet = ? AND id_local = ?",
            item.type_objet,
            item.id_local,
          );
        }
      });
      const push = await appeler<PushSync>('/api/public/sync/push/', jeton, {
        method: 'POST',
        body: JSON.stringify(await construirePayload(pending)),
      });
      const traites = [...(push.appliques ?? []), ...(push.ignores ?? [])];
      await dansTransaction(async () => {
        const confirmes = new Set(traites.map((item) => `${item.type}:${item.id_local}`));
        for (const item of traites) {
          await executer(
            'DELETE FROM sync_outbox WHERE type_objet = ? AND id_local = ?',
            item.type,
            item.id_local,
          );
        }
        // Le serveur traite normalement le lot entier de maniere atomique.
        // Cette garde empeche toutefois qu'un ACK incomplet abandonne une
        // operation en etat SENDING apres une reponse mal formee.
        for (const item of pending) {
          if (confirmes.has(`${item.type_objet}:${item.id_local}`)) continue;
          await executer(
            `UPDATE sync_outbox
                SET statut = 'FAILED', derniere_erreur = ?
              WHERE type_objet = ? AND id_local = ?`,
            'Aucun accuse de reception du serveur.',
            item.type_objet,
            item.id_local,
          );
        }
      });
      pousses = traites.length;
      await ecrireParam(CLE_DERNIER_PUSH, maintenant());
    }

    let cursor = await lireParam(CLE_CURSOR);
    let recus = 0;
    let aSuivre = false;
    do {
      const cursorAvant = cursor;
      const chemin = cursor
        ? `/api/public/sync/pull/?cursor=${encodeURIComponent(cursor)}&limit=500`
        : '/api/public/sync/pull/?limit=500';
      const pull = await appeler<PullSync>(chemin, jeton);
      if (!pull.cursor || (pull.has_more && pull.cursor === cursorAvant)) {
        throw new SynchronisationImpossible('Le serveur a renvoye un curseur de synchronisation invalide.');
      }
      recus += await appliquerPull(pull);
      cursor = pull.cursor;
      aSuivre = Boolean(pull.has_more);
    } while (aSuivre);
    await ecrireParam(CLE_DERNIER_PULL, maintenant());
    await ecrireParam(CLE_DERNIER_NOMBRE_PUSH, String(pousses));
    await ecrireParam(CLE_DERNIER_NOMBRE_PULL, String(recus));
    await ecrireParam(CLE_DERNIER_SUCCES, maintenant());
    await ecrireParam(CLE_DERNIERE_ERREUR, '');
    return { pousses, recus, cursor };
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : 'Erreur de synchronisation inconnue.';
    // L'erreur est durable : si le telephone revient plus tard en ligne, le
    // commercant peut comprendre ce qui s'est passe avant le prochain succes.
    await ecrireParam(CLE_DERNIERE_ERREUR, message).catch(() => {});
    await executer(
      `UPDATE sync_outbox
          SET tentatives = tentatives + 1, derniere_erreur = ?, statut = 'FAILED'`,
      message,
    ).catch(() => {});
    throw erreur;
  }
}

export async function bootstrapInitial(boutiqueId: string): Promise<ResultatSynchronisation> {
  const boutiqueCourante = await lireParam(CLE_BOUTIQUE);
  const dejaPret = await lireParam(CLE_BOOTSTRAP);
  const protocole = await lireParam(CLE_PROTOCOLE);
  if (boutiqueCourante === boutiqueId && dejaPret === '1' && protocole === VERSION_PROTOCOLE) {
    return synchroniser();
  }

  if (boutiqueCourante && boutiqueCourante !== boutiqueId) {
    await viderDonneesMetier();
  }

  await ecrireParam(CLE_BOUTIQUE, boutiqueId);
  await ecrireParam(CLE_CURSOR, '');

  try {
    const resultat = await synchroniser();
    await ecrireParam(CLE_BOOTSTRAP, '1');
    await ecrireParam(CLE_PROTOCOLE, VERSION_PROTOCOLE);
    return resultat;
  } catch (erreur) {
    await ecrireParam(CLE_BOOTSTRAP, '0');
    throw new SynchronisationImpossible(
      erreur instanceof Error
        ? erreur.message
        : "La premiere synchronisation n'a pas pu etre terminee.",
    );
  }
}

async function viderDonneesMetier(): Promise<void> {
  await dansTransaction(async () => {
    await executer('DELETE FROM sync_outbox');
    await executer('DELETE FROM ligne_vente');
    await executer('DELETE FROM vente');
    await executer('DELETE FROM mouvement_stock');
    await executer('DELETE FROM ligne_achat');
    await executer('DELETE FROM paiement_achat');
    await executer('DELETE FROM achat');
    await executer('DELETE FROM ligne_inventaire');
    await executer('DELETE FROM inventaire');
    await executer('DELETE FROM sous_unite');
    await executer('DELETE FROM produit');
    await executer('DELETE FROM client');
    await executer('DELETE FROM fournisseur');
  });
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
    achats: await lireAchats(ids('achat')),
    boutique: ids('boutique').length > 0 ? await lireBoutique() : undefined,
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

async function lireAchats(ids: string[]): Promise<AchatSync[]> {
  if (ids.length === 0) return [];
  const achats = await lireTout<AchatSync & { id: number }>(
    `SELECT a.id, a.id_local, a.numero, f.id_local AS fournisseur_id_local,
            a.reference, a.date_achat, a.total, a.montant_paye, a.statut,
            a.date_reception, a.motif, a.date_modification
       FROM achat a
       LEFT JOIN fournisseur f ON f.id = a.fournisseur_id
      WHERE a.id_local IN (${placeholders(ids)})`,
    ...ids,
  );
  for (const achat of achats) {
    achat.lignes = await lireTout<LigneAchatSync>(
      `SELECT p.id_local AS produit_id_local, l.libelle, l.unite, l.facteur,
              l.quantite, l.quantite_base, l.prix_unitaire, l.total
         FROM ligne_achat l
         JOIN produit p ON p.id = l.produit_id
        WHERE l.achat_id = ? ORDER BY l.id`,
      achat.id,
    );
    achat.paiements = await lireTout<PaiementAchatSync>(
      `SELECT id_local, montant, mode_paiement, date_paiement, note
         FROM paiement_achat WHERE achat_id = ? ORDER BY id`,
      achat.id,
    );
  }
  return achats;
}

async function lireBoutique(): Promise<BoutiqueSync> {
  const valeurs = await lireTout<{ cle: string; valeur: string | null }>(
    `SELECT cle, valeur FROM parametre
      WHERE cle IN ('boutique_nom', 'boutique_adresse', 'boutique_telephone',
                    'boutique_logo', 'devise', 'recu_pied_de_page')`,
  );
  const table = Object.fromEntries(valeurs.map((item) => [item.cle, item.valeur ?? '']));
  return {
    nom: table.boutique_nom,
    adresse: table.boutique_adresse || null,
    telephone: table.boutique_telephone || null,
    devise: table.devise || null,
    // Une image locale ne peut pas etre lue par le serveur. Elle reste locale
    // jusqu'a l'ajout d'un transfert de media dedie; une URL Web, elle, voyage.
    logo: /^https?:\/\//.test(table.boutique_logo ?? '') ? table.boutique_logo : null,
    pied_de_page: table.recu_pied_de_page || null,
    date_modification: (await lireParam(CLE_BOUTIQUE_MODIFIEE)) || maintenant(),
  };
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
    for (const achat of pull.achats ?? []) {
      await appliquerAchat(achat);
      recus++;
    }
    if (pull.boutique) {
      await appliquerBoutique(pull.boutique);
      recus++;
    }
    // Le curseur est ecrit dans la MEME transaction que les objets recus.
    // Un crash ne peut donc pas avancer le curseur sur une base a moitie mise
    // a jour : le prochain cycle reprendra exactement le meme lot.
    await ecrireParam(CLE_CURSOR, pull.cursor);
  });
  return recus;
}

async function appliquerProduit(p: ProduitSync): Promise<void> {
  await executer(
    `INSERT INTO produit (id_local, nom, categorie, code_barre, prix_unitaire,
                          prix_achat, unite_base, quantite_base, stock_min,
                          gestion_stock, chemin_image, actif, date_creation,
                          date_modification)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       chemin_image = excluded.chemin_image,
       actif = excluded.actif,
       date_modification = excluded.date_modification`,
    p.id_local,
    p.nom,
    p.categorie ?? null,
    p.code_barre ?? null,
    nombre(p.prix_unitaire),
    nombre(p.prix_achat),
    p.unite_base || 'Unite',
    nombre(p.quantite_base),
    nombre(p.stock_min),
    p.gestion_stock ? 1 : 0,
    urlImageVersionnee(p.image_url ?? p.chemin_image ?? null, p.image_version ?? null),
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
      nombre(su.facteur, 1),
      nombre(su.prix),
    );
  }
}

async function appliquerClient(c: ClientSync): Promise<void> {
  if (c.supprime_le) {
    await executer('UPDATE vente SET client_id = NULL WHERE client_id IN (SELECT id FROM client WHERE id_local = ?)', c.id_local);
    await executer('DELETE FROM client WHERE id_local = ?', c.id_local);
    return;
  }
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
  if (f.supprime_le) {
    await executer('UPDATE achat SET fournisseur_id = NULL WHERE fournisseur_id IN (SELECT id FROM fournisseur WHERE id_local = ?)', f.id_local);
    await executer('DELETE FROM fournisseur WHERE id_local = ?', f.id_local);
    return;
  }
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
  if (v.supprime_le) {
    if (existe) await executer('DELETE FROM vente WHERE id = ?', existe.id);
    return;
  }
  const client = v.client_id_local
    ? await lirePremier<{ id: number }>(
        'SELECT id FROM client WHERE id_local = ?',
        v.client_id_local,
      )
    : null;
  const venteId = existe?.id ?? (await executer(
    `INSERT INTO vente (id_local, numero, client_id, date_vente, total,
                        montant_paye, mode_paiement, statut, benefice_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    v.id_local, v.numero, client?.id ?? null, v.date_vente, nombre(v.total),
    nombre(v.montant_paye), v.mode_paiement, v.statut, nombre(v.benefice_total),
  )).lastInsertRowId;
  if (existe) {
    await executer(
      `UPDATE vente SET numero = ?, client_id = ?, date_vente = ?, total = ?,
                        montant_paye = ?, mode_paiement = ?, statut = ?, benefice_total = ?
        WHERE id = ?`,
      v.numero, client?.id ?? null, v.date_vente, nombre(v.total), nombre(v.montant_paye),
      v.mode_paiement, v.statut, nombre(v.benefice_total), venteId,
    );
    await executer('DELETE FROM ligne_vente WHERE vente_id = ?', venteId);
  }
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
      venteId,
      produit.id,
      l.libelle,
      l.unite,
      nombre(l.facteur, 1),
      nombre(l.quantite),
      nombre(l.quantite_base),
      nombre(l.prix_unitaire),
      nombre(l.cout_unitaire),
      nombre(l.total),
      nombre(l.benefice_total),
    );
  }
}

async function appliquerMouvement(m: MouvementSync): Promise<void> {
  const existe = await lirePremier<{ id: number }>(
    'SELECT id FROM mouvement_stock WHERE id_local = ?',
    m.id_local,
  );
  if (existe || m.supprime_le) return;
  // Une vente ou un achat local pousse d'abord sa tete; le serveur cree alors
  // son mouvement comptable avec son propre id_local. Cette reference est la
  // meme operation : l'ajouter une seconde fois ne fausserait pas le stock
  // (le produit est la source de verite), mais doublerait son journal.
  if (m.reference) {
    const memeEvenement = await lirePremier<{ id: number }>(
      `SELECT id FROM mouvement_stock
        WHERE source_operation = ? AND reference = ? LIMIT 1`,
      m.source, m.reference,
    );
    if (memeEvenement) return;
  }
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
    nombre(m.quantite),
    m.unite ?? null,
    nombre(m.quantite_base),
    nombreOptionnel(m.stock_avant),
    nombreOptionnel(m.stock_apres),
    nombreOptionnel(m.prix_unitaire),
    m.reference ?? null,
    m.motif ?? null,
    m.utilisateur ?? null,
    m.date_mouvement,
  );
}

async function appliquerAchat(a: AchatSync): Promise<void> {
  const existant = await lirePremier<{ id: number }>(
    'SELECT id FROM achat WHERE id_local = ?', a.id_local,
  );
  if (a.supprime_le) {
    if (existant) await executer('DELETE FROM achat WHERE id = ?', existant.id);
    return;
  }

  const fournisseur = a.fournisseur_id_local
    ? await lirePremier<{ id: number }>('SELECT id FROM fournisseur WHERE id_local = ?', a.fournisseur_id_local)
    : null;
  const achatId = existant?.id ?? (await executer(
    `INSERT INTO achat (id_local, numero, fournisseur_id, reference, date_achat, total,
                        montant_paye, statut, date_reception, motif, date_modification)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    a.id_local, a.numero, fournisseur?.id ?? null, a.reference ?? null, a.date_achat,
    nombre(a.total), nombre(a.montant_paye), a.statut, a.date_reception ?? null,
    a.motif ?? null, a.date_modification ?? maintenant(),
  )).lastInsertRowId;

  if (existant) {
    await executer(
      `UPDATE achat SET numero = ?, fournisseur_id = ?, reference = ?, date_achat = ?,
                        total = ?, montant_paye = ?, statut = ?, date_reception = ?,
                        motif = ?, date_modification = ? WHERE id = ?`,
      a.numero, fournisseur?.id ?? null, a.reference ?? null, a.date_achat,
      nombre(a.total), nombre(a.montant_paye), a.statut, a.date_reception ?? null,
      a.motif ?? null, a.date_modification ?? maintenant(), achatId,
    );
    await executer('DELETE FROM ligne_achat WHERE achat_id = ?', achatId);
    await executer('DELETE FROM paiement_achat WHERE achat_id = ?', achatId);
  }

  for (const ligne of a.lignes ?? []) {
    const produit = await lirePremier<{ id: number }>(
      'SELECT id FROM produit WHERE id_local = ?', ligne.produit_id_local,
    );
    if (!produit) {
      throw new SynchronisationImpossible(`Produit manquant pour l'achat ${a.numero}.`);
    }
    await executer(
      `INSERT INTO ligne_achat (achat_id, produit_id, libelle, unite, facteur, quantite,
                                quantite_base, prix_unitaire, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      achatId, produit.id, ligne.libelle, ligne.unite, nombre(ligne.facteur, 1),
      nombre(ligne.quantite), nombre(ligne.quantite_base), nombre(ligne.prix_unitaire),
      nombre(ligne.total),
    );
  }
  for (const paiement of a.paiements ?? []) {
    await executer(
      `INSERT INTO paiement_achat (id_local, achat_id, montant, mode_paiement, date_paiement, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      paiement.id_local, achatId, nombre(paiement.montant), paiement.mode_paiement,
      paiement.date_paiement, paiement.note ?? null,
    );
  }
}

async function appliquerBoutique(boutique: BoutiqueSync): Promise<void> {
  const valeurs: Array<[string, string]> = [
    ['boutique_nom', boutique.nom ?? ''],
    ['boutique_adresse', boutique.adresse ?? ''],
    ['boutique_telephone', boutique.telephone ?? ''],
    ['devise', boutique.devise ?? ''],
    ['recu_pied_de_page', boutique.pied_de_page ?? ''],
  ];
  for (const [cle, valeur] of valeurs) {
    await ecrireParam(cle, valeur);
  }
  // Une absence de logo Web ne doit pas effacer un fichier choisi localement
  // pour les factures. Le flux media pourra plus tard envoyer ce fichier; une
  // URL Web explicite, elle, peut deja etre appliquee sans ambiguite.
  if (boutique.logo && /^https?:\/\//.test(boutique.logo)) {
    await ecrireParam('boutique_logo', boutique.logo);
  }
  if (boutique.date_modification) await ecrireParam(CLE_BOUTIQUE_MODIFIEE, boutique.date_modification);
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

function nombre(valeur: number | string | null | undefined, defaut = 0): number {
  const n = Number(valeur ?? defaut);
  return Number.isFinite(n) ? n : defaut;
}

function nombreOptionnel(valeur: number | string | null | undefined): number | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : null;
}

function urlImageVersionnee(url: string | null, version: string | null): string | null {
  if (!url || !version || !/^https?:\/\//.test(url)) return url;
  const separateur = url.includes('?') ? '&' : '?';
  return `${url}${separateur}v=${encodeURIComponent(version)}`;
}
