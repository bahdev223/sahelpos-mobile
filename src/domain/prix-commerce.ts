/** Le prix propre d'une variante est exprimé dans l'unité de base du modèle. */
export function prixDetailVariante(prixUnite: number, facteur: number, prixOverride?: number | null): number {
  if (!Number.isFinite(prixUnite) || prixUnite < 0 || !Number.isFinite(facteur) || facteur <= 0) {
    throw new Error('Prix ou conditionnement invalide.');
  }
  if (prixOverride != null && (!Number.isFinite(prixOverride) || prixOverride < 0)) {
    throw new Error('Le prix de cette variante est invalide.');
  }
  const prix = prixOverride != null && prixOverride > 0 ? prixOverride * facteur : prixUnite;
  if (!Number.isFinite(prix) || prix > Number.MAX_SAFE_INTEGER) throw new Error('Le prix dépasse la précision autorisée.');
  return Math.round(prix);
}

export interface ArticleTarifCommerce {
  produit: { id: number };
  variante?: { id: number } | null;
  unite: string;
  facteur: number;
  prixUnitaire: number;
}

/** Même référence mais prix ou conditionnement différent = deux lignes distinctes. */
export function cleArticleCommerce(article: ArticleTarifCommerce): string {
  return JSON.stringify([
    article.produit.id, article.variante?.id ?? null,
    article.unite, article.facteur, article.prixUnitaire,
  ]);
}
