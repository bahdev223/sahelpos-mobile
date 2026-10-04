import type { Utilisateur } from './types';

export type ChangementSession =
  | { type: 'INCHANGE'; utilisateur: Utilisateur }
  | { type: 'ACTUALISE'; utilisateur: Utilisateur }
  | { type: 'FERME'; raison: 'INACTIF' | 'ABSENT' };

export function resoudreSessionSynchronisee(
  courant: Utilisateur,
  local: Utilisateur | null,
): ChangementSession {
  if (!local) return { type: 'FERME', raison: 'ABSENT' };
  if (!local.actif) return { type: 'FERME', raison: 'INACTIF' };
  const identique =
    courant.id === local.id &&
    courant.idLocal === local.idLocal &&
    courant.login === local.login &&
    courant.nom === local.nom &&
    courant.role === local.role &&
    courant.actif === local.actif &&
    courant.caisseOuvreA === local.caisseOuvreA &&
    courant.caisseFermeA === local.caisseFermeA;
  return identique
    ? { type: 'INCHANGE', utilisateur: courant }
    : { type: 'ACTUALISE', utilisateur: local };
}

export function comptesPourConnexion(utilisateurs: Utilisateur[]): Utilisateur[] {
  return utilisateurs
    .filter((u) => u.actif)
    .sort((a, b) =>
      (a.nom || a.login).localeCompare(b.nom || b.login, 'fr', { sensitivity: 'base' })
      || a.login.localeCompare(b.login, 'fr', { sensitivity: 'base' }),
    );
}

export function libelleRole(role: Utilisateur['role']): string {
  return role === 'admin' ? 'Administrateur' : role === 'gerant' ? 'Gérant' : 'Vendeur';
}
