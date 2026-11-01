# Mobile et synchronisation

Références : [Accounts et QR](../accounts-qr.md),
[guide technique historique](../mobile/README_MOBILE_AGENT.md).
La présente recette confirme la source 1.3.0/code9 ; les versions et commandes
de build historiques ne constituent pas une autorisation actuelle de compiler.

SQLite et `sync_outbox` sont conservés. Les écritures passent par
PENDING/SENDING/FAILED ; un envoi interrompu redevient PENDING. Le backend reste
l'autorité sur les écritures acceptées. Les tests couvrent les mouvements,
curseurs, ventes et conservation des écritures d'un profil hors périmètre.

La déconnexion ferme l'accès ; elle ne supprime pas silencieusement PIN, profils,
ventes ou file en attente. Le droit Ed25519 lie boutique, Membre et rôle.
Un rôle/Membre modifié remet le curseur de lecture à zéro afin de relire
l'historique autorisé. Une autre boutique est refusée avant mutation locale.
PIN/biométrie ne remplacent pas la validité centrale ; mesurer l'expiration
effective du droit hors ligne et tester la révocation au retour réseau.

Le navigateur système reçoit un challenge S256 et revient à
`sahelpos://auth-callback`. Android n'embarque pas de secret confidentiel ;
il échange un ticket court lié à son verifier. Le flux passe actuellement par
le backend confidentiel web. Un client OIDC natif public distinct n'est pas
prouvé : décision à finaliser avec Accounts avant certification.

| Usage caméra | Sécurité prévue | Téléphone réel |
| --- | --- | --- |
| Invitation | Cible SahelPOS, email, expiration, consommation contrôlés | À faire |
| Connexion | Code de confirmation, approbation et secret de récupération distinct | À faire |
| Produit | Recherche métier, aucun jeton de connexion | À faire |

Tester autorisation/refus caméra, URL étrangère, autre service/boutique,
réutilisation, compte déjà connecté, première connexion, annulation, retour
à froid/chaud, coupure réseau puis reprise. Tester la mise à jour signée en
conservant l'outbox ; aucun `adb uninstall` pour résoudre une signature.
RPP300, tickets 80/88 mm et historique Xprinter 58 mm restent à recetter
physiquement. L'imprimante indisponible ne doit pas bloquer la caisse.
