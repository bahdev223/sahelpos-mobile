import type { VarianteProduitLocale } from '../domain/habillement';
import type { ArticlePanier } from './vente';
import type { ModeleHabillementMobile } from './catalogueHabillement';

export interface DescriptionVariante {
  couleur: string | null;
  couleurHex: string | null;
  taille: string | null;
}

export interface ResultatAjoutVariante {
  ok: boolean;
  panier: ArticlePanier[];
  erreur: string;
}

export function decrireVariante(variante: VarianteProduitLocale): DescriptionVariante {
  let couleur: string | null = null;
  let couleurHex: string | null = null;
  let taille: string | null = null;

  for (const valeur of variante.valeurs) {
    const code = valeur.dimensionCode.toUpperCase();
    const nom = valeur.dimensionNom.toLowerCase();
    if (code === 'COULEUR' || nom.includes('couleur')) {
      couleur = valeur.nom;
      couleurHex = valeur.codeHex;
      continue;
    }
    if (
      code === 'TAILLE' ||
      code === 'POINTURE' ||
      nom.includes('taille') ||
      nom.includes('pointure')
    ) {
      taille = valeur.nom;
    }
  }

  return { couleur, couleurHex, taille };
}

export function nomVariante(variante: VarianteProduitLocale): string {
  const description = decrireVariante(variante);
  const morceaux = [description.couleur, description.taille].filter(Boolean);
  return morceaux.length ? morceaux.join(' / ') : variante.sku;
}

export function ajouterVariantePanier(
  panier: ArticlePanier[],
  modele: ModeleHabillementMobile,
  variante: VarianteProduitLocale,
  quantite: number,
): ResultatAjoutVariante {
  const refuser = (erreur: string): ResultatAjoutVariante => ({
    ok: false,
    panier,
    erreur,
  });

  if (!Number.isSafeInteger(quantite) || quantite <= 0) {
    return refuser('La quantité doit être un entier positif.');
  }
  if (!variante.actif) {
    return refuser('Cette déclinaison n’est plus active.');
  }

  const index = panier.findIndex(
    (ligne) => ligne.variante?.idLocal === variante.idLocal,
  );
  const deja = index >= 0 ? panier[index].quantite : 0;
  const total = deja + quantite;
  if (modele.produit.gestionStock && total > variante.stockDisponible) {
    const restant = Math.max(0, variante.stockDisponible - deja);
    return refuser(
      `Stock insuffisant : ${restant} pièce(s) encore disponible(s) pour ${nomVariante(variante)}.`,
    );
  }

  const prix = Math.round(variante.prixOverride ?? modele.produit.prixUnitaire);
  if (!Number.isFinite(prix) || prix < 0) {
    return refuser('Le prix de vente de cette déclinaison est invalide.');
  }

  const article: ArticlePanier = {
    produit: modele.produit,
    variante: {
      idLocal: variante.idLocal,
      sku: variante.sku,
      nom: nomVariante(variante),
      stockDisponible: variante.stockDisponible,
      prixAchat: variante.prixAchat,
    },
    unite: modele.produit.uniteBase,
    facteur: 1,
    quantite,
    prixUnitaire: prix,
  };

  if (index < 0) {
    return { ok: true, panier: [...panier, article], erreur: '' };
  }

  return {
    ok: true,
    erreur: '',
    panier: panier.map((ligne, i) =>
      i === index ? { ...ligne, quantite: total } : ligne,
    ),
  };
}
