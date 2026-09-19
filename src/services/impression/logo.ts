import { NativeModules, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

import { CMD, type LargeurPapier, type Ticket } from './escpos';

interface ModuleImageEscpos {
  logoRaster?: (uri: string, largeurMax: number, hauteurMax: number) => Promise<number[]>;
}

const imageEscpos = NativeModules.SahelposEscposImage as ModuleImageEscpos | undefined;

function uriLogo(chemin: string): string {
  if (/^(file|content):\/\//.test(chemin)) return chemin;
  try {
    return new File(Paths.document, chemin).uri;
  } catch {
    return chemin;
  }
}

export async function ajouterLogoTicket(
  ticket: Ticket,
  chemin: string | undefined,
  papier: LargeurPapier,
): Promise<void> {
  if (!chemin || Platform.OS !== 'android' || !imageEscpos?.logoRaster) return;

  const largeur = papier === '80mm' ? 320 : 224;
  const hauteur = papier === '80mm' ? 140 : 118;

  try {
    const octets = await imageEscpos.logoRaster(uriLogo(chemin), largeur, hauteur);
    if (!octets.length) return;
    ticket.commande(CMD.CENTRE).commande(octets).ligne().commande(CMD.GAUCHE);
  } catch {
    // Le logo ne doit jamais bloquer un ticket de caisse : si le fichier a ete
    // supprime ou est illisible, on imprime quand meme les infos boutique.
  }
}
