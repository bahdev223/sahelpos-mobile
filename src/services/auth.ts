/**
 * Authentification et droits.
 *
 * Le mot de passe est un CODE PIN, pas un mot de passe complet : en caisse, on
 * change de vendeur plusieurs fois par jour, et taper un mot de passe au clavier
 * tactile devant un client qui attend ne tient pas.
 *
 * Le PIN est hache avant stockage. Le hachage est volontairement simple : il
 * protege contre quelqu'un qui ouvrirait le fichier de base, pas contre une
 * attaque hors ligne — un PIN a quatre chiffres n'a que dix mille valeurs, et
 * aucun hachage ne change cela. La vraie protection reste l'acces physique au
 * telephone.
 */
import * as Crypto from 'expo-crypto';

import {
  executer,
  lirePremier,
  lireTout,
  maintenant,
  versBooleen,
} from '../db/repositories/base';
import type { Role, Utilisateur } from '../domain/types';

const SEL = 'SahelPOS360::pin::v1';

export const LONGUEUR_PIN = 4;

export class PinInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PinInvalide';
  }
}

async function hacher(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, SEL + pin);
}

function verifierFormatPin(pin: string): void {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new PinInvalide('Le code doit contenir entre 4 et 8 chiffres.');
  }
}

interface LigneUtilisateur {
  id: number;
  login: string;
  nom: string | null;
  role: string;
  actif: number;
}

function versUtilisateur(l: LigneUtilisateur): Utilisateur {
  return {
    id: l.id,
    login: l.login,
    nom: l.nom,
    role: l.role as Role,
    actif: versBooleen(l.actif),
  };
}

export async function listerUtilisateurs(actifsSeulement = false): Promise<Utilisateur[]> {
  const ou = actifsSeulement ? ' WHERE actif = 1' : '';
  const lignes = await lireTout<LigneUtilisateur>(
    `SELECT id, login, nom, role, actif FROM utilisateur${ou} ORDER BY nom, login`,
  );
  return lignes.map(versUtilisateur);
}

export async function compterUtilisateursActifs(): Promise<number> {
  const l = await lirePremier<{ n: number }>(
    'SELECT COUNT(*) AS n FROM utilisateur WHERE actif = 1',
  );
  return l?.n ?? 0;
}

export interface SaisieUtilisateur {
  login: string;
  nom?: string;
  pin: string;
  role: Role;
  actif?: boolean;
}

export async function creerUtilisateur(saisie: SaisieUtilisateur): Promise<number> {
  const login = saisie.login.trim();
  if (!login) throw new Error("L'identifiant est requis.");
  verifierFormatPin(saisie.pin);

  const existe = await lirePremier<{ n: number }>(
    'SELECT COUNT(*) AS n FROM utilisateur WHERE login = ?',
    login,
  );
  if ((existe?.n ?? 0) > 0) {
    throw new Error(`L'identifiant ${login} est deja utilise.`);
  }

  const r = await executer(
    `INSERT INTO utilisateur (login, nom, code_pin, role, actif, date_creation)
     VALUES (?, ?, ?, ?, ?, ?)`,
    login,
    saisie.nom?.trim() || login,
    await hacher(saisie.pin),
    saisie.role,
    saisie.actif === false ? 0 : 1,
    maintenant(),
  );
  return r.lastInsertRowId;
}

export async function modifierUtilisateur(
  id: number,
  modifications: { nom?: string; role?: Role; actif?: boolean; pin?: string },
): Promise<void> {
  const champs: string[] = [];
  const params: unknown[] = [];

  if (modifications.nom !== undefined) {
    champs.push('nom = ?');
    params.push(modifications.nom.trim());
  }
  if (modifications.role !== undefined) {
    champs.push('role = ?');
    params.push(modifications.role);
  }
  if (modifications.actif !== undefined) {
    champs.push('actif = ?');
    params.push(modifications.actif ? 1 : 0);
  }
  if (modifications.pin) {
    verifierFormatPin(modifications.pin);
    champs.push('code_pin = ?');
    params.push(await hacher(modifications.pin));
  }
  if (champs.length === 0) return;

  await executer(
    `UPDATE utilisateur SET ${champs.join(', ')} WHERE id = ?`,
    ...params,
    id,
  );
}

/**
 * Le dernier administrateur actif ne peut etre ni desactive ni supprime :
 * la boutique se retrouverait sans personne pouvant creer un compte.
 */
export async function desactiverUtilisateur(id: number): Promise<void> {
  const u = await lirePremier<{ role: string; actif: number }>(
    'SELECT role, actif FROM utilisateur WHERE id = ?',
    id,
  );
  if (!u) throw new Error('Utilisateur introuvable.');

  if (u.role === 'admin' && versBooleen(u.actif)) {
    const autres = await lirePremier<{ n: number }>(
      "SELECT COUNT(*) AS n FROM utilisateur WHERE role = 'admin' AND actif = 1 AND id <> ?",
      id,
    );
    if ((autres?.n ?? 0) === 0) {
      throw new Error(
        "C'est le dernier administrateur actif : desactivez-le seulement apres en avoir cree un autre.",
      );
    }
  }
  await executer('UPDATE utilisateur SET actif = 0 WHERE id = ?', id);
}

export async function connecter(login: string, pin: string): Promise<Utilisateur> {
  const l = await lirePremier<LigneUtilisateur & { code_pin: string }>(
    'SELECT id, login, nom, role, actif, code_pin FROM utilisateur WHERE login = ?',
    login.trim(),
  );

  // Message identique que le compte existe ou non : dire "cet identifiant
  // n'existe pas" apprendrait a un curieux quels comptes exister.
  const refus = new PinInvalide('Identifiant ou code incorrect.');
  if (!l) throw refus;

  const attendu = await hacher(pin);
  if (attendu !== l.code_pin) throw refus;
  if (!versBooleen(l.actif)) {
    throw new PinInvalide('Ce compte est desactive. Voyez avec le responsable.');
  }

  return versUtilisateur(l);
}

/** Ce que chaque role a le droit de faire. */
const DROITS: Record<Role, string[]> = {
  admin: ['*'],
  gerant: [
    'vendre', 'annuler_vente', 'produits', 'stock', 'inventaire',
    'achats', 'clients', 'rapports',
  ],
  vendeur: ['vendre', 'clients'],
};

export function aLeDroit(role: Role, action: string): boolean {
  const droits = DROITS[role] ?? [];
  return droits.includes('*') || droits.includes(action);
}
