/** Garder les liens historiques sans retomber sur une saisie de produit générique. */
export function destinationProduitHabillement(chemin: string):
  { creation: true } | { id: string; modifier: boolean } | null {
  if (chemin === '/produit/nouveau') return { creation: true };
  const modification = /^\/produit\/modifier\/([^/]+)$/.exec(chemin);
  if (modification) return { id: modification[1], modifier: true };
  const fiche = /^\/produit\/([^/]+)$/.exec(chemin);
  return fiche ? { id: fiche[1], modifier: false } : null;
}
