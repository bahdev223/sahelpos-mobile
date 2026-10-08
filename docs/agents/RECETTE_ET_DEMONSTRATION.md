# Recette Android — 8 octobre 2026

Windows, Node local, source `c9409c8`, dépendances du lockfile installées via
`npm ci --legacy-peer-deps`. Pas d'APK/AAB/prebuild/Gradle/Actions.

| Contrôle | Résultat |
| --- | --- |
| `node --test tests/*.test.cjs` | 103 tests réussis, 0 échec |
| `npx tsc --noEmit` | Exit 0 |
| Installation dépendances | Réussie ; audit de dépendances signale 31 vulnérabilités (12 modérées, 18 hautes, 1 critique), triage requis |
| Téléphone et signature | Non exécuté |
| API déployée / Accounts réel / paiement réel | Non exécuté |

La tentative d'audit détaillé `npm audit --omit=dev --json` a échoué par DNS
(`ENOTFOUND registry.npmjs.org`). Les nombres d'avis remontés à l'installation
ne sont pas une preuve d'exploitabilité de l'APK ; ils restent à qualifier avant
distribution. Aucun `npm audit fix --force` ni changement de SDK effectué.

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
