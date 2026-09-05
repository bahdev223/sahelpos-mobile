/**
 * Documents PDF : bon de commande fournisseur et catalogue des produits.
 *
 * POURQUOI DU PDF ET PAS UN TICKET IMPRIME
 * ----------------------------------------
 * Le ticket ESC/POS sert au client, au comptoir, sur 58 mm de papier. Une
 * commande part chez un fournisseur qui n'est pas dans la boutique : elle doit
 * voyager par WhatsApp, se lire sur un ecran de telephone, et rester lisible
 * une fois imprimee sur du A4. Ce sont deux besoins differents, d'ou deux
 * chemins de sortie distincts.
 *
 * POURQUOI DU HTML
 * ----------------
 * `expo-print` transforme du HTML en PDF avec le moteur de rendu du systeme.
 * Ecrire la mise en page en HTML evite d'embarquer une bibliotheque de dessin
 * et laisse le tableau se repaginer tout seul quand la commande est longue.
 *
 * SECURITE DU RENDU : tout texte venant de la base (nom de produit, de
 * fournisseur, note) traverse `echapper()`. Un nom contenant `<` ou `&` casserait
 * la page sans cela — et un commercant colle parfois n'importe quoi dans un
 * libelle.
 */
import * as Impression from 'expo-print';
import * as Partage from 'expo-sharing';

import type { AchatResume, LigneAchat } from './achat';
import type { Fournisseur } from '../db/repositories/fournisseur';
import type { Parametres } from './parametres';

/**
 * Montants en francs entiers, groupes par milliers.
 *
 * Volontairement recopie plutot qu'importe de la couche d'interface : un
 * service ne doit pas dependre des composants d'ecran, sans quoi il devient
 * impossible de generer un document ailleurs qu'a l'ecran.
 */
function montant(valeur: number, devise: string): string {
  const entier = Math.round(valeur);
  const groupe = String(entier).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${groupe} ${devise}`;
}

function quantite(valeur: number): string {
  return Number.isInteger(valeur) ? String(valeur) : String(valeur);
}

function echapper(texte: string | null | undefined): string {
  if (!texte) return '';
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `2026-09-03T18:23:00.000Z` -> `03/09/2026`. */
function dateCourte(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${jj}/${mm}/${d.getFullYear()}`;
}

/**
 * Feuille de style commune aux deux documents.
 *
 * Les couleurs sont celles de la marque. Le `@page` a 14 mm de marge parce que
 * la plupart des imprimantes de quartier ne savent pas imprimer a moins d'un
 * centimetre du bord et rognent silencieusement le tableau.
 */
const STYLE = `
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #1e293b;
    font-size: 12px;
    margin: 0;
  }
  .entete { display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 3px solid #004a8d; padding-bottom: 10px; margin-bottom: 18px; }
  .boutique { font-size: 20px; font-weight: 700; color: #004a8d; margin: 0 0 4px; }
  .boutique-ligne { color: #64748b; font-size: 11px; margin: 1px 0; }
  .doc-titre { font-size: 16px; font-weight: 700; text-align: right; margin: 0; }
  .doc-numero { color: #64748b; font-size: 11px; text-align: right; margin: 3px 0 0; }
  .blocs { display: flex; gap: 14px; margin-bottom: 16px; }
  .bloc { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 9px 11px; }
  .bloc-titre { font-size: 9px; letter-spacing: .6px; color: #64748b;
                text-transform: uppercase; margin: 0 0 5px; font-weight: 700; }
  .bloc-nom { font-weight: 700; font-size: 13px; margin: 0 0 2px; }
  .bloc-ligne { color: #475569; margin: 1px 0; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #004a8d; color: #fff; text-align: left; padding: 7px 9px;
       font-size: 10px; letter-spacing: .4px; text-transform: uppercase; }
  td { padding: 7px 9px; border-bottom: 1px solid #e2e8f0; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .totaux { margin-top: 14px; margin-left: auto; width: 46%; }
  .totaux td { border: none; padding: 4px 9px; }
  .total-fort td { border-top: 2px solid #004a8d; font-size: 15px;
                   font-weight: 700; color: #004a8d; padding-top: 8px; }
  .note { margin-top: 18px; border-left: 3px solid #ff9900; background: #fff4e0;
          padding: 9px 11px; border-radius: 0 6px 6px 0; font-size: 11px; }
  .pied { margin-top: 26px; border-top: 1px solid #e2e8f0; padding-top: 8px;
          color: #94a3b8; font-size: 10px; display: flex; justify-content: space-between; }
  .vide { text-align: center; color: #94a3b8; padding: 26px; font-style: italic; }
`;

function enteteHtml(p: Parametres, titre: string, sousTitre: string): string {
  const lignes = [p.boutiqueAdresse, p.boutiqueTelephone]
    .filter((v) => v && v.trim())
    .map((v) => `<p class="boutique-ligne">${echapper(v)}</p>`)
    .join('');
  return `
    <div class="entete">
      <div>
        <p class="boutique">${echapper(p.boutiqueNom)}</p>
        ${lignes}
      </div>
      <div>
        <p class="doc-titre">${echapper(titre)}</p>
        <p class="doc-numero">${echapper(sousTitre)}</p>
      </div>
    </div>`;
}

function piedHtml(p: Parametres, mention: string): string {
  return `<div class="pied"><span>${echapper(p.boutiqueNom)}</span><span>${echapper(
    mention,
  )}</span></div>`;
}

function page(corps: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${STYLE}</style></head><body>${corps}</body></html>`;
}

// --- bon de commande fournisseur -------------------------------------------

export interface DonneesBonCommande {
  achat: AchatResume;
  lignes: LigneAchat[];
  fournisseur: Fournisseur | null;
  parametres: Parametres;
}

/**
 * Le document qu'on envoie au fournisseur pour lui dire quoi livrer.
 *
 * On y met le RESTE A PAYER en plus du total : le fournisseur d'une boutique
 * de quartier livre souvent contre un acompte, et c'est le premier chiffre
 * qu'il cherche.
 */
export function bonDeCommandeHtml(d: DonneesBonCommande): string {
  const devise = d.parametres.devise;
  const reste = Math.max(0, d.achat.total - d.achat.montantPaye);

  const contact = d.fournisseur
    ? [d.fournisseur.contact, d.fournisseur.telephone, d.fournisseur.adresse]
        .filter((v) => v && v.trim())
        .map((v) => `<p class="bloc-ligne">${echapper(v)}</p>`)
        .join('')
    : '';

  const rangs = d.lignes.length
    ? d.lignes
        .map(
          (l, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td>${echapper(l.libelle)}</td>
            <td>${echapper(l.unite)}</td>
            <td class="num">${quantite(l.quantite)}</td>
            <td class="num">${montant(l.prixUnitaire, devise)}</td>
            <td class="num">${montant(l.total, devise)}</td>
          </tr>`,
        )
        .join('')
    : `<tr><td colspan="6" class="vide">Aucun article dans cette commande.</td></tr>`;

  const corps = `
    ${enteteHtml(d.parametres, 'BON DE COMMANDE', d.achat.numero)}

    <div class="blocs">
      <div class="bloc">
        <p class="bloc-titre">Fournisseur</p>
        <p class="bloc-nom">${echapper(d.fournisseur?.nom || d.achat.fournisseurNom || 'Non precise')}</p>
        ${contact}
      </div>
      <div class="bloc">
        <p class="bloc-titre">Commande</p>
        <p class="bloc-ligne">Date : ${dateCourte(d.achat.dateAchat)}</p>
        ${d.achat.reference ? `<p class="bloc-ligne">Reference : ${echapper(d.achat.reference)}</p>` : ''}
        <p class="bloc-ligne">Statut : ${echapper(d.achat.statut)}</p>
        ${d.achat.dateReception ? `<p class="bloc-ligne">Recue le : ${dateCourte(d.achat.dateReception)}</p>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="num">N</th><th>Article</th><th>Unite</th>
          <th class="num">Quantite</th><th class="num">Prix unitaire</th><th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${rangs}</tbody>
    </table>

    <table class="totaux">
      <tr><td>Montant total</td><td class="num">${montant(d.achat.total, devise)}</td></tr>
      <tr><td>Deja paye</td><td class="num">${montant(d.achat.montantPaye, devise)}</td></tr>
      <tr class="total-fort"><td>Reste a payer</td><td class="num">${montant(reste, devise)}</td></tr>
    </table>

    <div class="note">
      Merci de confirmer la disponibilite et le delai de livraison des articles
      ci-dessus. Toute modification de prix doit etre signalee avant expedition.
    </div>

    ${piedHtml(d.parametres, `Commande ${d.achat.numero} - ${dateCourte(d.achat.dateAchat)}`)}`;

  return page(corps);
}

// --- catalogue des produits ------------------------------------------------

/**
 * Ce dont le catalogue a besoin, et rien de plus.
 *
 * Volontairement decouple du type `Produit` du domaine : l'ecran du catalogue
 * lit une ligne SQL a plat, la fiche produit manipule l'objet complet avec ses
 * sous-unites. Exiger l'un ou l'autre obligerait un appelant a fabriquer des
 * champs qui ne servent pas au document.
 */
export interface ArticleCatalogue {
  nom: string;
  categorie: string | null;
  codeBarre: string | null;
  uniteBase: string;
  quantiteBase: number;
  prixUnitaire: number;
  gestionStock: boolean;
}

export interface DonneesCatalogue {
  produits: ArticleCatalogue[];
  parametres: Parametres;
  /** Ce qui etait filtre a l'ecran, rappele sur le document. */
  filtre?: string;
}

/**
 * La liste des produits, telle qu'on la donne a un vendeur ou a un client.
 *
 * Le prix d'achat n'y figure PAS : ce document sort de la boutique, et la
 * marge ne regarde personne d'autre que le patron.
 */
export function catalogueHtml(d: DonneesCatalogue): string {
  const devise = d.parametres.devise;

  // Regroupe par rayon : un catalogue a plat ne se lit pas au-dela de vingt
  // lignes, alors qu'une boutique en a couramment deux cents.
  const parCategorie = new Map<string, ArticleCatalogue[]>();
  for (const p of d.produits) {
    const cle = p.categorie?.trim() || 'Sans categorie';
    const liste = parCategorie.get(cle);
    if (liste) liste.push(p);
    else parCategorie.set(cle, [p]);
  }
  const categories = [...parCategorie.keys()].sort((a, b) => a.localeCompare(b));

  const sections = categories.length
    ? categories
        .map((cat) => {
          const rangs = (parCategorie.get(cat) ?? [])
            .map(
              (p) => `<tr>
                <td>${echapper(p.nom)}</td>
                <td>${echapper(p.codeBarre)}</td>
                <td>${echapper(p.uniteBase)}</td>
                <td class="num">${p.gestionStock ? quantite(p.quantiteBase) : '-'}</td>
                <td class="num">${montant(p.prixUnitaire, devise)}</td>
              </tr>`,
            )
            .join('');
          return `<tr><td colspan="5" style="background:#e6eef6;font-weight:700;color:#004a8d">
                    ${echapper(cat)}
                  </td></tr>${rangs}`;
        })
        .join('')
    : `<tr><td colspan="5" class="vide">Aucun produit a lister.</td></tr>`;

  const corps = `
    ${enteteHtml(
      d.parametres,
      'CATALOGUE DES PRODUITS',
      `${d.produits.length} produit(s)${d.filtre ? ` - ${d.filtre}` : ''}`,
    )}

    <table>
      <thead>
        <tr>
          <th>Produit</th><th>Code-barres</th><th>Unite</th>
          <th class="num">Stock</th><th class="num">Prix de vente</th>
        </tr>
      </thead>
      <tbody>${sections}</tbody>
    </table>

    ${piedHtml(d.parametres, 'Prix indicatifs, susceptibles de modification')}`;

  return page(corps);
}

// --- generation et envoi ---------------------------------------------------

/**
 * Rend le HTML en PDF et renvoie le chemin du fichier.
 *
 * `expo-print` nomme le fichier au hasard ; on le renomme pour que le
 * destinataire recoive `Commande-A-0004.pdf` et non `a3f9c2.pdf`, ce qui compte
 * beaucoup quand la piece arrive dans une conversation WhatsApp.
 */
export async function genererPdf(html: string, nomFichier: string): Promise<string> {
  const { uri } = await Impression.printToFileAsync({ html, base64: false });
  const propre = nomFichier.replace(/[^A-Za-z0-9._-]/g, '-');
  const cible = uri.replace(/[^/]+$/, `${propre}.pdf`);
  if (cible === uri) return uri;
  try {
    const { File } = await import('expo-file-system');
    new File(uri).move(new File(cible));
    return cible;
  } catch {
    // Le renommage est un confort, pas une condition : si le systeme le refuse,
    // mieux vaut envoyer le document sous son nom d'origine que rien du tout.
    return uri;
  }
}

/**
 * Ouvre le partage du systeme (WhatsApp, Bluetooth, Drive, courriel...).
 *
 * On ne cible pas WhatsApp directement : le commercant envoie tantot par
 * WhatsApp, tantot par Bluetooth a la boutique d'a cote, et une application
 * qu'on force ne s'installe pas toute seule sur le telephone du client.
 */
export async function partagerPdf(chemin: string, titre: string): Promise<boolean> {
  if (!(await Partage.isAvailableAsync())) return false;
  await Partage.shareAsync(chemin, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: titre,
  });
  return true;
}

/** Enchaine les deux etapes, cas d'usage courant depuis un ecran. */
export async function genererEtPartager(
  html: string,
  nomFichier: string,
  titre: string,
): Promise<boolean> {
  const chemin = await genererPdf(html, nomFichier);
  return partagerPdf(chemin, titre);
}
