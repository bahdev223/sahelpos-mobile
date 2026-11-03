/**
 * Libelle affiche d'une unite.
 *
 * Le serveur stocke des codes sans accent (« Piece », « Unite ») : ils restent
 * tels quels dans les donnees, seul l'affichage est corrige et accorde.
 */
const LIBELLES: Record<string, [string, string]> = {
  piece: ['pièce', 'pièces'],
  pieces: ['pièce', 'pièces'],
  unite: ['unité', 'unités'],
  unites: ['unité', 'unités'],
};

export function libelleUnite(unite: string | null | undefined, quantite = 1): string {
  const brut = (unite ?? '').trim();
  const cle = brut.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const connu = LIBELLES[cle];
  if (!connu) return brut;
  return Math.abs(quantite) > 1 ? connu[1] : connu[0];
}
