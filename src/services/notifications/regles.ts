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

/** `rupture:produit:42` — l'evenement, pas l'instant ou on l'a vu. */
function cleRupture(produitId: number): string {
  return `rupture:produit:${produitId}`;
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

  // --- ruptures franches, produit par produit ------------------------------
  const cible = produitsTouches?.length
    ? `AND id IN (${produitsTouches.map(() => '?').join(',')})`
    : '';
  const params = produitsTouches?.length ? produitsTouches : [];

  const suivis = await lireTout<LigneStock>(
    `SELECT id, nom, quantite_base, stock_min, unite_base
       FROM produit
      WHERE actif = 1 AND gestion_stock = 1 ${cible}`,
    ...params,
  );

  for (const p of suivis) {
    if (p.quantite_base <= 0) {
      const nouveau = await deposer({
        cle: cleRupture(p.id),
        genre: 'rupture',
        gravite: 'urgent',
        titre: `${p.nom} est epuise`,
        corps: "Il n'en reste plus en stock. Pensez a le commander.",
        chemin: '/stock/alertes',
        produitId: p.id,
      });
      if (nouveau) neuves += 1;
    } else {
      // Reapprovisionne : garder « epuise » alors que le produit est revenu
      // ferait douter de toutes les autres notifications.
      await retirer(cleRupture(p.id));
    }
  }

  // --- stock bas, regroupe -------------------------------------------------
  //
  // Toujours calcule sur la boutique entiere, meme quand un seul produit a
  // bouge : le message annonce un TOTAL, il serait faux s'il ne comptait que
  // les produits scannes a l'instant.
  const bas = await lireTout<LigneStock>(
    `SELECT id, nom, quantite_base, stock_min, unite_base
       FROM produit
      WHERE actif = 1 AND gestion_stock = 1
        AND quantite_base > 0
      ORDER BY nom`,
  );
  const produitsBas = bas
    .filter((p) => p.quantite_base <= seuilAlerteStock(p.stock_min))
    .sort(
      (a, b) =>
        a.quantite_base / seuilAlerteStock(a.stock_min) -
          b.quantite_base / seuilAlerteStock(b.stock_min) ||
        a.nom.localeCompare(b.nom, 'fr'),
    );

  if (produitsBas.length === 0) {
    await retirer(CLE_SEUIL_GROUPE);
    return neuves;
  }

  const exemples = produitsBas
    .slice(0, 3)
    .map((p) => `${p.nom} (${quantiteLisible(p.quantite_base)} ${p.unite_base})`)
    .join(', ');
  const reste = produitsBas.length > 3 ? ` et ${produitsBas.length - 3} autre(s)` : '';

  const nouveau = await deposer({
    cle: CLE_SEUIL_GROUPE,
    genre: 'seuil_groupe',
    gravite: 'attention',
    titre:
      produitsBas.length === 1
        ? '1 produit est sous son seuil'
        : `${produitsBas.length} produits sont sous leur seuil`,
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
