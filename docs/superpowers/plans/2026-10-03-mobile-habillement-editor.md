# Mobile Habillement Editor Implementation Plan

**Goal:** saisie native modale et atomique du modèle et de ses variantes, sans doublons ni perte de stock.
**Architecture:** validation pure du référentiel et matrice bornée; service SQLite utilisant une transaction exclusive et une outbox durable; composants natifs communs création/édition.
**Tech Stack:** React Native, Expo SDK 57, TypeScript, SQLite; tests Node avec SQLite réelle et adaptation des seuls modules natifs.
**Spec:** docs/superpowers/specs/2026-10-03-mobile-habillement-editor.md

## Contraintes
Aucun build natif, aucun workflow Actions, aucune fusion. Branche existante feat/mobile-commerce-profiles. Base observée 0b4ed87a67119ed809342b33804c3588c102c8cb. Le répertoire local de vérification est une copie partielle des sources, pas un clone complet.

## Tâches réalisées dans ce lot
- [x] Tester la matrice : déduplication, ordre stable, valeurs supprimées, 240/241, aucun axe explicite, SKU distincts.
- [x] Tester le service avec SQLite : transaction modèle/variantes/outbox; refus licence/rôle; rollback; rejeu; édition sans stock; absence de réactivation implicite.
- [x] Remplacer l'assistant à création intermédiaire par un dialogue partagé; intégrer la fiche et le gestionnaire de variantes; afficher erreurs et états vides.
- [x] Remplacer les lectures répétées du catalogue par deux lectures groupées, afficher les vraies pastilles et rechercher taille/couleur/SKU.
- [x] Protéger la photo provisoire pendant une sauvegarde et conserver la saisie après échec.
- [x] Exécuter les 24 tests ciblés, la vérification syntaxique des 12 fichiers TS/TSX et le typage strict des modules de domaine.

## Validation restant nécessaire
- [ ] Suite complète du dépôt et contrôle de types React Native/Expo complet.
- [ ] Parcours sur téléphone Android réel, notamment modal, photo, changement de profil et retour arrière.
- [ ] Validation mobile ↔ Django des achats, inventaires, échanges et commandes sur deux appareils.
- [ ] Parité des métadonnées Habillement Web : catégories Mode, marques, saisons, collections et schémas de tailles.

## Points de revue
Aucune valeur de référence inventée depuis un libellé client. Aucune sauvegarde pendant le passage d'une étape à l'autre. Aucun identifiant numérique local dans les nouveaux SKU synchronisés. Aucun écrasement de stock pendant l'édition. Les anciens services et écrans hors du lot ne sont pas déclarés validés par ces tests.
