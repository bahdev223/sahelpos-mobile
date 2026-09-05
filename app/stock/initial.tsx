/**
 * Mise en route : le stock de depart, une seule fois par produit.
 *
 * POURQUOI CET ECRAN NE PROPOSE QUE LES PRODUITS JAMAIS TOUCHES
 * ------------------------------------------------------------
 * Le stock initial ECRASE la quantite au lieu de s'y ajouter - c'est ce qu'on
 * veut au demarrage, quand on compte ce qu'il y a dans la boutique. Mais c'est
 * une arme dangereuse ensuite : le poste de bureau reproposait ce meme bouton a
 * tout produit retombe a zero, si bien qu'une saisie de reassort effacait
 * l'historique au lieu de l'augmenter.
 *
 * Ici la regle est mecanique : un produit disparait de cet ecran des qu'il a UN
 * mouvement, quel qu'il soit. Passe ce point, on entre du stock par une entree
 * et on le corrige par un ajustement, deux gestes qui laissent une trace et qui
 * partent du stock existant. La question "ecraser ou cumuler ?" ne se pose donc
 * jamais a l'utilisateur.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { C, analyserNombre, formaterFrancs, formaterQuantite, s } from '../produit/nouveau';
import {
  chargerProduitsStock,
  convertirVersBase,
  ecrireStockInitial,
  messageDe,
  normaliser,
  unitesDisponibles,
  type LigneStockInitial,
  type ProduitStock,
} from '../(tabs)/stock';
import { BandeauEtat, couleurs } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';

interface Saisie {
  quantiteTexte: string;
  uniteNom: string;
  prixTexte: string;
}

type Etat =
  | { phase: 'chargement' }
  | { phase: 'erreur'; message: string }
  | { phase: 'pret'; produits: ProduitStock[] };

export default function StockInitial() {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' });
  const [saisies, setSaisies] = useState<Record<number, Saisie>>({});
  const [recherche, setRecherche] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setEtat({ phase: 'chargement' });
    try {
      const tous = await chargerProduitsStock();
      // Le suivi de stock doit etre actif, sinon renseigner une quantite de
      // depart n'a aucun sens : rien ne la fera bouger ensuite.
      const aInitialiser = tous.filter((p) => p.gestion_stock === 1 && p.nb_mouvements === 0);
      setEtat({ phase: 'pret', produits: aInitialiser });
    } catch (probleme) {
      setEtat({ phase: 'erreur', message: messageDe(probleme) });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger]),
  );

  const produits = etat.phase === 'pret' ? etat.produits : [];

  const lire = useCallback(
    (produit: ProduitStock): Saisie =>
      saisies[produit.id] ?? {
        quantiteTexte: '',
        uniteNom: produit.unite_base,
        prixTexte: '',
      },
    [saisies],
  );

  const ecrire = useCallback((identifiant: number, saisie: Saisie) => {
    setSaisies((precedentes) => ({ ...precedentes, [identifiant]: saisie }));
    setErreur(null);
  }, []);

  const filtres = useMemo(() => {
    const terme = normaliser(recherche.trim());
    if (terme === '') return produits;
    return produits.filter(
      (p) =>
        normaliser(p.nom).includes(terme) ||
        normaliser(p.categorie ?? '').includes(terme) ||
        normaliser(p.code_barre ?? '').includes(terme),
    );
  }, [produits, recherche]);

  /**
   * Le bilan porte sur TOUTES les saisies, pas seulement sur celles visibles :
   * une recherche en cours ne doit pas laisser croire qu'on va enregistrer
   * moins de lignes qu'il n'y en a.
   */
  const bilan = useMemo(() => {
    let nombre = 0;
    let valeur = 0;
    let invalide = false;

    for (const produit of produits) {
      const saisie = saisies[produit.id];
      if (!saisie || saisie.quantiteTexte.trim() === '') continue;

      const quantite = analyserNombre(saisie.quantiteTexte);
      if (quantite === null || quantite < 0) {
        invalide = true;
        continue;
      }
      if (quantite === 0) continue;

      const unites = unitesDisponibles(produit);
      const unite = unites.find((u) => u.nom === saisie.uniteNom) ?? unites[0];
      const prix = analyserNombre(saisie.prixTexte);

      nombre += 1;
      valeur +=
        convertirVersBase(quantite, unite.facteur) *
        (prix !== null && prix > 0 ? prix : produit.prix_achat);
    }

    return { nombre, valeur, invalide };
  }, [produits, saisies]);

  const enregistrer = useCallback(async () => {
    const lignes: LigneStockInitial[] = [];

    for (const produit of produits) {
      const saisie = saisies[produit.id];
      if (!saisie || saisie.quantiteTexte.trim() === '') continue;
      const quantite = analyserNombre(saisie.quantiteTexte);
      if (quantite === null || quantite <= 0) continue;

      const unites = unitesDisponibles(produit);
      const unite = unites.find((u) => u.nom === saisie.uniteNom) ?? unites[0];
      const prix = analyserNombre(saisie.prixTexte);

      lignes.push({
        produitId: produit.id,
        quantite,
        unite: unite.nom,
        facteur: unite.facteur,
        prixAchat: prix !== null && prix > 0 ? prix : null,
      });
    }

    if (lignes.length === 0) {
      setErreur("Renseignez au moins une quantite avant d'enregistrer.");
      return;
    }

    setErreur(null);
    setEnregistrement(true);
    try {
      const ecrites = await ecrireStockInitial(lignes);
      setSaisies({});
      Alert.alert(
        'Stock de depart enregistre',
        `${ecrites} produit(s) sont maintenant suivis en stock.`,
        [{ text: 'Continuer' }],
      );
      await charger();
    } catch (probleme) {
      setErreur(messageDe(probleme));
    } finally {
      setEnregistrement(false);
    }
  }, [charger, produits, saisies]);

  const confirmer = useCallback(() => {
    if (bilan.nombre === 0) {
      setErreur("Renseignez au moins une quantite avant d'enregistrer.");
      return;
    }
    Alert.alert(
      'Enregistrer le stock de depart',
      `${bilan.nombre} produit(s) vont recevoir leur quantite de depart.\n\n` +
        "Cette saisie ne peut se faire qu'une fois par produit : ensuite le stock " +
        'se corrige par un ajustement.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Enregistrer', onPress: () => void enregistrer() },
      ],
    );
  }, [bilan.nombre, enregistrer]);

  return (
    <View style={s.plein}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} style={s.retour}>
          <Icone nom="retour" taille={17} couleur={couleurs.primaire} />
          <Text style={s.retourTexte}>Retour</Text>
        </Pressable>
        <Text style={s.titre}>Stock de depart</Text>
      </View>

      {etat.phase === 'chargement' ? (
        <View style={sl.centre}>
          <ActivityIndicator color={C.accent} />
          <Text style={sl.centreTexte}>Recherche des produits a initialiser...</Text>
        </View>
      ) : etat.phase === 'erreur' ? (
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>La liste n&apos;a pas pu etre lue</Text>
          <Text style={sl.centreTexte}>{etat.message}</Text>
          <Pressable style={s.boutonSecondaire} onPress={() => void charger()}>
            <Text style={s.boutonSecondaireTexte}>Reessayer</Text>
          </Pressable>
        </View>
      ) : produits.length === 0 ? (
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>Tout est deja initialise</Text>
          <Text style={sl.centreTexte}>
            Chaque produit suivi en stock a deja au moins un mouvement. Pour corriger une
            quantite, passez par un ajustement : le stock sera recalcule a partir de ce que vous
            comptez, et la correction restera visible dans le journal.
          </Text>
          <Pressable
            style={s.boutonSecondaire}
            onPress={() => router.replace('/stock/ajustement')}>
            <Text style={s.boutonSecondaireTexte}>Faire un ajustement</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            data={filtres}
            keyExtractor={(produit) => String(produit.id)}
            contentContainerStyle={sl.liste}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListHeaderComponent={
              <View style={sl.tete}>
                <View style={sl.explication}>
                  <Text style={sl.explicationTexte}>
                    Comptez ce que vous avez en boutique et notez-le ici. Laissez vide les
                    produits que vous ne voulez pas compter maintenant : ils resteront dans cette
                    liste.
                  </Text>
                </View>
                <View style={s.zoneSaisie}>
                  <TextInput
                    style={s.saisie}
                    value={recherche}
                    onChangeText={setRecherche}
                    placeholder="Chercher un produit"
                    placeholderTextColor={C.texteFaible}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {recherche !== '' ? (
                    <Pressable onPress={() => setRecherche('')} hitSlop={10}>
                      <Text style={sl.effacer}>Effacer</Text>
                    </Pressable>
                  ) : null}
                </View>
                {erreur ? (
                  <View style={s.banniereErreur}>
                    <Text style={s.banniereErreurTexte}>{erreur}</Text>
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <View style={sl.centre}>
                <Text style={sl.centreTitre}>Aucun resultat</Text>
                <Text style={sl.centreTexte}>Aucun produit a initialiser ne porte ce nom.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <LigneInitiale produit={item} saisie={lire(item)} onChange={(v) => ecrire(item.id, v)} />
            )}
          />

          <View style={sl.pied}>
            <View style={sl.piedTextes}>
              <Text style={sl.piedTitre}>
                {bilan.nombre === 0
                  ? 'Aucune quantite saisie'
                  : `${bilan.nombre} produit(s) a enregistrer`}
              </Text>
              {bilan.nombre > 0 ? (
                <Text style={sl.piedValeur}>
                  Valeur du stock : {formaterFrancs(bilan.valeur)}
                </Text>
              ) : null}
              {bilan.invalide ? (
                <Text style={sl.piedAlerte}>Une quantite saisie est illisible.</Text>
              ) : null}
            </View>
            <Pressable
              style={[
                sl.boutonEnregistrer,
                bilan.nombre === 0 || enregistrement ? s.boutonDesactive : null,
              ]}
              disabled={bilan.nombre === 0 || enregistrement}
              onPress={confirmer}>
              {enregistrement ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={sl.boutonEnregistrerTexte}>Enregistrer</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

// --------------------------------------------------------------------------
// Ligne de saisie
// --------------------------------------------------------------------------

function LigneInitiale(p: {
  produit: ProduitStock;
  saisie: Saisie;
  onChange: (saisie: Saisie) => void;
}) {
  const unites = unitesDisponibles(p.produit);
  const unite = unites.find((u) => u.nom === p.saisie.uniteNom) ?? unites[0];
  const quantite = analyserNombre(p.saisie.quantiteTexte);
  const illisible = p.saisie.quantiteTexte.trim() !== '' && (quantite === null || quantite < 0);

  const enBase =
    quantite !== null && quantite > 0 && unite.facteur !== 1
      ? convertirVersBase(quantite, unite.facteur)
      : null;

  return (
    <View style={sl.carte}>
      <View style={sl.carteHaut}>
        <Text style={sl.nom} numberOfLines={2}>
          {p.produit.nom}
        </Text>
        <Text style={sl.categorie} numberOfLines={1}>
          {(p.produit.categorie ?? '').trim() === ''
            ? 'Sans categorie'
            : (p.produit.categorie ?? '').trim()}
        </Text>
      </View>

      {unites.length > 1 ? (
        <View style={s.puces}>
          {unites.map((u) => (
            <Pressable
              key={u.nom}
              style={[s.puce, unite.nom === u.nom ? s.puceActive : null]}
              onPress={() => p.onChange({ ...p.saisie, uniteNom: u.nom })}>
              <Text style={[s.puceTexte, unite.nom === u.nom ? s.puceTexteActif : null]}>
                {u.nom}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={sl.champs}>
        <View style={sl.champQuantite}>
          <Text style={sl.libelleCourt}>Quantite</Text>
          <View style={[s.zoneSaisie, illisible ? s.zoneSaisieErreur : null]}>
            <TextInput
              style={s.saisie}
              value={p.saisie.quantiteTexte}
              onChangeText={(valeur) => p.onChange({ ...p.saisie, quantiteTexte: valeur })}
              placeholder="0"
              placeholderTextColor={C.texteFaible}
              keyboardType="decimal-pad"
            />
            <Text style={s.suffixe}>{unite.nom}</Text>
          </View>
        </View>

        <View style={sl.champPrix}>
          <Text style={sl.libelleCourt}>Prix d&apos;achat</Text>
          <View style={s.zoneSaisie}>
            <TextInput
              style={s.saisie}
              value={p.saisie.prixTexte}
              onChangeText={(valeur) => p.onChange({ ...p.saisie, prixTexte: valeur })}
              placeholder={String(Math.round(p.produit.prix_achat))}
              placeholderTextColor={C.texteFaible}
              keyboardType="number-pad"
            />
            <Text style={s.suffixe}>F</Text>
          </View>
        </View>
      </View>

      <Text style={sl.aide}>
        Prix par {p.produit.unite_base}. Laissez vide pour garder celui de la fiche.
        {enBase !== null
          ? ` Soit ${formaterQuantite(enBase)} ${p.produit.unite_base} en stock.`
          : ''}
      </Text>
    </View>
  );
}

const sl = StyleSheet.create({
  liste: { padding: 12, paddingBottom: 24, gap: 8 },
  tete: { gap: 10, paddingBottom: 4 },
  explication: {
    backgroundColor: couleurs.primaireDouce,
    borderWidth: 1,
    borderColor: couleurs.primaireBordure,
    borderRadius: 10,
    padding: 12,
  },
  explicationTexte: { fontSize: 13, color: couleurs.primaire, lineHeight: 19 },
  effacer: { fontSize: 12, color: C.accent, fontWeight: '600' },

  carte: {
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    padding: 12,
    gap: 8,
  },
  carteHaut: { gap: 2 },
  nom: { fontSize: 15, fontWeight: '600', color: C.texte },
  categorie: { fontSize: 11, color: C.texteFaible },

  champs: { flexDirection: 'row', gap: 10 },
  champQuantite: { flex: 3, gap: 4 },
  champPrix: { flex: 2, gap: 4 },
  libelleCourt: { fontSize: 12, fontWeight: '600', color: C.texteFaible },
  aide: { fontSize: 11, color: C.texteFaible, lineHeight: 16 },

  pied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: C.carte,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.bordure,
  },
  piedTextes: { flex: 1, gap: 2 },
  piedTitre: { fontSize: 14, fontWeight: '700', color: C.texte },
  piedValeur: { fontSize: 12, color: C.texteFaible },
  piedAlerte: { fontSize: 12, color: C.rouge, fontWeight: '600' },
  boutonEnregistrer: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  boutonEnregistrerTexte: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centreTitre: { fontSize: 16, fontWeight: '700', color: C.texte },
  centreTexte: { fontSize: 13, color: C.texteFaible, textAlign: 'center', lineHeight: 19 },
});
