/**
 * Mise en page du recu de vente.
 *
 * Separee de l'envoi Bluetooth : on peut verifier le rendu avec `apercu()`
 * sans imprimante branchee.
 */
import type { LigneVente, Vente } from '../../domain/types';

import { formaterMontant, LargeurPapier, Ticket } from './escpos';

export interface EnteteBoutique {
  nom: string;
  adresse?: string;
  telephone?: string;
  piedDePage?: string;
}

const LIBELLE_PAIEMENT: Record<string, string> = {
  especes: 'Especes',
  mobile_money: 'Mobile Money',
  credit: 'Credit',
};

export function construireRecu(
  vente: Vente,
  lignes: LigneVente[],
  boutique: EnteteBoutique,
  papier: LargeurPapier = '58mm',
): Ticket {
  const t = new Ticket(papier);

  t.titre(boutique.nom.toUpperCase());
  if (boutique.adresse) t.commande([0x1b, 0x61, 1]).ligne(boutique.adresse);
  if (boutique.telephone) t.ligne('Tel : ' + boutique.telephone);
  t.commande([0x1b, 0x61, 0]);

  t.separateur('=');
  t.ligneDouble('Recu', vente.numero);
  t.ligne(formaterDate(vente.dateVente));
  t.separateur('-');

  for (const l of lignes) {
    // Le libelle occupe sa ligne : sur 32 caracteres, l'ecraser avec le prix
    // rendrait les noms de produits illisibles.
    t.ligne(l.libelle);
    const detail = `  ${formaterQuantite(l.quantite)} ${l.unite} x ${formaterMontant(l.prixUnitaire)}`;
    t.ligneDouble(detail, formaterMontant(l.total));
  }

  t.separateur('-');
  t.ligneLarge('TOTAL', formaterMontant(vente.total));

  const paiement = LIBELLE_PAIEMENT[vente.modePaiement] ?? vente.modePaiement;
  t.ligneDouble('Paye (' + paiement + ')', formaterMontant(vente.montantPaye));

  const reste = Math.round(vente.total - vente.montantPaye);
  if (reste > 0) {
    t.ligneDouble('Reste a payer', formaterMontant(reste));
  } else if (reste < 0) {
    t.ligneDouble('Monnaie rendue', formaterMontant(-reste));
  }

  t.separateur('=');
  t.commande([0x1b, 0x61, 1]);
  t.ligne(boutique.piedDePage ?? 'Merci de votre visite');
  t.commande([0x1b, 0x61, 0]);

  return t.couper();
}

function formaterDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const deux = (n: number) => String(n).padStart(2, '0');
  return (
    `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${deux(d.getHours())}:${deux(d.getMinutes())}`
  );
}

/** 3 et non "3.00" ; 1.5 reste 1.5 pour les ventes au poids. */
function formaterQuantite(q: number): string {
  return Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3)));
}
