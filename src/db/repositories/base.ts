/**
 * Briques partagees par tous les depots.
 *
 * Un depot traduit les lignes SQLite en objets du domaine. Concentrer ici la
 * conversion evite que chaque depot reinvente sa facon de lire un booleen ou
 * de fabriquer un identifiant, et que les ecrans recoivent des formes
 * legerement differentes selon le depot qui les a servis.
 */
import { obtenirBase } from '../database';
import { getRandomBytes } from 'expo-crypto';

/** SQLite ne connait pas le booleen : il stocke 0 ou 1. */
export function versBooleen(valeur: unknown): boolean {
  return valeur === 1 || valeur === true || valeur === '1';
}

export function versEntier(valeur: unknown): number {
  return valeur === null || valeur === undefined ? 0 : Number(valeur);
}

/** Horodatage unique de l'application : ISO 8601, toujours en UTC. */
export function maintenant(): string {
  return new Date().toISOString();
}

/**
 * Identifiant local d'une ligne creee sur ce telephone.
 *
 * En mode reseau, plusieurs appareils ecrivent : un entier auto-incremente
 * entrerait en collision au moment du rapprochement. Cet identifiant textuel
 * reste unique quel que soit l'appareil.
 */
/**
 * Identifiant unique d'une ligne, valable au-dela de ce telephone.
 *
 * POURQUOI 128 BITS D'UN VRAI GENERATEUR
 * ---------------------------------------
 * Cette valeur est ce qui empeche deux ventes venues de deux telephones de
 * fusionner en une seule au moment de la synchronisation. Une collision, ici,
 * ne se voit pas dans un journal : elle efface silencieusement de l'argent
 * reellement encaisse.
 *
 * La version precedente concatenait `Date.now()` et huit caracteres de
 * `Math.random()`, soit environ 32 bits d'alea. Deux appareils qui
 * enregistraient une vente dans la meme milliseconde pouvaient produire le
 * meme identifiant. Sur une base locale isolee, cela ne portait pas a
 * consequence ; des lors qu'on replique, c'est la garantie centrale du
 * systeme.
 *
 * `getRandomBytes` s'appuie sur le generateur securise du systeme Android,
 * pas sur `Math.random`. TweetNaCl, qui sert a verifier les licences, ne
 * branche pas lui-meme ce generateur dans React Native : appeler
 * `nacl.randomBytes` ici provoquait l'erreur « no PRNG » au moment precis ou
 * l'on voulait enregistrer un produit, un achat ou une vente.
 *
 * Format : 32 caracteres hexadecimaux minuscules, identique a ce que produit
 * `lower(hex(randomblob(16)))` cote SQLite, pour que les identifiants creees
 * par les deux chemins soient indiscernables.
 */
export function genererIdLocal(): string {
  const octets = getRandomBytes(16);
  let sortie = '';
  for (let i = 0; i < octets.length; i++) {
    sortie += octets[i].toString(16).padStart(2, '0');
  }
  return sortie;
}

/** Le franc CFA n'a pas de sous-unite : tout montant est un entier de francs. */
export function arrondirFranc(valeur: number): number {
  return Math.round(valeur);
}

export async function lireTout<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  const db = await obtenirBase();
  return db.getAllAsync<T>(sql, ...(params as never[]));
}

export async function lirePremier<T>(sql: string, ...params: unknown[]): Promise<T | null> {
  const db = await obtenirBase();
  return db.getFirstAsync<T>(sql, ...(params as never[]));
}

export async function executer(sql: string, ...params: unknown[]) {
  const db = await obtenirBase();
  return db.runAsync(sql, ...(params as never[]));
}

/**
 * Execute plusieurs ecritures en tout-ou-rien.
 *
 * Android tue les applications en arriere-plan sans prevenir. Sans transaction,
 * on obtient des ventes sans lignes ou du stock retire pour une vente qui
 * n'existe pas.
 */
export async function dansTransaction<T>(travail: () => Promise<T>): Promise<T> {
  const db = await obtenirBase();
  let resultat: T;
  await db.withTransactionAsync(async () => {
    resultat = await travail();
  });
  return resultat!;
}

/** Construit "WHERE a = ? AND b LIKE ?" en ignorant les filtres vides. */
export function construireFiltres(
  conditions: Array<[actif: boolean, sql: string, valeur?: unknown]>,
): { clause: string; params: unknown[] } {
  const actives = conditions.filter(([actif]) => actif);
  if (actives.length === 0) return { clause: '', params: [] };
  return {
    clause: ' WHERE ' + actives.map(([, sql]) => sql).join(' AND '),
    params: actives
      .filter(([, , valeur]) => valeur !== undefined)
      .map(([, , valeur]) => valeur),
  };
}
