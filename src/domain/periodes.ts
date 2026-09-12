export type ModePeriode = 'jour' | 'semaine' | 'mois' | 'annee' | '7jours' | '30jours';

export const MODES_PERIODE: { mode: ModePeriode; libelle: string }[] = [
  { mode: 'jour', libelle: 'Jour' },
  { mode: 'semaine', libelle: 'Semaine' },
  { mode: 'mois', libelle: 'Mois' },
  { mode: 'annee', libelle: 'Année' },
  { mode: '7jours', libelle: '7 jours' },
  { mode: '30jours', libelle: '30 jours' },
];

export function cleGroupe(date: Date, mensuel: boolean): string {
  const mois = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return mensuel ? mois : `${mois}-${String(date.getDate()).padStart(2, '0')}`;
}

export function libelleGroupe(cle: string): string {
  const [annee, mois, jour] = cle.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { ...(jour ? { day: 'numeric' as const } : {}), month: 'long', year: 'numeric' }).format(new Date(annee, mois - 1, jour || 1));
}

export function calculerPeriode(mode: ModePeriode, decalage = 0, reference = new Date()) {
  const debut = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const fin = new Date(debut);
  if (mode === 'annee') {
    debut.setFullYear(debut.getFullYear() + decalage, 0, 1);
    fin.setFullYear(debut.getFullYear(), 11, 31);
  } else if (mode === 'mois') {
    debut.setDate(1);
    debut.setMonth(debut.getMonth() + decalage);
    fin.setFullYear(debut.getFullYear(), debut.getMonth() + 1, 0);
  } else if (mode === 'semaine') {
    debut.setDate(debut.getDate() - (debut.getDay() + 6) % 7 + decalage * 7);
    fin.setTime(debut.getTime());
    fin.setDate(fin.getDate() + 6);
  } else {
    const jours = mode === '7jours' ? 7 : mode === '30jours' ? 30 : 1;
    fin.setDate(fin.getDate() + decalage * jours);
    debut.setTime(fin.getTime());
    debut.setDate(debut.getDate() - jours + 1);
  }
  // Les jours civils restent corrects meme lors d'un changement d'heure.
  fin.setHours(23, 59, 59, 999);
  const dateCourte = (d: Date) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  const libelle = mode === 'annee' ? String(debut.getFullYear())
    : mode === 'mois' ? libelleGroupe(cleGroupe(debut, true))
    : mode === 'jour' ? dateCourte(debut) : `${dateCourte(debut)} - ${dateCourte(fin)}`;
  const groupes: { cle: string; libelle: string }[] = [];
  const curseur = new Date(debut);
  while (curseur <= fin) {
    const cle = cleGroupe(curseur, mode === 'annee');
    groupes.push({ cle, libelle: libelleGroupe(cle) });
    if (mode === 'annee') curseur.setMonth(curseur.getMonth() + 1);
    else curseur.setDate(curseur.getDate() + 1);
  }
  return { debut: debut.toISOString(), fin: fin.toISOString(), libelle, groupes, mensuel: mode === 'annee' };
}
