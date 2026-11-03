# SahelPOS Android — correctifs P0 du 3 novembre 2026

## Etat du chantier

Branche mobile : `fix/mobile-stock-integrity-20261103`, derivee de `release/consolidation-sahelpos-20261031`.
Branche serveur : `bahdev223/sahelpos_web:fix/mobile-inventory-replay-20261103`, derivee de `main`.
Aucune fusion, migration de production, APK ni recette physique pendant ce chantier.

## Causes traitees dans le code

1. Deux moteurs d'inventaire divergeaient : l'ecran appliquait un delta au stock courant, alors que le service ecrasait le stock par la quantite comptee. L'ecran utilise desormais le service commun. La validation, les mouvements et leur outbox partagent la meme transaction. Comptage nul et inventaire sans ecart sont conserves ; les tailles/couleurs ne sont plus corrigees aveuglement au niveau du modele.
2. Les encaissements de credit et annulations modifiaient seulement SQLite, sans journal de mutation synchronisable. La migration locale v18 ajoute `operation_vente_mobile` (identifiant stable par operation) et son outbox, sans effacer les operations historiques.
3. `construirePayload` reconstruit le paiement initial d'une vente jamais envoyee, puis transmet ses paiements/annulations consecutifs comme evenements independants. Un pull ne remplace pas une vente avec des operations encore en attente d'ACK.
4. L'API Django accepte `operations_vente` avec idempotence, verrou de vente et controle du vendeur, appelle les services metiers existants (tresorerie/stock), et remonte `date_modification` pour les changements de montant et d'annulation.
5. Pour `INVENTAIRE`, le serveur applique le delta `stock_apres - stock_avant`, pas la quantite comptee brute : les ventes intervenues entre les deux appareils sont respectees.

## Sequence obligatoire de validation

**Ne pas distribuer l'Android avant d'avoir fusionne, migre et recetté le serveur compatible.**
Sauvegarder d'abord la base PostgreSQL et la base SQLite des appareils de recette.
Ne jamais resoudre un conflit de signature par une desinstallation qui effacerait l'outbox.

Serveur, sur un environnement de recette :

```sh
python manage.py makemigrations --check --dry-run
python manage.py migrate --plan
python manage.py test apps.sync.tests
```

Mobile, sur une copie isolee et avec les versions verrouillees :

```sh
npm ci --legacy-peer-deps
node --test tests/mobile-inventory-integrity.test.cjs tests/mobile-sale-integrity.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
```

Recette a effectuer sur telephone Android REEL, avec appareil et serveur de test :

- Vente 1 000 F, paiement initial 400 F, puis 100 F et 200 F sans reseau : redemarrer avant le premier push, puis pousser deux fois. Verifier 3 paiements et 700 F enregistres exactement une fois.
- Annuler une vente offline apres ou avant sa premiere synchronisation ; verifier un seul retour stock et aucune double sortie de tresorerie au push et a son rejeu.
- Effectuer un reglement sur le Web pendant que le mobile est offline : les conflits doivent rester visibles et les operations non acquittees ne doivent jamais disparaitre.
- Inventaire avec theorique 10, vente intermediaire jusqu'a 7, comptage 9 : correction -1, resultat local 6 ; pousser deux fois. Le Web applique le delta sur son propre stock.
- Produits a variantes, droits vendeur/gerant, role revoque, abonnement expire, outbox en FAILED/SENDING, coupure pendant la reponse HTTP, deux appareils.
- Migrer une SQLite v17 reelle de recette vers v18 SANS DESINSTALLER : garder PIN, ventes, files d'attente, photos locales, achats et recettes.
- Tester impression Bluetooth et navigation sur petits ecrans separement : non modifies par ce lot.

## Limites

Les tests sont **ajoutes au depot mais non executes par l'agent** : aucun poste Android, environnement Django/PostgreSQL ni dependances Expo verrouillees disponibles ici.
Une verification source statique ne remplace pas la compilation TypeScript ni les tests sur telephone.
Les anomalies UI non reproduites, la synchronisation des historiques anciens d'annulations et la resolution automatique de conflits inter-appareils restent ouvertes.
La branche d'inscription mobile PR #9 demeure distincte de la branche de consolidation PR #8 : les deux doivent etre reconciliees avant commercialisation.
