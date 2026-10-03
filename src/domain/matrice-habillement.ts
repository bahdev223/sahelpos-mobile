/** Matrice de déclinaisons : mêmes identités de valeurs que le référentiel synchronisé. */
export const LIMITE_VARIANTES_HABILLEMENT = 240;

export interface OptionModele {
  valeurServeurId: number;
  dimensionId: number;
  dimensionCode: string;
  dimensionNom: string;
  dimensionOrdre: number;
  code: string;
  nom: string;
  codeHex: string | null;
  ordre: number;
}
export interface DimensionModele {
  code: string;
  nom: string;
  ordre: number;
  valeurs: OptionModele[];
}
export interface CombinaisonModele {
  signature: string;
  valeurs: OptionModele[];
}

export function couleurValide(valeur: unknown): string | null {
  return typeof valeur === 'string' && /^#[0-9a-f]{6}$/i.test(valeur) ? valeur : null;
}

export function signatureCombinaison(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join('-');
}

export function preparerMatrice(
  references: readonly DimensionModele[],
  selection: readonly number[],
  articleUnique = false,
): CombinaisonModele[] {
  if (articleUnique) {
    if (selection.length) throw new Error('Un article unique ne peut pas conserver des axes sélectionnés.');
    return [{ signature: '', valeurs: [] }];
  }
  const ids = new Set(selection);
  if (!ids.size) throw new Error('Choisissez les tailles ou les couleurs, ou indiquez un article unique.');
  const toutes = new Map(references.flatMap((d) => d.valeurs.map((v) => [v.valeurServeurId, v] as const)));
  for (const id of ids) {
    if (!Number.isSafeInteger(id) || id <= 0 || !toutes.has(id)) {
      throw new Error('Une valeur sélectionnée ne figure plus dans le référentiel synchronisé.');
    }
  }
  const groupes = [...references]
    .sort((a, b) => a.ordre - b.ordre || a.code.localeCompare(b.code))
    .map((d) => [...new Map(d.valeurs.filter((v) => ids.has(v.valeurServeurId))
      .map((v) => [v.valeurServeurId, v])).values()]
      .sort((a, b) => a.ordre - b.ordre || a.valeurServeurId - b.valeurServeurId))
    .filter((g) => g.length > 0);
  let nombre = 1;
  for (const groupe of groupes) {
    nombre *= groupe.length;
    if (nombre > LIMITE_VARIANTES_HABILLEMENT) {
      throw new Error(`Limitez la sélection à ${LIMITE_VARIANTES_HABILLEMENT} déclinaisons.`);
    }
  }
  let combinaisons: OptionModele[][] = [[]];
  for (const groupe of groupes) {
    combinaisons = combinaisons.flatMap((debut) => groupe.map((v) => [...debut, v]));
  }
  return combinaisons.map((valeurs) => ({
    signature: signatureCombinaison(valeurs.map((v) => v.valeurServeurId)), valeurs,
  }));
}

/** Même priorité que VarianteProduit.prix_vente côté Django. */
export function prixVarianteOuModele(prix: number | null, prixModele: number): number {
  return prix !== null && Number.isFinite(prix) && prix > 0 ? prix : prixModele;
}
