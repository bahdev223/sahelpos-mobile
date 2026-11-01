# État Android — 8 octobre 2026

Reprise du 9 octobre : voir [le compte rendu Android](LIVRAISON_ANDROID_2026-10-09.md)
pour la signature, la compilation et l'installation. Les absences de tests
materiels mentionnees ci-dessous decrivent le releve historique du 8 octobre.

Source canonique : `bahdev223/sahelpos-mobile`, `master`,
`c9409c8a39e1409e04ba5c72b86b1082c70b5ed1`. Candidate :
`codex/sahelpos-consolidation-20261008`. Source 1.3.0, versionCode 9,
package Android / bundle iOS `tech.saheltech.sahelpos`, scheme `sahelpos`.

PR 1, 3 et 4 fusionnées ; PR 2 fermée. PR 3 intègre la release 1.3.0
complète ; ne pas fusionner de nouveau des branches historiques.

Dernière release GitHub : [mobile-v1.2.0](https://github.com/bahdev223/sahelpos-mobile/releases/tag/mobile-v1.2.0),
19 septembre 2026, cible `fc4cf772a0f97e35c8f1f9f6fb60fbc9ada72c72`.
Asset `app-release.apk`, 68 063 016 octets, SHA-256 annoncé
`4de79a43eabc7930df5f310ed980fce157d72441b6ccd7396f5ebbd6512b2013`.
Signature non inspectée ; version installée inconnue. Les anciens guides
mentionnant 1.2.3/code7 sont historiques, pas le manifeste actuel.

Backend officiel : `bahdev223/sahelpos_web`, main
`891e0d0b42d718ac23df7db6b306526ced94c3c5` au départ de la recette.
L'ancien `bahdev223/sahelpos` est une autre lignée non archivée, dernier SHA
`6be8e618d10b1ae8bcb22c67d5cd891ddbdde2b6` ; ne pas en faire un second backend.

Les [103 tests JS](RECETTE_ET_DEMONSTRATION.md) passent. Aucun build natif
ou test téléphone. Code préparé ne signifie pas prêt à distribuer.
Relevé d'exploitation du coordonnateur le 8 octobre vers 22 h UTC : web
`sahelpos.saheltech.tech` healthy, image `4dbb5b4c61dc873680f9de1bf15ee437c6aeb598`
déployée à 10:35:56 UTC, sans configuration Accounts/client SahelPOS à ce relevé.
Aucun droit Fournea/École n'est accordé par SahelPOS.

La reprise [sécurité des dépendances](SECURITE_DEPENDANCES_2026-10-08.md) corrige
quatre dépendances transitives compatibles, dont l'avis critique shell-quote.
L'audit résiduel reste à 29 avis (aucun critique), principalement propagés depuis
quatre chaînes amont ; cela n'autorise pas une distribution mobile.
