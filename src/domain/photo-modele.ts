/** Propriété de la photo temporaire : ne jamais supprimer une photo pendant son commit. */
export class PhotoModeleProvisoire {
  private chemin: string | null = null;
  private sauvegarde = false;
  private abandonnee = false;
  constructor(private readonly effacer: (chemin: string) => void) {}

  remplacer(chemin: string): void {
    if (this.sauvegarde || this.abandonnee) throw new Error('La saisie de photo est fermée.');
    this.nettoyer();
    this.chemin = chemin;
  }
  commencerSauvegarde(): void {
    if (this.sauvegarde || this.abandonnee) throw new Error('La sauvegarde est déjà en cours ou fermée.');
    this.sauvegarde = true;
  }
  confirmerSauvegarde(): void {
    this.chemin = null; // Le fichier appartient désormais au modèle enregistré.
    this.sauvegarde = false;
  }
  echecSauvegarde(): void {
    this.sauvegarde = false;
    if (this.abandonnee) this.nettoyer();
  }
  abandonner(): void {
    this.abandonnee = true;
    if (!this.sauvegarde) this.nettoyer();
  }
  private nettoyer(): void {
    const chemin = this.chemin;
    this.chemin = null;
    if (chemin) this.effacer(chemin);
  }
}
