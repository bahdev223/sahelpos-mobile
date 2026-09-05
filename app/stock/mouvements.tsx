/**
 * Journal des mouvements de stock : qui a fait bouger quoi, quand et pourquoi.
 *
 * Ecran de LECTURE SEULE. C'est la piece qu'on ouvre quand le stock affiche un
 * chiffre que personne ne comprend, et rien n'y est modifiable : un journal
 * qu'on peut retoucher ne prouve plus rien.
 *
 * POURQUOI LES FILTRES SONT APPLIQUES EN SQL
 * ------------------------------------------
 * Le poste de bureau paginait d'abord et filtrait ensuite la page obtenue : le
 * compteur annoncait un total faux et une page pouvait s'afficher a moitie
 * vide. Ici le filtre entre dans le WHERE, le comptage porte sur ce meme WHERE,
 * et la pagination vient en dernier. Le journal grossit d'une ligne par vente
 * et par reception : il depassera vite ce qu'un telephone peut garder en
 * memoire, d'ou le chargement par tranches.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { obtenirBase } from '../../src/db/database';
import { C, formaterFrancs, formaterQuantite, s } from '../produit/nouveau';
import {
  COULEUR_NATURE,
  LIBELLE_NATURE,
  LIBELLE_SOURCE,
  NATURES,
  SOURCES,
  arrondirQuantite,
  formaterDateHeure,
  messageDe,
  type NatureMouvement,
  type SourceOperation,
} from '../(tabs)/stock';
import {
  BARRE_HORIZONTALE, BandeauEtat, couleurs } from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';

const PAR_PAGE = 25;

// --------------------------------------------------------------------------
// Acces aux donnees
// --------------------------------------------------------------------------

interface LigneMouvement {
  id: number;
  produit_id: number;
  produit_nom: string | null;
  unite_base: string | null;
  nature: string;
  source_operation: string;
  quantite: number;
  unite: string | null;
  quantite_base: number;
  stock_avant: number | null;
  stock_apres: number | null;
  prix_unitaire: number | null;
  reference: string | null;
  motif: string | null;
  utilisateur: string | null;
  date_mouvement: string;
}

interface Filtres {
  produitId: number | null;
  nature: NatureMouvement | null;
  source: SourceOperation | null;
  /** Bornes au format AAAA-MM-JJ, ou null pour "depuis toujours". */
  du: string | null;
  au: string | null;
  texte: string;
}

const FILTRES_VIDES: Filtres = {
  produitId: null,
  nature: null,
  source: null,
  du: null,
  au: null,
  texte: '',
};

type Parametre = string | number;

/** Construit la clause WHERE commune au comptage et a la lecture. */
function construireConditions(filtres: Filtres): {
  clause: string;
  parametres: Parametre[];
} {
  const conditions: string[] = [];
  const parametres: Parametre[] = [];

  if (filtres.produitId !== null) {
    conditions.push('m.produit_id = ?');
    parametres.push(filtres.produitId);
  }
  if (filtres.nature !== null) {
    conditions.push('m.nature = ?');
    parametres.push(filtres.nature);
  }
  if (filtres.source !== null) {
    conditions.push('m.source_operation = ?');
    parametres.push(filtres.source);
  }
  if (filtres.du !== null) {
    conditions.push('m.date_mouvement >= ?');
    parametres.push(filtres.du);
  }
  if (filtres.au !== null) {
    // Les dates sont stockees en ISO complet : sans cette borne haute, une
    // journee choisie exclurait tout ce qui s'est passe apres minuit pile.
    conditions.push('m.date_mouvement <= ?');
    parametres.push(`${filtres.au}T23:59:59.999Z`);
  }
  const terme = filtres.texte.trim();
  if (terme !== '') {
    conditions.push('(p.nom LIKE ? OR m.motif LIKE ? OR m.reference LIKE ?)');
    const motif = `%${terme}%`;
    parametres.push(motif, motif, motif);
  }

  return {
    clause: conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`,
    parametres,
  };
}

async function compterMouvements(filtres: Filtres): Promise<number> {
  const db = await obtenirBase();
  const { clause, parametres } = construireConditions(filtres);
  const ligne = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n
       FROM mouvement_stock m
       LEFT JOIN produit p ON p.id = m.produit_id
       ${clause}`,
    parametres,
  );
  return ligne?.n ?? 0;
}

async function chargerMouvements(filtres: Filtres, decalage: number): Promise<LigneMouvement[]> {
  const db = await obtenirBase();
  const { clause, parametres } = construireConditions(filtres);
  return db.getAllAsync<LigneMouvement>(
    `SELECT m.id, m.produit_id, m.nature, m.source_operation, m.quantite, m.unite,
            m.quantite_base, m.stock_avant, m.stock_apres, m.prix_unitaire,
            m.reference, m.motif, m.utilisateur, m.date_mouvement,
            p.nom AS produit_nom, p.unite_base
       FROM mouvement_stock m
       LEFT JOIN produit p ON p.id = m.produit_id
       ${clause}
      ORDER BY m.date_mouvement DESC, m.id DESC
      LIMIT ? OFFSET ?`,
    [...parametres, PAR_PAGE, decalage],
  );
}

interface Suggestion {
  id: number;
  nom: string;
}

async function chercherProduits(terme: string): Promise<Suggestion[]> {
  const db = await obtenirBase();
  return db.getAllAsync<Suggestion>(
    `SELECT id, nom FROM produit
      WHERE nom LIKE ? OR code_barre LIKE ?
      ORDER BY nom COLLATE NOCASE
      LIMIT 8`,
    [`%${terme}%`, `%${terme}%`],
  );
}

async function lireNomProduit(identifiant: number): Promise<string | null> {
  const db = await obtenirBase();
  const ligne = await db.getFirstAsync<{ nom: string }>(
    'SELECT nom FROM produit WHERE id = ?',
    identifiant,
  );
  return ligne?.nom ?? null;
}

// --------------------------------------------------------------------------
// Dates
// --------------------------------------------------------------------------

function enJourIso(date: Date): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
}

function ilYaJours(nombre: number): string {
  const date = new Date();
  date.setDate(date.getDate() - nombre);
  return enJourIso(date);
}

/** Accepte "27/08/2026" ou "27-08-2026" et rend "2026-08-27". */
function analyserDateSaisie(texte: string): string | null {
  const nettoye = texte.trim();
  if (nettoye === '') return null;
  const morceaux = nettoye.split(/[/\-.]/);
  if (morceaux.length !== 3) return null;
  const jour = Number(morceaux[0]);
  const mois = Number(morceaux[1]);
  const annee = Number(morceaux[2]);
  if (!Number.isInteger(jour) || !Number.isInteger(mois) || !Number.isInteger(annee)) return null;
  if (jour < 1 || jour > 31 || mois < 1 || mois > 12 || annee < 2000 || annee > 2100) return null;
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${annee}-${deux(mois)}-${deux(jour)}`;
}

function afficherJourIso(iso: string | null): string {
  if (iso === null) return '';
  const [annee, mois, jour] = iso.split('-');
  return `${jour}/${mois}/${annee}`;
}

// --------------------------------------------------------------------------
// Lecture d'une ligne
// --------------------------------------------------------------------------

interface Effet {
  texte: string;
  couleur: string;
}

/**
 * Ce que la ligne a REELLEMENT fait au stock.
 *
 * Sur un ajustement, la colonne `quantite_base` porte le stock compte et non
 * l'ecart : le poste de bureau l'affichait tel quel, precede d'un signe moins,
 * si bien qu'un inventaire en excedent se lisait comme une grosse sortie. Ici
 * l'ecart se lit ou il est juste, entre le stock d'avant et celui d'apres.
 */
function effetSurStock(m: LigneMouvement): Effet {
  const unite = m.unite ?? m.unite_base ?? '';

  if (m.nature === 'AJUSTEMENT') {
    if (m.stock_avant === null || m.stock_apres === null) {
      return { texte: `Compte a ${formaterQuantite(m.quantite_base)}`, couleur: C.orange };
    }
    const ecart = arrondirQuantite(m.stock_apres - m.stock_avant);
    if (ecart === 0) return { texte: 'Sans ecart', couleur: C.texteFaible };
    const signe = ecart > 0 ? '+' : '-';
    return {
      texte: `${signe}${formaterQuantite(Math.abs(ecart))} ${m.unite_base ?? ''}`.trim(),
      couleur: ecart > 0 ? C.vert : C.rouge,
    };
  }

  const signe = m.nature === 'ENTREE' ? '+' : '-';
  return {
    texte: `${signe}${formaterQuantite(m.quantite)} ${unite}`.trim(),
    couleur: m.nature === 'ENTREE' ? C.vert : C.rouge,
  };
}

function libelleNature(nature: string): string {
  return nature in LIBELLE_NATURE ? LIBELLE_NATURE[nature as NatureMouvement] : nature;
}

function libelleSource(source: string): string {
  return source in LIBELLE_SOURCE ? LIBELLE_SOURCE[source as SourceOperation] : source;
}

function couleurNature(nature: string): string {
  return nature in COULEUR_NATURE ? COULEUR_NATURE[nature as NatureMouvement] : C.texteFaible;
}

// --------------------------------------------------------------------------
// Ecran
// --------------------------------------------------------------------------

type Phase = 'chargement' | 'erreur' | 'pret';

export default function Mouvements() {
  const router = useRouter();
  const parametres = useLocalSearchParams<{ produit?: string; nature?: string }>();

  // Les autres ecrans arrivent ici avec un filtre deja pose : la fiche produit
  // sur un produit, l'ecran des receptions sur les entrees.
  const [filtres, setFiltres] = useState<Filtres>(() => {
    const produitInitial = Number(parametres.produit);
    const nature = parametres.nature;
    return {
      ...FILTRES_VIDES,
      produitId:
        Number.isInteger(produitInitial) && produitInitial > 0 ? produitInitial : null,
      nature:
        nature === 'ENTREE' || nature === 'SORTIE' || nature === 'AJUSTEMENT' ? nature : null,
    };
  });
  const [nomProduitFiltre, setNomProduitFiltre] = useState('');
  const [panneauOuvert, setPanneauOuvert] = useState(false);

  const [phase, setPhase] = useState<Phase>('chargement');
  const [message, setMessage] = useState('');
  const [lignes, setLignes] = useState<LigneMouvement[]>([]);
  const [total, setTotal] = useState(0);
  const [suiteEnCours, setSuiteEnCours] = useState(false);

  // Une reponse lente ne doit pas ecraser le resultat d'un filtre pose depuis.
  const jeton = useRef(0);

  const charger = useCallback(async (aAppliquer: Filtres) => {
    const mien = ++jeton.current;
    setPhase('chargement');
    try {
      const [nombre, premieres] = await Promise.all([
        compterMouvements(aAppliquer),
        chargerMouvements(aAppliquer, 0),
      ]);
      if (mien !== jeton.current) return;
      setTotal(nombre);
      setLignes(premieres);
      setPhase('pret');
    } catch (erreur) {
      if (mien !== jeton.current) return;
      setMessage(messageDe(erreur));
      setPhase('erreur');
    }
  }, []);

  // Un seul declencheur pour deux besoins : recharger quand un filtre change,
  // et recharger au retour de l'ecran d'ajustement, qui vient peut-etre
  // d'ajouter une ligne. Doubler avec un `useEffect` sur les memes dependances
  // ferait partir deux requetes identiques a chaque frappe.
  useFocusEffect(
    useCallback(() => {
      void charger(filtres);
    }, [charger, filtres]),
  );

  useEffect(() => {
    if (filtres.produitId === null) {
      setNomProduitFiltre('');
      return;
    }
    let vivant = true;
    void lireNomProduit(filtres.produitId).then((nom) => {
      if (vivant) setNomProduitFiltre(nom ?? `Produit ${filtres.produitId}`);
    });
    return () => {
      vivant = false;
    };
  }, [filtres.produitId]);

  const chargerSuite = useCallback(async () => {
    if (suiteEnCours || lignes.length >= total) return;
    const mien = jeton.current;
    setSuiteEnCours(true);
    try {
      const suivantes = await chargerMouvements(filtres, lignes.length);
      if (mien !== jeton.current) return;
      setLignes((precedentes) => [...precedentes, ...suivantes]);
    } catch (erreur) {
      setMessage(messageDe(erreur));
      setPhase('erreur');
    } finally {
      setSuiteEnCours(false);
    }
  }, [filtres, lignes.length, suiteEnCours, total]);

  const nbFiltresActifs = useMemo(() => {
    let nombre = 0;
    if (filtres.produitId !== null) nombre += 1;
    if (filtres.nature !== null) nombre += 1;
    if (filtres.source !== null) nombre += 1;
    if (filtres.du !== null || filtres.au !== null) nombre += 1;
    if (filtres.texte.trim() !== '') nombre += 1;
    return nombre;
  }, [filtres]);

  return (
    <View style={s.plein}>
      <BandeauEtat />
      <View style={s.entete}>
        <Pressable onPress={() => router.back()} style={s.retour}>
          <Icone nom="retour" taille={17} couleur={couleurs.primaire} />
          <Text style={s.retourTexte}>Retour</Text>
        </Pressable>
        <Text style={s.titre}>Journal du stock</Text>
      </View>

      <View style={sl.barre}>
        <Pressable
          style={[sl.boutonFiltres, panneauOuvert ? sl.boutonFiltresActif : null]}
          onPress={() => setPanneauOuvert(!panneauOuvert)}>
          <Text style={[sl.boutonFiltresTexte, panneauOuvert ? sl.boutonFiltresTexteActif : null]}>
            Filtres{nbFiltresActifs > 0 ? ` (${nbFiltresActifs})` : ''}
          </Text>
        </Pressable>
        {nbFiltresActifs > 0 ? (
          <Pressable onPress={() => setFiltres(FILTRES_VIDES)} hitSlop={8}>
            <Text style={sl.effacerTout}>Tout effacer</Text>
          </Pressable>
        ) : null}
        <View style={sl.espaceur} />
        <Text style={sl.compteur}>
          {phase === 'pret' ? `${total} mouvement(s)` : ''}
        </Text>
      </View>

      {nbFiltresActifs > 0 && !panneauOuvert ? (
        <ScrollView
          horizontal
          style={BARRE_HORIZONTALE}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={sl.resume}>
          {filtres.produitId !== null ? (
            <Etiquette
              texte={nomProduitFiltre || 'Produit'}
              onRetirer={() => setFiltres({ ...filtres, produitId: null })}
            />
          ) : null}
          {filtres.nature !== null ? (
            <Etiquette
              texte={LIBELLE_NATURE[filtres.nature]}
              onRetirer={() => setFiltres({ ...filtres, nature: null })}
            />
          ) : null}
          {filtres.source !== null ? (
            <Etiquette
              texte={LIBELLE_SOURCE[filtres.source]}
              onRetirer={() => setFiltres({ ...filtres, source: null })}
            />
          ) : null}
          {filtres.du !== null || filtres.au !== null ? (
            <Etiquette
              texte={`${filtres.du ? afficherJourIso(filtres.du) : '...'} - ${
                filtres.au ? afficherJourIso(filtres.au) : '...'
              }`}
              onRetirer={() => setFiltres({ ...filtres, du: null, au: null })}
            />
          ) : null}
          {filtres.texte.trim() !== '' ? (
            <Etiquette
              texte={`"${filtres.texte.trim()}"`}
              onRetirer={() => setFiltres({ ...filtres, texte: '' })}
            />
          ) : null}
        </ScrollView>
      ) : null}

      {panneauOuvert ? (
        <PanneauFiltres
          filtres={filtres}
          nomProduit={nomProduitFiltre}
          onChange={setFiltres}
          onFermer={() => setPanneauOuvert(false)}
        />
      ) : null}

      {phase === 'chargement' ? (
        <View style={sl.centre}>
          <ActivityIndicator color={C.accent} />
          <Text style={sl.centreTexte}>Lecture du journal...</Text>
        </View>
      ) : phase === 'erreur' ? (
        <View style={sl.centre}>
          <Text style={sl.centreTitre}>Le journal n&apos;a pas pu etre lu</Text>
          <Text style={sl.centreTexte}>{message}</Text>
          <Pressable style={s.boutonSecondaire} onPress={() => void charger(filtres)}>
            <Text style={s.boutonSecondaireTexte}>Reessayer</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={lignes}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={lignes.length === 0 ? sl.listeVide : sl.liste}
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.4}
          onEndReached={() => void chargerSuite()}
          ListEmptyComponent={
            <View style={sl.centre}>
              <Text style={sl.centreTitre}>Aucun mouvement</Text>
              <Text style={sl.centreTexte}>
                {nbFiltresActifs > 0
                  ? 'Aucun mouvement ne correspond a ces filtres.'
                  : "Le journal se remplit tout seul : chaque vente, chaque entree et chaque " +
                    'ajustement y laisse une ligne.'}
              </Text>
              {nbFiltresActifs > 0 ? (
                <Pressable style={s.boutonSecondaire} onPress={() => setFiltres(FILTRES_VIDES)}>
                  <Text style={s.boutonSecondaireTexte}>Effacer les filtres</Text>
                </Pressable>
              ) : null}
            </View>
          }
          ListFooterComponent={
            lignes.length === 0 ? null : lignes.length < total ? (
              <View style={sl.pied}>
                {suiteEnCours ? (
                  <ActivityIndicator color={C.accent} />
                ) : (
                  <Pressable style={s.boutonSecondaire} onPress={() => void chargerSuite()}>
                    <Text style={s.boutonSecondaireTexte}>
                      Charger la suite ({total - lignes.length} restant(s))
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <Text style={sl.piedTexte}>
                {total} mouvement(s) - c&apos;est tout le journal
              </Text>
            )
          }
          renderItem={({ item }) => <CarteMouvement mouvement={item} />}
        />
      )}
    </View>
  );
}

function Etiquette(p: { texte: string; onRetirer: () => void }) {
  return (
    <View style={sl.etiquette}>
      <Text style={sl.etiquetteTexte} numberOfLines={1}>
        {p.texte}
      </Text>
      <Pressable onPress={p.onRetirer} hitSlop={8}>
        <Text style={sl.etiquetteCroix}>X</Text>
      </Pressable>
    </View>
  );
}

// --------------------------------------------------------------------------
// Panneau de filtres
// --------------------------------------------------------------------------

function PanneauFiltres(p: {
  filtres: Filtres;
  nomProduit: string;
  onChange: (filtres: Filtres) => void;
  onFermer: () => void;
}) {
  const [saisieProduit, setSaisieProduit] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [texte, setTexte] = useState(p.filtres.texte);
  const [du, setDu] = useState(afficherJourIso(p.filtres.du));
  const [au, setAu] = useState(afficherJourIso(p.filtres.au));

  // La completion interroge la base a la frappe, limitee a huit reponses : une
  // liste plus longue ne tient pas sous le clavier et n'aide plus a choisir.
  useEffect(() => {
    const terme = saisieProduit.trim();
    if (terme.length < 2) {
      setSuggestions([]);
      return;
    }
    let vivant = true;
    void chercherProduits(terme)
      .then((trouves) => {
        if (vivant) setSuggestions(trouves);
      })
      .catch(() => {
        if (vivant) setSuggestions([]);
      });
    return () => {
      vivant = false;
    };
  }, [saisieProduit]);

  const appliquerDates = useCallback(() => {
    p.onChange({
      ...p.filtres,
      du: analyserDateSaisie(du),
      au: analyserDateSaisie(au),
    });
  }, [au, du, p]);

  const periode = useCallback(
    (jours: number | null) => {
      if (jours === null) {
        setDu('');
        setAu('');
        p.onChange({ ...p.filtres, du: null, au: null });
        return;
      }
      const debut = jours === 0 ? enJourIso(new Date()) : ilYaJours(jours);
      const fin = enJourIso(new Date());
      setDu(afficherJourIso(debut));
      setAu(afficherJourIso(fin));
      p.onChange({ ...p.filtres, du: debut, au: fin });
    },
    [p],
  );

  return (
    <ScrollView style={sl.panneau} keyboardShouldPersistTaps="handled">
      <View style={sl.bloc}>
        <Text style={s.libelle}>Produit</Text>
        {p.filtres.produitId !== null ? (
          <View style={sl.produitChoisi}>
            <Text style={sl.produitChoisiNom} numberOfLines={1}>
              {p.nomProduit || 'Produit selectionne'}
            </Text>
            <Pressable
              onPress={() => {
                setSaisieProduit('');
                p.onChange({ ...p.filtres, produitId: null });
              }}
              hitSlop={8}>
              <Text style={sl.retirer}>Retirer</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={s.zoneSaisie}>
              <TextInput
                style={s.saisie}
                value={saisieProduit}
                onChangeText={setSaisieProduit}
                placeholder="Tapez les premieres lettres"
                placeholderTextColor={C.texteFaible}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion.id}
                style={sl.suggestion}
                onPress={() => {
                  setSaisieProduit('');
                  setSuggestions([]);
                  p.onChange({ ...p.filtres, produitId: suggestion.id });
                }}>
                <Text style={sl.suggestionTexte} numberOfLines={1}>
                  {suggestion.nom}
                </Text>
              </Pressable>
            ))}
            {saisieProduit.trim().length >= 2 && suggestions.length === 0 ? (
              <Text style={s.explication}>Aucun produit ne porte ce nom.</Text>
            ) : null}
          </>
        )}
      </View>

      <View style={sl.bloc}>
        <Text style={s.libelle}>Nature</Text>
        <View style={s.puces}>
          <Puce
            texte="Toutes"
            actif={p.filtres.nature === null}
            onPress={() => p.onChange({ ...p.filtres, nature: null })}
          />
          {NATURES.map((nature) => (
            <Puce
              key={nature}
              texte={LIBELLE_NATURE[nature]}
              actif={p.filtres.nature === nature}
              onPress={() =>
                p.onChange({
                  ...p.filtres,
                  nature: p.filtres.nature === nature ? null : nature,
                })
              }
            />
          ))}
        </View>
      </View>

      <View style={sl.bloc}>
        <Text style={s.libelle}>Origine</Text>
        <View style={s.puces}>
          <Puce
            texte="Toutes"
            actif={p.filtres.source === null}
            onPress={() => p.onChange({ ...p.filtres, source: null })}
          />
          {SOURCES.map((source) => (
            <Puce
              key={source}
              texte={LIBELLE_SOURCE[source]}
              actif={p.filtres.source === source}
              onPress={() =>
                p.onChange({
                  ...p.filtres,
                  source: p.filtres.source === source ? null : source,
                })
              }
            />
          ))}
        </View>
      </View>

      <View style={sl.bloc}>
        <Text style={s.libelle}>Periode</Text>
        <View style={s.puces}>
          <Puce texte="Tout" actif={p.filtres.du === null && p.filtres.au === null} onPress={() => periode(null)} />
          <Puce texte="Aujourd'hui" actif={false} onPress={() => periode(0)} />
          <Puce texte="7 jours" actif={false} onPress={() => periode(7)} />
          <Puce texte="30 jours" actif={false} onPress={() => periode(30)} />
        </View>
        <View style={sl.dates}>
          <View style={sl.date}>
            <Text style={s.explication}>Du</Text>
            <View style={s.zoneSaisie}>
              <TextInput
                style={s.saisie}
                value={du}
                onChangeText={setDu}
                onBlur={appliquerDates}
                placeholder="JJ/MM/AAAA"
                placeholderTextColor={C.texteFaible}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          <View style={sl.date}>
            <Text style={s.explication}>Au</Text>
            <View style={s.zoneSaisie}>
              <TextInput
                style={s.saisie}
                value={au}
                onChangeText={setAu}
                onBlur={appliquerDates}
                placeholder="JJ/MM/AAAA"
                placeholderTextColor={C.texteFaible}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
        </View>
        {(du.trim() !== '' && analyserDateSaisie(du) === null) ||
        (au.trim() !== '' && analyserDateSaisie(au) === null) ? (
          <Text style={s.messageErreur}>Date attendue au format JJ/MM/AAAA.</Text>
        ) : null}
      </View>

      <View style={sl.bloc}>
        <Text style={s.libelle}>Motif ou reference</Text>
        <View style={s.zoneSaisie}>
          <TextInput
            style={s.saisie}
            value={texte}
            onChangeText={setTexte}
            onBlur={() => p.onChange({ ...p.filtres, texte })}
            placeholder="Casse, bon de livraison, numero de vente..."
            placeholderTextColor={C.texteFaible}
            autoCapitalize="none"
          />
        </View>
      </View>

      <View style={sl.panneauActions}>
        <Pressable
          style={s.boutonFantomeSombre}
          onPress={() => {
            setSaisieProduit('');
            setTexte('');
            setDu('');
            setAu('');
            p.onChange(FILTRES_VIDES);
          }}>
          <Text style={s.boutonFantomeSombreTexte}>Tout effacer</Text>
        </Pressable>
        <Pressable
          style={s.boutonPrincipal}
          onPress={() => {
            p.onChange({ ...p.filtres, texte, du: analyserDateSaisie(du), au: analyserDateSaisie(au) });
            p.onFermer();
          }}>
          <Text style={s.boutonPrincipalTexte}>Voir les resultats</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Puce(p: { texte: string; actif: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.puce, p.actif ? s.puceActive : null]} onPress={p.onPress}>
      <Text style={[s.puceTexte, p.actif ? s.puceTexteActif : null]}>{p.texte}</Text>
    </Pressable>
  );
}

// --------------------------------------------------------------------------
// Ligne du journal
// --------------------------------------------------------------------------

function CarteMouvement({ mouvement }: { mouvement: LigneMouvement }) {
  const effet = effetSurStock(mouvement);
  const couleur = couleurNature(mouvement.nature);

  return (
    <View style={sl.carte}>
      <View style={[sl.bande, { backgroundColor: couleur }]} />
      <View style={sl.carteCorps}>
        <View style={sl.carteHaut}>
          <Text style={sl.produit} numberOfLines={2}>
            {mouvement.produit_nom ?? 'Produit supprime'}
          </Text>
          <Text style={[sl.effet, { color: effet.couleur }]} numberOfLines={1}>
            {effet.texte}
          </Text>
        </View>

        <View style={sl.badges}>
          <View style={[sl.badge, { borderColor: couleur }]}>
            <Text style={[sl.badgeTexte, { color: couleur }]}>
              {libelleNature(mouvement.nature)}
            </Text>
          </View>
          <View style={sl.badgeDoux}>
            <Text style={sl.badgeDouxTexte}>{libelleSource(mouvement.source_operation)}</Text>
          </View>
          <Text style={sl.dateMouvement}>{formaterDateHeure(mouvement.date_mouvement)}</Text>
        </View>

        {mouvement.stock_avant !== null && mouvement.stock_apres !== null ? (
          <Text style={sl.detail}>
            Stock : {formaterQuantite(mouvement.stock_avant)} vers{' '}
            {formaterQuantite(mouvement.stock_apres)} {mouvement.unite_base ?? ''}
          </Text>
        ) : null}

        {mouvement.motif ? (
          <Text style={sl.detail} numberOfLines={2}>
            {mouvement.motif}
          </Text>
        ) : null}

        <View style={sl.carteBas}>
          {mouvement.reference ? (
            <Text style={sl.reference} numberOfLines={1}>
              {mouvement.reference}
            </Text>
          ) : null}
          {mouvement.prix_unitaire !== null && mouvement.prix_unitaire > 0 ? (
            <Text style={sl.prix}>{formaterFrancs(mouvement.prix_unitaire)} / unite</Text>
          ) : null}
          {mouvement.utilisateur ? (
            <Text style={sl.utilisateur} numberOfLines={1}>
              {mouvement.utilisateur}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// --------------------------------------------------------------------------
// Styles
// --------------------------------------------------------------------------

const sl = StyleSheet.create({
  barre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.carte,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.bordure,
  },
  boutonFiltres: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.bordure,
  },
  boutonFiltresActif: { backgroundColor: C.accent, borderColor: C.accent },
  boutonFiltresTexte: { fontSize: 13, fontWeight: '600', color: C.accent },
  boutonFiltresTexteActif: { color: '#FFFFFF' },
  effacerTout: { fontSize: 12, color: C.rouge, fontWeight: '600' },
  espaceur: { flex: 1 },
  compteur: { fontSize: 12, color: C.texteFaible },

  resume: {
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  etiquette: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: couleurs.primaireDouce,
    borderWidth: 1,
    borderColor: couleurs.primaireBordure,
    maxWidth: 220,
  },
  etiquetteTexte: { fontSize: 12, color: couleurs.primaire, fontWeight: '600', flexShrink: 1 },
  etiquetteCroix: { fontSize: 11, color: couleurs.primaire, fontWeight: '700' },

  panneau: {
    maxHeight: 420,
    backgroundColor: C.carte,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.bordure,
  },
  bloc: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  produitChoisi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: C.bordure,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  produitChoisiNom: { flex: 1, fontSize: 14, color: C.texte, fontWeight: '600' },
  retirer: { fontSize: 12, color: C.rouge, fontWeight: '600' },
  suggestion: {
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.bordure,
  },
  suggestionTexte: { fontSize: 14, color: C.texte },

  dates: { flexDirection: 'row', gap: 10 },
  date: { flex: 1, gap: 4 },

  panneauActions: { flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 16 },

  liste: { padding: 12, paddingBottom: 32, gap: 8 },
  listeVide: { flexGrow: 1, padding: 12 },

  carte: {
    flexDirection: 'row',
    backgroundColor: C.carte,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.bordure,
    overflow: 'hidden',
  },
  bande: { width: 4 },
  carteCorps: { flex: 1, padding: 10, gap: 5 },
  carteHaut: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  produit: { flex: 1, fontSize: 15, fontWeight: '600', color: C.texte },
  effet: { fontSize: 15, fontWeight: '700' },

  badges: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  badgeTexte: { fontSize: 10, fontWeight: '700' },
  badgeDoux: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: C.fond,
  },
  badgeDouxTexte: { fontSize: 10, color: C.texteFaible, fontWeight: '600' },
  dateMouvement: { fontSize: 11, color: C.texteFaible },

  detail: { fontSize: 12, color: C.texteFaible, lineHeight: 17 },
  carteBas: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  reference: { fontSize: 11, color: C.accent, fontWeight: '600' },
  prix: { fontSize: 11, color: C.texteFaible },
  utilisateur: { fontSize: 11, color: C.texteFaible, fontStyle: 'italic' },

  pied: { paddingVertical: 16, alignItems: 'center' },
  piedTexte: { paddingVertical: 16, fontSize: 12, color: C.texteFaible, textAlign: 'center' },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centreTitre: { fontSize: 16, fontWeight: '700', color: C.texte },
  centreTexte: { fontSize: 13, color: C.texteFaible, textAlign: 'center', lineHeight: 19 },
});
