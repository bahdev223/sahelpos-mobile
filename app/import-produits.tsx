/**
 * Import de produits depuis un fichier CSV.
 *
 * Pourquoi le CSV et pas l'Excel : lire un .xlsx demande une bibliotheque
 * lourde pour un telephone, alors que le CSV se lit en quelques lignes et que
 * tous les tableurs savent l'exporter.
 *
 * L'import est PRUDENT : il analyse d'abord et montre ce qu'il a compris, avec
 * les lignes refusees et leur raison. Rien n'est ecrit avant confirmation —
 * ecraser un catalogue par un fichier mal forme serait irrattrapable.
 */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import {
  Bouton,
  Carte,
  couleurs,
  espaces,
  formaterMontant,
  rayons,
} from '../src/ui/components';
import { creerProduit, trouverParCodeBarre } from '../src/db/repositories/produit';

interface LigneLue {
  nom: string;
  categorie: string;
  codeBarre: string;
  prixVente: number;
  prixAchat: number;
  uniteBase: string;
  stock: number;
}

interface LigneRefusee {
  numero: number;
  contenu: string;
  raison: string;
}

interface Analyse {
  fichier: string;
  valides: LigneLue[];
  refusees: LigneRefusee[];
  colonnes: string[];
}

/** Decoupe une ligne CSV en tenant compte des guillemets. */
function decouper(ligne: string, separateur: string): string[] {
  const champs: string[] = [];
  let courant = '';
  let dansGuillemets = false;

  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      // Deux guillemets consecutifs a l'interieur = un guillemet litteral.
      if (dansGuillemets && ligne[i + 1] === '"') {
        courant += '"';
        i++;
      } else {
        dansGuillemets = !dansGuillemets;
      }
    } else if (c === separateur && !dansGuillemets) {
      champs.push(courant);
      courant = '';
    } else {
      courant += c;
    }
  }
  champs.push(courant);
  return champs.map((c) => c.trim());
}

/**
 * Les tableurs francophones exportent en point-virgule, les anglophones en
 * virgule. On choisit le separateur le plus present sur la ligne d'en-tete.
 */
function detecterSeparateur(entete: string): string {
  const pv = (entete.match(/;/g) ?? []).length;
  const v = (entete.match(/,/g) ?? []).length;
  return pv >= v ? ';' : ',';
}

function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .trim();
}

/**
 * Trouve la colonne correspondant a un champ.
 *
 * On tente d'abord une correspondance EXACTE, puis seulement une partielle du
 * libelle le plus long au plus court. Sans cela "prix" trouverait "prix achat"
 * avant "prix vente" et les deux prix seraient inverses — le commercant
 * vendrait a son prix d'achat sans s'en apercevoir.
 */
function trouverColonne(entetes: string[], candidats: string[]): number {
  const propres = entetes.map(normaliser);
  const cherches = candidats.map(normaliser);

  for (const c of cherches) {
    const i = propres.indexOf(c);
    if (i >= 0) return i;
  }
  for (const c of [...cherches].sort((a, b) => b.length - a.length)) {
    const i = propres.findIndex((e) => e.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

function nombre(valeur: string): number {
  const propre = valeur.replace(/\s/g, '').replace(',', '.');
  const n = Number(propre);
  return Number.isFinite(n) ? n : 0;
}

export default function EcranImportProduits() {
  const router = useRouter();
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [lecture, setLecture] = useState(false);
  const [importation, setImportation] = useState(false);

  const choisirFichier = useCallback(async () => {
    setLecture(true);
    try {
      const choix = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (choix.canceled || !choix.assets?.[0]) return;

      const fichier = choix.assets[0];
      const contenu = await FileSystem.readAsStringAsync(fichier.uri);
      const lignes = contenu
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0);

      if (lignes.length < 2) {
        Alert.alert(
          'Fichier vide',
          'Le fichier doit contenir une ligne d en-tete puis au moins un produit.',
        );
        return;
      }

      const separateur = detecterSeparateur(lignes[0]);
      const entetes = decouper(lignes[0], separateur);

      const iNom = trouverColonne(entetes, ['nom', 'produit', 'designation', 'article']);
      if (iNom < 0) {
        Alert.alert(
          'Colonne du nom introuvable',
          `Le fichier doit avoir une colonne "nom" ou "produit".\n\nColonnes lues : ${entetes.join(', ')}`,
        );
        return;
      }

      const iVente = trouverColonne(entetes, ['prix vente', 'prix de vente', 'vente', 'prix']);
      const iAchat = trouverColonne(entetes, ['prix achat', 'prix d achat', 'achat']);
      const iCategorie = trouverColonne(entetes, ['categorie', 'famille', 'rayon']);
      const iCode = trouverColonne(entetes, ['code barre', 'code barres', 'codebarre', 'reference']);
      const iUnite = trouverColonne(entetes, ['unite', 'unite base', 'mesure']);
      const iStock = trouverColonne(entetes, ['stock', 'quantite']);

      const valides: LigneLue[] = [];
      const refusees: LigneRefusee[] = [];

      for (let i = 1; i < lignes.length; i++) {
        const champs = decouper(lignes[i], separateur);
        const nom = (champs[iNom] ?? '').trim();
        if (!nom) {
          refusees.push({
            numero: i + 1,
            contenu: lignes[i].slice(0, 60),
            raison: 'nom vide',
          });
          continue;
        }
        const prixVente = iVente >= 0 ? nombre(champs[iVente] ?? '') : 0;
        const prixAchat = iAchat >= 0 ? nombre(champs[iAchat] ?? '') : 0;

        if (prixVente > 0 && prixAchat > 0 && prixVente < prixAchat) {
          refusees.push({
            numero: i + 1,
            contenu: nom,
            raison: `vente ${prixVente} < achat ${prixAchat}`,
          });
          continue;
        }

        valides.push({
          nom,
          categorie: iCategorie >= 0 ? (champs[iCategorie] ?? '').trim() : '',
          codeBarre: iCode >= 0 ? (champs[iCode] ?? '').trim() : '',
          prixVente,
          prixAchat,
          uniteBase: (iUnite >= 0 ? (champs[iUnite] ?? '').trim() : '') || 'Unite',
          stock: iStock >= 0 ? nombre(champs[iStock] ?? '') : 0,
        });
      }

      setAnalyse({
        fichier: fichier.name,
        valides,
        refusees,
        colonnes: entetes,
      });
    } catch (e) {
      Alert.alert('Lecture impossible', e instanceof Error ? e.message : 'Erreur inconnue.');
    } finally {
      setLecture(false);
    }
  }, []);

  const importer = useCallback(async () => {
    if (!analyse) return;
    setImportation(true);
    let crees = 0;
    let ignores = 0;
    try {
      for (const l of analyse.valides) {
        // Un code-barres deja present signale un produit deja au catalogue :
        // on ne le duplique pas et on ne l'ecrase pas non plus.
        if (l.codeBarre) {
          const existe = await trouverParCodeBarre(l.codeBarre);
          if (existe) {
            ignores++;
            continue;
          }
        }
        await creerProduit({
          nom: l.nom,
          categorie: l.categorie || null,
          codeBarre: l.codeBarre || null,
          prixUnitaire: l.prixVente,
          prixAchat: l.prixAchat,
          uniteBase: l.uniteBase,
          quantiteBase: l.stock,
        });
        crees++;
      }
      Alert.alert(
        'Import termine',
        `${crees} produit(s) ajoute(s).` +
          (ignores > 0 ? `\n${ignores} deja present(s), non modifie(s).` : ''),
        [{ text: 'Voir le catalogue', onPress: () => router.replace('/catalogue') }],
      );
      setAnalyse(null);
    } catch (e) {
      Alert.alert(
        'Import interrompu',
        `${crees} produit(s) ont ete ajoutes avant l erreur.\n\n` +
          (e instanceof Error ? e.message : 'Erreur inconnue.'),
      );
    } finally {
      setImportation(false);
    }
  }, [analyse, router]);

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Importer des produits' }} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <Carte titre="Format attendu">
          <Text style={styles.aide}>
            Un fichier CSV avec une ligne d en-tete. Seule la colonne du nom est
            obligatoire. Le separateur point-virgule ou virgule est reconnu
            automatiquement.
          </Text>
          <View style={styles.exemple}>
            <Text style={styles.exempleTexte}>nom;categorie;prix_achat;prix_vente;stock</Text>
            <Text style={styles.exempleTexte}>Ciment 50kg;Materiaux;6000;7500;40</Text>
            <Text style={styles.exempleTexte}>Ampoule LED;Electricite;175;500;120</Text>
          </View>
        </Carte>

        <Bouton
          titre="Choisir un fichier"
          onPress={() => void choisirFichier()}
          enCours={lecture}
          grand
        />

        {analyse ? (
          <>
            <Carte titre={analyse.fichier}>
              <Text style={styles.colonnes}>
                Colonnes lues : {analyse.colonnes.join(', ')}
              </Text>
              <View style={styles.compteurs}>
                <View style={styles.compteur}>
                  <Text style={styles.compteurValeur}>{analyse.valides.length}</Text>
                  <Text style={styles.compteurLibelle}>a importer</Text>
                </View>
                <View style={styles.compteur}>
                  <Text
                    style={[
                      styles.compteurValeur,
                      analyse.refusees.length > 0 && styles.compteurAlerte,
                    ]}
                  >
                    {analyse.refusees.length}
                  </Text>
                  <Text style={styles.compteurLibelle}>refusees</Text>
                </View>
              </View>
            </Carte>

            {analyse.valides.length > 0 ? (
              <Carte titre="Apercu">
                {analyse.valides.slice(0, 8).map((l, i) => (
                  <View key={i} style={styles.apercuLigne}>
                    <View style={styles.apercuGauche}>
                      <Text style={styles.apercuNom}>{l.nom}</Text>
                      <Text style={styles.apercuDetail}>
                        {l.categorie || 'sans categorie'} · {l.uniteBase}
                      </Text>
                    </View>
                    <View style={styles.apercuDroite}>
                      <Text style={styles.apercuVente}>{formaterMontant(l.prixVente)}</Text>
                      <Text style={styles.apercuAchat}>
                        achat {formaterMontant(l.prixAchat)}
                      </Text>
                    </View>
                  </View>
                ))}
                {analyse.valides.length > 8 ? (
                  <Text style={styles.reste}>
                    et {analyse.valides.length - 8} autre(s)
                  </Text>
                ) : null}
              </Carte>
            ) : null}

            {analyse.refusees.length > 0 ? (
              <Carte titre="Lignes refusees">
                {analyse.refusees.slice(0, 10).map((r) => (
                  <View key={r.numero} style={styles.refusee}>
                    <Text style={styles.refuseeLigne}>Ligne {r.numero}</Text>
                    <Text style={styles.refuseeContenu} numberOfLines={1}>
                      {r.contenu}
                    </Text>
                    <Text style={styles.refuseeRaison}>{r.raison}</Text>
                  </View>
                ))}
              </Carte>
            ) : null}

            <Bouton
              titre={`Importer ${analyse.valides.length} produit(s)`}
              onPress={() => void importer()}
              enCours={importation}
              desactive={analyse.valides.length === 0}
              grand
            />
            <Bouton
              titre="Annuler"
              onPress={() => setAnalyse(null)}
              variante="secondaire"
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.l, paddingBottom: espaces.xxl, gap: espaces.m },

  aide: { fontSize: 13, color: couleurs.texteFaible, lineHeight: 18 },
  exemple: {
    marginTop: espaces.m,
    padding: espaces.m,
    backgroundColor: couleurs.surfaceDouce,
    borderRadius: rayons.s,
  },
  exempleTexte: { fontFamily: 'monospace', fontSize: 11, color: couleurs.texte },

  colonnes: { fontSize: 12, color: couleurs.texteFaible, marginBottom: espaces.m },
  compteurs: { flexDirection: 'row', gap: espaces.xl },
  compteur: { alignItems: 'center' },
  compteurValeur: { fontSize: 24, fontWeight: '700', color: couleurs.primaire },
  compteurAlerte: { color: couleurs.avertissement },
  compteurLibelle: { fontSize: 12, color: couleurs.texteFaible },

  apercuLigne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: espaces.s,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  apercuGauche: { flex: 1, marginRight: espaces.s },
  apercuDroite: { alignItems: 'flex-end' },
  apercuNom: { fontSize: 14, color: couleurs.texte },
  apercuDetail: { fontSize: 11, color: couleurs.texteFaible, marginTop: 2 },
  apercuVente: { fontSize: 14, fontWeight: '600', color: couleurs.texte },
  apercuAchat: { fontSize: 11, color: couleurs.texteFaible, marginTop: 2 },
  reste: { fontSize: 12, color: couleurs.texteFaible, paddingTop: espaces.s },

  refusee: { paddingVertical: espaces.s, borderBottomWidth: 1, borderBottomColor: couleurs.bordure },
  refuseeLigne: { fontSize: 12, fontWeight: '700', color: couleurs.texte },
  refuseeContenu: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  refuseeRaison: { fontSize: 12, color: couleurs.avertissement, marginTop: 2 },
});
