# Triage des dépendances Android — 8 octobre 2026

Audit de la candidate source, sans compilation native ni publication.
`package.json`, SDK Expo 57, React 19.2.3 et React Native 0.86 restent inchangés.
La [matrice officielle Expo 57](https://docs.expo.dev/versions/v57.0.0/)
confirme cette famille de versions.

## Corrections compatibles appliquées

`npm audit fix --legacy-peer-deps --ignore-scripts` seul conservait le verrouillage.
Les quatre dépendances transitives ci-dessous ont ensuite été actualisées par
`npm update brace-expansion compression shell-quote source-map-js
--legacy-peer-deps --ignore-scripts --prefer-online`, dans les plages existantes.
Aucun `--force`, override ou changement de SDK.

| Dépendance | Avant | Après | Avis traité |
| --- | --- | --- | --- |
| brace-expansion | 5.0.9 | 5.0.12 | Déni de service, GHSA-q2hr-2g5m-vwhr / qhr7-859c-m2p7 / 6j4f-fj2g-mc7p |
| compression | 1.8.1 | 1.8.2 | Fuite mémoire/déni de service, GHSA-vc2v-76pw-4v95 |
| shell-quote | 1.10.0 | 1.12.0 | [Injection de commande critique](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) |
| source-map-js | 1.2.1 | 1.2.2 | Déni de service, GHSA-68fv-2mgg-jv7q |

L'audit JSON obtenu pendant cette reprise passe de **33 avis (12 modérés,
20 hauts, 1 critique)** à **29 (12 modérés, 17 hauts, 0 critique)**. L'installation
initiale avait annoncé 31, et les synthèses de certaines commandes 27 après
correction ; conserver le comptage de l'audit JSON daté, pas mélanger ces
instantanés. Les entrées propagées par dépendance ne représentent pas 29 failles
indépendantes.

Les preuves `audit-before.local.json`, `audit-after.local.json` et
`audit-patched.local.json` restent locales et exclues de Git. Le DNS a nécessité
une correction locale de résolution, non incluse dans l'application.

## Avis résiduels et portée

| Racine | Chaîne observée | Décision |
| --- | --- | --- |
| [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), haut | micromatch → Metro/Expo ; outils de préparation du bundle | Aucun correctif publié selon l'avis ; ne pas traiter des projets/patrons non fiables avec ces outils. Mise à jour compatible amont requise. |
| [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv), haut | Expo CLI / code-signing-certificates | Aucun correctif publié selon l'avis consulté ; revoir la chaîne de signature dans l'environnement de build avant distribution. Ne pas confondre ce module avec la signature de licence Ed25519 de l'application. |
| [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq), modéré | xcode → config-plugins Expo | Version 7.0.3 contrainte par xcode ; une migration vers 11.1.1 ou plus exige validation amont, pas un override aveugle. |
| [decode-uri-component](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), modéré | query-string → Expo Router | Utilisé par la navigation ; portée potentiellement embarquée, pas seulement outils de build. La compatibilité et les liens malformés doivent être validés avec un correctif Router adapté au SDK 57. |

Les autres entrées Expo/Metro/React Native/Bluetooth sont des propagations de ces
chaînes, et non une preuve d'exploitation de tous leurs composants. L'audit
propose notamment Expo 44, React Native 0.72 ou Router 58 via `--force` : ces
changements incompatibles ne sont pas appliqués. Ne pas certifier le mobile
exempt de vulnérabilités ni prêt à distribuer sur la base de ces seuls tests.

La validation fonctionnelle après verrouillage rejoue les 103 tests JavaScript
et `npx tsc --noEmit`. Caméra, Bluetooth, signature, installation et mise à jour
sur appareil restent à recetter dans l'environnement autorisé.
