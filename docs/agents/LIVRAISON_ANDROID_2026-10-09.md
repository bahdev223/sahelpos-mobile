# Livraison Android du 9 octobre 2026

## Mission et source

Reprendre la consolidation, verifier les contrats et migrations, compiler une
APK signee puis mettre a jour le telephone sans desinstallation. L'utilisateur
a demande de preparer et installer d'abord ; la recette interactive Google,
PIN et metier sera faite ensuite par lui. Aucune validation de ces parcours
ne doit etre deduite de la compilation.

- Branche : `codex/sahelpos-consolidation-20261008`.
- Source initiale : `0ffb4575566d6217bd5953c2ee55c865439c275b`.
- [PR 5](https://github.com/bahdev223/sahelpos-mobile/pull/5) ouverte et
  brouillon ; deux commits devant master lors du fetch initial.
- Tests et rapport de livraison pousses dans le commit
  `1d575b2f8f665779f161c6895d40b6bab9ccd1a0`
  (`test: verify Android upgrades and record signed installation [skip ci]`).
  Ce commit ajoute des preuves, pas de modification du code applicatif compile.
- Backend main releve : `31c217c551201719742ac3a1eb5eb5516d170861`.
- API publique `/sante/` : HTTP 200, etat ok. Ce controle ne prouve pas le SHA deploye.
- Telephone TECNO KL5 : version installee avant intervention 1.2.4, code 8.
- Source candidate : 1.3.0, code 9. Releases publiques GitHub : derniere 1.2.0.

## Regles et execution

Pas de changement serveur, pas de reset SQLite, pas de secret dans Git,
pas de GitHub Actions et pas de publication publique sans recette.
Conserver la branche de consolidation et les identites existantes.

1. Comparaison Git et verification de la cle contre l'APK installee : reussies.
2. Dependances, tests JavaScript, TypeScript et migration v9 : controles executes.
3. Generation native, compilation et verification APK : reussies.
4. Mise a jour adb et controle de processus : reussis. Recette visuelle non effectuee.
5. Recette utilisateur et distribution commerciale : non validees.

## Preuves initiales

- `npm ci --legacy-peer-deps --no-audit` : reussi, 608 packages.
- `node --test tests/*.test.cjs` : 107 tests reussis, aucun ignore.
  Quatre tests supplementaires executent les vraies migrations avec SQLite :
  installation neuve, conservation des donnees v9, interruption/reprise,
  marqueur de version ancien avec colonnes deja presentes.
  Seul l'adaptateur natif Expo est remplace ; ce n'est pas une extraction
  de la base privee du telephone ni une preuve de vente reelle.
- `npx tsc --noEmit` : exit 0.
- `npm audit --json` : 29 avis, 17 hauts, 12 moderes, aucun critique.
  Voir le triage du 8 octobre ; aucun downgrade/force applique.
- APK installee recuperee pour comparer son certificat, sans extraire les donnees privees.
- Certificat SHA-256 de l'APK installee :
  `e72cde0127b7db6b3a37a278b92782ea2bc7d5f785cec4c5f5dda6d568ebd40e`.
  `keytool` confirme le meme certificat pour la cle locale, CN SahelPOS,
  RSA 4096, validite du 5 septembre 2026 au 28 aout 2056.
- Node 24.16.0, JDK Temurin 17.0.19, SDK Android 36 ; telephone Android 14,
  ABIs arm64-v8a et armeabi-v7a compatibles.
- `expo install --check` en ligne signale 17 mises a jour patch recommandees.
  L'arbre verrouille est conserve ; le controle hors ligne ne signale pas
  d'ecart mais avertit que sa validation est moins fiable. Aucun changement
  aveugle du SDK ni `audit fix --force`.
- `expo prebuild --platform android --no-install` : reussi, repertoire natif
  neuf dans cette copie isolee. Aucune adaptation native existante ecrasee.
  La jonction locale `C:\sp130` pointe sur cette copie pour reduire les chemins
  Windows de compilation ; ce n'est pas un autre depot.
- Le Gradle genere utilise `signingConfigs.release`, version 1.3.0/code 9,
  minification et reduction des ressources, armeabi-v7a et arm64-v8a.
- Contrat public live : Google natif HTTP 302 vers Accounts/Google ; login
  natif HTTP 302 vers Accounts/OAuth ; faux ticket d'echange refuse HTTP 400.
  Aucun compte cree, aucun secret expose ou commite, aucune configuration
  serveur modifiee. Les identifiants de signature ont ete lus uniquement
  localement pour compiler et verifier la cle existante.

Les logs et APK restent hors du depot source, dans le dossier local
`C:\Users\hp\Documents\ChatGPT\sahelpos-android-release-20261009`.

## Perimetre des modifications de cette reprise

- `tests/mobile-upgrade.test.cjs` : quatre tests de migration SQLite reelle
  sur fixtures synthetiques, dont conservation du PIN, licence, ventes,
  stock, chemins d'images et outbox. Aucun correctif de production ajoute.
- Ce rapport : preuves de compilation, signature, installation et controles.
- `docs/agents/ETAT_CONSOLIDATION.md` et
  `docs/agents/RECETTE_ET_DEMONSTRATION.md` : liens vers la livraison.
- `docs/mobile/README_MOBILE_AGENT.md` : version courante et consigne de
  ne jamais desinstaller pour contourner une signature incompatible.
- `README.md` : acces au rapport et distinction entre APK interne de recette
  et publication stable. Ce complement documentaire ne change pas l'APK.

Le depot de travail est
`C:\Users\hp\Documents\ChatGPT\sahelpos-consolidation-mobile`, copie isolee
du remote `https://github.com/bahdev223/sahelpos-mobile.git`.
`C:\sahelpos-mobile` fournit la cle existante ; son code n'a pas ete remplace.
La jonction `C:\sp130` cible la copie isolee. Aucun changement dans les
depots web, Nere ou desktop pendant cette livraison.

## Reproduire la preparation et l'installation

Ne pas regenerer une cle. Avant de compiler, conserver les fichiers ignores
`credentials/keystore.properties` et le keystore auquel il fait reference.
Le plugin `plugins/signature-release.js` peut utiliser une signature debug
si ces fichiers manquent : un build reussi ne prouve donc pas la bonne signature.
Ne jamais afficher les mots de passe ni ajouter ces fichiers dans Git.

Depuis la copie isolee, avec le lockfile de la source indiquee :

```powershell
npm ci --legacy-peer-deps --no-audit
node --test tests/*.test.cjs
npx tsc --noEmit
npx expo prebuild --platform android --no-install
```

La generation native a ete faite dans une copie sans dossier Android existant.
Ne pas utiliser `--clean` ni ecraser un dossier natif adapte sans l'inspecter.
Dans `C:\sp130\android`, avec la jonction deja preparee :

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$env:ANDROID_HOME = 'C:\Android'
$env:ANDROID_SDK_ROOT = 'C:\Android'
$env:NODE_ENV = 'production'
.\gradlew.bat assembleRelease --console=plain --max-workers=2
```

Verifier le binaire avant toute installation ; comparer son certificat avec
celui de l'APK actuellement installee et les empreintes du tableau ci-dessous :

```powershell
$apk = 'C:\sp130\android\app\build\outputs\apk\release\app-release.apk'
Get-FileHash -LiteralPath $apk -Algorithm SHA256
& 'C:\Android\build-tools\36.0.0\apksigner.bat' verify --verbose --print-certs $apk
& 'C:\Android\build-tools\36.0.0\aapt.exe' dump badging $apk
& 'C:\Android\platform-tools\adb.exe' devices -l
```

Pour le telephone autorise de cette livraison, apres verification de sa
presence et de la signature :

```powershell
$adb = 'C:\Android\platform-tools\adb.exe'
$serial = '126801549A001223'
& $adb -s $serial install -r $apk
& $adb -s $serial shell dumpsys package tech.saheltech.sahelpos
& $adb -s $serial shell am start -n tech.saheltech.sahelpos/.MainActivity
```

Un autre appareil requiert son propre numero de serie. En cas de refus pour
signature incompatible, arreter et retrouver la cle d'origine : aucun
`uninstall`, `pm clear` ou downgrade. La recette PIN/Google doit etre faite
par l'utilisateur, sans communiquer ses identifiants a l'agent.

## Binaire et installation verifies

Commande depuis `C:\sp130\android`, avec JAVA_HOME et ANDROID_HOME locaux :

```powershell
.\gradlew.bat assembleRelease --console=plain --max-workers=2
```

Resultat : **BUILD SUCCESSFUL in 51m 19s**, 833 taches executees.
Les avertissements Gradle 10 concernent une future migration de l'outillage ;
Gradle 9.3.1 a termine la compilation actuelle.

| Controle | Resultat |
| --- | --- |
| APK | `SahelPOS-1.3.0-code9.apk` dans le dossier de livraison local ci-dessus |
| Source applicative | `0ffb4575566d6217bd5953c2ee55c865439c275b` ; ajouts de cette reprise limites aux tests et a la documentation |
| Version | 1.3.0 / versionCode 9 |
| Package | `tech.saheltech.sahelpos` |
| Taille | 62 765 951 octets |
| SHA-256 APK | `e14f6b898b19faa3f30b817368ff891912e628c2ec8dfa036fe561c2bea90ca8` |
| Signature | Verification apksigner reussie, schema v2, RSA 4096, CN SahelPOS / SahelTech |
| Certificat SHA-256 | `e72cde0127b7db6b3a37a278b92782ea2bc7d5f785cec4c5f5dda6d568ebd40e`, identique a l'APK installee avant mise a jour |
| Android | minSdk 24, targetSdk 36, armeabi-v7a et arm64-v8a, aucun flag debuggable dans aapt |
| Appareil | TECNO KL5, Android 14 |
| Installation | `adb install -r` : Success ; aucun uninstall, clear data ou downgrade |
| Version lue sur le telephone | 1.3.0 / code 9, lastUpdateTime 2026-10-09 03:02:26 UTC |
| Conservation de l'installation | firstInstallTime conserve (8 septembre), meme identifiant de repertoire prive avant/apres |
| Demarrage | MainActivity lancee, processus present ; aucun des motifs d'erreur JavaScript/SQLite/native recherches dans les 250 lignes logcat du processus |
| Deep link | Android resout `sahelpos://auth-callback` vers MainActivity ; retour Google complet non teste |

Le controle du repertoire prive atteste une mise a jour et non une
reinstallation. Il ne remplace pas un inventaire des donnees reelles avant/apres.
La base privee du client n'a pas ete extraite. Les preuves PIN/outbox/stock
sont les tests SQLite sur donnees synthetiques. Le dump UI presentait une
surcouche systeme, aucun ecran SahelPOS lisible : aucune validation visuelle
ni saisie de PIN n'est revendiquee.

## Recette restante et statut de livraison

**Installe pour essais sur le telephone du proprietaire ; non publie et non
certifie pour distribution commerciale.** La PR de consolidation reste
brouillon ; cette reprise ne fusionne pas master.

- A tester par l'utilisateur : Google et Accounts complets, PIN existant,
  biometrie, QR/camera, selection de boutique, parcours vendeur et gerant.
- A recetter : vente hors ligne puis fermeture/reprise et synchronisation,
  interruption du push, deux appareils et absence de doublons, revocation,
  changement de droits, profils/variantes/unites/vrac.
- Impression non validee : aucune imprimante disponible pour cette recette.
- 29 avis npm restent ouverts ; voir le triage et les patches Expo recommandes.
- Aucun paiement reel, donnees commerciales d'essai ou compte serveur cree.
- Aucun APK, log prive, secret ou fichier Gradle genere ajoute au depot.

## Distribution publique a corriger apres recette

Le 9 octobre, `/api/public/offres/` annonce encore `apk_version: 1.0.0`
et pointe vers `bahdev223/sahelpos-app/releases/latest/download/sahelpos.apk`.
Le champ de depot source pointe pourtant correctement vers `sahelpos-mobile`.
La release reelle de cet ancien depot est `v1.1.0`, publiee le 5 septembre,
avec `sahelpos.apk` (65 689 492 octets) : elle n'est pas la candidate 1.3.0.

Ne pas annoncer le lien public a jour. Apres validation utilisateur, publier
l'APK verifiee dans le bon depot de distribution puis modifier ensemble
`SAHELPOS_APK_URL` et `SAHELPOS_APK_VERSION`. Aucune modification serveur,
release publique ou upload d'APK n'est effectue pendant cette installation.
