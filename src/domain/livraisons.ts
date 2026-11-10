import type { RoleLivreur } from './types';

export type StatutMission =
  | 'A_PREPARER' | 'EN_PREPARATION' | 'PRETE' | 'AFFECTEE' | 'CHARGEMENT'
  | 'CHARGEE' | 'EN_COURS' | 'LIVREE' | 'LIVREE_PARTIELLEMENT' | 'ECHEC'
  | 'RETOUR_EN_ATTENTE' | 'RETOUR_RECU' | 'ANNULEE';

export const LIBELLES_MISSION: Record<StatutMission, string> = {
  A_PREPARER: 'À préparer',
  EN_PREPARATION: 'En préparation',
  PRETE: 'Prête',
  AFFECTEE: 'Affectée',
  CHARGEMENT: 'À prendre en charge',
  CHARGEE: 'Chargée',
  EN_COURS: 'En cours',
  LIVREE: 'Livrée',
  LIVREE_PARTIELLEMENT: 'Livrée partiellement',
  ECHEC: 'Incident',
  RETOUR_EN_ATTENTE: 'Retour à réceptionner',
  RETOUR_RECU: 'Retour réceptionné',
  ANNULEE: 'Annulée',
};

export interface PerimetreLivreur {
  boutique: string;
  membre: string;
  role: RoleLivreur;
}

export interface Mission {
  id: number;
  numero: string;
  statut: StatutMission;
  version: number;
  destinataire: string;
  telephone: string;
  adresse: string;
  creneau_debut: string | null;
  creneau_fin: string | null;
  encaissement_autorise: boolean;
  date_creation: string;
  date_modification: string;
}

export interface LigneMission {
  id: number;
  libelle: string;
  variante: string;
  unite: string;
  mode_quantite?: 'fraction' | 'indivisible' | 'entiers';
  image?: string | null;
  quantite_prevue: string;
  quantite_preparee: string;
  quantite_remise: string;
  quantite_restante?: string;
}

export interface ColisMission {
  id: string;
  numero: number;
  scelle: string;
  contenu: Record<string, string>;
}

export interface DetailMission extends Mission {
  instructions: string;
  lignes: LigneMission[];
  colis: ColisMission[];
  evenements: Array<{ type: string; version: number; date_serveur: string; date_appareil: string | null; motif?: string }>;
  preuve: { receptionnaire: string; empreinte: string; version: number; date: string } | null;
}

export type Signature = Array<Array<[number, number]>>;
type Quantites = Array<{ id: number; quantite: string }>;
export type ActionMission =
  | { type: 'prendre'; donnees: { colis: string[]; signature: Signature } }
  | { type: 'partir'; donnees: Record<string, never> }
  | { type: 'livrer'; donnees: { receptionnaire: string; motif: string; lignes: Quantites; signature: Signature } }
  | { type: 'incident'; donnees: { motif: string; commentaire: string } }
  | { type: 'declarer_retour'; donnees: { motif: string; lignes: Quantites; signature: Signature } }
  | { type: 'encaisser'; donnees: { montant: string; mode: 'especes' | 'mobile_money' } };
export type TypeOperationMission = ActionMission['type'] | 'declarer_fonds';

export interface EtatFondsLivreur {
  version: number;
  reste_du: string;
  a_percevoir: string;
  a_reverser: string;
  peut_encaisser: boolean;
  peut_declarer: boolean;
  encaissements: Array<{ id: string; montant: string; mode: 'especes' | 'mobile_money'; statut: string; date_creation: string }>;
  remises: Array<{ id: string; statut: string; montant_declare: string; montant_compte: string | null; date_creation: string }>;
}

export interface TourneeLivreur {
  id: number;
  nom: string;
  statut: 'PLANIFIEE' | 'EN_COURS' | 'CLOTUREE' | 'ANNULEE';
  arrets: Array<{
    ordre: number; livraison: number; numero: string; statut: StatutMission;
    destinataire: string; adresse: string; creneau_debut: string | null; creneau_fin: string | null;
  }>;
}

export type EtatEnvoi = 'ATTENTE' | 'CONFLIT';
export interface ActionEnAttente {
  type: TypeOperationMission;
  version: number;
  statut: EtatEnvoi;
  apres?: StatutMission;
}

export const STATUTS_ACTION: Record<ActionMission['type'], readonly StatutMission[]> = {
  prendre: ['CHARGEMENT'],
  partir: ['CHARGEE'],
  livrer: ['EN_COURS'],
  incident: ['EN_COURS'],
  declarer_retour: ['ECHEC', 'LIVREE_PARTIELLEMENT', 'LIVREE'],
  encaisser: ['LIVREE', 'LIVREE_PARTIELLEMENT'],
};

export function statutApresAction(action: ActionMission, mission: DetailMission): StatutMission {
  switch (action.type) {
    case 'prendre': return 'CHARGEE';
    case 'partir': return 'EN_COURS';
    case 'incident': return 'ECHEC';
    case 'declarer_retour': return 'RETOUR_EN_ATTENTE';
    case 'livrer': return mission.lignes.some((ligne) =>
      Number(action.donnees.lignes.find(({ id }) => id === ligne.id)?.quantite) < quantiteRestante(ligne))
      ? 'LIVREE_PARTIELLEMENT' : 'LIVREE';
    case 'encaisser': return mission.statut;
  }
}

export function projectionMission(mission: Pick<Mission, 'statut' | 'version'>, operations: ActionEnAttente[]) {
  let { statut, version } = mission;
  for (const action of operations) {
    if (action.statut === 'CONFLIT') return { statut, version, bloquee: true };
    // A lost response can leave a pending operation already included in the last server state.
    if (action.version < version) continue;
    if (action.version !== version
      || (action.type !== 'declarer_fonds' && !STATUTS_ACTION[action.type].includes(statut))) {
      return { statut, version, bloquee: true };
    }
    statut = action.apres ?? (action.type === 'prendre' ? 'CHARGEE' : 'EN_COURS');
    version++;
  }
  return { statut, version, bloquee: false };
}

export function colisDepuisQr(texte: string, colis: Pick<ColisMission, 'id'>[]): string | null {
  const match = /^(?:SP360-COLIS:)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(texte.trim());
  return match ? colis.find(({ id }) => id.toLowerCase() === match[1].toLowerCase())?.id ?? null : null;
}

export function signatureValide(signature: Signature): boolean {
  return signature.length > 0 && signature.length <= 64
    && signature.reduce((total, trait) => total + trait.length, 0) <= 4096
    && signature.every((trait) => trait.length > 0 && trait.length <= 512
      && trait.every((point) => point.length === 2
        && point.every((coord) => Number.isInteger(coord) && coord >= 0 && coord <= 1000)))
    && signature.some((trait) => trait.some(([x, y]) => x !== trait[0][0] || y !== trait[0][1]));
}

function quantitesSaisies(
  lignes: Pick<LigneMission, 'id' | 'mode_quantite' | 'quantite_prevue'>[],
  saisie: Record<number, string>,
  limite: (id: number) => number, exigerQuantite = true,
): Quantites {
  const quantites = lignes.map(({ id, mode_quantite, quantite_prevue }) => {
    const quantite = (saisie[id] ?? '').trim().replace(',', '.');
    if (!/^\d{1,11}(?:\.\d{1,3})?$/.test(quantite) || Number(quantite) > limite(id)) {
      throw new Error('Vérifiez les quantités saisies pour chaque article.');
    }
    if (mode_quantite === 'entiers' && !Number.isInteger(Number(quantite))) {
      throw new Error('Indiquez un nombre entier de conditionnements.');
    }
    if (mode_quantite === 'indivisible' && Number(quantite) !== 0 && Number(quantite) !== Number(quantite_prevue)) {
      throw new Error('Un tronçon vendu doit rester d’un seul tenant.');
    }
    return { id, quantite };
  });
  if (exigerQuantite && !quantites.some(({ quantite }) => Number(quantite) > 0)) {
    throw new Error('Indiquez une quantité pour au moins un article.');
  }
  return quantites;
}

type LigneRemise = Pick<LigneMission, 'id' | 'quantite_prevue' | 'quantite_preparee' | 'mode_quantite'>
  & Partial<Pick<LigneMission, 'quantite_remise' | 'quantite_restante'>>;

export function quantiteRestante(ligne: LigneRemise): number {
  const remise = Math.round(Number(ligne.quantite_remise ?? '0') * 1000);
  const preparee = Math.round(Number(ligne.quantite_preparee) * 1000);
  const restante = ligne.quantite_restante === undefined
    ? Math.round(Number(ligne.quantite_prevue) * 1000) - remise
    : Math.round(Number(ligne.quantite_restante) * 1000);
  return Math.max(0, Math.min(preparee - remise, restante)) / 1000;
}

export function preparerRemise(
  lignes: LigneRemise[],
  saisie: Record<number, string>,
  receptionnaire: string,
  motif: string,
  signature: Signature,
): Extract<ActionMission, { type: 'livrer' }>['donnees'] {
  if (!receptionnaire.trim() || !signatureValide(signature)) {
    throw new Error('Le nom et la signature du réceptionnaire sont requis.');
  }
  const attendues = new Map(lignes.map((ligne) => [ligne.id, quantiteRestante(ligne)]));
  const quantites = quantitesSaisies(lignes, saisie, (id) => attendues.get(id)!);
  if (!motif.trim() && quantites.some(({ id, quantite }) =>
    Number(quantite) < attendues.get(id)!)) {
    throw new Error('Indiquez le motif du reliquat.');
  }
  return { receptionnaire: receptionnaire.trim(), motif: motif.trim(), lignes: quantites, signature };
}

export function preparerRetour(
  lignes: LigneMission[], saisie: Record<number, string>, motif: string, signature: Signature,
  retourClient = false,
): Extract<ActionMission, { type: 'declarer_retour' }>['donnees'] {
  if (!motif.trim() || !signatureValide(signature)) throw new Error('Le motif et la signature du retour sont requis.');
  const quantites = quantitesSaisies(lignes, saisie, (id) => {
    const ligne = lignes.find((item) => item.id === id)!;
    if (retourClient) return Number(ligne.quantite_remise);
    return (Math.round(Number(ligne.quantite_prevue) * 1000) - Math.round(Number(ligne.quantite_remise) * 1000)) / 1000;
  }, retourClient);
  return { motif: motif.trim(), lignes: quantites, signature };
}
