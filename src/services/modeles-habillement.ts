import type { SQLiteDatabase } from 'expo-sqlite';
import { obtenirBase } from '../db/database';
import { genererIdLocal } from '../db/repositories/base';
import { etatCourant, exigerEcriture } from './abonnement';
import {
  preparerMatrice, signatureCombinaison,
  type CombinaisonModele, type DimensionModele,
} from '../domain/matrice-habillement';

type Transaction = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;
export interface SaisieModeleHabillement {
  id?: number;
  idLocal: string;
  dateModification?: string | null;
  nom: string;
  categorie: string;
  prixUnitaire: number;
  prixAchat: number;
  codeBarre: string | null;
  stockMin: number;
  cheminImage: string | null;
  /** En édition, ces valeurs ajoutent des combinaisons, sans remplacer les existantes. */
  valeursIds: number[];
  articleUnique?: boolean;
}
export interface ModelePourEdition {
  id: number;
  idLocal: string;
  dateModification: string | null;
  nom: string;
  categorie: string;
  prixUnitaire: number;
  prixAchat: number;
  codeBarre: string | null;
  stockMin: number;
  cheminImage: string | null;
}
interface LigneModele {
  id: number; id_local: string; date_modification: string | null;
  nom: string; categorie: string | null; prix_unitaire: number; prix_achat: number;
  code_barre: string | null; stock_min: number; chemin_image: string | null;
}
const COLONNES = 'id, id_local, date_modification, nom, categorie, prix_unitaire, prix_achat, code_barre, stock_min, chemin_image';
function convertir(p: LigneModele): ModelePourEdition {
  return { id: p.id, idLocal: p.id_local, dateModification: p.date_modification,
    nom: p.nom, categorie: p.categorie ?? '', prixUnitaire: p.prix_unitaire,
    prixAchat: p.prix_achat, codeBarre: p.code_barre, stockMin: p.stock_min,
    cheminImage: p.chemin_image };
}

export async function chargerModelePourEdition(id: number): Promise<ModelePourEdition> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Identifiant de modèle invalide.');
  const db = await obtenirBase();
  const p = await db.getFirstAsync<LigneModele>(`SELECT ${COLONNES} FROM produit WHERE id = ?`, id);
  if (!p) throw new Error('Ce modèle est introuvable.');
  return convertir(p);
}

async function lireReferentiel(db: Transaction): Promise<DimensionModele[]> {
  const lignes = await db.getAllAsync<{
    valeur_serveur_id: number; dimension_id: number; dimension_code: string;
    dimension_nom: string; dimension_ordre: number; valeur_code: string;
    valeur_nom: string; code_hex: string | null; valeur_ordre: number;
  }>(`SELECT v.id_serveur AS valeur_serveur_id, d.id_serveur AS dimension_id,
      d.code AS dimension_code, d.nom AS dimension_nom, d.ordre AS dimension_ordre,
      v.code AS valeur_code, v.nom AS valeur_nom, v.code_hex, v.ordre AS valeur_ordre
    FROM valeur_dimension_ref v JOIN dimension_variante_ref d ON d.id_serveur = v.dimension_id_serveur
    ORDER BY d.ordre, d.code, v.ordre, v.id_serveur`);
  const dimensions = new Map<string, DimensionModele>();
  for (const l of lignes) {
    const d = dimensions.get(l.dimension_code) ?? { code: l.dimension_code,
      nom: l.dimension_nom, ordre: l.dimension_ordre, valeurs: [] };
    d.valeurs.push({ valeurServeurId: l.valeur_serveur_id, dimensionId: l.dimension_id,
      dimensionCode: l.dimension_code, dimensionNom: l.dimension_nom, dimensionOrdre: l.dimension_ordre,
      code: l.valeur_code, nom: l.valeur_nom, codeHex: l.code_hex, ordre: l.valeur_ordre });
    dimensions.set(d.code, d);
  }
  return [...dimensions.values()];
}
export async function chargerReferentielModeles(): Promise<DimensionModele[]> {
  return lireReferentiel(await obtenirBase());
}

async function verifierProfil(): Promise<void> {
  await exigerEcriture();
  const profil = (await etatCourant()).droit?.commerce;
  if (profil?.secteur !== 'HABILLEMENT' || !profil.capabilities_effectives.includes('PRODUCT_VARIANTS')) {
    throw new Error('La gestion des modèles et variantes n’est pas autorisée pour ce profil.');
  }
}
async function verifierResponsable(db: Transaction, utilisateurId: number): Promise<void> {
  if (!Number.isSafeInteger(utilisateurId) || utilisateurId <= 0) throw new Error('Connectez un responsable.');
  const u = await db.getFirstAsync<{ actif: number; role: string }>(
    'SELECT actif, role FROM utilisateur WHERE id = ?', utilisateurId);
  if (u?.actif !== 1 || !['admin', 'patron', 'gerant'].includes(u.role)) {
    throw new Error('Seul un responsable actif peut modifier le catalogue.');
  }
}
async function mettreEnFile(db: Transaction, type: 'produit' | 'variante', id: string, date: string): Promise<void> {
  await db.runAsync(`INSERT INTO sync_outbox (type_objet, id_local, operation, date_creation, statut)
    VALUES (?, ?, 'upsert', ?, 'PENDING') ON CONFLICT(type_objet,id_local) DO UPDATE SET
    operation='upsert', date_creation=excluded.date_creation, statut='PENDING', derniere_erreur=NULL`, type, id, date);
}

async function lireSignatures(db: Transaction, produitId: number): Promise<Map<string, number>> {
  const lignes = await db.getAllAsync<{ id: number; valeur_serveur_id: number | null }>(
    `SELECT vp.id, vv.valeur_serveur_id FROM variante_produit vp
      LEFT JOIN variante_valeur vv ON vv.variante_id=vp.id WHERE vp.produit_id=? ORDER BY vp.id`, produitId);
  const valeurs = new Map<number, number[]>();
  for (const ligne of lignes) {
    const ids = valeurs.get(ligne.id) ?? [];
    if (ligne.valeur_serveur_id !== null) ids.push(ligne.valeur_serveur_id);
    valeurs.set(ligne.id, ids);
  }
  return new Map([...valeurs].map(([id, ids]) => [signatureCombinaison(ids), id]));
}
async function ajouterCombinaisons(
  db: Transaction, produitId: number, nom: string, matrice: CombinaisonModele[], date: string,
): Promise<number> {
  const existantes = await lireSignatures(db, produitId);
  let creees = 0;
  for (const combinaison of matrice) {
    // Une variante inactive reste inactive : la génération n'est pas une réactivation.
    if (existantes.has(combinaison.signature)) continue;
    const id = genererIdLocal();
    const prefixe = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'MODELE';
    // Garder les 128 bits d'identité : deux téléphones peuvent partager le même ID numérique local.
    const sku = `${prefixe}-${id.toUpperCase()}`;
    const r = await db.runAsync(`INSERT INTO variante_produit
      (id_local,produit_id,sku,code_barre,prix_override,prix_achat,stock_actuel,actif,date_creation,date_modification)
      VALUES (?,?,?,NULL,NULL,NULL,0,1,?,?)`, id, produitId, sku, date, date);
    for (const v of combinaison.valeurs) {
      await db.runAsync(`INSERT INTO variante_valeur
        (variante_id,valeur_serveur_id,dimension_id,dimension_code,dimension_nom,dimension_ordre,
         valeur_code,valeur_nom,code_hex,valeur_ordre) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      r.lastInsertRowId, v.valeurServeurId, v.dimensionId, v.dimensionCode, v.dimensionNom,
      v.dimensionOrdre, v.code, v.nom, v.codeHex, v.ordre);
    }
    await mettreEnFile(db, 'variante', id, date);
    existantes.set(combinaison.signature, r.lastInsertRowId);
    creees++;
  }
  return creees;
}

function verifierSaisie(s: SaisieModeleHabillement): void {
  if (!s.nom.trim() || s.nom.trim().length > 200 || !s.categorie.trim() || s.categorie.trim().length > 80) {
    throw new Error('Indiquez un nom (200 caractères maximum) et une catégorie (80 caractères maximum).');
  }
  for (const prix of [s.prixUnitaire, s.prixAchat]) {
    if (!Number.isFinite(prix) || prix < 0 || prix > 9999999999.99) throw new Error('Les prix doivent être positifs ou nuls et valides.');
  }
  if (!Number.isFinite(s.stockMin) || s.stockMin < 0 || s.stockMin > 99999999999) throw new Error('Le seuil de stock est invalide.');
  if ((s.codeBarre ?? '').trim().length > 100) throw new Error('Le code-barres est trop long.');
  if (!s.id && !/^[0-9a-f]{32}$/i.test(s.idLocal)) throw new Error('L’identité locale du modèle est invalide.');
}

export async function enregistrerModeleHabillement(
  saisie: SaisieModeleHabillement, utilisateurId: number,
): Promise<ModelePourEdition & { variantesCreees: number }> {
  await verifierProfil();
  verifierSaisie(saisie);
  const db = await obtenirBase();
  let resultat: (ModelePourEdition & { variantesCreees: number }) | undefined;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await verifierResponsable(tx, utilisateurId);
    const matrice = !saisie.id || saisie.valeursIds.length || saisie.articleUnique
      ? preparerMatrice(await lireReferentiel(tx), saisie.valeursIds, saisie.articleUnique) : [];
    const existant = saisie.id
      ? await tx.getFirstAsync<LigneModele>(`SELECT ${COLONNES} FROM produit WHERE id=?`, saisie.id)
      : await tx.getFirstAsync<LigneModele>(`SELECT ${COLONNES} FROM produit WHERE id_local=?`, saisie.idLocal);
    if (saisie.id && (!existant || existant.id_local !== saisie.idLocal)) throw new Error('Le modèle est introuvable.');
    if (saisie.id && existant?.date_modification !== (saisie.dateModification ?? null)) {
      throw new Error('Ce modèle a été modifié. Rechargez la fiche avant de réessayer.');
    }
    const nom = saisie.nom.trim(); const categorie = saisie.categorie.trim();
    const code = saisie.codeBarre?.trim() || null;
    if (existant && !saisie.id) {
      const signatures = await lireSignatures(tx, existant.id);
      const memeFiche = existant.nom === nom && existant.categorie === categorie && existant.code_barre === code
        && existant.prix_unitaire === saisie.prixUnitaire && existant.prix_achat === saisie.prixAchat
        && existant.stock_min === saisie.stockMin && existant.chemin_image === saisie.cheminImage;
      if (!memeFiche || signatures.size !== matrice.length || matrice.some((c) => !signatures.has(c.signature))) {
        throw new Error('Cette demande a déjà créé un modèle différent. Ouvrez sa fiche pour le modifier.');
      }
      resultat = { ...convertir(existant), variantesCreees: 0 };
      return;
    }
    const precedent = existant?.date_modification ? Date.parse(existant.date_modification) : 0;
    const date = new Date(Math.max(Date.now(), Number.isFinite(precedent) ? precedent + 1 : 0)).toISOString();
    let id: number;
    if (existant) {
      id = existant.id;
      // Ne jamais modifier stock, unité, activation, sous-unités ou variantes lors de l'édition de la fiche.
      await tx.runAsync(`UPDATE produit SET nom=?,categorie=?,prix_unitaire=?,prix_achat=?,code_barre=?,
        stock_min=?,chemin_image=?,date_modification=? WHERE id=?`,
      nom, categorie, saisie.prixUnitaire, saisie.prixAchat, code, saisie.stockMin, saisie.cheminImage, date, id);
    } else {
      const r = await tx.runAsync(`INSERT INTO produit
        (id_local,nom,categorie,code_barre,prix_unitaire,prix_achat,unite_base,quantite_base,stock_min,
         gestion_stock,chemin_image,actif,date_creation,date_modification)
        VALUES (?,?,?,?,?,?,'Unite',0,?,1,?,1,?,?)`,
      saisie.idLocal, nom, categorie, code, saisie.prixUnitaire, saisie.prixAchat, saisie.stockMin,
      saisie.cheminImage, date, date);
      id = r.lastInsertRowId;
    }
    await mettreEnFile(tx, 'produit', saisie.idLocal, date);
    const variantesCreees = await ajouterCombinaisons(tx, id, nom, matrice, date);
    const p = await tx.getFirstAsync<LigneModele>(`SELECT ${COLONNES} FROM produit WHERE id=?`, id);
    if (!p) throw new Error('La sauvegarde du modèle a échoué.');
    resultat = { ...convertir(p), variantesCreees };
  });
  if (!resultat) throw new Error('La sauvegarde du modèle a échoué.');
  return resultat;
}

export async function ajouterVariantesHabillement(
  produitId: number, valeursIds: number[], utilisateurId: number, articleUnique = false,
): Promise<number> {
  await verifierProfil();
  const db = await obtenirBase();
  let nombre = 0;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await verifierResponsable(tx, utilisateurId);
    const p = await tx.getFirstAsync<{ nom: string }>('SELECT nom FROM produit WHERE id=? AND actif=1', produitId);
    if (!p) throw new Error('Modèle introuvable ou désactivé.');
    const matrice = preparerMatrice(await lireReferentiel(tx), valeursIds, articleUnique);
    nombre = await ajouterCombinaisons(tx, produitId, p.nom, matrice, new Date().toISOString());
  });
  return nombre;
}

export async function changerEtatVarianteHabillement(
  varianteId: number, actif: boolean, utilisateurId: number,
): Promise<void> {
  await verifierProfil();
  if (!Number.isSafeInteger(varianteId) || varianteId <= 0 || typeof actif !== 'boolean') {
    throw new Error('Variante ou état invalide.');
  }
  const db = await obtenirBase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await verifierResponsable(tx, utilisateurId);
    const variante = await tx.getFirstAsync<{ id_local: string }>(
      'SELECT id_local FROM variante_produit WHERE id=?', varianteId);
    if (!variante) throw new Error('Variante introuvable.');
    const date = new Date().toISOString();
    await tx.runAsync('UPDATE variante_produit SET actif=?, date_modification=? WHERE id=?', actif ? 1 : 0, date, varianteId);
    await mettreEnFile(tx, 'variante', variante.id_local, date);
  });
}
