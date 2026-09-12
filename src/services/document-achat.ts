import { obtenirAchat, listerLignesAchat } from './achat';
import { obtenirFournisseur } from '../db/repositories/fournisseur';
import { lireParametres } from './parametres';
import { bonDeCommandeHtml } from './pdf';

export async function preparerDocumentAchat(id: number) {
  const achat = await obtenirAchat(id);
  if (!achat) throw new Error('Achat introuvable.');
  const [lignes, fournisseur, parametres] = await Promise.all([
    listerLignesAchat(id),
    achat.fournisseurId ? obtenirFournisseur(achat.fournisseurId) : Promise.resolve(null),
    lireParametres(),
  ]);
  return { html: bonDeCommandeHtml({ achat, lignes, fournisseur, parametres }), nom: `Commande-${achat.numero}` };
}
