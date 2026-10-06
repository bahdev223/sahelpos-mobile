# Électricité et Commerce général — intégration mobile

6 octobre 2026. Branche `feat/electricite-commerce-general`, base `efa9b1698d7d9c5a712fdfe9369ae7c4faf2431e`. Intégration des écrans : commit `dc3cb68686403c798e6d542349f3feac8881c155`.

## Profils et parcours raccordés

ELECTRICITE est distinct d'ELECTRONIQUE. Le contrat signé, le choix du secteur et les onglets reconnaissent dix secteurs. Électricité réutilise le catalogue technique ; Commerce général conserve le catalogue simple sans dimensions obligatoires.

Les formulaires de référence affichent marque et référence fabricant pour Électricité et Quincaillerie. Les champs de tarif gros et le choix Détail/Gros en caisse sont disponibles pour Électricité, Quincaillerie et Commerce général uniquement lorsque WHOLESALE est accordé et le mode de vente vaut GROS ou MIXTE. Les restrictions de rôles et d'écritures restent inchangées.

Les routes `/electricite/reference/[id]` et `/electricite/caracteristiques/[id]` réutilisent les composants techniques, sans modifier le secteur de la session. La fiche porte le titre Référence électrique et conserve la matrice déjà présente. La réception partielle existante est accessible depuis les achats des deux nouveaux profils.

Aucun nouveau moteur de produit, variante, stock, achat ou synchronisation. Aucun produit ni mouvement de stock créé par le changement de vocabulaire des écrans.

## Corrections de calcul associées

Le prix propre d'une variante est converti dans l'unité vendue : 600 par mètre donne 60 000 pour 100 mètres lorsque ce prix spécifique est défini. Sans prix spécifique positif, le prix du conditionnement est conservé. Les lignes d'une même variante vendues à des prix différents ne fusionnent plus dans le panier. Le changement de quantité regarde la variante concernée, pas le cumul des autres tailles/caractéristiques du modèle.

## Vérifications locales exécutées

Sources vérifiées, Node 22.16, TypeScript disponible globalement :

`node --test tests/mobile-commerce-profile.test.cjs tests/mobile-electricite-commerce-general.test.cjs tests/mobile-commerce-integration.test.cjs tests/quincaillerie-pricing.test.cjs`

**31 tests ciblés réussis, 0 échec** : 6 contrats existants, 12 nouveaux profils, 7 tests d'intégration du domaine (routes/permissions/calculs) et 6 tests de tarifs de conditionnement. Ces tests n'exécutent pas les composants React Native sur téléphone.

`tsc --noEmit --strict --skipLibCheck --target ES2022 src/domain/commerce.ts src/domain/presentation-commerce.ts src/domain/prix-commerce.ts` : réussi. `git diff --check` : réussi.

Les six diagnostics de typage précédemment relevés en CI ont été corrigés : largeur des barres de progression, champs requis des modèles, type des lignes de document non persistées, quantite_recue dans la sync et objet de présentation du tiroir sans droits d'écriture. Le prochain run doit confirmer le contrôle complet Expo ; ce document ne l'annonce pas vert avant résultat.

## CI et limites de livraison

Le premier `npm ci` standard échouait sur des dépendances peer absentes du lock. `npm ci --legacy-peer-deps` installe l'arbre existant sans modifier les versions Expo/React Native. Le workflow exécute uniquement les tests JavaScript et `tsc --noEmit`, jamais une compilation native.

Le run 37422741131 précédant l'intégration des écrans exécutait 79 tests : 63 réussis et 16 échecs. Les échecs touchent notamment des anciens tests de connexion mono-compte, des chargeurs de modules de test incomplets, des fixtures SQLite anciennes et un fichier de marque Android généré absent. Ils n'ont pas été supprimés ni masqués pour obtenir du vert. Le typage comportait alors six diagnostics, corrigés par l'intégration.

Restent obligatoires avant fusion : suite complète verte, contrôle de types complet, recette sur Android réel, et scénario Web → mobile → Web avec variantes ET conditionnements. Le code de réception partagé ne constitue pas à lui seul une preuve d'absence de conflits entre deux téléphones. Le choix d'un profil sans variantes sur une boutique qui en possède déjà doit aussi être testé sans perte de données.

La partie Web possède les profils, presets, migration et référentiel électrique ; la généralisation de ses formulaires/fiches encore limités à QUINCAILLERIE reste distincte de cette intégration mobile. Ne pas annoncer la parité Web/mobile terminée.

Les anciens APK ne connaissent pas ELECTRICITE : ne pas activer ce secteur en production avant la disponibilité d'une version compatible compilée par le propriétaire du projet. Aucune fusion dans master, aucun déploiement, aucune compilation APK/AAB pour ce lot. Les outils temporaires de transfert des sources ont été supprimés après publication du commit vérifié.


Validation finale relancée après unités électriques, libellés d'approvisionnement et règles de tarifs/fiche technique.


Validation consolidée après mise à jour des harness historiques et du header achats par profil.
