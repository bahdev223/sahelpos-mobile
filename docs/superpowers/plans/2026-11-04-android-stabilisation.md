# SahelPOS Android — stabilisation par lots

> Exécution : superpowers:executing-plans, dans la branche dédiée. La mission utilisateur du 4 novembre est la spécification ; conserver l'existant et le hors ligne.

**Objectif :** consolider les correctifs existants, protéger les opérations locales et harmoniser les parcours sans annoncer de recette native non réalisée.

**Architecture :** Expo/React Native, SQLite et outbox conservés ; Django reste l'autorité serveur. Base mobile `41e167f`, serveur `eee7048`. Intégrer la PR mobile #10 sans remplacer #8/#9/#11 ; préparer les changements serveur dans une branche distincte.

## Contraintes

- Aucun changement de production, paiement réel, donnée client, signature ni identité Android.
- Branches et PR dédiées ; commits `[skip ci]` conformément aux règles du dépôt.
- Tests locaux automatisés distincts des tests téléphone, Bluetooth, caméra et biométrie.
- Pas de fonctionnalité métier avancée activée par simple changement de libellé.

## Tâches

1. [x] Consolider #10 dans la candidate contenant #8/#9/#11 ; exécuter `npm test` et `npx tsc --noEmit` avant/après.
2. [x] Reproduire puis corriger les risques de synchronisation : appels concurrents, ACK supprimant une modification plus récente, écrasement local par pull avec outbox non acquittée, rattachement des règlements aux rôles.
3. [x] Vérifier les migrations SQLite et la reprise après perte de handle : aucune réexécution automatique d'une mutation incertaine ou d'une transaction.
4. [x] Vérifier #33 avec le serveur courant, ses permissions, ses contraintes de données et ses tests ; documenter les dépendances avant APK.
5. [x] Comparer les 11 profils et 3 rôles à partir de `commerce.ts`, `permissions-mobile.ts`, des routes et du registre Web ; distinguer présence du code et parcours exécuté.
6. [ ] Harmoniser les composants communs, navigation et sélections compactes ; vérifier le typage et le rendu quand l'environnement le permet.
7. [ ] Mesurer les chemins de démarrage et chargement, corriger les problèmes reproductibles ; régressions complètes, revue indépendante et PR documentées.
8. [ ] Recette native : installation avec conservation SQLite, petits/grands téléphones, tablette, texte agrandi, mode avion, deux appareils, caméra/QR, biométrie et imprimante. Nécessite matériel et environnement Android disponibles ; ne pas cocher sans preuve.

## Risques à vérifier explicitement

- Une réponse HTTP peut être perdue après validation serveur.
- Une nouvelle vente ou modification peut arriver pendant une requête réseau.
- Un gérant encaisse une vente d'un vendeur ; un vendeur ne peut pas annuler.
- Une licence devient restrictive alors que des opérations locales attendent.
- Une base ancienne ou un handle natif défaillant ne doit pas perdre/rejouer de l'argent.

## Preuves de départ

- `npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund` : 627 paquets installés, lock inchangé.
- Base `41e167f` : 136 tests réussis ; TypeScript réussi.
- GitHub privé accessible via connecteur ; clonage CLI Web sans identité disponible. Sources récupérées à SHA fixé pour validation locale.

## Journal de décisions et limites

- Consolidation additive : base mobile `41e167f` + branche #10 ; base API `eee7048` + #33. Aucune branche principale modifiée.
- Le pull métier attend une outbox vide : priorité à l'intégrité du stock. Une opération bloquée par un rôle, une licence ou une ancienne API retarde aussi les lectures métier et le curseur ; la licence continue d'être rafraîchie. Les opérations restent visibles dans le diagnostic de synchronisation.
- La reprise du pont SQLite rejoue uniquement une lecture SELECT. Une mutation incertaine est remontée ; l'encaissement possède désormais une identité durable pour retrouver son reçu.
- Les inventaires de variantes utilisent une transaction pour tout le lot et refusent une référence de stock devenue obsolète. Deux requêtes remplacent la boucle N+1 de chargement.
- Les autorisations commandes/arrivages suivent les vues Web existantes : commandes pour les membres, annulation pour les gestionnaires, arrivages uniquement pour les gestionnaires.
- Les opérations financières serveur anciennes sans empreinte conservent la comparaison vente/nature/montant ; le moyen de paiement historique n'était pas stocké et ne peut pas être reconstruit avec certitude.
- 6 : composants et navigation modifiés, rendu natif non validé. Tentative de capture Chromium refusée par le runtime (`socket Operation not permitted`), navigateur cloud incapable d'atteindre le serveur local.
- 7 : compilation Expo Android/Hermes réussie, mesures natives de démarrage/latence non disponibles ; revue finale terminée sur les correctifs ; cinq défauts reproduits corrigés et retestés.
- 8 : bloqué par l'absence de téléphone, SDK/adb et signature de distribution configurés. Aucun APK signé ni installation physique. Ne pas conclure à une livraison commerciale.

- Résultat final local : 225 tests mobile, TypeScript et bundle Android/Hermes réussis ; API 772 tests recensés dont 767 réussis et 5 ignorés (PostgreSQL), Web 72 tests réussis. Matrice et recette native ouvertes dans `docs/agents/STABILISATION_ANDROID_2026-11-04.md`.
