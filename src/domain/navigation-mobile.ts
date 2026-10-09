import type { Role } from './types';
import type { SecteurCommerce } from './commerce';
import type { NomIcone } from '../ui/icones';
import { peutAccederCheminMobile } from './permissions-mobile';

export interface LienNavigationMobile {
  id: string; titre: string; description: string; chemin: string; icone: NomIcone; capability?: string;
}
export interface GroupeNavigationMobile { id: string; titre: string; entrees: LienNavigationMobile[]; }
function lien(id:string,titre:string,description:string,chemin:string,icone:NomIcone,capability?:string): LienNavigationMobile {
  return { id,titre,description,chemin,icone,capability };
}

/** Source unique du menu écran et du tiroir. Rôles et capacités filtrés ensemble. */
export function construireNavigationMobile(secteur: SecteurCommerce, role: Role, capabilities: readonly string[]): GroupeNavigationMobile[] {
  const mode = secteur === 'HABILLEMENT';
  const technique = secteur === 'ELECTRICITE' || secteur === 'QUINCAILLERIE';
  const vrac = secteur === 'CEREALES_VRAC';
  const groupes: GroupeNavigationMobile[] = [
    { id:'ventes',titre:'Ventes',entrees:[
      lien('caisse','Caisse','Nouvelle vente','/(tabs)/caisse','caisse'),
      lien('ventes','Historique des ventes','Tickets et ventes réalisées','/ventes','ventes'),
      lien('clients','Clients','Fiches, ardoises et règlements','/clients','clients'),
      lien('factures','Factures et reçus','Documents des ventes','/factures','document'),
      ...(mode ? [
        lien('commandes','Commandes clients','Réservations et préparation','/habillement/commandes','achats'),
        lien('echanges','Échanges','Tailles et couleurs','/habillement/echanges','mouvements','VARIANT_EXCHANGE'),
      ] : []),
    ] },
    { id:'catalogue',titre:'Catalogue',entrees:[
      lien('produits',mode?'Modèles':technique?'Références':vrac?'Denrées':'Produits',
        'Catalogue des articles','/(tabs)/catalogue','catalogue'),
      lien('categories',vrac?'Familles':mode?'Collections':'Catégories','Classer les articles','/categories','etiquette'),
      ...(mode ? [
        lien('showroom','Showroom','Vue visuelle des modèles','/habillement/showroom','oeil'),
        lien('referentiel','Tailles & couleurs','Référentiels synchronisés','/habillement/referentiel','etiquette'),
      ] : []),
    ] },
    { id:'stock',titre:'Stock',entrees:[
      lien('stock',mode?'Stock par variantes':'État du stock','Quantités disponibles','/(tabs)/stock','stock'),
      lien('alertes','Alertes de stock','Ruptures et niveaux faibles','/stock/alertes','alerte'),
      lien('inventaire',mode?'Inventaire variantes':'Inventaires','Comptages et écarts',
        mode?'/habillement/inventaire':'/inventaire','inventaire'),
      lien('mouvements','Mouvements de stock','Entrées et sorties','/stock/mouvements','mouvements'),
      ...(vrac?[lien('lots','Lots','Traçabilité des denrées','/stock/lots','stock')]:[]),
    ] },
    { id:'approvisionnement',titre:'Approvisionnements',entrees:[
      lien('achats',mode?'Entrées de stock':'Achats fournisseurs','Commandes et réceptions','/achats','achats'),
      lien('nouvel-achat','Nouvel approvisionnement','Enregistrer un achat','/achats/nouveau','plus'),
      ...(mode?[lien('matrice','Matrice taille × couleur','Répartir les quantités','/habillement/approvisionnement-matrice','inventaire','PURCHASE_MATRIX')]:[]),
      lien('fournisseurs','Fournisseurs','Contacts et dettes','/fournisseurs','fournisseurs'),
    ] },
    { id:'pilotage',titre:'Pilotage',entrees:[
      lien('tableau','Tableau de bord','Indicateurs et activité','/tableau-de-bord','graphique'),
      ...(mode?[lien('rapports','Rapports Habillement','Ventes et variantes','/habillement/rapports','graphique')]:[]),
    ] },
    { id:'organisation',titre:'Organisation',entrees:[
      lien('boutique','Ma boutique','Nom, adresse, reçu','/parametres/boutique','boutique'),
      lien('utilisateurs','Équipe et utilisateurs','Comptes et rôles','/parametres/utilisateurs','utilisateurs'),
      lien('imprimante','Imprimante','Bluetooth et ticket test','/parametres/imprimante','imprimante'),
      lien('synchronisation','Synchronisation','Web et hors ligne','/parametres/synchronisation','reseau'),
      lien('sauvegarde','Sauvegarde','Export et restauration','/parametres/sauvegarde','sauvegarde'),
      lien('abonnement','Mon abonnement','Droits et échéance','/abonnement','document'),
      lien('notifications','Notifications','Ruptures et rappels','/notifications','cloche'),
    ] },
  ];
  return groupes.map((g)=>({...g,entrees:g.entrees.filter((e)=>
    (!e.capability || capabilities.includes(e.capability)) && peutAccederCheminMobile(role,e.chemin))}))
    .filter(g=>g.entrees.length>0);
}
