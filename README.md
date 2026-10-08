# SahelPOS Mobile

Caisse Android **offline-first** de SahelPOS, en React Native / Expo.

Version source actuelle : **1.3.0** (`versionCode 9`).

## Ce que fait l'application

- **Caisse** : panier, encaissement, crédit, reçus et impression thermique Bluetooth.
- **Catalogue** : produits, prix, unités, variantes selon le profil métier.
- **Stock** : mouvements, seuils, inventaires et ajustements.
- **Achats** : fournisseurs, réceptions et paiements.
- **Tableau de bord** : chiffre d'affaires, ventes du jour et alertes.
- **Profils métier** : commerce général, alimentation, habillement, friperie,
  électronique, électricité, quincaillerie, cosmétique, pièces détachées,
  céréales & vrac et autre.
- **Synchronisation** : Web -> mobile -> Web avec file locale persistante.
- **Identité** : Accounts SahelTech / Google pour l'enrôlement, QR d'invitation,
  puis PIN/biométrie local pour l'usage quotidien hors ligne.

## Architecture : offline-first, pas offline-only

SQLite reste la source de travail immédiate du téléphone. Une vente ne doit pas
attendre Internet pour être encaissée.

Quand le réseau est disponible, la synchronisation :

1. pousse les écritures locales via une outbox persistante ;
2. récupère les changements Web ;
3. applique les objets avec leurs identifiants stables ;
4. conserve un curseur et un état de diagnostic ;
5. reprend après coupure sans transformer une valeur de stock en vérité concurrente.

Les ventes et mouvements portent des identités rejouables : le même événement
renvoyé après une coupure ne doit pas être compté deux fois.

Le serveur reste l'autorité sur l'abonnement, le profil de commerce et les
droits. Le téléphone reste capable d'encaisser avec le dernier droit signé
valide lorsque le réseau disparaît.

## Connexion et invitations

Au premier enrôlement, l'écran propose :

- **Continuer avec Google** ;
- **Scanner un QR code** ;
- identifiant / mot de passe comme chemin historique.

`accounts.saheltech.tech` authentifie la personne. SahelPOS conserve le rôle
métier sur `Membre`.

Un QR d'invitation contient uniquement un lien opaque. Le rôle `gérant` ou
`vendeur` est relu côté serveur ; il n'est jamais accepté depuis le contenu du QR.

Pour un compte Google neuf :

```text
Google
  -> compte SahelTech créé/récupéré
  -> informations métier de la boutique uniquement
  -> droit appareil signé
  -> profil Membre synchronisé
  -> choix du PIN local
  -> caisse utilisable hors ligne
```

Pour une invitation :

```text
QR
  -> Google
  -> invitation consommée
  -> Membre(boutique, rôle)
  -> droit appareil signé
  -> PIN local
```

Le PIN ou la biométrie sert ensuite à ouvrir la caisse au quotidien. Google
n'est pas requis à chaque démarrage.

## Profils locaux

Les profils d'une même boutique restent conservés sur le terminal, avec leurs
PIN et écritures en attente. Avec une licence liée à un Membre, seul ce Membre
et son rôle signés peuvent ouvrir la caisse hors ligne. Pour activer un autre
profil, sa propre connexion SahelTech en ligne renouvelle le droit de l'appareil.
Les anciennes licences non liées conservent leur fonctionnement historique.
La biométrie reste liée au profil choisi ; un PIN existant n'est pas remplacé.

Une synchronisation de rôle ou une désactivation serveur réévalue la session
locale. Un vendeur ne devient jamais administrateur simplement parce qu'il a
utilisé Google ou scanné un QR.

## Imprimante thermique Bluetooth

Le Bluetooth demande du code natif. L'application ne fonctionne donc pas
complètement dans Expo Go ; la validation finale requiert notre APK signé.

La communication passe par ESC/POS dans `src/services/impression/`.

À vérifier avec le matériel réel avant publication :

- largeur 58 mm ou 80/88 mm ;
- encodage des accents ;
- reconnexion de l'imprimante ;
- impression après reprise réseau et après veille Android.

## Données locales

`expo-sqlite` écrit dans le stockage privé de l'application. Les données
survivent aux mises à jour mais une désinstallation supprime la base locale.

La synchronisation distante réduit ce risque, mais elle ne remplace pas les
tests de sauvegarde/restauration et de reprise de l'outbox avant une release.

## Structure

```text
app/                    écrans et navigation Expo Router
src/db/                 schéma SQLite, migrations et repositories
src/domain/             contrats métier et profils de commerce
src/services/           ventes, stock, auth, abonnement, sync, impression
src/profile-ui/         interfaces spécialisées par secteur
src/ui/                 thème et composants
tests/                  contrats JavaScript de non-régression
```

## Validation avant APK stable

Sans compiler de binaire pendant le développement :

```bash
npm ci --legacy-peer-deps
node --test tests/*.test.cjs
npx tsc --noEmit
```

La recette finale sur téléphone réel doit couvrir Google, QR, PIN/biométrie,
vente offline, reprise réseau, deux appareils, variantes/conditionnements et
imprimante thermique.

Le build APK/AAB ne doit être lancé qu'après ce gate.

<!-- saheltech-consolidation-2026-10-08 -->
## Directives de consolidation — 8 octobre 2026

Les agents qui reprennent ce dépôt doivent lire les [directives de consolidation](docs/agents/CONSOLIDATION_2026-10-08.md) et `AGENTS.md` avant le travail. Le lot prioritaire couvre **SahelPOS, Fournea et École**, avec prospection visée le **9 octobre 2026**. Les directives précisent le travail, les guides à produire, les preuves de recette et la préparation du déplacement futur.

Cette mise à jour concerne la documentation ; elle ne certifie pas le déploiement ni un binaire mobile.
