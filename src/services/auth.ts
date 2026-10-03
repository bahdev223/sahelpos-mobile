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
  genererIdLocal,
  lirePremier,
  lireTout,
  maintenant,
  versBooleen,
} from '../db/repositories/base';
import type { Role, Utilisateur } from '../domain/types';
import { marquerChangement } from './synchronisation';

const SEL = 'SahelPOS360::pin::v1';

/** Regle unique partagee par le premier demarrage, la connexion et les vendeurs. */
export const LONGUEUR_PIN_MIN = 4;
export const LONGUEUR_PIN_MAX = 9;
/** Compatibilite pour les ecrans qui utilisaient encore cette constante. */
export const LONGUEUR_PIN = LONGUEUR_PIN_MIN;

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
  if (!new RegExp(`^\\d{${LONGUEUR_PIN_MIN},${LONGUEUR_PIN_MAX}}$`).test(pin)) {
    throw new PinInvalide(`Le code doit contenir entre ${LONGUEUR_PIN_MIN} et ${LONGUEUR_PIN_MAX} chiffres.`);
  }
}

/**
 * Les anciennes builds enregistraient le PIN en clair avant le passage au
 * hash. On accepte ce seul format historique pour une connexion, puis on le
 * remplace immediatement par le hash courant. Les nouvelles ecritures ne sont
 * jamais en clair.
 */
async function verifierEtModerniserPin(id: number, stocke: string, pin: string): Promise<boolean> {
  const hash = await hacher(pin);
  if (stocke === hash) return true;

  if (stocke === pin && /^\d+$/.test(stocke)) {
    await executer('UPDATE utilisateur SET code_pin = ? WHERE id = ?', hash, id);
    return true;
  }

  return false;
}

interface LigneUtilisateur {
  id: number;
  id_local: string;
  login: string;
  nom: string | null;
  role: string;
  actif: number;
  caisse_ouvre_a: string | null;
  caisse_ferme_a: string | null;
}

function versUtilisateur(l: LigneUtilisateur): Utilisateur {
  return {
    id: l.id,
    idLocal: l.id_local,
    login: l.login,
    nom: l.nom,
    role: l.role as Role,
    actif: versBooleen(l.actif),
    caisseOuvreA: l.caisse_ouvre_a,
    caisseFermeA: l.caisse_ferme_a,
  };
}

export async function listerUtilisateurs(actifsSeulement = false): Promise<Utilisateur[]> {
  const ou = actifsSeulement ? ' WHERE actif = 1' : '';
  const lignes = await lireTout<LigneUtilisateur>(
    `SELECT id, id_local, login, nom, role, actif, caisse_ouvre_a, caisse_ferme_a FROM utilisateur${ou} ORDER BY nom, login`,
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
  caisseOuvreA?: string | null;
  caisseFermeA?: string | null;
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
    `INSERT INTO utilisateur (id_local, login, nom, code_pin, role, actif, caisse_ouvre_a, caisse_ferme_a, date_creation, date_modification)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    genererIdLocal(),
    login,
    saisie.nom?.trim() || login,
    await hacher(saisie.pin),
    saisie.role,
    saisie.actif === false ? 0 : 1,
    saisie.caisseOuvreA ?? null,
    saisie.caisseFermeA ?? null,
    maintenant(),
    maintenant(),
  );
  const id = r.lastInsertRowId;
  const cree = await lirePremier<{ id_local: string }>('SELECT id_local FROM utilisateur WHERE id = ?', id);
  if (saisie.role === 'vendeur' && cree?.id_local) {
    await marquerChangement('utilisateur', cree.id_local);
  }
  return id;
}

export async function initialiserCompteAdministrateur(saisie: SaisieUtilisateur): Promise<number> {
  const login = saisie.login.trim();
  if (!login) throw new Error("L'identifiant est requis.");
  verifierFormatPin(saisie.pin);
  const existant = await lirePremier<{ id: number; role: string; actif: number }>(
    'SELECT id, role, actif FROM utilisateur WHERE login = ?',
    login,
  );
  if (!existant) return creerUtilisateur({ ...saisie, login, role: 'admin' });
  if (!versBooleen(existant.actif) || !['admin', 'patron'].includes(existant.role)) {
    throw new Error("Ce compte n'est pas un administrateur actif de cet espace.");
  }
  await executer('UPDATE utilisateur SET code_pin = ? WHERE id = ?', await hacher(saisie.pin), existant.id);
  if (existant.role === 'patron') {
    await executer("UPDATE utilisateur SET role = 'admin' WHERE id = ?", existant.id);
  }
  return existant.id;
}

export async function modifierUtilisateur(
  id: number,
  modifications: { nom?: string; role?: Role; actif?: boolean; pin?: string; caisseOuvreA?: string | null; caisseFermeA?: string | null },
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
  if (modifications.caisseOuvreA !== undefined) {
    champs.push('caisse_ouvre_a = ?');
    params.push(modifications.caisseOuvreA);
  }
  if (modifications.caisseFermeA !== undefined) {
    champs.push('caisse_ferme_a = ?');
    params.push(modifications.caisseFermeA);
  }
  if (champs.length === 0) return;

  champs.push('date_modification = ?');
  params.push(maintenant());

  await executer(
    `UPDATE utilisateur SET ${champs.join(', ')} WHERE id = ?`,
    ...params,
    id,
  );
  const modifie = await lirePremier<{ id_local: string }>('SELECT id_local FROM utilisateur WHERE id = ?', id);
  const changementPartage = Object.keys(modifications).some((cle) => cle !== 'pin');
  if (changementPartage && modifie?.id_local) {
    const role = await lirePremier<{ role: string }>('SELECT role FROM utilisateur WHERE id = ?', id);
    if (role?.role === 'vendeur') await marquerChangement('utilisateur', modifie.id_local);
  }
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
  await modifierUtilisateur(id, { actif: false });
}

export async function connecter(login: string, pin: string): Promise<Utilisateur> {
  const l = await lirePremier<LigneUtilisateur & { code_pin: string }>(
    'SELECT id, id_local, login, nom, role, actif, caisse_ouvre_a, caisse_ferme_a, code_pin FROM utilisateur WHERE login = ?',
    login.trim(),
  );

  // Message identique que le compte existe ou non : dire "cet identifiant
  // n'existe pas" apprendrait a un curieux quels comptes exister.
  const refus = new PinInvalide('Identifiant ou code incorrect.');
  if (!l) throw refus;

  verifierFormatPin(pin);
  if (!(await verifierEtModerniserPin(l.id, l.code_pin, pin))) throw refus;
  if (!versBooleen(l.actif)) {
    throw new PinInvalide('Ce compte est desactive. Voyez avec le responsable.');
  }

  return versUtilisateur(l);
}

/** L'horaire bride l'encaissement, jamais la consultation de l'historique. */
export async function verifierAccesCaisse(utilisateurId: number | null | undefined): Promise<void> {
  if (!utilisateurId) return;
  const compte = await lirePremier<{ actif: number; caisse_ouvre_a: string | null; caisse_ferme_a: string | null }>(
    'SELECT actif, caisse_ouvre_a, caisse_ferme_a FROM utilisateur WHERE id = ?', utilisateurId,
  );
  if (!compte || !versBooleen(compte.actif)) throw new PinInvalide('Ce compte est desactive.');
  const debut = compte.caisse_ouvre_a;
  const fin = compte.caisse_ferme_a;
  if (!debut || !fin) return;
  const maintenantLocal = new Date();
  const heure = `${String(maintenantLocal.getHours()).padStart(2, '0')}:${String(maintenantLocal.getMinutes()).padStart(2, '0')}`;
  const dansCreneau = debut <= fin ? heure >= debut && heure < fin : heure >= debut || heure < fin;
  if (!dansCreneau) throw new PinInvalide(`La caisse est ouverte de ${debut} a ${fin} pour ce vendeur.`);
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
