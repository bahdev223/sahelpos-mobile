/**
 * Construction d'un ticket en ESC/POS.
 *
 * ESC/POS est le jeu de commandes compris par la quasi-totalite des imprimantes
 * a tickets. On produit ici les OCTETS a envoyer ; l'envoi lui-meme (Bluetooth)
 * est le travail de `imprimante.ts`. Separer les deux permet de tester la mise
 * en page du ticket sans imprimante branchee.
 */

/** Largeur du papier, exprimee en caracteres. */
export const LARGEURS = { '58mm': 32, '80mm': 48 } as const;
export type LargeurPapier = keyof typeof LARGEURS;

const ESC = 0x1b;
const GS = 0x1d;

export const CMD = {
  INITIALISER: [ESC, 0x40],
  GAUCHE: [ESC, 0x61, 0],
  CENTRE: [ESC, 0x61, 1],
  DROITE: [ESC, 0x61, 2],
  GRAS_ON: [ESC, 0x45, 1],
  GRAS_OFF: [ESC, 0x45, 0],
  DOUBLE_ON: [GS, 0x21, 0x11],
  DOUBLE_OFF: [GS, 0x21, 0x00],
  COUPER: [GS, 0x56, 0x42, 0x00],
  AVANCER: [ESC, 0x64, 0x03],
} as const;

/**
 * Beaucoup d'imprimantes bon marche ne savent pas lire l'UTF-8 et impriment des
 * caracteres parasites a la place des accents. On retire donc les accents
 * plutot que de risquer un ticket illisible : un "e" vaut mieux qu'un "?".
 */
export function sansAccents(texte: string): string {
  return texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Coupe un texte trop long pour la largeur du papier. */
export function tronquer(texte: string, largeur: number): string {
  return texte.length <= largeur ? texte : texte.slice(0, largeur - 1) + '.';
}

/** "Riz 50kg" + "12 500 F" colles aux deux bords, points de conduite au milieu. */
export function deuxColonnes(
  gauche: string,
  droite: string,
  largeur: number,
): string {
  const g = tronquer(gauche, Math.max(1, largeur - droite.length - 1));
  const espaces = Math.max(1, largeur - g.length - droite.length);
  return g + ' '.repeat(espaces) + droite;
}

/** Le franc CFA n'a pas de centimes : on affiche des entiers, espaces par milliers. */
export function formaterMontant(valeur: number): string {
  const entier = Math.round(valeur);
  return entier.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ') + ' F';
}

/**
 * Accumule le contenu d'un ticket puis rend les octets a envoyer.
 *
 * Volontairement sans dependance a React ni au Bluetooth : cette classe est
 * testable seule.
 */
export class Ticket {
  private octets: number[] = [];
  /** Uniquement le TEXTE, sans les octets de commande : sert a `apercu()`. */
  private lignesLisibles: string[] = [];
  readonly largeur: number;

  constructor(papier: LargeurPapier = '58mm') {
    this.largeur = LARGEURS[papier];
    this.commande(CMD.INITIALISER);
  }

  commande(octets: readonly number[]): this {
    this.octets.push(...octets);
    return this;
  }

  texte(valeur: string): this {
    const propre = sansAccents(valeur);
    for (let i = 0; i < propre.length; i++) {
      this.octets.push(propre.charCodeAt(i) & 0xff);
    }
    return this;
  }

  ligne(valeur = ''): this {
    const coupee = tronquer(valeur, this.largeur);
    this.lignesLisibles.push(coupee);
    return this.texte(coupee).texte('\n');
  }

  /**
   * Ligne en double largeur.
   *
   * En double largeur chaque caractere occupe DEUX colonnes : la largeur
   * utile tombe donc a la moitie. Formater ces lignes sur la largeur
   * normale les fait deborder et l'imprimante les coupe — c'est ce qui
   * arrivait a la ligne TOTAL sur du papier 58 mm.
   */
  ligneLarge(gauche: string, droite: string): this {
    const utile = Math.floor(this.largeur / 2);
    const contenu = deuxColonnes(gauche, droite, utile);
    this.lignesLisibles.push(contenu);
    return this.commande(CMD.DOUBLE_ON)
      .texte(contenu)
      .texte('\n')
      .commande(CMD.DOUBLE_OFF);
  }

  ligneDouble(gauche: string, droite: string): this {
    return this.ligne(deuxColonnes(gauche, droite, this.largeur));
  }

  separateur(caractere = '-'): this {
    return this.ligne(caractere.repeat(this.largeur));
  }

  titre(valeur: string): this {
    return this.commande(CMD.CENTRE)
      .commande(CMD.GRAS_ON)
      .ligne(valeur)
      .commande(CMD.GRAS_OFF)
      .commande(CMD.GAUCHE);
  }

  couper(): this {
    return this.commande(CMD.AVANCER).commande(CMD.COUPER);
  }

  /** Octets prets a etre envoyes a l'imprimante. */
  versOctets(): Uint8Array {
    return Uint8Array.from(this.octets);
  }

  /**
   * Rendu texte du ticket, pour verifier la mise en page sans imprimante.
   *
   * Construit a partir du texte reellement ecrit, jamais des octets : les
   * parametres des commandes ESC/POS sont des caracteres imprimables (0x61 =
   * 'a', 0x21 = '!') et polluaient l'apercu en donnant l'illusion de
   * caracteres parasites sur le ticket.
   */
  apercu(): string {
    return this.lignesLisibles.join('\n');
  }
}
