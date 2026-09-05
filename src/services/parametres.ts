/**
 * Parametres de la boutique.
 *
 * Stockes en base sous forme de couples cle/valeur textuels plutot que dans une
 * table a colonnes fixes : ajouter un reglage ne demande alors aucune migration,
 * et les reglages inconnus d'une ancienne version sont ignores sans casser.
 */
import { executer, lireTout, maintenant } from '../db/repositories/base';

export interface Parametres {
  boutiqueNom: string;
  boutiqueAdresse: string;
  boutiqueTelephone: string;
  devise: string;
  recuPiedDePage: string;
  /** Largeur du papier de l'imprimante : '58mm' ou '80mm'. */
  imprimantePapier: string;
  /** Identifiant du dernier appareil Bluetooth utilise, pour s'y reconnecter. */
  imprimanteAppareil: string;
  installationTerminee: boolean;
}

export const PARAMETRES_PAR_DEFAUT: Parametres = {
  boutiqueNom: 'Ma boutique',
  boutiqueAdresse: '',
  boutiqueTelephone: '',
  devise: 'FCFA',
  recuPiedDePage: 'Merci de votre visite',
  imprimantePapier: '58mm',
  imprimanteAppareil: '',
  installationTerminee: false,
};

/** Correspondance entre les champs de l'objet et les cles stockees en base. */
const CLES: Record<keyof Parametres, string> = {
  boutiqueNom: 'boutique.nom',
  boutiqueAdresse: 'boutique.adresse',
  boutiqueTelephone: 'boutique.telephone',
  devise: 'boutique.devise',
  recuPiedDePage: 'recu.pied_de_page',
  imprimantePapier: 'imprimante.papier',
  imprimanteAppareil: 'imprimante.appareil',
  installationTerminee: 'installation.terminee',
};

export async function lireParametres(): Promise<Parametres> {
  const lignes = await lireTout<{ cle: string; valeur: string | null }>(
    'SELECT cle, valeur FROM parametre',
  );
  const parCle = new Map(lignes.map((l) => [l.cle, l.valeur ?? '']));

  const resultat = { ...PARAMETRES_PAR_DEFAUT };
  for (const champ of Object.keys(CLES) as Array<keyof Parametres>) {
    const brut = parCle.get(CLES[champ]);
    if (brut === undefined) continue;
    if (champ === 'installationTerminee') {
      resultat.installationTerminee = brut === '1' || brut === 'true';
    } else {
      (resultat[champ] as string) = brut;
    }
  }
  return resultat;
}

export async function ecrireParametres(
  modifications: Partial<Parametres>,
): Promise<void> {
  const horodatage = maintenant();
  for (const champ of Object.keys(modifications) as Array<keyof Parametres>) {
    const valeur = modifications[champ];
    if (valeur === undefined) continue;
    const texte = typeof valeur === 'boolean' ? (valeur ? '1' : '0') : String(valeur);

    // INSERT ... ON CONFLICT : le parametre peut ne pas encore exister, et on ne
    // veut pas d'un aller-retour SELECT puis INSERT ou UPDATE.
    await executer(
      `INSERT INTO parametre (cle, valeur, date_modification) VALUES (?, ?, ?)
       ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur,
                                      date_modification = excluded.date_modification`,
      CLES[champ],
      texte,
      horodatage,
    );
  }
}

/** En-tete du recu imprime, construit depuis les parametres. */
export async function enteteRecu(): Promise<{
  nom: string;
  adresse?: string;
  telephone?: string;
  piedDePage?: string;
}> {
  const p = await lireParametres();
  return {
    nom: p.boutiqueNom,
    adresse: p.boutiqueAdresse || undefined,
    telephone: p.boutiqueTelephone || undefined,
    piedDePage: p.recuPiedDePage || undefined,
  };
}
