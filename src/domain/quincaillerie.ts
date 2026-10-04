export function prixConditionnement(
  prixBase: number,
  prixConditionnement: number | null | undefined,
  facteur: number,
): number {
  if (!Number.isFinite(prixBase) || prixBase < 0 || !Number.isFinite(facteur) || facteur <= 0) {
    throw new Error('Tarif ou facteur invalide.');
  }
  const propre = prixConditionnement ?? 0;
  if (!Number.isFinite(propre) || propre < 0) throw new Error('Tarif conditionnement invalide.');
  return propre > 0 ? Math.round(propre) : Math.round(prixBase * facteur);
}

export function prixGrosConditionnement(
  prixGrosBase: number,
  prixGrosConditionnement: number | null | undefined,
  facteur: number,
): number {
  if (!Number.isFinite(prixGrosBase) || prixGrosBase < 0 || !Number.isFinite(facteur) || facteur <= 0) {
    throw new Error('Tarif gros ou facteur invalide.');
  }
  const propre = prixGrosConditionnement ?? 0;
  if (!Number.isFinite(propre) || propre < 0) throw new Error('Tarif gros conditionnement invalide.');
  if (propre > 0) return Math.round(propre);
  return prixGrosBase > 0 ? Math.round(prixGrosBase * facteur) : 0;
}
