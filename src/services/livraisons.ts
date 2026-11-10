import { randomUUID } from 'expo-crypto';

import { obtenirBase } from '../db/database';
import { estLivreur } from '../domain/accounts';
import {
  projectionMission, signatureValide, STATUTS_ACTION, statutApresAction,
  type ActionEnAttente, type ActionMission, type DetailMission, type EtatEnvoi,
  type EtatFondsLivreur, type Mission, type PerimetreLivreur, type Signature, type StatutMission,
  type TourneeLivreur, type TypeOperationMission,
} from '../domain/livraisons';
import type { Utilisateur } from '../domain/types';
import { ACCOUNTS_SERVEUR } from './accounts';
import { etatCourant, jetonAppareil } from './abonnement';
import { obtenirUtilisateurParIdLocal } from './auth';

export class AccesLivreurRefuse extends Error {
  constructor() {
    super('Votre profil livreur ne donne plus accès à ces missions. Reconnectez-vous avec SahelTech.');
  }
}

class ErreurLivraison extends Error {
  constructor(readonly statut: number, message: string) {
    super(message);
  }
}

interface Autorisation {
  perimetre: string;
  boutique: string;
  jeton: string;
}
type Autoriser = () => Promise<Autorisation>;
export interface SessionLivreur {
  utilisateur: Utilisateur;
  revision: number;
}

type Cache = { mission: number; version: number; resume: string; detail: string | null };
type Genre = 'ACTION' | 'POSITION' | 'FONDS';
type LigneFile = {
  id: number; mission: number; cle: string; genre: Genre; corps: string;
  type: TypeOperationMission | null; apres: StatutMission | null; version: number | null;
  statut: EtatEnvoi; erreur: string | null;
};
export type OperationMission = ActionEnAttente & { cle: string; erreur: string | null };
export type VueMission = { mission: Mission; enAttente: number; conflits: number };

export interface AutorisationGps {
  cle: string;
  perimetre: string;
  mission: number;
  debut: number;
  expiration: number;
}
export interface PositionLivreur {
  latitude: number;
  longitude: number;
  precision: number;
  horodatage: string;
}

type Base = Awaited<ReturnType<typeof obtenirBase>>;
const TABLE_CACHE = 'livraison_cache';
const executions = new Map<string, Promise<void>>();
let revision = 0;

export function creerSessionLivreur(utilisateur: Utilisateur): SessionLivreur {
  return { utilisateur, revision };
}

export function invaliderSessionsLivreur(): void {
  revision++;
}

async function autoriser(perimetreAttendu?: string, membreAttendu?: Utilisateur, accepteBloque = false): Promise<Autorisation> {
  const { active, droit } = await etatCourant();
  const membre = droit?.membre;
  if (!active || !droit?.boutique || !membre || !estLivreur(membre.role)
    || (membreAttendu && (!membreAttendu.actif || membreAttendu.idLocal !== membre.id_local
      || membreAttendu.role !== membre.role))) {
    throw new AccesLivreurRefuse();
  }
  const scope: PerimetreLivreur = { boutique: droit.boutique, membre: membre.id_local, role: membre.role };
  const perimetre = JSON.stringify(scope);
  if (perimetreAttendu && perimetreAttendu !== perimetre) throw new AccesLivreurRefuse();
  const local = await obtenirUtilisateurParIdLocal(scope.membre);
  if (!local?.actif || local.role !== scope.role || (membreAttendu && local.id !== membreAttendu.id)) {
    throw new AccesLivreurRefuse();
  }
  if (!accepteBloque) {
    const db = await obtenirBase();
    if (await db.getFirstAsync('SELECT 1 FROM livraison_acces_bloque WHERE perimetre = ?', perimetre)) {
      throw new AccesLivreurRefuse();
    }
  }
  const jeton = await jetonAppareil();
  if (!jeton) throw new AccesLivreurRefuse();
  const confirmation = await etatCourant();
  if (!confirmation.active || confirmation.droit?.boutique !== scope.boutique
    || confirmation.droit.membre?.id_local !== scope.membre || confirmation.droit.membre.role !== scope.role) {
    throw new AccesLivreurRefuse();
  }
  return { perimetre, boutique: scope.boutique, jeton };
}

async function autoriserSession(session: SessionLivreur, accepteBloque = false): Promise<Autorisation> {
  if (session.revision !== revision) throw new AccesLivreurRefuse();
  const resultat = await autoriser(undefined, session.utilisateur, accepteBloque);
  if (session.revision !== revision) throw new AccesLivreurRefuse();
  return resultat;
}

async function requete<T>(auth: Autorisation, chemin: string, corps?: string): Promise<T> {
  const controleur = new AbortController();
  const delai = setTimeout(() => controleur.abort(), 15000);
  try {
    const response = await fetch(ACCOUNTS_SERVEUR + '/api/livraisons/' + chemin, {
      method: corps === undefined ? 'GET' : 'POST',
      headers: { 'X-Appareil': auth.jeton, 'X-Boutique': auth.boutique, 'Content-Type': 'application/json' },
      body: corps,
      signal: controleur.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data?.detail ?? data?.erreur;
      throw new ErreurLivraison(response.status,
        typeof message === 'string' ? message : 'Le serveur a refusé cette opération.');
    }
    if (!data) throw new Error('Réponse de livraison incomplète.');
    return data as T;
  } finally {
    clearTimeout(delai);
  }
}

async function bloquerAcces(perimetre: string): Promise<void> {
  const db = await obtenirBase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('INSERT OR IGNORE INTO livraison_acces_bloque VALUES (?)', perimetre);
    await tx.runAsync('DELETE FROM livraison_gps WHERE perimetre = ?', perimetre);
  });
}

async function traiterErreurLecture(erreur: unknown, perimetre: string, id?: number): Promise<void> {
  if (!(erreur instanceof ErreurLivraison)) return;
  const db = await obtenirBase();
  if (erreur.statut === 401 || erreur.statut === 403) {
    await bloquerAcces(perimetre);
    throw new AccesLivreurRefuse();
  }
  if (erreur.statut === 404 && id !== undefined) {
    await db.runAsync('DELETE FROM livraison_cache WHERE perimetre = ? AND mission = ?', perimetre, id);
    await db.runAsync('DELETE FROM livraison_fonds_cache WHERE perimetre = ? AND mission = ?', perimetre, id);
    await db.runAsync('DELETE FROM livraison_gps WHERE perimetre = ? AND mission = ?', perimetre, id);
    await db.runAsync('DELETE FROM livraison_tournees_cache WHERE perimetre = ?', perimetre);
  }
}

export async function verifierSessionLivreur(session: SessionLivreur): Promise<void> {
  const auth = await autoriserSession(session, true);
  try {
    await requete(auth, 'reglages/');
  } catch (erreur) {
    await traiterErreurLecture(erreur, auth.perimetre);
    throw erreur;
  }
}

function cacheDetail(ligne?: Cache | null): DetailMission | null {
  return ligne?.detail ? JSON.parse(ligne.detail) as DetailMission : null;
}

function enregistrerCache(db: Pick<Base, 'runAsync'>, perimetre: string, mission: Mission, detail?: DetailMission) {
  return db.runAsync(`INSERT INTO ${TABLE_CACHE} (perimetre, mission, version, resume, detail)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(perimetre, mission) DO UPDATE SET
      version = excluded.version, resume = excluded.resume,
      detail = CASE WHEN excluded.detail IS NOT NULL THEN excluded.detail
                    WHEN excluded.version = livraison_cache.version THEN livraison_cache.detail
                    ELSE NULL END
    WHERE excluded.version >= livraison_cache.version`,
  perimetre, mission.id, mission.version, JSON.stringify(mission), detail ? JSON.stringify(detail) : null);
}

export async function lireMissions(session: SessionLivreur): Promise<VueMission[]> {
  const { perimetre } = await autoriserSession(session);
  const db = await obtenirBase();
  const lignes = await db.getAllAsync<Cache & { attente: number; conflits: number }>(`
    SELECT c.*, COALESCE(f.attente, 0) attente, COALESCE(f.conflits, 0) conflits
    FROM livraison_cache c LEFT JOIN (
      SELECT mission, SUM(statut = 'ATTENTE') attente, SUM(statut = 'CONFLIT') conflits
      FROM livraison_file WHERE perimetre = ? AND genre != 'POSITION' GROUP BY mission
    ) f ON f.mission = c.mission WHERE c.perimetre = ? ORDER BY c.mission DESC`, perimetre, perimetre);
  if (session.revision !== revision) throw new AccesLivreurRefuse();
  return lignes.map((ligne) => ({
    mission: JSON.parse(ligne.resume) as Mission, enAttente: ligne.attente, conflits: ligne.conflits,
  }));
}

async function lireOperations(db: Pick<Base, 'getAllAsync'>, perimetre: string, id: number): Promise<OperationMission[]> {
  const lignes = await db.getAllAsync<LigneFile>(`
    SELECT * FROM livraison_file WHERE perimetre = ? AND mission = ? AND genre != 'POSITION'
    AND statut != 'ARCHIVEE' ORDER BY id`, perimetre, id);
  return lignes.map(({ type, version, statut, apres, cle, erreur }) => ({
    type: type!, version: version!, statut, apres: apres ?? undefined, cle, erreur,
  }));
}

export async function lireMission(session: SessionLivreur, id: number) {
  const { perimetre } = await autoriserSession(session);
  const db = await obtenirBase();
  const ligne = await db.getFirstAsync<Cache>('SELECT * FROM livraison_cache WHERE perimetre = ? AND mission = ?', perimetre, id);
  const operations = ligne ? await lireOperations(db, perimetre, id) : [];
  if (session.revision !== revision) throw new AccesLivreurRefuse();
  return { mission: cacheDetail(ligne), operations };
}

export async function actualiserMission(session: SessionLivreur, id: number): Promise<void> {
  const auth = await autoriserSession(session);
  let detail: DetailMission;
  try {
    detail = await requete(auth, `${id}/`);
  } catch (erreur) {
    await traiterErreurLecture(erreur, auth.perimetre, id);
    throw erreur;
  }
  const apres = await autoriserSession(session);
  if (apres.perimetre !== auth.perimetre || detail.id !== id) throw new AccesLivreurRefuse();
  await enregistrerCache(await obtenirBase(), auth.perimetre, detail, detail);
  if (detail.statut !== 'EN_COURS') {
    const db = await obtenirBase();
    const operations = await lireOperations(db, auth.perimetre, id);
    if (projectionMission(detail, operations).statut !== 'EN_COURS') {
      await db.runAsync('DELETE FROM livraison_gps WHERE perimetre = ? AND mission = ?', auth.perimetre, id);
    }
  }
}

export async function actualiserMissions(session: SessionLivreur): Promise<Mission[]> {
  const auth = await autoriserSession(session, true);
  const missions: Mission[] = [];
  try {
    let page = 1;
    let suivante = true;
    while (suivante) {
      const maintenant = await autoriserSession(session, true);
      if (maintenant.perimetre !== auth.perimetre) throw new AccesLivreurRefuse();
      const resultat = await requete<{ results: Mission[]; next: string | null }>(maintenant, `?page=${page++}`);
      missions.push(...resultat.results);
      suivante = Boolean(resultat.next);
    }
  } catch (erreur) {
    await traiterErreurLecture(erreur, auth.perimetre);
    throw erreur;
  }
  const courant = await autoriserSession(session, true);
  if (courant.perimetre !== auth.perimetre) throw new AccesLivreurRefuse();
  const db = await obtenirBase();
  const ids = new Set(missions.map(({ id }) => id));
  await db.withExclusiveTransactionAsync(async (tx) => {
    const anciennes = await tx.getAllAsync<Cache>('SELECT mission FROM livraison_cache WHERE perimetre = ?', auth.perimetre);
    for (const { mission } of anciennes) {
      if (ids.has(mission)) continue;
      await tx.runAsync('DELETE FROM livraison_cache WHERE perimetre = ? AND mission = ?', auth.perimetre, mission);
      await tx.runAsync('DELETE FROM livraison_fonds_cache WHERE perimetre = ? AND mission = ?', auth.perimetre, mission);
      await tx.runAsync('DELETE FROM livraison_gps WHERE perimetre = ? AND mission = ?', auth.perimetre, mission);
      await tx.runAsync('DELETE FROM livraison_tournees_cache WHERE perimetre = ?', auth.perimetre);
    }
    for (const mission of missions) await enregistrerCache(tx, auth.perimetre, mission);
    await tx.runAsync('DELETE FROM livraison_acces_bloque WHERE perimetre = ?', auth.perimetre);
  });
  return missions;
}

export async function enfilerAction(session: SessionLivreur, id: number, version: number, action: ActionMission): Promise<void> {
  const { perimetre } = await autoriserSession(session);
  const db = await obtenirBase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const cache = await tx.getFirstAsync<Cache>('SELECT * FROM livraison_cache WHERE perimetre = ? AND mission = ?', perimetre, id);
    const mission = cacheDetail(cache);
    if (!mission || session.revision !== revision) throw new AccesLivreurRefuse();
    const operations = await lireOperations(tx, perimetre, id);
    const projection = projectionMission(mission, operations);
    if (projection.bloquee || projection.version !== version || !STATUTS_ACTION[action.type].includes(projection.statut)) {
      throw new Error('Cette mission a changé. Actualisez sa fiche avant de continuer.');
    }
    if (action.type === 'prendre' && (!signatureValide(action.donnees.signature)
      || mission.colis.length === 0
      || action.donnees.colis.length !== mission.colis.length
      || new Set(action.donnees.colis).size !== mission.colis.length
      || !mission.colis.every(({ id: colis }) => action.donnees.colis.includes(colis)))) {
      throw new Error('Pointez tous les colis de cette mission et signez la prise en charge.');
    }
    if (action.type === 'encaisser') {
      const fonds = await fondsEnCache(tx, perimetre, id);
      const montant = action.donnees.montant;
      if (operations.length || !fonds?.peut_encaisser || fonds.version !== version || mission.version !== version
        || !/^\d{1,12}(?:\.\d{1,2})?$/.test(montant) || Number(montant) <= 0 || Number(montant) > Number(fonds.a_percevoir)) {
        throw new Error('Vérifiez le montant à percevoir et actualisez la mission.');
      }
    }
    const cle = randomUUID();
    const corps = JSON.stringify({ cle_operation: cle, version, ...action, date_appareil: new Date().toISOString() });
    const apres = statutApresAction(action, mission);
    await tx.runAsync(`INSERT INTO livraison_file
      (perimetre, mission, cle, genre, version, type, apres, corps) VALUES (?, ?, ?, 'ACTION', ?, ?, ?, ?)`,
    perimetre, id, cle, version, action.type, apres, corps);
    if (action.type === 'livrer' || action.type === 'incident') {
      await tx.runAsync('DELETE FROM livraison_gps WHERE perimetre = ? AND mission = ?', perimetre, id);
    }
  });
}

async function envoyer(autorisation: Autoriser, perimetre: string): Promise<void> {
  const db = await obtenirBase();
  await db.runAsync("DELETE FROM livraison_file WHERE genre = 'POSITION' AND expiration <= ?", Date.now());
  const operations = await db.getAllAsync<LigneFile>(
    "SELECT * FROM livraison_file WHERE perimetre = ? AND statut != 'ARCHIVEE' ORDER BY id", perimetre);
  const bloquees = new Set<number>();
  for (const ligne of operations) {
    if (bloquees.has(ligne.mission)) continue;
    if (ligne.statut === 'CONFLIT') {
      if (ligne.genre !== 'POSITION') bloquees.add(ligne.mission);
      continue;
    }
    const auth = await autorisation();
    if (auth.perimetre !== perimetre) throw new AccesLivreurRefuse();
    const route = ligne.genre === 'POSITION' ? 'positions' : ligne.genre === 'FONDS' ? 'fonds' : 'actions';
    try {
      if (ligne.genre === 'POSITION') {
        const resultat = await requete<{ acquittees: string[] }>(auth, `${ligne.mission}/${route}/`, ligne.corps);
        if (!resultat.acquittees?.includes(ligne.cle)) throw new Error('Position sans accusé de réception.');
        await db.runAsync('DELETE FROM livraison_file WHERE perimetre = ? AND cle = ?', perimetre, ligne.cle);
      } else if (ligne.genre === 'FONDS') {
        const resultat = await requete<EtatFondsLivreur & { version_appliquee: number }>(
          auth, `${ligne.mission}/${route}/`, ligne.corps);
        if (resultat.version_appliquee !== ligne.version! + 1) throw new Error('Remise sans accusé de réception.');
        await db.withExclusiveTransactionAsync(async (tx) => {
          await enregistrerFonds(tx, perimetre, ligne.mission, resultat);
          await tx.runAsync('DELETE FROM livraison_file WHERE perimetre = ? AND cle = ?', perimetre, ligne.cle);
        });
      } else {
        const resultat = await requete<DetailMission & { version_appliquee: number }>(
          auth, `${ligne.mission}/${route}/`, ligne.corps);
        if (resultat.id !== ligne.mission || resultat.version_appliquee !== ligne.version! + 1) {
          throw new Error('Opération sans accusé de réception.');
        }
        await db.withExclusiveTransactionAsync(async (tx) => {
          await enregistrerCache(tx, perimetre, resultat, resultat);
          await tx.runAsync('DELETE FROM livraison_file WHERE perimetre = ? AND cle = ?', perimetre, ligne.cle);
        });
      }
    } catch (erreur) {
      if (!(erreur instanceof ErreurLivraison) || erreur.statut >= 500 || erreur.statut === 429) return;
      if (erreur.statut === 403 && ligne.genre === 'POSITION') {
        await db.withExclusiveTransactionAsync(async (tx) => {
          await tx.runAsync("UPDATE livraison_file SET statut = 'CONFLIT', erreur = ? WHERE perimetre = ? AND genre = 'POSITION' AND statut = 'ATTENTE'",
            erreur.message, perimetre);
          await tx.runAsync('DELETE FROM livraison_gps WHERE perimetre = ?', perimetre);
          await tx.runAsync('INSERT OR REPLACE INTO livraison_gps_reglages VALUES (?, 0)', perimetre);
        });
        // Si le réglage est devenu inaccessible, le jeton a perdu son droit.
        await requete(auth, 'reglages/').catch((failure) => traiterErreurLecture(failure, perimetre));
        // Un autre envoi peut déjà avoir capturé une ancienne file de positions.
        // On reprend uniquement à partir d'une nouvelle lecture de la file.
        return;
      }
      if (erreur.statut === 401) {
        await bloquerAcces(perimetre);
        throw new AccesLivreurRefuse();
      }
      if (erreur.statut === 403) {
        try {
          await requete(auth, 'reglages/');
        } catch (failure) {
          await traiterErreurLecture(failure, perimetre);
          return;
        }
      }
      await db.runAsync("UPDATE livraison_file SET statut = 'CONFLIT', erreur = ? WHERE perimetre = ? AND cle = ?",
        erreur.message, perimetre, ligne.cle);
      await db.runAsync('DELETE FROM livraison_gps WHERE perimetre = ? AND mission = ?', perimetre, ligne.mission);
      if (ligne.genre !== 'POSITION') bloquees.add(ligne.mission);
      if (erreur.statut === 404 && ligne.genre === 'ACTION') {
        await traiterErreurLecture(erreur, perimetre, ligne.mission);
      }
    }
  }
}

async function lancerEnvoi(autorisation: Autoriser): Promise<void> {
  const { perimetre } = await autorisation();
  const precedente = executions.get(perimetre);
  if (precedente) return precedente;
  const execution = envoyer(autorisation, perimetre);
  executions.set(perimetre, execution);
  try {
    await execution;
  } finally {
    executions.delete(perimetre);
  }
}

export function synchroniserLivraisons(session: SessionLivreur): Promise<void> {
  return lancerEnvoi(() => autoriserSession(session));
}

export async function classerConflitMission(session: SessionLivreur, id: number, cle: string): Promise<void> {
  await actualiserMission(session, id);
  const { perimetre } = await autoriserSession(session);
  const db = await obtenirBase();
  await db.runAsync(`UPDATE livraison_file SET statut = 'ARCHIVEE'
    WHERE perimetre = ? AND mission = ? AND id >= (
      SELECT id FROM livraison_file WHERE perimetre = ? AND mission = ? AND cle = ? AND statut = 'CONFLIT'
    )`, perimetre, id, perimetre, id, cle);
}

async function fondsEnCache(db: Pick<Base, 'getFirstAsync'>, perimetre: string, id: number) {
  const row = await db.getFirstAsync<{ contenu: string }>(
    'SELECT contenu FROM livraison_fonds_cache WHERE perimetre = ? AND mission = ?', perimetre, id);
  return row ? JSON.parse(row.contenu) as EtatFondsLivreur : null;
}

function enregistrerFonds(db: Pick<Base, 'runAsync'>, perimetre: string, id: number, fonds: EtatFondsLivreur) {
  return db.runAsync(`INSERT INTO livraison_fonds_cache (perimetre, mission, version, contenu)
    VALUES (?, ?, ?, ?) ON CONFLICT(perimetre, mission) DO UPDATE SET
    version = excluded.version, contenu = excluded.contenu WHERE excluded.version >= livraison_fonds_cache.version`,
  perimetre, id, fonds.version, JSON.stringify(fonds));
}

export async function lireFonds(session: SessionLivreur, id: number) {
  const { perimetre } = await autoriserSession(session);
  const db = await obtenirBase();
  const cache = await db.getFirstAsync<Cache>('SELECT * FROM livraison_cache WHERE perimetre = ? AND mission = ?', perimetre, id);
  const fonds = cache ? await fondsEnCache(db, perimetre, id) : null;
  const operations = cache ? await lireOperations(db, perimetre, id) : [];
  if (session.revision !== revision) throw new AccesLivreurRefuse();
  return { fonds, operations, versionMission: cache?.version };
}

export async function actualiserFonds(session: SessionLivreur, id: number): Promise<void> {
  const auth = await autoriserSession(session);
  try {
    const fonds = await requete<EtatFondsLivreur>(auth, `${id}/fonds/`);
    if ((await autoriserSession(session)).perimetre !== auth.perimetre) throw new AccesLivreurRefuse();
    await enregistrerFonds(await obtenirBase(), auth.perimetre, id, fonds);
  } catch (erreur) {
    await traiterErreurLecture(erreur, auth.perimetre);
    throw erreur;
  }
}

export async function enfilerDeclarationFonds(
  session: SessionLivreur, id: number, version: number, montant: string, signature: Signature,
): Promise<void> {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(montant) || !signatureValide(signature)) {
    throw new Error('Indiquez le montant à remettre et signez la déclaration.');
  }
  const { perimetre } = await autoriserSession(session);
  const db = await obtenirBase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const cache = await tx.getFirstAsync<Cache>('SELECT * FROM livraison_cache WHERE perimetre = ? AND mission = ?', perimetre, id);
    const mission = cacheDetail(cache);
    const fonds = await fondsEnCache(tx, perimetre, id);
    const operations = await lireOperations(tx, perimetre, id);
    if (session.revision !== revision) throw new AccesLivreurRefuse();
    if (!fonds?.peut_declarer || fonds.version !== version || mission?.version !== version || operations.length) {
      throw new Error('Les fonds ont changé. Actualisez avant de déclarer.');
    }
    const cle = randomUUID();
    const corps = JSON.stringify({ cle_operation: cle, version, montant_declare: montant, signature, date_appareil: new Date().toISOString() });
    await tx.runAsync(`INSERT INTO livraison_file
      (perimetre, mission, cle, genre, version, type, apres, corps) VALUES (?, ?, ?, 'FONDS', ?, 'declarer_fonds', ?, ?)`,
    perimetre, id, cle, version, mission.statut, corps);
  });
}

export async function lireTournees(session: SessionLivreur): Promise<{ tournees: TourneeLivreur[]; cache: boolean }> {
  const auth = await autoriserSession(session);
  const db = await obtenirBase();
  try {
    const tournees = await requete<TourneeLivreur[]>(auth, 'tournees/');
    if ((await autoriserSession(session)).perimetre !== auth.perimetre) throw new AccesLivreurRefuse();
    await db.runAsync('INSERT OR REPLACE INTO livraison_tournees_cache VALUES (?, ?)', auth.perimetre, JSON.stringify(tournees));
    return { tournees, cache: false };
  } catch (erreur) {
    if (erreur instanceof AccesLivreurRefuse) throw erreur;
    await traiterErreurLecture(erreur, auth.perimetre);
    if ((await autoriserSession(session)).perimetre !== auth.perimetre) throw new AccesLivreurRefuse();
    const row = await db.getFirstAsync<{ contenu: string }>(
      'SELECT contenu FROM livraison_tournees_cache WHERE perimetre = ?', auth.perimetre);
    if (!row) throw erreur;
    return { tournees: JSON.parse(row.contenu), cache: true };
  }
}

export async function agirSurTournee(session: SessionLivreur, id: number, type: 'partir' | 'cloturer'): Promise<void> {
  const auth = await autoriserSession(session);
  await requete(auth, `tournees/${id}/actions/`, JSON.stringify({ type }));
  if ((await autoriserSession(session)).perimetre !== auth.perimetre) throw new AccesLivreurRefuse();
}

export type PieceLivraison = 'D04' | 'D06' | 'D07' | 'D08' | 'D09' | 'D10' | 'D11';

export async function ouvrirPieceLivraison(
  session: SessionLivreur, id: number, code: PieceLivraison, mode: 'partager' | 'imprimer',
): Promise<void> {
  const auth = await autoriserSession(session);
  const controleur = new AbortController();
  const delai = setTimeout(() => controleur.abort(), 20_000);
  let pdf: Uint8Array;
  try {
    const response = await fetch(`${ACCOUNTS_SERVEUR}/api/livraisons/${id}/documents/${code}/`, {
      headers: { 'X-Appareil': auth.jeton, 'X-Boutique': auth.boutique, Accept: 'application/pdf' },
      redirect: 'error',
      signal: controleur.signal,
    });
    if (!response.ok) {
      const erreur = new ErreurLivraison(response.status, 'Ce document est indisponible pour cette mission.');
      await traiterErreurLecture(erreur, auth.perimetre);
      throw erreur;
    }
    if (!response.headers.get('Content-Type')?.startsWith('application/pdf')) {
      throw new Error('Le serveur n’a pas renvoyé de PDF.');
    }
    pdf = new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(delai);
  }
  const { File, Paths } = await import('expo-file-system');
  if ((await autoriserSession(session)).perimetre !== auth.perimetre) throw new AccesLivreurRefuse();
  const fichier = new File(Paths.cache, `SahelPOS-${code}-${randomUUID()}.pdf`);
  try {
    fichier.write(pdf);
    if (mode === 'imprimer') {
      const { printAsync } = await import('expo-print');
      await printAsync({ uri: fichier.uri });
    } else {
      const { isAvailableAsync, shareAsync } = await import('expo-sharing');
      if (!await isAvailableAsync()) throw new Error('Le partage de fichiers est indisponible.');
      await shareAsync(fichier.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    }
  } finally {
    if (fichier.exists) fichier.delete();
  }
}

export async function verifierReglageGps(session: SessionLivreur): Promise<void> {
  const auth = await autoriserSession(session);
  const db = await obtenirBase();
  let actif: boolean;
  try {
    const resultat = await requete<{ gps_actif: boolean }>(auth, 'reglages/');
    if ((await autoriserSession(session)).perimetre !== auth.perimetre) throw new AccesLivreurRefuse();
    actif = resultat.gps_actif === true;
    await db.runAsync('INSERT OR REPLACE INTO livraison_gps_reglages VALUES (?, ?)', auth.perimetre, actif ? 1 : 0);
  } catch (erreur) {
    if (erreur instanceof AccesLivreurRefuse) throw erreur;
    await traiterErreurLecture(erreur, auth.perimetre);
    const cache = await db.getFirstAsync<{ actif: number }>('SELECT actif FROM livraison_gps_reglages WHERE perimetre = ?', auth.perimetre);
    if (!cache) throw new Error('Connectez-vous pour vérifier que la boutique autorise le suivi GPS.');
    actif = cache.actif === 1;
  }
  if (!actif) throw new Error('Le suivi GPS est désactivé dans cette boutique.');
}

export async function accorderGps(session: SessionLivreur, id: number): Promise<AutorisationGps> {
  const { perimetre } = await autoriserSession(session);
  const db = await obtenirBase();
  const maintenant = Date.now();
  const grant = { cle: randomUUID(), perimetre, mission: id, debut: maintenant, expiration: maintenant + 12 * 3600 * 1000 };
  await db.withExclusiveTransactionAsync(async (tx) => {
    const cache = await tx.getFirstAsync<Cache>('SELECT * FROM livraison_cache WHERE perimetre = ? AND mission = ?', perimetre, id);
    const mission = cacheDetail(cache);
    if (!mission || session.revision !== revision) throw new AccesLivreurRefuse();
    const operations = await lireOperations(tx, perimetre, id);
    const projection = projectionMission(mission, operations);
    if (projection.bloquee || projection.statut !== 'EN_COURS') throw new Error('La mission doit être en cours.');
    await tx.runAsync(`INSERT OR REPLACE INTO livraison_gps
      (id, cle, perimetre, mission, debut, expiration) VALUES (1, ?, ?, ?, ?, ?)`,
    grant.cle, perimetre, id, grant.debut, grant.expiration);
  });
  return grant;
}

export async function lireAutorisationGps(): Promise<AutorisationGps | null> {
  const db = await obtenirBase();
  return await db.getFirstAsync<AutorisationGps>('SELECT * FROM livraison_gps WHERE id = 1') ?? null;
}

export async function revoquerGps(cle?: string): Promise<void> {
  const db = await obtenirBase();
  if (cle) await db.runAsync('DELETE FROM livraison_gps WHERE cle = ?', cle);
  else await db.runAsync('DELETE FROM livraison_gps');
}

async function autoriserGps(grant: AutorisationGps): Promise<Autorisation> {
  const auth = await autoriser(grant.perimetre);
  const courant = await lireAutorisationGps();
  if (courant?.cle !== grant.cle || Date.now() >= courant.expiration) throw new AccesLivreurRefuse();
  const db = await obtenirBase();
  const ligne = await db.getFirstAsync<Cache>(
    'SELECT * FROM livraison_cache WHERE perimetre = ? AND mission = ?', grant.perimetre, grant.mission);
  const mission = cacheDetail(ligne);
  if (!mission) throw new AccesLivreurRefuse();
  const projection = projectionMission(mission, await lireOperations(db, grant.perimetre, grant.mission));
  if (projection.bloquee || projection.statut !== 'EN_COURS') throw new AccesLivreurRefuse();
  return auth;
}

export async function autorisationGpsValide(grant: AutorisationGps): Promise<boolean> {
  return autoriserGps(grant).then(() => true, () => false);
}

export async function enregistrerPositions(grant: AutorisationGps, positions: PositionLivreur[]): Promise<void> {
  const { perimetre } = await autoriserGps(grant);
  const db = await obtenirBase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const courant = await tx.getFirstAsync<AutorisationGps>('SELECT * FROM livraison_gps WHERE cle = ?', grant.cle);
    if (!courant || Date.now() >= courant.expiration) throw new AccesLivreurRefuse();
    const total = await tx.getFirstAsync<{ n: number }>(`
      SELECT COUNT(*) n FROM livraison_file WHERE perimetre = ? AND mission = ? AND genre = 'POSITION' AND statut = 'ATTENTE'`,
    perimetre, grant.mission);
    for (const point of positions.slice(0, Math.max(0, 500 - (total?.n ?? 0)))) {
      const instant = Date.parse(point.horodatage);
      if (!Number.isFinite(instant) || instant < courant.debut || instant > Date.now() + 120_000) continue;
      const cle = randomUUID();
      const corps = JSON.stringify({ points: [{ cle_operation: cle, ...point }] });
      await tx.runAsync(`INSERT INTO livraison_file
        (perimetre, mission, cle, genre, corps, expiration) VALUES (?, ?, ?, 'POSITION', ?, ?)`,
      perimetre, grant.mission, cle, corps, instant + 24 * 3600 * 1000);
    }
  });
  await lancerEnvoi(() => autoriserGps(grant));
}
