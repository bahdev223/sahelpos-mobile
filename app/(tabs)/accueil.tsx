/**
 * Accueil : ce que le commercant veut savoir en ouvrant l'application.
 *
 * POURQUOI CET ECRAN EXISTE
 * -------------------------
 * La caisse etait le premier ecran, et elle ne repond a aucune des questions
 * qu'on se pose en arrivant le matin : combien j'ai vendu hier, qu'est-ce qui
 * manque au rayon, ou en est ma caisse. On ouvrait donc quatre ecrans pour
 * reconstituer une image que quatre chiffres suffisent a donner.
 *
 * POURQUOI DES CHIFFRES DU JOUR ET NON DU MOIS
 * --------------------------------------------
 * Le commercant decide a la journee : ce qu'il commande ce soir depend de ce
 * qui est parti aujourd'hui. Le mois est dans le tableau de bord, ouvert une
 * fois par semaine.
 */
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useSession } from '../_layout';
import {
  BandeauEtat,
  Chargement,
  Vignette,
  couleurs,
  espaces,
  formaterMontant,
  formaterQuantite,
  rayons,
} from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import type { NomIcone } from '../../src/ui/icones';
import { BoutonMenu } from '../../src/ui/tiroir';
import { listerAlertesStock } from '../../src/db/repositories/produit';
import { listerVentes, totauxPeriode } from '../../src/db/repositories/vente';
import type { VenteResume } from '../../src/db/repositories/vente';
import { seuilAlerteStock } from '../../src/domain/stock';
import type { Produit } from '../../src/domain/types';
import { compterNonLues } from '../../src/services/notifications';

function bornesJour(): { debut: string; fin: string } {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  return { debut: debut.toISOString(), fin: fin.toISOString() };
}

function salutation(): string {
  const heure = new Date().getHours();
  if (heure < 12) return 'Bonjour';
  if (heure < 18) return 'Bon apres-midi';
  return 'Bonsoir';
}

function heureCourte(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

interface Donnees {
  chiffreAffaires: number;
  nbVentes: number;
  benefice: number;
  resteDu: number;
  alertes: Produit[];
  dernieres: VenteResume[];
}

type Etat =
  | { phase: 'chargement' }
  | { phase: 'pret'; donnees: Donnees };

export default function EcranAccueil() {
  const router = useRouter();
  const { utilisateur, boutique } = useSession();
  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' });
  const [rafraichit, setRafraichit] = useState(false);
  // La cloche porte « ce que je n'ai pas encore vu », et non « ce qui va mal
  // en ce moment » : les deux different des qu'une alerte a ete lue.
  const [nonLues, setNonLues] = useState(0);

  const charger = useCallback(async () => {
    const jour = bornesJour();
    const [totaux, alertes, dernieres] = await Promise.all([
      totauxPeriode(jour.debut, jour.fin),
      listerAlertesStock(),
      listerVentes({ limite: 5 }),
    ]);
    setEtat({
      phase: 'pret',
      donnees: {
        chiffreAffaires: totaux.chiffreAffaires,
        nbVentes: totaux.nbVentes,
        benefice: totaux.benefice,
        resteDu: totaux.resteDu,
        alertes,
        dernieres,
      },
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      void (async () => {
        try {
          await charger();
          // Le compteur est relu a chaque retour sur l'accueil : le
          // commercant vient peut-etre de lire ses notifications.
          if (vivant) setNonLues(await compterNonLues());
        } catch {
          // L'accueil ne doit jamais bloquer l'acces a la caisse : en cas
          // d'echec de lecture on affiche des zeros plutot qu'un ecran rouge.
          if (vivant) {
            setEtat({
              phase: 'pret',
              donnees: {
                chiffreAffaires: 0,
                nbVentes: 0,
                benefice: 0,
                resteDu: 0,
                alertes: [],
                dernieres: [],
              },
            });
          }
        }
      })();
      return () => {
        vivant = false;
      };
    }, [charger]),
  );

  const surRafraichir = useCallback(async () => {
    setRafraichit(true);
    try {
      await charger();
    } catch {
      // Silencieux : le tirage vers le bas est un geste d'impatience, pas une
      // operation dont il faut rendre compte.
    } finally {
      setRafraichit(false);
    }
  }, [charger]);

  if (etat.phase === 'chargement') {
    return (
      <View style={s.plein}>
        <BandeauEtat />
        <Chargement message="Lecture de la journee..." />
      </View>
    );
  }

  const d = etat.donnees;

  return (
    <View style={s.plein}>
      <BandeauEtat />
      <View style={s.entete}>
        <BoutonMenu />
        <Text style={s.enteteTitre} numberOfLines={1}>
          {boutique.nom}
        </Text>
        <Pressable
          onPress={() => router.push('/notifications')}
          hitSlop={10}
          style={s.cloche}
          accessibilityLabel="Notifications"
        >
          <Icone nom="cloche" taille={22} couleur={couleurs.texte} />
          {nonLues > 0 ? (
            <View style={s.pointCloche}>
              <Text style={s.pointClocheTexte}>{nonLues > 9 ? '9+' : nonLues}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={s.contenu}
        refreshControl={
          <RefreshControl refreshing={rafraichit} onRefresh={surRafraichir} tintColor={couleurs.primaire} />
        }
      >
        <Text style={s.salut}>
          {salutation()} {utilisateur?.nom ?? ''}
        </Text>
        <Text style={s.sousSalut}>Voici ce qui se passe aujourd hui</Text>

        <View style={s.tuiles}>
          <Tuile
            icone="argent"
            libelle="Ventes du jour"
            valeur={formaterMontant(d.chiffreAffaires, boutique.devise)}
            teinte={couleurs.primaire}
            fond={couleurs.primaireDouce}
          />
          <Tuile
            icone="ventes"
            libelle="Nombre de ventes"
            valeur={String(d.nbVentes)}
            teinte={couleurs.succesFonce}
            fond={couleurs.succesDouce}
          />
          <Tuile
            icone="alerte"
            libelle="Stock faible"
            valeur={String(d.alertes.length)}
            teinte={couleurs.avertissementFonce}
            fond={couleurs.avertissementDouce}
            onPress={() => router.push('/stock/alertes')}
          />
          <Tuile
            icone="graphique"
            libelle="Benefice du jour"
            valeur={formaterMontant(d.benefice, boutique.devise)}
            teinte={couleurs.accentFonce}
            fond={couleurs.accentDouce}
            onPress={() => router.push('/tableau-de-bord')}
          />
        </View>

        {d.resteDu > 0 ? (
          <Pressable style={s.credit} onPress={() => router.push('/clients')}>
            <Icone nom="clients" taille={20} couleur={couleurs.avertissementFonce} />
            <Text style={s.creditTexte}>
              {formaterMontant(d.resteDu, boutique.devise)} en attente chez les clients
            </Text>
            <Icone nom="chevron" taille={16} couleur={couleurs.avertissementFonce} />
          </Pressable>
        ) : null}

        <Pressable
          style={({ pressed }) => [s.bouton, pressed && s.boutonPresse]}
          onPress={() => router.push('/caisse')}
        >
          <Icone nom="plus" taille={22} couleur={couleurs.texteInverse} />
          <Text style={s.boutonTexte}>Nouvelle vente</Text>
        </Pressable>

        {/*
          Acces PERMANENT au repertoire.

          Le lien vers les clients n'existait qu'au-dessus, et seulement quand
          une ardoise etait impayee : une boutique dont tout le monde a paye
          n'avait plus aucun chemin vers ses fiches depuis l'accueil. Il
          restait le tiroir, mais un ecran qu'il faut deviner est un ecran qui
          n'existe pas.
        */}
        <View style={s.repertoire}>
          <Pressable
            style={({ pressed }) => [s.raccourci, pressed && s.raccourciPresse]}
            onPress={() => router.push('/clients')}
          >
            <Icone nom="clients" taille={22} couleur={couleurs.primaire} />
            <Text style={s.raccourciTitre}>Clients</Text>
            <Text style={s.raccourciDetail}>Fiches et ardoises</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.raccourci, pressed && s.raccourciPresse]}
            onPress={() => router.push('/fournisseurs')}
          >
            <Icone nom="fournisseurs" taille={22} couleur={couleurs.primaire} />
            <Text style={s.raccourciTitre}>Fournisseurs</Text>
            <Text style={s.raccourciDetail}>Fiches et dettes</Text>
          </Pressable>
        </View>

        <View style={s.sectionEntete}>
          <Text style={s.sectionTitre}>Dernieres ventes</Text>
          <Pressable onPress={() => router.push('/ventes')} hitSlop={8}>
            <Text style={s.lienVoirTout}>Voir tout</Text>
          </Pressable>
        </View>

        {d.dernieres.length === 0 ? (
          <View style={s.vide}>
            <Icone nom="ventes" taille={28} couleur={couleurs.texteEteint} />
            <Text style={s.videTexte}>Aucune vente pour le moment.</Text>
          </View>
        ) : (
          <View style={s.bloc}>
            {d.dernieres.map((vente, index) => (
              <Pressable
                key={vente.id}
                onPress={() =>
                  router.push({ pathname: '/vente/[id]', params: { id: String(vente.id) } })
                }
                style={({ pressed }) => [
                  s.ligne,
                  index > 0 && s.ligneSuivante,
                  pressed && s.lignePressee,
                ]}
              >
                <Icone nom="ventes" taille={20} couleur={couleurs.texteFaible} />
                <View style={s.ligneTextes}>
                  <Text style={s.ligneTitre}>Vente {vente.numero}</Text>
                  <Text style={s.ligneSous}>
                    {heureCourte(vente.dateVente)}
                    {vente.clientNom ? ` — ${vente.clientNom}` : ''}
                  </Text>
                </View>
                <View style={s.ligneDroite}>
                  <Text style={s.ligneMontant}>
                    {formaterMontant(vente.total, boutique.devise)}
                  </Text>
                  <Text
                    style={[
                      s.ligneStatut,
                      {
                        color:
                          vente.statut === 'payee'
                            ? couleurs.succesFonce
                            : couleurs.avertissementFonce,
                      },
                    ]}
                  >
                    {vente.statut === 'payee' ? 'Payee' : 'A solder'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {d.alertes.length > 0 ? (
          <>
            <View style={s.sectionEntete}>
              <Text style={s.sectionTitre}>A reapprovisionner</Text>
              <Pressable onPress={() => router.push('/stock/alertes')} hitSlop={8}>
                <Text style={s.lienVoirTout}>Voir tout</Text>
              </Pressable>
            </View>
            <View style={s.bloc}>
              {d.alertes.slice(0, 4).map((produit, index) => (
                <Pressable
                  key={produit.id}
                  onPress={() =>
                    router.push({ pathname: '/produit/[id]', params: { id: String(produit.id) } })
                  }
                  style={({ pressed }) => [
                    s.ligne,
                    index > 0 && s.ligneSuivante,
                    pressed && s.lignePressee,
                  ]}
                >
                  <Vignette chemin={produit.cheminImage} nom={produit.nom} taille={38} />
                  <View style={s.ligneTextes}>
                    <Text style={s.ligneTitre} numberOfLines={1}>
                      {produit.nom}
                    </Text>
                    <Text style={s.ligneSous}>
                      Seuil {formaterQuantite(seuilAlerteStock(produit.stockMin))}{' '}
                      {produit.uniteBase}
                    </Text>
                  </View>
                  <Text style={s.ligneRupture}>
                    {formaterQuantite(produit.quantiteBase)} {produit.uniteBase}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Tuile({
  icone,
  libelle,
  valeur,
  teinte,
  fond,
  onPress,
}: {
  icone: NomIcone;
  libelle: string;
  valeur: string;
  teinte: string;
  fond: string;
  onPress?: () => void;
}) {
  const contenu = (
    <>
      <View style={[s.tuileIcone, { backgroundColor: fond }]}>
        <Icone nom={icone} taille={18} couleur={teinte} />
      </View>
      <Text style={s.tuileLibelle}>{libelle}</Text>
      <Text style={[s.tuileValeur, { color: teinte }]} numberOfLines={1} adjustsFontSizeToFit>
        {valeur}
      </Text>
    </>
  );
  if (!onPress) return <View style={s.tuile}>{contenu}</View>;
  return (
    <Pressable style={({ pressed }) => [s.tuile, pressed && s.tuilePressee]} onPress={onPress}>
      {contenu}
    </Pressable>
  );
}

const s = StyleSheet.create({
  plein: { flex: 1, backgroundColor: couleurs.fond },

  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.m,
    backgroundColor: couleurs.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: couleurs.bordure,
  },
  enteteTitre: { flex: 1, fontSize: 18, fontWeight: '700', color: couleurs.texte },
  cloche: { padding: 4 },
  pointCloche: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.danger,
  },
  pointClocheTexte: { fontSize: 10, fontWeight: '700', color: couleurs.texteInverse },

  contenu: { padding: espaces.l, paddingBottom: espaces.xxl },
  salut: { fontSize: 22, fontWeight: '700', color: couleurs.texte },
  sousSalut: { fontSize: 13, color: couleurs.texteFaible, marginTop: 2 },

  tuiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaces.m,
    marginTop: espaces.l,
  },
  tuile: {
    // Deux par ligne : au-dela le montant se tronque sur un ecran de 720 points.
    width: '47.5%',
    flexGrow: 1,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espaces.m,
  },
  tuilePressee: { backgroundColor: couleurs.fond },
  tuileIcone: {
    width: 32,
    height: 32,
    borderRadius: rayons.s,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaces.s,
  },
  tuileLibelle: { fontSize: 12, color: couleurs.texteFaible },
  tuileValeur: { fontSize: 20, fontWeight: '700', marginTop: 2 },

  credit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    marginTop: espaces.m,
    padding: espaces.m,
    borderRadius: rayons.m,
    backgroundColor: couleurs.avertissementDouce,
    borderWidth: 1,
    borderColor: couleurs.avertissementBordure,
  },
  creditTexte: { flex: 1, fontSize: 13, color: couleurs.avertissementFonce, fontWeight: '600' },

  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.s,
    minHeight: 54,
    borderRadius: rayons.m,
    backgroundColor: couleurs.primaire,
    marginTop: espaces.l,
  },
  boutonPresse: { backgroundColor: couleurs.primaireFonce },
  boutonTexte: { fontSize: 16, fontWeight: '700', color: couleurs.texteInverse },

  repertoire: {
    flexDirection: 'row',
    gap: espaces.m,
    marginTop: espaces.m,
  },
  raccourci: {
    flex: 1,
    gap: 2,
    // Meme hauteur de cible que les tuiles du haut : on appuie debout, souvent
    // d'une seule main, parfois sans regarder.
    minHeight: 88,
    justifyContent: 'center',
    padding: espaces.m,
    borderRadius: rayons.m,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  raccourciPresse: { backgroundColor: couleurs.primaireDouce },
  raccourciTitre: { fontSize: 15, fontWeight: '700', color: couleurs.texte },
  raccourciDetail: { fontSize: 12, color: couleurs.texteFaible },

  sectionEntete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: espaces.xl,
    marginBottom: espaces.s,
  },
  sectionTitre: { fontSize: 15, fontWeight: '700', color: couleurs.texte },
  lienVoirTout: { fontSize: 13, fontWeight: '600', color: couleurs.primaire },

  bloc: {
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    overflow: 'hidden',
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    minHeight: 62,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
  },
  ligneSuivante: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.bordure },
  lignePressee: { backgroundColor: couleurs.fond },
  ligneTextes: { flex: 1 },
  ligneTitre: { fontSize: 15, fontWeight: '600', color: couleurs.texte },
  ligneSous: { fontSize: 12, color: couleurs.texteFaible, marginTop: 1 },
  ligneDroite: { alignItems: 'flex-end' },
  ligneMontant: { fontSize: 15, fontWeight: '700', color: couleurs.texte },
  ligneStatut: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  ligneRupture: { fontSize: 14, fontWeight: '700', color: couleurs.danger },

  vide: {
    alignItems: 'center',
    gap: espaces.s,
    padding: espaces.xl,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  videTexte: { fontSize: 13, color: couleurs.texteFaible },
});
