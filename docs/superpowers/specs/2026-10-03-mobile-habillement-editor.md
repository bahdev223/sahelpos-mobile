# Saisie native des modèles Habillement

Demande approuvée : poursuivre l'alignement du mobile sur le profil Habillement Web, mêmes modèles, tailles, couleurs et parcours; formulaires en modal. Conserver les données hors ligne, ne pas compiler d'APK ni lancer GitHub Actions, ne pas fusionner main/master.

Lot : éliminer la création intermédiaire du modèle et les doublons au retour arrière. Un dialogue natif conserve les champs et la sélection; aucune écriture avant Enregistrer. Modèle, variantes nouvelles et outbox sont enregistrés dans une transaction exclusive. Les valeurs sont validées contre le référentiel synchronisé. Limite de 240 combinaisons, identités stables, SKU non dépendants des seuls IDs locaux. L'édition conserve le stock, les variantes existantes et leur historique. Les champs absents de la synchronisation ne seront pas présentés comme opérationnels.

Le modèle et la variante constituent des identités distinctes. Les catégories ne seront plus renommées « Collections » lorsque seule categorie est stockée. Les variantes nouvelles commencent sans stock; l'approvisionnement et l'inventaire existants restent les sources du stock. Les erreurs de lecture sont affichées; pas de chargement infini pour un ID absent. Les fiches se relisent au retour et après synchronisation.

Limites : pas de validation sur Android réel, pas de preuve de parité complète avec les métadonnées Habillement Web (marques, saisons, collections, catégories Mode et schémas de tailles).
