# Accounts et QR — Android (candidate stable)

Google et Scanner QR sont visibles au démarrage et sur Connexion multi-profils. La connexion SahelTech par identifiant/mot de passe ouvre le même navigateur système. Le callback central et les secrets restent sur les serveurs ; Android n’échange qu’un ticket lié à son verifier S256, puis choisit une boutique autorisée.

La licence Ed25519 doit correspondre au Membre et à la boutique locale. Un profil récupère son `Membre.id_local` permanent ; son PIN est initialisé uniquement s’il est encore absent. Les PIN existants, données de vente et écritures en attente sont conservés. PIN/biométrie continuent hors ligne sans Google à chaque ouverture.

Le nouveau jeton d’appareil est lié à une appartenance. Seul le profil correspondant au Membre et au rôle signés peut ouvrir une session locale et encaisser ; les autres profils restent conservés et peuvent être réactivés par leur propre connexion SahelTech. Le login historique d’un compte lié utilise aussi ce Membre, sans fabriquer un administrateur ni remplacer un PIN existant. Les écritures d’autres profils restent en attente jusqu’à reconnexion du profil concerné. Une autre boutique est refusée avant mutation locale. Les anciennes licences sans Membre gardent leur contrat historique.

Le curseur de synchronisation suit la boutique, le Membre et le rôle signés. Un changement d’appartenance ou de rôle, même reçu par renouvellement de licence, relance la lecture complète pour retrouver l’historique devenu visible. Aucune donnée locale ni opération en attente n’est supprimée.

Dépendance ajoutée : `expo-web-browser` ~57.0.2, SDK Expo 57. `expo-camera` et le scheme `sahelpos` existaient déjà. Installer avec `npm ci --legacy-peer-deps`, comme la candidate de base. Aucun prebuild, Gradle, APK/AAB ou GitHub Actions exécuté.

Validation locale : `node --test tests/*.test.cjs` — 103/103 ; `tsc --noEmit` — exit 0. Les tests comprennent SQLite pour le PIN/outbox, annulation du navigateur, challenge/verifier réel, QR étranger, refus d’enrôler une autre boutique, finalisation du login historique lié, interdiction d’un profil étranger et changement de périmètre de synchronisation.

Configuration et résultats backend/Web : `sahelpos_web/docs/accounts-qr-configuration.md` et `docs/accounts-qr-validation.md`. Avant publication : client Accounts enregistré, secret serveur configuré, migration PostgreSQL et recette physique caméra/deep link/PIN/biométrie/réseau. La version source consolidée est 1.3.0/versionCode 9 ; aucun APK 1.3.0 n’est déclaré signé ou publié par cette consolidation.
