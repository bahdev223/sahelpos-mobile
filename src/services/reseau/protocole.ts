/**
 * Contrat entre le telephone PATRON (serveur) et les telephones VENDEUR.
 *
 * Ce fichier est la seule source de verite des echanges : il est importe des
 * DEUX cotes. Si une operation change de forme, les deux cotes cessent de
 * compiler ensemble — c'est exactement ce qu'on veut, plutot que de decouvrir
 * l'incompatibilite en boutique.
 *
 * On echange des OPERATIONS METIER, jamais du SQL. Deux raisons :
 *   - la securite : un vendeur ne doit pas pouvoir envoyer ce qu'il veut a la
 *     base du patron ;
 *   - la concurrence : une vente doit s'executer dans UNE transaction cote
 *     serveur. Avec du SQL a distance, la verification du stock et l'ecriture
 *     seraient separees par un aller-retour reseau, et deux vendeurs pourraient
 *     vendre le meme dernier article.
 */

/** Version du protocole : un vendeur trop ancien doit etre refuse clairement. */
export const VERSION_PROTOCOLE = 1;

export const PORT_PAR_DEFAUT = 8477;

export type NomOperation =
  | 'ping'
  | 'produits.lister'
  | 'produits.codeBarre'
  | 'produits.sousUnites'
  | 'clients.lister'
  | 'vente.enregistrer'
  | 'vente.lister'
  | 'vente.totaux'
  | 'stock.alertes';

export interface Requete<T = unknown> {
  version: number;
  jeton: string;
  operation: NomOperation;
  /** Nom du vendeur, pour tracer qui a encaisse quoi. */
  appareil?: string;
  parametres?: T;
}

export type Reponse<T = unknown> =
  | { ok: true; resultat: T }
  | { ok: false; erreur: string; code: CodeErreur };

export type CodeErreur =
  | 'jeton_invalide'
  | 'version_incompatible'
  | 'operation_inconnue'
  | 'requete_invalide'
  | 'erreur_metier'
  | 'erreur_interne';

/**
 * Messages destines au commercant, pas au developpeur.
 *
 * Un vendeur qui voit "HTTP 401" ne sait pas quoi faire. Un vendeur qui lit
 * "le patron a renouvele le code" sait qu'il doit rescanner.
 */
export const MESSAGE_ERREUR: Record<CodeErreur, string> = {
  jeton_invalide:
    "Ce telephone n'est plus autorise. Le patron a peut-etre renouvele le code : rescannez le QR code.",
  version_incompatible:
    "Les deux telephones n'ont pas la meme version de l'application. Mettez-les a jour.",
  operation_inconnue: "Cette action n'est pas disponible sur le telephone du patron.",
  requete_invalide: 'La demande envoyee est mal formee.',
  erreur_metier: 'Operation refusee.',
  erreur_interne: "Le telephone du patron a rencontre une erreur.",
};

export function reponseOk<T>(resultat: T): Reponse<T> {
  return { ok: true, resultat };
}

export function reponseErreur(code: CodeErreur, detail?: string): Reponse<never> {
  return { ok: false, code, erreur: detail || MESSAGE_ERREUR[code] };
}

// --- parametres et resultats par operation ---------------------------------

export interface ParamsListerProduits {
  recherche?: string;
  categorie?: string;
  limite?: number;
}

export interface ParamsCodeBarre {
  code: string;
}

export interface ParamsSousUnites {
  produitId: number;
}

export interface ParamsListerClients {
  recherche?: string;
}

export interface ArticleDistant {
  produitId: number;
  unite: string;
  facteur: number;
  quantite: number;
  prixUnitaire: number;
}

export interface ParamsEnregistrerVente {
  articles: ArticleDistant[];
  modePaiement: string;
  montantPaye: number;
  clientId?: number | null;
  /** Nom du vendeur qui encaisse, conserve avec la vente. */
  vendeur?: string;
}

export interface ParamsListerVentes {
  debut?: string;
  fin?: string;
  limite?: number;
}

export interface ParamsTotaux {
  debut: string;
  fin: string;
}
