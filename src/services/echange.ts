import {
  dansTransaction,
  executer,
  genererIdLocal,
  lirePremier,
  lireTout,
  maintenant,
} from '../db/repositories/base';
import {
  libelleVariante,
  listerVariantesProduit,
  type VarianteMobile,
} from '../db/repositories/variante';
import { exigerEcriture } from './abonnement';
import { marquerChangement } from './synchronisation';

export interface LigneEchangeable {
  ligneId: number;
  ligneServeurId: number;
  venteId: number;
  venteIdLocal: string;
  numeroVente: string;
  dateVente: string;
  produitId: number;
  produitNom: string;
  varianteId: number;
  varianteIdLocal: string;
  varianteNom: string;
  quantite: number;
  facteur: number;
  unite: string;
  prixUnitaire: number;
  coutUnitaire: number;
  total: number;
}

export interface EchangeLocalResultat {
  idLocal: string;
  differencePrix: number;
  nouveauTotalVente: number;
}

async function nomVariante(varianteId: number): Promise<string> {
  const valeurs = await lireTout<{ valeur_nom: string }>(
    `SELECT valeur_nom
       FROM variante_valeur
      WHERE variante_id = ?
      ORDER BY dimension_ordre, valeur_ordre, valeur_nom`,
    varianteId,
  );
  return valeurs.map((v) => v.valeur_nom).join(' / ');
}

export async function listerLignesEchangeables(
  limite = 100,
): Promise<LigneEchangeable[]> {
  const lignes = await lireTout<{
    ligne_id: number;
    ligne_serveur_id: number | null;
    vente_id: number;
    vente_id_local: string;
    numero_vente: string;
    date_vente: string;
    produit_id: number;
    produit_nom: string;
    variante_id: number | null;
    variante_id_local: string | null;
    quantite: number;
    facteur: number;
    unite: string;
    prix_unitaire: number;
    cout_unitaire: number;
    total: number;
  }>(
    `SELECT lv.id AS ligne_id,
            lv.ligne_serveur_id,
            v.id AS vente_id,
            v.id_local AS vente_id_local,
            v.numero AS numero_vente,
            v.date_vente,
            p.id AS produit_id,
            p.nom AS produit_nom,
            lv.variante_id,
            vp.id_local AS variante_id_local,
            lv.quantite,
            lv.facteur,
            lv.unite,
            lv.prix_unitaire,
            lv.cout_unitaire,
            lv.total
       FROM ligne_vente lv
       JOIN vente v ON v.id = lv.vente_id
       JOIN produit p ON p.id = lv.produit_id
       JOIN variante_produit vp ON vp.id = lv.variante_id
      WHERE v.statut <> 'annulee'
        AND lv.variante_id IS NOT NULL
        AND lv.ligne_serveur_id IS NOT NULL
      ORDER BY v.date_vente DESC, lv.id DESC
      LIMIT ?`,
    limite,
  );

  const resultat: LigneEchangeable[] = [];
  for (const ligne of lignes) {
    if (!ligne.variante_id || !ligne.variante_id_local || !ligne.ligne_serveur_id) continue;
    resultat.push({
      ligneId: ligne.ligne_id,
      ligneServeurId: ligne.ligne_serveur_id,
      venteId: ligne.vente_id,
      venteIdLocal: ligne.vente_id_local,
      numeroVente: ligne.numero_vente,
      dateVente: ligne.date_vente,
      produitId: ligne.produit_id,
      produitNom: ligne.produit_nom,
      varianteId: ligne.variante_id,
      varianteIdLocal: ligne.variante_id_local,
      varianteNom: await nomVariante(ligne.variante_id),
      quantite: ligne.quantite,
      facteur: ligne.facteur,
      unite: ligne.unite,
      prixUnitaire: ligne.prix_unitaire,
      coutUnitaire: ligne.cout_unitaire,
      total: ligne.total,
    });
  }
  return resultat;
}

export async function variantesDeRemplacement(
  ligne: LigneEchangeable,
): Promise<VarianteMobile[]> {
  const variantes = await listerVariantesProduit(ligne.produitId);
  return variantes.filter(
    (v) => v.id !== ligne.varianteId && v.actif && v.stockActuel > 0,
  );
}

export async function echangerVarianteLocal(
  ligne: LigneEchangeable,
  nouvelle: VarianteMobile,
  quantite = 1,
  note = '',
): Promise<EchangeLocalResultat> {
  await exigerEcriture();

  if (!Number.isFinite(quantite) || quantite <= 0) {
    throw new Error('La quantité échangée doit être positive.');
  }
  if (quantite > ligne.quantite) {
    throw new Error(
      `La ligne vendue ne contient que ${ligne.quantite} ${ligne.unite}.`,
    );
  }
  if (nouvelle.produitId !== ligne.produitId) {
    throw new Error('La variante de remplacement doit appartenir au même modèle.');
  }
  if (nouvelle.id === ligne.varianteId) {
    throw new Error('Choisissez une variante différente.');
  }

  return dansTransaction(async () => {
    const ancienne = await lirePremier<{
      stock_actuel: number;
      prix_achat: number | null;
    }>(
      'SELECT stock_actuel, prix_achat FROM variante_produit WHERE id = ? AND actif = 1',
      ligne.varianteId,
    );
    const nouvelleActuelle = await lirePremier<{
      stock_actuel: number;
      prix_override: number | null;
      prix_achat: number | null;
    }>(
      'SELECT stock_actuel, prix_override, prix_achat FROM variante_produit WHERE id = ? AND actif = 1',
      nouvelle.id,
    );
    if (!ancienne || !nouvelleActuelle) {
      throw new Error('Une des variantes est introuvable.');
    }

    const quantiteBase = quantite * ligne.facteur;
    if (nouvelleActuelle.stock_actuel < quantiteBase) {
      throw new Error(
        `Stock insuffisant pour ${libelleVariante(nouvelle)} : ` +
          `${nouvelleActuelle.stock_actuel} disponible(s).`,
      );
    }

    const produit = await lirePremier<{
      prix_unitaire: number;
      prix_achat: number;
    }>(
      'SELECT prix_unitaire, prix_achat FROM produit WHERE id = ?',
      ligne.produitId,
    );
    if (!produit) throw new Error('Modèle introuvable.');

    const prixNouveau = Math.round(
      nouvelleActuelle.prix_override ?? produit.prix_unitaire,
    );
    const coutNouveau = Math.round(
      nouvelleActuelle.prix_achat ?? produit.prix_achat,
    );
    const prixAncien = Math.round(ligne.prixUnitaire);
    const differencePrix = Math.round((prixNouveau - prixAncien) * quantite);
    const horodatage = maintenant();

    await executer(
      'UPDATE variante_produit SET stock_actuel = stock_actuel + ?, date_modification = ? WHERE id = ?',
      quantiteBase,
      horodatage,
      ligne.varianteId,
    );
    await executer(
      'UPDATE variante_produit SET stock_actuel = stock_actuel - ?, date_modification = ? WHERE id = ?',
      quantiteBase,
      horodatage,
      nouvelle.id,
    );

    if (Math.abs(quantite - ligne.quantite) < 0.0001) {
      const nouveauLibelle = `${ligne.produitNom} - ${libelleVariante(nouvelle)}`;
      const nouveauTotal = Math.round(prixNouveau * quantite);
      const nouveauBenefice = Math.round((prixNouveau - coutNouveau) * quantite);
      await executer(
        `UPDATE ligne_vente
            SET variante_id = ?, libelle = ?, prix_unitaire = ?,
                cout_unitaire = ?, total = ?, benefice_total = ?
          WHERE id = ?`,
        nouvelle.id,
        nouveauLibelle,
        prixNouveau,
        coutNouveau,
        nouveauTotal,
        nouveauBenefice,
        ligne.ligneId,
      );
    } else {
      const quantiteRestante = ligne.quantite - quantite;
      const baseRestante = quantiteRestante * ligne.facteur;
      await executer(
        `UPDATE ligne_vente
            SET quantite = ?, quantite_base = ?, total = ?,
                benefice_total = ?
          WHERE id = ?`,
        quantiteRestante,
        baseRestante,
        Math.round(prixAncien * quantiteRestante),
        Math.round((prixAncien - ligne.coutUnitaire) * quantiteRestante),
        ligne.ligneId,
      );
      await executer(
        `INSERT INTO ligne_vente
         (vente_id, produit_id, variante_id, ligne_serveur_id, libelle, unite,
          facteur, quantite, quantite_base, prix_unitaire, cout_unitaire,
          total, benefice_total)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ligne.venteId,
        ligne.produitId,
        nouvelle.id,
        `${ligne.produitNom} - ${libelleVariante(nouvelle)}`,
        ligne.unite,
        ligne.facteur,
        quantite,
        quantiteBase,
        prixNouveau,
        coutNouveau,
        Math.round(prixNouveau * quantite),
        Math.round((prixNouveau - coutNouveau) * quantite),
      );
    }

    const venteAvant = await lirePremier<{ total: number; montant_paye: number }>(
      'SELECT total, montant_paye FROM vente WHERE id = ?',
      ligne.venteId,
    );
    const nouveauTotal = Math.max(0, (venteAvant?.total ?? 0) + differencePrix);
    const montantPaye = venteAvant?.montant_paye ?? 0;
    const statut = montantPaye >= nouveauTotal
      ? 'payee'
      : montantPaye > 0
        ? 'partielle'
        : 'impayee';
    await executer(
      'UPDATE vente SET total = ?, statut = ? WHERE id = ?',
      nouveauTotal,
      statut,
      ligne.venteId,
    );
    const vente = { total: nouveauTotal };

    const idLocal = genererIdLocal();
    await executer(
      `INSERT INTO echange_variante
       (id_local, vente_id, ligne_vente_id, ligne_serveur_id,
        ancienne_variante_id, nouvelle_variante_id, quantite,
        prix_ancien, prix_nouveau, difference_prix, note, date_echange)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      idLocal,
      ligne.venteId,
      ligne.ligneId,
      ligne.ligneServeurId,
      ligne.varianteId,
      nouvelle.id,
      quantite,
      prixAncien,
      prixNouveau,
      differencePrix,
      note.trim() || null,
      horodatage,
    );
    await marquerChangement('echange', idLocal);

    return {
      idLocal,
      differencePrix,
      nouveauTotalVente: vente?.total ?? 0,
    };
  });
}
