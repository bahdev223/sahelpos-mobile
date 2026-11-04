# Stabilisation Android — 4 novembre 2026

**État : développements et tests automatiques, PR de recette à maintenir en brouillon. Aucune certification commerciale, installation physique ou mise en production.**

Le moteur Expo/React Native, SQLite, l'outbox et les logos officiels sont conservés. Version source : 1.3.1 / code 10, package `tech.saheltech.sahelpos`. Aucun nouveau numéro de distribution ni changement de signature. Une compilation du JavaScript Android/Hermes ne constitue pas une APK.

## Sources et consolidation

| Source | État vérifié au départ | Traitement |
| --- | --- | --- |
| Android `master` | `c9409c8a39e1409e04ba5c72b86b1082c70b5ed1` | Pas modifiée |
| Android candidate | `codex/android-harmonisation-20261101`, `41e167f6ec57a5d2983f64d656c3391c362d0bc8` | Base de travail ; contient déjà les travaux #8/#9/#11 |
| Android PR #8 | Ouverte en brouillon, `release/consolidation-sahelpos-20261031` | Conservation du socle métier et de la navigation |
| Android PR #9 | Ouverte, `codex/inscription-mobile-deux-etapes` | Inscription conservée |
| Android PR #10 | Ouverte en brouillon, `a0f098698b9fad3f24527edc3d5a59d62881d514` | Fusion locale sans conflit puis durcissement |
| Android PR #11 | Fusionnée dans la candidate, pas dans `master` | Corrections Habillement conservées |
| API/Web `main` | `eee7048705a8a47f815ff05e3355cf0c0852c45c` | Base serveur, contient PR #34 Multi-dépôts |
| API PR #33 | Ouverte en brouillon, `7156d51cadca3a918681447686c09ce1c28cfbff` | Journal financier et delta d'inventaire repris et renforcés |
| `sahelpos` | Documentation/ADR séparation métier et contrats | Référence d'architecture ; aucun deuxième backend créé |
| `saheltech-identity` | Contrat mobile OIDC/PKCE et intégration SahelPOS inspectés | Aucun changement ; retour Android réel non testé |
| `saheltech-payments` | Contrats d'intentions, idempotence et callbacks inspectés | Aucun changement ni paiement réel |

[Inventaire des branches et SHA au départ](branches-2026-11-04.json).

Les branches nouvelles sont `codex/android-stabilisation-20261104` et `codex/android-stabilisation-api-20261104`. Les contributions précédentes ne sont pas écrasées. Les PR Web #30/#32 (abonnements/paiements) et #31 (pilotage) ne sont pas implicitement intégrées à ce lot. Leur présence dans une PR ne prouve pas un déploiement.

## Matrice des 11 profils

Cette matrice compare les registres et services du Web aux routes/services Android. **C** = socle partagé présent dans le code ; **S** = adaptation spécialisée présente ; **L** = limite décrite plus bas. Ces lettres ne signifient pas « parcours natif testé ». Les 11 contrats de création de boutique produits par `contrat_mobile` sont testés avec 3 rôles ; leurs modes par défaut sont SIMPLE. Le profil affiché ne doit jamais ajouter une capacité absente du droit signé.

| Profil | Menu / accueil | Catalogue | Caisse / ventes | Stock / inventaire | Achats | Clients | Rapports | Paramètres | Spécificité / écart Web |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Commerce général | S | C + conditionnements | C + gros selon droit | C | C | C | C | C | Tarifs/conditionnements pilotés par capacités |
| Alimentation | C | C | C | C | C | C | C | C | Gestion avancée de péremptions non activée artificiellement |
| Habillement | S | S modèles/variantes | S tailles/couleurs/échanges | S matrice/inventaire | S arrivages/matrice | C | S | C | Multi-dépôts administré sur Web ; Android utilise le dépôt par défaut, recette à faire |
| Friperie | C | C | C | C | C | C | C | C | Mode avancé non pris en charge : restrictions du contrat conservées |
| Électronique | C | C | C | C | C | C | C | C | Numéros de série non portés hors ligne par ce lot |
| Électricité | S | S références/caractéristiques | S variantes/unités | S inventaire partagé | C | C | C | C | Ancien lien d'inventaire générique corrigé |
| Quincaillerie | S | S références/caractéristiques | S variantes/gros | S inventaire partagé | C | C | C | C | Mode ADVANCED compatible seulement si signé par le serveur |
| Cosmétique | C | C | C | C | C | C | C | C | Catalogue commun ; capacités de lots/péremption à contrôler séparément |
| Pièces détachées | C | C | C | C | C | C | C | C | Pas de nouveau moteur de compatibilité véhicules ajouté |
| Céréales et vrac | S | S denrées/poids | S poids/conditionnements/gros | S poids + vue lots | C | C | C | C | Web possède un parcours arrivages/réceptions vrac dédié, pas d'équivalent complet Android |
| Autre activité | C | C | C | C | C | C | C | C | Socle standard |

Sources : `src/domain/commerce.ts`, `navigation-mobile.ts`, `permissions-mobile.ts`, `src/profile-ui/`, routes `app/` ; côté Web `frontend/src/profile-ui/registry.ts`, `commerce-rules.ts`, profils standard/habillement/electricite/cereales-vrac, `backend/apps/commerce/mobile.py`.

`tests/fixtures/server-commerce-20261104.json` contient les **16 contrats réellement générés** par le serveur (11 défauts et 5 configurations particulières). `mobile-server-contracts.test.cjs` vérifie 16 contrats + 33 combinaisons profil/rôle. Les parcours complets création → caisse → stock → historique → déconnexion ne sont pas validés sur 33 sessions Android réelles.

### Parcours par rôle

| Parcours | Patron (`admin` local) | Gérant | Vendeur | Contrôle |
| --- | --- | --- | --- | --- |
| Accueil et caisse | Oui | Oui | Oui, périmètre vendeur | Navigation + droits signés |
| Catalogue / stock / achats | Oui | Oui | Pas de gestion | 33 combinaisons testées |
| Clients / règlement | Oui | Oui, même vente d'un autre vendeur | Ventes propres seulement | SQLite + API avec refus du périmètre tiers |
| Annulation de vente | Oui | Oui | Refus | Tests locaux/API |
| Commandes Habillement | Oui | Oui | Création/suivi permis comme sur Web | API testée ; annulation vendeur refusée |
| Arrivages / coûts | Oui | Oui | Ni mutation ni données d'arrivages | Régression serveur de confidentialité |
| Équipe / sauvegarde / abonnement | Oui | Accès restreint | Non | Registre des routes ; recette native ouverte |
| Modification boutique | Oui | Pas d'écriture signée | Non | Contrat d'écriture |

Le vendeur peut voir une entrée différente du gestionnaire sans que cela constitue une incohérence. Les contrôles de service/API restent nécessaires au-delà du menu. Une autre boutique ne remplace pas silencieusement la base locale ; ce lot conserve le refus protecteur existant.

## Correctifs et preuves

| Problème / cause | Modification | Vérification / résultat |
| --- | --- | --- |
| Deux synchronisations concurrentes pouvaient se chevaucher | Une promesse partagée pour le cycle | Un seul cycle HTTP pour deux appels |
| ACK ancien supprimant une modification récente | ACK limité aux objets envoyés encore SENDING | Nouvelle modification et objet non envoyé conservés |
| Pull écrasant un stock local non acquitté | Transaction et report du lot métier tant que l'outbox n'est pas vide | Vente créée pendant pull préservée ; curseur maintenu puis repris |
| Solde et journal lus à des instants différents | Snapshot des ventes sous transaction sérialisée | Régression : 500 + 200 reste 700 sur serveur simulé, contre 500 avant correction |
| Réexécution native d'une mutation incertaine | Reprise automatique réservée à SELECT ; transactions sérialisées | Erreur de pont, rollback et concurrence couverts |
| Double validation / retry caisse | Clé stable + empreinte de contenu + rapprochement du reçu | Une seule vente et une seule sortie de stock après retry/commit incertain |
| Clé caisse perdue à la fermeture du dialogue | Conservation jusqu'au succès, sans réinitialisation à chaque ouverture | Revue du flux ; fermeture native à recetter |
| Règlement doublé après réponse COMMIT perdue | Clé de requête stable et rapprochement du journal | Un paiement de 200 augmente 100 à 300, pas à 500 |
| Conversion locale non atomique | Validation + demande + outbox dans une transaction | Conversion pendant pull conservée ; erreur outbox annule toute la demande |
| Conversion serveur déjà TERMINEE rejouée comme PRETE | Reconnaissance du replay avant transition et contrôle mode/montant | Même conversion deux fois : une vente, stock diminué une fois ; contenu différent refusé |
| Ordre de verrous serveur incohérent | Boutique avant lignes métier, puis Commande | Revue statique ; concurrence PostgreSQL matérielle non exécutée |
| API renvoyant des ACK après rollback d'un lot | Vider appliques/ignores sur rollback | Erreur financière : aucune fausse confirmation |
| Événement financier réutilisé avec contenu différent | Empreinte serveur vente/nature/montant/mode/motif | Rejeu identique accepté, montant/mode différents refusés |
| Inventaires variantes partiellement appliqués ou obsolètes | Tout le lot transactionnel, référence de stock vérifiée | Échec 2e ligne annule 1re ; vente intervenue empêche l'écrasement |
| Comptage vide interprété comme zéro | Parseur explicite, zéro volontaire conservé | Valeurs vides/infinies/malformées refusées |
| Journal de vente variante utilisant le stock du panier | Relecture du stock dans la transaction, delta signé | Deux lignes : mouvements 5→4 puis 4→3 |
| Contacts/produit modifiés sans outbox atomique | Mutation et file dans la même transaction | Rollback sur panne de file |
| Droits UI ajoutés par le seul nom du profil | Intersection systématique avec contrat signé | 16 contrats, 11 profils × 3 rôles |
| Habillement bloqué avec Multi-dépôts | Reconnaissance de la capacité prise en charge par API #34 | Contrat automatisé ; vraie vente entre dépôts à recetter |

Les cinq blocages identifiés par la revue indépendante ont été corrigés. Les régressions ciblées et la relecture des chemins concernés sont positives ; cela n'est pas une garantie d'absence de tout bug dans l'application.

## Interface et performances

- Menu secondaire débarrassé des doublons des onglets ; recherche insensible aux accents et présentation compacte. Accueil conservé en premier.
- Sélecteur de variantes commun : dimensions côte à côte, recherche, intersection exacte taille/couleur et affichage progressif des choix.
- Inventaire variantes partagé par Habillement, Électricité et Quincaillerie ; deux requêtes groupées remplacent le chargement N+1. Les saisies gardent leur stock de référence lors d'un rafraîchissement automatique.
- Boutons sans troncature forcée, labels accessibles des champs, messages d'erreur annoncés, états de chargement cohérents et onglets adaptés à l'agrandissement du texte.
- Mise en page du menu en colonnes sur grande largeur, réduite quand les caractères sont agrandis. Les autres écrans réutilisent les composants communs existants.

**Limite visuelle :** aucune capture avant/après ni validation tactile effectuée ce jour. La tentative Chromium a échoué au lancement (`socket Operation not permitted`) ; le navigateur distant ne pouvait atteindre le serveur de prévisualisation. Aucun aperçu navigateur n'est compté comme test Android. Tous les écrans ne sont donc pas déclarés « premium validés ».

Aucune mesure native de démarrage à froid, mémoire, FPS ou latence caisse n'est disponible. L'amélioration N+1 est vérifiable dans le code ; aucun pourcentage de gain n'est inventé. Les ressources de marque existantes n'ont pas été remplacées.

## Résultats de validation

Environnement isolé Linux, Node 24.22.1, Python 3.12.14, Expo 57, dépendances verrouillées ; aucune donnée client.

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Android domaine/SQLite/protocoles | `npm test` | 225 tests réussis, aucun ignoré |
| TypeScript Android | `npx tsc --noEmit` | Réussi |
| Bundle JavaScript Android/Hermes | `EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 CI=1 npx expo export --platform android --output-dir /tmp/sahelpos-android-export-final --max-workers 2` | Réussi ; pas un APK |
| API/Django complet | `SAHELPOS_DEBUG=1 DATABASE_URL=sqlite:///:memory: python manage.py test --settings=sahelpos.settings_tests` | 772 tests recensés : 767 réussis, 5 ignorés |
| Migrations Django | `python manage.py makemigrations --check --dry-run` | Aucun changement de migration manquant |
| Web de référence | `npm test`, `npm run build` dans frontend | 72 tests réussis, TypeScript/Vite réussis ; source Web inchangée |
| Migration SQLite | Tests upgrade v9→v19, reprise interrompue, rejeu, installation neuve | PIN, droit, ventes, stock, photos et outbox préservés dans les fixtures |
| Téléphone / APK / imprimante / caméra / biométrie | Non disponible | Non exécuté |
| PostgreSQL concurrent | Non disponible | Non exécuté ; 5 tests de verrouillage d'invitations ignorés sous SQLite |

Les tests SQLite utilisent le moteur SQL réel de Node et les migrations de production, avec frontières Expo/réseau simulées. Ils ne prouvent pas le comportement du pont SQLite sur Android. Les tests serveur utilisent la base Django de recette. Les tests de rôles/navigation ne sont pas 33 parcours d'achat exécutés sur téléphone.

## Dépendances et limites avant distribution

1. Intégrer et tester en recette l'API comprenant #33, #34 et les correctifs de ce lot avant de distribuer le mobile. Migrations serveur 0003 puis 0004 du journal ; SQLite v18 puis v19, toutes additives.
2. L'outbox bloquée par un rôle, une licence ou une ancienne API **retarde tous les pulls métier**. Elle est conservée, le curseur ne progresse pas ; le diagnostic et le rafraîchissement de licence restent disponibles. Résoudre la cause, jamais purger la file pour débloquer.
3. Les événements serveur antérieurs à l'empreinte 0004 sont comparés sur vente/nature/montant ; leur mode/motif historique ne peut être reconstruit. Ne pas inventer une empreinte à partir du rejeu.
4. Contrôler ventes concurrentes sur deux téléphones hors ligne, Web actif et dépôt par défaut. Aucun scénario hors connexion ne garantit magiquement l'absence de survente globale sans règle métier adaptée.
5. Réaliser la revue de chaque écran, corrections complémentaires éventuelles et mesures natives. Les tableaux de bord/rapports existants ne sont pas déclarés équivalents à toute l'analytique Web.
6. L'abonnement et le renouvellement doivent être recettés sur la chaîne Identity/Payments de test autorisée. Ni intégration de PR paiements en attente ni transaction réelle effectuée ici.
7. Ne pas désinstaller l'application pour une mise à jour. Utiliser la signature officielle et vérifier l'APK déjà installée/versionCode avant de préparer la candidate distribuable.

## Recette physique à fermer avec preuves

Pour chacun des 11 profils, et Patron/Gérant/Vendeur : créer/rejoindre une boutique de recette → catalogue autorisé → caisse → vente → stock → historique → déconnexion. Noter appareil, Android, rôle, profil, SHA/API, APK/signature/versionCode, attendu, obtenu, capture et anomalie.

| Série | Scénarios obligatoires | État |
| --- | --- | --- |
| Écrans | Petit téléphone, grand téléphone, tablette, police système 100/150/200 %, clavier et retour Android | À faire |
| Identité | Identifiant, Google, inscription, invitation valide/expirée/révoquée, QR, retour à chaud/froid | À faire |
| Sessions | PIN, biométrie disponible/absente, Membre révoqué, horaires vendeur, changement boutique sans perte | À faire |
| Métier | Variantes, conditionnements, poids fractionnaires, crédit, règlement, retour, échange, annulation autorisée | À faire |
| Synchronisation | Mode avion, reconnexion, réponse perdue après commit, fermeture forcée, deux appareils + Web | À faire |
| Mise à jour | Base existante avec ventes/outbox/PIN/photos, installation signée sans désinstallation, comparaison avant/après | À faire |
| Matériel | Caméra refusée puis acceptée, QR métier/auth, Bluetooth RPP300/Xprinter, ticket 58/80 mm, imprimante absente | À faire |
| Abonnement | Expiration/grâce/renouvellement dans un périmètre de test, sans argent réel | À faire |
| Performance | Démarrage froid/chaud, catalogue représentatif, délai de validation, consommation mémoire | À faire |

Le statut reste **en cours de stabilisation** tant que ces éléments et les critères commerciaux demandés ne sont pas fermés avec preuves.

## Inventaire des routes Android

65 fichiers de routes, y compris layouts et redirections. Inventaire de code exhaustif ; aucun de ces chemins n'est marqué validé visuellement sur téléphone par ce lot.

| Fichier | Intervention dans ce lot | Validation physique |
| --- | --- | --- |
| `app/(tabs)/_layout.tsx` | Modifié/consolidé | À faire |
| `app/(tabs)/accueil.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/(tabs)/achats.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/(tabs)/caisse.tsx` | Modifié/consolidé | À faire |
| `app/(tabs)/catalogue.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/(tabs)/menu.tsx` | Modifié/consolidé | À faire |
| `app/(tabs)/stock.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/(tabs)/ventes.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/_layout.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/abonnement.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/achats/[id].tsx` | Existant, composants communs selon utilisation | À faire |
| `app/achats/index.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/achats/nouveau.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/categories.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/client/[id].tsx` | Existant, composants communs selon utilisation | À faire |
| `app/clients.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/connexion.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/demarrage.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/electricite/caracteristiques/[id].tsx` | Existant, composants communs selon utilisation | À faire |
| `app/electricite/inventaire.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/electricite/reference/[id].tsx` | Existant, composants communs selon utilisation | À faire |
| `app/factures.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/fournisseur/[id].tsx` | Existant, composants communs selon utilisation | À faire |
| `app/fournisseurs.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/approvisionnement-matrice.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/arrivages/[id].tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/arrivages/index.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/arrivages/nouveau.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/arrivages/reception/[id].tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/commandes/[id].tsx` | Modifié/consolidé | À faire |
| `app/habillement/commandes/index.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/commandes/nouvelle.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/echanges.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/inventaire.tsx` | Modifié/consolidé | À faire |
| `app/habillement/lots.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/modele/[id].tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/modele/nouveau.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/rapports.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/referentiel.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/showroom.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/habillement/variantes/[id].tsx` | Existant, composants communs selon utilisation | À faire |
| `app/import-produits.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/index.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/inventaire/[id].tsx` | Modifié/consolidé | À faire |
| `app/inventaire/index.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/notifications.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/parametres/boutique.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/parametres/imprimante.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/parametres/sauvegarde.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/parametres/synchronisation.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/parametres/utilisateurs.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/produit/[id].tsx` | Existant, composants communs selon utilisation | À faire |
| `app/produit/modifier/[id].tsx` | Modifié/consolidé | À faire |
| `app/produit/nouveau.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/quincaillerie/caracteristiques/[id].tsx` | Existant, composants communs selon utilisation | À faire |
| `app/quincaillerie/inventaire.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/quincaillerie/reference/[id].tsx` | Existant, composants communs selon utilisation | À faire |
| `app/stock/ajustement.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/stock/alertes.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/stock/commande.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/stock/initial.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/stock/lots.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/stock/mouvements.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/tableau-de-bord.tsx` | Existant, composants communs selon utilisation | À faire |
| `app/vente/[id].tsx` | Modifié/consolidé | À faire |
