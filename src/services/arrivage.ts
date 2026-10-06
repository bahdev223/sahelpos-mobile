import {
  dansTransaction,
  executer,
  genererIdLocal,
  lirePremier,
  lireTout,
  maintenant,
} from '../db/repositories/base';
import { etatCourant, exigerEcriture } from './abonnement';
import { marquerChangement } from './synchronisation';

export type StatutArrivage =
  | 'BROUILLON'
  | 'EN_TRANSIT'
  | 'EN_COURS_RECEPTION'
  | 'RECEPTIONNE'
  | 'ANNULE';

export type TypeFraisArrivage =
  | 'FRET'
  | 'DOUANE'
  | 'TRANSPORT_LOCAL'
  | 'COMMISSION'
  | 'ASSURANCE'
  | 'TRANSIT'
  | 'AUTRE';

export type ModeRepartitionFrais = 'VALEUR' | 'QUANTITE' | 'POIDS' | 'VOLUME';

export interface SaisieLigneArrivage {
  produitId: number;
  varianteId?: number | null;
  ligneAchatServeurId?: number | null;
  quantitePrevue: number;
  prixAchatUnitaire: number;
  poidsUnitaireKg?: number;
  volumeUnitaireM3?: number;
}

export interface SaisieFraisArrivage {
  typeFrais: TypeFraisArrivage;
  libelle?: string;
  montant: number;
  modeRepartition?: ModeRepartitionFrais;
  dateFrais?: string;
}

export interface SaisieArrivage {
  titre: string;
  transporteur?: string;
  trackingNumber?: string;
  dateExpedition?: string | null;
  dateReceptionEstimee?: string | null;
  notes?: string;
  achatIds?: number[];
  lignes?: SaisieLigneArrivage[];
  frais?: SaisieFraisArrivage[];
}

export interface LigneArrivageLocale {
  id: number;
  idLocal: string;
  serveurId: number | null;
  produitId: number;
  produitNom: string;
  varianteId: number | null;
  varianteNom: string;
  varianteSku: string;
  ligneAchatServeurId: number | null;
  comptee: boolean;
  quantitePrevue: number;
  quantiteRecue: number;
  quantiteRejetee: number;
  motifEcart: string;
  prixAchatUnitaire: number;
  poidsUnitaireKg: number;
  volumeUnitaireM3: number;
  fraisApprocheAlloues: number;
  coutRevientUnitaire: number;
  lotServeurId: number | null;
  numeroLot: string;
  datePeremption: string | null;
}

export interface FraisArrivageLocal {
  id: number;
  idLocal: string;
  serveurId: number | null;
  typeFrais: TypeFraisArrivage;
  libelle: string;
  montant: number;
  modeRepartition: ModeRepartitionFrais;
  dateFrais: string;
}

export interface ArrivageLocal {
  id: number;
  idLocal: string;
  serveurId: number | null;
  numero: string;
  titre: string;
  statut: StatutArrivage;
  transporteur: string;
  trackingNumber: string;
  dateCreation: string;
  dateExpedition: string | null;
  dateReceptionEstimee: string | null;
  dateReceptionReelle: string | null;
  notes: string;
  lignes: LigneArrivageLocale[];
  frais: FraisArrivageLocal[];
  achatIds: number[];
  totalPiecesPrevues: number;
  totalPiecesRecues: number;
  totalPiecesRejetees: number;
  totalFrais: number;
  coutTotalRendu: number;
}

export interface ComptageArrivage {
  ligneId: number;
  quantiteRecue: number;
  quantiteRejetee?: number;
  motifEcart?: string;
  numeroLot?: string;
  datePeremption?: string | null;
}

async function exigerArrivages(): Promise<void> {
  await exigerEcriture('achats');
  const etat = await etatCourant();
  const caps = etat.droit?.commerce?.capabilities_effectives ?? [];
  if (!caps.includes('ARRIVAL_MANAGEMENT') && !caps.includes('ARRIVALS')) {
    throw new Error("La gestion des arrivages n’est pas activée dans votre offre.");
  }
}

function arrondir2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function verifierNombre(v: number, libelle: string, autoriserZero = true): void {
  if (!Number.isFinite(v) || v < 0 || (!autoriserZero && v <= 0)) {
    throw new Error(`${libelle} invalide.`);
  }
}

async function numeroArrivageLocal(): Promise<string> {
  const date = new Date();
  const deux = (n: number) => String(n).padStart(2, '0');
  const prefixe = `ARR-${date.getFullYear()}${deux(date.getMonth() + 1)}${deux(date.getDate())}-`;
  const ligne = await lirePremier<{ n: number }>(
    'SELECT COUNT(*) AS n FROM arrivage WHERE numero LIKE ?',
    `${prefixe}%`,
  );
  return `${prefixe}${String((ligne?.n ?? 0) + 1).padStart(3, '0')}`;
}

async function verifierProduitVariante(
  produitId: number,
  varianteId?: number | null,
): Promise<{ produitNom: string; varianteSku: string; varianteNom: string }> {
  const produit = await lirePremier<{ nom: string }>(
    'SELECT nom FROM produit WHERE id = ? AND actif = 1',
    produitId,
  );
  if (!produit) throw new Error('Produit introuvable.');
  if (!varianteId) {
    const nb = await lirePremier<{ n: number }>(
      'SELECT COUNT(*) AS n FROM variante_produit WHERE produit_id = ? AND actif = 1',
      produitId,
    );
    if ((nb?.n ?? 0) > 0) {
      throw new Error('Choisissez la taille/couleur attendue pour ce modèle.');
    }
    return { produitNom: produit.nom, varianteSku: '', varianteNom: '' };
  }
  const variante = await lirePremier<{ sku: string }>(
    'SELECT sku FROM variante_produit WHERE id = ? AND produit_id = ? AND actif = 1',
    varianteId,
    produitId,
  );
  if (!variante) throw new Error('Variante introuvable.');
  const valeurs = await lireTout<{ valeur_nom: string }>(
    'SELECT valeur_nom FROM variante_valeur WHERE variante_id = ? ORDER BY dimension_ordre, valeur_ordre',
    varianteId,
  );
  return {
    produitNom: produit.nom,
    varianteSku: variante.sku,
    varianteNom: valeurs.map(v => v.valeur_nom).join(' / ') || variante.sku,
  };
}

async function insererLigne(
  arrivageId: number,
  saisie: SaisieLigneArrivage,
): Promise<number> {
  verifierNombre(saisie.quantitePrevue, 'Quantité prévue', false);
  verifierNombre(saisie.prixAchatUnitaire, "Prix d'achat");
  verifierNombre(saisie.poidsUnitaireKg ?? 0, 'Poids');
  verifierNombre(saisie.volumeUnitaireM3 ?? 0, 'Volume');
  const refs = await verifierProduitVariante(saisie.produitId, saisie.varianteId);
  const idLocal = genererIdLocal();
  const date = maintenant();
  const r = await executer(
    `INSERT INTO ligne_arrivage
     (id_local, arrivage_id, produit_id, variante_id, ligne_achat_serveur_id,
      comptee, quantite_prevue, quantite_recue, quantite_rejetee, motif_ecart,
      prix_achat_unitaire, poids_unitaire_kg, volume_unitaire_m3,
      frais_approche_alloues, cout_revient_unitaire, numero_lot,
      produit_nom_snapshot, variante_sku_snapshot, variante_nom_snapshot,
      date_modification)
     VALUES (?, ?, ?, ?, ?, 0, ?, 0, 0, '', ?, ?, ?, 0, ?, '', ?, ?, ?, ?)`,
    idLocal,
    arrivageId,
    saisie.produitId,
    saisie.varianteId ?? null,
    saisie.ligneAchatServeurId ?? null,
    saisie.quantitePrevue,
    arrondir2(saisie.prixAchatUnitaire),
    saisie.poidsUnitaireKg ?? 0,
    saisie.volumeUnitaireM3 ?? 0,
    arrondir2(saisie.prixAchatUnitaire),
    refs.produitNom,
    refs.varianteSku,
    refs.varianteNom,
    date,
  );
  return r.lastInsertRowId;
}

async function insererFrais(
  arrivageId: number,
  saisie: SaisieFraisArrivage,
): Promise<number> {
  verifierNombre(saisie.montant, 'Montant du frais');
  const idLocal = genererIdLocal();
  const r = await executer(
    `INSERT INTO frais_arrivage
     (id_local, arrivage_id, type_frais, libelle, montant, mode_repartition,
      date_frais, date_modification)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    idLocal,
    arrivageId,
    saisie.typeFrais,
    saisie.libelle?.trim() ?? '',
    arrondir2(saisie.montant),
    saisie.modeRepartition ?? 'VALEUR',
    saisie.dateFrais ?? new Date().toISOString().slice(0, 10),
    maintenant(),
  );
  return r.lastInsertRowId;
}

export async function creerArrivage(saisie: SaisieArrivage): Promise<number> {
  await exigerArrivages();
  const titre = saisie.titre.trim();
  if (!titre) throw new Error("Le titre de l'arrivage est obligatoire.");
  let id = 0;
  await dansTransaction(async () => {
    const idLocal = genererIdLocal();
    const date = maintenant();
    const r = await executer(
      `INSERT INTO arrivage
       (id_local, numero, titre, statut, transporteur, tracking_number,
        date_creation, date_expedition, date_reception_estimee, notes,
        date_modification)
       VALUES (?, ?, ?, 'BROUILLON', ?, ?, ?, ?, ?, ?, ?)`,
      idLocal,
      await numeroArrivageLocal(),
      titre,
      saisie.transporteur?.trim() ?? '',
      saisie.trackingNumber?.trim() ?? '',
      date,
      saisie.dateExpedition ?? null,
      saisie.dateReceptionEstimee ?? null,
      saisie.notes?.trim() ?? '',
      date,
    );
    id = r.lastInsertRowId;

    for (const ligne of saisie.lignes ?? []) await insererLigne(id, ligne);
    for (const frais of saisie.frais ?? []) await insererFrais(id, frais);
    for (const achatId of saisie.achatIds ?? []) {
      await executer(
        'INSERT OR IGNORE INTO arrivage_achat (arrivage_id, achat_id) VALUES (?, ?)',
        id,
        achatId,
      );
    }
    await marquerChangement('arrivage', idLocal);
  });
  return id;
}

export async function rattacherAchatArrivage(
  arrivageId: number,
  achatId: number,
): Promise<void> {
  await exigerArrivages();
  const arrivage = await lirePremier<{ id_local: string; statut: StatutArrivage }>(
    'SELECT id_local, statut FROM arrivage WHERE id = ?',
    arrivageId,
  );
  if (!arrivage) throw new Error('Arrivage introuvable.');
  if (arrivage.statut !== 'BROUILLON') {
    throw new Error('Un bon fournisseur ne peut être rattaché qu’au brouillon.');
  }
  const achat = await lirePremier<{ serveur_id: number | null; statut: string }>(
    'SELECT serveur_id, statut FROM achat WHERE id = ?',
    achatId,
  );
  if (!achat) throw new Error('Achat introuvable.');
  if (achat.statut !== 'BROUILLON') throw new Error('Seul un achat non reçu peut être rattaché.');
  if (!achat.serveur_id) {
    throw new Error('Synchronisez d’abord ce bon fournisseur pour pouvoir le rattacher à un arrivage.');
  }

  await dansTransaction(async () => {
    await executer(
      'INSERT OR IGNORE INTO arrivage_achat (arrivage_id, achat_id) VALUES (?, ?)',
      arrivageId, achatId,
    );
    const lignes = await lireTout<{
      serveur_id: number | null; produit_id: number; variante_id: number | null;
      facteur: number; quantite: number; quantite_base: number; prix_unitaire: number;
    }>(
      `SELECT serveur_id, produit_id, variante_id, facteur, quantite,
              quantite_base, prix_unitaire
         FROM ligne_achat
        WHERE achat_id = ?
        ORDER BY id`,
      achatId,
    );
    for (const ligne of lignes) {
      const existe = ligne.serveur_id
        ? await lirePremier<{ id: number }>(
            'SELECT id FROM ligne_arrivage WHERE arrivage_id = ? AND ligne_achat_serveur_id = ?',
            arrivageId, ligne.serveur_id,
          )
        : null;
      if (existe) continue;
      await insererLigne(arrivageId, {
        produitId: ligne.produit_id,
        varianteId: ligne.variante_id,
        ligneAchatServeurId: ligne.serveur_id,
        quantitePrevue: ligne.quantite_base,
        prixAchatUnitaire: ligne.facteur > 0
          ? ligne.prix_unitaire / ligne.facteur
          : ligne.prix_unitaire,
      });
    }
    await executer('UPDATE arrivage SET date_modification = ? WHERE id = ?', maintenant(), arrivageId);
    await marquerChangement('arrivage', arrivage.id_local);
  });
}

export async function supprimerLigneArrivage(arrivageId: number, ligneId: number): Promise<void> {
  await exigerArrivages();
  const arrivage = await lirePremier<{ id_local: string; statut: StatutArrivage }>(
    'SELECT id_local, statut FROM arrivage WHERE id = ?',
    arrivageId,
  );
  if (!arrivage) throw new Error('Arrivage introuvable.');
  if (arrivage.statut !== 'BROUILLON') throw new Error('Cette ligne est déjà scellée.');
  await dansTransaction(async () => {
    await executer('DELETE FROM ligne_arrivage WHERE id = ? AND arrivage_id = ?', ligneId, arrivageId);
    await executer('UPDATE arrivage SET date_modification = ? WHERE id = ?', maintenant(), arrivageId);
    await marquerChangement('arrivage', arrivage.id_local);
  });
}

export async function supprimerFraisArrivage(arrivageId: number, fraisId: number): Promise<void> {
  await exigerArrivages();
  const arrivage = await lirePremier<{ id_local: string; statut: StatutArrivage }>(
    'SELECT id_local, statut FROM arrivage WHERE id = ?',
    arrivageId,
  );
  if (!arrivage) throw new Error('Arrivage introuvable.');
  if (arrivage.statut === 'RECEPTIONNE' || arrivage.statut === 'ANNULE') {
    throw new Error('Ce frais ne peut plus être retiré.');
  }
  await dansTransaction(async () => {
    await executer('DELETE FROM frais_arrivage WHERE id = ? AND arrivage_id = ?', fraisId, arrivageId);
    await repartirFraisLocal(arrivageId, false);
    await executer('UPDATE arrivage SET date_modification = ? WHERE id = ?', maintenant(), arrivageId);
    await marquerChangement('arrivage', arrivage.id_local);
  });
}

export async function ajouterLigneArrivage(
  arrivageId: number,
  saisie: SaisieLigneArrivage,
): Promise<void> {
  await exigerArrivages();
  const arrivage = await lirePremier<{ id_local: string; statut: string }>(
    'SELECT id_local, statut FROM arrivage WHERE id = ?',
    arrivageId,
  );
  if (!arrivage) throw new Error('Arrivage introuvable.');
  if (arrivage.statut !== 'BROUILLON') {
    throw new Error('Les lignes ne sont modifiables que tant que l’arrivage est en brouillon.');
  }
  await dansTransaction(async () => {
    await insererLigne(arrivageId, saisie);
    await executer('UPDATE arrivage SET date_modification = ? WHERE id = ?', maintenant(), arrivageId);
    await marquerChangement('arrivage', arrivage.id_local);
  });
}

export async function ajouterFraisArrivage(
  arrivageId: number,
  saisie: SaisieFraisArrivage,
): Promise<void> {
  await exigerArrivages();
  const arrivage = await lirePremier<{ id_local: string; statut: StatutArrivage }>(
    'SELECT id_local, statut FROM arrivage WHERE id = ?',
    arrivageId,
  );
  if (!arrivage) throw new Error('Arrivage introuvable.');
  if (arrivage.statut === 'ANNULE' || arrivage.statut === 'RECEPTIONNE') {
    throw new Error('Cet arrivage ne peut plus recevoir de frais.');
  }
  await dansTransaction(async () => {
    await insererFrais(arrivageId, saisie);
    await repartirFraisLocal(arrivageId, false);
    await executer('UPDATE arrivage SET date_modification = ? WHERE id = ?', maintenant(), arrivageId);
    await marquerChangement('arrivage', arrivage.id_local);
  });
}

export async function passerArrivageEnTransit(arrivageId: number): Promise<void> {
  await exigerArrivages();
  const arrivage = await lirePremier<{ id_local: string; statut: StatutArrivage }>(
    'SELECT id_local, statut FROM arrivage WHERE id = ?',
    arrivageId,
  );
  if (!arrivage) throw new Error('Arrivage introuvable.');
  if (arrivage.statut !== 'BROUILLON') throw new Error('Seul un brouillon peut passer en transit.');
  const count = await lirePremier<{ n: number }>(
    'SELECT COUNT(*) AS n FROM ligne_arrivage WHERE arrivage_id = ? AND supprime_le IS NULL',
    arrivageId,
  );
  if ((count?.n ?? 0) === 0) throw new Error('Ajoutez au moins une ligne avant le transit.');
  await dansTransaction(async () => {
    const date = maintenant();
    await executer(
      `UPDATE arrivage
          SET statut = 'EN_TRANSIT',
              date_expedition = COALESCE(date_expedition, ?),
              date_modification = ?
        WHERE id = ?`,
      date.slice(0, 10), date, arrivageId,
    );
    await marquerChangement('arrivage', arrivage.id_local);
  });
}

export async function demarrerReceptionArrivage(arrivageId: number): Promise<void> {
  await exigerArrivages();
  const arrivage = await lirePremier<{ id_local: string; statut: StatutArrivage }>(
    'SELECT id_local, statut FROM arrivage WHERE id = ?',
    arrivageId,
  );
  if (!arrivage) throw new Error('Arrivage introuvable.');
  if (arrivage.statut !== 'EN_TRANSIT') throw new Error('Seul un arrivage en transit peut être réceptionné.');
  await dansTransaction(async () => {
    await executer(
      "UPDATE arrivage SET statut = 'EN_COURS_RECEPTION', date_modification = ? WHERE id = ?",
      maintenant(), arrivageId,
    );
    await marquerChangement('arrivage', arrivage.id_local);
  });
}

export async function enregistrerComptageArrivage(
  arrivageId: number,
  comptages: ComptageArrivage[],
): Promise<void> {
  await exigerArrivages();
  const arrivage = await lirePremier<{ id_local: string; statut: StatutArrivage }>(
    'SELECT id_local, statut FROM arrivage WHERE id = ?',
    arrivageId,
  );
  if (!arrivage) throw new Error('Arrivage introuvable.');
  if (!['EN_TRANSIT', 'EN_COURS_RECEPTION'].includes(arrivage.statut)) {
    throw new Error('Cet arrivage n’est pas en cours de réception.');
  }
  await dansTransaction(async () => {
    for (const item of comptages) {
      verifierNombre(item.quantiteRecue, 'Quantité reçue');
      verifierNombre(item.quantiteRejetee ?? 0, 'Quantité rejetée');
      const ligne = await lirePremier<{ id: number }>(
        'SELECT id FROM ligne_arrivage WHERE id = ? AND arrivage_id = ?',
        item.ligneId, arrivageId,
      );
      if (!ligne) throw new Error('Une ligne de comptage est introuvable.');
      await executer(
        `UPDATE ligne_arrivage
            SET comptee = 1, quantite_recue = ?, quantite_rejetee = ?,
                motif_ecart = ?, numero_lot = ?, date_peremption = ?,
                date_modification = ?
          WHERE id = ?`,
        item.quantiteRecue,
        item.quantiteRejetee ?? 0,
        item.motifEcart?.trim() ?? '',
        item.numeroLot?.trim() ?? '',
        item.datePeremption ?? null,
        maintenant(),
        item.ligneId,
      );
    }
    await executer(
      "UPDATE arrivage SET statut = 'EN_COURS_RECEPTION', date_modification = ? WHERE id = ?",
      maintenant(), arrivageId,
    );
    await repartirFraisLocal(arrivageId, false);
    await marquerChangement('arrivage', arrivage.id_local);
  });
}

async function repartirFraisLocal(arrivageId: number, receptionne: boolean): Promise<void> {
  const lignes = await lireTout<{
    id: number; produit_id: number; variante_id: number | null;
    quantite_prevue: number; quantite_recue: number; prix_achat_unitaire: number;
    poids_unitaire_kg: number; volume_unitaire_m3: number;
  }>(
    `SELECT id, produit_id, variante_id, quantite_prevue, quantite_recue,
            prix_achat_unitaire, poids_unitaire_kg, volume_unitaire_m3
       FROM ligne_arrivage
      WHERE arrivage_id = ? AND supprime_le IS NULL
        ${receptionne ? 'AND quantite_recue > 0' : ''}`,
    arrivageId,
  );
  if (lignes.length === 0) return;
  const frais = await lireTout<{ montant: number; mode_repartition: ModeRepartitionFrais }>(
    'SELECT montant, mode_repartition FROM frais_arrivage WHERE arrivage_id = ? AND supprime_le IS NULL',
    arrivageId,
  );

  const alloues = new Map<number, number>(lignes.map(l => [l.id, 0]));
  const qte = (l: typeof lignes[number]) =>
    receptionne ? l.quantite_recue : (l.quantite_recue > 0 ? l.quantite_recue : l.quantite_prevue);

  for (const f of frais) {
    if (!(f.montant > 0)) continue;
    let bases = lignes.map(l => {
      const q = qte(l);
      if (f.mode_repartition === 'QUANTITE') return q;
      if (f.mode_repartition === 'POIDS') return l.poids_unitaire_kg * q;
      if (f.mode_repartition === 'VOLUME') return l.volume_unitaire_m3 * q;
      return l.prix_achat_unitaire * q;
    });
    if (
      (f.mode_repartition === 'POIDS' || f.mode_repartition === 'VOLUME') &&
      bases.reduce((a, b) => a + b, 0) <= 0
    ) {
      bases = lignes.map(l => qte(l));
    }
    const total = bases.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      const part = f.montant / lignes.length;
      lignes.forEach(l => alloues.set(l.id, (alloues.get(l.id) ?? 0) + part));
    } else {
      lignes.forEach((l, i) => {
        alloues.set(l.id, (alloues.get(l.id) ?? 0) + f.montant * (bases[i] / total));
      });
    }
  }

  for (const ligne of lignes) {
    const q = qte(ligne);
    const alloue = arrondir2(alloues.get(ligne.id) ?? 0);
    const cout = q > 0 ? arrondir2(ligne.prix_achat_unitaire + alloue / q) : ligne.prix_achat_unitaire;
    await executer(
      'UPDATE ligne_arrivage SET frais_approche_alloues = ?, cout_revient_unitaire = ? WHERE id = ?',
      alloue, cout, ligne.id,
    );
    if (receptionne && cout > 0) {
      if (ligne.variante_id) {
        await executer('UPDATE variante_produit SET prix_achat = ? WHERE id = ?', cout, ligne.variante_id);
      } else {
        await executer('UPDATE produit SET prix_achat = ? WHERE id = ?', cout, ligne.produit_id);
      }
    }
  }
}

export async function validerReceptionArrivage(arrivageId: number): Promise<void> {
  await exigerArrivages();
  const arrivage = await lirePremier<{ id_local: string; statut: StatutArrivage }>(
    'SELECT id_local, statut FROM arrivage WHERE id = ?',
    arrivageId,
  );
  if (!arrivage) throw new Error('Arrivage introuvable.');
  if (arrivage.statut === 'RECEPTIONNE') return;
  if (arrivage.statut === 'ANNULE' || arrivage.statut === 'BROUILLON') {
    throw new Error('Cet arrivage ne peut pas être réceptionné définitivement.');
  }

  await dansTransaction(async () => {
    const lignes = await lireTout<{
      id: number; produit_id: number; variante_id: number | null;
      quantite_prevue: number; quantite_recue: number; comptee: number;
    }>(
      'SELECT id, produit_id, variante_id, quantite_prevue, quantite_recue, comptee FROM ligne_arrivage WHERE arrivage_id = ? AND supprime_le IS NULL',
      arrivageId,
    );
    const aucunComptage = arrivage.statut === 'EN_TRANSIT' && !lignes.some(l => l.comptee || l.quantite_recue > 0);
    if (aucunComptage) {
      for (const ligne of lignes) {
        ligne.quantite_recue = ligne.quantite_prevue;
        ligne.comptee = 1;
        await executer(
          'UPDATE ligne_arrivage SET comptee = 1, quantite_recue = ?, date_modification = ? WHERE id = ?',
          ligne.quantite_prevue, maintenant(), ligne.id,
        );
      }
    }

    for (const ligne of lignes) {
      const q = Number(ligne.quantite_recue || 0);
      if (q <= 0) continue;
      await executer(
        'UPDATE produit SET quantite_base = quantite_base + ?, date_modification = ? WHERE id = ?',
        q, maintenant(), ligne.produit_id,
      );
      if (ligne.variante_id) {
        await executer(
          'UPDATE variante_produit SET stock_actuel = stock_actuel + ?, date_modification = ? WHERE id = ?',
          q, maintenant(), ligne.variante_id,
        );
      }
    }
    await executer(
      `UPDATE arrivage
          SET statut = 'RECEPTIONNE', date_reception_reelle = ?, date_modification = ?
        WHERE id = ?`,
      maintenant(), maintenant(), arrivageId,
    );
    await repartirFraisLocal(arrivageId, true);
    await marquerChangement('arrivage', arrivage.id_local);
  });
}

export async function annulerArrivage(arrivageId: number, motif = ''): Promise<void> {
  await exigerArrivages();
  const arrivage = await lirePremier<{ id_local: string; statut: StatutArrivage; notes: string }>(
    'SELECT id_local, statut, notes FROM arrivage WHERE id = ?',
    arrivageId,
  );
  if (!arrivage) throw new Error('Arrivage introuvable.');
  if (arrivage.statut === 'RECEPTIONNE') throw new Error('Un arrivage réceptionné ne peut pas être annulé.');
  if (arrivage.statut === 'ANNULE') return;
  const notes = motif.trim()
    ? `${arrivage.notes || ''}\n[Annulation] ${motif.trim()}`.trim()
    : arrivage.notes;
  await dansTransaction(async () => {
    await executer(
      "UPDATE arrivage SET statut = 'ANNULE', notes = ?, date_modification = ? WHERE id = ?",
      notes, maintenant(), arrivageId,
    );
    await marquerChangement('arrivage', arrivage.id_local);
  });
}

export async function listerArrivages(): Promise<ArrivageLocal[]> {
  const ids = await lireTout<{ id: number }>(
    "SELECT id FROM arrivage WHERE supprime_le IS NULL ORDER BY date_creation DESC, id DESC",
  );
  return Promise.all(ids.map(({ id }) => obtenirArrivage(id))).then(x => x.filter((a): a is ArrivageLocal => !!a));
}

export async function obtenirArrivage(id: number): Promise<ArrivageLocal | null> {
  const a = await lirePremier<{
    id: number; id_local: string; serveur_id: number | null; numero: string; titre: string;
    statut: StatutArrivage; transporteur: string; tracking_number: string; date_creation: string;
    date_expedition: string | null; date_reception_estimee: string | null;
    date_reception_reelle: string | null; notes: string;
  }>(
    `SELECT id, id_local, serveur_id, numero, titre, statut, transporteur,
            tracking_number, date_creation, date_expedition, date_reception_estimee,
            date_reception_reelle, notes
       FROM arrivage WHERE id = ? AND supprime_le IS NULL`,
    id,
  );
  if (!a) return null;

  const lignesSql = await lireTout<{
    id: number; id_local: string; serveur_id: number | null; produit_id: number;
    produit_nom_snapshot: string; variante_id: number | null; variante_nom_snapshot: string;
    variante_sku_snapshot: string; ligne_achat_serveur_id: number | null; comptee: number;
    quantite_prevue: number; quantite_recue: number; quantite_rejetee: number;
    motif_ecart: string; prix_achat_unitaire: number; poids_unitaire_kg: number;
    volume_unitaire_m3: number; frais_approche_alloues: number; cout_revient_unitaire: number;
    lot_serveur_id: number | null; numero_lot: string; date_peremption: string | null;
  }>(
    'SELECT * FROM ligne_arrivage WHERE arrivage_id = ? AND supprime_le IS NULL ORDER BY id',
    id,
  );
  const fraisSql = await lireTout<{
    id: number; id_local: string; serveur_id: number | null; type_frais: TypeFraisArrivage;
    libelle: string; montant: number; mode_repartition: ModeRepartitionFrais; date_frais: string;
  }>(
    'SELECT * FROM frais_arrivage WHERE arrivage_id = ? AND supprime_le IS NULL ORDER BY id',
    id,
  );
  const achatIds = (await lireTout<{ achat_id: number }>(
    'SELECT achat_id FROM arrivage_achat WHERE arrivage_id = ? ORDER BY achat_id',
    id,
  )).map(x => x.achat_id);

  const lignes: LigneArrivageLocale[] = lignesSql.map(l => ({
    id: l.id, idLocal: l.id_local, serveurId: l.serveur_id,
    produitId: l.produit_id, produitNom: l.produit_nom_snapshot,
    varianteId: l.variante_id, varianteNom: l.variante_nom_snapshot,
    varianteSku: l.variante_sku_snapshot, ligneAchatServeurId: l.ligne_achat_serveur_id,
    comptee: l.comptee === 1, quantitePrevue: l.quantite_prevue,
    quantiteRecue: l.quantite_recue, quantiteRejetee: l.quantite_rejetee,
    motifEcart: l.motif_ecart, prixAchatUnitaire: l.prix_achat_unitaire,
    poidsUnitaireKg: l.poids_unitaire_kg, volumeUnitaireM3: l.volume_unitaire_m3,
    fraisApprocheAlloues: l.frais_approche_alloues,
    coutRevientUnitaire: l.cout_revient_unitaire, lotServeurId: l.lot_serveur_id,
    numeroLot: l.numero_lot, datePeremption: l.date_peremption,
  }));
  const frais: FraisArrivageLocal[] = fraisSql.map(f => ({
    id: f.id, idLocal: f.id_local, serveurId: f.serveur_id,
    typeFrais: f.type_frais, libelle: f.libelle, montant: f.montant,
    modeRepartition: f.mode_repartition, dateFrais: f.date_frais,
  }));

  return {
    id: a.id, idLocal: a.id_local, serveurId: a.serveur_id, numero: a.numero,
    titre: a.titre, statut: a.statut, transporteur: a.transporteur,
    trackingNumber: a.tracking_number, dateCreation: a.date_creation,
    dateExpedition: a.date_expedition, dateReceptionEstimee: a.date_reception_estimee,
    dateReceptionReelle: a.date_reception_reelle, notes: a.notes,
    lignes, frais, achatIds,
    totalPiecesPrevues: lignes.reduce((s, l) => s + l.quantitePrevue, 0),
    totalPiecesRecues: lignes.reduce((s, l) => s + l.quantiteRecue, 0),
    totalPiecesRejetees: lignes.reduce((s, l) => s + l.quantiteRejetee, 0),
    totalFrais: frais.reduce((s, f) => s + f.montant, 0),
    coutTotalRendu: lignes.reduce((s, l) => s + l.coutRevientUnitaire * (l.quantiteRecue > 0 ? l.quantiteRecue : l.quantitePrevue), 0),
  };
}
