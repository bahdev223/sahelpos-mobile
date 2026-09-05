/**
 * Route racine.
 *
 * Sans ce fichier, ouvrir l'application affiche "Unmatched Route" : le groupe
 * `(tabs)` ne cree PAS de route pour `/` — un groupe entre parentheses sert a
 * regrouper des ecrans sans ajouter de segment d'URL, il ne fournit donc aucune
 * destination par defaut.
 *
 * L'aiguillage entre premier demarrage et connexion est deja fait par
 * `_layout.tsx`, qui n'affiche la pile de navigation qu'une fois la boutique
 * configuree et un vendeur connecte. Ici il ne reste donc qu'a envoyer vers la
 * caisse, qui est l'ecran ou le commercant passe sa journee.
 */
import { Redirect } from 'expo-router';

export default function Racine() {
  return <Redirect href="/accueil" />;
}
