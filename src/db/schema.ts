/**
 * Schema de la base locale du mobile.
 *
 * Il reprend volontairement les noms de tables et de colonnes de l'application
 * de bureau (SahelPOS 360, SQLite aussi). L'application mobile est autonome et
 * ne se synchronise pas, mais garder les memes noms laisse la porte ouverte a
 * un import/export entre les deux sans travail de correspondance.
 *
 * Ecarts assumes par rapport au bureau :
 *   - pas de table `lot` : la gestion FIFO par lot est lourde a saisir sur un
 *     telephone. Le stock est suivi au produit. A rouvrir si le besoin vient.
 *   - `id_local` en TEXT (UUID) sur les tables ecrites en mobilite, pour qu'un
 *     futur rapprochement avec le poste ne provoque pas de collision d'entiers.
 */

export const SCHEMA_VERSION = 14;

export const MIGRATIONS: string[][] = [
  // --- version 1 -----------------------------------------------------------
  [
    `CREATE TABLE IF NOT EXISTS produit (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      id_local            TEXT    NOT NULL UNIQUE,
      nom                 TEXT    NOT NULL,
      categorie           TEXT,
      code_barre          TEXT    UNIQUE,
      prix_unitaire       REAL    NOT NULL DEFAULT 0,
      prix_achat          REAL    NOT NULL DEFAULT 0,
      unite_base          TEXT    NOT NULL DEFAULT 'Unite',
      quantite_base       REAL    NOT NULL DEFAULT 0,
      stock_min           REAL    NOT NULL DEFAULT 0,
      gestion_stock       INTEGER NOT NULL DEFAULT 1,
      chemin_image        TEXT,
      actif               INTEGER NOT NULL DEFAULT 1,
      date_creation       TEXT    NOT NULL,
      date_modification   TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_produit_nom        ON produit(nom)`,
    `CREATE INDEX IF NOT EXISTS idx_produit_code_barre ON produit(code_barre)`,
    `CREATE INDEX IF NOT EXISTS idx_produit_categorie  ON produit(categorie)`,

    `CREATE TABLE IF NOT EXISTS sous_unite (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      produit_id  INTEGER NOT NULL REFERENCES produit(id) ON DELETE CASCADE,
      nom         TEXT    NOT NULL,
      facteur     REAL    NOT NULL,
      prix        REAL    NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sous_unite_produit ON sous_unite(produit_id)`,

    `CREATE TABLE IF NOT EXISTS client (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      id_local      TEXT    NOT NULL UNIQUE,
      nom           TEXT    NOT NULL,
      telephone     TEXT,
      email         TEXT,
      adresse       TEXT,
      chemin_photo  TEXT,
      date_creation TEXT    NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_client_nom ON client(nom)`,

    `CREATE TABLE IF NOT EXISTS vente (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      id_local        TEXT    NOT NULL UNIQUE,
      numero          TEXT    NOT NULL UNIQUE,
      client_id       INTEGER REFERENCES client(id),
      utilisateur_id  INTEGER REFERENCES utilisateur(id),
      date_vente      TEXT    NOT NULL,
      total           REAL    NOT NULL DEFAULT 0,
      montant_paye    REAL    NOT NULL DEFAULT 0,
      mode_paiement   TEXT    NOT NULL DEFAULT 'especes',
      statut          TEXT    NOT NULL DEFAULT 'payee',
      benefice_total  REAL    NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_vente_date ON vente(date_vente)`,

    `CREATE TABLE IF NOT EXISTS ligne_vente (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      vente_id           INTEGER NOT NULL REFERENCES vente(id) ON DELETE CASCADE,
      produit_id         INTEGER NOT NULL REFERENCES produit(id),
      libelle            TEXT    NOT NULL,
      unite              TEXT    NOT NULL,
      facteur            REAL    NOT NULL DEFAULT 1,
      quantite           REAL    NOT NULL,
      quantite_base      REAL    NOT NULL,
      prix_unitaire      REAL    NOT NULL,
      cout_unitaire      REAL    NOT NULL DEFAULT 0,
      total              REAL    NOT NULL,
      benefice_total     REAL    NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ligne_vente_vente ON ligne_vente(vente_id)`,

    `CREATE TABLE IF NOT EXISTS mouvement_stock (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      produit_id        INTEGER NOT NULL REFERENCES produit(id) ON DELETE CASCADE,
      nature            TEXT    NOT NULL,
      source_operation  TEXT    NOT NULL,
      quantite          REAL    NOT NULL,
      unite             TEXT,
      quantite_base     REAL    NOT NULL,
      stock_avant       REAL,
      stock_apres       REAL,
      prix_unitaire     REAL,
      reference         TEXT,
      motif             TEXT,
      utilisateur       TEXT,
      date_mouvement    TEXT    NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mouvement_produit ON mouvement_stock(produit_id)`,
    `CREATE INDEX IF NOT EXISTS idx_mouvement_date    ON mouvement_stock(date_mouvement)`,

    `CREATE TABLE IF NOT EXISTS inventaire (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      id_local         TEXT    NOT NULL UNIQUE,
      numero           TEXT    NOT NULL UNIQUE,
      statut           TEXT    NOT NULL DEFAULT 'BROUILLON',
      date_creation    TEXT    NOT NULL,
      date_validation  TEXT,
      utilisateur_nom  TEXT,
      nb_produits      INTEGER NOT NULL DEFAULT 0,
      nb_ecarts        INTEGER NOT NULL DEFAULT 0,
      valeur_ecarts    REAL    NOT NULL DEFAULT 0,
      motif            TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS ligne_inventaire (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      inventaire_id    INTEGER NOT NULL REFERENCES inventaire(id) ON DELETE CASCADE,
      produit_id       INTEGER NOT NULL REFERENCES produit(id),
      stock_theorique  REAL    NOT NULL,
      stock_physique   REAL,
      ecart            REAL,
      valeur_ecart     REAL,
      prix_achat       REAL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ligne_inv_inventaire ON ligne_inventaire(inventaire_id)`,

    `CREATE TABLE IF NOT EXISTS utilisateur (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      login          TEXT    NOT NULL UNIQUE,
      nom            TEXT,
      code_pin       TEXT    NOT NULL,
      role           TEXT    NOT NULL DEFAULT 'vendeur',
      actif          INTEGER NOT NULL DEFAULT 1,
      date_creation  TEXT    NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS parametre (
      cle                TEXT PRIMARY KEY,
      valeur             TEXT,
      date_modification  TEXT
    )`,
  ],

  // --- version 2 : achats fournisseur --------------------------------------
  //
  // Le fournisseur vit dans sa propre table (et non dans un simple champ texte
  // sur l'achat) parce qu'on doit pouvoir lui rattacher un solde : ce que la
  // boutique lui doit encore se calcule en parcourant ses achats.
  [
    `CREATE TABLE IF NOT EXISTS fournisseur (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      id_local      TEXT    NOT NULL UNIQUE,
      nom           TEXT    NOT NULL,
      contact       TEXT,
      telephone     TEXT,
      email         TEXT,
      adresse       TEXT,
      date_creation TEXT    NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_fournisseur_nom ON fournisseur(nom)`,

    `CREATE TABLE IF NOT EXISTS achat (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      id_local        TEXT    NOT NULL UNIQUE,
      numero          TEXT    NOT NULL UNIQUE,
      fournisseur_id  INTEGER REFERENCES fournisseur(id),
      reference       TEXT,
      date_achat      TEXT    NOT NULL,
      total           REAL    NOT NULL DEFAULT 0,
      montant_paye    REAL    NOT NULL DEFAULT 0,
      statut          TEXT    NOT NULL DEFAULT 'BROUILLON',
      date_reception  TEXT,
      motif           TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_achat_date        ON achat(date_achat)`,
    `CREATE INDEX IF NOT EXISTS idx_achat_fournisseur ON achat(fournisseur_id)`,

    `CREATE TABLE IF NOT EXISTS ligne_achat (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      achat_id       INTEGER NOT NULL REFERENCES achat(id) ON DELETE CASCADE,
      produit_id     INTEGER NOT NULL REFERENCES produit(id),
      libelle        TEXT    NOT NULL,
      unite          TEXT    NOT NULL,
      facteur        REAL    NOT NULL DEFAULT 1,
      quantite       REAL    NOT NULL,
      quantite_base  REAL    NOT NULL,
      prix_unitaire  REAL    NOT NULL,
      total          REAL    NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ligne_achat_achat ON ligne_achat(achat_id)`,

    `CREATE TABLE IF NOT EXISTS paiement_achat (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      achat_id       INTEGER NOT NULL REFERENCES achat(id) ON DELETE CASCADE,
      montant        REAL    NOT NULL,
      mode_paiement  TEXT    NOT NULL DEFAULT 'especes',
      date_paiement  TEXT    NOT NULL,
      note           TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_paiement_achat ON paiement_achat(achat_id)`,
  ],

  // --- version 3 : journal des notifications -------------------------------
  //
  // POURQUOI UNE TABLE PLUTOT QU'UN CALCUL A L'AFFICHAGE
  // ----------------------------------------------------
  // Les alertes de stock etaient recalculees a chaque ouverture d'ecran. Une
  // rupture survenue a 14 h, pendant que le commercant encaissait, n'existait
  // donc nulle part : rien a marquer comme lu, rien a retrouver le soir, et
  // aucun moyen de savoir si on avait deja prevenu. Un journal repare les
  // trois.
  //
  // POURQUOI UNE CLE DE REGROUPEMENT
  // ---------------------------------
  // `cle` identifie l'EVENEMENT, pas la ligne : `rupture:produit:42`. Deux
  // ventes qui vident le meme produit produisent la meme cle, donc une seule
  // notification. Sans cela, une boutique de deux cents references sonnerait
  // trente fois de suite et le commercant couperait les notifications le jour
  // meme — on aurait perdu le canal pour toujours.
  [
    `CREATE TABLE IF NOT EXISTS notification (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      id_local        TEXT    NOT NULL UNIQUE,
      cle             TEXT    NOT NULL,
      genre           TEXT    NOT NULL,
      gravite         TEXT    NOT NULL DEFAULT 'info',
      titre           TEXT    NOT NULL,
      corps           TEXT    NOT NULL DEFAULT '',
      -- Ou emmener le commercant quand il appuie dessus.
      chemin          TEXT,
      -- Objet concerne, pour retrouver la notification d'un produit precis.
      produit_id      INTEGER REFERENCES produit(id) ON DELETE CASCADE,
      date_creation   TEXT    NOT NULL,
      -- Derniere fois que l'evenement s'est reproduit : on remonte la
      -- notification existante au lieu d'en empiler une nouvelle.
      date_rappel     TEXT,
      lue_le          TEXT,
      -- Le systeme a-t-il deja fait sonner le telephone pour celle-ci ?
      sonnee          INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_cle ON notification(cle)`,
    `CREATE INDEX IF NOT EXISTS idx_notification_lue  ON notification(lue_le)`,
    `CREATE INDEX IF NOT EXISTS idx_notification_date ON notification(date_creation)`,
  ],

  // --- version 4 : identite partagee avec le serveur -----------------------
  //
  // POURQUOI UN UUID SUR LES EVENEMENTS
  // ------------------------------------
  // La synchronisation repose sur une regle : le serveur doit pouvoir recevoir
  // DEUX FOIS le meme evenement sans le compter deux fois. Le reseau coupe au
  // milieu d'un envoi, le telephone ne sait pas si le serveur a ecrit, il
  // renvoie — et sans identite stable, la vente serait dupliquee.
  //
  // `mouvement_stock` en manquait, alors que c'est l'evenement CENTRAL : le
  // stock ne se synchronise pas comme une valeur, il se recalcule a partir de
  // ces lignes. Sans identite, deux telephones qui poussent le meme mouvement
  // creeraient deux sorties de stock pour une seule vente.
  //
  // POURQUOI PAS SUR LES LIGNES FILLES
  // -----------------------------------
  // `ligne_vente`, `ligne_achat`, `ligne_inventaire` et `sous_unite` voyagent
  // AVEC leur tete, dans le meme envoi : la tete porte l'identite, les lignes
  // en dependent. Leur en donner une compliquerait le protocole sans rien
  // resoudre.
  //
  // POURQUOI `date_modification` SUR LES FICHES SEULEMENT
  // -----------------------------------------------------
  // Une fiche produit ou client peut etre modifiee des deux cotes : il faut
  // savoir laquelle est la plus recente. Un evenement, lui, n'est jamais
  // modifie apres coup — la question ne se pose pas.
  [
    // On ajoute la colonne sans contrainte, on remplit, puis on pose l'index
    // unique : SQLite refuse d'ajouter une colonne NOT NULL UNIQUE a une table
    // qui contient deja des lignes.
    `ALTER TABLE mouvement_stock ADD COLUMN id_local TEXT`,
    `ALTER TABLE paiement_achat  ADD COLUMN id_local TEXT`,

    // Les lignes deja en base recoivent une identite. `randomblob` vient de
    // SQLite : pas besoin de remonter les donnees dans le JavaScript pour les
    // reecrire une par une.
    `UPDATE mouvement_stock SET id_local = lower(hex(randomblob(16)))
      WHERE id_local IS NULL`,
    `UPDATE paiement_achat  SET id_local = lower(hex(randomblob(16)))
      WHERE id_local IS NULL`,

    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mouvement_id_local
       ON mouvement_stock(id_local)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_paiement_achat_id_local
       ON paiement_achat(id_local)`,

    // Les fiches modifiables des deux cotes ont besoin d'une date pour
    // departager. `produit` en avait deja une.
    `ALTER TABLE client      ADD COLUMN date_modification TEXT`,
    `ALTER TABLE fournisseur ADD COLUMN date_modification TEXT`,
  ],

  // --- version 5 : file d'attente de synchronisation ----------------------
  //
  // Une ecriture locale doit survivre a une coupure reseau. L'outbox garde
  // donc l'objet a pousser jusqu'a ce que Django confirme l'avoir traite.
  [
    `CREATE TABLE IF NOT EXISTS sync_outbox (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      type_objet      TEXT    NOT NULL,
      id_local        TEXT    NOT NULL,
      operation       TEXT    NOT NULL DEFAULT 'upsert',
      date_creation   TEXT    NOT NULL,
      tentatives      INTEGER NOT NULL DEFAULT 0,
      derniere_erreur TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_outbox_objet
       ON sync_outbox(type_objet, id_local)`,
    `CREATE INDEX IF NOT EXISTS idx_sync_outbox_date
       ON sync_outbox(date_creation)`,
  ],

  // --- version 6 : achats repliques et diagnostic de synchronisation -------
  //
  // Un achat peut etre recu puis regle plusieurs heures plus tard. Sans une
  // date de modification sur sa tete, le changement de paiement ne pourrait
  // pas etre pousse de maniere rejouable vers le Web.
  [
    `ALTER TABLE achat ADD COLUMN date_modification TEXT`,
    `UPDATE achat
        SET date_modification = COALESCE(date_reception, date_achat)
      WHERE date_modification IS NULL`,
  ],

  // --- version 7 : etat durable de la file de synchronisation -------------
  //
  // Une ligne ne disparait qu'apres l'accuse de reception du serveur. Son
  // etat rend la reprise apres coupure lisible et evite de faire croire qu'une
  // vente locale a ete perdue alors qu'elle attend simplement Internet.
  [
    `ALTER TABLE sync_outbox ADD COLUMN statut TEXT NOT NULL DEFAULT 'PENDING'`,
    `UPDATE sync_outbox
        SET statut = CASE WHEN derniere_erreur IS NULL THEN 'PENDING' ELSE 'FAILED' END`,
    `CREATE INDEX IF NOT EXISTS idx_sync_outbox_statut_date
       ON sync_outbox(statut, date_creation)`,
  ],

  // --- version 8 : vendeurs synchronises et horaires de caisse ------------
  [
    // Les colonnes sont ajoutees par `reparerSchemaVendeurs` : cette operation
    // est idempotente, meme si une ancienne version a avance user_version sans
    // avoir termine sa migration.
  ],

  // --- version 9 : photo/profil client ------------------------------------
  [
    `ALTER TABLE client ADD COLUMN chemin_photo TEXT`,
  ],

  // --- version 10 : variantes Habillement ---------------------------------
  [
    `CREATE TABLE IF NOT EXISTS variante_produit (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      id_local          TEXT    NOT NULL UNIQUE,
      produit_id        INTEGER NOT NULL REFERENCES produit(id) ON DELETE CASCADE,
      sku               TEXT    NOT NULL,
      code_barre        TEXT,
      prix_override     REAL,
      prix_achat        REAL,
      stock_actuel      REAL    NOT NULL DEFAULT 0,
      actif             INTEGER NOT NULL DEFAULT 1,
      date_creation     TEXT,
      date_modification TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_variante_produit ON variante_produit(produit_id)`,
    `CREATE INDEX IF NOT EXISTS idx_variante_sku ON variante_produit(sku)`,
    `CREATE INDEX IF NOT EXISTS idx_variante_code_barre ON variante_produit(code_barre)`,

    `CREATE TABLE IF NOT EXISTS variante_valeur (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      variante_id        INTEGER NOT NULL REFERENCES variante_produit(id) ON DELETE CASCADE,
      valeur_serveur_id  INTEGER,
      dimension_id       INTEGER,
      dimension_code     TEXT    NOT NULL,
      dimension_nom      TEXT    NOT NULL,
      dimension_ordre    INTEGER NOT NULL DEFAULT 0,
      valeur_code        TEXT    NOT NULL,
      valeur_nom         TEXT    NOT NULL,
      code_hex           TEXT,
      valeur_ordre       INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_variante_valeur_variante ON variante_valeur(variante_id)`,
    `CREATE INDEX IF NOT EXISTS idx_variante_valeur_dimension ON variante_valeur(dimension_code, valeur_code)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_variante_valeur_unique
       ON variante_valeur(variante_id, dimension_code)`,

    `ALTER TABLE ligne_vente ADD COLUMN variante_id INTEGER REFERENCES variante_produit(id)`,
    `CREATE INDEX IF NOT EXISTS idx_ligne_vente_variante ON ligne_vente(variante_id)`,
    `ALTER TABLE mouvement_stock ADD COLUMN variante_id INTEGER REFERENCES variante_produit(id)`,
    `CREATE INDEX IF NOT EXISTS idx_mouvement_variante ON mouvement_stock(variante_id)`,
    `ALTER TABLE ligne_achat ADD COLUMN variante_id INTEGER REFERENCES variante_produit(id)`,
    `CREATE INDEX IF NOT EXISTS idx_ligne_achat_variante ON ligne_achat(variante_id)`,
  ],

  // --- version 11 : referentiel tailles/couleurs independant ---------------
  [
    `CREATE TABLE IF NOT EXISTS dimension_variante_ref (
      id_serveur INTEGER PRIMARY KEY,
      code       TEXT NOT NULL UNIQUE,
      nom        TEXT NOT NULL,
      ordre      INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS valeur_dimension_ref (
      id_serveur          INTEGER PRIMARY KEY,
      dimension_id_serveur INTEGER NOT NULL,
      code                TEXT NOT NULL,
      nom                 TEXT NOT NULL,
      code_hex            TEXT,
      ordre               INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(dimension_id_serveur) REFERENCES dimension_variante_ref(id_serveur) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_valeur_dimension_ref_dim
       ON valeur_dimension_ref(dimension_id_serveur, ordre, nom)`,
  ],

  // --- version 12 : echanges de variantes synchronisables ------------------
  [
    `ALTER TABLE ligne_vente ADD COLUMN ligne_serveur_id INTEGER`,
    `CREATE INDEX IF NOT EXISTS idx_ligne_vente_serveur ON ligne_vente(ligne_serveur_id)`,

    `CREATE TABLE IF NOT EXISTS echange_variante (
      id                         INTEGER PRIMARY KEY AUTOINCREMENT,
      id_local                   TEXT NOT NULL UNIQUE,
      vente_id                   INTEGER NOT NULL REFERENCES vente(id) ON DELETE CASCADE,
      ligne_vente_id             INTEGER REFERENCES ligne_vente(id) ON DELETE SET NULL,
      ligne_serveur_id           INTEGER NOT NULL,
      ancienne_variante_id       INTEGER REFERENCES variante_produit(id),
      nouvelle_variante_id       INTEGER NOT NULL REFERENCES variante_produit(id),
      quantite                   REAL NOT NULL DEFAULT 1,
      prix_ancien                REAL NOT NULL DEFAULT 0,
      prix_nouveau               REAL NOT NULL DEFAULT 0,
      difference_prix            REAL NOT NULL DEFAULT 0,
      note                       TEXT,
      date_echange               TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_echange_variante_vente ON echange_variante(vente_id)`,
    `CREATE INDEX IF NOT EXISTS idx_echange_variante_ligne ON echange_variante(ligne_vente_id)`,
  ],

  // --- version 13 : commandes clients Habillement --------------------------
  [
    `CREATE TABLE IF NOT EXISTS commande_client (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      id_local            TEXT NOT NULL UNIQUE,
      serveur_id          INTEGER,
      numero              TEXT NOT NULL,
      client_id           INTEGER REFERENCES client(id),
      statut              TEXT NOT NULL DEFAULT 'BROUILLON',
      total               REAL NOT NULL DEFAULT 0,
      montant_paye        REAL NOT NULL DEFAULT 0,
      note                TEXT,
      date_creation       TEXT NOT NULL,
      date_confirmation   TEXT,
      date_prete          TEXT,
      date_fin            TEXT,
      sync_statut         TEXT NOT NULL DEFAULT 'LOCAL'
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_commande_client_serveur ON commande_client(serveur_id) WHERE serveur_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_commande_client_statut ON commande_client(statut, date_creation)`,

    `CREATE TABLE IF NOT EXISTS ligne_commande_client (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      commande_id          INTEGER NOT NULL REFERENCES commande_client(id) ON DELETE CASCADE,
      serveur_id           INTEGER,
      produit_id           INTEGER NOT NULL REFERENCES produit(id),
      variante_id          INTEGER REFERENCES variante_produit(id),
      libelle              TEXT NOT NULL,
      quantite_commandee   REAL NOT NULL,
      quantite_reservee    REAL NOT NULL DEFAULT 0,
      quantite_preparee    REAL NOT NULL DEFAULT 0,
      prix_unitaire        REAL NOT NULL,
      total                REAL NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ligne_commande_client_commande ON ligne_commande_client(commande_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ligne_commande_client_variante ON ligne_commande_client(variante_id)`,
  ],

  // --- version 14 : demande de conversion commande -> vente ----------------
  [
    `ALTER TABLE commande_client ADD COLUMN conversion_demandee INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE commande_client ADD COLUMN conversion_mode_paiement TEXT`,
    `ALTER TABLE commande_client ADD COLUMN conversion_montant_paye REAL`,
  ],
];
