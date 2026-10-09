# Recette Android — 8 octobre 2026

La [recette du 9 octobre](LIVRAISON_ANDROID_2026-10-09.md) complete ce releve
avec les verifications de mise a jour et l'etat exact du telephone.

Windows, Node local, source `c9409c8`, dépendances du lockfile installées via
`npm ci --legacy-peer-deps`. Pas d'APK/AAB/prebuild/Gradle/Actions.

| Contrôle | Résultat |
| --- | --- |
| `node --test tests/*.test.cjs` | 103 tests réussis, 0 échec |
| `npx tsc --noEmit` | Exit 0 |
| Installation et reprise sécurité | Réussies ; audit JSON avant/après corrections compatibles : 33 → 29 avis, 0 critique après |
| Téléphone et signature | Non exécuté |
| API déployée / Accounts réel / paiement réel | Non exécuté |

La première tentative détaillée a échoué par DNS. La reprise a produit les
audits JSON et quatre mises à jour transitives compatibles, sans changement de
SDK. Les 29 avis résiduels sont triés dans
[le guide sécurité](SECURITE_DEPENDANCES_2026-10-08.md) ; leur nombre n'est pas
une preuve d'exploitabilité de l'APK. Aucun `npm audit fix --force` effectué.

Les tests utilisent du SQLite local et des simulations ciblées : ils couvrent
PIN préservé, outbox, refus de profil étranger, refus d'une autre boutique,
scope de rôle, challenge réellement ouvert dans le navigateur et reprise des
curseurs. Ils ne prouvent pas une caméra Android, Google réel ou Bluetooth.

Démonstration à exécuter sur recette : invitation vendeur web → scan Android →
Accounts → droit Membre → PIN → produit à stock 10/prix 500 F → vente hors
connexion quantité 2 → réseau rétabli → exactement une vente de 1 000 F et stock
8 côté web → impression. Ce sont des données simulées.

Répéter après coupure pendant l'envoi, avec deux appareils, un QR expiré/annulé/
réutilisé, mauvais service, révocation et changement de rôle. Mettre à jour le
binaire signé avec des écritures en attente et vérifier leur conservation.
Tous ces scénarios matériels restent à faire ; ne pas annoncer une distribution.
