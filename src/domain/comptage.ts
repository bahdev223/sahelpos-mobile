/** Une saisie vide est un comptage manquant, jamais un stock nul. */
export function lireStockCompte(texte: string): number | null {
  const valeur = texte.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,3})?$/.test(valeur)) return null;
  const nombre = Number(valeur);
  return Number.isFinite(nombre) ? nombre : null;
}
