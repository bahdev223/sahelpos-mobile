# Candidate Android du 1er novembre 2026

## Sources reunies

Demande : recuperer les mises a jour, aligner Android sur les travaux Web
et compiler une nouvelle APK. La contrepartie Web est l'hypothese retenue
pour le terme vocal ambigu « sa Corona » ; aucune autre application fusionnee.

- Depot Android : `bahdev223/sahelpos-mobile`.
- Base metier : `release/consolidation-sahelpos-20261031`, `b289f72`.
- Inscription illustree : `codex/inscription-mobile-deux-etapes`, `97bd716`.
- Branche reunie : `codex/android-harmonisation-20261101`.
- Commit applicatif compile : `60c62de`.
- Web local actualise par avance rapide : `bahdev223/sahelpos_web`, main
  `68d1e48a20fdb8f2175f40a9bede28f53f0dd1a5`.
- La base Android contient deja la navigation par role, les corrections
  reglements/retours de variantes, les arrivages et achats fournisseurs
  hors ligne, ainsi que les tests de migration du 9 octobre.
- Ajout des deux commits d'inscription du 1er novembre, sans abandonner
  ces corrections. Les six conflits de fusion etaient documentaires ;
  les deux historiques et leurs limites sont conserves.

Cette integration n'est pas une copie des composants React Web vers React
Native et ne certifie pas une parite visuelle complete de tous les ecrans.
Les branches historiques deja incluses ne sont pas refusionnees.

## Identite et controles

- Version candidate : **1.3.1 / code 10**, contre 1.3.0 / code 9 sur le
  TECNO KL5 detecte via adb avant compilation.
- Package conserve : `tech.saheltech.sahelpos`, scheme `sahelpos`.
- Domaine conserve : `https://sahelpos.saheltech.tech`.
- Cle de signature existante, credentials ignores ; aucune nouvelle cle.
- Aucun reset SQLite, desinstallation, changement de PIN ou purge outbox.
- Aucun changement serveur ni lancement de GitHub Actions.
- `npm ci --legacy-peer-deps --no-audit` : 608 packages installes.
- `node --test tests/*.test.cjs` apres installation : **136 passes, 0 echec,
  0 ignore**. Donnees de test synthetiques, pas une recette client reelle.
- `npx tsc --noEmit` : sortie 0.
- `git diff --cached --check` avant commit : sortie 0.
- `/sante/` sur le domaine public : HTTP 200, `{"etat":"ok"}`.
  Cela ne prouve ni le SHA deploye ni la reussite d'une synchronisation.
- Inspection des sources backend : champs secteur, modes de vente et
  approvisionnement, devise et plan presents dans le contrat d'onboarding ;
  routes de synchronisation des arrivages presentes. Pas d'essai de creation
  ou de transaction sur la production.

## Compilation locale

Copie isolee existante :
`C:\Users\hp\Documents\ChatGPT\sahelpos-consolidation-mobile`, accessible
par la jonction courte `C:\sp130`. Aucun nouveau depot produit cree.

Preparation native : `npx expo prebuild --platform android --no-install`.
Le dossier Android genere de cette copie a ete recree par Expo ; la copie
originale `C:\sahelpos-mobile\android` n'a pas ete modifiee. Plugin de
signature rejoue et controle : `signingConfigs.release`, version 1.3.1/code 10.

Depuis `C:\sp130\android` :

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$env:ANDROID_HOME = 'C:\Android'
$env:ANDROID_SDK_ROOT = 'C:\Android'
$env:NODE_ENV = 'production'
.\gradlew.bat assembleRelease --console=plain --max-workers=2
```

Journal local hors Git :
`C:\Users\hp\Documents\ChatGPT\sahelpos-build-20261101.log`.

Resultat : **BUILD SUCCESSFUL in 1h 27m 34s**, 833 taches executees.
Les avertissements SDK XML, API depreciees et future incompatibilite Gradle 10
n'ont pas empeche le build actuel sous Gradle 9.3.1.

## Binaire verifie

| Controle | Resultat |
| --- | --- |
| Fichier | `C:\Users\hp\Documents\ChatGPT\sahelpos-android-release-20261101\SahelPOS-1.3.1-code10.apk` |
| Taille | 63 750 219 octets |
| SHA-256 APK | `720630773c80ca56ac00cdb9476a050cf275e599224a22e51ed94fd6ce685480` |
| Package et version aapt | `tech.saheltech.sahelpos`, 1.3.1 / code 10 |
| Android | minSdk 24, targetSdk 36, arm64-v8a et armeabi-v7a |
| Debug | Aucun flag `application-debuggable` dans aapt |
| Signature apksigner | Valide, schema v2, RSA 4096, CN SahelPOS / SahelTech |
| Certificat SHA-256 | `e72cde0127b7db6b3a37a278b92782ea2bc7d5f785cec4c5f5dda6d568ebd40e`, identique au certificat de la livraison installee le 9 octobre |
| Installation | Non effectuee pendant cette reprise ; la demande portait sur la compilation |

Les APK et les journaux restent hors du depot Git. Aucun essai natif avec
ce binaire n'est revendique. Pour installer ensuite sur l'appareil autorise,
verifier son identifiant et utiliser `adb -s <serie> install -r <APK>` ;
ne jamais desinstaller ou purger les donnees pour contourner un refus.

## Limites et essais restants

L'APK demandee est une candidate de recette, pas une publication commerciale.
Google/Accounts complet, PIN/biometrie, retour navigateur, clavier natif,
ventes hors ligne, reprise de synchronisation, deux appareils et imprimante
doivent etre testes sur le materiel et une entreprise de recette autorisee.
Aucun deploiement, fusion de master ou remplacement du telechargement public
n'est compris dans cette compilation. Aucun audit npm recent n'a ete execute
dans cette reprise ; les avis historiques ne sont pas declares corriges.
