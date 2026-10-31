/**
 * Les regles qui decident quand prevenir le commercant.
 *
 * DEUX REGIMES, ET C'EST VOLONTAIRE
 * ----------------------------------
 * La RUPTURE (stock a zero) sonne immediatement, produit par produit : le
 * vendeur doit l'apprendre pendant qu'il a encore le client devant lui, pas le
 * lendemain.
 *
 * Le SEUIL BAS (stock sous le minimum sans etre a zero) ne sonne pas produit
 * par produit. Une boutique de deux cents references en a couramment trente
 * sous le seuil : trente notifications d'affilee font couper les notifications
 * le jour meme, et le canal est perdu pour toujours. On regroupe donc en un
 * seul message, et on ne le renouvelle qu'une fois par jour.
 *
 * QUAND CES REGLES SONT EVALUEES
 * -------------------------------
 * Apres chaque vente et chaque mouvement de stock — c'est-a-dire au moment ou
 * la quantite change. Jamais sur une minuterie : un logiciel de caisse qui
 * scrute sa base en boucle vide la batterie du telephone d'un commercant qui
 * travaille douze heures par jour.
 */
import { lireTout } from '../../db/repositories/base';
import { seuilAlerteStock } from '../../domain/stock';

import { deposer, retirer } from './journal';

interface LigneStock {
  id: number;
  nom: string;
  quantite_base: number;
  stock_min: number;
  unite_base: string;
}

interface LigneVarianteStock {
  id: number;
  produit_id: number;
  produit_nom: string;
  sku: string;
  libelle: string | null;
  stock_actuel: number;
  stock_min: number;
  unite_base: string;
}

/** `rupture:produit:42` — l'evenement, pas l'instant ou on l'a vu. */
function cleRupture(produitId: number): string {
  return `rupture:produit:${produitId}`;
}

function cleRuptureVariante(varianteId: number): string {
  return `rupture:variante:${varianteId}`;
}

const CLE_SEUIL_GROUPE = 'seuil:groupe';

/** Une fois par jour suffit pour un stock bas : ce n'est pas une urgence. */
const RAPPEL_SEUIL_HEURES = 20;

function quantiteLisible(valeur: number): string {
  return Number.isInteger(valeur) ? String(valeur) : valeur.toFixed(1);
}

/**
 * Reevalue l'etat du stock et met le journal a jour.
 *
 * Renvoie le nombre de notifications NEUVES, c'est-a-dire celles pour
 * lesquelles il faut faire sonner le telephone.
 *
 * `produitsTouches` limite le travail aux produits qui viennent de bouger :
 * relire deux cents lignes apres chaque article scanne ralentirait la caisse.
 * Sans cet argument, tout le stock est reexamine — c'est ce qu'on veut au
 * demarrage de l'application.
 */
export async function evaluerStock(produitsTouches?: number[]): Promise<number> {
  let neuves = 0;

  const filtreProduits = produitsTouches?.length
    ? `AND p.id IN (${produitsTouches.map(() => '?').join(',')})`
    : '';
  const params = produitsTouches?.length ? produitsTouches : [];

  // Une référence possédant des variantes actives est surveillée variante par
  // variante. Son total agrégé ne doit jamais masquer une rupture locale.
  const variantes = await lireTout<LigneVarianteStock>(
    `SELECT vp.id, vp.produit_id, p.nom AS produit_nom, vp.sku,
            vp.stock_actuel, p.stock_min, p.unite_base,
            (SELECT GROUP_CONCAT(valeur_nom, ' / ') FROM (
              SELECT valeur_nom
                FROM variante_valeur
               WHERE variante_id = vp.id
               ORDER BY dimension_ordre, valeur_ordre, valeur_nom
            )) AS libelle
       FROM variante_produit vp
       JOIN produit p ON p.id = vp.produit_id
      WHERE vp.actif = 1 AND p.actif = 1 AND p.gestion_stock = 1 ${filtreProduits}
      ORDER BY p.nom, vp.sku`,
    ...params,
  );
  const produitsAvecVariantes = new Set(variantes.map((v) => v.produit_id));

  // Produits simples uniquement. Les modèles à variantes sont traités au-dessus.
  const simplesTous = await lireTout<LigneStock>(
    `SELECT id, nom, quantite_base, stock_min, unite_base
       FROM produit p
      WHERE actif = 1 AND gestion_stock = 1 ${filtreProduits}`,
    ...params,
  );
  const simples = simplesTous.filter((p) => !produitsAvecVariantes.has(p.id));

  // Ruptures franches : une notification par produit simple ou variante.
  for (const p of simples) {
    if (p.quantite_base <= 0) {
      const nouveau = await deposer({
        cle: cleRupture(p.id),
        genre: 'rupture',
        gravite: 'urgent',
        titre: `${p.nom} est épuisé`,
        corps: "Il n'en reste plus en stock. Pensez à le réapprovisionner.",
        chemin: '/stock/alertes',
        produitId: p.id,
      });
      if (nouveau) neuves += 1;
    } else {
      await retirer(cleRupture(p.id));
    }
  }

  for (const v of variantes) {
    // Nettoie une ancienne alerte agrégée éventuelle après migration vers les
    // variantes, sinon le commerçant verrait deux vérités contradictoires.
    await retirer(cleRupture(v.produit_id));
    const nomVariante = v.libelle || v.sku;
    if (v.stock_actuel <= 0) {
      const nouveau = await deposer({
        cle: cleRuptureVariante(v.id),
        genre: 'rupture',
        gravite: 'urgent',
        titre: `${v.produit_nom} — ${nomVariante} est épuisé`,
        corps: `La variante ${v.sku} est à zéro. Réapprovisionnez cette combinaison exacte.`,
        chemin: '/stock/alertes',
        produitId: v.produit_id,
      });
      if (nouveau) neuves += 1;
    } else {
      await retirer(cleRuptureVariante(v.id));
    }
  }

  // Stock bas groupé sur toute la boutique : produits simples + variantes.
  const simplesBoutique = await lireTout<LigneStock>(
    `SELECT id, nom, quantite_base, stock_min, unite_base
       FROM produit
      WHERE actif = 1 AND gestion_stock = 1 AND quantite_base > 0
      ORDER BY nom`,
  );
  const idsVariantesBoutique = new Set(
    (await lireTout<{ produit_id: number }>(
      `SELECT DISTINCT produit_id FROM variante_produit WHERE actif = 1`,
    )).map((v) => v.produit_id),
  );

  const articlesBas: Array<{
    nom: string;
    quantite: number;
    stockMin: number;
    unite: string;
  }> = simplesBoutique
    .filter((p) => !idsVariantesBoutique.has(p.id))
    .filter((p) => p.quantite_base <= seuilAlerteStock(p.stock_min))
    .map((p) => ({
      nom: p.nom,
      quantite: p.quantite_base,
      stockMin: p.stock_min,
      unite: p.unite_base,
    }));

  const variantesBoutique = produitsTouches?.length
    ? await lireTout<LigneVarianteStock>(
        `SELECT vp.id, vp.produit_id, p.nom AS produit_nom, vp.sku,
                vp.stock_actuel, p.stock_min, p.unite_base,
                (SELECT GROUP_CONCAT(valeur_nom, ' / ') FROM (
                  SELECT valeur_nom FROM variante_valeur
                  WHERE variante_id = vp.id
                  ORDER BY dimension_ordre, valeur_ordre, valeur_nom
                )) AS libelle
           FROM variante_produit vp JOIN produit p ON p.id = vp.produit_id
          WHERE vp.actif = 1 AND p.actif = 1 AND p.gestion_stock = 1
          ORDER BY p.nom, vp.sku`,
      )
    : variantes;

  for (const v of variantesBoutique) {
    if (v.stock_actuel > 0 && v.stock_actuel <= seuilAlerteStock(v.stock_min)) {
      articlesBas.push({
        nom: `${v.produit_nom} — ${v.libelle || v.sku}`,
        quantite: v.stock_actuel,
        stockMin: v.stock_min,
        unite: v.unite_base,
      });
    }
  }

  articlesBas.sort(
    (a, b) =>
      a.quantite / seuilAlerteStock(a.stockMin)
      - b.quantite / seuilAlerteStock(b.stockMin)
      || a.nom.localeCompare(b.nom, 'fr'),
  );

  if (articlesBas.length === 0) {
    await retirer(CLE_SEUIL_GROUPE);
    return neuves;
  }

  const exemples = articlesBas
    .slice(0, 3)
    .map((p) => `${p.nom} (${quantiteLisible(p.quantite)} ${p.unite})`)
    .join(', ');
  const reste = articlesBas.length > 3 ? ` et ${articlesBas.length - 3} autre(s)` : '';

  const nouveau = await deposer({
    cle: CLE_SEUIL_GROUPE,
    genre: 'seuil_groupe',
    gravite: 'attention',
    titre:
      articlesBas.length === 1
        ? '1 article est sous son seuil'
        : `${articlesBas.length} articles sont sous leur seuil`,
    corps: `${exemples}${reste}.`,
    chemin: '/stock/alertes',
  });
  if (nouveau) neuves += 1;

  return neuves;
}

/**
 * Faut-il redeposer l'alerte groupee ?
 *
 * Utilise au demarrage : sans cette borne, ouvrir l'application dix fois dans
 * la journee ferait sonner dix fois le meme message de stock bas.
 */
export function rappelSeuilDu(dernier: string | null): boolean {
  if (!dernier) return true;
  const ecoule = Date.now() - new Date(dernier).getTime();
  return !Number.isNaN(ecoule) && ecoule > RAPPEL_SEUIL_HEURES * 3600000;
}

/**
 * Previent quand l'abonnement approche de son echeance.
 *
 * Sept jours : assez tot pour aller recharger du mobile money, assez tard pour
 * ne pas etre percu comme du harcelement commercial.
 */
export async function evaluerAbonnement(
  expireLe: string | null,
  raison: string,
): Promise<number> {
  if (!expireLe) return 0;
  const fin = new Date(expireLe);
  if (Number.isNaN(fin.getTime())) return 0;

  const jours = Math.ceil((fin.getTime() - Date.now()) / 86400000);
  if (jours > 7) {
    await retirer('abonnement:echeance');
    return 0;
  }

  const nouveau = await deposer({
    cle: 'abonnement:echeance',
    genre: 'abonnement',
    gravite: jours <= 0 ? 'urgent' : 'attention',
    titre:
      jours <= 0
        ? 'Votre abonnement a expire'
        : `Votre abonnement expire dans ${jours} jour(s)`,
    // On n'affiche NI prix NI lien de paiement : l'application ne demarche
    // pas, c'est ce qui la garde en regle avec les magasins d'applications.
    corps: raison || 'Renouvelez-le pour continuer a encaisser.',
    chemin: '/abonnement',
  });
  return nouveau ? 1 : 0;
}
