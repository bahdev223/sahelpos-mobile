/**
 * Inventaire : comptage physique du stock et correction des ecarts.
 *
 * Deroulement, repris de la version bureau :
 *   1. on ouvre un BROUILLON, pre-rempli avec le stock theorique de chaque
 *      produit au moment de l'ouverture ;
 *   2. le commercant compte en rayon et saisit le stock reel, produit par
 *      produit, quand il veut ;
 *   3. la VALIDATION applique les ecarts : elle ecrit un mouvement
 *      d'ajustement par produit et corrige le stock.
 *
 * Le stock theorique est fige a l'ouverture et jamais recalcule ensuite. C'est
 * volontaire : si des ventes ont lieu pendant le comptage, l'ecart doit rester
 * celui que le commercant a constate, sinon il ne comprend plus ce qu'il lit.
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

export type StatutInventaire = 'BROUILLON' | 'VALIDE' | 'ANNULE';

export interface InventaireResume {
  id: number;
  numero: string;
  statut: StatutInventaire;
  dateCreation: string;
  dateValidation: string | null;
  utilisateurNom: string | null;
  nbProduits: number;
  nbEcarts: number;
  valeurEcarts: number;
}

export interface LigneInventaire {
  id: number;
  produitId: number;
  produitNom: string;
  uniteBase: string;
  stockTheorique: number;
  /** null tant que le produit n'a pas ete compte : un zero saisi est une vraie
   *  information (rayon vide), l'absence de saisie n'en est pas une. */
  stockPhysique: number | null;
  ecart: number | null;
  valeurEcart: number | null;
  prixAchat: number;
}

export class InventaireNonModifiable extends Error {
  constructor(statut: string) {
    super(
      statut === 'VALIDE'
        ? 'Cet inventaire est deja valide : il ne peut plus etre modifie.'
        : 'Cet inventaire est annule : il ne peut plus etre modifie.',
    );
    this.name = 'InventaireNonModifiable';
  }
}

export async function listerInventaires(limite = 100): Promise<InventaireResume[]> {
  return lireTout<InventaireResume>(
    `SELECT id, numero, statut, date_creation AS dateCreation,
            date_validation AS dateValidation, utilisateur_nom AS utilisateurNom,
            nb_produits AS nbProduits, nb_ecarts AS nbEcarts,
            valeur_ecarts AS valeurEcarts
     FROM inventaire ORDER BY date_creation DESC LIMIT ?`,
    limite,
  );
}

export async function obtenirInventaire(id: number): Promise<InventaireResume | null> {
  return lirePremier<InventaireResume>(
    `SELECT id, numero, statut, date_creation AS dateCreation,
            date_validation AS dateValidation, utilisateur_nom AS utilisateurNom,
            nb_produits AS nbProduits, nb_ecarts AS nbEcarts,
            valeur_ecarts AS valeurEcarts
     FROM inventaire WHERE id = ?`,
    id,
  );
}

export async function listerLignesInventaire(
  inventaireId: number,
): Promise<LigneInventaire[]> {
  return lireTout<LigneInventaire>(
    `SELECT li.id, li.produit_id AS produitId, p.nom AS produitNom,
            p.unite_base AS uniteBase, li.stock_theorique AS stockTheorique,
            li.stock_physique AS stockPhysique, li.ecart, li.valeur_ecart AS valeurEcart,
            li.prix_achat AS prixAchat
     FROM ligne_inventaire li JOIN produit p ON p.id = li.produit_id
     WHERE li.inventaire_id = ? ORDER BY p.nom`,
    inventaireId,
  );
}

/**
 * Ouvre un inventaire pre-rempli avec tous les produits suivis en stock.
 *
 * Les produits sans gestion de stock (services, prestations) sont exclus :
 * les compter n'aurait pas de sens.
 */
export async function creerInventaire(utilisateurNom?: string): Promise<number> {
  await exigerEcriture('mouvements');
  return dansTransaction(async () => {
    const enCours = await lirePremier<{ id: number; numero: string }>(
      "SELECT id, numero FROM inventaire WHERE statut = 'BROUILLON' LIMIT 1",
    );
    if (enCours) {
      throw new Error(
        `Un inventaire est deja en cours (${enCours.numero}). Terminez-le ou annulez-le avant d'en ouvrir un autre.`,
      );
    }

    const numero = await genererNumero();
    const produits = await lireTout<{
      id: number;
      quantite_base: number;
      prix_achat: number;
    }>(
      'SELECT id, quantite_base, prix_achat FROM produit WHERE actif = 1 AND gestion_stock = 1 ORDER BY nom',
    );

    const r = await executer(
      `INSERT INTO inventaire (id_local, numero, statut, date_creation,
                               utilisateur_nom, nb_produits)
       VALUES (?, ?, 'BROUILLON', ?, ?, ?)`,
      genererIdLocal(),
      numero,
      maintenant(),
      utilisateurNom ?? null,
      produits.length,
    );
    const id = r.lastInsertRowId;

    for (const p of produits) {
      await executer(
        `INSERT INTO ligne_inventaire (inventaire_id, produit_id, stock_theorique,
                                       prix_achat)
         VALUES (?, ?, ?, ?)`,
        id,
        p.id,
        p.quantite_base,
        p.prix_achat,
      );
    }
    return id;
  });
}

/** Enregistre le stock compte pour une ligne et recalcule son ecart. */
export async function saisirComptage(
  inventaireId: number,
  produitId: number,
  stockPhysique: number,
): Promise<void> {
  await exigerEcriture('mouvements');
  await exigerBrouillon(inventaireId);

  const ligne = await lirePremier<{ stock_theorique: number; prix_achat: number }>(
    'SELECT stock_theorique, prix_achat FROM ligne_inventaire WHERE inventaire_id = ? AND produit_id = ?',
    inventaireId,
    produitId,
  );
  if (!ligne) throw new Error('Ce produit ne fait pas partie de cet inventaire.');

  const ecart = stockPhysique - ligne.stock_theorique;
  await executer(
    `UPDATE ligne_inventaire SET stock_physique = ?, ecart = ?, valeur_ecart = ?
     WHERE inventaire_id = ? AND produit_id = ?`,
    stockPhysique,
    ecart,
    Math.round(ecart * ligne.prix_achat),
    inventaireId,
    produitId,
  );
  await rafraichirTotaux(inventaireId);
}

export interface ResultatValidation {
  numero: string;
  produitsAjustes: number;
  nbComptes: number;
  nbEcarts: number;
  valeurEcarts: number;
}

/** Les saisies visibles a l'ecran sont rejouees dans la transaction de validation. */
export interface ComptageValidation {
  ligneId: number;
  produitId: number;
  stockPhysique: number | null;
}

/**
 * Un seul moteur de validation pour l'ecran et les autres appelants.
 * Le delta est calcule par rapport au stock fige a l'ouverture, puis applique
 * au stock COURANT afin de ne pas effacer les ventes faites pendant le comptage.
 * La mise a jour du produit, le journal et l'outbox sont atomiques.
 */
export async function validerInventaire(
  inventaireId: number,
  utilisateurNom?: string,
  comptages?: ComptageValidation[],
): Promise<ResultatValidation> {
  await exigerEcriture('mouvements');

  const resultat = await dansTransaction(async () => {
    // Tester le statut DANS la transaction, apres avoir acquis l'acces SQLite.
    const inv = await exigerBrouillon(inventaireId);

    if (comptages) {
      const attendues = await lireTout<{
        id: number; produit_id: number; stock_theorique: number; prix_achat: number;
      }>(
        'SELECT id, produit_id, stock_theorique, prix_achat FROM ligne_inventaire WHERE inventaire_id = ?',
        inventaireId,
      );
      if (comptages.length !== attendues.length) {
        throw new Error('Le comptage a change. Rechargez cet inventaire avant de le valider.');
      }
      const parLigne = new Map(attendues.map((ligne) => [ligne.id, ligne]));
      const dejaVues = new Set<number>();
      for (const c of comptages) {
        const reference = parLigne.get(c.ligneId);
        if (!reference || reference.produit_id !== c.produitId || dejaVues.has(c.ligneId)) {
          throw new Error('Une ligne de comptage ne correspond pas a cet inventaire.');
        }
        dejaVues.add(c.ligneId);
        if (c.stockPhysique !== null &&
            (!Number.isFinite(c.stockPhysique) || c.stockPhysique < 0)) {
          throw new Error('Le stock compte doit etre un nombre positif ou zero.');
        }
        const ecart = c.stockPhysique === null ? null : c.stockPhysique - reference.stock_theorique;
        await executer(
          'UPDATE ligne_inventaire SET stock_physique = ?, ecart = ?, valeur_ecart = ? WHERE id = ? AND inventaire_id = ?',
          c.stockPhysique,
          ecart,
          ecart === null ? null : Math.round(ecart * reference.prix_achat),
          c.ligneId,
          inventaireId,
        );
      }
    }

    const lignes = await lireTout<{
      produit_id: number;
      stock_theorique: number;
      stock_physique: number;
      prix_achat: number;
    }>(
      `SELECT produit_id, stock_theorique, stock_physique, prix_achat
         FROM ligne_inventaire
        WHERE inventaire_id = ? AND stock_physique IS NOT NULL`,
      inventaireId,
    );
    if (lignes.length === 0) {
      throw new Error('Saisissez au moins un comptage avant la validation.');
    }

    const horodatage = maintenant();
    let ajustes = 0;
    let valeur = 0;

    for (const l of lignes) {
      const ecart = l.stock_physique - l.stock_theorique;
      if (!Number.isFinite(ecart) || l.stock_physique < 0 ||
          !Number.isFinite(l.prix_achat) || l.prix_achat < 0) {
        throw new Error('Une ligne comporte un comptage ou un prix incoherent.');
      }
      if (Math.abs(ecart) < 0.0001) continue;

      const p = await lirePremier<{
        quantite_base: number;
        unite_base: string;
        gestion_stock: number;
      }>(
        'SELECT quantite_base, unite_base, gestion_stock FROM produit WHERE id = ?',
        l.produit_id,
      );
      if (!p || !p.gestion_stock || !Number.isFinite(p.quantite_base)) {
        throw new Error('Un produit de cet inventaire est introuvable ou non suivi en stock.');
      }
      // Un stock de modele a variantes doit etre corrige par variante, pas
      // directement sur la somme en laissant les tailles/couleurs inchangees.
      const variante = await lirePremier<{ id: number }>(
        'SELECT id FROM variante_produit WHERE produit_id = ? AND actif = 1 LIMIT 1',
        l.produit_id,
      );
      if (variante) {
        throw new Error('Ce produit possede des tailles ou couleurs : inventairez ses variantes avant de corriger son stock.');
      }

      const avant = p.quantite_base;
      const apres = avant + ecart;
      if (!Number.isFinite(apres) || apres < 0) {
        throw new Error('Le stock a change pendant le comptage. Actualisez et recomptez ce produit.');
      }

      await executer(
        'UPDATE produit SET quantite_base = ?, date_modification = ? WHERE id = ?',
        apres, horodatage, l.produit_id,
      );
      const idLocal = genererIdLocal();
      await executer(
        `INSERT INTO mouvement_stock
            (id_local, produit_id, nature, source_operation, quantite, unite,
             quantite_base, stock_avant, stock_apres, prix_unitaire, reference,
             motif, utilisateur, date_mouvement)
          VALUES (?, ?, 'AJUSTEMENT', 'INVENTAIRE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        idLocal, l.produit_id, l.stock_physique, p.unite_base, ecart,
        avant, apres, l.prix_achat, inv.numero, `Inventaire ${inv.numero}`,
        utilisateurNom ?? null, horodatage,
      );
      // Meme transaction que la correction de stock : aucune ecriture perdue.
      await marquerChangement('mouvement', idLocal);

      ajustes++;
      valeur += Math.round(ecart * l.prix_achat);
    }

    await executer(
      `UPDATE inventaire
          SET statut = 'VALIDE', date_validation = ?, nb_ecarts = ?, valeur_ecarts = ?
        WHERE id = ? AND statut = 'BROUILLON'`,
      horodatage, ajustes, valeur, inventaireId,
    );
    return {
      numero: inv.numero,
      produitsAjustes: ajustes,
      nbComptes: lignes.length,
      nbEcarts: ajustes,
      valeurEcarts: valeur,
    };
  });

  void verifierStock();
  return resultat;
}

export async function annulerInventaire(inventaireId: number): Promise<void> {
  await exigerEcriture('mouvements');
  await exigerBrouillon(inventaireId);
  await executer("UPDATE inventaire SET statut = 'ANNULE' WHERE id = ?", inventaireId);
}

// ---------------------------------------------------------------------------

async function exigerBrouillon(id: number): Promise<{ numero: string }> {
  const inv = await lirePremier<{ statut: string; numero: string }>(
    'SELECT statut, numero FROM inventaire WHERE id = ?',
    id,
  );
  if (!inv) throw new Error('Inventaire introuvable.');
  if (inv.statut !== 'BROUILLON') throw new InventaireNonModifiable(inv.statut);
  return { numero: inv.numero };
}

async function rafraichirTotaux(inventaireId: number): Promise<void> {
  const t = await lirePremier<{ n: number; valeur: number | null }>(
    `SELECT COUNT(*) AS n, SUM(valeur_ecart) AS valeur
     FROM ligne_inventaire
     WHERE inventaire_id = ? AND ecart IS NOT NULL AND ecart <> 0`,
    inventaireId,
  );
  await executer(
    'UPDATE inventaire SET nb_ecarts = ?, valeur_ecarts = ? WHERE id = ?',
    t?.n ?? 0,
    Math.round(t?.valeur ?? 0),
    inventaireId,
  );
}

/** INV-AAAAMMJJ-01, remis a 1 chaque jour. */
async function genererNumero(): Promise<string> {
  const d = new Date();
  const deux = (n: number) => String(n).padStart(2, '0');
  const prefixe = `INV-${d.getFullYear()}${deux(d.getMonth() + 1)}${deux(d.getDate())}-`;
  const l = await lirePremier<{ n: number }>(
    'SELECT COUNT(*) AS n FROM inventaire WHERE numero LIKE ?',
    prefixe + '%',
  );
  return prefixe + String((l?.n ?? 0) + 1).padStart(2, '0');
}
