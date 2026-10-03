import { obtenirBase } from '../db/database';
import { couleurValide } from '../domain/matrice-habillement';

export interface CouleurCatalogueMode { code: string; nom: string; hex: string | null }
export interface ModeleCatalogueHabillement {
  id: number; nom: string; categorie: string | null; prix: number; image: string | null;
  actif: number; nbVariantes: number; stockVariantes: number;
  couleurs: CouleurCatalogueMode[]; tailles: string[]; recherche: string;
}
const normaliser = (valeur: string): string => valeur.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');

/** Deux lectures pour l'ensemble du catalogue, sans une requête par modèle/variante. */
export async function chargerCatalogueHabillement(): Promise<ModeleCatalogueHabillement[]> {
  const db = await obtenirBase();
  const produits = await db.getAllAsync<{
    id: number; nom: string; categorie: string | null; prix_unitaire: number;
    chemin_image: string | null; code_barre: string | null; actif: number;
  }>('SELECT id,nom,categorie,prix_unitaire,chemin_image,code_barre,actif FROM produit ORDER BY nom COLLATE NOCASE');
  const valeurs = await db.getAllAsync<{
    id: number; produit_id: number; sku: string; code_barre: string | null; stock_actuel: number;
    dimension_code: string | null; valeur_code: string | null; valeur_nom: string | null;
    code_hex: string | null;
  }>(`SELECT vp.id,vp.produit_id,vp.sku,vp.code_barre,vp.stock_actuel,
      vv.dimension_code,vv.valeur_code,vv.valeur_nom,vv.code_hex
    FROM variante_produit vp LEFT JOIN variante_valeur vv ON vv.variante_id=vp.id
    WHERE vp.actif=1 ORDER BY vv.dimension_ordre,vv.valeur_ordre,vv.valeur_nom,vp.id`);
  const parProduit = new Map<number, typeof valeurs>();
  for (const valeur of valeurs) {
    const groupe = parProduit.get(valeur.produit_id) ?? [];
    groupe.push(valeur); parProduit.set(valeur.produit_id, groupe);
  }
  return produits.map((p) => {
    const stock = new Map<number, number>(); const couleurs = new Map<string, CouleurCatalogueMode>();
    const tailles = new Map<string, string>(); const termes = new Set([p.nom, p.categorie ?? '', p.code_barre ?? '']);
    for (const v of parProduit.get(p.id) ?? []) {
      stock.set(v.id, v.stock_actuel);
      termes.add(v.sku); termes.add(v.code_barre ?? ''); termes.add(v.valeur_nom ?? '');
      const dimension = v.dimension_code?.toUpperCase() ?? '';
      if ((dimension === 'COULEUR' || dimension === 'COLOR') && v.valeur_code && v.valeur_nom) {
        couleurs.set(v.valeur_code, { code: v.valeur_code, nom: v.valeur_nom, hex: couleurValide(v.code_hex) });
      }
      if (['TAILLE', 'SIZE', 'POINTURE'].includes(dimension) && v.valeur_code && v.valeur_nom) {
        tailles.set(`${dimension}:${v.valeur_code}`, v.valeur_nom);
      }
    }
    return { id: p.id, nom: p.nom, categorie: p.categorie, prix: p.prix_unitaire,
      image: p.chemin_image, actif: p.actif, nbVariantes: stock.size,
      stockVariantes: [...stock.values()].reduce((total, valeur) => total + valeur, 0),
      couleurs: [...couleurs.values()], tailles: [...tailles.values()], recherche: normaliser([...termes].join(' ')) };
  });
}

export function filtrerCatalogueHabillement(
  modeles: readonly ModeleCatalogueHabillement[], recherche: string, categorie: string | null,
): ModeleCatalogueHabillement[] {
  const termes = normaliser(recherche).trim().split(/\s+/).filter(Boolean);
  return modeles.filter((m) => m.actif === 1 && (categorie === null || m.categorie === categorie)
    && termes.every((q) => m.recherche.includes(q)));
}
