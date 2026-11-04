import { SECTEURS_COMMERCE, MODES_VENTE, MODES_APPROVISIONNEMENT,
  type SecteurCommerce, type ModeVenteCommerce, type ModeApprovisionnementCommerce } from './commerce';

export interface DonneesBoutique {
  nom_boutique: string; telephone: string; ville: string; devise: string;
  secteur: SecteurCommerce | ''; mode_vente: ModeVenteCommerce;
  mode_approvisionnement: ModeApprovisionnementCommerce; plan: string;
}
export const BOUTIQUE_INITIALE: DonneesBoutique = {
  nom_boutique:'', telephone:'', ville:'', devise:'FCFA', secteur:'',
  mode_vente:'DETAIL', mode_approvisionnement:'CLASSIQUE', plan:'',
};
export const DEVISES_INSCRIPTION = [
  {code:'FCFA',titre:'FCFA'}, {code:'GNF',titre:'GNF'}, {code:'MRU',titre:'MRU'}, {code:'EUR',titre:'EUR'},
];
const LIBELLES: Record<SecteurCommerce,string> = {
  COMMERCE_GENERAL:'Commerce général', ALIMENTATION:'Alimentation', HABILLEMENT:'Habillement',
  FRIPERIE:'Friperie', ELECTRONIQUE:'Électronique', ELECTRICITE:'Électricité', QUINCAILLERIE:'Quincaillerie',
  COSMETIQUE:'Cosmétique', PIECES_DETACHEES:'Pièces détachées', CEREALES_VRAC:'Céréales et vrac', AUTRE:'Autre activité',
};
const ACTIVITES = [...SECTEURS_COMMERCE].sort((a,b) =>
  a.code === 'COMMERCE_GENERAL' ? -1 : b.code === 'COMMERCE_GENERAL' ? 1 : 0)
  .map(s => ({...s,titre:LIBELLES[s.code]}));
export function rechercherActivites(recherche:string) {
  const normaliser = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  return ACTIVITES.filter(s => normaliser(s.titre).includes(normaliser(recherche)));
}
/** Liste fermée : aucune identité, aucun mot de passe/PIN/jeton ne traverse le parcours métier OAuth. */
export function donneesBoutiqueAccounts(source: object): DonneesBoutique {
  const valeurs = source as Record<string,unknown>;
  const data = {...BOUTIQUE_INITIALE};
  for (const champ of Object.keys(data) as (keyof DonneesBoutique)[]) {
    if (typeof valeurs[champ] === 'string') Object.assign(data,{[champ]:(valeurs[champ] as string).trim()});
  }
  return data;
}
export function fusionnerErreursBoutique(locales:Record<string,string>, externes:Record<string,string|undefined>):Record<string,string> {
  return {...locales,...Object.fromEntries(Object.entries(externes).filter(([,message]) => typeof message === 'string' && message.length > 0))} as Record<string,string>;
}
export function validerBoutique(data:DonneesBoutique):Record<string,string> {
  const erreurs:Record<string,string> = {};
  if (!data.nom_boutique.trim()) erreurs.nom_boutique = 'Le nom de la boutique est obligatoire.';
  if (data.nom_boutique.length > 150) erreurs.nom_boutique = '150 caractères maximum.';
  if (data.telephone.length > 30) erreurs.telephone = '30 caractères maximum.';
  if (data.ville.length > 80) erreurs.ville = '80 caractères maximum.';
  if (!SECTEURS_COMMERCE.some(s => s.code === data.secteur)) erreurs.secteur = 'Choisissez votre activité.';
  if (!DEVISES_INSCRIPTION.some(d => d.code === data.devise)) erreurs.devise = 'Choisissez une devise proposée.';
  if (!MODES_VENTE.some(m => m.code === data.mode_vente)) erreurs.mode_vente = 'Choisissez un mode de vente.';
  if (!MODES_APPROVISIONNEMENT.some(m => m.code === data.mode_approvisionnement)) erreurs.mode_approvisionnement = 'Choisissez un approvisionnement.';
  return erreurs;
}
