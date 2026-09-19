/**
 * Ajoute le module natif qui convertit le logo boutique en image ESC/POS.
 *
 * Le dossier android/ est ignore par Git et peut etre regenere par Expo. Sans
 * ce greffon, le logo fonctionnerait sur la machine de build locale, puis
 * disparaitrait au prochain `expo prebuild`.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MODULE = `package tech.saheltech.sahelpos

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class SahelposEscposImageModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "SahelposEscposImage"

  @ReactMethod
  fun logoRaster(uriTexte: String, largeurMax: Int, hauteurMax: Int, promise: Promise) {
    try {
      val source = decoder(uriTexte)
        ?: throw IllegalArgumentException("Logo illisible.")
      val logo = preparer(source, largeurMax.coerceIn(64, 576), hauteurMax.coerceIn(48, 240))
      val commande = convertirEnRasterEscpos(logo)
      val tableau = Arguments.createArray()
      for (octet in commande) tableau.pushInt(octet and 0xff)
      promise.resolve(tableau)
    } catch (erreur: Exception) {
      promise.reject("LOGO_ESC_POS", erreur.message ?: "Conversion du logo impossible.", erreur)
    }
  }

  private fun decoder(uriTexte: String): Bitmap? {
    val uri = Uri.parse(uriTexte)
    val flux = when {
      uri.scheme == "content" -> reactContext.contentResolver.openInputStream(uri)
      uri.scheme == "file" -> FileInputStream(File(uri.path ?: return null))
      uri.scheme.isNullOrBlank() -> FileInputStream(File(uriTexte))
      else -> null
    }
    return flux?.use { BitmapFactory.decodeStream(it) }
  }

  private fun preparer(source: Bitmap, largeurMax: Int, hauteurMax: Int): Bitmap {
    val ratio = min(largeurMax.toFloat() / source.width, hauteurMax.toFloat() / source.height)
    val largeur = max(1, (source.width * ratio).roundToInt())
    val hauteur = max(1, (source.height * ratio).roundToInt())
    val sortie = Bitmap.createBitmap(largeur, hauteur, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(sortie)
    canvas.drawColor(Color.WHITE)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    canvas.drawBitmap(source, null, android.graphics.Rect(0, 0, largeur, hauteur), paint)
    return sortie
  }

  private fun convertirEnRasterEscpos(bitmap: Bitmap): List<Int> {
    val largeur = bitmap.width
    val hauteur = bitmap.height
    val largeurOctets = (largeur + 7) / 8
    val donnees = ArrayList<Int>(8 + largeurOctets * hauteur)

    donnees.add(0x1d)
    donnees.add(0x76)
    donnees.add(0x30)
    donnees.add(0x00)
    donnees.add(largeurOctets and 0xff)
    donnees.add((largeurOctets shr 8) and 0xff)
    donnees.add(hauteur and 0xff)
    donnees.add((hauteur shr 8) and 0xff)

    for (y in 0 until hauteur) {
      for (bloc in 0 until largeurOctets) {
        var octet = 0
        for (bit in 0 until 8) {
          val x = bloc * 8 + bit
          if (x >= largeur) continue
          val couleur = bitmap.getPixel(x, y)
          val alpha = Color.alpha(couleur)
          val lumiere =
            (Color.red(couleur) * 299 + Color.green(couleur) * 587 + Color.blue(couleur) * 114) / 1000
          if (alpha > 32 && lumiere < 185) {
            octet = octet or (0x80 shr bit)
          }
        }
        donnees.add(octet)
      }
    }

    return donnees
  }
}
`;

const PACKAGE = `package tech.saheltech.sahelpos

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SahelposEscposImagePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(SahelposEscposImageModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
`;

function ecrireSiChange(chemin, contenu) {
  if (fs.existsSync(chemin) && fs.readFileSync(chemin, 'utf8') === contenu) return;
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, contenu);
}

module.exports = function escposLogo(config) {
  return withDangerousMod(config, [
    'android',
    async (parametres) => {
      const racine = parametres.modRequest.platformProjectRoot;
      const dossier = path.join(
        racine,
        'app/src/main/java/tech/saheltech/sahelpos',
      );

      ecrireSiChange(path.join(dossier, 'SahelposEscposImageModule.kt'), MODULE);
      ecrireSiChange(path.join(dossier, 'SahelposEscposImagePackage.kt'), PACKAGE);

      const application = path.join(dossier, 'MainApplication.kt');
      let source = fs.readFileSync(application, 'utf8');
      if (!source.includes('SahelposEscposImagePackage()')) {
        source = source.replace(
          '          // add(MyReactNativePackage())',
          '          // add(MyReactNativePackage())\n          add(SahelposEscposImagePackage())',
        );
        fs.writeFileSync(application, source);
      }

      return parametres;
    },
  ]);
};
