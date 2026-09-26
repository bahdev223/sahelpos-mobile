# SahelPOS Mobile - passation agent

Date de reference : 2026-09-26

Ce document est la consigne de passation pour tout agent qui reprend la version mobile SahelPOS. Il doit etre lu avant toute modification du depot mobile.

## Depots et responsabilites

- Depot mobile local : `C:\sahelpos-mobile`
- Depot web/backend local garde pour le produit : `C:\sahelpos-web`
- Ancien depot temporaire `C:\nere` : ne plus l'utiliser comme source de verite.
- Depot web GitHub final : `https://github.com/bahdev223/sahelpos_web.git`

La version Android ne doit pas etre modifiee depuis `C:\sahelpos-web`. Le code mobile se travaille dans `C:\sahelpos-mobile`.

## Etat technique mobile

Stack :

- Expo SDK 57
- React Native 0.86
- Expo Router
- SQLite local via `expo-sqlite`
- Auth locale par PIN + biometrie Android via `expo-local-authentication`
- Impression Bluetooth via `react-native-bluetooth-classic`
- Camera via `expo-camera`
- Notifications via `expo-notifications`

Identite application :

- Nom : `SahelPOS`
- Android package : `tech.saheltech.sahelpos`
- Version actuelle dans `app.json` : `1.2.3`
- `versionCode` Android actuel : `7`
- Build Android release signe par plugin local : `./plugins/signature-release`

## Commandes importantes

Toujours se placer dans le depot mobile :

```powershell
cd C:\sahelpos-mobile
```

Verification TypeScript :

```powershell
npx tsc --noEmit
```

Tests de non-regression mobile actuellement utiles :

```powershell
node --test tests\periodes.test.cjs tests\clients-photo.test.cjs tests\login-terminal.test.cjs tests\mobile-headers.test.cjs tests\mobile-price-override.test.cjs tests\mobile-first-start-security.test.cjs
```

Test branding :

```powershell
npm run test:branding
```

Compiler l'APK Android release :

```powershell
cd C:\sahelpos-mobile\android
.\gradlew.bat assembleRelease
```

APK genere :

```text
C:\sahelpos-mobile\android\app\build\outputs\apk\release\app-release.apk
```

Verification du fichier APK :

```powershell
Get-Item C:\sahelpos-mobile\android\app\build\outputs\apk\release\app-release.apk | Select-Object FullName,Length,LastWriteTime
```

Installer sur telephone branche en debogage USB :

```powershell
adb devices
adb install -r C:\sahelpos-mobile\android\app\build\outputs\apk\release\app-release.apk
```

Si l'installation echoue pour signature incompatible :

```powershell
adb uninstall tech.saheltech.sahelpos
adb install C:\sahelpos-mobile\android\app\build\outputs\apk\release\app-release.apk
```

Attention : `adb uninstall` supprime les donnees locales du telephone. Ne le faire que si le test accepte de repartir de zero.

## Mode de compilation

La version livree au telephone est une release Android Gradle :

```powershell
.\gradlew.bat assembleRelease
```

Ce n'est pas un simple `expo start`, ni un build web. La release active :

- Proguard/R8 via `enableProguardInReleaseBuilds`
- Shrink resources via `enableShrinkResourcesInReleaseBuilds`
- ABIs `armeabi-v7a` et `arm64-v8a`
- plugins Expo et plugins locaux declares dans `app.json`

Ne pas livrer une version debug a un client sauf demande explicite.

## Flux d'installation / premier demarrage

Le mobile ne cree pas un espace autonome sans le serveur. SahelPOS Web reste l'autorite au premier lancement :

1. L'utilisateur se connecte ou cree son espace SahelPOS.
2. Le serveur remet un droit/licence utilisable hors ligne.
3. Le mobile fait le bootstrap local SQLite.
4. L'utilisateur definit un PIN local de caisse.
5. Si Android a une empreinte configuree, SahelPOS declenche le vrai prompt systeme Android.
6. Si l'utilisateur accepte, le compte local est lie a la biometrie.
7. Si l'utilisateur annule, le PIN local reste la voie de secours.

Fichier principal :

```text
app/demarrage.tsx
```

Regle critique : le PIN local doit toujours etre cree via le service d'authentification :

```ts
creerUtilisateur({ login, nom, pin, role: 'admin' })
```

Ne jamais inserer `code_pin` directement en SQL dans `app/demarrage.tsx`. Le service `creerUtilisateur` hache le PIN. Une insertion directe en clair casse la connexion apres redemarrage.

Test qui protege ce point :

```text
tests/mobile-first-start-security.test.cjs
```

## Login mobile / caisse

Le login mobile n'est pas un selecteur d'utilisateur.

Regles verrouillees :

- Pas de checkbox utilisateur.
- Pas de liste de comptes avant authentification.
- Pas de bouton custom "empreinte" dessine par SahelPOS.
- Le terminal connait deja le compte local a ouvrir.
- Si la biometrie est activee, Android affiche automatiquement son `BiometricPrompt`.
- Si la biometrie echoue ou est annulee, l'ecran PIN reste disponible.
- Apres authentification seulement, l'application peut afficher le nom de l'utilisateur.

Fichier :

```text
app/connexion.tsx
```

Test :

```text
tests/login-terminal.test.cjs
```

## PIN local

Le PIN est un code numerique de 4 a 8 chiffres. Il remplace le mot de passe web pour ouvrir la caisse sur le telephone.

Service source :

```text
src/services/auth.ts
```

Fonctions importantes :

- `creerUtilisateur`
- `modifierUtilisateur`
- `connecter`
- `verifierAccesCaisse`

Ne jamais comparer le PIN en clair. Ne jamais stocker le PIN en clair.

## Horaires vendeur / acces caisse

Un vendeur peut consulter son espace, mais ne doit pas encaisser hors horaires si un creneau est defini.

Regle :

- Ex : acces caisse `07:00` a `23:00`
- A `23:10`, le vendeur ne peut plus vendre.
- L'historique et la consultation restent accessibles.

Controle :

```text
src/services/auth.ts
verifierAccesCaisse()
```

## Prix modifiable au panier

Dans la caisse mobile, le vendeur doit pouvoir changer le prix unitaire dans le dialogue d'ajout panier.

Fichier :

```text
app/(tabs)/caisse.tsx
```

Point attendu :

- Le dialogue d'unite contient un champ `Prix unitaire`.
- Changer d'unite remet le prix par defaut de l'unite.
- Le panier utilise le prix saisi, pas seulement `unite.prix`.

Test :

```text
tests/mobile-price-override.test.cjs
```

## Clients et photos/profils

Les clients peuvent avoir une photo/profil.

Fichiers concernes :

- `app/clients.tsx`
- `app/client/[id].tsx`
- `src/db/repositories/client.ts`
- `src/db/schema.ts`
- `src/domain/types.ts`

Test :

```text
tests/clients-photo.test.cjs
```

Regle importante : les chemins d'images doivent rester persistants apres fermeture/reouverture de l'app. Ne pas stocker seulement une URI temporaire de picker.

## Images produits

Probleme deja identifie : les images ajoutees sur mobile doivent persister localement et partir vers le web a la synchronisation.

Regles a respecter :

- Copier l'image choisie dans un emplacement durable de l'application.
- Enregistrer le chemin durable en SQLite.
- Ajouter la donnee image/chemin a la file de synchronisation.
- Ne pas utiliser directement une URI temporaire d'ImagePicker comme valeur durable.

## Synchronisation

La synchro mobile est offline-first :

- Les ecritures locales marquent des changements dans l'outbox.
- La racine de l'application reveille la synchronisation.
- La reprise reseau et le retour au premier plan relancent la synchro sans bloquer l'utilisateur.

Fichiers :

- `src/services/synchronisation.ts`
- `app/_layout.tsx`
- `app/parametres/synchronisation.tsx`

Regle UX : pas d'alerte agressive si Internet est absent. L'application doit rester utilisable hors ligne.

## Migrations SQLite locales

Point critique : une seule erreur SQLite ne doit pas faire tomber toute l'application.

Problemes deja vus :

- colonnes manquantes apres mise a jour
- `NativeDatabase.prepareAsync has been rejected`
- erreurs du type colonne locale absente

Regles :

- Les migrations locales doivent etre idempotentes.
- Ajouter une colonne doit tolerer le cas ou elle existe deja.
- Ne jamais supposer qu'un telephone client est sur le schema le plus recent.
- Si une migration echoue, preferer reparer proprement ou reconstruire/resynchroniser selon strategie controlee.
- Ne pas afficher un ecran technique brut au client.

Fichiers :

- `src/db/database.ts`
- `src/db/schema.ts`

## Notifications

Les notifications doivent fonctionner en local meme sans push distant.

Points metier :

- Produits expires ou bientot expires.
- Produits en stock bas.
- Notifications internes avec son.
- Notifications push/web/mobile a consolider.

Fichiers :

- `src/services/notifications`
- `app/_layout.tsx`

Permission Android :

```text
android.permission.POST_NOTIFICATIONS
```

## Impression Bluetooth

Materiel teste :

- Xprinter Bluetooth
- Nom vu : `LN-1316UN`
- Selftest imprimante : interface USB & BT, 58mm, ESC/POS.

Regles :

- Filtrer les appareils inutiles si possible.
- Memoriser la derniere imprimante selectionnee.
- Tenter une reconnexion en arriere-plan au demarrage/reprise app.
- Ne jamais bloquer l'ouverture de l'application si l'imprimante est eteinte ou hors portee.
- Le ticket doit couper le papier si l'imprimante supporte la coupe.
- Les informations entreprise doivent apparaitre sur tickets petit et grand format.
- Le logo ticket est optionnel et doit etre adapte aux imprimantes 58mm.

Fichiers :

- `src/services/impression`
- `src/services/impression/transports`
- `app/_layout.tsx`

## Recu / facture / logo

Regles demandees :

- Tickets petits et grands formats avec infos entreprise.
- Logo optionnel sur ticket si configure.
- Facture PDF partageable.
- Depuis une vente, pouvoir reimprimer le recu et generer/partager la facture.

Attention aux imprimantes 58mm : le logo doit etre reduit, monochrome et centre. Ne pas envoyer une image trop large.

## Ecrans mobiles importants

Ecrans deja travailles ou a preserver :

- Login/demarrage mobile SahelPOS.
- Connexion caisse PIN + biometrie Android systeme.
- Clients : liste, detail, historique ventes, detail vente.
- Inventaire.
- Alertes de stock / liste a commander.
- Caisse avec prix modifiable.
- Utilisateurs/vendeurs avec header visible.
- Achats : page a ameliorer pour commandes a venir et export/historique.

Regle design : ne pas refaire l'application en mode web deguise. Le mobile doit rester natif, dense, clair, rapide.

## Web / mobile : frontieres

Le web/backend final est `C:\sahelpos-web`.

Le mobile consomme les API et synchronise, mais ne doit pas incorporer directement la logique Django/Web.

Ne pas reintroduire `Nere` dans le branding mobile. Le nom visible mobile reste `SahelPOS`.

## Categories produit - decision a respecter

Decision metier recente :

- Pas de hierarchie visible Famille -> Categorie.
- Une seule notion visible : `Categorie`.
- Categories plates, precises, independantes, avec icone.
- Les marques restent separees des categories.

Exemples :

- `Telephones`
- `Chargeurs telephone`
- `Cables USB`
- `Ecouteurs Bluetooth`
- `Batteries telephone`
- `Power banks`

Ne pas faire :

- `Samsung` comme categorie
- `Galaxy` comme categorie
- une taxonomie ERP lourde dans l'interface mobile

Philosophie assistant :

- Si le commercant tape `Samsung Galaxy A15`, proposer `Telephones`.
- Si le commercant tape `Oraimo FreePods`, proposer `Ecouteurs Bluetooth`.
- La categorie reste facultative.

## Tests a lancer avant toute livraison mobile

Minimum avant compilation :

```powershell
cd C:\sahelpos-mobile
npx tsc --noEmit
node --test tests\periodes.test.cjs tests\clients-photo.test.cjs tests\login-terminal.test.cjs tests\mobile-headers.test.cjs tests\mobile-price-override.test.cjs tests\mobile-first-start-security.test.cjs
npm run test:branding
```

Puis :

```powershell
cd C:\sahelpos-mobile\android
.\gradlew.bat assembleRelease
```

Ne jamais annoncer qu'une version est prete sans :

- sortie `BUILD SUCCESSFUL`
- verification de l'APK avec `Get-Item`
- horodatage APK recent

## Ce qu'un agent ne doit pas faire

- Ne pas toucher au code mobile depuis `C:\sahelpos-web`.
- Ne pas utiliser `C:\nere` comme depot actif.
- Ne pas stocker le PIN en clair.
- Ne pas remettre un selecteur de comptes sur l'ecran login mobile.
- Ne pas dessiner une fausse modale biometrie SahelPOS : utiliser le prompt Android.
- Ne pas bloquer l'app si Internet ou l'imprimante est indisponible.
- Ne pas casser l'offline-first.
- Ne pas afficher des erreurs SQLite techniques au client.
- Ne pas supprimer la base locale client sans strategie explicite.
- Ne pas livrer un APK debug a un client.
- Ne pas committer `backups/`, `node_modules`, `.next`, `dist`, builds temporaires.

## Dernier build mobile connu

Dernier APK release genere pendant cette passation :

```text
C:\sahelpos-mobile\android\app\build\outputs\apk\release\app-release.apk
```

Dernier horodatage observe :

```text
26/09/2026 12:27:32
```

Taille observee :

```text
62 207 700 octets
```

Ce build incluait :

- correction PIN local premier demarrage
- proposition biometrie Android apres creation PIN
- login terminal sans selecteur utilisateur
- prix unitaire modifiable dans le dialogue d'ajout panier
- headers achats/utilisateurs corriges
- branding SahelPOS mobile

