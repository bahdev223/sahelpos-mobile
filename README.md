# SahelPOS Mobile

Caisse mobile Android, autonome, en React Native (Expo).

## Ce que fait l'application

- **Caisse** : panier, encaissement, recu imprime sur imprimante thermique Bluetooth
- **Catalogue** : produits, prix, stock, fiches modifiables
- **Inventaire** : comptage en rayon avec scan du code-barres
- **Tableau de bord** : chiffre d'affaires, ventes du jour, alertes de stock bas

## Decision d'architecture : application autonome

L'application **ne se connecte a rien**. Elle a sa propre base SQLite sur le
telephone. Il n'y a ni serveur, ni synchronisation avec l'application de bureau
SahelPOS 360.

Ce choix a une consequence qu'il faut avoir en tete : **le stock du telephone et
celui du PC sont deux stocks differents**. Vendre un sac de ciment sur le mobile
ne le retire pas du stock du poste. Les deux ne doivent donc pas gerer le meme
inventaire physique en meme temps, sauf a accepter qu'ils divergent.

Le schema de la base reprend malgre tout les noms de tables et de colonnes du
bureau (`produit`, `mouvement_stock`, `ligne_vente`...). L'application ne s'en
sert pas aujourd'hui, mais le jour ou un import/export entre les deux devient
necessaire, il n'y aura pas de table de correspondance a ecrire.

Ecart assume : pas de gestion FIFO par lot sur mobile. Saisir des lots au doigt
sur un telephone est irrealiste ; le stock est suivi au produit.

## Imprimante thermique Bluetooth

C'est la contrainte qui structure toute la chaine de build.

Le Bluetooth demande du code natif. **L'application ne peut donc pas tourner
dans Expo Go** — il faut compiler notre propre APK (un *development build*).
Ce n'est pas un abandon d'Expo : on garde `expo`, `expo-router` et les modules
Expo, on ajoute simplement `expo-dev-client` et on compile.

En pratique :

```bash
npx expo run:android          # compile et installe sur le telephone branche
```

La communication avec l'imprimante se fait en **ESC/POS**, le jeu de commandes
que comprennent la quasi-totalite des imprimantes a tickets. Voir
`src/services/impression/`.

Deux points a verifier tot avec le materiel reel, car ils ne se devinent pas :

- la largeur du papier (58 mm = 32 caracteres, 80 mm = 48 caracteres) ;
- le **jeu de caracteres** de l'imprimante. Beaucoup de modeles bon marche ne
  connaissent pas les accents en UTF-8 et sortent des caracteres bizarres. Il
  faut alors encoder en CP437 ou CP850, ou retirer les accents du ticket.

## Sauvegarde

`expo-sqlite` ecrit dans le stockage prive de l'application : les donnees
survivent aux mises a jour, mais **disparaissent avec la desinstallation**, et
un telephone perdu emporte la caisse avec lui.

L'export de la base n'est donc pas un confort mais une securite. Il doit etre
propose tot et rappele au commercant.

## Structure

```text
app/                    ecrans (expo-router : un fichier = une route)
src/
  db/                   schema SQLite et ouverture de la base
  domain/               types metier partages
  services/             regles metier : vente, stock, impression, sauvegarde
  ui/                   theme et composants reutilisables
  hooks/                acces aux donnees depuis les ecrans
```

## Montants

Le franc CFA n'a pas de sous-unite. Les montants sont manipules en **entiers de
francs** et arrondis a chaque ligne, pour que le total du ticket corresponde
exactement a la somme des lignes affichees.

## Demarrer

```bash
npm install
npx expo run:android
```
