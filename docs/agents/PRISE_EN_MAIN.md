# Prise en main mobile

Suivre [Accounts/QR](../accounts-qr.md), qui reste la référence des parcours.

1. Se connecter avec Google ou avec le compte SahelTech par identifiant et mot
   de passe dans le navigateur système. Le login historique lié reste explicite.
2. Choisir une boutique autorisée. Scanner une invitation affiche sa destination ;
   le serveur accorde le rôle selon l'invitant et l'email central vérifié.
3. Définir un PIN si le profil n'en a pas. Un PIN existant est conservé.
   La biométrie est celle d'Android ; son refus laisse la voie PIN.
4. Dans une boutique de recette, créer un produit, saisir le stock, vendre,
   vérifier ticket/historique, puis contrôler la même vente côté web.
5. Une fois le bootstrap terminé et le droit local valide, répéter la vente hors
   réseau et observer la reprise après connexion.

Le rôle appartient au Membre de la boutique. Un vendeur consulte ses ventes et
ne récupère pas les coûts ou la gestion d'un patron. Le téléphone ne peut choisir
un rôle plus élevé. Une autre boutique est refusée avant mutation de la base
locale ; ne pas vider SQLite pour changer de contexte.

Distinguer QR d'invitation, QR de connexion (approbation et code à comparer),
et code produit. Utiliser le lien d'invitation si la caméra est indisponible.
Le support est le contact configuré côté service, pas un numéro inventé ici.
## Complement inscription du 1er novembre 2026
# Prise en main

Nouvelle inscription : choisir l'activité illustrée, continuer vers « Ma boutique » et « Mon compte », puis créer la boutique. Retour ou Modifier permet de corriger l'activité sans perdre les valeurs métier. Google/Accounts évite le mot de passe local ; la création classique conserve les identifiants serveur. Le PIN local vient ensuite selon le parcours existant.

Pour rejoindre une boutique, invitations, QR et rôles : [guide faisant autorité](../accounts-qr.md). Cette refonte ne donne aucun nouveau droit vendeur. [État vérifié et limites](../inscription-mobile-2026-11-01.md).
