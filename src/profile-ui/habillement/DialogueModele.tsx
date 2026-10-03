import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { useSession } from '../../../app/_layout';
import { genererIdLocal } from '../../db/repositories/base';
import { Vignette } from '../../ui/components';
import { Icone } from '../../ui/icones';
import { preparerMatrice, type DimensionModele } from '../../domain/matrice-habillement';
import { PhotoModeleProvisoire } from '../../domain/photo-modele';
import {
  ajouterVariantesHabillement, chargerModelePourEdition, chargerReferentielModeles,
  enregistrerModeleHabillement, type ModelePourEdition,
} from '../../services/modeles-habillement';
import { SelecteurMatrice } from './SelecteurMatrice';
import { HABILLEMENT_MOBILE_THEME as H } from './theme';

interface Props {
  visible: boolean;
  modeleId?: number;
  mode?: 'fiche' | 'variantes';
  surFermer: () => void;
  surEnregistre: (id: number) => void;
}
const nouvellePhotoProvisoire = () => new PhotoModeleProvisoire((chemin) => {
  try { const f = new File(Paths.document, chemin); if (f.exists) f.delete(); } catch { /* Nettoyage non bloquant. */ }
});
const lireNombre = (texte: string, libelle: string, defaut?: number): number => {
  const propre = texte.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!propre && defaut !== undefined) return defaut;
  if (!propre || !/^(\d+(\.\d*)?|\.\d+)$/.test(propre) || !Number.isFinite(Number(propre))) {
    throw new Error(`${libelle} : saisissez un nombre positif ou nul.`);
  }
  return Number(propre);
};

export function DialogueModeleHabillement({ visible, modeleId, mode = 'fiche', surFermer, surEnregistre }: Props) {
  const { utilisateur, boutique, synchroniserMaintenant } = useSession();
  const [phase, setPhase] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [modele, setModele] = useState<ModelePourEdition | null>(null);
  const [references, setReferences] = useState<DimensionModele[]>([]);
  const [selection, setSelection] = useState<number[]>([]);
  const [unique, setUnique] = useState(false);
  const [nom, setNom] = useState(''); const [categorie, setCategorie] = useState('');
  const [prixVente, setPrixVente] = useState(''); const [prixAchat, setPrixAchat] = useState('');
  const [codeBarre, setCodeBarre] = useState(''); const [seuil, setSeuil] = useState('10');
  const [photo, setPhoto] = useState<string | null>(null);
  const identite = useRef(''); const verrou = useRef(false); const cycle = useRef(0);
  const modifie = useRef(false); const fichierProvisoire = useRef(nouvellePhotoProvisoire());
  const variantesSeules = mode === 'variantes';
  const avecMatrice = !modeleId || variantesSeules;

  const charger = useCallback(async () => {
    const courant = ++cycle.current;
    setPhase('chargement'); setMessage('');
    try {
      const [refs, p] = await Promise.all([
        chargerReferentielModeles(), modeleId !== undefined ? chargerModelePourEdition(modeleId) : Promise.resolve(null),
      ]);
      if (courant !== cycle.current) return;
      setReferences(refs); setModele(p); setNom(p?.nom ?? ''); setCategorie(p?.categorie ?? '');
      setPrixVente(p ? String(p.prixUnitaire) : ''); setPrixAchat(p ? String(p.prixAchat) : '');
      setCodeBarre(p?.codeBarre ?? ''); setSeuil(p ? String(p.stockMin) : '10'); setPhoto(p?.cheminImage ?? null);
      setSelection([]); setUnique(false); identite.current = p?.idLocal ?? genererIdLocal();
      modifie.current = false; setPhase('pret');
    } catch (e) {
      if (courant !== cycle.current) return;
      setMessage(e instanceof Error ? e.message : 'Lecture du modèle impossible.'); setPhase('erreur');
    }
  }, [modeleId]);
  useEffect(() => {
    const provisoire = nouvellePhotoProvisoire();
    fichierProvisoire.current = provisoire;
    if (visible) { verrou.current = false; setEnCours(false); void charger(); }
    return () => { cycle.current++; provisoire.abandonner(); };
  }, [visible, mode, charger]);

  const fermer = () => {
    if (verrou.current) return;
    if (!modifie.current) { surFermer(); return; }
    Alert.alert('Fermer la saisie ?', 'Les modifications non enregistrées seront abandonnées.', [
      { text: 'Continuer la saisie', style: 'cancel' },
      { text: 'Abandonner', style: 'destructive', onPress: surFermer },
    ]);
  };
  const champ = (setter: (v: string) => void) => (v: string) => { modifie.current = true; setter(v); };
  const changerSelection = (ids: number[]) => { modifie.current = true; setSelection(ids); };

  const choisirPhoto = async (camera: boolean) => {
    if (verrou.current) return;
    verrou.current = true; setEnCours(true); const courant = cycle.current;
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        throw new Error('Autorisez l’appareil photo pour prendre une image.');
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 0.8 };
      const resultat = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (resultat.canceled || courant !== cycle.current) return;
      const asset = resultat.assets[0]; if (!asset) return;
      const source = new File(asset.uri);
      if (source.size > 4 * 1024 * 1024) throw new Error('La photo dépasse 4 Mo. Choisissez une image plus légère.');
      const extension = asset.mimeType === 'image/png' ? 'png' : asset.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const dossier = new Directory(Paths.document, 'produits');
      if (!dossier.exists) dossier.create({ intermediates: true });
      const chemin = `produits/${genererIdLocal()}.${extension}`;
      source.copy(new File(Paths.document, chemin));
      fichierProvisoire.current.remplacer(chemin);
      setPhoto(chemin); modifie.current = true;
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Photo indisponible.'); }
    finally { verrou.current = false; setEnCours(false); }
  };
  const synchroniserReferences = async () => {
    if (verrou.current) return;
    verrou.current = true; setEnCours(true); setMessage('');
    try {
      await synchroniserMaintenant();
      // Ne pas recharger les champs : le réseau ne doit jamais effacer la saisie en cours.
      setReferences(await chargerReferentielModeles());
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Synchronisation impossible.'); }
    finally { verrou.current = false; setEnCours(false); }
  };
  const enregistrer = async () => {
    if (verrou.current || phase !== 'pret') return;
    verrou.current = true; setEnCours(true); setMessage('');
    let idEnregistre: number | undefined;
    const provisoire = fichierProvisoire.current; const courant = cycle.current;
    try {
      provisoire.commencerSauvegarde();
      if (avecMatrice) preparerMatrice(references, selection, unique);
      if (variantesSeules) {
        if (!modele) throw new Error('Modèle introuvable.');
        await ajouterVariantesHabillement(modele.id, selection, utilisateur?.id ?? 0, unique);
        idEnregistre = modele.id;
      } else {
        const p = await enregistrerModeleHabillement({ id: modele?.id, idLocal: identite.current,
          dateModification: modele?.dateModification, nom, categorie,
          prixUnitaire: lireNombre(prixVente, 'Prix de vente'), prixAchat: lireNombre(prixAchat, 'Prix d’achat', 0),
          codeBarre, stockMin: lireNombre(seuil, 'Seuil de stock', 0), cheminImage: photo,
          valeursIds: avecMatrice ? selection : [], articleUnique: avecMatrice && unique,
        }, utilisateur?.id ?? 0);
        idEnregistre = p.id;
      }
      provisoire.confirmerSauvegarde(); modifie.current = false;
    } catch (e) {
      provisoire.echecSauvegarde();
      if (courant === cycle.current) setMessage(e instanceof Error ? e.message : 'Enregistrement impossible. Votre saisie est conservée.');
    } finally {
      if (courant === cycle.current) { verrou.current = false; setEnCours(false); }
    }
    if (idEnregistre !== undefined) {
      if (courant === cycle.current) surEnregistre(idEnregistre);
      // La transaction a déjà enregistré l'outbox. Un réseau absent ne fait pas perdre la saisie.
      void synchroniserMaintenant().catch(() => {});
    }
  };

  const titre = variantesSeules ? 'Ajouter des variantes' : modeleId ? 'Modifier le modèle' : 'Nouveau modèle';
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={fermer}>
      <SafeAreaView style={s.page} edges={['top', 'bottom']}>
        <View style={s.entete}>
          <Text style={s.titre}>{titre}</Text>
          <Pressable onPress={fermer} disabled={enCours} accessibilityLabel="Fermer la saisie"
            accessibilityRole="button" style={s.icone}>
            <Icone nom="fermer" taille={24} couleur={H.texte} />
          </Pressable>
        </View>
        <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {phase === 'chargement' ? <View style={s.centre}><ActivityIndicator color={H.primaire} /><Text style={s.aide}>Préparation de la saisie…</Text></View> :
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.contenu}>
              {message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.erreur}>{message}</Text> : null}
              {phase === 'erreur' ? <Action titre="Réessayer" surPression={() => void charger()} /> : <>
                {!variantesSeules ? <View style={s.carte}>
                  <Text style={s.sousTitre}>Le modèle</Text>
                  <Vignette chemin={photo} nom={nom || 'Modèle'} taille={112} />
                  <View style={s.rangee}>
                    <Action titre="Photo" surPression={() => void choisirPhoto(true)} secondaire desactive={enCours} />
                    <Action titre="Galerie" surPression={() => void choisirPhoto(false)} secondaire desactive={enCours} />
                  </View>
                  <Champ titre="Nom du vêtement *" valeur={nom} changer={champ(setNom)} desactive={enCours} maxLength={200} />
                  <Champ titre="Catégorie *" valeur={categorie} changer={champ(setCategorie)} desactive={enCours} maxLength={80} />
                  <Champ titre={`Prix de vente (${boutique.devise}) *`} valeur={prixVente} changer={champ(setPrixVente)} numerique desactive={enCours} />
                  <Champ titre={`Prix d’achat (${boutique.devise})`} valeur={prixAchat} changer={champ(setPrixAchat)} numerique desactive={enCours} />
                  <Champ titre="Code-barres du modèle" valeur={codeBarre} changer={champ(setCodeBarre)} desactive={enCours} maxLength={100} />
                  <Champ titre="Seuil d’alerte" valeur={seuil} changer={champ(setSeuil)} numerique desactive={enCours} />
                </View> : <Text style={s.sousTitre}>{nom}</Text>}
                {avecMatrice ? <View style={s.carte}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: unique, disabled: enCours }}
                    disabled={enCours} style={s.choix} onPress={() => {
                      modifie.current = true; setUnique(!unique); setSelection([]);
                    }}><Text style={s.choixTexte}>{unique ? '☑' : '☐'} Article sans taille ni couleur</Text></Pressable>
                  {!unique ? <SelecteurMatrice references={references} selection={selection}
                    surSelection={changerSelection} desactive={enCours} /> : <Text style={s.aide}>Une déclinaison unique sera créée.</Text>}
                  {!unique && !references.length ? <Action titre="Synchroniser le référentiel"
                    surPression={() => void synchroniserReferences()} secondaire desactive={enCours} /> : null}
                  <Text style={s.aide}>Les nouvelles variantes démarrent sans stock. Les quantités se renseignent dans les approvisionnements ou les inventaires.</Text>
                </View> : <Text style={s.aide}>Les variantes, leurs stocks et leurs prix spécifiques sont conservés.</Text>}
              </>}
            </ScrollView>}
          <View style={s.pied}>
            <Action titre="Annuler" surPression={fermer} secondaire desactive={enCours} />
            <Action titre={enCours ? 'En cours…' : 'Enregistrer'} surPression={() => void enregistrer()}
              desactive={phase !== 'pret' || enCours} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
function Champ({ titre, valeur, changer, numerique = false, desactive, maxLength }: {
  titre: string; valeur: string; changer: (v: string) => void; numerique?: boolean; desactive: boolean; maxLength?: number;
}) {
  return <View style={s.champ}><Text style={s.label}>{titre}</Text><TextInput accessibilityLabel={titre}
    value={valeur} onChangeText={changer} editable={!desactive} maxLength={maxLength}
    keyboardType={numerique ? 'decimal-pad' : 'default'} style={s.saisie} /></View>;
}
function Action({ titre, surPression, secondaire = false, desactive = false }: {
  titre: string; surPression: () => void; secondaire?: boolean; desactive?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: desactive }} disabled={desactive}
    onPress={surPression} style={[s.bouton, secondaire && s.secondaire, desactive && s.desactive]}>
    <Text style={[s.boutonTexte, secondaire && s.secondaireTexte]}>{titre}</Text>
  </Pressable>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: H.fond }, entete: { paddingHorizontal: 16, minHeight: 64,
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: H.surface,
    borderBottomWidth: 1, borderBottomColor: H.bordure },
  titre: { flex: 1, color: H.texte, fontSize: 21, fontWeight: '800' }, icone: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  contenu: { padding: 16, gap: 16, paddingBottom: 28 }, carte: { padding: 16, gap: 14, backgroundColor: H.surface,
    borderWidth: 1, borderColor: H.bordure, borderRadius: 16 }, sousTitre: { color: H.texte, fontSize: 18, fontWeight: '800' },
  aide: { fontSize: 13, lineHeight: 20, color: H.texteFaible }, erreur: { color: H.danger, backgroundColor: H.dangerFond,
    borderRadius: 12, padding: 14, fontSize: 14, lineHeight: 22 }, champ: { gap: 6 }, label: { color: H.texte, fontSize: 14, fontWeight: '700' },
  saisie: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: H.bordure, backgroundColor: H.surface,
    paddingHorizontal: 12, color: H.texte, fontSize: 16 }, rangee: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choix: { minHeight: 48, justifyContent: 'center' }, choixTexte: { color: H.texte, fontSize: 15, fontWeight: '600' },
  pied: { padding: 16, gap: 10, flexDirection: 'row', backgroundColor: H.surface, borderTopWidth: 1, borderTopColor: H.bordure },
  bouton: { flexGrow: 1, minHeight: 50, justifyContent: 'center', alignItems: 'center', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: H.primaire }, secondaire: { backgroundColor: H.primaireClair },
  boutonTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }, secondaireTexte: { color: H.primaireFonce },
  desactive: { opacity: 0.5 }, centre: { flex: 1, gap: 12, alignItems: 'center', justifyContent: 'center' },
});
