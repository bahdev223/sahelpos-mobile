/**
 * Fait signer les APK de production avec la vraie cle de SahelTech.
 *
 * POURQUOI UN GREFFON ET PAS UNE MODIFICATION DE build.gradle
 * ------------------------------------------------------------
 * Le dossier `android/` est ignore par git et regenere par
 * `expo prebuild`. Une modification faite a la main dedans disparait au
 * premier prebuild — et personne ne s'en apercoit avant de decouvrir un APK
 * de production signe avec la cle de debogage.
 *
 * Ce greffon, lui, est commite. Il rejoue la modification a chaque
 * regeneration.
 *
 * CE QUE LA CLE DE DEBOGAGE COUTAIT
 * ----------------------------------
 * Expo signe les builds `release` avec `debug.keystore`, dont le mot de passe
 * est « android » et qui est identique sur toutes les machines du monde.
 * N'importe qui pouvait donc signer un APK que les telephones auraient
 * installe comme une mise a jour legitime de SahelPOS — en gardant les
 * donnees du commercant.
 *
 * IL N'ECHOUE PAS SANS LA CLE
 * ----------------------------
 * Sans `credentials/keystore.properties`, il laisse la configuration de
 * debogage en place et le dit dans la console. C'est voulu : un developpeur
 * qui clone le depot doit pouvoir compiler sans detenir la cle de
 * production. Seule la machine qui publie l'a.
 */
const fs = require('fs');
const path = require('path');

const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const DOSSIER = 'credentials';
const REGLAGES = 'keystore.properties';

function lireReglages(racine) {
  const chemin = path.join(racine, DOSSIER, REGLAGES);
  if (!fs.existsSync(chemin)) return null;

  const valeurs = {};
  for (const ligne of fs.readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const coupe = ligne.indexOf('=');
    if (coupe <= 0 || ligne.trimStart().startsWith('#')) continue;
    valeurs[ligne.slice(0, coupe).trim()] = ligne.slice(coupe + 1).trim();
  }

  const manquants = [
    'SAHELPOS_KEYSTORE_FILE',
    'SAHELPOS_KEYSTORE_PASSWORD',
    'SAHELPOS_KEY_ALIAS',
    'SAHELPOS_KEY_PASSWORD',
  ].filter((cle) => !valeurs[cle]);

  if (manquants.length) {
    throw new Error(
      `${DOSSIER}/${REGLAGES} est incomplet : ${manquants.join(', ')}. ` +
        'Un APK signe a moitie ne s installe pas, autant echouer ici.',
    );
  }
  return valeurs;
}

/**
 * Copie la cle dans `android/app/`, ou gradle sait la trouver.
 *
 * On la copie plutot que de pointer dessus par un chemin relatif : gradle
 * resout `storeFile` depuis `android/app/`, et un `../../credentials/...`
 * casse des qu'on compile depuis un autre repertoire.
 */
const poserLaCle = (config) =>
  withDangerousMod(config, [
    'android',
    async (parametres) => {
      const racine = parametres.modRequest.projectRoot;
      const reglages = lireReglages(racine);
      if (!reglages) return parametres;

      const source = path.join(racine, DOSSIER, reglages.SAHELPOS_KEYSTORE_FILE);
      if (!fs.existsSync(source)) {
        throw new Error(
          `Cle de signature introuvable : ${source}. ` +
            'Restaurez-la depuis votre sauvegarde.',
        );
      }
      fs.copyFileSync(
        source,
        path.join(parametres.modRequest.platformProjectRoot, 'app',
          reglages.SAHELPOS_KEYSTORE_FILE),
      );
      return parametres;
    },
  ]);

const brancherLaSignature = (config) =>
  withAppBuildGradle(config, (parametres) => {
    const reglages = lireReglages(parametres.modRequest.projectRoot);
    if (!reglages) {
      console.warn(
        '\nSahelPOS : aucune cle de production trouvee dans ' +
          `${DOSSIER}/${REGLAGES}.\n` +
          'Les builds release seront signes avec la cle de DEBOGAGE et ne ' +
          'doivent pas etre distribues.\n',
      );
      return parametres;
    }

    let gradle = parametres.modResults.contents;

    // Le bloc de signature, insere a cote de celui de debogage qu'Expo ecrit.
    const bloc = `
        release {
            storeFile file('${reglages.SAHELPOS_KEYSTORE_FILE}')
            storePassword '${reglages.SAHELPOS_KEYSTORE_PASSWORD}'
            keyAlias '${reglages.SAHELPOS_KEY_ALIAS}'
            keyPassword '${reglages.SAHELPOS_KEY_PASSWORD}'
        }`;

    if (!gradle.includes("storeFile file('" + reglages.SAHELPOS_KEYSTORE_FILE + "')")) {
      gradle = gradle.replace(
        /(signingConfigs \{\n(?:.*\n)*?        \}\n)/,
        (bloc_debug) => bloc_debug.replace(/\n$/, bloc + '\n'),
      );
    }

    // LA ligne qui compte : le build release cessait de reutiliser la
    // configuration de debogage.
    gradle = gradle.replace(
      /(release \{\n(?:[^}]*\n)?\s*)signingConfig signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release',
    );

    parametres.modResults.contents = gradle;
    return parametres;
  });

module.exports = function signatureRelease(config) {
  return brancherLaSignature(poserLaCle(config));
};
