# Navigation Mobile SahelPOS — refonte multi-profils 2026-10-09

## Décisions
Un seul registre `src/domain/navigation-mobile.ts` alimente le tiroir historique et la nouvelle page `Menu` des onglets Android. Aucune logique d'ajout par comparaison de titre « Gestion », « Activité » ou secteur au milieu du rendu.

Architecture de navigation : **Ventes**, **Catalogue**, **Stock**, **Approvisionnements**, **Pilotage**, **Organisation**. Les rubriques concernent Commerce général, Habillement, Céréales/Vrac, Électricité, Quincaillerie, Électronique, Friperie, Cosmétique, Pièces détachées. Elles sont projetées selon secteur, rôle et `capabilities_effectives` déjà signées.

Les achats et ventes restent des routes actives, accessibles directement depuis Menu, le tiroir et leurs raccourcis métiers. Le cinquième onglet est Menu ; la caisse et le catalogue restent directs lorsqu'ils sont autorisés. Le tiroir s'adapte à la largeur réelle de la fenêtre et sa navigation n'attend plus 220 ms.

## Autorisations
- Vendeur : Caisse, ses ventes et leurs reçus, clients, commandes clients Habillement, notifications. Les ventes appartenant à d'autres utilisateurs sont refusées par la fiche.
- Vendeur : bénéfice et annulation de vente masqués. Le filtrage du journal sur l'utilisateur existait déjà ; il est conservé.
- Gérant : pas d'accès à la gestion locale des utilisateurs, sauvegardes et abonnement tant que ces opérations ne disposent pas de contrôle métier approprié.
- Les capabilities spécialisées (`VARIANT_EXCHANGE`, `PURCHASE_MATRIX`) doivent être présentes dans le contrat pour faire apparaître leurs écrans. Un menu ne crée pas de droit serveur.

## Validation à exécuter AVANT fusion
`cd sahelpos-mobile && npm ci && npm test` ou `node --test tests/mobile-navigation.test.cjs`, type-check TS/TSX, route check Expo.

Recette sur appareil Android (sans créer de nouvel APK dans cet environnement) : 320, 360, 390, 412 px ; vendeurs/gérants/patrons ; tous les secteurs ; retour navigation sur détails ; mode hors ligne ; synchronisation et changement de compte ; permissions directes et bénéfices cachés.

N'activer GitHub Actions qu'après autorisation expresse. Ne jamais publier une release Android sans vérification réelle de la navigation sur téléphone et des journaux vendeurs.
