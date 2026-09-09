export const SEUIL_ALERTE_STOCK_DEFAUT = 10;

export function seuilAlerteStock(stockMin: number | null | undefined): number {
  const valeur = Number(stockMin ?? 0);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : SEUIL_ALERTE_STOCK_DEFAUT;
}
