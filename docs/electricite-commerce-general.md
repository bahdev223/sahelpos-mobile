# Profils Électricité et Commerce général — socle mobile

6 octobre 2026. Branche `feat/electricite-commerce-general`, base `efa9b1698d7d9c5a712fdfe9369ae7c4faf2431e`.

Le contrat signé reconnaît désormais ELECTRICITE, distinct d'ELECTRONIQUE. Le sélecteur des secteurs et le resolver UI contiennent dix secteurs. Les onglets utilisent déjà ce resolver : Références / Appro. / Rayons pour Électricité ; Produits / Achats / Catégories pour Commerce général.

Les capacités de ces deux nouvelles configurations UI sont intersectées avec le contrat signé. Un affichage de profil ne crée pas de droits d'écriture. Les contrats inconnus restent rejetés. Aucun moteur de variante, stock, achat ou synchronisation n'est dupliqué.

## Vérifications réellement exécutées

Copie locale partielle des sources, Node 22.16 et TypeScript disponible globalement :

- 12 nouveaux tests dans `tests/mobile-electricite-commerce-general.test.cjs` : réussis.
- 6 tests existants dans `tests/mobile-commerce-profile.test.cjs` : réussis. Seule l'attente de liste des secteurs a été étendue à dix ; les contrôles des contrats et des anciens profils sont conservés.
- Total ciblé : 18 réussites, 0 échec.
- `tsc --noEmit --strict --skipLibCheck --target ES2022 src/domain/commerce.ts` : code de sortie 0.

Blobs rapprochés de la copie testée : `src/domain/commerce.ts` = `885e1aec4a95a8778069b08c092155c4c20021a2` ; `tests/mobile-commerce-profile.test.cjs` = `59af737f70a693322d5362b364c8bfaf57980346`.

Ce n'est pas le contrôle de types Expo complet, ni une recette Android, ni un test d'intégration réseau. Le workflow ajouté exécute uniquement les tests JavaScript et `tsc --noEmit` : aucun Gradle, Expo run:android, EAS build, APK ou AAB.

## Travail encore nécessaire avant livraison

Les formulaires et fiches contiennent encore des conditions réservées à QUINCAILLERIE. Il faut généraliser leur configuration pour ouvrir correctement marque, référence fabricant, variantes techniques et tarifs détail/gros à Électricité ; puis ouvrir le tarif gros au Commerce général seulement quand son contrat l'autorise. Les routes de caractéristiques et les parcours variante + conditionnement doivent être vérifiés de bout en bout.

Le serveur possède le référentiel Électricité dans les mêmes tables DimensionVariante/ValeurDimension. Les anciennes versions de l'application ne reconnaissent pas ce secteur. Aucune activation de production avant la sortie d'une version mobile compatible compilée par le propriétaire du projet.

Aucune fusion dans master, aucun déploiement, aucune compilation native pour ce lot. Détails du lot coordonné : `sahelpos_web/docs/commerce/electricite-commerce-general.md`.
