# Inscription mobile — adaptation des maquettes Web

Demande du 1er novembre 2026 : appliquer les deux étapes et les mêmes illustrations à l'application React Native existante. Branche `codex/inscription-mobile-deux-etapes`, base `c9409c8`, dépôt canonique `bahdev223/sahelpos-mobile`, cible `master`.

## Plan
- [x] Réutiliser les onze images du Web, embarquées en PNG pour Android/iOS sans téléchargement réseau.
- [x] Créer un sélecteur illustré commun et un panneau boutique : deux colonnes sur téléphone, grille élargie sur tablette, recherche, bordure bleue et coche.
- [x] Remplacer la création classique par Activité → Boutique et compte ; garder la protection PIN et l'enrôlement signé existants après inscription.
- [x] Réutiliser le choix d'activité et les champs métier après Google/Accounts, sans transférer ni redemander le mot de passe local ; préserver les parcours invitation/QR.
- [x] Tester les validations, la conservation des choix, les contrats API, puis tous les tests du dépôt et TypeScript. Revue et PR vers master ; pas d'APK/AAB, installation ou publication.

## Contraintes
Composants React Native natifs, logo officiel, zones tactiles d'au moins 48 points, clavier et zone sûre ; deux blocs empilés sur téléphone et côte à côte sur grande tablette. Pas de changement SQLite, PIN, outbox, droits, licences, signature, version ou abonnements.

Le serveur Web de référence est celui de la PR #22 : l'enregistrement des modes, devise et plan dans `/api/auth/onboarding/` nécessite sa fusion et son déploiement. La voie locale mobile conserve `/api/public/mobile/inscription/`, déjà compatible avec ces champs. Aucune action de production n'est autorisée par ce chantier.

## Vérifications initiales
Documentation Expo SDK 57 lue conformément à AGENTS.md. `npm ci --legacy-peer-deps` terminé ; audit npm signale 25 vulnérabilités préexistantes (2 faibles, 13 modérées, 9 hautes, 1 critique), aucune mise à jour automatique des dépendances. Baseline : 103 tests réussis, aucun échec. Aucun build natif.

## Résultat et preuves

Développé sur la base indiquée : création classique en deux étapes, recherche sans accents, onze illustrations du Web converties en PNG embarqués. Deux panneaux empilés sur téléphone et côte à côte dès 900 points. Les boutons restent accessibles dans un pied fixe ; zone sûre, clavier et retour Android sont gérés par les composants natifs. Les valeurs métier restent dans le parent lors d'un retour ou d'un départ vers Accounts.

Le parcours Google/Accounts reprend les mêmes champs métier sans recopier identité, mot de passe, PIN ou jeton dans le payload boutique. Le provisioning signé et le PIN viennent ensuite, selon les services existants. Une garde synchrone empêche deux créations concurrentes. La revue indépendante a identifié une erreur obligatoire masquée par une valeur serveur undefined ; correction avec test de régression rouge puis vert.

Vérifications du 1er novembre 2026, Windows, Node, branche de travail :

- `node --test tests/*.test.cjs` : **108 réussis, 0 échec, 0 ignoré**. Contrats de création, liste fermée des champs OAuth, validations, recherche, présence des images, et régressions existantes PIN/QR/droits/outbox.
- `npx tsc --noEmit` : **code de sortie 0**.
- `git diff --check` : aucun défaut d'espacement.
- Revue indépendante : aucun autre constat concret après correction du message obligatoire.
- Aperçu React Native Web des composants de production : 390 × 844 et 1024 × 1000, sélection illustrée, erreur obligatoire visible, saisie boutique conservée après Retour/Continuer, panneaux empilés puis côte à côte et pied fixe observés.

Captures : [activité](validation/inscription-mobile-2026-11-01/activite-390.jpg), [boutique](validation/inscription-mobile-2026-11-01/boutique-390.jpg), [compte](validation/inscription-mobile-2026-11-01/compte-390.jpg), [tablette](validation/inscription-mobile-2026-11-01/tablette-1024.jpg).

L'aperçu est un harnais temporaire hors dépôt : adaptateurs Web pour images/SVG et boutons Accounts simulés, sans SQLite, appel réseau ou création réelle. Il valide la disposition des composants, pas les comportements natifs du clavier, du bouton retour Android, de la zone sûre ou d'OAuth. Aucun essai d'authentification réel, APK/AAB, installation, build natif, GitHub Actions, fusion, déploiement ou distribution effectué. Les guides ci-dessous indexent cette évolution ; ils ne certifient pas les recettes historiques manquantes.
