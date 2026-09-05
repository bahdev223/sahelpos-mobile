/**
 * Le journal des notifications.
 *
 * POURQUOI IL EXISTE
 * ------------------
 * Les alertes etaient recalculees a chaque ouverture d'ecran. Une rupture
 * survenue a 14 h, pendant que le commercant encaissait, n'existait donc nulle
 * part : impossible de la marquer comme lue, de la retrouver le soir, ou de
 * savoir si on avait deja prevenu. Ce journal garde la trace.
 *
 * LA CLE EST L'EVENEMENT, PAS LA LIGNE
 * -------------------------------------
 * `rupture:produit:42` designe « ce produit est a zero », pas « on l'a
 * constate a 14 h 03 ». Deux ventes qui vident le meme produit produisent la
 * meme cle : on remonte la notification existante au lieu d'en empiler une
 * seconde. C'est ce qui evite qu'une boutique de deux cents references sonne
 * trente fois de suite — apres quoi le commercant coupe les notifications et
 * le canal est perdu pour de bon.
 */
import { executer, genererIdLocal, lireTout } from '../../db/repositories/base';

export type Gravite = 'info' | 'attention' | 'urgent';

export type Genre =
  | 'rupture'
  | 'seuil'
  | 'seuil_groupe'
  | 'abonnement'
  | 'ardoise'
  | 'dette'
  | 'annonce';

export interface Notification {
  id: number;
  cle: string;
  genre: Genre;
  gravite: Gravite;
  titre: string;
  corps: string;
  chemin: string | null;
  produitId: number | null;
  dateCreation: string;
  dateRappel: string | null;
  lue: boolean;
  sonnee: boolean;
}

interface LigneNotification {
  id: number;
  cle: string;
  genre: string;
  gravite: string;
  titre: string;
  corps: string;
  chemin: string | null;
  produit_id: number | null;
  date_creation: string;
  date_rappel: string | null;
  lue_le: string | null;
  sonnee: number;
}

function enNotification(l: LigneNotification): Notification {
  return {
    id: l.id,
    cle: l.cle,
    genre: l.genre as Genre,
    gravite: l.gravite as Gravite,
    titre: l.titre,
    corps: l.corps,
    chemin: l.chemin,
    produitId: l.produit_id,
    dateCreation: l.date_creation,
    dateRappel: l.date_rappel,
    lue: l.lue_le !== null,
    sonnee: l.sonnee === 1,
  };
}

const COLONNES =
  'id, cle, genre, gravite, titre, corps, chemin, produit_id, ' +
  'date_creation, date_rappel, lue_le, sonnee';

export interface SaisieNotification {
  cle: string;
  genre: Genre;
  gravite?: Gravite;
  titre: string;
  corps?: string;
  chemin?: string | null;
  produitId?: number | null;
}

/**
 * Depose une notification, ou remonte celle qui existe deja.
 *
 * Renvoie `true` si c'est une NOUVEAUTE, c'est-a-dire s'il faut faire sonner
 * le telephone. Une rupture deja signalee et non lue ne resonne pas : le
 * commercant l'a vue, la lui rappeler toutes les cinq minutes ne l'aide pas.
 *
 * En revanche, une notification deja LUE qui se reproduit redevient neuve :
 * le produit avait ete reapprovisionne puis s'est vide a nouveau, c'est bien
 * un evenement different.
 */
export async function deposer(saisie: SaisieNotification): Promise<boolean> {
  const maintenant = new Date().toISOString();
  const existantes = await lireTout<LigneNotification>(
    `SELECT ${COLONNES} FROM notification WHERE cle = ?`,
    saisie.cle,
  );
  const existante = existantes[0];

  if (existante) {
    const etaitLue = existante.lue_le !== null;
    await executer(
      `UPDATE notification
          SET titre = ?, corps = ?, gravite = ?, chemin = ?,
              date_rappel = ?, lue_le = NULL, sonnee = CASE WHEN ? THEN 0 ELSE sonnee END
        WHERE cle = ?`,
      saisie.titre,
      saisie.corps ?? '',
      saisie.gravite ?? 'info',
      saisie.chemin ?? null,
      maintenant,
      etaitLue ? 1 : 0,
      saisie.cle,
    );
    return etaitLue;
  }

  await executer(
    `INSERT INTO notification
       (id_local, cle, genre, gravite, titre, corps, chemin, produit_id,
        date_creation, date_rappel, lue_le, sonnee)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`,
    genererIdLocal(),
    saisie.cle,
    saisie.genre,
    saisie.gravite ?? 'info',
    saisie.titre,
    saisie.corps ?? '',
    saisie.chemin ?? null,
    saisie.produitId ?? null,
    maintenant,
  );
  return true;
}

/**
 * Retire une notification devenue sans objet.
 *
 * Appele quand un produit est reapprovisionne : garder « Riz epuise » alors
 * que le riz est revenu fait douter de toutes les autres notifications.
 */
export async function retirer(cle: string): Promise<void> {
  await executer('DELETE FROM notification WHERE cle = ?', cle);
}

export async function lister(limite = 100): Promise<Notification[]> {
  const lignes = await lireTout<LigneNotification>(
    `SELECT ${COLONNES} FROM notification
      ORDER BY lue_le IS NOT NULL,
               COALESCE(date_rappel, date_creation) DESC
      LIMIT ?`,
    limite,
  );
  return lignes.map(enNotification);
}

export async function compterNonLues(): Promise<number> {
  const lignes = await lireTout<{ n: number }>(
    'SELECT COUNT(*) AS n FROM notification WHERE lue_le IS NULL',
  );
  return lignes[0]?.n ?? 0;
}

/** Celles qui doivent encore faire sonner le telephone. */
export async function aSonner(): Promise<Notification[]> {
  const lignes = await lireTout<LigneNotification>(
    `SELECT ${COLONNES} FROM notification
      WHERE sonnee = 0 AND lue_le IS NULL
      ORDER BY date_creation`,
  );
  return lignes.map(enNotification);
}

export async function marquerSonnee(cle: string): Promise<void> {
  await executer('UPDATE notification SET sonnee = 1 WHERE cle = ?', cle);
}

export async function marquerLue(cle: string): Promise<void> {
  await executer(
    'UPDATE notification SET lue_le = ? WHERE cle = ? AND lue_le IS NULL',
    new Date().toISOString(),
    cle,
  );
}

export async function toutMarquerLu(): Promise<void> {
  await executer(
    'UPDATE notification SET lue_le = ? WHERE lue_le IS NULL',
    new Date().toISOString(),
  );
}

/**
 * Efface les notifications lues et anciennes.
 *
 * Ne touche JAMAIS aux notifications non lues, quel que soit leur age : une
 * rupture ignoree depuis trois semaines reste une rupture.
 */
export async function purger(joursConserves = 30): Promise<number> {
  const limite = new Date(Date.now() - joursConserves * 86400000).toISOString();
  const resultat = await executer(
    'DELETE FROM notification WHERE lue_le IS NOT NULL AND lue_le < ?',
    limite,
  );
  return resultat?.changes ?? 0;
}
