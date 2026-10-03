# Vérification du lot mobile Habillement — saisie des modèles

Base mobile examinée : `0b4ed87a67119ed809342b33804c3588c102c8cb`.
Branche cible : `feat/mobile-commerce-profiles`.
Référence Web examinée : `41015a9b2fc6246306337646cb543011bf67f7ee`.

## Résultats exécutés

`node --test tests/mobile-habillement-editor.test.cjs` : **24 tests, 24 réussites, 0 échec** sous Node 22.16.
Les requêtes et transactions s'exécutent dans une vraie base SQLite en mémoire via `node:sqlite`. Les ponts natifs Expo, la lecture de licence et le générateur d'identité sont adaptés pour le test; cela ne teste pas leur implémentation Android. L'avertissement expérimental de Node SQLite est attendu.

`tsc --noEmit --strict --target ES2022 --module commonjs --skipLibCheck src/domain/*.ts` : réussi pour les trois nouveaux modules de domaine.
Analyse syntaxique TypeScript des **12 fichiers TS/TSX du lot** : 0 erreur. Il ne s'agit pas d'un contrôle de types de toute l'application ni d'un build natif.

## Couverture

Matrice issue des identités de référence synchronisées, déduplication, ordre canonique, plafond 240, référence disparue et couleurs HEX invalides. Sauvegarde atomique modèle/variantes/outbox, rejeu idempotent, rollback après panne SQLite, refus licence/rôle/profil/utilisateur désactivé. Édition conservant stock et variantes, conflit de version local, SKU distincts, prix invalides, activation explicite. Agrégation du catalogue sans double comptage des dimensions, recherche sans accents, routage des anciens liens. Photo temporaire conservée pendant commit et après erreur récupérable.

## Revue des parcours

Créer un modèle depuis le catalogue ouvre un dialogue natif; aucune écriture avant Enregistrer. Le même dialogue sert à modifier la fiche. Ajouter des variantes depuis la fiche ouvre une modal et non un panneau dépliant. Les anciennes routes produit sont redirigées uniquement pour HABILLEMENT. Le catalogue et les fiches se relisent au focus et après synchronisation, avec une erreur visible plutôt qu'un faux état vide.

Les nouvelles variantes commencent à zéro. L'édition de fiche n'écrit jamais le stock, l'unité, les sous-unités ou les prix spécifiques des variantes. Les données catégorielles stockées sont présentées comme des catégories, pas comme des collections Mode.

## Limites et suivi

La copie locale de vérification n'est pas le dépôt complet : la suite historique, le contrôle de types React Native complet et les tests sur Android n'ont pas été exécutés. Aucun APK n'a été compilé et aucun workflow GitHub Actions n'a été demandé. Ne pas considérer ce lot comme une validation de production ou une parité complète.

Les métadonnées Web avancées (catégories Mode, publics, marques, saisons, collections, schémas de tailles) et la saisie du stock initial/fournisseur intégrée au modèle restent à porter avec leur vrai contrat de synchronisation. Les autres parcours déjà présents sur la branche (achats matriciels, inventaires, échanges, commandes clients) exigent une validation croisée mobile/Django.

Point backend à vérifier avant fusion : `backend/apps/stock/services.py` utilise des mises à jour de quantité sans modifier explicitement `date_modification`. Vérifier que chaque variation de stock déclenche effectivement un nouveau pull du modèle et de la variante; les tests de ce lot ne prouvent pas cet invariant. Aucun changement backend n'est inclus dans ce commit.
