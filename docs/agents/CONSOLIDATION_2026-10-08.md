# Directives agents — SahelPOS — Android

Date de décision : 8 octobre 2026. Objectif : prospection dès le 9 octobre 2026 (Africa/Bamako).

## Mission et priorités

SahelPOS, Fournea et École forment le même lot prioritaire. SahelPOS et Fournea sont déjà des services distincts ; consolider l'existant en conservant leur architecture, leur marque et leurs données. Accounts porte l'identité personnelle ; chaque application porte ses accès métier. Google est un moyen de connexion Accounts, pas un rôle ni la seule identité possible.

Les autres modules restent dans le périmètre : inventorier et intégrer les contributions utiles, terminer les dépendances, puis clôturer le lot par la recette École et la validation des trois applications. La prospection est un objectif ; elle ne permet pas de présenter un parcours non vérifié comme disponible.

## Périmètre de ce dépôt

Application Android React Native/Expo, SQLite et outbox locale. Le backend canonique reste bahdev223/sahelpos_web ; ne pas recopier le serveur ni déplacer le mobile dans le dépôt web.

Branche de référence : `master`. Source inspectée pour cette directive : `3323c1c1cbfc9b46a291b7dfd014644b08ecb66c`. Ce SHA est un point de départ historique, pas une version déployée certifiée. La publication de cette documentation ne constitue pas une consolidation technique ou une recette de production.

Documentation existante à lire et conserver :

- [docs/accounts-qr.md](../../docs/accounts-qr.md)
- [docs/mobile/README_MOBILE_AGENT.md](../../docs/mobile/README_MOBILE_AGENT.md)
- [docs/electricite-commerce-general.md](../../docs/electricite-commerce-general.md)
- [docs/cereales-vrac.md](../../docs/cereales-vrac.md)

## Travail attendu de l'agent

1. Relever les branches/PR/contributions, la source officielle, les commits présents et les écarts avec serveur et mobile distribués. Respecter les travaux concurrents et les règles locales.
2. Distinguer demandes, code existant, fusion, tests, déploiement et distribution. Examiner les contributions avant de les intégrer ; garder les évolutions métier utiles et régler leurs incompatibilités.
3. Corriger les blocages du parcours complet, puis exécuter les vérifications adaptées. Avancer jusqu'au résultat concret et documenté, pas uniquement jusqu'à un nouveau plan.
4. Coordonner les contrats d'API/identité/synchronisation avec les dépôts concernés ; ce document n'autorise pas à déclarer leurs états sans inspection.
5. Mettre à jour les guides ci-dessous dans ce dépôt et relier leurs résultats au README. Fournir commits/branches et limites exacts ; ne jamais annoncer un push/fusion/déploiement non exécuté.

## Contrôles propres à SahelPOS — Android

- Préserver tech.saheltech.sahelpos, la signature existante, SQLite, les PIN/profils et l'outbox. Vérifier app.json et les versions réelles ; le README indique une source 1.3.0/versionCode 9, ce qui ne prouve pas une APK installée.
- Valider caméra, QR d'invitation, QR de connexion et scan produit comme usages distincts ; vérifier lien profond, navigateur système, retour à chaud/à froid et annulation.
- Accounts identifie la personne ; le serveur fournit boutique, Membre et droit signé. Préserver la liaison historique et le contrat PKCE existant ; aucun secret confidentiel dans Android.
- Tester PIN/biométrie, changement de Membre/boutique, rôle révoqué et licence hors connexion. La déconnexion ou une mise à jour ne purge pas silencieusement les opérations en attente.
- Vérifier achats, caisse et parité des capabilities réellement activées : habillement/variantes, unités et conditionnements, céréales/vrac, autres profils disponibles. Navigation par pages et saisies adaptées aux consignes existantes.
- Tester coupure pendant push, reprise, deux appareils et absence de doublons de vente/stock. Vérifier RPP300 et ticket 80/88 mm sur le matériel.

## QR, rôles et données

Documenter séparément invitation, connexion/appairage et scan métier. Vérifier cible, durée, expiration/révocation/rejeu, compte déjà connecté, mauvaise entreprise, mauvais service et permission caméra. Le serveur attribue le rôle ; le QR n'accorde pas un droit arbitraire. Conserver l'approbation explicite d'une connexion lorsqu'elle existe.

L'identité commune ne donne aucun accès croisé automatique. Un commercial SahelTech vendant les services n'est pas automatiquement un vendeur/caissier de l'entreprise cliente. Ne lier aucun ancien compte sur la seule égalité d'email.

Sur mobile existant, préserver stockage privé, PIN/biométrie et opérations en attente. Une déconnexion, une mise à jour ou un changement de contexte ne doit pas supprimer silencieusement une outbox. Vérifier droits révoqués, reprise et idempotence ; aucun secret de client confidentiel dans l'application mobile.

## Documentation à produire et maintenir

Créer les fichiers suivants sous `docs/agents/` en français, à partir de preuves du dépôt et de la recette. Leur absence doit être signalée ; cette directive ne prétend pas les avoir déjà remplis.

| Fichier | Contenu requis |
| --- | --- |
| `ETAT_CONSOLIDATION.md` | Sources/branches/SHA/PR, versions source/serveur/mobile, fonctions disponibles, autres modules existants, blocages, prochaine action. |
| `PRISE_EN_MAIN.md` | Connexion Accounts/Google et voie sans Google, ouverture/rejoindre l'espace, équipes/QR/rôles, premières opérations métier et aide. |
| `MOBILE_ET_SYNCHRONISATION.md` | Natif existant ou web mobile, versions/signature/installations autorisées, caméra, liens profonds, hors connexion, reprise, données et imprimante si applicable. |
| `RECETTE_ET_DEMONSTRATION.md` | Scénarios reproductibles, données d'essai, rôle/appareil, résultats attendus et obtenus, tests et limites. |
| `FICHE_SERVICE.md` | Public cible, bénéfices, fonctions disponibles, offres/prix vérifiés dans les sources autorisées et contact. Aucun prix ni paiement opérationnel inventé. |
| `EXPLOITATION_ET_DEPLACEMENT.md` | Configuration sans secrets, dépendances, persistance, sauvegarde/restauration, mesures de ressources et procédure future de déplacement/retour arrière. |

Ne pas copier les historiques des autres projets ni leurs données dans ce dépôt. Si un guide équivalent existe, conserver son autorité et faire un index explicite vers lui au lieu d'entretenir deux vérités.

Pour chaque contrôle, enregistrer : scénario/commande exacte, commit, environnement/base, date, appareil si applicable, résultat, preuve non sensible et anomalie. Utiliser les états : à faire, développé, fusionné, testé automatiquement, testé sur appareil, déployé, distribué. Un pourcentage ou un service « Running » ne remplace pas la preuve du parcours.

## Vérifications et démonstration

Dans ce dépôt : npm ci --legacy-peer-deps ; node --test tests/*.test.cjs ; npx tsc --noEmit. Confirmer les scripts actuels dans package.json. Aucun APK/AAB ici avant stabilisation et respect de la consigne de compilation. Documenter la recette matérielle dans l'environnement autorisé.

Parcours commercial à rendre reproductible : Invitation sur le web → scan Android → connexion Accounts → droit Membre → PIN → vente hors connexion → reprise réseau → contrôle côté web → impression si disponible.

Utiliser des données d'essai identifiables dans un périmètre dédié. Les montants et opérations simulés ne doivent pas être présentés comme des transactions réelles. Si l'accès production/appareil est absent, documenter exactement la partie non vérifiée.

## Exploitation actuelle et futur VPS

Garder le VPS actuel. Documenter l'autonomie déjà existante, les dépendances Accounts/Payments, bases/fichiers/tâches et les adresses locales qui empêcheraient un déplacement. Préparer sauvegarde/restauration et domaines/API stables ; préserver la compatibilité des mobiles distribués.

Le futur VPS de 4 Go est une cible de dimensionnement : mesurer RAM/CPU au repos et en charge, pics de synchronisation, base/fichiers et marge système avant de proposer deux, trois ou quatre services. La présente consolidation ne demande pas le déplacement immédiat de la production.

## Consignes permanentes

- Ne pas utiliser ni déclencher GitHub Actions sans autorisation. Pour les commits de ce chantier, conserver `[skip ci]` et ne pas contourner un contrôle de branche.
- Ne pas compiler une version mobile ici avant sa stabilisation ; respecter les consignes existantes de compilation et l'environnement autorisé.
- Préserver les bases clientes, les opérations locales, les signatures, les licences et les migrations progressives. Ne pas faire de désinstallation/réinitialisation destructive pour faciliter une recette.
- Conserver les règles métier et les modules internes validés ; partager les contrats utiles sans réécriture globale ou fusion des applications.
- Ne pas exposer secrets, jetons, données scolaires ou commerciales réelles dans les guides et les preuves.

## Critères de livraison

Le dépôt est consolidé lorsque la source est claire, les contributions utiles sont intégrées, les migrations/API sont compatibles et les contrôles adaptés ont des résultats vérifiés. La démonstration exige un parcours réellement reproductible. La production et le mobile distribué demandent en plus leurs preuves de déploiement, signature/version et recette appareil.

Terminer par un bilan donnant, pour chaque module concerné : disponible en démonstration, disponible en production, preuve, blocage restant et prochaine action. Les opérations non exécutées restent explicitement ouvertes.
