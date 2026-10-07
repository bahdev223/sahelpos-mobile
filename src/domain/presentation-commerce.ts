import type { ProfilCommerceMobile } from './commerce';

type ProfilSecteur = Pick<ProfilCommerceMobile, 'secteur'> | null | undefined;
type ProfilTarif = Pick<ProfilCommerceMobile, 'secteur' | 'mode_vente' | 'capabilities_effectives'> | null | undefined;

/** Présentation uniquement : ne remplace jamais le secteur du contrat signé. */
export function estReferenceTechnique(profil: ProfilSecteur): boolean {
  return profil?.secteur === 'QUINCAILLERIE' || profil?.secteur === 'ELECTRICITE';
}

export function tarifGrosDisponible(profil: ProfilTarif): boolean {
  if (!profil || !['QUINCAILLERIE', 'ELECTRICITE', 'COMMERCE_GENERAL', 'CEREALES_VRAC'].includes(profil.secteur)) return false;
  if (profil.secteur === 'CEREALES_VRAC') {
    return profil.capabilities_effectives.includes('WHOLESALE');
  }
  return profil.capabilities_effectives.includes('WHOLESALE') && ['GROS', 'MIXTE'].includes(profil.mode_vente);
}

export function libelleReferenceTechnique(profil: ProfilSecteur): string {
  return profil?.secteur === 'ELECTRICITE' ? 'Référence électrique' : 'Référence Quincaillerie';
}

export function libelleCaracteristiquesTechniques(profil: ProfilSecteur): string {
  return profil?.secteur === 'ELECTRICITE'
    ? 'Section, puissance, tension, intensité/calibre, couleur et longueur'
    : 'Diamètre, section, longueur, capacité, puissance, tension, calibre et couleur';
}

function parametreReference(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Référence invalide.');
  return { id: String(id) };
}

export function routeReferenceTechnique(profil: ProfilSecteur, id: number) {
  const params = parametreReference(id);
  if (profil?.secteur === 'ELECTRICITE') return { pathname: '/electricite/reference/[id]' as const, params };
  if (profil?.secteur === 'QUINCAILLERIE') return { pathname: '/quincaillerie/reference/[id]' as const, params };
  return { pathname: '/produit/[id]' as const, params };
}

export function routeCaracteristiquesTechniques(profil: ProfilSecteur, id: number) {
  const params = parametreReference(id);
  if (profil?.secteur === 'ELECTRICITE') return { pathname: '/electricite/caracteristiques/[id]' as const, params };
  if (profil?.secteur === 'QUINCAILLERIE') return { pathname: '/quincaillerie/caracteristiques/[id]' as const, params };
  throw new Error('Les caractéristiques techniques ne sont pas proposées pour ce secteur.');
}


export function estVrac(profil: ProfilSecteur): boolean {
  return profil?.secteur === 'CEREALES_VRAC';
}
