import type { VarianteMobile } from '../db/repositories/variante';

export function filtrerVariantes(
  variantes: VarianteMobile[], filtres: Record<string, string>, recherche = '',
): VarianteMobile[] {
  const normaliser = (texte: string) => texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const terme = normaliser(recherche.trim());
  return variantes.filter(variante => Object.entries(filtres).every(([dimension, code]) =>
    !code || variante.valeurs.some(valeur => valeur.dimensionCode === dimension && valeur.code === code))
    && (!terme || normaliser([variante.sku, ...variante.valeurs.map(v => v.nom)].join(' ')).includes(terme)));
}
