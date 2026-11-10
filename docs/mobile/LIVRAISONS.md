# Livraisons sur Android

Branche `codex/livraisons-distribution`, base `c9409c8`. Le module utilise le contrat du serveur SahelPOS Web sous `/api/livraisons/`.

## Prise en main livreur

1. Ouvrir l’invitation ou scanner son QR dans SahelPOS, puis se connecter à Accounts. Choisir la boutique autorisée et ouvrir le profil avec son PIN. Un PIN déjà présent reste attaché au même Membre. Les profils livreur salarié et prestataire ouvrent **Mes livraisons**.
2. Télécharger les missions. La liste distingue les opérations en attente et les statuts confirmés. Ouvrir la mission pour consulter les articles, appeler le destinataire ou lancer l’itinéraire externe.
3. Après la remise du magasinier, scanner les étiquettes `SP360-COLIS:<UUID>` ou pointer les colis dans la liste. Signer la prise en charge puis confirmer le départ.
4. Saisir les quantités réellement remises et signer avec le réceptionnaire. Justifier un reliquat ou déclarer un incident. Pour une mission partielle reprogrammée, la prochaine preuve porte sur les nouvelles quantités remises.
5. Déclarer un retour avec ses quantités et sa signature. Le dépôt doit confirmer la réception. Consulter les espèces à reverser et déclarer leur remise. Le caissier effectue le rapprochement. Une déclaration Mobile Money reste en attente de confirmation.
6. Consulter les tournées et leurs arrêts. Le départ et la clôture de tournée sont confirmés par le serveur avec une connexion. Les documents PDF sont servis par le serveur après le jalon correspondant et peuvent être partagés. L’impression de la fiche utilise le sélecteur d’impression Android.

## Hors connexion et données

La migration SQLite 17 crée des tables de missions, fonds et tournées, une file d’opérations et un consentement GPS. Le cache et la file portent le périmètre boutique, Membre et rôle du droit signé. La file métier conserve le corps JSON, la clé UUID, la version attendue et l’heure appareil. Chaque opération rejoue le même corps jusqu’à l’accusé de réception. Les transitions dépendantes peuvent être saisies sur le téléphone et sont affichées en attente tant que le serveur ne les a pas confirmées.

Une réponse 409 conserve l’opération en conflit et bloque ses suivantes pour la même mission. L’action **Examiner** impose une actualisation serveur avant de classer le conflit et ses dépendances. Les corps restent archivés sur l’appareil. Une révocation cache les missions et conserve la file. Une mission retirée du périmètre en ligne est retirée du cache de consultation. Un compte historique ou un profil de caisse garde son parcours local.

## Position

Le livreur peut activer le GPS sur une mission en cours. La boutique doit autoriser le suivi. Sur Android, le service de premier plan affiche une notification pendant la collecte, avec les autorisations de localisation au premier plan et en arrière-plan. Le consentement est limité à une mission et à 12 heures au plus. La déconnexion, le changement de profil, la fin de mission et le refus serveur arrêtent la collecte. Android et certains fabricants peuvent interrompre le suivi lorsque l’application est arrêtée ou restreinte par le système.

Seules les mesures fournies par le GPS sont mises en file. La synchronisation réutilise la clé de chaque point et attend son acquittement. Le tampon est limité à 500 points par mission. Les points non transmis deviennent inéligibles après 24 heures et sont purgés lors d’une reprise de synchronisation. En mode avion, la carte distante attend les points effectivement reçus.

## Recette

Sur une boutique et un appareil de test autorisés, vérifier les deux rôles livreur et les profils historiques. Essayer une route de caisse par lien profond en session livreur, un QR d’un autre colis, un retour déclaré puis réceptionné, deux tentatives partielles de la même mission, une réponse HTTP perdue et un changement d’affectation pendant une coupure réseau. Contrôler la persistance des écritures à la fermeture et l’absence de double opération sur le serveur.

Sur Android physique, vérifier la caméra, la signature tactile, le PIN et la biométrie, les autorisations GPS refusées puis accordées, l’écran verrouillé, le redémarrage du téléphone, la désactivation serveur, le partage et l’impression. Le bundle JavaScript et les tests locaux ne constituent pas cette recette. Les preuves photo et OTP, la disponibilité déclarative du livreur et le contrôle matériel restent à couvrir.

Vérifications locales du 10 novembre 2026, Node 24 et Expo 57

- `npm ci --legacy-peer-deps` a installé l’arbre verrouillé.
- `node --test tests/*.test.cjs` a réussi 114 tests, dont la reprise après perte de réponse, le conflit de version, la révocation, le refus GPS et les quantités restantes.
- `npx --no-install tsc --noEmit` a réussi.
- `EXPO_OFFLINE=1 npx --no-install expo export --platform android --no-bytecode` a produit le bundle JavaScript dans un répertoire temporaire. La version source est 1.3.0, code Android 9. La compilation native et la distribution restent à effectuer dans l’environnement autorisé.
