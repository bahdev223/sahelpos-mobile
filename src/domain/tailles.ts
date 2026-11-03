/**
 * Ordre naturel des tailles.
 *
 * Les gabarits du serveur ne numerotent pas tous les tailles de la meme facon
 * (XS a 0 dans un gabarit, S a 1 dans un autre) : trier sur `ordre` donnait
 * « S, XS, M ». On trie donc sur le rang connu de la taille, puis sur le nombre
 * pour les tailles numeriques (38, 40, 42), et seulement ensuite sur l'ordre
 * recu du serveur.
 */
const RANG_ALPHA = ['XXXS', '3XS', 'XXS', '2XS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL', '6XL'];
const EQUIVALENTS: Record<string, number> = { '3XS': 0, XXXS: 0, '2XS': 2, XXS: 2, XXL: 9, '2XL': 9, XXXL: 11, '3XL': 11 };

export function rangTaille(nom: string | null | undefined): number | null {
  const n = (nom ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!n) return null;
  if (n in EQUIVALENTS) return EQUIVALENTS[n];
  const i = RANG_ALPHA.indexOf(n);
  if (i >= 0) return i;
  const nombre = Number(n.replace(',', '.'));
  return Number.isFinite(nombre) ? 100 + nombre : null;
}

export function estDimensionTaille(code: string | null | undefined): boolean {
  const c = (code ?? '').toUpperCase();
  return c.includes('TAILLE') || c.includes('SIZE') || c.includes('POINTURE');
}

/** Compare deux noms de tailles ; les tailles inconnues restent apres, dans l'ordre recu. */
export function comparerTailles(a: string, b: string): number {
  const ra = rangTaille(a);
  const rb = rangTaille(b);
  if (ra !== null && rb !== null) return ra - rb;
  if (ra !== null) return -1;
  if (rb !== null) return 1;
  return 0;
}

interface ValeurTriable { dimensionCode: string; dimensionOrdre: number; nom: string; ordre: number }

/** Compare deux variantes valeur par valeur, dans l'ordre des dimensions. */
export function comparerValeursVariantes(a: ValeurTriable[], b: ValeurTriable[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const va = a[i];
    const vb = b[i];
    if (!va || !vb) return va ? 1 : vb ? -1 : 0;
    const taille = estDimensionTaille(va.dimensionCode) && estDimensionTaille(vb.dimensionCode)
      ? comparerTailles(va.nom, vb.nom) : 0;
    const diff = taille || va.ordre - vb.ordre || va.nom.localeCompare(vb.nom, 'fr');
    if (diff) return diff;
  }
  return 0;
}
