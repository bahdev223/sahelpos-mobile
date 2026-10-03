export const SECTEURS_COMMERCE = [
  { code: 'ALIMENTATION', titre: 'Alimentation', icone: 'caisse' },
  { code: 'HABILLEMENT', titre: 'Habillement', icone: 'etiquette' },
  { code: 'FRIPERIE', titre: 'Friperie', icone: 'achats' },
  { code: 'ELECTRONIQUE', titre: 'Electronique', icone: 'reseau' },
  { code: 'QUINCAILLERIE', titre: 'Quincaillerie', icone: 'stock' },
  { code: 'COSMETIQUE', titre: 'Cosmetique', icone: 'image' },
  { code: 'PIECES_DETACHEES', titre: 'Pieces detachees', icone: 'mouvements' },
  { code: 'COMMERCE_GENERAL', titre: 'Commerce general', icone: 'boutique' },
  { code: 'AUTRE', titre: 'Autre', icone: 'catalogue' },
] as const;

export const MODES_VENTE = [
  { code: 'DETAIL', titre: 'Detail' },
  { code: 'GROS', titre: 'Gros' },
  { code: 'MIXTE', titre: 'Detail et gros' },
] as const;

export const MODES_APPROVISIONNEMENT = [
  { code: 'CLASSIQUE', titre: 'Achats classiques' },
  { code: 'LOTS_ARRIVAGES', titre: 'Lots et arrivages' },
  { code: 'IMPORTATION', titre: 'Importation' },
  { code: 'MIXTE', titre: 'Plusieurs methodes' },
] as const;

export type SecteurCommerce = typeof SECTEURS_COMMERCE[number]['code'];
export type ModeVenteCommerce = typeof MODES_VENTE[number]['code'];
export type ModeApprovisionnementCommerce = typeof MODES_APPROVISIONNEMENT[number]['code'];

const CAPABILITIES_MOBILE = new Set([
  'STOCK_SIMPLE', 'MULTI_UNIT', 'BARCODE', 'PRODUCT_IMAGES', 'INVENTORY', 'LOW_STOCK_ALERT',
  'PRODUCT_VARIANTS', 'SIZE_DIMENSION', 'COLOR_DIMENSION', 'VARIANT_EXCHANGE',
]);

export interface ProfilCommerceMobile {
  version: 1;
  secteur: SecteurCommerce;
  secteur_libelle: string;
  mode_vente: ModeVenteCommerce;
  mode_approvisionnement: ModeApprovisionnementCommerce;
  mode_catalogue: 'SIMPLE' | 'ADVANCED';
  capabilities_effectives: string[];
  capabilities_non_supportees: string[];
  compatible: boolean;
  raison: string;
}

const listeCodes = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(code => typeof code === 'string');

/** Appele uniquement apres verification de la signature de la licence. */
export function lireProfilCommerce(value: unknown): ProfilCommerceMobile | null {
  if (!value || typeof value !== 'object') return null;
  const profil = value as Record<string, unknown>;
  if (profil.version !== 1
    || !SECTEURS_COMMERCE.some(item => item.code === profil.secteur)
    || !MODES_VENTE.some(item => item.code === profil.mode_vente)
    || !MODES_APPROVISIONNEMENT.some(item => item.code === profil.mode_approvisionnement)
    || !['SIMPLE', 'ADVANCED'].includes(String(profil.mode_catalogue))
    || !listeCodes(profil.capabilities_effectives)
    || !listeCodes(profil.capabilities_non_supportees)
    || typeof profil.compatible !== 'boolean') return null;

  // Le serveur peut evoluer avant cet APK : il ne peut pas lui donner une
  // capacite que cette version ne sait pas encore encoder dans la synchro.
  const compatible = profil.compatible && profil.mode_catalogue === 'SIMPLE'
    && profil.capabilities_non_supportees.length === 0
    && profil.capabilities_effectives.every(code => CAPABILITIES_MOBILE.has(code));
  return {
    version: 1,
    secteur: profil.secteur as SecteurCommerce,
    secteur_libelle: typeof profil.secteur_libelle === 'string'
      ? profil.secteur_libelle : String(profil.secteur),
    mode_vente: profil.mode_vente as ModeVenteCommerce,
    mode_approvisionnement: profil.mode_approvisionnement as ModeApprovisionnementCommerce,
    mode_catalogue: profil.mode_catalogue as 'SIMPLE' | 'ADVANCED',
    capabilities_effectives: profil.capabilities_effectives,
    capabilities_non_supportees: profil.capabilities_non_supportees,
    compatible,
    raison: compatible ? '' : (typeof profil.raison === 'string' && profil.raison
      ? profil.raison : 'Consultation uniquement : ce profil exige des fonctions disponibles sur le Web, pas sur cette version mobile.'),
  };
}


export interface LibellesProfilMobile {
  accueil: string;
  caisse: string;
  catalogue: string;
  achats: string;
  stock: string;
  produits: string;
  produit: string;
  nouveauProduit: string;
  inventaire: string;
  categories: string;
}

export interface ProfilUIMobile {
  code: SecteurCommerce;
  nom: string;
  libelles: LibellesProfilMobile;
  /** Capacites qui modifient reellement le comportement de cette UI. */
  capabilities: string[];
}

const LIBELLES_STANDARD: LibellesProfilMobile = {
  accueil: 'Accueil',
  caisse: 'Caisse',
  catalogue: 'Catalogue',
  achats: 'Achats',
  stock: 'Stock',
  produits: 'Produits',
  produit: 'Produit',
  nouveauProduit: 'Nouveau produit',
  inventaire: 'Inventaire',
  categories: 'Categories',
};

const PROFILS_UI_MOBILE: Partial<Record<SecteurCommerce, Omit<ProfilUIMobile, 'code'>>> = {
  HABILLEMENT: {
    nom: 'Pret-a-porter & Habillement',
    libelles: {
      ...LIBELLES_STANDARD,
      catalogue: 'Modeles',
      achats: 'Appro.',
      stock: 'Stock',
      produits: 'Modeles',
      produit: 'Modele',
      nouveauProduit: 'Nouveau modele',
      inventaire: 'Inventaire',
      categories: 'Collections',
    },
    capabilities: ['PRODUCT_IMAGES', 'BARCODE', 'INVENTORY', 'LOW_STOCK_ALERT'],
  },
  FRIPERIE: {
    nom: 'Friperie',
    libelles: {
      ...LIBELLES_STANDARD,
      catalogue: 'Articles',
      achats: 'Arrivages',
      produits: 'Articles',
      produit: 'Article',
      nouveauProduit: 'Nouvel article',
      categories: 'Lots / categories',
    },
    capabilities: ['PRODUCT_IMAGES', 'INVENTORY', 'LOW_STOCK_ALERT'],
  },
  ELECTRONIQUE: {
    nom: 'Electronique',
    libelles: {
      ...LIBELLES_STANDARD,
      catalogue: 'Articles',
      produits: 'Articles',
      produit: 'Article',
      nouveauProduit: 'Nouvel article',
    },
    capabilities: ['BARCODE', 'PRODUCT_IMAGES', 'INVENTORY', 'LOW_STOCK_ALERT'],
  },
};

export function resoudreProfilUIMobile(
  profil: ProfilCommerceMobile | null | undefined,
): ProfilUIMobile {
  const code = profil?.secteur ?? 'COMMERCE_GENERAL';
  const specifique = PROFILS_UI_MOBILE[code];
  if (specifique) {
    return { code, ...specifique };
  }
  return {
    code,
    nom: profil?.secteur_libelle || SECTEURS_COMMERCE.find(item => item.code === code)?.titre || 'Commerce',
    libelles: LIBELLES_STANDARD,
    capabilities: profil?.capabilities_effectives ?? [],
  };
}

export function capabilityCommerceActive(
  profil: ProfilCommerceMobile | null | undefined,
  code: string,
): boolean {
  return !!profil?.capabilities_effectives.includes(code);
}

export function profilNecessiteWeb(
  profil: ProfilCommerceMobile | null | undefined,
): boolean {
  return !!profil && !profil.compatible;
}
