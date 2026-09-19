import { listerLignes, obtenirVente } from '../db/repositories/vente';
import { factureVenteHtml } from './pdf';
import { lireParametres } from './parametres';

export async function preparerDocumentVente(id: number) {
  const vente = await obtenirVente(id);
  if (!vente) throw new Error('Vente introuvable.');
  const [lignes, parametres] = await Promise.all([
    listerLignes(id),
    lireParametres(),
  ]);
  return { html: factureVenteHtml({ vente, lignes, parametres }), nom: `Facture-${vente.numero}` };
}
