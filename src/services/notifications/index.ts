/**
 * Point d'entree unique des notifications.
 *
 * Les ecrans et les services n'appellent que ce fichier : ils n'ont pas a
 * savoir s'il existe un journal, des regles ou une couche systeme. Une seule
 * fonction compte pour eux — `verifierStock()` — appelee apres tout ce qui
 * fait bouger une quantite.
 *
 * ORDRE VOULU : on ecrit D'ABORD dans le journal, on fait sonner ENSUITE.
 * Si le telephone refuse les notifications, l'information n'est pas perdue :
 * la cloche dans l'application la porte quand meme. L'inverse — sonner puis
 * enregistrer — perdrait l'evenement a la premiere erreur.
 */
import { aSonner, compterNonLues, marquerSonnee } from './journal';
import { evaluerAbonnement, evaluerStock } from './regles';
import { poserPastille, preparer, sonner } from './systeme';

export * from './journal';
export { evaluerAbonnement, evaluerStock } from './regles';
export { preparer } from './systeme';

/**
 * Fait sortir vers le systeme tout ce qui n'a pas encore sonne.
 *
 * Une notification n'est marquee « sonnee » que si le telephone l'a REELLEMENT
 * affichee. Autorisation refusee aujourd'hui, accordee demain : l'avis
 * ressortira, au lieu d'avoir ete consomme dans le vide.
 */
async function ecouler(): Promise<number> {
  const attente = await aSonner();
  if (attente.length === 0) {
    await poserPastille(await compterNonLues());
    return 0;
  }

  const autorise = await preparer();
  let sorties = 0;

  if (autorise) {
    for (const avis of attente) {
      const affichee = await sonner({
        titre: avis.titre,
        corps: avis.corps,
        gravite: avis.gravite,
        chemin: avis.chemin,
      });
      if (affichee) {
        await marquerSonnee(avis.cle);
        sorties += 1;
      }
    }
  }

  await poserPastille(await compterNonLues());
  return sorties;
}

/**
 * A appeler apres une vente, une entree, une sortie, un inventaire.
 *
 * `produitsTouches` limite l'examen aux produits qui viennent de bouger :
 * relire deux cents lignes apres chaque article scanne ralentirait la caisse.
 * Sans argument, tout le stock est reexamine — c'est ce qu'on veut au
 * demarrage.
 *
 * NE LEVE JAMAIS. Une notification ratee ne doit pas faire echouer une vente
 * deja encaissee : l'argent est dans le tiroir, la vente est en base, le reste
 * est du confort.
 */
export async function verifierStock(produitsTouches?: number[]): Promise<void> {
  try {
    await evaluerStock(produitsTouches);
    await ecouler();
  } catch {
    // Silence volontaire : voir ci-dessus.
  }
}

/** Meme contrat, pour l'echeance de l'abonnement. */
export async function verifierAbonnement(
  expireLe: string | null,
  raison: string,
): Promise<void> {
  try {
    await evaluerAbonnement(expireLe, raison);
    await ecouler();
  } catch {
    // Silence volontaire.
  }
}

/** Recale la pastille apres une lecture dans l'application. */
export async function rafraichirPastille(): Promise<void> {
  try {
    await poserPastille(await compterNonLues());
  } catch {
    // Sans consequence.
  }
}
