# Harmonisation commerciale SahelPOS — 13 octobre 2026

Objectif demandé : Android et Web harmonisés, intégration sur les branches principales, distribution commerciale visée jeudi 15 octobre 2026.

## État exact de cette reprise

**NON VALIDÉ POUR DISTRIBUTION COMMERCIALE. Aucune fusion sur master/main et aucun déploiement effectués pendant cette reprise.**

- Mobile canonique inspecté : `master`, `c9409c8a39e1409e04ba5c72b86b1082c70b5ed1`.
- Branche de préparation créée : `release/harmonisation-commerciale-20261013`.
- Base choisie : `feat/navigation-unifiee-mobile-20261009`, `380c73686684fe053fd758d9612205500e5de88f`. Les cinq commits de navigation restent ainsi présents sans créer une troisième navigation.
- Correctif local et tests : `eae8d1771e99486605ef55d9e5c4124001a1271f`.
- Web canonique inspecté : `main`, `1cb8b93c1dd2fa5efc7a52684c7783d7205a5997` ; aucun fichier Web modifié pendant cette reprise.
- Branche Web à rapprocher : `fix/auth-onboarding-invitations-30m-20261011`, `b326229784aaf60bf789d68eebfd33d772983c28`, 31 commits devant le point commun et 6 commits derrière main au relevé. Ne pas remplacer main par son arbre : cela supprimerait des changements récents.
- Autre contribution Web à préserver : `feat/ux-concours-onboarding-nav-commandes-20261011`, `a6fc1b2a59849e482044a7f16544d1521fdc83d2` (navigation, cartes, commandes, secteur des boutiques supplémentaires).

## Correctifs réellement appliqués

Dans `src/db/repositories/vente.ts` :

1. Un règlement local refuse les valeurs non finies, non entières, non sûres, nulles ou négatives. La caisse Android travaille ici avec des montants entiers ; les historiques incompatibles sont refusés explicitement, jamais arrondis silencieusement.
2. Le reste à payer est relu dans la transaction. Un règlement supérieur au solde ou ajouté après règlement complet est refusé sans modification SQLite.
3. Les montants existants incohérents sont refusés avant écriture.
4. L'annulation locale rétablit le stock de la variante exacte et celui du produit parent. Le mouvement de retour conserve `variante_id`, son stock avant et son stock après.
5. Une variante d'un autre produit ou un produit absent provoque l'annulation de toute la transaction au lieu de perdre silencieusement le retour.

**Limite essentielle : cela corrige le calcul et le stock LOCAUX. Le paiement différé et l'annulation ne sont toujours pas des événements synchronisés de bout en bout. Ce correctif ne rend donc pas ces deux parcours commercialement validés.**

## Preuves de tests de cette reprise

Test ajouté : `tests/mobile-sale-integrity.test.cjs`.

Le test charge le vrai fichier TypeScript du dépôt, transpile son code, puis exécute ses requêtes SQL sur SQLite en mémoire. Seul le pont Expo est remplacé. Les données sont synthétiques, aucune base cliente n'est lue ou modifiée.

Environnement disponible : Linux, Node 22.16.0, TypeScript global 5.8.3, `node:sqlite` (avertissement expérimental de Node). Ce n'est pas l'environnement Expo 57 / TypeScript 6.0.3 verrouillé du projet.

Commande exécutée :

```sh
NODE_PATH=/opt/nvm/versions/node/v22.16.0/lib/node_modules node --test tests/mobile-sale-integrity.test.cjs
```

- Avant correctif : 14 tests, 6 réussis, 8 échecs reproduisant surpaiement, valeurs invalides et retour de variante incorrect.
- Après correctif puis nouvelle exécution : 14 réussis, 0 échec, 0 ignoré.
- SHA de blob du fichier source testé : `b62c999c85fe83d3b3d0d9fbecceae2b6faecbaf`.
- SHA de blob du test exécuté : `347487224c4d6fa25a7e626303ee8d7bfbbc0a32`.
- Les deux SHA ont été rapprochés des fichiers relus sur GitHub après le push.

**Non exécutés :** suite complète du projet, vérification TypeScript globale, tests Django/PostgreSQL, recette navigateur, caméra, Google/Accounts réel, test sur Android, Bluetooth, build APK et déploiement.

## Blocage d'environnement constaté

Desktop Commander Remote indique qu'aucun appareil n'est en ligne (`DESKTOP-854LIGR` hors ligne). Dans l'environnement temporaire, le clonage GitHub et l'installation des dépendances échouent par résolution DNS. Le connecteur GitHub permet de lire et d'écrire le code ; cela ne fournit ni un terminal sur le poste de build ni un accès au téléphone ou au serveur de production.

Aucune tentative de contourner les contrôles par GitHub Actions. Aucun APK, secret ou matériel de signature modifié. Aucune désinstallation, purge SQLite ou réinitialisation d'outbox.

## P0 restants — avant fusion commerciale

### 1. Événements financiers Mobile ↔ Web

`encaisser` et `annulerVente` restent des écritures locales sans événement financier dédié. `_creer_vente` dans `backend/apps/sync/api.py` retourne immédiatement une vente déjà connue. Ajouter simplement `marquerChangement('vente', ...)` ne règle donc pas le problème.

Développer et tester conjointement : identité durable de chaque paiement/annulation, état initial conservé pour une vente non encore synchronisée, accusé de réception de l'opération, idempotence serveur, contrôle Membre/rôle et verrouillage transactionnel du solde. Tester deux appareils et le cas réponse serveur perdue. Ne pas transmettre à la fois un retour de stock indépendant et une annulation serveur qui restituerait déjà le même stock.

### 2. Inventaires : corriger le chemin réellement utilisé

L'écran `app/inventaire/[id].tsx` contient sa propre fonction `validerInventaire`, distincte de `src/services/inventaire.ts`. Le premier applique le delta au stock courant ; le second remet le stock physique directement. Les deux versions inspectées n'inscrivent pas leurs mouvements dans l'outbox.

Ne pas corriger seulement le service inutilisé en croyant que l'écran est réparé. Mutualiser la validation utilisée par l'écran et les services, figer le comptage, appliquer un delta cohérent et inscrire les mouvements dans la même transaction. Vérifier ventes pendant comptage, lignes non comptées, validation répétée et reprise après interruption.

### 3. Autorisations et expiration

Revoir les contrôles de mutation, pas seulement les liens visibles. Vérifier explicitement les droits expirés avec `ecritureMobileAutorisee` et `exigerEcriture(type)`, dont le contrôle typé doit tenir compte de `active/perime`. Rejouer vendeurs/gérants/patrons, fiche vente étrangère, remise, annulation, changement de profil et conservation de l'outbox.

### 4. Achats et synchronisation

Contrôler annulation d'un brouillon, annulation après réception partielle, événement de paiement fournisseur, écriture de l'outbox atomique avec l'opération et réponse perdue. Une réception ne doit jamais être comptée deux fois.

### 5. Connexion et invitations

Aligner Android sur le consentement explicite et les invitations Web de 30 minutes. Retirer les boutons sans action de l'ancien écran (Google/mot de passe oublié), mutualiser le choix des 11 activités, préserver Google, identité SahelTech, PIN et biométrie existants. Ne pas associer des comptes historiques par email seul.

### 6. Consolidation des branches

- Réconcilier navigation Android et `codex/sahelpos-consolidation-20261008`, notamment les tests de migration et le lockfile.
- Sur Web, rapprocher les deux contributions d'inscription au lieu de conserver deux sélecteurs de secteurs divergents. Préserver le correctif de secteur des boutiques supplémentaires et la toolbar commandes.
- Ne pas fusionner aveuglément `feat/habillement-android-100` : son protocole et ses migrations doivent être rapprochés de l'API actuelle.

## Vérifications à reprendre sur le poste autorisé

```sh
# Android, dans une copie isolée de la branche de préparation
npm ci --legacy-peer-deps
npm test
npx tsc --noEmit
```

Pour le Web : installer les dépendances verrouillées, exécuter la suite Django sur PostgreSQL et la vérification des migrations, puis build/tests/lint frontend selon les scripts actuels. Ajouter les tests d'intégration financiers manquants avant leur implémentation.

Ensuite seulement : revue des diffs et des écarts de branches, fusion sur `master` mobile et `main` Web sans force-push, sauvegarde et déploiement Web contrôlé. La compilation Android exige la stabilisation préalable ; conserver impérativement le certificat existant, puis installer en mise à jour sans désinstallation.

La distribution de jeudi reste conditionnée à une recette réelle : enrôlement → vente hors ligne → arrêt/reprise → synchronisation → contrôle Web → paiement différé/annulation → imprimante. Aucun de ces parcours complets n'est certifié par les 14 tests locaux ci-dessus.
