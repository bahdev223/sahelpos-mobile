export type DimensionCodeMode = 'TAILLE' | 'POINTURE';
export type GenreMode = 'H' | 'F' | 'E' | 'M';

export interface BaseSyncHabillement {
  id_local: string;
  date_modification: string;
  supprime_le?: string | null;
}

export interface SchemaTailleSync extends BaseSyncHabillement {
  nom: string;
  dimension_code: DimensionCodeMode;
  est_systeme: boolean | number;
}

export interface ValeurSchemaTailleSync extends BaseSyncHabillement {
  schema_id_local: string;
  valeur: string;
  ordre: number;
}

export interface CategorieModeSync extends BaseSyncHabillement {
  nom: string;
  genre: GenreMode;
  est_systeme: boolean | number;
  utilise_couleur: boolean | number;
  utilise_taille: boolean | number;
  schema_taille_defaut_id_local?: string | null;
}

export interface CouleurModeSync extends BaseSyncHabillement {
  nom: string;
  hex_code: string;
  est_systeme: boolean | number;
  actif: boolean | number;
}

export interface NomReferentielSync extends BaseSyncHabillement {
  nom: string;
}

export type ReferentielHabillementType =
  | 'schema_taille'
  | 'valeur_schema_taille'
  | 'categorie_mode'
  | 'couleur_mode'
  | 'marque'
  | 'saison'
  | 'collection';

export type ReferentielHabillementPayload =
  | SchemaTailleSync
  | ValeurSchemaTailleSync
  | CategorieModeSync
  | CouleurModeSync
  | NomReferentielSync;

export interface ProduitHabillementSync extends BaseSyncHabillement {
  produit_id_local: string;
  categorie_mode_id_local?: string | null;
  marque_id_local?: string | null;
  saison_id_local?: string | null;
  collection_id_local?: string | null;
  schema_taille_id_local?: string | null;
  fournisseur_id_local?: string | null;
}

export interface DimensionVarianteSync extends BaseSyncHabillement {
  code: string;
  nom: string;
  ordre: number;
}

export interface ValeurDimensionSync extends BaseSyncHabillement {
  dimension_id_local: string;
  code: string;
  nom: string;
  ordre: number;
  code_hex?: string | null;
}

export interface VarianteProduitSync extends BaseSyncHabillement {
  produit_id_local: string;
  sku: string;
  signature_combinaison: string;
  prix_override?: number | string | null;
  prix_achat?: number | string | null;
  code_barre?: string | null;
  actif: boolean | number;
  valeurs_id_local: string[];
}

export interface ValeurVarianteLocale {
  idLocal: string;
  dimensionIdLocal: string;
  dimensionCode: string;
  dimensionNom: string;
  code: string;
  nom: string;
  ordre: number;
  codeHex: string | null;
}

export interface VarianteProduitLocale {
  id: number;
  idLocal: string;
  produitId: number;
  sku: string;
  signatureCombinaison: string;
  prixOverride: number | null;
  prixAchat: number | null;
  codeBarre: string | null;
  actif: boolean;
  valeurs: ValeurVarianteLocale[];
}
