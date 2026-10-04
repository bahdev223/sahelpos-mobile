import type { Role } from './types';

const PREFIXES_VENDEUR = [
  '/accueil', '/caisse', '/clients', '/notifications',
  '/(tabs)/accueil', '/(tabs)/caisse',
];

const PREFIXES_GERANT_INTERDITS = [
  '/parametres/utilisateurs',
  '/parametres/sauvegarde',
  '/abonnement',
];

export function peutAccederCheminMobile(role: Role, chemin: string): boolean {
  if (role === 'admin') return true;
  const propre = chemin.split('?')[0].replace(/\/+$/, '') || '/';
  if (role === 'vendeur') {
    return PREFIXES_VENDEUR.some((prefixe) =>
      propre === prefixe || propre.startsWith(prefixe + '/'),
    );
  }
  return !PREFIXES_GERANT_INTERDITS.some((prefixe) =>
    propre === prefixe || propre.startsWith(prefixe + '/'),
  );
}

export function ongletsAutorises(role: Role): {
  catalogue: boolean;
  achats: boolean;
  stock: boolean;
} {
  if (role === 'admin' || role === 'gerant') {
    return { catalogue: true, achats: true, stock: true };
  }
  return { catalogue: false, achats: false, stock: false };
}
