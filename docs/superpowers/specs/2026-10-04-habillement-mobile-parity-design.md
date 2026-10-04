# SahelPOS Mobile — Parité Habillement Web ↔ Android

Date: 2026-10-04  
Statut: design approuvé  
Dépôt cible principal: `bahdev223/sahelpos-mobile`  
Autorité métier: `bahdev223/sahelpos_web`

## 1. Objectif

Rendre le profil Habillement réellement natif sur Android, offline-first, sans créer un second moteur métier divergent du Web.

La parité recherchée couvre progressivement :

- PRODUCT_VARIANTS
- SIZE_DIMENSION
- COLOR_DIMENSION
- caisse par variantes
- PURCHASE_MATRIX
- VARIANT_EXCHANGE
- ARRIVAL_MANAGEMENT
- puis les extensions LOT_TRACKING et LANDED_COST

Le mobile doit pouvoir fonctionner sans réseau, synchroniser ensuite ses écritures, et ne jamais aplatir ni perdre des données avancées qu'il ne comprend pas.

## 2. Principes d'architecture

### 2.1 Le Web reste l'autorité métier

Le mobile reprend les mêmes concepts que Django. Il ne crée pas de moteur Habillement parallèle.

Le produit parent reste le concept commun. Habillement lui ajoute catégories mode, schémas de tailles, couleurs et variantes.

### 2.2 Un seul moteur de stock

Le stock ne doit pas être dupliqué dans un sous-système Habillement.

Le moteur commun évolue pour accepter une référence de variante en plus du produit parent.

Toutes les opérations de stock doivent continuer à passer par des services transactionnels communs.

### 2.3 Offline-first

Les objets Habillement nécessaires à l'exploitation hors ligne vivent en SQLite.

Chaque objet synchronisable doit posséder une identité locale durable et un horodatage de modification. Les suppressions synchronisées restent explicites.

### 2.4 Compatibilité progressive

Une capability n'est déverrouillée en écriture mobile que lorsque quatre éléments existent ensemble :

1. représentation SQLite correcte ;
2. synchronisation Web ↔ Mobile correcte ;
3. service métier local sûr ;
4. interface mobile et tests couvrant les cas critiques.

Jusqu'à ce point, la capability reste protégée sans bloquer les autres familles d'écritures compatibles.

## 3. Modèle de données mobile

Le mobile doit introduire les concepts suivants.

### 3.1 Référentiels Mode

- schema_taille
- valeur_schema_taille
- categorie_mode
- couleur_mode
- marque
- saison
- collection

### 3.2 Extension produit

- produit_habillement
- dimension_variante
- valeur_dimension
- variante_produit

Chaque variante doit représenter une combinaison réelle et durable de dimensions.

Exemple :

```text
Produit: T-shirt
Variante: Taille M + Couleur Noir
SKU: TSH-M-NOIR
Stock: 8
```

Le stock d'un produit Habillement ne doit jamais être réduit à un seul nombre si des variantes existent.

### 3.3 Identité et synchronisation

Les tables synchronisables doivent inclure au minimum :

- id_local
- date_modification
- supprime_le lorsque pertinent

Un identifiant serveur peut être conservé s'il est utile, mais l'identité locale ne doit jamais dépendre de la disponibilité du serveur.

## 4. Profil UI Android

Le mobile doit suivre la même frontière que le Web :

```text
STANDARD
HABILLEMENT
```

Les écrans génériques ne doivent pas devenir des composants remplis de conditions `if habillement`.

Les écrans Habillement vivent dans un espace dédié et réutilisent uniquement les primitives stables : design system, auth, API, stockage local, paiements, impression, synchronisation.

## 5. Catalogue Habillement

L'écran Produits standard est remplacé, pour ce profil, par un écran Modèles.

Une carte modèle affiche au minimum :

- photo ;
- nom ;
- catégorie mode ;
- marque ;
- prix ;
- stock total ;
- nombre ou résumé des variantes.

La fiche modèle possède sa propre page.

Les formulaires d'actions restent en modal conformément aux règles UX SahelPOS.

## 6. Création d'un modèle

Le flux de création doit suivre cette séquence :

1. informations générales ;
2. catégorie mode ;
3. schéma de taille ;
4. tailles ;
5. couleurs ;
6. matrice des variantes ;
7. quantités initiales ;
8. validation.

Le nombre maximal de combinaisons doit rester borné et cohérent avec le Web.

La création locale doit être atomique : produit parent, extension Habillement, variantes et stock initial ne doivent jamais rester dans un état partiel.

## 7. Matrice taille × couleur

La matrice représente directement les variantes réelles.

Exemple :

| Taille | Noir | Bleu | Rouge |
| --- | ---: | ---: | ---: |
| S | 4 | 2 | 0 |
| M | 8 | 5 | 2 |
| L | 3 | 6 | 1 |
| XL | 0 | 2 | 0 |

Chaque cellule non vide correspond à une `variante_produit`.

Les tailles et couleurs sont des références métier, pas des chaînes libres recopiées dans chaque vente.

## 8. Caisse Habillement

Le flux de vente doit être :

```text
Modèle
  → variante
  → taille/couleur
  → vérification stock variante
  → panier
  → encaissement
```

Une ligne de panier Habillement transporte au minimum :

- produit ;
- variante ;
- taille ;
- couleur ;
- quantité ;
- prix unitaire ;
- coût unitaire.

Le ticket doit afficher la variante de façon intelligible.

Une vente Habillement ne doit jamais sortir le stock uniquement sur le produit parent.

## 9. Stock et inventaire variantes

Le mouvement de stock commun doit accepter une variante optionnelle.

Schéma conceptuel :

```text
mouvement_stock
  produit_id
  variante_id nullable
  quantite
  nature
  source
  reference
```

Pour un produit Habillement à variantes, `variante_id` devient obligatoire sur les opérations qui affectent le stock.

Le même moteur gère :

- ventes ;
- achats ;
- réceptions ;
- inventaires ;
- échanges ;
- transferts ;
- ajustements.

L'inventaire Habillement compte les variantes, pas seulement le total produit.

## 10. Achats matriciels

Une commande fournisseur Habillement peut contenir des quantités par variante.

Flux :

```text
Commande fournisseur
  → modèle
  → matrice taille × couleur
  → quantités commandées
  → prix achat
  → réception
```

La réception peut être partielle.

Le système doit conserver séparément :

- quantité commandée ;
- quantité déjà reçue ;
- quantité restante.

Une réception doit être idempotente afin qu'une reprise après coupure réseau ne double jamais le stock.

## 11. Échanges

Un échange n'est pas une suppression/recréation de vente.

Flux :

```text
vente originale
  → ligne originale
  → variante retournée remise en stock
  → nouvelle variante sortie du stock
  → différence de prix éventuelle
  → trace de l'échange
```

L'opération doit être transactionnelle et auditable.

## 12. Arrivages

Le profil Habillement mobile doit ensuite supporter :

- fournisseur ;
- référence d'arrivage ;
- transport ;
- statut ;
- modèles concernés ;
- variantes attendues ;
- quantités reçues ;
- écarts ;
- frais d'approche.

La réception d'un arrivage alimente le stock des variantes.

Les coûts d'approche seront ajoutés seulement lorsque LANDED_COST est représenté de bout en bout.

## 13. Synchronisation V3

Le protocole de synchronisation doit évoluer sans casser les anciennes données.

Les familles nouvelles sont :

- referentiels_habillement ;
- produits_habillement ;
- dimensions ;
- valeurs_dimensions ;
- variantes ;
- stocks_variantes ;
- ventes_variantes ;
- achats_variantes ;
- echanges ;
- arrivages.

Le serveur doit continuer à refuser toute écriture susceptible d'écraser une donnée plus riche que ce que l'APK sait représenter.

Le `pull` doit rester possible même lorsque certaines écritures sont bloquées.

## 14. Conflits et idempotence

Les opérations sensibles doivent porter une identité durable permettant de rejouer sans duplication.

Cela concerne au minimum :

- création complexe d'un modèle ;
- réception fournisseur ;
- validation inventaire ;
- échange ;
- réception d'arrivage.

Un retry réseau ne doit jamais créer deux variantes, doubler une entrée stock ou doubler une vente.

## 15. Ordre de réalisation

### Bloc 1 — Fondations

- référentiels Habillement SQLite ;
- produit_habillement ;
- dimensions et valeurs ;
- variante_produit ;
- sync Web ↔ Mobile ;
- tests de compatibilité et d'idempotence.

Capabilities visées :
- PRODUCT_VARIANTS
- SIZE_DIMENSION
- COLOR_DIMENSION

### Bloc 2 — Catalogue / Modèles

- liste modèles ;
- fiche modèle ;
- création/modification ;
- matrice tailles/couleurs ;
- photos ;
- stock agrégé par modèle.

### Bloc 3 — Caisse Habillement

- sélection modèle ;
- choix variante ;
- panier variante ;
- contrôle stock ;
- impression/ticket ;
- sync des ventes avec variante.

### Bloc 4 — Stock et inventaire

- mouvements par variante ;
- inventaire matriciel ;
- ajustements ;
- alertes cohérentes.

### Bloc 5 — Achats et échanges

- PURCHASE_MATRIX ;
- réception partielle ;
- VARIANT_EXCHANGE ;
- historique et idempotence.

### Bloc 6 — Arrivages

- ARRIVAL_MANAGEMENT ;
- suivi réception ;
- écarts ;
- préparation LOT_TRACKING et LANDED_COST.

## 16. Déverrouillage des capabilities

Ordre attendu :

```text
PRODUCT_VARIANTS
SIZE_DIMENSION
COLOR_DIMENSION
→ caisse variantes
→ PURCHASE_MATRIX
→ VARIANT_EXCHANGE
→ ARRIVAL_MANAGEMENT
→ LOT_TRACKING
→ LANDED_COST
```

Aucune capability n'est marquée supportée sur Android avant la réussite de ses tests de données, sync, services et UI.

## 17. Tests obligatoires

Chaque bloc doit ajouter des tests couvrant au minimum :

- fonctionnement offline ;
- reprise après redémarrage ;
- idempotence ;
- synchronisation bidirectionnelle ;
- conflit de données ;
- refus d'écriture d'un APK incapable de représenter la donnée ;
- absence de perte de variante ;
- intégrité du stock ;
- permissions utilisateur ;
- abonnement/capabilities ;
- régression du profil STANDARD.

Les tests doivent être exécutés localement. GitHub Actions ne doit pas être utilisé sans autorisation explicite.

## 18. Critères de réussite

La parité Habillement mobile est considérée atteinte lorsque :

- un modèle avec tailles/couleurs peut être créé offline ;
- ses variantes se synchronisent sans perte vers Django ;
- une variante créée Web est exploitable offline sur Android ;
- une vente retire exactement la bonne variante ;
- un achat/réception remet exactement la bonne variante en stock ;
- un inventaire corrige la bonne variante ;
- un échange inverse et applique les mouvements corrects ;
- un arrivage peut être reçu sans duplication après retry ;
- un ancien APK ne peut pas aplatir ces données ;
- le profil STANDARD continue de fonctionner sans régression.

## 19. Hors périmètre immédiat

Ne font pas partie du premier bloc :

- redesign global de SahelPOS ;
- refonte du moteur d'abonnement ;
- nouveau moteur comptable ;
- marketplace ;
- fonctions spécifiques à d'autres profils commerce.

Le premier objectif est strictement la fondation Habillement Android et sa synchronisation sûre avec le Web.
