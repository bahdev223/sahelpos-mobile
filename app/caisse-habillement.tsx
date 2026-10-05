import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Client, ModePaiement } from '../src/domain/types';
import type { VarianteProduitLocale } from '../src/domain/habillement';
import { listerClients } from '../src/db/repositories/client';
import {
  listerModelesHabillement,
  type ModeleHabillementMobile,
} from '../src/services/catalogueHabillement';
import {
  ajouterVariantePanier,
  decrireVariante,
  nomVariante,
} from '../src/services/caisseHabillement';
import {
  calculerLigne,
  calculerTotal,
  enregistrerVente,
  StockInsuffisant,
  type ArticlePanier,
  type ResultatVente,
} from '../src/services/vente';
import {
  BandeauEtat,
  Bouton,
  Montant,
  couleurs,
  formaterMontant,
  uriImage,
} from '../src/ui/components';
import { Icone } from '../src/ui/icones';
import { useSession } from './_layout';

type Vue = 'catalogue' | 'panier';

interface VenteTerminee {
  resultat: ResultatVente;
  montantRecu: number;
  montantPaye: number;
  mode: ModePaiement;
}

function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function CaisseHabillementMobile() {
  const { boutique, utilisateur, revisionSynchronisation, synchroniserMaintenant } = useSession();
  const [modeles, setModeles] = useState<ModeleHabillementMobile[]>([]);
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [selection, setSelection] = useState<ModeleHabillementMobile | null>(null);
  const [panier, setPanier] = useState<ArticlePanier[]>([]);
  const [vue, setVue] = useState<Vue>('catalogue');
  const [paiement, setPaiement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [rafraichissement, setRafraichissement] = useState(false);
  const [terminee, setTerminee] = useState<VenteTerminee | null>(null);

  const charger = useCallback(async () => {
    try {
      setModeles(await listerModelesHabillement());
    } finally {
      setChargement(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void charger();
  }, [charger, revisionSynchronisation]));

  const visibles = useMemo(() => {
    const q = normaliser(recherche.trim());
    if (!q) return modeles;
    return modeles.filter((modele) => {
      const champs = [
        modele.produit.nom,
        modele.categorieMode ?? '',
        modele.marque ?? '',
        ...modele.tailles,
        ...modele.couleurs.map((c) => c.nom),
        ...modele.variantes.map((v) => v.sku),
      ];
      return champs.some((champ) => normaliser(champ).includes(q));
    });
  }, [modeles, recherche]);

  const total = useMemo(() => calculerTotal(panier), [panier]);
  const totalPieces = useMemo(
    () => panier.reduce((somme, ligne) => somme + ligne.quantite, 0),
    [panier],
  );

  const ajouter = useCallback((
    modele: ModeleHabillementMobile,
    variante: VarianteProduitLocale,
    quantite: number,
  ): boolean => {
    const resultat = ajouterVariantePanier(panier, modele, variante, quantite);
    if (!resultat.ok) {
      setErreur(resultat.erreur);
      return false;
    }
    setPanier(resultat.panier);
    setErreur('');
    return true;
  }, [panier]);

  const modifierQuantite = useCallback((index: number, delta: number) => {
    const ligne = panier[index];
    if (!ligne) return;
    const prochaine = ligne.quantite + delta;
    if (prochaine <= 0) return;
    if (
      ligne.produit.gestionStock &&
      ligne.variante &&
      prochaine > ligne.variante.stockDisponible
    ) {
      setErreur(`Stock insuffisant pour ${ligne.variante.nom}.`);
      return;
    }
    setErreur('');
    setPanier((courant) =>
      courant.map((article, i) =>
        i === index ? { ...article, quantite: prochaine } : article,
      ),
    );
  }, [panier]);

  const rafraichir = useCallback(async () => {
    setRafraichissement(true);
    try {
      await synchroniserMaintenant();
      await charger();
    } finally {
      setRafraichissement(false);
    }
  }, [charger, synchroniserMaintenant]);

  if (chargement) {
    return (
      <SafeAreaView style={styles.page} edges={['top']}>
        <BandeauEtat />
        <View style={styles.centre}>
          <ActivityIndicator color={couleurs.primaire} />
          <Text style={styles.aide}>Chargement de la collection...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <BandeauEtat />

      <View style={styles.entete}>
        <View>
          <Text style={styles.titre}>Caisse Mode</Text>
          <Text style={styles.sousTitre}>Modèle → couleur → taille</Text>
        </View>
        <Pressable style={styles.panierEntete} onPress={() => setVue('panier')}>
          <Icone nom="caisse" taille={20} couleur={couleurs.primaire} />
          <Text style={styles.panierEnteteTexte}>{totalPieces} pc</Text>
        </Pressable>
      </View>

      {vue === 'catalogue' ? (
        <>
          <View style={styles.recherche}>
            <Icone nom="recherche" taille={18} couleur={couleurs.texteFaible} />
            <TextInput
              value={recherche}
              onChangeText={setRecherche}
              placeholder="Modèle, SKU, taille ou couleur"
              placeholderTextColor={couleurs.texteFaible}
              style={styles.rechercheChamp}
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={visibles}
            keyExtractor={(m) => String(m.produit.id)}
            numColumns={2}
            columnWrapperStyle={styles.ligneGrille}
            contentContainerStyle={styles.grille}
            refreshing={rafraichissement}
            onRefresh={rafraichir}
            ListEmptyComponent={
              <View style={styles.centre}>
                <Text style={styles.videTitre}>Aucun modèle disponible</Text>
                <Text style={styles.aide}>Synchronisez d’abord votre catalogue Habillement.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <CarteModele modele={item} onPress={() => setSelection(item)} />
            )}
          />
        </>
      ) : (
        <PanierMode
          panier={panier}
          devise={boutique.devise}
          erreur={erreur}
          onRetour={() => setVue('catalogue')}
          onModifier={modifierQuantite}
          onRetirer={(index) => setPanier((courant) => courant.filter((_, i) => i !== index))}
          onVider={() => {
            setPanier([]);
            setErreur('');
          }}
          onEncaisser={() => setPaiement(true)}
        />
      )}

      {vue === 'catalogue' ? (
        <View style={styles.barreBas}>
          <Pressable style={styles.totalZone} onPress={() => setVue('panier')}>
            <Text style={styles.totalLabel}>{totalPieces ? `${totalPieces} pièce(s)` : 'Panier vide'}</Text>
            <Montant valeur={total} devise={boutique.devise} taille="grand" />
          </Pressable>
          <Bouton
            titre="Encaisser"
            onPress={() => setPaiement(true)}
            desactive={panier.length === 0}
          />
        </View>
      ) : null}

      {selection ? (
        <SelecteurVariante
          modele={selection}
          panier={panier}
          devise={boutique.devise}
          onFermer={() => setSelection(null)}
          onAjouter={(variante, quantite) => {
            const ok = ajouter(selection, variante, quantite);
            if (ok) setSelection(null);
          }}
        />
      ) : null}

      <PaiementMode
        visible={paiement && panier.length > 0}
        panier={panier}
        total={total}
        devise={boutique.devise}
        utilisateurId={utilisateur?.id ?? null}
        onFermer={() => setPaiement(false)}
        onTerminee={(vente) => {
          setTerminee(vente);
          setPaiement(false);
          setPanier([]);
          setVue('catalogue');
          void charger();
        }}
      />

      {terminee ? (
        <Modal visible animationType="fade" transparent>
          <View style={styles.voile}>
            <View style={styles.succes}>
              <View style={styles.succesIcone}>
                <Icone nom="coche" taille={26} couleur={couleurs.texteInverse} />
              </View>
              <Text style={styles.succesTitre}>Vente enregistrée</Text>
              <Text style={styles.succesNumero}>{terminee.resultat.numero}</Text>
              <Montant valeur={terminee.resultat.total} devise={boutique.devise} taille="grand" />
              <Bouton titre="Nouvelle vente" onPress={() => setTerminee(null)} grand />
            </View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

function CarteModele({ modele, onPress }: { modele: ModeleHabillementMobile; onPress: () => void }) {
  const image = uriImage(modele.produit.cheminImage);
  const rupture = modele.produit.gestionStock && modele.stockDisponible <= 0;
  return (
    <Pressable style={styles.modele} onPress={onPress}>
      {image ? (
        <Image source={{ uri: image }} style={styles.modelePhoto} />
      ) : (
        <View style={[styles.modelePhoto, styles.photoVide]}>
          <Text style={styles.initiale}>{modele.produit.nom.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <Text style={styles.modeleNom} numberOfLines={2}>{modele.produit.nom}</Text>
      <Text style={styles.modeleMeta} numberOfLines={1}>
        {[modele.categorieMode, modele.marque].filter(Boolean).join(' · ') || 'Habillement'}
      </Text>
      <Text style={[styles.modeleStock, rupture && styles.rupture]}>
        {rupture ? 'Rupture' : `${modele.stockDisponible} disponible(s)`}
      </Text>
    </Pressable>
  );
}

function SelecteurVariante({
  modele,
  panier,
  devise,
  onFermer,
  onAjouter,
}: {
  modele: ModeleHabillementMobile;
  panier: ArticlePanier[];
  devise: string;
  onFermer: () => void;
  onAjouter: (variante: VarianteProduitLocale, quantite: number) => void;
}) {
  const optionsCouleurs = useMemo(() => {
    const noms = new Map<string, string | null>();
    for (const variante of modele.variantes) {
      const d = decrireVariante(variante);
      if (d.couleur) noms.set(d.couleur, d.couleurHex);
    }
    return [...noms].map(([nom, codeHex]) => ({ nom, codeHex }));
  }, [modele]);

  const [couleur, setCouleur] = useState<string | null>(optionsCouleurs[0]?.nom ?? null);
  const [taille, setTaille] = useState<string | null>(null);
  const [quantite, setQuantite] = useState(1);

  const candidates = useMemo(
    () => modele.variantes.filter((v) => {
      const d = decrireVariante(v);
      return !couleur || d.couleur === couleur;
    }),
    [modele, couleur],
  );

  const tailles = useMemo(() => {
    const vues = new Set<string>();
    for (const variante of candidates) {
      const d = decrireVariante(variante);
      if (d.taille) vues.add(d.taille);
    }
    return [...vues];
  }, [candidates]);

  useEffect(() => {
    setTaille(tailles[0] ?? null);
    setQuantite(1);
  }, [couleur, tailles.join('|')]);

  const variante = useMemo(
    () => candidates.find((v) => {
      const d = decrireVariante(v);
      return tailles.length === 0 || d.taille === taille;
    }) ?? null,
    [candidates, taille, tailles.length],
  );

  const deja = variante
    ? panier.find((l) => l.variante?.idLocal === variante.idLocal)?.quantite ?? 0
    : 0;
  const disponible = variante ? Math.max(0, variante.stockDisponible - deja) : 0;
  const prix = variante?.prixOverride ?? modele.produit.prixUnitaire;

  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <View style={styles.modaleEntete}>
          <Pressable onPress={onFermer} style={styles.retour}>
            <Icone nom="retour" taille={18} couleur={couleurs.primaire} />
            <Text style={styles.retourTexte}>Catalogue</Text>
          </Pressable>
          <Text style={styles.modaleTitre} numberOfLines={1}>{modele.produit.nom}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.selecteurContenu}>
          <Text style={styles.etapeTitre}>1. Couleur</Text>
          <View style={styles.choixWrap}>
            {optionsCouleurs.length === 0 ? <Text style={styles.aide}>Aucune couleur</Text> : optionsCouleurs.map((c) => (
              <Pressable
                key={c.nom}
                style={[styles.choix, couleur === c.nom && styles.choixActif]}
                onPress={() => setCouleur(c.nom)}
              >
                {c.codeHex ? <View style={[styles.pastilleCouleur, { backgroundColor: c.codeHex }]} /> : null}
                <Text style={[styles.choixTexte, couleur === c.nom && styles.choixTexteActif]}>{c.nom}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.etapeTitre}>2. Taille / pointure</Text>
          <View style={styles.choixWrap}>
            {tailles.length === 0 ? <Text style={styles.aide}>Taille unique</Text> : tailles.map((nom) => {
              const v = candidates.find((x) => decrireVariante(x).taille === nom);
              const auPanier = v ? panier.find((l) => l.variante?.idLocal === v.idLocal)?.quantite ?? 0 : 0;
              const dispo = v ? Math.max(0, v.stockDisponible - auPanier) : 0;
              return (
                <Pressable
                  key={nom}
                  disabled={!v || dispo <= 0}
                  style={[styles.choix, taille === nom && styles.choixActif, (!v || dispo <= 0) && styles.choixInactif]}
                  onPress={() => setTaille(nom)}
                >
                  <Text style={[styles.choixTexte, taille === nom && styles.choixTexteActif]}>{nom}</Text>
                  <Text style={styles.choixStock}>{dispo}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.resumeSelection}>
            <Text style={styles.resumeNom}>{variante ? nomVariante(variante) : 'Sélectionnez une déclinaison'}</Text>
            <Text style={styles.resumeSku}>{variante?.sku ?? ''}</Text>
            <Montant valeur={Math.round(Number(prix || 0))} devise={devise} taille="grand" />
            <Text style={styles.aide}>{modele.produit.gestionStock ? `${disponible} encore disponible(s)` : 'Stock non suivi'}</Text>
          </View>

          <Text style={styles.etapeTitre}>3. Quantité</Text>
          <View style={styles.compteur}>
            <Pressable style={styles.compteurBouton} disabled={quantite <= 1} onPress={() => setQuantite((q) => Math.max(1, q - 1))}>
              <Text style={styles.compteurTexte}>−</Text>
            </Pressable>
            <Text style={styles.compteurValeur}>{quantite}</Text>
            <Pressable style={styles.compteurBouton} disabled={!variante || quantite >= disponible} onPress={() => setQuantite((q) => q + 1)}>
              <Text style={styles.compteurTexte}>+</Text>
            </Pressable>
          </View>
        </ScrollView>
        <View style={styles.modalePied}>
          <Bouton
            titre={variante ? `Ajouter · ${formaterMontant(Number(prix) * quantite, devise)}` : 'Choisissez une déclinaison'}
            onPress={() => variante && onAjouter(variante, quantite)}
            desactive={!variante || (modele.produit.gestionStock && disponible < quantite)}
            grand
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function PanierMode({
  panier,
  devise,
  erreur,
  onRetour,
  onModifier,
  onRetirer,
  onVider,
  onEncaisser,
}: {
  panier: ArticlePanier[];
  devise: string;
  erreur: string;
  onRetour: () => void;
  onModifier: (index: number, delta: number) => void;
  onRetirer: (index: number) => void;
  onVider: () => void;
  onEncaisser: () => void;
}) {
  const total = calculerTotal(panier);
  return (
    <View style={styles.panierPage}>
      <View style={styles.panierEntetePage}>
        <Pressable onPress={onRetour} style={styles.retour}>
          <Icone nom="retour" taille={18} couleur={couleurs.primaire} />
          <Text style={styles.retourTexte}>Catalogue</Text>
        </Pressable>
        <Text style={styles.modaleTitre}>Panier</Text>
      </View>
      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
      <FlatList
        data={panier}
        keyExtractor={(l, i) => l.variante?.idLocal ?? String(i)}
        contentContainerStyle={styles.panierListe}
        ListEmptyComponent={<View style={styles.centre}><Text style={styles.aide}>Panier vide</Text></View>}
        renderItem={({ item, index }) => {
          const ligne = calculerLigne(item);
          return (
            <View style={styles.lignePanier}>
              <View style={styles.lignePanierCorps}>
                <Text style={styles.lignePanierNom}>{item.produit.nom}</Text>
                <Text style={styles.lignePanierVariante}>{item.variante?.nom ?? ''}</Text>
                <Text style={styles.lignePanierPrix}>{formaterMontant(item.prixUnitaire, devise)}</Text>
              </View>
              <View style={styles.lignePanierActions}>
                <Pressable onPress={() => onModifier(index, -1)} disabled={item.quantite <= 1} style={styles.miniBouton}><Text>−</Text></Pressable>
                <Text style={styles.qte}>{item.quantite}</Text>
                <Pressable onPress={() => onModifier(index, 1)} style={styles.miniBouton}><Text>+</Text></Pressable>
                <Text style={styles.ligneTotal}>{formaterMontant(ligne.total, devise)}</Text>
                <Pressable onPress={() => onRetirer(index)}><Icone nom="corbeille" taille={18} couleur={couleurs.danger} /></Pressable>
              </View>
            </View>
          );
        }}
      />
      <View style={styles.panierPied}>
        <View>
          <Text style={styles.totalLabel}>Total</Text>
          <Montant valeur={total} devise={devise} taille="grand" />
        </View>
        <View style={styles.panierBoutons}>
          <Bouton titre="Vider" variante="secondaire" onPress={onVider} desactive={panier.length === 0} />
          <Bouton titre="Encaisser" onPress={onEncaisser} desactive={panier.length === 0} />
        </View>
      </View>
    </View>
  );
}

function PaiementMode({
  visible,
  panier,
  total,
  devise,
  utilisateurId,
  onFermer,
  onTerminee,
}: {
  visible: boolean;
  panier: ArticlePanier[];
  total: number;
  devise: string;
  utilisateurId: number | null;
  onFermer: () => void;
  onTerminee: (vente: VenteTerminee) => void;
}) {
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [montant, setMontant] = useState(String(total));
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState('');

  useEffect(() => {
    if (!visible) return;
    setMode('especes');
    setMontant(String(total));
    setClientId(null);
    setRefus('');
    void listerClients('', 100).then(setClients).catch(() => setClients([]));
  }, [visible, total]);

  const recu = Math.max(0, Math.round(Number(montant) || 0));
  const paye = mode === 'mobile_money' ? total : Math.min(recu, total);
  const blocage =
    mode === 'especes' && recu < total
      ? 'Le montant reçu est inférieur au total.'
      : mode === 'credit' && clientId === null
        ? 'Choisissez un client pour la vente à crédit.'
        : '';

  const valider = useCallback(async () => {
    if (blocage) return;
    setEnCours(true);
    setRefus('');
    try {
      const resultat = await enregistrerVente({
        articles: panier,
        modePaiement: mode,
        montantPaye: paye,
        clientId,
        utilisateurId,
      });
      onTerminee({ resultat, montantRecu: recu, montantPaye: paye, mode });
    } catch (e) {
      setRefus(
        e instanceof StockInsuffisant
          ? e.message
          : e instanceof Error
            ? e.message
            : 'La vente n’a pas pu être enregistrée.',
      );
      setEnCours(false);
    }
  }, [blocage, panier, mode, paye, clientId, utilisateurId, onTerminee, recu]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <View style={styles.modaleEntete}>
          <Pressable onPress={onFermer} style={styles.retour}><Icone nom="retour" taille={18} couleur={couleurs.primaire} /><Text style={styles.retourTexte}>Panier</Text></Pressable>
          <Text style={styles.modaleTitre}>Encaissement</Text>
        </View>
        <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.paiementContenu} keyboardShouldPersistTaps="handled">
            <View style={styles.totalPaiement}>
              <Text style={styles.totalLabel}>Total à payer</Text>
              <Montant valeur={total} devise={devise} taille="grand" />
            </View>

            <Text style={styles.etapeTitre}>Mode de paiement</Text>
            <View style={styles.choixWrap}>
              {([
                ['especes', 'Espèces'],
                ['mobile_money', 'Mobile Money'],
                ['credit', 'Crédit'],
              ] as Array<[ModePaiement, string]>).map(([valeur, libelle]) => (
                <Pressable key={valeur} style={[styles.choix, mode === valeur && styles.choixActif]} onPress={() => {
                  setMode(valeur);
                  setMontant(valeur === 'credit' ? '0' : String(total));
                }}>
                  <Text style={[styles.choixTexte, mode === valeur && styles.choixTexteActif]}>{libelle}</Text>
                </Pressable>
              ))}
            </View>

            {mode !== 'mobile_money' ? (
              <>
                <Text style={styles.etapeTitre}>{mode === 'credit' ? 'Versement immédiat' : 'Montant reçu'}</Text>
                <TextInput
                  value={montant}
                  onChangeText={setMontant}
                  keyboardType="number-pad"
                  style={styles.montantInput}
                />
              </>
            ) : null}

            <Text style={styles.etapeTitre}>Client</Text>
            <View style={styles.clients}>
              <Pressable style={[styles.choix, clientId === null && styles.choixActif]} onPress={() => setClientId(null)}>
                <Text style={[styles.choixTexte, clientId === null && styles.choixTexteActif]}>Client comptoir</Text>
              </Pressable>
              {clients.map((client) => (
                <Pressable key={client.id} style={[styles.choix, clientId === client.id && styles.choixActif]} onPress={() => setClientId(client.id)}>
                  <Text style={[styles.choixTexte, clientId === client.id && styles.choixTexteActif]}>{client.nom}</Text>
                </Pressable>
              ))}
            </View>

            {blocage ? <Text style={styles.erreur}>{blocage}</Text> : null}
            {refus ? <Text style={styles.erreur}>{refus}</Text> : null}
          </ScrollView>
          <View style={styles.modalePied}>
            <Bouton
              titre={`Valider ${formaterMontant(total, devise)}`}
              onPress={() => void valider()}
              desactive={Boolean(blocage) || panier.length === 0}
              enCours={enCours}
              grand
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:couleurs.fond},
  centre:{flex:1,alignItems:'center',justifyContent:'center',padding:24,gap:8},
  aide:{fontSize:13,color:couleurs.texteFaible,textAlign:'center'},
  entete:{paddingHorizontal:14,paddingVertical:10,backgroundColor:couleurs.surface,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:couleurs.bordure},
  titre:{fontSize:22,fontWeight:'900',color:couleurs.texte},sousTitre:{fontSize:12,color:couleurs.texteFaible,marginTop:2},
  panierEntete:{flexDirection:'row',alignItems:'center',gap:6,minHeight:42,paddingHorizontal:10,borderRadius:10,borderWidth:1,borderColor:couleurs.bordure},
  panierEnteteTexte:{fontWeight:'800',color:couleurs.texte},
  recherche:{margin:12,flexDirection:'row',alignItems:'center',gap:8,borderWidth:1,borderColor:couleurs.bordure,borderRadius:12,paddingHorizontal:12,backgroundColor:couleurs.surface},
  rechercheChamp:{flex:1,minHeight:46,color:couleurs.texte,fontSize:15},
  grille:{paddingHorizontal:10,paddingBottom:96,gap:10},ligneGrille:{gap:10},
  modele:{flex:1,backgroundColor:couleurs.surface,borderRadius:12,borderWidth:1,borderColor:couleurs.bordure,padding:9,gap:4},
  modelePhoto:{width:'100%',aspectRatio:1,borderRadius:9,backgroundColor:couleurs.surfaceDouce},photoVide:{alignItems:'center',justifyContent:'center'},initiale:{fontSize:32,fontWeight:'900',color:couleurs.texteFaible},
  modeleNom:{fontSize:14,fontWeight:'800',color:couleurs.texte},modeleMeta:{fontSize:11,color:couleurs.texteFaible},modeleStock:{fontSize:11,fontWeight:'700',color:couleurs.succesFonce},rupture:{color:couleurs.danger},
  barreBas:{position:'absolute',left:0,right:0,bottom:0,minHeight:72,padding:10,borderTopWidth:1,borderTopColor:couleurs.bordure,backgroundColor:couleurs.surface,flexDirection:'row',alignItems:'center',gap:12},
  totalZone:{flex:1},totalLabel:{fontSize:12,color:couleurs.texteFaible,fontWeight:'700'},
  modaleEntete:{minHeight:58,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:couleurs.bordure,backgroundColor:couleurs.surface},
  retour:{flexDirection:'row',alignItems:'center',gap:5},retourTexte:{fontSize:13,fontWeight:'800',color:couleurs.primaire},modaleTitre:{fontSize:17,fontWeight:'900',color:couleurs.texte,flex:1},
  selecteurContenu:{padding:14,paddingBottom:100,gap:12},etapeTitre:{fontSize:14,fontWeight:'900',color:couleurs.texte,marginTop:6},
  choixWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},choix:{minHeight:42,paddingHorizontal:12,borderRadius:10,borderWidth:1,borderColor:couleurs.bordure,backgroundColor:couleurs.surface,flexDirection:'row',alignItems:'center',gap:6},
  choixActif:{borderColor:couleurs.primaire,backgroundColor:couleurs.primaireDouce},choixInactif:{opacity:.4},
  choixTexte:{fontSize:13,fontWeight:'700',color:couleurs.texte},choixTexteActif:{color:couleurs.primaire},choixStock:{fontSize:10,color:couleurs.texteFaible},
  pastilleCouleur:{width:14,height:14,borderRadius:7,borderWidth:1,borderColor:couleurs.bordure},
  resumeSelection:{padding:14,borderRadius:12,backgroundColor:couleurs.surface,borderWidth:1,borderColor:couleurs.bordure,gap:3},resumeNom:{fontSize:16,fontWeight:'800',color:couleurs.texte},resumeSku:{fontSize:11,color:couleurs.texteFaible},
  compteur:{flexDirection:'row',alignItems:'center',alignSelf:'flex-start',borderWidth:1,borderColor:couleurs.bordure,borderRadius:10,overflow:'hidden'},compteurBouton:{width:48,height:46,alignItems:'center',justifyContent:'center',backgroundColor:couleurs.surfaceDouce},compteurTexte:{fontSize:22,color:couleurs.texte},compteurValeur:{minWidth:54,textAlign:'center',fontSize:18,fontWeight:'900',color:couleurs.texte},
  modalePied:{padding:12,borderTopWidth:1,borderTopColor:couleurs.bordure,backgroundColor:couleurs.surface},
  panierPage:{flex:1},panierEntetePage:{minHeight:58,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:14,borderBottomWidth:1,borderBottomColor:couleurs.bordure,backgroundColor:couleurs.surface},
  panierListe:{padding:12,paddingBottom:120,gap:8},lignePanier:{padding:12,borderRadius:11,borderWidth:1,borderColor:couleurs.bordure,backgroundColor:couleurs.surface,flexDirection:'row',gap:10},lignePanierCorps:{flex:1,gap:2},lignePanierNom:{fontSize:14,fontWeight:'800',color:couleurs.texte},lignePanierVariante:{fontSize:12,color:couleurs.texteFaible},lignePanierPrix:{fontSize:12,fontWeight:'700',color:couleurs.primaire},
  lignePanierActions:{alignItems:'center',gap:5,flexDirection:'row'},miniBouton:{width:32,height:32,borderRadius:8,borderWidth:1,borderColor:couleurs.bordure,alignItems:'center',justifyContent:'center'},qte:{minWidth:24,textAlign:'center',fontWeight:'800'},ligneTotal:{minWidth:72,textAlign:'right',fontWeight:'800',color:couleurs.texte},
  panierPied:{position:'absolute',left:0,right:0,bottom:0,padding:12,borderTopWidth:1,borderTopColor:couleurs.bordure,backgroundColor:couleurs.surface,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},panierBoutons:{flexDirection:'row',gap:8},
  paiementContenu:{padding:14,paddingBottom:100,gap:12},totalPaiement:{padding:16,borderRadius:12,backgroundColor:couleurs.primaireDouce,alignItems:'center',gap:4},montantInput:{minHeight:50,borderWidth:1,borderColor:couleurs.bordure,borderRadius:10,paddingHorizontal:14,fontSize:20,fontWeight:'800',textAlign:'right',backgroundColor:couleurs.surface,color:couleurs.texte},
  clients:{gap:7},erreur:{margin:12,padding:10,borderRadius:8,backgroundColor:couleurs.dangerDouce,color:couleurs.danger,fontWeight:'700'},
  voile:{flex:1,backgroundColor:'rgba(15,23,42,.45)',alignItems:'center',justifyContent:'center',padding:20},succes:{width:'100%',maxWidth:380,padding:24,borderRadius:16,backgroundColor:couleurs.surface,alignItems:'center',gap:12},succesIcone:{width:52,height:52,borderRadius:26,backgroundColor:couleurs.succesFonce,alignItems:'center',justifyContent:'center'},succesTitre:{fontSize:22,fontWeight:'900',color:couleurs.texte},succesNumero:{fontSize:13,color:couleurs.texteFaible},videTitre:{fontSize:17,fontWeight:'800',color:couleurs.texte},
});
