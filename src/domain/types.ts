/**
 * Types metier partages par toute l'application.
 *
 * Regle sur les montants : ils sont manipules en francs CFA, une monnaie SANS
 * sous-unite. On travaille donc en nombres entiers de francs et on arrondit a
 * chaque calcul de ligne, plutot que de laisser trainer des centimes qui
 * n'existent pas et qui feraient diverger le total du ticket.
 */

export type Role = 'admin' | 'gerant' | 'vendeur';

export type ModePaiement = 'especes' | 'mobile_money' | 'credit';

export type StatutVente = 'payee' | 'partielle' | 'impayee' | 'annulee';

export type NatureMouvement = 'ENTREE' | 'SORTIE' | 'AJUSTEMENT';

export type SourceOperation =
  | 'VENTE'
  | 'ACHAT'
  | 'INVENTAIRE'
  | 'INITIALISATION'
  | 'CASSE'
  | 'RETOUR'
  | 'CORRECTION';

export interface SousUnite {
  id: number;
  produitId: number;
  nom: string;
  /** Combien d'unites de base vaut une sous-unite (1 carton = 24 unites). */
  facteur: number;
  prix: number;
}

export interface Produit {
  id: number;
  idLocal: string;
  nom: string;
  categorie: string | null;
  codeBarre: string | null;
  prixUnitaire: number;
  prixAchat: number;
  uniteBase: string;
  quantiteBase: number;
  stockMin: number;
  gestionStock: boolean;
  cheminImage: string | null;
  actif: boolean;
  sousUnites?: SousUnite[];
}

export interface LigneVente {
  produitId: number;
  libelle: string;
  unite: string;
  facteur: number;
  quantite: number;
  /** quantite * facteur : ce qui sera reellement retire du stock. */
  quantiteBase: number;
  prixUnitaire: number;
  coutUnitaire: number;
  total: number;
  beneficeTotal: number;
}

export interface Vente {
  id: number;
  idLocal: string;
  numero: string;
  clientId: number | null;
  utilisateurId: number | null;
  dateVente: string;
  total: number;
  montantPaye: number;
  modePaiement: ModePaiement;
  statut: StatutVente;
  beneficeTotal: number;
  lignes?: LigneVente[];
}

export interface Client {
  id: number;
  idLocal: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
}

export interface Utilisateur {
  id: number;
  idLocal: string;
  login: string;
  nom: string | null;
  role: Role;
  actif: boolean;
  caisseOuvreA: string | null;
  caisseFermeA: string | null;
}
